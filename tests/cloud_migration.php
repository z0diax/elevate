<?php
declare(strict_types=1);
require_once __DIR__ . '/test_database_guard.php';
$target = require_test_database();
$source = $target . '_source';
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/database_storage.php';
$server = (new Database())->getRawConnectionWithoutDB();
if (!$server) throw new RuntimeException('Test database server is unavailable.');
$owned = [];
$storage = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'praise-revision-migration-' . bin2hex(random_bytes(12));
$files = ['private/staged.pdf' => 'staged revision evidence', 'private/archived.pdf' => 'archived signed evidence'];
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
    if (!mkdir($storage, 0700)) throw new RuntimeException('Unable to create disposable file storage.');
    foreach ($files as $reference => $content) file_put_contents($storage . DIRECTORY_SEPARATOR . basename($reference), $content);
    $server->exec("INSERT INTO `$source`.applications
        (id, application_number, award_id, award_name, nominee_name, position_title, office_name, employment_category,
        contact_number, email, nominator_name, nominator_position, nominating_office, justification, accomplishments, supporting_narrative, date_of_nomination, status)
        VALUES ('revision-fixture', 'PRAISE-CLOUD-REVISION', 'award', 'Award', 'Synthetic Nominee', 'Staff', 'Office',
        'Permanent', '09000000', 'test@example.invalid', 'Synthetic Filer', 'Staff', 'Office', '', '', '', '2026-10-08', 'Returned for Revision')");
    $server->exec("INSERT INTO `$source`.nomination_revision_requests
        (id, application_id, revision_number, requested_by, requested_by_name, requested_by_role, instructions, scope, previous_status, previous_stage)
        VALUES ('revision-request', 'revision-fixture', 1, 'admin', 'Test Admin', 'ADMINISTRATOR', 'Revise evidence', 'both', 'For Endorsement', 'Endorsement')");
    $server->prepare("INSERT INTO `$source`.nomination_revision_files (id, revision_id, attachment_key, document) VALUES (?, ?, ?, ?)")
        ->execute(['staged-file', 'revision-request', 'requirement', json_encode(['file_url' => 'private/staged.pdf'], JSON_THROW_ON_ERROR)]);
    $server->prepare("INSERT INTO `$source`.nomination_document_history (id, application_id, document_id, sha256, document) VALUES (?, ?, ?, ?, ?)")
        ->execute(['archived-file', 'revision-fixture', 'original-file', hash('sha256', $files['private/archived.pdf']),
            json_encode(['file_url' => 'private/archived.pdf'], JSON_THROW_ON_ERROR)]);
    $sourceEnv = [
        'DB_NAME' => $target, 'SOURCE_DB_NAME' => $source,
        'SOURCE_DB_HOST' => database_environment('DB_HOST') ?: 'localhost',
        'SOURCE_DB_PORT' => database_environment('DB_PORT') ?: '3306',
        'SOURCE_DB_USER' => database_environment('DB_USER') ?: 'root',
        'SOURCE_DB_PASS' => database_environment('DB_PASS') ?: '',
        'SOURCE_PRIVATE_UPLOAD_DIR' => $storage,
    ];
    [$status, $output] = migration_child('import-local', $sourceEnv);
    if ($status !== 0) throw new RuntimeException($output);
    foreach ($server->query('SHOW TABLES FROM `' . $source . '`')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $quoted = '`' . str_replace('`', '``', $table) . '`';
        $before = $server->query('SELECT * FROM `' . $source . '`.' . $quoted . ' ORDER BY 1')->fetchAll(PDO::FETCH_ASSOC);
        $after = $server->query('SELECT * FROM `' . $target . '`.' . $quoted . ' ORDER BY 1')->fetchAll(PDO::FETCH_ASSOC);
        if (in_array($table, ['praise_files', 'praise_file_chunks'], true)) {
            $after = array_values(array_filter($after, static fn($record) => !isset($files[$record['reference']])));
        }
        if ($before !== $after) throw new RuntimeException('Migrated table differs: ' . $table);
    }
    $targetConnection = (new Database())->getConnection();
    foreach ($files as $reference => $content) {
        $path = database_materialize_file($reference, $targetConnection);
        if (!$path || file_get_contents($path) !== $content) throw new RuntimeException('Revision attachment bytes differ after import.');
    }
    foreach (['import-local', 'initialize-empty'] as $mode) {
        [$status, $output] = migration_child($mode, $sourceEnv);
        if ($status === 0 || !str_contains($output, 'Refusing')) throw new RuntimeException('Migration failed to protect an existing database.');
    }
    echo "Cloud initialization, exact record migration, and overwrite protection passed.\n";
} finally {
    // These exact, guarded test databases were confirmed absent before this run.
    foreach ($owned as $name) $server->exec('DROP DATABASE `' . $name . '`');
    if (is_dir($storage)) {
        foreach (array_keys($files) as $reference) {
            $path = $storage . DIRECTORY_SEPARATOR . basename($reference);
            if (is_file($path)) unlink($path);
        }
        rmdir($storage);
    }
}
