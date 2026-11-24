<?php
declare(strict_types=1);

/**
 * Applications and PRAISE workflow API.
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';
require_once __DIR__ . '/config/document_storage.php';
require_once __DIR__ . '/services/EvaluationRoutingService.php';
require_once __DIR__ . '/services/ApplicationRepository.php';
require_once __DIR__ . '/services/NominationSignature.php';
require_once __DIR__ . '/services/ApplicationHistory.php';
require_once __DIR__ . '/services/ApplicationAccess.php';
require_once __DIR__ . '/services/EndorsementService.php';
require_once __DIR__ . '/services/VerificationService.php';
require_once __DIR__ . '/services/DeliberationService.php';
require_once __DIR__ . '/services/ApplicationService.php';

require_once __DIR__ . '/services/NominationRevisionService.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $actor = require_auth($db);
    header('Cache-Control: private, no-store');

    if (isset($_GET['id'])) {
        // Read the official form, workflow and signature against one committed snapshot.
        $db->beginTransaction();
        $application = getFullApplication($db, requireId($_GET['id'], 'application ID'));
        if (!$application) {
            sendResponse(404, [], 'Application not found.');
        }
        if (!canViewApplication($application, $actor)) {
            sendResponse(403, [], 'You are not assigned to this nomination at its current workflow stage.');
        }
        $version = isset($_GET['version']) ? requireIntRange($_GET['version'], 'nomination version', 1, PHP_INT_MAX) : null;
        $historical = null;
        if ($version !== null && $version !== $application['nomination_version']) {
            if ($actor['role'] !== 'ADMINISTRATOR') sendResponse(403, [], 'Only Administrators can view nomination version history.');
            $stmt = $db->prepare('SELECT * FROM nomination_versions WHERE application_id = ? AND version_number = ?');
            $stmt->execute([$application['id'], $version]);
            $historical = $stmt->fetch();
            if (!$historical) sendResponse(404, [], 'Historical nomination version not found.');
        }
        if (($_GET['action'] ?? '') === 'revision_history') {
            if ($actor['role'] !== 'ADMINISTRATOR') sendResponse(403, [], 'Only Administrators can view revision history.');
            $archivedFiles = revision_rows($db, 'SELECT id, document, sha256, archived_at FROM nomination_document_history WHERE application_id = ? ORDER BY archived_at DESC', $application['id']);
            foreach ($archivedFiles as &$file) {
                $document = json_decode($file['document'], true, 512, JSON_THROW_ON_ERROR);
                $file['document'] = array_intersect_key($document, array_flip(['document_name', 'file_name', 'file_type', 'file_size', 'status', 'verification_remarks', 'uploaded_at']));
                $file['document']['file_url'] = $document['file_url'] ? nomination_document_url($file['id'], 'history') : '';
            }
            unset($file);
            sendResponse(200, [
                'archived_attachments' => $archivedFiles,
                'requests' => array_map('revision_request_summary', revision_rows($db, 'SELECT r.*, completed.full_name AS completed_by_name, cancelled.full_name AS cancelled_by_name
                    FROM nomination_revision_requests r
                    LEFT JOIN profiles completed ON completed.id = r.completed_by
                    LEFT JOIN profiles cancelled ON cancelled.id = r.cancelled_by
                    WHERE r.application_id = ? ORDER BY r.revision_number DESC', $application['id'])),
                'versions' => array_column(revision_rows($db, 'SELECT version_number FROM nomination_versions WHERE application_id = ? ORDER BY version_number DESC', $application['id']), 'version_number'),
            ]);
        }
        if (($_GET['action'] ?? '') === 'signature') {
            if ($actor['role'] === 'EVALUATOR') sendResponse(403, [], 'Nominator signatures are not available during scoring.');
            $signature = nomination_version_signature($db, $application['id'], $version ?? $application['nomination_version']);
            if (!$signature) sendResponse(404, [], 'No electronic signature exists for this nomination.');
            if (!hash_equals($signature['sha256'], nomination_signature_digest($signature['strokes'], $signature['signed_snapshot']))) sendResponse(409, [], 'Signature integrity check failed.');
            $signature['strokes'] = json_decode($signature['strokes'], true, 512, JSON_THROW_ON_ERROR);
            $signature['signed_snapshot'] = json_decode($signature['signed_snapshot'], true, 512, JSON_THROW_ON_ERROR);
            $officialDocuments = $historical ? json_decode($historical['nomination'], true, 512, JSON_THROW_ON_ERROR)['documents'] : null;
            $signature['version_number'] = $version ?? $application['nomination_version'];
            $signature['documents'] = signed_nomination_documents($db, $application['id'], $signature['signed_snapshot']['documents'] ?? [], $officialDocuments);
            header('Cache-Control: private, no-store');
            sendResponse(200, $signature);
        }
        header('Cache-Control: private, no-store');
        if (($_GET['action'] ?? '') === 'form') {
            $stmt = $db->prepare('SELECT * FROM application_history WHERE application_id = ? ORDER BY created_at DESC');
            $stmt->execute([$application['id']]);
            $history = $stmt->fetchAll();
            if ($historical) {
                $application = json_decode($historical['nomination'], true, 512, JSON_THROW_ON_ERROR);
                $application['nomination_version'] = $version;
                $application['historical_workflow'] = json_decode($historical['workflow'], true, 512, JSON_THROW_ON_ERROR);
            }
            sendResponse(200, [
                'application' => application_for_actor($application, $actor),
                'history' => application_history_for_actor($history, $application, $actor),
            ]);
        }
        sendResponse(200, application_for_actor($application, $actor));
    }

    sendResponse(200, listApplications($db, $actor));
}

if ($method === 'POST') {
    $actor = require_auth($db, ['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'NOMINEE']);
    $data = getJsonInput();
    handle_create_application($db, $actor, $data);
}

if ($method === 'PUT') {
    $actor = require_auth($db);
    $data = getJsonInput();
    $action = $_GET['action'] ?? ($data['action'] ?? '');
    $appId = $_GET['id'] ?? ($data['id'] ?? ($data['application_id'] ?? ''));
    $appId = requireId($appId, 'application ID');
    $actionFields = [
        'finalize_submission' => ['expected_requirement_ids', 'signature_strokes', 'signature_confirmed'],
        'resubmit' => ['remarks'],
        'endorse' => ['decision', 'remarks'],
        'verify_document' => ['document_id', 'status', 'remarks'],
        'inspect_document' => ['document_id', 'status', 'remarks'],
        'mark_verified' => ['remarks'],
        'assign_evaluators' => ['remarks'],
        'reassign_evaluator' => ['old_evaluator_id', 'new_evaluator_id'],
        'return_for_revision' => ['remarks'],
        'deliberation' => ['decision', 'remarks', 'award_now'],
        'begin_deliberation' => [],
        'require_nomination_revision' => ['scope', 'instructions'],
        'cancel_nomination_revision' => ['revision_id', 'reason'],
        'start_nomination_revision' => ['revision_id'],
        'save_nomination_revision' => ['revision_id', 'generation', 'details', 'remarks'],
        'remove_revision_attachment' => ['revision_id', 'generation', 'requirement_id', 'document_id'],
        'finalize_nomination_revision' => ['revision_id', 'generation', 'remarks', 'signature_strokes', 'signature_confirmed'],
    ];
    if (!isset($actionFields[$action])) sendResponse(400, [], 'Unknown action specified.');
    requireFields($data, array_merge(['id', 'application_id', 'action'], $actionFields[$action]));
    if (isset($data['remarks'])) requireText($data['remarks'], 'remarks', 65535);
    if (isset($data['document_id'])) requireId($data['document_id'], 'document ID');
    if (isset($data['old_evaluator_id'])) requireId($data['old_evaluator_id'], 'old evaluator ID');
    if (isset($data['new_evaluator_id'])) requireId($data['new_evaluator_id'], 'replacement evaluator ID');
    if (isset($data['award_now'])) $data['award_now'] = requireBool($data['award_now'], 'award_now');

    if ($action === 'reassign_evaluator' && $actor['role'] !== 'ADMINISTRATOR') {
        sendResponse(403, [], 'Only an Administrator can reassign evaluators.');
    }

    if (str_contains($action, 'nomination_revision') || $action === 'remove_revision_attachment') {
        handle_nomination_revision($db, $actor, $data, $appId, $action);
    }
    $current = getFullApplication($db, $appId);
    if (!$current) {
        sendResponse(404, [], 'Application not found.');
    }

    if ($current['revision_active'] && !canViewApplication($current, $actor)) {
        sendResponse(403, [], 'You are not assigned to this nomination.');
    }
    guard_nomination_processing($db, $current);

    if ($action === 'reassign_evaluator') {
        handle_reassign_evaluator($db, $actor, $data, $appId);
    }

    if ($action === 'finalize_submission') {
        handle_finalize_submission($db, $actor, $data, $appId, $current);
    }

    if ($action === 'resubmit') {
        handle_resubmit($db, $actor, $data, $appId, $current);
    }

    if ($action === 'endorse') {
        handle_endorse($db, $actor, $data, $appId, $current);
    }

    if ($action === 'verify_document') {
        handle_verify_document($db, $actor, $data, $appId, $current);
    }

    if ($action === 'inspect_document') {
        handle_inspect_document($db, $actor, $data, $appId, $current);
    }

    if ($action === 'mark_verified') {
        handle_mark_verified($db, $actor, $data, $appId, $current);
    }

    if ($action === 'assign_evaluators') {
        handle_assign_evaluators($db, $actor, $data, $appId, $current);
    }

    if ($action === 'return_for_revision') {
        handle_return_for_revision($db, $actor, $data, $appId, $current);
    }

    if ($action === 'deliberation') {
        handle_deliberation($db, $actor, $data, $appId, $current);
    }

    if ($action === 'begin_deliberation') {
        handle_begin_deliberation($db, $actor, $appId);
    }

    sendResponse(400, [], 'Unknown action specified.');
}

if ($method === 'DELETE') {
    require_auth($db, ['ADMINISTRATOR']);
    $data = getJsonInput();
    $appId = requireId($_GET['id'] ?? ($data['id'] ?? ($data['application_id'] ?? null)), 'application ID');

    handle_delete_application($db, $appId);
}

sendResponse(405, [], 'Method not allowed.');
