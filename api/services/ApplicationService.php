<?php
declare(strict_types=1);

function handle_finalize_submission(PDO $db, array $actor, array $data, string $appId, array $current): void {
    if ((string)$current['nominator_id'] !== (string)$actor['id']) {
        sendResponse(403, [], 'Only the original filer can complete this nomination.');
    }
    if ($current['status'] !== 'Draft') {
        sendResponse(200, $current, 'Nomination was already submitted.');
    }

    $expectedIds = $data['expected_requirement_ids'] ?? [];
    if (!is_array($expectedIds) || !array_is_list($expectedIds) || count($expectedIds) > 100) {
        sendResponse(400, [], 'Invalid attachment requirements.');
    }
    foreach ($expectedIds as $expectedId) requireId($expectedId, 'requirement ID');
    if (count($expectedIds) !== count(array_unique($expectedIds))) sendResponse(400, [], 'Duplicate attachment requirement.');

    $db->beginTransaction();
    try {
        $lockStmt = $db->prepare('SELECT * FROM applications WHERE id = :id FOR UPDATE');
        $lockStmt->execute([':id' => $appId]);
        $locked = $lockStmt->fetch();
        if (!$locked || (string)$locked['nominator_id'] !== (string)$actor['id']) {
            $db->rollBack();
            sendResponse(403, [], 'Only the original filer can complete this nomination.');
        }
        if ($locked['status'] !== 'Draft') {
            $db->commit();
            sendResponse(200, getFullApplication($db, $appId), 'Nomination was already submitted.');
        }

        $requirementsStmt = $db->prepare('SELECT id, document_name, is_mandatory FROM award_document_requirements WHERE award_id = :award_id');
        $requirementsStmt->execute([':award_id' => $locked['award_id']]);
        $requirements = $requirementsStmt->fetchAll();
        $validIds = array_column($requirements, 'id');
        foreach ($expectedIds as $expectedId) {
            if (!in_array($expectedId, $validIds, true)) {
                $db->rollBack();
                sendResponse(400, [], 'An attachment does not belong to this award.');
            }
        }

        $documentsStmt = $db->prepare('SELECT requirement_id, file_url, file_size FROM application_documents WHERE application_id = :id');
        $documentsStmt->execute([':id' => $appId]);
        $uploadedIds = [];
        foreach ($documentsStmt->fetchAll() as $document) {
            $fileUrl = (string)$document['file_url'];
            if ((int)$document['file_size'] > 0 && document_storage_path($fileUrl) !== null) {
                $uploadedIds[] = $document['requirement_id'];
            }
        }
        foreach ($requirements as $requirement) {
            if ((bool)$requirement['is_mandatory'] && !in_array($requirement['id'], $uploadedIds, true)) {
                $db->rollBack();
                sendResponse(409, [], 'Required attachment is still missing: ' . $requirement['document_name']);
            }
        }
        foreach ($expectedIds as $expectedId) {
            if (!in_array($expectedId, $uploadedIds, true)) {
                $db->rollBack();
                sendResponse(409, [], 'An attachment is still uploading. Please retry submission.');
            }
        }

        if (($data['signature_confirmed'] ?? null) !== true) {
            $db->rollBack();
            sendResponse(400, [], 'Confirm that you are signing personally as the authenticated nominator.');
        }
        try {
            $strokes = validate_signature_strokes($data['signature_strokes'] ?? null);
        } catch (InvalidArgumentException $error) {
            $db->rollBack();
            sendResponse(400, [], $error->getMessage());
        }
        // Keep exactly what was signed, including attachment content digests.
        $documentSnapshot = [];
        $snapshotDocs = $db->prepare('SELECT id, requirement_id, document_name, file_url FROM application_documents WHERE application_id = ? ORDER BY id');
        $snapshotDocs->execute([$appId]);
        foreach ($snapshotDocs->fetchAll() as $document) {
            $path = document_storage_path((string)$document['file_url']);
            $documentSnapshot[] = ['id' => $document['id'], 'requirement_id' => $document['requirement_id'], 'name' => $document['document_name'], 'sha256' => $path && is_file($path) ? hash_file('sha256', $path) : null];
        }
        $locked['documents'] = $documentSnapshot;
        $locked['submission_account_name'] = $actor['full_name'];
        $locked['submission_account_role'] = $actor['role'];
        $locked['signing_account'] = ['id' => $actor['id'], 'name' => $actor['full_name'], 'role' => $actor['role']];
        $strokeJson = json_encode($strokes, JSON_THROW_ON_ERROR);
        $snapshotJson = json_encode($locked, JSON_THROW_ON_ERROR);
        $digest = nomination_signature_digest($strokeJson, $snapshotJson);
        $db->prepare('INSERT INTO nomination_signatures (application_id, account_id, strokes, signed_snapshot, sha256) VALUES (?, ?, ?, ?, ?)')
            ->execute([$appId, $actor['id'], $strokeJson, $snapshotJson, $digest]);
        addHistory($db, $appId, $actor, 'Nomination Signed', 'Draft', 'Draft', 'Personal signing confirmation recorded. SHA-256: ' . $digest);

        $db->prepare("UPDATE applications SET status = 'For Endorsement', processing_stage = 'Endorsement', required_action = :required_action, submission_account_name = :account_name, submission_account_role = :account_role WHERE id = :id")
            ->execute([
                ':required_action' => 'Awaiting endorsement from ' . $locked['office_name'],
                ':account_name' => $actor['full_name'],
                ':account_role' => $actor['role'],
                ':id' => $appId,
            ]);
        addHistory($db, $appId, $actor, 'Nomination Submitted', 'Draft', 'For Endorsement',
            "Nomination created for {$locked['nominee_name']} ({$locked['application_number']}) with required attachments uploaded.");
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendInternalError($e, 'applications.php:complete', 'Failed to complete nomination.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Nomination submitted successfully.');
}

function handle_resubmit(PDO $db, array $actor, array $data, string $appId, array $current): void {
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
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:resubmit', 'Failed to resubmit nomination.');
    }

    sendResponse(200, getFullApplication($db, $appId), 'Nomination resubmitted successfully.');
}

function handle_return_for_revision(PDO $db, array $actor, array $data, string $appId, array $current): void {
    $allowedReturnRoles = [
        'Endorsement' => ['HEAD_OF_OFFICE', 'ADMINISTRATOR'],
        'Document Verification' => ['SECRETARIAT', 'ADMINISTRATOR'],
        'Evaluation' => ['EVALUATOR', 'ADMINISTRATOR'],
    ];
    if (!isset($allowedReturnRoles[$current['processing_stage']]) || !in_array($actor['role'], $allowedReturnRoles[$current['processing_stage']], true)) {
        sendResponse(403, [], 'Your role is not assigned to return this nomination at its current stage.');
    }
    if ($actor['role'] === 'HEAD_OF_OFFICE'
        && (empty($actor['office_id']) || $current['office_id'] !== $actor['office_id'])) {
        sendResponse(403, [], 'You can only return nominations from your assigned office.');
    }
    if ($actor['role'] === 'EVALUATOR'
        && !canViewApplication($current, $actor)) {
        sendResponse(403, [], 'This nomination is not assigned to your evaluator account.');
    }
    $activeReturnStatuses = [
        'Endorsement' => ['For Endorsement', 'Submitted'],
        'Document Verification' => ['Endorsed', 'For Verification', 'Incomplete', 'Verified'],
        'Evaluation' => ['For Evaluation', 'Under Evaluation'],
    ];
    if (!in_array($current['status'], $activeReturnStatuses[$current['processing_stage']], true)) {
        sendResponse(409, [], 'This nomination is not awaiting action at your stage.');
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
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:return_for_revision', 'Failed to return application for revision.');
    }

    sendResponse(200, redact_nominator_for_evaluator(getFullApplication($db, $appId), $actor), 'Application returned for revision.');
}

function validate_application_create_data(PDO $db, array $actor, array $data): array {
    requireFields($data, ['award_id', 'award_year', 'nominee_id', 'nominee_name', 'employee_id', 'position_title', 'office_id', 'division_section', 'employment_category', 'contact_number', 'email', 'barangay', 'nomination_type', 'justification', 'accomplishments', 'supporting_narrative', 'date_of_nomination', 'submission_id', 'documents', 'nominator_name', 'nominator_position', 'nominating_office_id', 'self_nomination']);

    if (empty($data['award_id']) || empty($data['nominee_name']) || empty($data['office_id'])) {
        sendResponse(400, [], 'Missing required fields: award_id, nominee_name, office_id.');
    }
    if (!empty($data['documents'])) {
        sendResponse(400, [], 'Upload nomination attachments through the documents endpoint.');
    }
    $data['award_id'] = requireId($data['award_id'], 'award ID');
    $data['office_id'] = requireId($data['office_id'], 'office ID');
    $data['nominee_name'] = requireText($data['nominee_name'], 'nominee name', 255, true);
    if (isset($data['nominee_id'])) $data['nominee_id'] = optionalId($data['nominee_id'], 'nominee ID');
    if (isset($data['award_year'])) $data['award_year'] = requireIntRange($data['award_year'], 'award year', 2020, 2100);
    if (isset($data['date_of_nomination'])) requireDate($data['date_of_nomination'], 'nomination date');
    if (!empty($data['email'])) requireEmail($data['email']);
    if (isset($data['employment_category']) && !in_array($data['employment_category'], ['Permanent', 'Casual', 'Contractual', 'Job Order', 'Barangay Official', 'Barangay Worker'], true)) sendResponse(400, [], 'Invalid employment category.');
    if (isset($data['nomination_type']) && !in_array($data['nomination_type'], ['Individual', 'Group / Team'], true)) sendResponse(400, [], 'Invalid nomination type.');
    foreach (['employee_id' => 50, 'position_title' => 255, 'division_section' => 255, 'employment_category' => 100, 'contact_number' => 50, 'barangay' => 255, 'nomination_type' => 50, 'justification' => 65535, 'accomplishments' => 65535, 'supporting_narrative' => 65535] as $field => $max) {
        if (isset($data[$field])) requireText($data[$field], $field, $max);
    }
    $officeStmt = $db->prepare('SELECT name FROM offices WHERE id = :id AND is_active = 1');
    $officeStmt->execute([':id' => $data['office_id']]);
    $officeName = $officeStmt->fetchColumn();
    if ($officeName === false) sendResponse(400, [], 'Office not found.');
    $data['office_name'] = $officeName;
    $data['nominator_name'] = trim(requireText($data['nominator_name'] ?? '', 'nominator name', 255, true));
    $data['nominator_position'] = trim(requireText($data['nominator_position'] ?? '', 'nominator position', 255));
    $data['nominating_office_id'] = requireId($data['nominating_office_id'] ?? null, 'nominator office ID');
    $officeStmt->execute([':id' => $data['nominating_office_id']]);
    $data['nominating_office'] = $officeStmt->fetchColumn();
    if ($data['nominating_office'] === false) sendResponse(400, [], 'Nominator office is inactive or not found.');
    foreach (['position_title', 'contact_number', 'email', 'justification', 'accomplishments', 'supporting_narrative'] as $required) {
        requireText($data[$required] ?? '', $required, 65535, true);
    }
    $self = requireBool($data['self_nomination'] ?? false, 'self_nomination');
    if ($self && ($data['nomination_type'] ?? 'Individual') !== 'Individual') sendResponse(400, [], 'Self-nomination requires an individual nominee.');
    if ($self && !empty($data['nominee_id']) && $data['nominee_id'] !== $actor['id']) sendResponse(400, [], 'Self-nomination must reference your own account.');
    $data['nominee_id'] = $self ? $actor['id'] : ($data['nominee_id'] ?? null);
    if (!$self && $data['nominee_id'] === $actor['id']) sendResponse(400, [], 'Confirm self-nomination when nominating yourself.');
    $data['nomination_origin'] = $self ? 'Self-Nominated' : 'Nominated by Others';
    if (!empty($data['nominee_id'])) {
        $nomineeStmt = $db->prepare('SELECT full_name FROM profiles WHERE id = :id AND is_active = 1');
        $nomineeStmt->execute([':id' => $data['nominee_id']]);
        $nomineeName = $nomineeStmt->fetchColumn();
        if ($nomineeName === false) sendResponse(400, [], 'Nominee account not found.');
        $data['nominee_name'] = $nomineeName;
    }

    return [$data, $officeName];
}

function handle_create_application(PDO $db, array $actor, array $data): void {
    [$data, $officeName] = validate_application_create_data($db, $actor, $data);

    $submissionId = $data['submission_id'] ?? '';
    if (!is_string($submissionId)) sendResponse(400, [], 'Invalid submission ID.');
    if ($submissionId !== '' && !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i', $submissionId)) {
        sendResponse(400, [], 'Invalid submission ID.');
    }
    $appId = $submissionId !== '' ? 'app-' . strtolower($submissionId) : 'app-' . time() . '-' . rand(100, 999);
    if ($submissionId !== '') {
        $existing = findSubmittedNomination($db, $appId, $actor, $data);
        if ($existing) {
            sendResponse(200, $existing, $existing['status'] === 'Draft'
                ? 'Nomination draft already exists. Continue uploading attachments.'
                : 'Nomination was already submitted.');
        }
    }

    $db->beginTransaction();
    try {
        $year = $data['award_year'] ?? (int)date('Y');

        $stmtCount = $db->query("SELECT COUNT(*) FROM applications");
        $totalCount = (int)$stmtCount->fetchColumn() + 1;
        $numberExists = $db->prepare('SELECT 1 FROM applications WHERE application_number = :number LIMIT 1');
        do {
            $appNumber = "PRAISE-{$year}-" . str_pad((string)$totalCount++, 5, '0', STR_PAD_LEFT);
            $numberExists->execute([':number' => $appNumber]);
        } while ($numberExists->fetchColumn() !== false);

        $stmtAward = $db->prepare("SELECT name FROM awards WHERE id = :id");
        $stmtAward->execute([':id' => $data['award_id']]);
        $awardName = $stmtAward->fetchColumn();
        if ($awardName === false) {
            $db->rollBack();
            sendResponse(400, [], 'Award not found.');
        }

        $stmt = $db->prepare("
            INSERT INTO applications (
                id, application_number, award_id, award_name, award_year, nominee_id, nominee_name, employee_id,
                position_title, office_id, office_name, division_section, employment_category, contact_number, email,
                barangay, nomination_type, nominator_id, nominator_name, nominator_position, nominating_office,
                nominating_office_id, nomination_origin, submission_account_name, submission_account_role,
                justification, accomplishments, supporting_narrative, date_of_nomination, status, processing_stage,
                required_action
            ) VALUES (
                :id, :application_number, :award_id, :award_name, :award_year, :nominee_id, :nominee_name, :employee_id,
                :position_title, :office_id, :office_name, :division_section, :employment_category, :contact_number, :email,
                :barangay, :nomination_type, :nominator_id, :nominator_name, :nominator_position, :nominating_office,
                :nominating_office_id, :nomination_origin, :submission_account_name, :submission_account_role,
                :justification, :accomplishments, :supporting_narrative, :date_of_nomination, :status, :processing_stage,
                :required_action
            )
        ");

        $requiredAction = 'Finish uploading nomination attachments.';
        $stmt->execute([
            ':id' => $appId,
            ':application_number' => $appNumber,
            ':award_id' => $data['award_id'],
            ':award_name' => $awardName,
            ':award_year' => $year,
            ':nominee_id' => $data['nominee_id'],
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
            ':nominator_name' => $data['nominator_name'],
            ':nominator_position' => $data['nominator_position'],
            ':nominating_office' => $data['nominating_office'],
            ':nominating_office_id' => $data['nominating_office_id'],
            ':nomination_origin' => $data['nomination_origin'],
            ':submission_account_name' => $actor['full_name'],
            ':submission_account_role' => $actor['role'],
            ':justification' => $data['justification'] ?? '',
            ':accomplishments' => $data['accomplishments'] ?? '',
            ':supporting_narrative' => $data['supporting_narrative'] ?? '',
            ':date_of_nomination' => $data['date_of_nomination'] ?? date('Y-m-d'),
            ':status' => 'Draft',
            ':processing_stage' => 'Submitted',
            ':required_action' => $requiredAction,
        ]);

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        if ($submissionId !== '') {
            $existing = findSubmittedNomination($db, $appId, $actor, $data);
            if ($existing) {
                sendResponse(200, $existing, $existing['status'] === 'Draft'
                    ? 'Nomination draft already exists. Continue uploading attachments.'
                    : 'Nomination was already submitted.');
            }
        }
        sendInternalError($e, 'applications.php:create', 'Failed to create nomination.');
    }

    sendResponse(201, getFullApplication($db, $appId), 'Nomination draft created. Upload attachments to complete submission.');
}

function handle_delete_application(PDO $db, string $appId): void {
    if ($appId === '') {
        sendResponse(400, [], 'Application ID is required.');
    }

    $application = getFullApplication($db, $appId);
    if (!$application) {
        sendResponse(404, [], 'Application not found.');
    }

    // Resolve database references before deleting records; never use client paths.
    $localUploadPaths = [];
    $fileStmt = $db->prepare('SELECT file_url FROM application_documents WHERE application_id = :id');
    $fileStmt->execute([':id' => $appId]);
    foreach ($fileStmt->fetchAll(PDO::FETCH_COLUMN) as $reference) {
        $path = document_storage_path((string)$reference);
        if ($path !== null) $localUploadPaths[] = $path;
    }

    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM notifications WHERE application_id = :application_id')
            ->execute([':application_id' => $appId]);

        $db->prepare('DELETE FROM applications WHERE id = :id')
            ->execute([':id' => $appId]);

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        sendInternalError($e, 'applications.php:delete', 'Failed to delete nomination.');
    }

    foreach (array_unique($localUploadPaths) as $filePath) {
        if (is_file($filePath)) {
            if (!@unlink($filePath)) error_log('[applications.php:delete] Unable to remove nomination upload.');
        }
    }

    sendResponse(200, ['id' => $appId], 'Nomination deleted.');
}
