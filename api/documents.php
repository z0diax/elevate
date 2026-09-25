<?php
declare(strict_types=1);

/**
 * Documents and attachment upload API.
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';
require_once __DIR__ . '/config/document_storage.php';

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const DOCUMENT_MIME_TYPES = [
    'pdf' => 'application/pdf',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
];

function has_docx_structure(string $path): bool {
    if (class_exists(ZipArchive::class)) {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) return false;
        try {
            $types = $zip->statName('[Content_Types].xml');
            $document = $zip->statName('word/document.xml');
            if (!$types || !$document || $types['size'] > 1048576 || $document['size'] <= 0) return false;
            $contentTypes = $zip->getFromName('[Content_Types].xml');
        } finally {
            $zip->close();
        }
    } elseif (class_exists(PharData::class)) {
        // PharData can inspect ZIP archives on PHP installations without ext-zip.
        try {
            $archive = new PharData($path);
            if (!$archive->isFileFormat(Phar::ZIP)
                || !isset($archive['[Content_Types].xml'], $archive['word/document.xml'])
                || $archive['[Content_Types].xml']->getSize() > 1048576
                || $archive['word/document.xml']->getSize() <= 0) return false;
            $contentTypes = $archive['[Content_Types].xml']->getContent();
        } catch (Throwable $e) {
            return false;
        }
    } else {
        return false;
    }
    return is_string($contentTypes)
        && str_contains($contentTypes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
}

function validate_document_upload(array $file): array {
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error !== UPLOAD_ERR_OK) {
        if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            sendResponse(413, [], 'File is too large. Maximum file size is 10 MB.');
        }
        sendResponse(400, [], $error === UPLOAD_ERR_NO_FILE ? 'Please select a file.' : 'The upload failed or was incomplete.');
    }
    $path = $file['tmp_name'] ?? null;
    if (!is_string($path) || !is_uploaded_file($path)) sendResponse(400, [], 'Invalid uploaded file.');
    $size = filesize($path);
    if ($size === false || $size <= 0) sendResponse(400, [], 'The selected attachment is empty or invalid.');
    if ($size > MAX_DOCUMENT_SIZE) sendResponse(413, [], 'File is too large. Maximum file size is 10 MB.');

    $name = $file['name'] ?? null;
    if (!is_string($name)) sendResponse(400, [], 'Unsupported file type.');
    $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!isset(DOCUMENT_MIME_TYPES[$extension])) {
        sendResponse(400, [], 'Unsupported file type. Please upload a PDF, DOCX, JPG, JPEG, or PNG file.');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    if ($extension === 'docx' && in_array($mime, ['application/zip', 'application/x-zip-compressed', DOCUMENT_MIME_TYPES['docx']], true)) {
        // Fileinfo often identifies Office Open XML as ZIP; verify Word members.
        if (!has_docx_structure($path)) sendResponse(400, [], 'Invalid DOCX document.');
        $mime = DOCUMENT_MIME_TYPES['docx'];
    }
    if ($mime !== DOCUMENT_MIME_TYPES[$extension]) {
        sendResponse(400, [], 'File contents do not match the selected file type.');
    }
    if ($extension === 'pdf') {
        $handle = fopen($path, 'rb');
        $signature = $handle ? fread($handle, 5) : false;
        if ($handle) fclose($handle);
        if ($signature !== '%PDF-') sendResponse(400, [], 'Invalid PDF document.');
    } elseif (in_array($extension, ['jpg', 'jpeg', 'png'], true)) {
        $image = @getimagesize($path);
        if ($image === false || $image[2] !== ($extension === 'png' ? IMAGETYPE_PNG : IMAGETYPE_JPEG)) {
            sendResponse(400, [], 'Invalid image file.');
        }
    }
    return [$extension, $mime, $size];
}

function delete_replaced_upload(string $reference): void {
    $path = document_storage_path($reference);
    if ($path !== null && !unlink($path)) error_log('[documents.php] Unable to remove replaced upload.');
}

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && ($_GET['action'] ?? '') === 'download') {
    $actor = require_auth($db);
    $id = $_GET['id'] ?? null;
    if (!is_string($id) || $id === '' || strlen($id) > 64) sendResponse(404, [], 'Document not found.');
    $stmt = $db->prepare('SELECT id, application_id, document_name, file_url, file_type FROM application_documents WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $document = $stmt->fetch();
    if (!$document) sendResponse(404, [], 'Document not found.');
    require_application_access($db, $actor, (string)$document['application_id']);
    $path = document_storage_path((string)$document['file_url']);
    if ($path === null) {
        error_log('[documents.php:download] Missing or invalid storage for document ID ' . $id);
        sendResponse(404, [], 'Document file not found.');
    }
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $mime = DOCUMENT_MIME_TYPES[$extension] ?? null;
    if ($mime === null || $mime !== $document['file_type']) sendResponse(404, [], 'Document file not found.');
    $size = filesize($path);
    if ($size === false) sendResponse(404, [], 'Document file not found.');
    $name = preg_replace('/[^A-Za-z0-9._() -]+/', '_', (string)$document['document_name']);
    $name = trim((string)$name, " ._");
    if ($name === '') $name = 'document';
    if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== $extension) $name .= '.' . $extension;
    $name = substr($name, 0, 175 - strlen($extension));
    if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== $extension) $name .= '.' . $extension;
    $preview = ($_GET['preview'] ?? '') === '1' && in_array($mime, ['application/pdf', 'image/jpeg', 'image/png'], true);
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . $size);
    header('Content-Disposition: ' . ($preview ? 'inline' : 'attachment') . '; filename="' . $name . '"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    header('Pragma: no-cache');
    readfile($path);
    exit();
}

if ($method === 'POST') {
    $actor = require_auth($db);

    if (!isset($_FILES['file'])) {
        // The UI only uploads files. Oversized multipart bodies can also arrive empty.
        if (!empty($_SERVER['CONTENT_LENGTH']) && empty($_POST) && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data')) {
            sendResponse(413, [], 'Upload exceeds the server request limit.');
        }
        sendResponse(400, [], 'A file is required.');
    }

    $file = $_FILES['file'];
    if (!is_array($file) || is_array($file['name'] ?? null)) sendResponse(400, [], 'Upload one file at a time.');
    [$extension, $detectedMime, $fileSize] = validate_document_upload($file);
    $applicationId = $_POST['application_id'] ?? '';
    $documentId = $_POST['document_id'] ?? '';
    $requirementId = $_POST['requirement_id'] ?? null;
    $documentName = $_POST['document_name'] ?? $file['name'];

    if (!is_string($applicationId) || $applicationId === '' || !is_string($documentId)
        || ($requirementId !== null && !is_string($requirementId))
        || !is_string($documentName) || trim($documentName) === '' || strlen($documentName) > 255) {
        sendResponse(400, [], 'Invalid document details.');
    }

    $applicationStmt = $db->prepare("SELECT nominator_id, status, award_id FROM applications WHERE id = :id LIMIT 1");
    $applicationStmt->execute([':id' => $applicationId]);
    $application = $applicationStmt->fetch();
    if (!$application) {
        sendResponse(404, [], 'Application not found.');
    }
    if ((string)$application['nominator_id'] !== (string)$actor['id']) {
        sendResponse(403, [], 'Only the original filer can upload or replace nomination documents.');
    }
    if (!in_array($application['status'], ['Draft', 'Returned for Revision', 'Incomplete'], true)) {
        sendResponse(409, [], 'Attachments can only be uploaded before submission or during a requested revision.');
    }
    if ($requirementId !== null && $requirementId !== '') {
        $requirementStmt = $db->prepare('SELECT id FROM award_document_requirements WHERE id = :id AND award_id = :award_id');
        $requirementStmt->execute([':id' => $requirementId, ':award_id' => $application['award_id']]);
        if (!$requirementStmt->fetch()) sendResponse(400, [], 'Attachment requirement does not belong to this award.');
    }
    if ($documentId === '' && $requirementId) {
        $existingStmt = $db->prepare('SELECT * FROM application_documents WHERE application_id = :application_id AND requirement_id = :requirement_id LIMIT 1');
        $existingStmt->execute([':application_id' => $applicationId, ':requirement_id' => $requirementId]);
        $existingDocument = $existingStmt->fetch();
        if ($existingDocument) {
            if ($application['status'] !== 'Draft') {
                $existingDocument['file_url'] = public_document_url((string)$existingDocument['id']);
                sendResponse(200, $existingDocument, 'Document was already uploaded.');
            }
            $documentId = $existingDocument['id'];
        }
    }
    $uploadDir = prepare_private_document_dir();
    if ($uploadDir === null) {
        error_log('[documents.php:upload] Private storage is unavailable or within the web root.');
        sendResponse(500, [], 'Upload storage is unavailable.');
    }

    $safeName = 'doc_' . bin2hex(random_bytes(16)) . '.' . $extension;
    $targetPath = $uploadDir . $safeName;
    $fileUrl = 'private/' . $safeName;
    $documentStatus = $documentId !== '' && $application['status'] !== 'Draft' ? 'For Verification' : 'Submitted';
    $fileMoved = false;
    $oldFileUrl = null;
    try {
        $db->beginTransaction();
        if ($documentId !== '') {
            $oldStmt = $db->prepare('SELECT file_url, requirement_id FROM application_documents WHERE id = :id AND application_id = :application_id FOR UPDATE');
            $oldStmt->execute([':id' => $documentId, ':application_id' => $applicationId]);
            $oldDocument = $oldStmt->fetch();
            if (!$oldDocument) {
                $db->rollBack();
                sendResponse(404, [], 'Document not found.');
            }
            if ($requirementId !== null && $requirementId !== '' && $oldDocument['requirement_id'] !== $requirementId) {
                $db->rollBack();
                sendResponse(400, [], 'Document does not belong to that requirement.');
            }
            $oldFileUrl = (string)$oldDocument['file_url'];
        }
        if (!move_uploaded_file($file['tmp_name'], $targetPath)) throw new RuntimeException('Unable to move uploaded file.');
        $fileMoved = true;
        if ($documentId !== '') {
            $stmt = $db->prepare("
                UPDATE application_documents
                SET document_name = :document_name,
                    file_url = :file_url,
                    file_size = :file_size,
                    file_type = :file_type,
                    status = :status,
                    verification_remarks = NULL,
                    verified_by = NULL,
                    verified_at = NULL,
                    uploaded_at = NOW()
                WHERE id = :id AND application_id = :application_id
            ");
            $stmt->execute([
                ':id' => $documentId,
                ':application_id' => $applicationId,
                ':document_name' => $documentName,
                ':file_url' => $fileUrl,
                ':file_size' => $fileSize,
                ':file_type' => $detectedMime,
                ':status' => $documentStatus,
            ]);

            $logAction = $application['status'] === 'Draft' ? 'Draft Attachment Replaced' : 'Compliance Document Re-uploaded';
            $logRemarks = $documentName;
        } else {
            $documentId = 'doc-' . bin2hex(random_bytes(16));
            $stmt = $db->prepare("
                INSERT INTO application_documents (id, application_id, requirement_id, document_name, file_url, file_size, file_type, status)
                VALUES (:id, :application_id, :requirement_id, :document_name, :file_url, :file_size, :file_type, :status)
            ");
            $stmt->execute([
                ':id' => $documentId,
                ':application_id' => $applicationId,
                ':requirement_id' => $requirementId,
                ':document_name' => $documentName,
                ':file_url' => $fileUrl,
                ':file_size' => $fileSize,
                ':file_type' => $detectedMime,
                ':status' => $documentStatus,
            ]);

            $logAction = 'Document Uploaded';
            $logRemarks = $documentName;
        }

        $db->prepare("
            INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
            VALUES (:id, :application_id, :user_id, :user_name, :user_role, :action, :previous_status, :new_status, :remarks)
        ")->execute([
            ':id' => 'log-' . bin2hex(random_bytes(16)),
            ':application_id' => $applicationId,
            ':user_id' => $actor['id'],
            ':user_name' => $actor['full_name'],
            ':user_role' => $actor['role'],
            ':action' => $logAction,
            ':previous_status' => $application['status'],
            ':new_status' => $application['status'],
            ':remarks' => $logRemarks,
        ]);

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($fileMoved && is_file($targetPath) && !unlink($targetPath)) {
            error_log('[documents.php:upload] Unable to clean up failed upload.');
        }
        sendInternalError($e, 'documents.php:upload', 'Failed to store uploaded file.');
    }

    if ($oldFileUrl !== null) delete_replaced_upload($oldFileUrl);
    sendResponse(201, [
        'id' => $documentId,
        'application_id' => $applicationId,
        'document_name' => $documentName,
        'file_url' => public_document_url((string)$documentId),
        'file_size' => $fileSize,
        'file_type' => $detectedMime,
        'status' => $documentStatus,
    ], 'File uploaded successfully.');
}

sendResponse(405, [], 'Method not allowed.');
