<?php
declare(strict_types=1);
require_once __DIR__ . '/test_database_guard.php';
require_test_database();
require_once __DIR__ . '/../api/config/database.php';
$db = (new Database())->getConnection();
if (!$db || $db->query('SHOW TABLES')->fetchColumn() !== false) throw new RuntimeException('Use a separate, empty dedicated test database for this migration check.');
try {
    $db->exec('CREATE TABLE applications (id VARCHAR(64) PRIMARY KEY, nominee_id VARCHAR(64), nominator_id VARCHAR(64), nominee_name VARCHAR(255), nominating_office VARCHAR(255)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $db->exec("INSERT INTO applications VALUES ('legacy', 'old-account', 'old-account', 'Legacy Nominee', 'Historical Office')");
    $before = $db->query('SELECT * FROM applications')->fetch();
    $sql = preg_replace('/^--.*$/m', '', file_get_contents(__DIR__ . '/../database_migrations/20261008_nomination_identity_signatures.sql'));
    foreach (explode(';', $sql) as $statement) if (trim($statement) !== '') $db->exec($statement);
    $after = $db->query('SELECT * FROM applications')->fetch();
    foreach ($before as $key => $value) if ($after[$key] !== $value) throw new RuntimeException('Historical data changed.');
    foreach (['nomination_origin', 'nominating_office_id', 'submission_account_name', 'submission_account_role'] as $key) if ($after[$key] !== null) throw new RuntimeException('Unsupported historical identity inferred.');
    $db->exec("INSERT INTO nomination_signatures (application_id, account_id, strokes, signed_snapshot, sha256) VALUES ('legacy', 'old-account', '[]', '{}', REPEAT('a', 64))");
    try {
        $db->exec("INSERT INTO nomination_signatures (application_id, account_id, strokes, signed_snapshot, sha256) VALUES ('legacy', 'other-account', '[]', '{}', REPEAT('b', 64))");
        throw new RuntimeException('Duplicate signature was accepted.');
    } catch (PDOException $error) { if ($error->getCode() !== '23000') throw $error; }
    echo "Passed legacy migration preservation, unknown origin and unique signed record checks.\n";
} finally {
    $db->exec('DROP TABLE IF EXISTS nomination_signatures');
    $db->exec('DROP TABLE IF EXISTS applications');
}
