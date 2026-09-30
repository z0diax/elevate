<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$api = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root . '/api'));
$checked = 0;
foreach ($api as $file) {
    if (!$file->isFile() || $file->getExtension() !== 'php' || $file->getFilename() === 'setup_db.php') {
        continue;
    }
    $source = file_get_contents($file->getPathname());
    if ($source === false || preg_match('/\b(?:CREATE|ALTER|DROP|TRUNCATE|RENAME)\s+(?:TABLE|INDEX|DATABASE)\b/i', $source)) {
        throw new RuntimeException('Runtime DDL found in ' . $file->getPathname());
    }
    $checked++;
}

$applications = file_get_contents($root . '/api/applications.php');
$repository = file_get_contents($root . '/api/services/ApplicationRepository.php');
if ($applications === false || $repository === false || str_contains($applications . $repository, 'ensureDocumentReviewStatusSchema')) {
    throw new RuntimeException('Document review runtime schema helper remains.');
}

$schema = file_get_contents($root . '/database.sql');
$migration = file_get_contents($root . '/database_migrations/20260929_remove_runtime_schema_repair.sql');
if ($schema === false || $migration === false
    || !preg_match('/CREATE TABLE `application_documents` \([\s\S]*?`status` VARCHAR\(50\) NOT NULL DEFAULT \'Submitted\'/i', $schema)
    || !str_contains($schema, 'CREATE TABLE `report_settings`')
    || !str_contains($migration, 'ALTER TABLE `application_documents` MODIFY COLUMN `status`')
    || !str_contains($migration, 'CREATE TABLE IF NOT EXISTS `report_settings`')) {
    throw new RuntimeException('Canonical schema or upgrade migration is incomplete.');
}

echo "Checked {$checked} runtime API PHP files for DDL.\n";
