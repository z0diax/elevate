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
    $userId = $actor['id'];
    $role = $actor['role'];

    $stmt = $db->prepare("
        SELECT * FROM notifications
        WHERE user_id = :uid OR (user_id IS NULL AND target_role = :role) OR (user_id IS NULL AND target_role IS NULL)
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
    requireFields($data, ['mark_all_read', 'id']);
    if (isset($data['mark_all_read'])) {
        if (!requireBool($data['mark_all_read'], 'mark_all_read') || isset($data['id'])) sendResponse(400, [], 'Invalid notification request.');
        $stmt = $db->prepare("
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = :uid
        ");
        $stmt->execute([
            ':uid' => $actor['id'],
        ]);
        sendResponse(200, [], "All notifications marked as read.");
    } elseif (!empty($data['id'])) {
        $data['id'] = requireId($data['id'], 'notification ID');
        $owned = $db->prepare('SELECT id FROM notifications WHERE id = :id AND user_id = :uid');
        $owned->execute([':id' => $data['id'], ':uid' => $actor['id']]);
        if (!$owned->fetch()) sendResponse(404, [], 'Notification not found.');
        $stmt = $db->prepare("
            UPDATE notifications
            SET is_read = 1
            WHERE id = :id
              AND user_id = :uid
        ");
        $stmt->execute([
            ':id' => $data['id'],
            ':uid' => $actor['id'],
        ]);
        sendResponse(200, [], "Notification marked as read.");
    }
}
