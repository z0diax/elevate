<?php
/**
 * In-App Notifications API
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
    $userId = $actor['role'] === 'ADMINISTRATOR' ? ($_GET['user_id'] ?? $actor['id']) : $actor['id'];
    $role = $actor['role'] === 'ADMINISTRATOR' ? ($_GET['role'] ?? $actor['role']) : $actor['role'];

    $stmt = $db->prepare("
        SELECT * FROM notifications
        WHERE user_id = :uid OR target_role = :role OR (user_id IS NULL AND target_role IS NULL)
        ORDER BY created_at DESC LIMIT 50
    ");
    $stmt->execute([':uid' => $userId, ':role' => $role]);

    $notifications = $stmt->fetchAll();
    foreach ($notifications as &$n) {
        $n['is_read'] = (bool)$n['is_read'];
    }
    sendResponse(200, $notifications);
} elseif ($method === 'PUT') {
    $data = getJsonInput();
    if (isset($data['mark_all_read'])) {
        $stmt = $db->prepare("
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = :uid OR target_role = :role OR (user_id IS NULL AND target_role IS NULL)
        ");
        $stmt->execute([
            ':uid' => $actor['id'],
            ':role' => $actor['role'],
        ]);
        sendResponse(200, [], "All notifications marked as read.");
    } elseif (!empty($data['id'])) {
        $stmt = $db->prepare("
            UPDATE notifications
            SET is_read = 1
            WHERE id = :id
              AND (user_id = :uid OR target_role = :role OR (user_id IS NULL AND target_role IS NULL))
        ");
        $stmt->execute([
            ':id' => $data['id'],
            ':uid' => $actor['id'],
            ':role' => $actor['role'],
        ]);
        sendResponse(200, [], "Notification marked as read.");
    }
}
