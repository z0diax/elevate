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
        $stmt = $db->prepare("SELECT * FROM application_history WHERE application_id = :id ORDER BY created_at DESC");
        $stmt->execute([':id' => $_GET['application_id']]);
    } else {
        if ($actor['role'] === 'NOMINEE') {
            sendResponse(403, [], "Nominee accounts must request audit logs per application.");
        }
        $stmt = $db->query("SELECT * FROM application_history ORDER BY created_at DESC LIMIT 200");
    }
    sendResponse(200, $stmt->fetchAll());
} elseif ($method === 'POST') {
    require_auth($db, ['ADMINISTRATOR', 'SECRETARIAT']);

    $data = getJsonInput();
    if (empty($data['application_id']) || empty($data['action'])) {
        sendResponse(400, [], "application_id and action are required.");
    }

    $id = 'log-' . time() . '-' . rand(10, 99);
    $stmt = $db->prepare("
        INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
        VALUES (:id, :app_id, :user_id, :user_name, :user_role, :action, :prev_status, :new_status, :remarks)
    ");
    $stmt->execute([
        ':id' => $id,
        ':app_id' => $data['application_id'],
        ':user_id' => $data['user_id'] ?? null,
        ':user_name' => $data['user_name'] ?? 'System',
        ':user_role' => $data['user_role'] ?? 'SECRETARIAT',
        ':action' => $data['action'],
        ':prev_status' => $data['previous_status'] ?? null,
        ':new_status' => $data['new_status'] ?? '',
        ':remarks' => $data['remarks'] ?? ''
    ]);

    sendResponse(201, ["id" => $id], "Audit entry logged.");
}
