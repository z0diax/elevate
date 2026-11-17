<?php
require_once __DIR__ . '/runtime.php';
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

    public function __construct(bool $migrationCredentials = false) {
        // XAMPP defaults are available only in explicit development mode.
        if (app_environment() === 'production') {
            foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $name) {
                if (trim((string)(database_environment($name) ?: '')) === '') {
                    throw new RuntimeException('Production database configuration is incomplete.');
                }
            }
            if (!$migrationCredentials && strtolower(trim((string)database_environment('DB_USER'))) === 'root') {
                throw new RuntimeException('The runtime database account must not be root.');
            }
        }
        if (database_environment('DB_HOST')) $this->host = database_environment('DB_HOST');
        if (database_environment('DB_NAME')) $this->db_name = database_environment('DB_NAME');
        if (database_environment('DB_USER')) $this->username = database_environment('DB_USER');
        if (database_environment('DB_PASS') !== false) $this->password = database_environment('DB_PASS');
        if (database_environment('DB_PORT')) $this->port = database_environment('DB_PORT');
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
            $ca = trim((string)(getenv('DB_SSL_CA') ?: ''));
            if ($ca !== '') {
                if (!is_file($ca)) throw new RuntimeException('Database TLS certificate bundle is unavailable.');
                $options[PDO::MYSQL_ATTR_SSL_CA] = $ca;
                $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
            }
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
