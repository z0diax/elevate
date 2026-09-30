<?php
declare(strict_types=1);

require_once __DIR__ . '/test_database_guard.php';
require_test_database();
require_once __DIR__ . '/../api/config/database.php';

$db = (new Database())->getConnection();
if (!$db) throw new RuntimeException('Dedicated test database unavailable.');
if ($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN)) {
    throw new RuntimeException('Migration test requires its own empty dedicated test database.');
}

$created = [];
try {
    $db->exec('CREATE TABLE applications (id VARCHAR(64) NOT NULL PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $created[] = 'applications';
    $db->exec('CREATE TABLE evaluations (id VARCHAR(64) NOT NULL PRIMARY KEY, application_id VARCHAR(64) NOT NULL, evaluator_id VARCHAR(64) NOT NULL, is_submitted TINYINT(1) NOT NULL, weighted_percentage DECIMAL(5,2) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    $created[] = 'evaluations';
    $db->exec("INSERT INTO applications (id) VALUES ('legacy-app')");
    $db->exec("INSERT INTO evaluations (id, application_id, evaluator_id, is_submitted, weighted_percentage) VALUES ('legacy-eval', 'legacy-app', 'legacy-evaluator', 1, 84.50)");
    $migration = file_get_contents(__DIR__ . '/../database_migrations/20260929_evaluation_revisions.sql');
    if ($migration === false) throw new RuntimeException('Migration file unavailable.');
    foreach (explode(';', $migration) as $statement) {
        $statement = preg_replace('/^--.*$/m', '', $statement);
        if (trim($statement) !== '') $db->exec($statement);
    }
    $created[] = 'evaluation_revision_history';
    $record = $db->query("SELECT is_submitted, weighted_percentage, version_number FROM evaluations WHERE id = 'legacy-eval'")->fetch();
    if (!$record || (int)$record['is_submitted'] !== 1 || (float)$record['weighted_percentage'] !== 84.5 || (int)$record['version_number'] !== 1) {
        throw new RuntimeException('Migration changed the previous submitted evaluation.');
    }
    $db->exec("INSERT INTO evaluation_revision_history (id, application_id, evaluation_id, evaluator_id, revision_number, reason, previous_snapshot, new_snapshot) VALUES ('test-revision', 'legacy-app', 'legacy-eval', 'legacy-evaluator', 2, 'Correction', '{}', '{}')");
    echo "Existing submitted evaluation preserved; revision history is writable.\n";
} finally {
    foreach (array_reverse($created) as $table) $db->exec('DROP TABLE IF EXISTS `' . $table . '`');
}
