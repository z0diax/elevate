<?php
/**
 * City Government of Tacloban - PRAISE Management System
 * Database Connection Helper (PDO MySQL / MariaDB for XAMPP)
 */

class Database {
    // Default XAMPP MySQL credentials
    private $host = "localhost";
    private $db_name = "tacloban_praise_db";
    private $username = "root";
    private $password = "";
    private $port = "3306";
    public $conn;

    public function __construct() {
        // Read environment variables if available
        if (getenv('DB_HOST')) $this->host = getenv('DB_HOST');
        if (getenv('DB_NAME')) $this->db_name = getenv('DB_NAME');
        if (getenv('DB_USER')) $this->username = getenv('DB_USER');
        if (getenv('DB_PASS') !== false) $this->password = getenv('DB_PASS');
        if (getenv('DB_PORT')) $this->port = getenv('DB_PORT');
    }

    public function getConnection() {
        $this->conn = null;
        try {
            $dsn = "mysql:host=" . $this->host . ";port=" . $this->port . ";dbname=" . $this->db_name . ";charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];
            $this->conn = new PDO($dsn, $this->username, $this->password, $options);
        } catch(PDOException $exception) {
            error_log('[database.php:connect] ' . get_class($exception) . ': ' . $exception->getMessage());
            return null;
        }
        return $this->conn;
    }

    public function getRawConnectionWithoutDB() {
        try {
            $dsn = "mysql:host=" . $this->host . ";port=" . $this->port . ";charset=utf8mb4";
            return new PDO($dsn, $this->username, $this->password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);
        } catch(PDOException $e) {
            error_log('[database.php:connect_without_db] ' . get_class($e) . ': ' . $e->getMessage());
            return null;
        }
    }
}
