<?php
declare(strict_types=1);
require_once __DIR__ . '/NominationSignature.php';

/** Shape responses only: workflow code must continue using the full stored record. */
function application_for_actor(array $application, array $actor): array {
    $isFiler = ($application['nominator_id'] ?? null) === ($actor['id'] ?? null);
    if (!$isFiler && ($actor['role'] ?? '') !== 'ADMINISTRATOR') unset($application['revision_request']);
    if (($actor['role'] ?? '') !== 'ADMINISTRATOR') unset($application['can_require_revision'], $application['has_archived_attachments']);
    if (!$isFiler) unset($application['can_correct']);
    if (($actor['role'] ?? '') !== 'NOMINEE') {
        return redact_nominator_for_evaluator($application, $actor);
    }

    // An allowlist also keeps future internal fields out of nominee responses.
    $publicFields = [
        'id', 'application_number', 'award_id', 'award_name', 'award_year',
        'nominee_id', 'nominee_name', 'employee_id', 'position_title', 'office_id', 'office_name',
        'division_section', 'employment_category', 'contact_number', 'email', 'barangay',
        'nomination_type', 'nominator_id', 'nominator_name', 'nominator_position',
        'nominating_office', 'nominating_office_id', 'nomination_origin',
        'submission_account_name', 'submission_account_role', 'justification',
        'accomplishments', 'supporting_narrative', 'date_of_nomination',
        'status', 'processing_stage', 'stage', 'required_action', 'remarks', 'award_date',
        'created_at', 'updated_at', 'signature_signed_at', 'documents', 'endorsement',
        'revision_request', 'revision_active', 'nomination_version', 'can_correct',
    ];
    return array_intersect_key($application, array_flip($publicFields));
}

/** Scores, revision reasons and committee notes also occur in free-text history. */
function application_history_for_actor(array $logs, array $application, array $actor): array {
    $role = $actor['role'] ?? '';
    if ($role === 'NOMINEE') {
        $publicActions = [
            'Nomination Signed', 'Nomination Submitted', 'Nomination Resubmitted',
            'Nomination Revision Required', 'Nomination Revision Started', 'Nomination Revision Cancelled', 'Revised Nomination Submitted',
            'Document Uploaded', 'Draft Attachment Replaced', 'Compliance Document Re-uploaded',
            'Returned for Revision', 'Head of Office: Endorsed',
            'Head of Office: Returned for Revision', 'Head of Office: Rejected',
            'Head of Office: Head Approved', 'Head of Office: Missing',
            'Secretariat Verified Document', 'Secretariat Rejected Document',
            'Secretariat Missing Document', 'Secretariat Verified All Documents',
        ];
        return array_map(static function (array $log) use ($publicActions, $application): array {
            $public = array_intersect_key($log, array_flip([
                'id', 'application_id', 'created_at', 'previous_status', 'new_status',
            ]));
            $isPublic = in_array($log['action'] ?? '', $publicActions, true);
            $public['action'] = $isPublic ? $log['action'] : 'Nomination status updated';
            $public['remarks'] = $isPublic ? ($log['remarks'] ?? '') : '';
            $isFiler = isset($log['user_id'], $application['nominator_id'])
                && (string)$log['user_id'] === (string)$application['nominator_id'];
            $public['user_id'] = $isPublic && $isFiler ? $log['user_id'] : null;
            $public['user_name'] = $isPublic && $isFiler ? ($log['user_name'] ?? 'Nominator') : 'System';
            $public['user_role'] = $isPublic && $isFiler ? ($log['user_role'] ?? 'NOMINEE') : 'SYSTEM';
            return $public;
        }, $logs);
    }
    if ($role === 'EVALUATOR') {
        foreach ($logs as &$log) {
            if ((string)($log['user_id'] ?? '') === (string)($application['nominator_id'] ?? '')) {
                $log['user_id'] = null;
                $log['user_name'] = 'Nominator';
                $log['user_role'] = 'SYSTEM';
            }
        }
        unset($log);
    }
    return $logs;
}
