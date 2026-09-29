<?php
declare(strict_types=1);

function handle_verify_document(PDO $db, array $actor, array $data, string $appId, array $current): void {
    if (!in_array($actor['role'], ['SECRETARIAT', 'ADMINISTRATOR'], true)) {
        sendResponse(403, [], 'Only Secretariat staff can complete formal document verification.');
    }
    if ($current['processing_stage'] !== 'Document Verification' || !in_array($current['status'], ['For Verification', 'Incomplete', 'Endorsed'], true)) {
        sendResponse(409, [], 'This nomination is not currently in Secretariat document verification.');
    }
    $docId = $data['document_id'] ?? '';
    $status = $data['status'] ?? 'Verified';
    $remarks = trim((string)($data['remarks'] ?? ''));
    $verifiedBy = $actor['full_name'];

    if ($docId === '') {
        sendResponse(400, [], 'document_id is required.');
    }
    if (!in_array($status, ['Verified', 'Rejected', 'Missing'], true)) {
        sendResponse(400, [], 'Invalid document verification status.');
    }
    $documentStmt = $db->prepare('SELECT id FROM application_documents WHERE id = :id AND application_id = :application_id');
    $documentStmt->execute([':id' => $docId, ':application_id' => $appId]);
    if (!$documentStmt->fetch()) sendResponse(404, [], 'Document not found for this nomination.');

    $db->beginTransaction();
    try {
        $db->prepare("
            UPDATE application_documents
            SET status = :status, verification_remarks = :remarks, verified_by = :verified_by, verified_at = NOW()
            WHERE id = :id AND application_id = :application_id
        ")->execute([
            ':status' => $status,
            ':remarks' => $remarks !== '' ? $remarks : null,
            ':verified_by' => $verifiedBy,
            ':id' => $docId,
            ':application_id' => $appId,
        ]);

        $docStatusesStmt = $db->prepare("SELECT status FROM application_documents WHERE application_id = :id");
        $docStatusesStmt->execute([':id' => $appId]);
        $statuses = $docStatusesStmt->fetchAll(PDO::FETCH_COLUMN);

        $allVerified = !empty($statuses) && count(array_filter($statuses, fn($value) => $value === 'Verified')) === count($statuses);
        $hasRejected = in_array('Rejected', $statuses, true) || in_array('Missing', $statuses, true);

        $newStatus = $current['status'];
        $requiredAction = $current['required_action'];

        if ($allVerified) {
            $newStatus = 'Verified';
            $requiredAction = 'All documents verified. Ready for evaluator routing.';
        } elseif ($hasRejected) {
            $newStatus = 'Incomplete';
            $requiredAction = $remarks !== '' ? "Document compliance required: {$remarks}" : 'Document compliance required.';
        }

        $db->prepare("
            UPDATE applications
            SET status = :status, processing_stage = 'Document Verification', required_action = :required_action
            WHERE id = :id
        ")->execute([
            ':status' => $newStatus,
            ':required_action' => $requiredAction,
            ':id' => $appId,
        ]);

        addHistory($db, $appId, $actor, "Secretariat {$status} Document", $current['status'], $newStatus, $remarks !== '' ? $remarks : "Document {$docId} set to {$status}");
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:verify_document', 'Failed to update document verification.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Document verification updated.');
}

function handle_mark_verified(PDO $db, array $actor, array $data, string $appId, array $current): void {
    if (!in_array($actor['role'], ['SECRETARIAT', 'ADMINISTRATOR'], true)) {
        sendResponse(403, [], 'Only Secretariat staff can complete document verification.');
    }
    if ($current['processing_stage'] !== 'Document Verification' || !in_array($current['status'], ['For Verification', 'Incomplete', 'Endorsed'], true)) {
        sendResponse(409, [], 'This nomination is not currently in Secretariat document verification.');
    }
    $remarks = trim((string)($data['remarks'] ?? 'All mandatory documentary requirements verified and authenticated by Secretariat.'));

    $db->beginTransaction();
    try {
        $db->prepare("
            UPDATE application_documents
            SET status = 'Verified',
                verification_remarks = COALESCE(verification_remarks, 'Document verified and compliant'),
                verified_by = :verified_by,
                verified_at = NOW()
            WHERE application_id = :application_id
        ")->execute([
            ':verified_by' => $actor['full_name'],
            ':application_id' => $appId,
        ]);

        $db->prepare("
            UPDATE applications
            SET status = 'Verified',
                processing_stage = 'Document Verification',
                required_action = 'All documents verified. Ready for evaluator routing.',
                remarks = :remarks
            WHERE id = :id
        ")->execute([
            ':remarks' => $remarks,
            ':id' => $appId,
        ]);

        addHistory($db, $appId, $actor, 'Secretariat Verified All Documents', $current['status'], 'Verified', $remarks);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:mark_verified', 'Failed to mark application verified.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Application marked verified.');
}
