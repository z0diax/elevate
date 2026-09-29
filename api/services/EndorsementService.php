<?php
declare(strict_types=1);

function handle_endorse(PDO $db, array $actor, array $data, string $appId, array $current): void {
    $decision = $data['decision'] ?? 'Endorsed';
    if (!in_array($decision, ['Endorsed', 'Returned for Revision', 'Rejected'], true)) {
        sendResponse(400, [], 'Invalid endorsement decision.');
    }
    if ($actor['role'] !== 'HEAD_OF_OFFICE' && $actor['role'] !== 'ADMINISTRATOR') {
        sendResponse(403, [], 'Only a Head of Office can record an endorsement decision.');
    }
    if ($current['processing_stage'] !== 'Endorsement' || !in_array($current['status'], ['For Endorsement', 'Submitted'], true)) {
        sendResponse(409, [], 'This nomination is no longer awaiting Head of Office endorsement.');
    }
    if ($actor['role'] === 'HEAD_OF_OFFICE' && (empty($actor['office_id']) || $current['office_id'] !== $actor['office_id'])) {
        sendResponse(403, [], 'You can only endorse nominations from your assigned office.');
    }
    if ($decision === 'Endorsed') {
        $missingRequirementStmt = $db->prepare("
            SELECT requirement.document_name
            FROM award_document_requirements requirement
            LEFT JOIN application_documents document
                ON document.application_id = :application_id
                AND document.requirement_id = requirement.id
                AND document.file_url <> ''
                AND document.file_size > 0
            WHERE requirement.award_id = :award_id
                AND requirement.is_mandatory = 1
                AND document.id IS NULL
            LIMIT 1
        ");
        $missingRequirementStmt->execute([
            ':application_id' => $appId,
            ':award_id' => $current['award_id'],
        ]);
        $missingRequirement = $missingRequirementStmt->fetchColumn();
        if ($missingRequirement !== false) {
            sendResponse(409, [], 'Required attachment is missing: ' . $missingRequirement);
        }
        $headReviewStmt = $db->prepare("SELECT status FROM application_documents WHERE application_id = :id");
        $headReviewStmt->execute([':id' => $appId]);
        $headReviewStatuses = $headReviewStmt->fetchAll(PDO::FETCH_COLUMN);
        $allDocumentsApproved = !empty($headReviewStatuses)
            && count(array_filter(
                $headReviewStatuses,
                static fn($status): bool => strcasecmp(trim((string)$status), 'Head Approved') === 0
            )) === count($headReviewStatuses);
        if (!$allDocumentsApproved) {
            sendResponse(409, [], 'Inspect and approve every attached document before endorsing this nomination.');
        }
    }
    $remarks = trim((string)($data['remarks'] ?? ''));
    $endorserName = $actor['full_name'];
    $endorserTitle = $actor['position_title'] ?? 'Department Head';

    $newStatus = 'For Verification';
    $stage = 'Document Verification';
    $requiredAction = 'Awaiting Secretariat document verification';

    if ($decision === 'Returned for Revision') {
        $newStatus = 'Returned for Revision';
        $stage = 'Endorsement';
        $requiredAction = $remarks !== '' ? "Returned by Head of Office: {$remarks}" : 'Returned for revision by Head of Office.';
    } elseif ($decision === 'Rejected') {
        $newStatus = 'Not Approved';
        $stage = 'Final Decision';
        $requiredAction = $remarks !== '' ? "Rejected during endorsement: {$remarks}" : 'Rejected during endorsement.';
    }

    $db->beginTransaction();
    try {
        $db->prepare("
            UPDATE applications
            SET status = :status, processing_stage = :stage, required_action = :required_action, remarks = :remarks, updated_at = NOW()
            WHERE id = :id
        ")->execute([
            ':status' => $newStatus,
            ':stage' => $stage,
            ':required_action' => $requiredAction,
            ':remarks' => $remarks !== '' ? $remarks : null,
            ':id' => $appId,
        ]);

        $db->prepare("
            INSERT INTO endorsements (id, application_id, endorsed_by, endorser_title, decision, remarks)
            VALUES (:id, :application_id, :endorsed_by, :endorser_title, :decision, :remarks)
        ")->execute([
            ':id' => 'end-' . bin2hex(random_bytes(16)),
            ':application_id' => $appId,
            ':endorsed_by' => $endorserName,
            ':endorser_title' => $endorserTitle,
            ':decision' => $decision,
            ':remarks' => $remarks !== '' ? $remarks : $decision,
        ]);

        addHistory($db, $appId, $actor, "Head of Office: {$decision}", $current['status'], $newStatus, $remarks);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:endorse', 'Failed to process endorsement.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Endorsement processed.');
}

function handle_inspect_document(PDO $db, array $actor, array $data, string $appId, array $current): void {
    if ($actor['role'] !== 'HEAD_OF_OFFICE') {
        sendResponse(403, [], 'Only a Head of Office can inspect documents for endorsement.');
    }
    if ($current['processing_stage'] !== 'Endorsement' || !in_array($current['status'], ['For Endorsement', 'Submitted'], true)) {
        sendResponse(409, [], 'This nomination is no longer awaiting Head of Office document inspection.');
    }
    if (empty($actor['office_id']) || $current['office_id'] !== $actor['office_id']) {
        sendResponse(403, [], 'You can only inspect documents for nominations from your assigned office.');
    }

    $docId = (string)($data['document_id'] ?? '');
    $status = (string)($data['status'] ?? '');
    $remarks = trim((string)($data['remarks'] ?? ''));
    if ($docId === '' || !in_array($status, ['Head Approved', 'Head Rejected'], true)) {
        sendResponse(400, [], 'A document and a valid Head of Office review decision are required.');
    }
    if ($status === 'Head Rejected' && $remarks === '') {
        sendResponse(400, [], 'Remarks are required when returning a document for correction.');
    }

    $docStmt = $db->prepare("SELECT status FROM application_documents WHERE id = :id AND application_id = :application_id");
    $docStmt->execute([':id' => $docId, ':application_id' => $appId]);
    $document = $docStmt->fetch();
    if (!$document) {
        sendResponse(404, [], 'Document not found for this nomination.');
    }
    if (in_array(strtolower(trim((string)$document['status'])), ['head approved', 'head rejected'], true)) {
        sendResponse(409, [], 'This document has already been inspected by the Head of Office.');
    }

    $db->beginTransaction();
    try {
        $reviewStmt = $db->prepare("
            UPDATE application_documents
            SET status = :status,
                verification_remarks = :remarks,
                verified_by = :reviewed_by,
                verified_at = NOW()
            WHERE id = :id AND application_id = :application_id
              AND LOWER(TRIM(status)) NOT IN ('head approved', 'head rejected')
        ");
        $reviewStmt->execute([
            ':status' => $status,
            ':remarks' => $remarks !== '' ? $remarks : 'Document inspected and approved for endorsement.',
            ':reviewed_by' => $actor['full_name'],
            ':id' => $docId,
            ':application_id' => $appId,
        ]);
        if ($reviewStmt->rowCount() === 0) {
            $db->rollBack();
            sendResponse(409, [], 'This document has already been inspected by the Head of Office.');
        }
        addHistory($db, $appId, $actor, "Head of Office: {$status}", $current['status'], $current['status'], $remarks);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:inspect_document', 'Failed to record document inspection.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Document inspection recorded.');
}
