<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

if ($db) {
    try {
        $stmt = $db->query("SELECT COUNT(*) as app_count FROM applications");
        $apps = $stmt->fetch();

        $stmt2 = $db->query("SELECT COUNT(*) as user_count FROM profiles");
        $users = $stmt2->fetch();

        sendResponse(200, [
            "database_connected" => true,
            "engine" => "MySQL / MariaDB (XAMPP)",
            "database" => "tacloban_praise_db",
            "counts" => [
                "applications" => (int)$apps['app_count'],
                "users" => (int)$users['user_count']
            ]
        ], "XAMPP MySQL Database is connected and operational.");
    } catch(Throwable $e) {
        sendInternalError($e, 'health.php:check', 'Database health check failed.');
    }
} else {
    sendResponse(503, ["database_connected" => false], 'Database connection failed.');
}
