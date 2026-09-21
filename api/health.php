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
    } catch(Exception $e) {
        sendResponse(200, [
            "database_connected" => true,
            "engine" => "MySQL / MariaDB (XAMPP)",
            "warning" => "Database connected but tables might need to be created. Visit /api/setup_db.php to auto-initialize."
        ], "Database connected. Tables need migration.");
    }
} else {
    sendResponse(503, [
        "database_connected" => false,
        "error" => "Could not connect to MySQL database on localhost:3306.",
        "hint" => "Ensure MySQL service is started in XAMPP Control Panel and database 'tacloban_praise_db' exists."
    ], "XAMPP MySQL service not reachable.");
}
