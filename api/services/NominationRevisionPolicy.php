<?php
declare(strict_types=1);

const REVISION_SUSPENDED = 'This nomination is currently undergoing an Administrator-required revision. Processing will resume after the revised nomination has been submitted.';

function nomination_revision(PDO $db, string $applicationId, bool $activeOnly = true): ?array {
    $filter = $activeOnly ? 'active_application_id' : 'application_id';
    $stmt = $db->prepare("SELECT * FROM nomination_revision_requests WHERE $filter = ? ORDER BY revision_number DESC LIMIT 1");
    $stmt->execute([$applicationId]);
    return $stmt->fetch() ?: null;
}

function revision_request_summary(array $request): array {
    return array_diff_key($request, array_flip(['draft_details', 'draft_remarks', 'draft_generation', 'active_application_id', 'previous_action', 'previous_updated_at']));
}

function reject_nomination_change(PDO $db, int $status, string $message): void {
    if ($db->inTransaction()) $db->rollBack();
    sendResponse($status, [], $message);
}

function lock_nomination(PDO $db, string $appId): array {
    $stmt = $db->prepare('SELECT * FROM applications WHERE id = ? FOR UPDATE');
    $stmt->execute([$appId]);
    $application = $stmt->fetch();
    if (!$application) reject_nomination_change($db, 404, 'Application not found.');
    return $application;
}

function guard_nomination_processing(PDO $db, array $application, ?array $expected = null): void {
    if (nomination_revision($db, $application['id'])) reject_nomination_change($db, 409, REVISION_SUSPENDED);
    if ($expected) {
        $keys = array_flip(['status', 'processing_stage', 'office_id', 'award_id', 'updated_at']);
        if (array_intersect_key($application, $keys) != array_intersect_key($expected, $keys)
            || (isset($expected['nomination_version']) && nomination_version_number($db, $application['id']) !== $expected['nomination_version'])) {
            reject_nomination_change($db, 409, 'The nomination has changed. Refresh it before continuing.');
        }
    }
}

function ordinary_correction_eligible(array $application): bool {
    if (!empty($application['award_date']) || !empty($application['deliberation_decision']) || !empty($application['deliberation_date'])) return false;
    return in_array($application['status'], ['Returned for Revision', 'Incomplete'], true)
        || ($application['status'] === 'Not Approved' && ($application['endorsement']['decision'] ?? null) === 'Rejected');
}

function nomination_revision_eligible(array $application): bool {
    return empty($application['award_date']) && empty($application['deliberation_decision']) && empty($application['deliberation_date'])
        && in_array($application['status'], [
            'Submitted', 'For Endorsement', 'Endorsed', 'For Verification', 'Incomplete', 'Verified',
            'For Evaluation', 'Under Evaluation', 'Evaluation Completed', 'Returned for Revision', 'For Deliberation', 'Not Approved',
        ], true)
        && ($application['status'] !== 'Not Approved' || ordinary_correction_eligible($application));
}

function current_nomination_endorsement(PDO $db, string $appId): ?array {
    $stmt = $db->prepare('SELECT * FROM endorsements WHERE application_id = ? ORDER BY created_at DESC, id DESC LIMIT 1');
    $stmt->execute([$appId]);
    return $stmt->fetch() ?: null;
}

function has_valid_nomination_endorsement(array $application): bool {
    return ($application['endorsement']['decision'] ?? null) === 'Endorsed'
        && $application['processing_stage'] !== 'Endorsement';
}

function ordinary_correction_destination(PDO $db, array $application): array {
    if (!has_valid_nomination_endorsement($application)) {
        return ['For Endorsement', 'Endorsement', 'Corrected nomination resubmitted for Head of Office endorsement.'];
    }
    if ($application['processing_stage'] === 'Evaluation') {
        $changed = $db->prepare("SELECT 1 FROM application_documents WHERE application_id = ? AND status = 'For Verification' LIMIT 1");
        $changed->execute([$application['id']]);
        if (!$changed->fetchColumn()) {
            $assignments = $db->prepare("SELECT status FROM application_evaluator_assignments WHERE application_id = ? AND status <> 'Reassigned'");
            $assignments->execute([$application['id']]);
            $statuses = $assignments->fetchAll(PDO::FETCH_COLUMN);
            if ($statuses) {
                $status = array_diff($statuses, ['Pending']) ? 'Under Evaluation' : 'For Evaluation';
                return [$status, 'Evaluation', 'Corrected nomination returned to the assigned evaluators.'];
            }
        }
    }
    return ['For Verification', 'Document Verification', 'Corrected nomination resubmitted for Secretariat document verification.'];
}

function for_nomination_edit(PDO $db, array $application, array $actor, string $expectedId): array {
    if ($application['nominator_id'] !== $actor['id']) {
        reject_nomination_change($db, 403, 'Only the original filer can revise this nomination.');
    }
    $request = nomination_revision($db, $application['id']);
    if (!$request || $request['id'] !== $expectedId || $application['status'] !== 'Returned for Revision') {
        reject_nomination_change($db, 409, 'This revision request is no longer active. Refresh the nomination.');
    }
    return $request;
}

function nomination_document_url(string $id, string $kind = 'current'): string {
    return public_document_url($id) . ($kind === 'current' ? '' : '&source=' . $kind);
}

function archive_nomination_document(PDO $db, array $document): string {
    $id = 'doc-version-' . bin2hex(random_bytes(16));
    $path = document_storage_path($document['file_url']);
    $hash = $path ? hash_file('sha256', $path) : null;
    $db->prepare('INSERT INTO nomination_document_history (id, application_id, document_id, sha256, document) VALUES (?, ?, ?, ?, ?)')
        ->execute([$id, $document['application_id'], $document['id'], $hash ?: null, json_encode($document, JSON_THROW_ON_ERROR)]);
    return $id;
}

function discard_revision_file(PDO $db, string $reference): void {
    if (database_file_storage()) {
        database_delete_file($db, $reference);
    } else {
        $path = document_storage_path($reference);
        if ($path !== null && !unlink($path)) error_log('Unable to remove unused nomination revision upload.');
    }
}

function authorize_nomination_upload(PDO $db, array $application, array $actor, string $documentId, ?string $revisionId): ?array {
    if ($revisionId !== null) {
        $revision = for_nomination_edit($db, $application, $actor, $revisionId);
        if ($revision['scope'] === 'details') reject_nomination_change($db, 403, 'Attachment changes are outside the revision scope.');
        if ($documentId !== '') reject_nomination_change($db, 400, 'Stage the attachment by its award requirement.');
        return $revision;
    }
    if ($application['nominator_id'] !== $actor['id']) reject_nomination_change($db, 403, 'Only the original filer can upload documents.');
    guard_nomination_processing($db, $application);
    if ($application['status'] === 'Draft') return null;
    $application['endorsement'] = current_nomination_endorsement($db, $application['id']);
    if (!ordinary_correction_eligible($application) || $documentId === '') {
        reject_nomination_change($db, 409, 'Only flagged attachments can be replaced during ordinary correction.');
    }
    $stmt = $db->prepare('SELECT status FROM application_documents WHERE id = ? AND application_id = ?');
    $stmt->execute([$documentId, $application['id']]);
    $status = $stmt->fetchColumn();
    if (!$status) reject_nomination_change($db, 404, 'Document not found.');
    if (!in_array($status, ['Rejected', 'Missing', 'Head Rejected'], true)) {
        reject_nomination_change($db, 409, 'Only rejected or missing attachments can be replaced.');
    }
    return null;
}

function nomination_version_signature(PDO $db, string $appId, int $version): ?array {
    if ($version === 1) {
        $stmt = $db->prepare('SELECT account_id, strokes, signed_snapshot, sha256, signed_at FROM nomination_signatures WHERE application_id = ?');
        $stmt->execute([$appId]);
    } else {
        $stmt = $db->prepare('SELECT account_id, strokes, signed_snapshot, sha256, signed_at FROM nomination_revision_signatures WHERE application_id = ? AND version_number = ?');
        $stmt->execute([$appId, $version]);
    }
    return $stmt->fetch() ?: null;
}

function nomination_version_number(PDO $db, string $appId): int {
    $stmt = $db->prepare('SELECT MAX(version_number) FROM nomination_revision_signatures WHERE application_id = ?');
    $stmt->execute([$appId]);
    return (int)($stmt->fetchColumn() ?: 1);
}
