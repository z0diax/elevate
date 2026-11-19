<?php
declare(strict_types=1);
// CLI-only maintenance. Never expose database initialization as a public endpoint.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit(); }
require_once __DIR__ . '/../api/config/database.php';
$mode = $argv[1] ?? '';
if (!in_array($mode, ['inspect', 'create-app-database', 'initialize-empty', 'import-local', 'add-cloud-storage', 'add-login-throttle'], true)) throw new RuntimeException('Invalid cloud maintenance operation.');
$db = (new Database())->getConnection();
if (!$db) throw new RuntimeException('Cannot connect to the configured database.');
$root = dirname(__DIR__);
if ($mode === 'add-login-throttle') {
    $db->exec((string)file_get_contents($root . '/database_migrations/20260929_login_throttle.sql'));
    echo "Login throttle storage is available. Existing application records were not changed.\n";
    exit();
}
if ($mode === 'create-app-database') {
    $db->exec('CREATE DATABASE IF NOT EXISTS `tacloban_praise_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    echo "Application database is available.\n";
    exit();
}
if ($mode === 'inspect') {
    $tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    echo 'Database: ' . $db->query('SELECT DATABASE()')->fetchColumn() . "\n";
    foreach ($tables as $table) {
        $quoted = '`' . str_replace('`', '``', $table) . '`';
        echo $table . ': ' . $db->query('SELECT COUNT(*) FROM ' . $quoted)->fetchColumn() . " rows\n";
    }
    exit();
}
if ($mode === 'import-local') {
    if ($db->query('SHOW TABLES')->fetchColumn() !== false) throw new RuntimeException('Cloud database is not empty. Refusing to overwrite it.');
    require_once __DIR__ . '/../api/config/database_storage.php';
    $sourceName = getenv('SOURCE_DB_NAME') ?: 'tacloban_praise_db';
    $source = new PDO('mysql:host=' . (getenv('SOURCE_DB_HOST') ?: 'localhost') . ';port=' . (getenv('SOURCE_DB_PORT') ?: '3306') . ';dbname=' . $sourceName . ';charset=utf8mb4',
        getenv('SOURCE_DB_USER') ?: 'root', getenv('SOURCE_DB_PASS') ?: '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    $tables = $source->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('profiles', $tables, true) || !in_array('applications', $tables, true)) throw new RuntimeException('Source does not contain the PRAISE database.');
    $quote = static fn(string $name): string => '`' . str_replace('`', '``', $name) . '`';
    $references = $source->query("SELECT DISTINCT file_url FROM application_documents WHERE file_url <> ''")->fetchAll(PDO::FETCH_COLUMN);
    if (in_array('report_settings', $tables, true)) {
        $references = array_merge($references, $source->query("SELECT background_image_url FROM report_settings WHERE background_image_url IS NOT NULL AND background_image_url <> ''")->fetchAll(PDO::FETCH_COLUMN));
    }
    $files = [];
    foreach (array_unique($references) as $reference) {
        if (in_array('praise_files', $tables, true)) {
            $stored = $source->prepare('SELECT 1 FROM praise_files WHERE reference = ?');
            $stored->execute([$reference]);
            if ($stored->fetchColumn() !== false) continue;
        }
        if (preg_match('~^private/([A-Za-z0-9_-]+\.(?:pdf|docx|jpe?g|png))$~iD', $reference, $match)) {
            $private = getenv('SOURCE_PRIVATE_UPLOAD_DIR') ?: (getenv('PRIVATE_UPLOAD_DIR') ?: dirname($root, 2) . '/praise_private_uploads');
            $path = rtrim($private, '/\\') . '/' . $match[1];
        } elseif (preg_match('~^uploads/(?:[A-Za-z0-9_-]+\.(?:pdf|docx|jpe?g|png)|certificate_templates/certificate_background_[0-9]+_[0-9]{4}\.(?:jpg|png|webp))$~iD', $reference)) {
            $path = $root . '/' . $reference;
        } else { throw new RuntimeException('Source contains an unsupported file reference. No cloud records were imported.'); }
        if (!is_file($path) || is_link($path)) throw new RuntimeException('A source attachment is missing. No cloud records were imported.');
        $files[$reference] = $path;
    }
    $db->exec('SET FOREIGN_KEY_CHECKS = 0');
    try {
        foreach ($tables as $table) {
            $definition = $source->query('SHOW CREATE TABLE ' . $quote($table))->fetch(PDO::FETCH_NUM);
            $db->exec($definition[1]);
        }
        $db->exec((string)file_get_contents($root . '/database_migrations/20261117_cloud_storage.sql'));
        $source->beginTransaction();
        $db->beginTransaction();
        try {
            $rows = 0;
            foreach ($tables as $table) {
                $cursor = $source->query('SELECT * FROM ' . $quote($table));
                $insert = null;
                while ($record = $cursor->fetch()) {
                    $insert ??= $db->prepare('INSERT INTO ' . $quote($table) . ' (' . implode(',', array_map($quote, array_keys($record))) . ') VALUES (' . implode(',', array_fill(0, count($record), '?')) . ')');
                    $insert->execute(array_values($record));
                    $rows++;
                }
            }
            foreach ($files as $reference => $path) database_store_file($db, $reference, $path);
            $db->commit();
            $source->rollBack();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            if ($source->inTransaction()) $source->rollBack();
            throw $error;
        }
    } finally { $db->exec('SET FOREIGN_KEY_CHECKS = 1'); }
    echo 'Imported ' . $rows . ' records and ' . count($files) . " files. Local data was not changed.\n";
    exit();
}
$sources = [$root . '/database_migrations/20261117_cloud_storage.sql'];
if ($mode === 'initialize-empty') {
    if ($db->query('SHOW TABLES')->fetchColumn() !== false) throw new RuntimeException('Database is not empty. Refusing to initialize it.');
    array_unshift($sources, $root . '/database.sql');
}
foreach ($sources as $source) {
    $sql = (string)file_get_contents($source);
    $lines = preg_split('/\r\n|\r|\n/', $sql) ?: [];
    $sql = implode("\n", array_filter($lines, static fn(string $line): bool => !str_starts_with(ltrim($line), '--')));
    foreach (preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [] as $statement) {
        $statement = trim($statement);
        // The provider chooses the database name. No table deletion is necessary in an empty DB.
        if ($statement === '' || preg_match('/^(CREATE DATABASE|USE |DROP TABLE)/i', $statement)) continue;
        $db->exec($statement);
    }
}
echo "Cloud database schema is ready.\n";
