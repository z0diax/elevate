<?php
declare(strict_types=1);

require_once __DIR__ . '/NominationRevisionPolicy.php';
require_once __DIR__ . '/ApplicationHistory.php';

const REVISION_DETAIL_FIELDS = [
    'award_id', 'nominee_name', 'employee_id', 'position_title', 'office_id', 'division_section',
    'employment_category', 'contact_number', 'email', 'barangay', 'nomination_type', 'nominator_name',
    'nominator_position', 'nominating_office_id', 'justification', 'accomplishments', 'supporting_narrative',
];

function revision_rows(PDO $db, string $sql, string $id): array {
    $stmt = $db->prepare($sql);
    $stmt->execute([$id]);
    return $stmt->fetchAll();
}

function revision_json(mixed $value): string {
    return json_encode($value, JSON_THROW_ON_ERROR);
}

function notify_nomination_revision(PDO $db, array $application, ?string $user, ?string $role, string $title, string $message, string $tab): void {
    if (!$user && !$role) return;
    $db->prepare('INSERT INTO notifications (id, user_id, target_role, application_id, application_number, title, message, link_tab) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute(['notification-' . bin2hex(random_bytes(16)), $user, $role, $application['id'], $application['application_number'], $title, $message, $tab]);
}

function revision_filer_tab(array $application): string {
    return $application['submission_account_role'] === 'NOMINEE' ? 'my-applications' : 'new-nomination';
}

function revision_draft_payload(PDO $db, array $request): array {
    $changes = [];
    foreach (revision_rows($db, 'SELECT * FROM nomination_revision_files WHERE revision_id = ?', $request['id']) as $file) {
        $document = json_decode($file['document'] ?? 'null', true, 512, JSON_THROW_ON_ERROR);
        if ($document) {
            $document['file_url'] = nomination_document_url($file['id'], 'revision');
        }
        $changes[$file['attachment_key']] = $document;
    }
    return [
        'request' => revision_request_summary($request),
        'details' => json_decode($request['draft_details'] ?? '{}', false, 512, JSON_THROW_ON_ERROR),
        'remarks' => $request['draft_remarks'] ?? '',
        'attachments' => (object)$changes,
        'generation' => (int)$request['draft_generation'],
    ];
}

function revision_workflow_snapshot(PDO $db, string $appId): array {
    return [
        'endorsements' => revision_rows($db, 'SELECT * FROM endorsements WHERE application_id = ?', $appId),
        'assignments' => revision_rows($db, 'SELECT * FROM application_evaluator_assignments WHERE application_id = ?', $appId),
        'evaluations' => revision_rows($db, 'SELECT * FROM evaluations WHERE application_id = ?', $appId),
        'scores' => revision_rows($db, 'SELECT s.* FROM evaluation_scores s JOIN evaluations e ON s.evaluation_id = e.id WHERE e.application_id = ?', $appId),
        'evaluation_revisions' => revision_rows($db, 'SELECT * FROM evaluation_revision_history WHERE application_id = ?', $appId),
    ];
}

function revision_details(PDO $db, array $application, array $actor, array $draft): array {
    $details = array_replace(array_intersect_key($application, array_flip(REVISION_DETAIL_FIELDS)), $draft);
    // Account links and the original classification are fixed across revisions.
    // Legacy nominations can have a recorded office name but no office account link.
    $legacyOffice = empty($application['nominating_office_id']) && empty($details['nominating_office_id']);
    if ($legacyOffice) $details['nominating_office_id'] = $details['office_id'];
    $details['self_nomination'] = $application['nomination_origin'] === 'Self-Nominated'
        || $application['nominee_id'] === $actor['id'];
    $details['nominee_id'] = $application['nominee_id'];
    [$validated] = validate_application_create_data($db, $actor, $details);
    if ($application['nominee_id']) $validated['nominee_name'] = $application['nominee_name'];
    if (empty($application['nomination_origin']) && $legacyOffice) {
        $validated['nominating_office_id'] = null;
        $validated['nominating_office'] = $application['nominating_office'];
    }
    $award = $db->prepare('SELECT name FROM awards WHERE id = ? AND (is_active = 1 OR id = ?) FOR UPDATE');
    $award->execute([$validated['award_id'], $application['award_id']]);
    $validated['award_name'] = $award->fetchColumn();
    if ($validated['award_name'] === false) reject_nomination_change($db, 400, 'Select an available award.');
    return array_intersect_key($validated, array_flip(array_merge(REVISION_DETAIL_FIELDS, ['office_name', 'award_name', 'nominating_office'])));
}

function revision_final_documents(PDO $db, array $application, array $details, array $request, array $official): array {
    $awardId = $details['award_id'] ?? $application['award_id'];
    $requirements = array_column(revision_rows($db, 'SELECT * FROM award_document_requirements WHERE award_id = ? FOR UPDATE', $awardId), null, 'id');
    $files = array_column(revision_rows($db, 'SELECT * FROM nomination_revision_files WHERE revision_id = ?', $request['id']), 'document', 'attachment_key');
    $documents = [];
    foreach ($official as $document) {
        $requirementId = $document['requirement_id'];
        if (($requirementId && !isset($requirements[$requirementId])) || (!$requirementId && $awardId !== $application['award_id'])) {
            if ($request['scope'] === 'details') reject_nomination_change($db, 409, 'The new award requires attachment changes. Ask the Administrator for a revision scope that includes attachments.');
            continue;
        }
        if (!array_key_exists($requirementId ?? ('document:' . $document['id']), $files)) $documents[$document['id']] = $document;
    }
    foreach ($files as $requirementId => $file) {
        if (!isset($requirements[$requirementId])) continue; // Draft files for an earlier award selection.
        if ($file !== null) {
            $document = json_decode($file, true, 512, JSON_THROW_ON_ERROR);
            $documents[$document['id']] = $document;
        }
    }
    $snapshot = [];
    foreach ($documents as $document) {
        if ($document['file_url'] === '') continue;
        $path = document_storage_path($document['file_url']);
        $hash = $path && (int)$document['file_size'] === filesize($path) ? hash_file('sha256', $path) : false;
        if (!$hash || (isset($document['sha256']) && !hash_equals($document['sha256'], $hash))) {
            reject_nomination_change($db, 409, 'Upload a valid copy of ' . $document['document_name'] . ' before signing.');
        }
        $snapshot[] = ['id' => $document['id'], 'requirement_id' => $document['requirement_id'], 'name' => $document['document_name'], 'sha256' => $hash];
    }
    foreach ($requirements as $requirement) {
        if ($requirement['is_mandatory'] && !in_array($requirement['id'], array_column($snapshot, 'requirement_id'), true)) {
            $message = 'Required attachment is missing: ' . $requirement['document_name'];
            if ($request['scope'] === 'details') $message .= '. Ask the Administrator to authorize attachment changes.';
            reject_nomination_change($db, 409, $message);
        }
    }
    return [$documents, $snapshot];
}

function save_revision_document(PDO $db, array $document): void {
    $columns = ['id', 'application_id', 'requirement_id', 'document_name', 'file_name', 'file_url', 'file_size', 'file_type',
        'status', 'verification_remarks', 'verified_by', 'verified_at', 'uploaded_at'];
    $markers = implode(', ', array_fill(0, count($columns), '?'));
    $db->prepare('INSERT INTO application_documents (' . implode(', ', $columns) . ") VALUES ($markers)")
        ->execute(array_map(static fn($column) => $document[$column] ?? null, $columns));
}

function finalize_nomination_revision(PDO $db, array $application, array $request, array $actor, array $data): void {
    if (($data['signature_confirmed'] ?? null) !== true) reject_nomination_change($db, 400, 'Confirm that you are signing personally as the authenticated filer.');
    try {
        $strokes = validate_signature_strokes($data['signature_strokes'] ?? null);
    } catch (InvalidArgumentException $error) {
        reject_nomination_change($db, 400, $error->getMessage());
    }
    $appId = $application['id'];
    $draft = json_decode($request['draft_details'] ?? '{}', true, 512, JSON_THROW_ON_ERROR);
    $details = $request['scope'] === 'attachments' ? [] : revision_details($db, $application, $actor, $draft);
    $official = revision_rows($db, 'SELECT * FROM application_documents WHERE application_id = ? ORDER BY id', $appId);
    [$documents, $documentSnapshot] = revision_final_documents($db, $application, $details, $request, $official);
    $workflow = revision_workflow_snapshot($db, $appId);

    $previousVersion = nomination_version_number($db, $appId);
    $previous = getFullApplication($db, $appId);
    unset($previous['revision_request'], $previous['can_require_revision'], $previous['can_correct'], $previous['revision_active']);
    $previous['status'] = $request['previous_status'];
    $previous['required_action'] = $request['previous_action'];
    $previous['updated_at'] = $request['previous_updated_at'] ?? $previous['updated_at'];
    $previous['documents'] = [];
    foreach ($official as $document) {
        $archiveId = archive_nomination_document($db, $document);
        $document['file_url'] = $document['file_url'] === '' ? '' : nomination_document_url($archiveId, 'history');
        $previous['documents'][] = $document;
    }
    $db->prepare('INSERT INTO nomination_versions (application_id, version_number, nomination, workflow) VALUES (?, ?, ?, ?)')
        ->execute([$appId, $previousVersion, revision_json($previous), revision_json($workflow)]);

    $oldByRequirement = array_column(array_filter($official, static fn($document) => $document['requirement_id'] !== null), null, 'requirement_id');
    $newByRequirement = array_column(array_filter($documents, static fn($document) => $document['requirement_id'] !== null), null, 'requirement_id');
    $changed = array_column($official, 'file_url', 'id') != array_column($documents, 'file_url', 'id');
    $application['endorsement'] = current_nomination_endorsement($db, $appId);
    // The Head of Office explicitly inspects every attachment before endorsing.
    $retainEndorsement = $request['scope'] === 'attachments' && !$changed && has_valid_nomination_endorsement($application);
    $status = $retainEndorsement ? 'For Verification' : 'For Endorsement';
    $stage = $retainEndorsement ? 'Document Verification' : 'Endorsement';
    $db->prepare('DELETE FROM application_documents WHERE application_id = ?')->execute([$appId]);
    foreach ($documents as $document) {
        if ($document['file_url'] !== '' && (!$retainEndorsement || isset($document['sha256']))) {
            $document['status'] = $retainEndorsement ? 'For Verification' : 'Submitted';
            $document['verification_remarks'] = $document['verified_by'] = $document['verified_at'] = null;
        }
        save_revision_document($db, $document);
    }
    // Move superseded decisions out of active workflow queries after retaining complete copies above.
    foreach (['evaluations', 'application_evaluator_assignments'] as $table) {
        $db->prepare("DELETE FROM $table WHERE application_id = ?")->execute([$appId]);
    }
    if (!$retainEndorsement) $db->prepare('DELETE FROM endorsements WHERE application_id = ?')->execute([$appId]);

    $updated = array_merge($details, [
        'status' => $status, 'processing_stage' => $stage, 'remarks' => $data['remarks'] ?? null,
        'required_action' => $retainEndorsement ? 'Awaiting Secretariat document verification.' : 'Awaiting Head of Office endorsement.',
        'final_weighted_score' => null, 'assigned_evaluators' => null, 'deliberation_remarks' => null,
        'deliberation_decision' => null, 'deliberation_date' => null,
    ]);
    $sets = array_map(static fn($key) => "$key = ?", array_keys($updated));
    $db->prepare('UPDATE applications SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?')
        ->execute([...array_values($updated), $appId]);

    $signedAt = (string)$db->query('SELECT UTC_TIMESTAMP()')->fetchColumn();
    $snapshot = array_replace($application, $updated);
    unset($snapshot['endorsement']);
    $snapshot['version_number'] = $previousVersion + 1;
    $snapshot['signed_at'] = $signedAt;
    $snapshot['signature_confirmed'] = true;
    $snapshot['documents'] = $documentSnapshot;
    $snapshot['signing_account'] = ['id' => $actor['id'], 'name' => $actor['full_name'], 'role' => $actor['role']];
    $snapshotJson = revision_json($snapshot);
    $strokeJson = revision_json($strokes);
    $db->prepare('INSERT INTO nomination_revision_signatures (application_id, version_number, account_id, strokes, signed_snapshot, sha256, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$appId, $previousVersion + 1, $actor['id'], $strokeJson, $snapshotJson, nomination_signature_digest($strokeJson, $snapshotJson), $signedAt]);

    $events = ['Nomination Re-signed'];
    if (array_diff_assoc($details, array_intersect_key($application, $details))) $events[] = 'Nomination Details Revised';
    foreach ($oldByRequirement as $key => $old) {
        if (!isset($newByRequirement[$key])) $events[] = 'Attachment Removed';
        elseif ($newByRequirement[$key]['file_url'] !== $old['file_url']) $events[] = 'Attachment Replaced';
    }
    if (array_diff_key($newByRequirement, $oldByRequirement)) $events[] = 'Attachment Added';
    foreach ($official as $document) {
        if (!$document['requirement_id'] && !isset($documents[$document['id']])) $events[] = 'Attachment Removed';
    }
    if (!$retainEndorsement && $workflow['endorsements']) $events[] = 'Previous Endorsement Superseded';
    if (!$retainEndorsement && array_filter(array_column($official, 'verified_at'))) $events[] = 'Previous Verification Superseded';
    if ($workflow['evaluations'] || $workflow['assignments']) $events[] = 'Previous Evaluation Superseded';
    foreach (array_unique($events) as $event) addHistory($db, $appId, $actor, $event, 'Returned for Revision', $status, 'Nomination version ' . ($previousVersion + 1));
    addHistory($db, $appId, $actor, 'Revised Nomination Submitted', 'Returned for Revision', $status, 'Nomination version ' . ($previousVersion + 1));
    $db->prepare("UPDATE nomination_revision_requests SET status = 'Completed', completed_by = ?, completed_at = NOW(), remarks = ?, draft_details = NULL, draft_remarks = NULL WHERE id = ?")
        ->execute([$actor['id'], $data['remarks'] ?? null, $request['id']]);

    $title = 'Revised Nomination Submitted';
    $message = 'Nomination ' . $application['application_number'] . ' has been revised and resubmitted for processing.';
    notify_nomination_revision($db, $application, $request['requested_by'], null, $title, $message, 'all-applications');
    if ($retainEndorsement) {
        $secretariat = $db->query("SELECT id FROM profiles WHERE role = 'SECRETARIAT' AND is_active = 1")->fetchAll();
        foreach ($secretariat as $recipient) notify_nomination_revision($db, $application, $recipient['id'], null, $title, $message, 'verification');
    } else {
        $heads = revision_rows($db, "SELECT DISTINCT p.id FROM profiles p LEFT JOIN profile_offices po ON po.profile_id = p.id WHERE p.role = 'HEAD_OF_OFFICE' AND p.is_active = 1 AND COALESCE(po.office_id, p.office_id) = ?", (string)($updated['office_id'] ?? $application['office_id']));
        foreach ($heads as $head) notify_nomination_revision($db, $application, $head['id'], null, $title, $message, 'endorsements');
    }
    clean_revision_files($db, $request['id'], array_column($documents, 'file_url'));
}

function clean_revision_files(PDO $db, string $requestId, array $promoted = []): void {
    foreach (revision_rows($db, 'SELECT document FROM nomination_revision_files WHERE revision_id = ?', $requestId) as $file) {
        if ($file['document'] === null) continue;
        $reference = json_decode($file['document'], true, 512, JSON_THROW_ON_ERROR)['file_url'];
        if (!in_array($reference, $promoted, true)) queue_revision_file_cleanup($db, $reference);
    }
    $db->prepare('DELETE FROM nomination_revision_files WHERE revision_id = ?')->execute([$requestId]);
}

function queue_revision_file_cleanup(PDO $db, string $reference): void {
    if (database_file_storage()) database_delete_file($db, $reference);
    else register_shutdown_function(static function () use ($db, $reference): void {
        if (!$db->inTransaction() && http_response_code() < 400) discard_revision_file($db, $reference);
    });
}

function handle_nomination_revision(PDO $db, array $actor, array $data, string $appId, string $action): void {
    $administrative = in_array($action, ['require_nomination_revision', 'cancel_nomination_revision'], true);
    if ($administrative && $actor['role'] !== 'ADMINISTRATOR') sendResponse(403, [], 'Only an Administrator can manage revision requests.');

    $result = null;
    $db->beginTransaction();
    try {
        $application = lock_nomination($db, $appId);
        $reference = $application['application_number'];
        if ($action === 'require_nomination_revision') {
            if ($application['archived_at'] !== null) {
                reject_nomination_change($db, 409, 'Restore this nomination before requesting a revision.');
            }
            guard_nomination_processing($db, $application);
            $application['endorsement'] = current_nomination_endorsement($db, $appId);
            if (!$application['nominator_id'] || !nomination_revision_eligible($application)) {
                reject_nomination_change($db, 409, 'This nomination cannot be returned for an Administrator-required revision.');
            }
            $scope = $data['scope'] ?? '';
            if (!in_array($scope, ['details', 'attachments', 'both'], true)) reject_nomination_change($db, 400, 'Select a valid revision scope.');
            $instructions = trim(requireText($data['instructions'] ?? '', 'revision instructions', 4000, true));
            $latest = nomination_revision($db, $appId, false);
            $db->prepare('INSERT INTO nomination_revision_requests (id, application_id, revision_number, requested_by, requested_by_name, requested_by_role, instructions, scope, previous_status, previous_stage, previous_action, previous_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute(['revision-' . bin2hex(random_bytes(16)), $appId, (int)($latest['revision_number'] ?? 0) + 1, $actor['id'],
                    $actor['full_name'], $actor['role'], $instructions, $scope, $application['status'], $application['processing_stage'], $application['required_action'], $application['updated_at']]);
            $db->prepare("UPDATE applications SET status = 'Returned for Revision', required_action = ? WHERE id = ?")->execute([REVISION_SUSPENDED, $appId]);
            addHistory($db, $appId, $actor, 'Nomination Revision Required', $application['status'], 'Returned for Revision', 'Scope: ' . $scope);
            notify_nomination_revision($db, $application, $application['nominator_id'], null, 'Nomination Revision Required',
                "The Administrator has returned your nomination $reference for revision. Please review the instructions, make the necessary corrections, and resubmit your nomination.", revision_filer_tab($application));
        } elseif ($action === 'cancel_nomination_revision') {
            $request = nomination_revision($db, $appId);
            if (!$request || $request['id'] !== ($data['revision_id'] ?? null)) reject_nomination_change($db, 409, 'This revision request is no longer active.');
            $previous = array_replace($application, [
                'status' => $request['previous_status'],
                'processing_stage' => $request['previous_stage'],
                'endorsement' => current_nomination_endorsement($db, $appId),
            ]);
            if (!nomination_revision_eligible($previous)
                || $application['status'] !== 'Returned for Revision' || $application['processing_stage'] !== $request['previous_stage']
                || $application['award_date'] || $application['deliberation_decision'] || $application['required_action'] !== REVISION_SUSPENDED) {
                reject_nomination_change($db, 409, 'The workflow state changed. Review the current nomination before restoring processing.');
            }
            $reason = trim(requireText($data['reason'] ?? '', 'cancellation reason', 4000, true));
            $db->prepare('UPDATE applications SET status = ?, processing_stage = ?, required_action = ? WHERE id = ?')
                ->execute([$request['previous_status'], $request['previous_stage'], $request['previous_action'], $appId]);
            $db->prepare("UPDATE nomination_revision_requests SET status = 'Cancelled', cancelled_by = ?, cancelled_at = NOW(), cancellation_reason = ?, draft_details = NULL, draft_remarks = NULL WHERE id = ?")
                ->execute([$actor['id'], $reason, $request['id']]);
            clean_revision_files($db, $request['id']);
            addHistory($db, $appId, $actor, 'Nomination Revision Cancelled', 'Returned for Revision', $request['previous_status']);
            notify_nomination_revision($db, $application, $application['nominator_id'], null, 'Nomination Revision Cancelled',
                "The Administrator has cancelled the revision request for nomination $reference. Your previously submitted nomination remains on record.", revision_filer_tab($application));
        } else {
            $request = for_nomination_edit($db, $application, $actor, requireId($data['revision_id'] ?? '', 'revision ID'));
            start_nomination_revision($db, $request, $application, $actor);
            if ($action !== 'start_nomination_revision') {
                $generation = requireIntRange($data['generation'] ?? -1, 'revision draft generation', 0, PHP_INT_MAX);
                if ($generation !== (int)$request['draft_generation']) reject_nomination_change($db, 409, 'The draft changed in another session. Reopen the revision to load the latest draft.');
                if ($action === 'save_nomination_revision') {
                    $draftDetails = $request['draft_details'];
                    if (array_key_exists('details', $data)) {
                        $draft = $data['details'];
                        if ($request['scope'] === 'attachments') reject_nomination_change($db, 403, 'This revision does not authorize nomination details changes.');
                        if (!is_array($draft)) reject_nomination_change($db, 400, 'Provide a valid nomination details object.');
                        requireFields($draft, REVISION_DETAIL_FIELDS);
                        foreach ($draft as $field => $value) $draft[$field] = requireText($value, $field, 65535);
                        if ($application['nominee_id'] && isset($draft['nominee_name'])) reject_nomination_change($db, 400, 'The name is linked to the nominee account.');
                        $draftDetails = revision_json((object)$draft);
                    }
                    $db->prepare('UPDATE nomination_revision_requests SET draft_details = ?, draft_remarks = ?, draft_generation = draft_generation + 1 WHERE id = ?')
                        ->execute([$draftDetails, $data['remarks'] ?? $request['draft_remarks'], $request['id']]);
                } elseif ($action === 'remove_revision_attachment') {
                    if ($request['scope'] === 'details') reject_nomination_change($db, 403, 'Attachment changes are outside the revision scope.');
                    if (isset($data['document_id'])) {
                        if (isset($data['requirement_id'])) reject_nomination_change($db, 400, 'Specify one attachment to remove.');
                        $document = $db->prepare('SELECT id, requirement_id FROM application_documents WHERE application_id = ? AND id = ?');
                        $document->execute([$appId, $data['document_id']]);
                        $legacy = $document->fetch();
                        if (!$legacy) reject_nomination_change($db, 404, 'Attachment not found.');
                        if ($legacy['requirement_id']) reject_nomination_change($db, 400, 'Remove a linked attachment by its requirement.');
                        $attachmentKey = 'document:' . $legacy['id'];
                    } else {
                        $attachmentKey = requireId($data['requirement_id'] ?? '', 'requirement ID');
                        $requirement = revision_attachment_requirement($db, $application, $request, $attachmentKey);
                        if ($requirement['is_mandatory']) reject_nomination_change($db, 409, 'Required attachments can only be replaced.');
                    }
                    set_revision_attachment($db, $request, $attachmentKey, null);
                } else {
                    $data['remarks'] ??= $request['draft_remarks'];
                    finalize_nomination_revision($db, $application, $request, $actor, $data);
                }
            }
        }
        $request = !$administrative ? nomination_revision($db, $appId) : null;
        $result = [
            'application' => application_for_actor(getFullApplication($db, $appId), $actor),
            'draft' => $request ? revision_draft_payload($db, $request) : null,
        ];
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        sendInternalError($error, 'nomination revision', 'Unable to complete the nomination revision action.');
    }
    sendResponse(200, $result);
}

function start_nomination_revision(PDO $db, array $request, array $application, array $actor): void {
    if ($request['status'] !== 'Pending') return;
    $db->prepare("UPDATE nomination_revision_requests SET status = 'In Progress', started_at = NOW() WHERE id = ?")->execute([$request['id']]);
    addHistory($db, $application['id'], $actor, 'Nomination Revision Started', $application['status'], $application['status']);
}

function revision_attachment_requirement(PDO $db, array $application, array $request, string $requirementId): array {
    $details = json_decode($request['draft_details'] ?? '{}', true, 512, JSON_THROW_ON_ERROR);
    $stmt = $db->prepare('SELECT * FROM award_document_requirements WHERE id = ? AND award_id = ?' . ($db->inTransaction() ? ' FOR UPDATE' : ''));
    $stmt->execute([$requirementId, $details['award_id'] ?? $application['award_id']]);
    $requirement = $stmt->fetch();
    if (!$requirement) reject_nomination_change($db, 400, 'This attachment requirement does not belong to the selected award.');
    return $requirement;
}

function set_revision_attachment(PDO $db, array $request, string $attachmentKey, ?array $document): string {
    $stmt = $db->prepare('SELECT document FROM nomination_revision_files WHERE revision_id = ? AND attachment_key = ?');
    $stmt->execute([$request['id'], $attachmentKey]);
    $previous = $stmt->fetchColumn();
    if (is_string($previous)) queue_revision_file_cleanup($db, json_decode($previous, true, 512, JSON_THROW_ON_ERROR)['file_url']);
    $id = 'revision-file-' . bin2hex(random_bytes(16));
    $db->prepare('INSERT INTO nomination_revision_files (id, revision_id, attachment_key, document) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=VALUES(id), document=VALUES(document)')
        ->execute([$id, $request['id'], $attachmentKey, $document ? revision_json($document) : null]);
    $db->prepare("UPDATE nomination_revision_requests SET draft_generation = draft_generation + 1 WHERE id = ?")
        ->execute([$request['id']]);
    return $id;
}

function signed_nomination_documents(PDO $db, string $appId, array $snapshots, ?array $historicalDocuments = null): array {
    $documents = array_column(revision_rows($db, 'SELECT * FROM application_documents WHERE application_id = ?', $appId), null, 'id');
    $result = [];
    foreach ($snapshots as $snapshot) {
        $document = $documents[$snapshot['id']] ?? null;
        $path = $document ? document_storage_path($document['file_url']) : null;
        $hash = $snapshot['sha256'] ?? null;
        $url = '';
        $matchesOfficial = false;
        if ($hash && $path && hash_file('sha256', $path) === $hash) {
            $url = nomination_document_url($snapshot['id']) . '&sha256=' . $hash;
            $matchesOfficial = true;
        } elseif ($hash) {
            $stmt = $db->prepare('SELECT id, document FROM nomination_document_history WHERE application_id = ? AND document_id = ? AND sha256 = ? ORDER BY archived_at LIMIT 1');
            $stmt->execute([$appId, $snapshot['id'], $hash]);
            $historical = $stmt->fetch();
            if ($historical) {
                $document = json_decode($historical['document'], true, 512, JSON_THROW_ON_ERROR);
                $url = nomination_document_url($historical['id'], 'history');
            }
        }
        if ($historicalDocuments !== null) {
            $official = array_column($historicalDocuments, null, 'id')[$snapshot['id']] ?? null;
            $parameters = [];
            if ($official && $official['file_url']) parse_str((string)parse_url($official['file_url'], PHP_URL_QUERY), $parameters);
            $archiveId = $parameters['id'] ?? null;
            $archived = $archiveId ? revision_rows($db, 'SELECT sha256 FROM nomination_document_history WHERE id = ?', $archiveId)[0] ?? null : null;
            $matchesOfficial = $hash !== null && ($archived['sha256'] ?? null) === $hash;
        }
        $result[] = [
            'id' => $snapshot['id'], 'document_name' => $snapshot['name'], 'requirement_id' => $snapshot['requirement_id'],
            'sha256' => $hash, 'matches_official' => $matchesOfficial, 'file_url' => $url, 'file_size' => $url && $document ? (int)$document['file_size'] : null,
            'file_type' => $url && $document ? $document['file_type'] : null,
        ];
    }
    return $result;
}
