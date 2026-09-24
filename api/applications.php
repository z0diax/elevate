<?php
declare(strict_types=1);

/**
 * Applications and PRAISE workflow API.
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

function ensureDocumentReviewStatusSchema(PDO $db): void {
    static $checked = false;
    if ($checked) {
        return;
    }

    $column = $db->query("SHOW COLUMNS FROM `application_documents` LIKE 'status'")->fetch();
    if (!$column) {
        return;
    }

    $columnType = strtolower((string)($column['Type'] ?? ''));
    if (str_contains($columnType, 'enum') && !str_contains($columnType, 'head approved')) {
        $db->exec("ALTER TABLE `application_documents` MODIFY COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'Submitted'");
        $db->exec("
            UPDATE `application_documents`
            SET `status` = 'Head Approved'
            WHERE (`status` = '' OR `status` IS NULL)
              AND `verification_remarks` LIKE '%approved%Head%Office%'
        ");
    }

    $checked = true;
}

ensureDocumentReviewStatusSchema($db);

$method = $_SERVER['REQUEST_METHOD'];

function getFullApplication($db, string $appId): ?array {
    $stmt = $db->prepare("SELECT * FROM applications WHERE id = :id");
    $stmt->execute([':id' => $appId]);
    $app = $stmt->fetch();

    if (!$app) {
        return null;
    }

    $app['award_year'] = (int)$app['award_year'];
    $app['final_weighted_score'] = $app['final_weighted_score'] !== null ? (float)$app['final_weighted_score'] : null;
    $app['assigned_evaluators'] = !empty($app['assigned_evaluators']) ? (json_decode($app['assigned_evaluators'], true) ?: []) : [];

    $docStmt = $db->prepare("SELECT * FROM application_documents WHERE application_id = :id ORDER BY uploaded_at ASC");
    $docStmt->execute([':id' => $appId]);
    $documents = $docStmt->fetchAll();
    foreach ($documents as &$document) {
        $document['file_size'] = $document['file_size'] !== null ? (int)$document['file_size'] : null;
    }
    $app['documents'] = $documents;

    $endStmt = $db->prepare("SELECT * FROM endorsements WHERE application_id = :id ORDER BY created_at DESC LIMIT 1");
    $endStmt->execute([':id' => $appId]);
    $app['endorsement'] = $endStmt->fetch() ?: null;

    $evalStmt = $db->prepare("SELECT * FROM evaluations WHERE application_id = :id ORDER BY created_at ASC");
    $evalStmt->execute([':id' => $appId]);
    $evaluations = $evalStmt->fetchAll();

    foreach ($evaluations as &$evaluation) {
        $evaluation['total_raw_score'] = (float)$evaluation['total_raw_score'];
        $evaluation['weighted_percentage'] = (float)$evaluation['weighted_percentage'];
        $evaluation['total_score'] = (float)$evaluation['weighted_percentage'];
        $evaluation['is_submitted'] = (bool)$evaluation['is_submitted'];

        $scoreStmt = $db->prepare("SELECT * FROM evaluation_scores WHERE evaluation_id = :eval_id ORDER BY created_at ASC");
        $scoreStmt->execute([':eval_id' => $evaluation['id']]);
        $scores = $scoreStmt->fetchAll();
        foreach ($scores as &$score) {
            $score['weight_percentage'] = (float)$score['weight_percentage'];
            $score['max_score'] = (float)$score['max_score'];
            $score['score'] = (float)$score['score'];
            $score['weighted_score'] = isset($score['weighted_score']) ? (float)$score['weighted_score'] : 0.0;
            $score['raw_score'] = (float)$score['score'];
            $score['evaluator_remarks'] = $score['remarks'] ?? '';
        }
        $evaluation['scores'] = $scores;
    }
    $app['evaluations'] = $evaluations;
    $app['stage'] = $app['processing_stage'];

    return $app;
}

function findSubmittedNomination(PDO $db, string $appId, array $actor, array $data): ?array {
    $stmt = $db->prepare('SELECT nominator_id, award_id, nominee_name, office_id FROM applications WHERE id = :id');
    $stmt->execute([':id' => $appId]);
    $existing = $stmt->fetch();
    if (!$existing) {
        return null;
    }

    if ((string)$existing['nominator_id'] !== (string)$actor['id']
        || (string)$existing['award_id'] !== (string)$data['award_id']
        || (string)$existing['nominee_name'] !== trim((string)$data['nominee_name'])
        || (string)$existing['office_id'] !== (string)$data['office_id']) {
        sendResponse(409, [], 'This submission ID already belongs to another nomination.');
    }

    return getFullApplication($db, $appId);
}

function addHistory($db, string $appId, array $user, string $action, ?string $previousStatus, string $newStatus, string $remarks = ''): void {
    $stmt = $db->prepare("
        INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
        VALUES (:id, :application_id, :user_id, :user_name, :user_role, :action, :previous_status, :new_status, :remarks)
    ");
    $stmt->execute([
        ':id' => 'log-' . time() . '-' . rand(10, 99),
        ':application_id' => $appId,
        ':user_id' => $user['id'] ?? null,
        ':user_name' => $user['full_name'] ?? 'System',
        ':user_role' => $user['role'] ?? 'SECRETARIAT',
        ':action' => $action,
        ':previous_status' => $previousStatus,
        ':new_status' => $newStatus,
        ':remarks' => $remarks,
    ]);
}

function canViewApplication(array $application, array $actor): bool {
    $role = $actor['role'] ?? '';

    if ($role === 'ADMINISTRATOR') {
        return true;
    }

    // A filer must retain read-only visibility of their own nomination throughout
    // the workflow, even after it moves beyond their operational workbench.
    if ((string)($application['nominator_id'] ?? '') === (string)($actor['id'] ?? '')
        || (string)($application['nominee_id'] ?? '') === (string)($actor['id'] ?? '')) {
        return true;
    }

    if ($role === 'SECRETARIAT') {
        if ($application['processing_stage'] === 'Document Verification') {
            return in_array($application['status'], ['Endorsed', 'For Verification', 'Incomplete', 'Verified'], true);
        }

        if ($application['processing_stage'] === 'Deliberation') {
            return in_array($application['status'], ['Evaluation Completed', 'For Deliberation'], true);
        }

        return in_array($application['processing_stage'], ['Final Decision', 'Awarded'], true)
            && in_array($application['status'], ['Approved', 'Not Approved', 'Awarded'], true);
    }

    if ($role === 'HEAD_OF_OFFICE') {
        return $application['processing_stage'] === 'Endorsement'
            && (!empty($actor['office_id']) && $application['office_id'] === $actor['office_id']);
    }

    if ($role === 'EVALUATOR') {
        $assignedEvaluators = is_array($application['assigned_evaluators'] ?? null)
            ? $application['assigned_evaluators']
            : (!empty($application['assigned_evaluators'])
                ? (json_decode((string)$application['assigned_evaluators'], true) ?: [])
                : []);
        return $application['processing_stage'] === 'Evaluation'
            && in_array($actor['id'], $assignedEvaluators, true);
    }

    return false;
}

if ($method === 'GET') {
    $actor = require_auth($db);

    if (isset($_GET['id'])) {
        $application = getFullApplication($db, (string)$_GET['id']);
        if (!$application) {
            sendResponse(404, [], 'Application not found.');
        }
        if (!canViewApplication($application, $actor)) {
            sendResponse(403, [], 'You are not assigned to this nomination at its current workflow stage.');
        }
        sendResponse(200, $application);
    }

    $stmt = $db->query("SELECT id FROM applications ORDER BY created_at DESC");
    $results = [];
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $application = getFullApplication($db, (string)$id);
        if ($application && canViewApplication($application, $actor)) {
            $results[] = $application;
        }
    }

    sendResponse(200, $results);
}

if ($method === 'POST') {
    $actor = require_auth($db, ['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'NOMINEE']);
    $data = getJsonInput();

    if (empty($data['award_id']) || empty($data['nominee_name']) || empty($data['office_id'])) {
        sendResponse(400, [], 'Missing required fields: award_id, nominee_name, office_id.');
    }

    $submissionId = (string)($data['submission_id'] ?? '');
    if ($submissionId !== '' && !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i', $submissionId)) {
        sendResponse(400, [], 'Invalid submission ID.');
    }
    $appId = $submissionId !== '' ? 'app-' . strtolower($submissionId) : 'app-' . time() . '-' . rand(100, 999);
    if ($submissionId !== '') {
        $existing = findSubmittedNomination($db, $appId, $actor, $data);
        if ($existing) {
            sendResponse(200, $existing, 'Nomination was already submitted.');
        }
    }

    $db->beginTransaction();
    try {
        $year = (int)($data['award_year'] ?? date('Y'));

        $stmtCount = $db->query("SELECT COUNT(*) FROM applications");
        $totalCount = (int)$stmtCount->fetchColumn() + 1;
        $appNumber = "PRAISE-{$year}-" . str_pad((string)$totalCount, 5, '0', STR_PAD_LEFT);

        $stmtAward = $db->prepare("SELECT name FROM awards WHERE id = :id");
        $stmtAward->execute([':id' => $data['award_id']]);
        $awardName = $stmtAward->fetchColumn() ?: ($data['award_name'] ?? 'Tacloban PRAISE Award');

        $stmt = $db->prepare("
            INSERT INTO applications (
                id, application_number, award_id, award_name, award_year, nominee_id, nominee_name, employee_id,
                position_title, office_id, office_name, division_section, employment_category, contact_number, email,
                barangay, nomination_type, nominator_id, nominator_name, nominator_position, nominating_office,
                justification, accomplishments, supporting_narrative, date_of_nomination, status, processing_stage,
                required_action, assigned_evaluators
            ) VALUES (
                :id, :application_number, :award_id, :award_name, :award_year, :nominee_id, :nominee_name, :employee_id,
                :position_title, :office_id, :office_name, :division_section, :employment_category, :contact_number, :email,
                :barangay, :nomination_type, :nominator_id, :nominator_name, :nominator_position, :nominating_office,
                :justification, :accomplishments, :supporting_narrative, :date_of_nomination, 'For Endorsement', 'Endorsement',
                :required_action, '[]'
            )
        ");

        $requiredAction = 'Awaiting endorsement from ' . ($data['office_name'] ?? 'Office Head');
        $stmt->execute([
            ':id' => $appId,
            ':application_number' => $appNumber,
            ':award_id' => $data['award_id'],
            ':award_name' => $awardName,
            ':award_year' => $year,
            ':nominee_id' => $data['nominee_id'] ?? null,
            ':nominee_name' => $data['nominee_name'],
            ':employee_id' => $data['employee_id'] ?? null,
            ':position_title' => $data['position_title'] ?? 'Staff',
            ':office_id' => $data['office_id'],
            ':office_name' => $data['office_name'] ?? 'Tacloban Office',
            ':division_section' => $data['division_section'] ?? null,
            ':employment_category' => $data['employment_category'] ?? 'Permanent',
            ':contact_number' => $data['contact_number'] ?? '',
            ':email' => $data['email'] ?? '',
            ':barangay' => $data['barangay'] ?? null,
            ':nomination_type' => $data['nomination_type'] ?? 'Individual',
            ':nominator_id' => $actor['id'],
            ':nominator_name' => $data['nominator_name'] ?? $actor['full_name'],
            ':nominator_position' => $data['nominator_position'] ?? ($actor['position_title'] ?? 'Nominator'),
            ':nominating_office' => $data['nominating_office'] ?? ($data['office_name'] ?? ''),
            ':justification' => $data['justification'] ?? '',
            ':accomplishments' => $data['accomplishments'] ?? '',
            ':supporting_narrative' => $data['supporting_narrative'] ?? '',
            ':date_of_nomination' => $data['date_of_nomination'] ?? date('Y-m-d'),
            ':required_action' => $requiredAction,
        ]);

        if (!empty($data['documents']) && is_array($data['documents'])) {
            $docStmt = $db->prepare("
                INSERT INTO application_documents (id, application_id, requirement_id, document_name, file_url, file_size, file_type, status)
                VALUES (:id, :application_id, :requirement_id, :document_name, :file_url, :file_size, :file_type, :status)
            ");
            foreach ($data['documents'] as $index => $document) {
                $docStmt->execute([
                    ':id' => 'doc-' . $appId . '-' . ($index + 1),
                    ':application_id' => $appId,
                    ':requirement_id' => $document['requirement_id'] ?? null,
                    ':document_name' => $document['document_name'] ?? ('Attachment ' . ($index + 1)),
                    ':file_url' => $document['file_url'] ?? '',
                    ':file_size' => $document['file_size'] ?? null,
                    ':file_type' => $document['file_type'] ?? 'application/pdf',
                    ':status' => $document['status'] ?? 'Submitted',
                ]);
            }
        }

        addHistory(
            $db,
            $appId,
            $actor,
            'Nomination Submitted',
            'Draft',
            'For Endorsement',
            "Nomination created for {$data['nominee_name']} ({$appNumber})"
        );

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        if ($submissionId !== '') {
            $existing = findSubmittedNomination($db, $appId, $actor, $data);
            if ($existing) {
                sendResponse(200, $existing, 'Nomination was already submitted.');
            }
        }
        sendResponse(500, [], 'Failed to create nomination: ' . $e->getMessage());
    }

    sendResponse(201, getFullApplication($db, $appId), 'Nomination submitted successfully.');
}

if ($method === 'PUT') {
    $actor = require_auth($db);
    $data = getJsonInput();
    $action = $_GET['action'] ?? ($data['action'] ?? '');
    $appId = $_GET['id'] ?? ($data['id'] ?? ($data['application_id'] ?? ''));

    if ($appId === '') {
        sendResponse(400, [], 'Application ID is required.');
    }

    $current = getFullApplication($db, $appId);
    if (!$current) {
        sendResponse(404, [], 'Application not found.');
    }

    if ($action === 'resubmit') {
        if ((string)$current['nominator_id'] !== (string)$actor['id']) {
            sendResponse(403, [], 'Only the user who originally submitted this nomination can resubmit it.');
        }

        $wasRejectedDuringEndorsement = $current['status'] === 'Not Approved'
            && isset($current['endorsement']['decision'])
            && $current['endorsement']['decision'] === 'Rejected';
        if (!in_array($current['status'], ['Returned for Revision', 'Incomplete'], true) && !$wasRejectedDuringEndorsement) {
            sendResponse(409, [], 'This nomination is not currently eligible for resubmission.');
        }

        $pendingDocsStmt = $db->prepare("
            SELECT COUNT(*)
            FROM application_documents
            WHERE application_id = :id AND status IN ('Rejected', 'Missing')
        ");
        $pendingDocsStmt->execute([':id' => $appId]);
        if ((int)$pendingDocsStmt->fetchColumn() > 0) {
            sendResponse(409, [], 'Replace every rejected or missing document before resubmitting.');
        }

        $replacementDocsStmt = $db->prepare("
            SELECT COUNT(*)
            FROM application_documents
            WHERE application_id = :id AND status = 'For Verification'
        ");
        $replacementDocsStmt->execute([':id' => $appId]);
        $hasReplacementDocuments = (int)$replacementDocsStmt->fetchColumn() > 0;
        $returnToVerification = $current['status'] === 'Incomplete'
            || $current['processing_stage'] === 'Document Verification'
            || (isset($current['endorsement']['decision']) && $current['endorsement']['decision'] === 'Endorsed')
            || $hasReplacementDocuments;
        $newStatus = $returnToVerification ? 'For Verification' : 'For Endorsement';
        $newStage = $returnToVerification ? 'Document Verification' : 'Endorsement';
        $requiredAction = $returnToVerification
            ? 'Corrected nomination resubmitted for Secretariat document verification.'
            : 'Corrected nomination resubmitted for Head of Office endorsement.';
        $resubmissionNote = trim((string)($data['remarks'] ?? 'Requested corrections completed by the original filer.'));

        $db->beginTransaction();
        try {
            $db->prepare("
                UPDATE applications
                SET status = :status,
                    processing_stage = :stage,
                    required_action = :required_action,
                    remarks = :remarks,
                    updated_at = NOW()
                WHERE id = :id
            ")->execute([
                ':status' => $newStatus,
                ':stage' => $newStage,
                ':required_action' => $requiredAction,
                ':remarks' => $resubmissionNote !== '' ? $resubmissionNote : null,
                ':id' => $appId,
            ]);

            addHistory($db, $appId, $actor, 'Nomination Resubmitted', $current['status'], $newStatus, $resubmissionNote);
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to resubmit nomination: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Nomination resubmitted successfully.');
    }

    if ($action === 'endorse') {
        $decision = $data['decision'] ?? 'Endorsed';
        if ($actor['role'] !== 'HEAD_OF_OFFICE' && $actor['role'] !== 'ADMINISTRATOR') {
            sendResponse(403, [], 'Only a Head of Office can record an endorsement decision.');
        }
        if ($current['processing_stage'] !== 'Endorsement' || !in_array($current['status'], ['For Endorsement', 'Submitted', 'Returned for Revision'], true)) {
            sendResponse(409, [], 'This nomination is no longer awaiting Head of Office endorsement.');
        }
        if ($actor['role'] === 'HEAD_OF_OFFICE' && !empty($actor['office_id']) && $current['office_id'] !== $actor['office_id']) {
            sendResponse(403, [], 'You can only endorse nominations from your assigned office.');
        }
        if ($decision === 'Endorsed') {
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
        $endorserName = $data['endorser_name'] ?? $actor['full_name'];
        $endorserTitle = $data['endorser_title'] ?? ($actor['position_title'] ?? 'Department Head');

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
                ':id' => 'end-' . time() . '-' . rand(10, 99),
                ':application_id' => $appId,
                ':endorsed_by' => $endorserName,
                ':endorser_title' => $endorserTitle,
                ':decision' => $decision,
                ':remarks' => $remarks !== '' ? $remarks : $decision,
            ]);

            addHistory($db, $appId, $actor, "Head of Office: {$decision}", $current['status'], $newStatus, $remarks);
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to process endorsement: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Endorsement processed.');
    }

    if ($action === 'verify_document') {
        if (!in_array($actor['role'], ['SECRETARIAT', 'ADMINISTRATOR'], true)) {
            sendResponse(403, [], 'Only Secretariat staff can complete formal document verification.');
        }
        if ($current['processing_stage'] !== 'Document Verification' || !in_array($current['status'], ['For Verification', 'Incomplete', 'Endorsed'], true)) {
            sendResponse(409, [], 'This nomination is not currently in Secretariat document verification.');
        }
        $docId = $data['document_id'] ?? '';
        $status = $data['status'] ?? 'Verified';
        $remarks = trim((string)($data['remarks'] ?? ''));
        $verifiedBy = $data['verified_by'] ?? $actor['full_name'];

        if ($docId === '') {
            sendResponse(400, [], 'document_id is required.');
        }

        $db->beginTransaction();
        try {
            $db->prepare("
                UPDATE application_documents
                SET status = :status, verification_remarks = :remarks, verified_by = :verified_by, verified_at = NOW()
                WHERE id = :id
            ")->execute([
                ':status' => $status,
                ':remarks' => $remarks !== '' ? $remarks : null,
                ':verified_by' => $verifiedBy,
                ':id' => $docId,
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
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to update document verification: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Document verification updated.');
    }

    if ($action === 'inspect_document') {
        if ($actor['role'] !== 'HEAD_OF_OFFICE') {
            sendResponse(403, [], 'Only a Head of Office can inspect documents for endorsement.');
        }
        if ($current['processing_stage'] !== 'Endorsement' || !in_array($current['status'], ['For Endorsement', 'Submitted', 'Returned for Revision'], true)) {
            sendResponse(409, [], 'This nomination is no longer awaiting Head of Office document inspection.');
        }
        if (!empty($actor['office_id']) && $current['office_id'] !== $actor['office_id']) {
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
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to record document inspection: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Document inspection recorded.');
    }

    if ($action === 'mark_verified') {
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
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to mark application verified: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Application marked verified.');
    }

    if ($action === 'assign_evaluators') {
        if (!in_array($actor['role'], ['SECRETARIAT', 'ADMINISTRATOR'], true)) {
            sendResponse(403, [], 'Only Secretariat staff can route nominations to evaluators.');
        }
        if ($current['processing_stage'] !== 'Document Verification' || $current['status'] !== 'Verified') {
            sendResponse(409, [], 'Only a verified nomination can be routed to evaluators.');
        }
        $evaluatorIds = $data['evaluator_ids'] ?? [];
        $remarks = trim((string)($data['remarks'] ?? 'Assigned PRAISE evaluators.'));

        $db->beginTransaction();
        try {
            $db->prepare("
                UPDATE applications
                SET assigned_evaluators = :assigned_evaluators,
                    status = 'For Evaluation',
                    processing_stage = 'Evaluation',
                    required_action = 'Evaluator assessment in progress'
                WHERE id = :id
            ")->execute([
                ':assigned_evaluators' => json_encode(array_values($evaluatorIds)),
                ':id' => $appId,
            ]);

            addHistory($db, $appId, $actor, 'Routed to Evaluators', $current['status'], 'For Evaluation', $remarks);
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to assign evaluators: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Evaluators assigned.');
    }

    if ($action === 'return_for_revision') {
        $allowedReturnRoles = [
            'Endorsement' => ['HEAD_OF_OFFICE', 'ADMINISTRATOR'],
            'Document Verification' => ['SECRETARIAT', 'ADMINISTRATOR'],
            'Evaluation' => ['EVALUATOR', 'ADMINISTRATOR'],
        ];
        if (!isset($allowedReturnRoles[$current['processing_stage']]) || !in_array($actor['role'], $allowedReturnRoles[$current['processing_stage']], true)) {
            sendResponse(403, [], 'Your role is not assigned to return this nomination at its current stage.');
        }
        $remarks = trim((string)($data['remarks'] ?? 'Returned for revision.'));
        if ($remarks === '') {
            sendResponse(400, [], 'Remarks are required when returning for revision.');
        }

        $db->beginTransaction();
        try {
            $db->prepare("
                UPDATE applications
                SET status = 'Returned for Revision',
                    processing_stage = :stage,
                    required_action = :required_action,
                    remarks = :remarks
                WHERE id = :id
            ")->execute([
                ':required_action' => $remarks,
                ':remarks' => $remarks,
                ':stage' => $current['processing_stage'],
                ':id' => $appId,
            ]);

            addHistory($db, $appId, $actor, 'Returned for Revision', $current['status'], 'Returned for Revision', $remarks);
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to return application for revision: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Application returned for revision.');
    }

    if ($action === 'deliberation') {
        if (!in_array($actor['role'], ['SECRETARIAT', 'ADMINISTRATOR'], true)) {
            sendResponse(403, [], 'Only Secretariat or an Administrator can record the committee decision.');
        }
        $decision = $data['decision'] ?? 'Approved';
        $remarks = trim((string)($data['remarks'] ?? ''));
        $awardNow = !empty($data['award_now']);

        if ($decision === 'Approved') {
            $awardStmt = $db->prepare('SELECT min_qualifying_score FROM awards WHERE id = :award_id');
            $awardStmt->execute([':award_id' => $current['award_id']]);
            $minimumScore = $awardStmt->fetchColumn();
            $finalScore = $current['final_weighted_score'];

            if ($minimumScore === false || $finalScore === null) {
                sendResponse(409, [], 'This nomination cannot be approved or awarded without an award qualifying standard and a completed evaluation score.');
            }

            if ((float)$finalScore < (float)$minimumScore) {
                sendResponse(409, [], sprintf(
                    'This nomination scored %s%%, below the award qualifying standard of %s%%. It cannot be approved or awarded.',
                    number_format((float)$finalScore, 2),
                    number_format((float)$minimumScore, 2)
                ));
            }
        }

        if ($awardNow) {
            if ($decision !== 'Approved') {
                sendResponse(400, [], 'An award can only be conferred after approval.');
            }

            if ($current['status'] !== 'Approved' || $current['deliberation_decision'] !== 'Approved') {
                sendResponse(409, [], 'Only an approved nomination can be conferred an award.');
            }
        } elseif ($current['deliberation_decision'] !== null || !in_array($current['status'], ['Evaluation Completed', 'For Deliberation'], true)) {
            sendResponse(409, [], 'A committee decision has already been recorded for this nomination.');
        }

        $newStatus = $decision === 'Approved' ? ($awardNow ? 'Awarded' : 'Approved') : 'Not Approved';
        $stage = $awardNow ? 'Awarded' : 'Final Decision';
        $requiredAction = $awardNow ? 'Award conferred and incentive released.' : "Committee decision: {$decision}";

        $db->beginTransaction();
        try {
            $db->prepare("
                UPDATE applications
                SET status = :status,
                    processing_stage = :stage,
                    deliberation_decision = :decision,
                    deliberation_remarks = :remarks,
                    deliberation_date = CURRENT_DATE,
                    award_date = :award_date,
                    required_action = :required_action
                WHERE id = :id
            ")->execute([
                ':status' => $newStatus,
                ':stage' => $stage,
                ':decision' => $decision,
                ':remarks' => $remarks !== '' ? $remarks : null,
                ':award_date' => $awardNow ? date('Y-m-d') : null,
                ':required_action' => $requiredAction,
                ':id' => $appId,
            ]);

            addHistory($db, $appId, $actor, "PRAISE Committee Deliberation: {$decision}", $current['status'], $newStatus, $remarks);
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            sendResponse(500, [], 'Failed to record deliberation: ' . $e->getMessage());
        }

        sendResponse(200, getFullApplication($db, $appId), 'Deliberation decision recorded.');
    }

    sendResponse(400, [], 'Unknown action specified.');
}

if ($method === 'DELETE') {
    require_auth($db, ['ADMINISTRATOR']);
    $data = getJsonInput();
    $appId = (string)($_GET['id'] ?? ($data['id'] ?? ($data['application_id'] ?? '')));

    if ($appId === '') {
        sendResponse(400, [], 'Application ID is required.');
    }

    $application = getFullApplication($db, $appId);
    if (!$application) {
        sendResponse(404, [], 'Application not found.');
    }

    // Keep only managed local upload paths; external document links must never be deleted from disk.
    $localUploadPaths = [];
    foreach ($application['documents'] as $document) {
        $fileUrl = (string)($document['file_url'] ?? '');
        if (preg_match('#^uploads/[A-Za-z0-9._-]+$#', $fileUrl)) {
            $localUploadPaths[] = __DIR__ . '/../' . $fileUrl;
        }
    }

    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM notifications WHERE application_id = :application_id')
            ->execute([':application_id' => $appId]);

        $db->prepare('DELETE FROM applications WHERE id = :id')
            ->execute([':id' => $appId]);

        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        sendResponse(500, [], 'Failed to delete nomination: ' . $e->getMessage());
    }

    foreach (array_unique($localUploadPaths) as $filePath) {
        if (is_file($filePath)) {
            @unlink($filePath);
        }
    }

    sendResponse(200, ['id' => $appId], 'Nomination deleted.');
}

sendResponse(405, [], 'Method not allowed.');
