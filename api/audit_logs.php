<?php
/**
 * Audit Logs & History API
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], "Database connection failed.");
}

$method = $_SERVER['REQUEST_METHOD'];
$actor = require_auth($db);

if ($method === 'GET') {
    if (isset($_GET['application_id'])) {
        require_application_access($db, $actor, (string)$_GET['application_id']);
        $stmt = $db->prepare("SELECT * FROM application_history WHERE application_id = :id ORDER BY created_at DESC");
        $stmt->execute([':id' => $_GET['application_id']]);
    } else {
        if (!in_array($actor['role'], ['ADMINISTRATOR', 'SECRETARIAT'], true)) {
            sendResponse(403, [], 'Request audit logs for an accessible nomination.');
        }
        if ($actor['role'] === 'SECRETARIAT') {
            $stmt = $db->query("SELECT h.* FROM application_history h JOIN applications a ON a.id = h.application_id WHERE a.status <> 'Draft' AND a.processing_stage IN ('Document Verification', 'Evaluation', 'Deliberation', 'Final Decision', 'Awarded') ORDER BY h.created_at DESC LIMIT 200");
        } else {
            $stmt = $db->query("SELECT * FROM application_history ORDER BY created_at DESC LIMIT 200");
        }
    }
    sendResponse(200, $stmt->fetchAll());
} elseif ($method === 'POST') {
    require_auth($db, ['ADMINISTRATOR', 'SECRETARIAT']);

    $data = getJsonInput();
    if (empty($data['application_id']) || empty($data['action'])) {
        sendResponse(400, [], "application_id and action are required.");
    }
    require_application_access($db, $actor, (string)$data['application_id']);

    $id = 'log-' . time() . '-' . rand(10, 99);
    $stmt = $db->prepare("
        INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
        VALUES (:id, :app_id, :user_id, :user_name, :user_role, :action, :prev_status, :new_status, :remarks)
    ");
    $stmt->execute([
        ':id' => $id,
        ':app_id' => $data['application_id'],
        ':user_id' => $actor['id'],
        ':user_name' => $actor['full_name'],
        ':user_role' => $actor['role'],
        ':action' => $data['action'],
        ':prev_status' => $data['previous_status'] ?? null,
        ':new_status' => $data['new_status'] ?? '',
        ':remarks' => $data['remarks'] ?? ''
    ]);

    sendResponse(201, ["id" => $id], "Audit entry logged.");
}
