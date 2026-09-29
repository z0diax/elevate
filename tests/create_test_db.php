<?php
declare(strict_types=1);

require_once __DIR__ . '/test_database_guard.php';
$name = require_test_database();
require_once __DIR__ . '/../api/config/database.php';
$db = (new Database())->getRawConnectionWithoutDB();
if (!$db) throw new RuntimeException('Cannot connect to MySQL. Configure DB_HOST, DB_PORT, DB_USER and DB_PASS.');
$db->exec('CREATE DATABASE IF NOT EXISTS `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
echo "Dedicated test database is available.\n";
