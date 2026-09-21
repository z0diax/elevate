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

        $docId = 'doc-' . time() . '-' . rand(100, 999);
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

    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $safeName = 'doc_' . time() . '_' . rand(1000, 9999) . ($extension ? '.' . strtolower($extension) : '');
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
                    status = 'For Verification',
                    verification_remarks = NULL,
                    verified_by = NULL,
                    verified_at = NULL,
                    uploaded_at = NOW()
                WHERE id = :id
            ");
            $stmt->execute([
                ':id' => $documentId,
                ':document_name' => $documentName,
                ':file_url' => $fileUrl,
                ':file_size' => $file['size'],
                ':file_type' => $file['type'] ?: 'application/octet-stream',
            ]);

            $logAction = 'Compliance Document Re-uploaded';
            $logRemarks = $documentName;
        } else {
            $documentId = 'doc-' . time() . '-' . rand(100, 999);
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
            UPDATE applications
            SET status = 'For Verification',
                processing_stage = 'Document Verification',
                required_action = 'Uploaded documents awaiting Secretariat verification.'
            WHERE id = :id
        ")->execute([':id' => $applicationId]);

        $db->prepare("
            INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
            VALUES (:id, :application_id, :user_id, :user_name, :user_role, :action, NULL, 'For Verification', :remarks)
        ")->execute([
            ':id' => 'log-' . time() . '-' . rand(10, 99),
            ':application_id' => $applicationId,
            ':user_id' => $actor['id'],
            ':user_name' => $actor['full_name'],
            ':user_role' => $actor['role'],
            ':action' => $logAction,
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
        'status' => $documentId !== '' ? 'For Verification' : 'Submitted',
    ], 'File uploaded successfully.');
}

sendResponse(405, [], 'Method not allowed.');
