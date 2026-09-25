<?php
declare(strict_types=1);

/**
 * Documents and attachment upload API.
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $actor = require_auth($db);

    if (!isset($_FILES['file'])) {
        $data = getJsonInput();
        if (empty($data['application_id']) || empty($data['document_name'])) {
            sendResponse(400, [], 'application_id and document_name are required.');
        }

        $docId = 'doc-' . bin2hex(random_bytes(16));
        $stmt = $db->prepare("
            INSERT INTO application_documents (id, application_id, requirement_id, document_name, file_url, file_size, file_type, status)
            VALUES (:id, :application_id, :requirement_id, :document_name, :file_url, :file_size, :file_type, :status)
        ");
        $stmt->execute([
            ':id' => $docId,
            ':application_id' => $data['application_id'],
            ':requirement_id' => $data['requirement_id'] ?? null,
            ':document_name' => $data['document_name'],
            ':file_url' => $data['file_url'] ?? '',
            ':file_size' => $data['file_size'] ?? null,
            ':file_type' => $data['file_type'] ?? 'application/pdf',
            ':status' => $data['status'] ?? 'Submitted',
        ]);

        sendResponse(201, ['id' => $docId], 'Document registered.');
    }

    $file = $_FILES['file'];
    $applicationId = $_POST['application_id'] ?? '';
    $documentId = $_POST['document_id'] ?? '';
    $requirementId = $_POST['requirement_id'] ?? null;
    $documentName = $_POST['document_name'] ?? $file['name'];

    if ($applicationId === '') {
        sendResponse(400, [], 'application_id is required.');
    }

    $applicationStmt = $db->prepare("SELECT nominator_id, status FROM applications WHERE id = :id LIMIT 1");
    $applicationStmt->execute([':id' => $applicationId]);
    $application = $applicationStmt->fetch();
    if (!$application) {
        sendResponse(404, [], 'Application not found.');
    }
    if ((string)$application['nominator_id'] !== (string)$actor['id']) {
        sendResponse(403, [], 'Only the original filer can upload or replace nomination documents.');
    }
    if ($documentId !== '' && !in_array($application['status'], ['Draft', 'Returned for Revision', 'Incomplete'], true)) {
        sendResponse(409, [], 'Documents can only be replaced while the nomination is returned for correction.');
    }
    if ($documentId === '' && $requirementId) {
        $existingStmt = $db->prepare('SELECT * FROM application_documents WHERE application_id = :application_id AND requirement_id = :requirement_id LIMIT 1');
        $existingStmt->execute([':application_id' => $applicationId, ':requirement_id' => $requirementId]);
        $existingDocument = $existingStmt->fetch();
        if ($existingDocument) {
            if ($application['status'] !== 'Draft') {
                sendResponse(200, $existingDocument, 'Document was already uploaded.');
            }
            $documentId = $existingDocument['id'];
        }
    }
    if ($documentId === '' && !in_array($application['status'], ['Draft', 'Returned for Revision', 'Incomplete'], true)) {
        sendResponse(409, [], 'New attachments can only be uploaded before submission or during a requested revision.');
    }

    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $safeName = 'doc_' . bin2hex(random_bytes(16)) . ($extension ? '.' . strtolower($extension) : '');
    $targetPath = $uploadDir . $safeName;

    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        sendResponse(500, [], 'Failed to move uploaded file.');
    }

    $fileUrl = 'uploads/' . $safeName;

    $db->beginTransaction();
    try {
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
                ':file_size' => $file['size'],
                ':file_type' => $file['type'] ?: 'application/octet-stream',
                ':status' => $application['status'] === 'Draft' ? 'Submitted' : 'For Verification',
            ]);

            $logAction = $application['status'] === 'Draft' ? 'Draft Attachment Replaced' : 'Compliance Document Re-uploaded';
            $logRemarks = $documentName;
        } else {
            $documentId = 'doc-' . bin2hex(random_bytes(16));
            $stmt = $db->prepare("
                INSERT INTO application_documents (id, application_id, requirement_id, document_name, file_url, file_size, file_type, status)
                VALUES (:id, :application_id, :requirement_id, :document_name, :file_url, :file_size, :file_type, 'Submitted')
            ");
            $stmt->execute([
                ':id' => $documentId,
                ':application_id' => $applicationId,
                ':requirement_id' => $requirementId,
                ':document_name' => $documentName,
                ':file_url' => $fileUrl,
                ':file_size' => $file['size'],
                ':file_type' => $file['type'] ?: 'application/octet-stream',
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
    } catch (Exception $e) {
        $db->rollBack();
        sendResponse(500, [], 'Failed to store uploaded file: ' . $e->getMessage());
    }

    sendResponse(201, [
        'id' => $documentId,
        'application_id' => $applicationId,
        'document_name' => $documentName,
        'file_url' => $fileUrl,
        'file_size' => $file['size'],
        'file_type' => $file['type'] ?: 'application/octet-stream',
        'status' => $application['status'] === 'Draft' ? 'Submitted' : ($documentId !== '' ? 'For Verification' : 'Submitted'),
    ], 'File uploaded successfully.');
}

sendResponse(405, [], 'Method not allowed.');
