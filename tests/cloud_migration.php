<?php
declare(strict_types=1);
require_once __DIR__ . '/test_database_guard.php';
$target = require_test_database();
$source = $target . '_source';
require_once __DIR__ . '/../api/config/database.php';
$server = (new Database())->getRawConnectionWithoutDB();
if (!$server) throw new RuntimeException('Test database server is unavailable.');
$owned = [];
function migration_child(string $mode, array $overrides): array {
    $process = proc_open([PHP_BINARY, dirname(__DIR__) . '/scripts/cloud_database.php', $mode],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__), array_merge(getenv(), $overrides));
    if (!is_resource($process)) throw new RuntimeException('Unable to run migration check.');
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    return [proc_close($process), $output];
}
try {
    foreach ([$source, $target] as $name) {
        $exists = $server->prepare('SELECT 1 FROM information_schema.schemata WHERE schema_name = ?');
        $exists->execute([$name]);
        if ($exists->fetchColumn() !== false) throw new RuntimeException('Migration checks require names of databases that do not already exist.');
        $server->exec('CREATE DATABASE `' . $name . '` CHARACTER SET utf8mb4');
        $owned[] = $name;
    }
    [$status, $output] = migration_child('initialize-empty', ['DB_NAME' => $source]);
    if ($status !== 0) throw new RuntimeException($output);
    $sourceEnv = [
        'DB_NAME' => $target, 'SOURCE_DB_NAME' => $source,
        'SOURCE_DB_HOST' => database_environment('DB_HOST') ?: 'localhost',
        'SOURCE_DB_PORT' => database_environment('DB_PORT') ?: '3306',
        'SOURCE_DB_USER' => database_environment('DB_USER') ?: 'root',
        'SOURCE_DB_PASS' => database_environment('DB_PASS') ?: '',
    ];
    [$status, $output] = migration_child('import-local', $sourceEnv);
    if ($status !== 0) throw new RuntimeException($output);
    foreach ($server->query('SHOW TABLES FROM `' . $source . '`')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $quoted = '`' . str_replace('`', '``', $table) . '`';
        $before = $server->query('SELECT * FROM `' . $source . '`.' . $quoted . ' ORDER BY 1')->fetchAll(PDO::FETCH_ASSOC);
        $after = $server->query('SELECT * FROM `' . $target . '`.' . $quoted . ' ORDER BY 1')->fetchAll(PDO::FETCH_ASSOC);
        if ($before !== $after) throw new RuntimeException('Migrated table differs: ' . $table);
    }
    foreach (['import-local', 'initialize-empty'] as $mode) {
        [$status, $output] = migration_child($mode, $sourceEnv);
        if ($status === 0 || !str_contains($output, 'Refusing')) throw new RuntimeException('Migration failed to protect an existing database.');
    }
    echo "Cloud initialization, exact record migration, and overwrite protection passed.\n";
} finally {
    // These exact, guarded test databases were confirmed absent before this run.
    foreach ($owned as $name) $server->exec('DROP DATABASE `' . $name . '`');
}
