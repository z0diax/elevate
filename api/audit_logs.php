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
        if (in_array($actor['role'], ['NOMINEE', 'HEAD_OF_OFFICE'], true)) {
            $accessStmt = $db->prepare('SELECT nominator_id, nominee_id, office_id, status FROM applications WHERE id = :id');
            $accessStmt->execute([':id' => $_GET['application_id']]);
            $application = $accessStmt->fetch();
            if (!$application) {
                sendResponse(404, [], 'Application not found.');
            }
            $isOwnNomination = $application['nominator_id'] === $actor['id'] || $application['nominee_id'] === $actor['id'];
            $isSameOfficeHead = $actor['role'] === 'HEAD_OF_OFFICE'
                && !empty($actor['office_id'])
                && $application['office_id'] === $actor['office_id']
                && $application['status'] !== 'Draft';
            if (!$isOwnNomination && !$isSameOfficeHead) {
                sendResponse(403, [], 'You cannot view this nomination history.');
            }
        }
        $stmt = $db->prepare("SELECT * FROM application_history WHERE application_id = :id ORDER BY created_at DESC");
        $stmt->execute([':id' => $_GET['application_id']]);
    } else {
        if (in_array($actor['role'], ['NOMINEE', 'HEAD_OF_OFFICE'], true)) {
            sendResponse(403, [], 'Request audit logs for an accessible nomination.');
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
