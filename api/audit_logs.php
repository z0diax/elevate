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
        $_GET['application_id'] = requireId($_GET['application_id'], 'application ID');
        require_application_access($db, $actor, $_GET['application_id']);
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
}
sendResponse(405, [], 'Method not allowed.');
