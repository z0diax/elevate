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
require_once __DIR__ . '/services/ApplicationHistory.php';
require_once __DIR__ . '/services/ApplicationAccess.php';
require_once __DIR__ . '/services/EndorsementService.php';
require_once __DIR__ . '/services/VerificationService.php';
require_once __DIR__ . '/services/DeliberationService.php';
require_once __DIR__ . '/services/ApplicationService.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $actor = require_auth($db);

    if (isset($_GET['id'])) {
        $application = getFullApplication($db, requireId($_GET['id'], 'application ID'));
        if (!$application) {
            sendResponse(404, [], 'Application not found.');
        }
        if (!canViewApplication($application, $actor)) {
            sendResponse(403, [], 'You are not assigned to this nomination at its current workflow stage.');
        }
        sendResponse(200, $application);
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
        'finalize_submission' => ['expected_requirement_ids'],
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

    $current = getFullApplication($db, $appId);
    if (!$current) {
        sendResponse(404, [], 'Application not found.');
    }

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
