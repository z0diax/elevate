<?php
declare(strict_types=1);

require_once __DIR__ . '/test_database_guard.php';
require_test_database();
require_once __DIR__ . '/../api/config/database.php';

$mode = $argv[1] ?? '';
if (!in_array($mode, ['setup', 'cleanup', 'verify-empty'], true)) throw new RuntimeException('Use setup, cleanup, or verify-empty.');
$run = (string)(getenv('TEST_RUN_ID') ?: '');
if ($mode !== 'verify-empty' && !preg_match('/^[a-f0-9]{16}$/D', $run)) throw new RuntimeException('TEST_RUN_ID must be a random 16-character hex value.');
$db = (new Database())->getConnection();
if (!$db) throw new RuntimeException('The explicitly configured test database does not exist or cannot be reached. Create an empty *_test database first.');
$tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);

if ($mode === 'verify-empty') {
    foreach ($tables as $table) {
        if ((int)$db->query('SELECT COUNT(*) FROM `' . str_replace('`', '``', $table) . '`')->fetchColumn() !== 0) {
            throw new RuntimeException('The dedicated test database still contains records.');
        }
    }
    echo "Dedicated test database contains no records.\n";
    exit;
}

if ($mode === 'setup') {
    if ($tables) {
        foreach ($tables as $table) {
            if ((int)$db->query('SELECT COUNT(*) FROM `' . str_replace('`', '``', $table) . '`')->fetchColumn() !== 0) {
                throw new RuntimeException('Test database contains records. Refusing to change it. Use an empty dedicated database.');
            }
        }
    } else {
        $sql = (string)file_get_contents(__DIR__ . '/../database.sql');
        $lines = preg_split('/\r\n|\r|\n/', $sql) ?: [];
        $sql = implode("\n", array_filter($lines, static fn(string $line): bool => !str_starts_with(ltrim($line), '--')));
        $statements = preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [];
        foreach ($statements as $statement) {
            $statement = trim($statement);
            if ($statement === '' || preg_match('/^(CREATE DATABASE|USE |INSERT INTO|DROP TABLE)/i', $statement)) continue;
            $db->exec($statement);
        }
    }
    $id = static fn(string $name): string => 'test-' . $run . '-' . $name;
    $password = (string)(getenv('TEST_PASSWORD') ?: '');
    if (strlen($password) < 12) throw new RuntimeException('TEST_PASSWORD must be a random test-only password of at least 12 characters.');
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $db->beginTransaction();
    try {
        $office = $db->prepare('INSERT INTO offices (id, name, code, head_name, head_title) VALUES (?, ?, ?, ?, ?)');
        foreach (['one', 'two', 'inactive'] as $suffix) $office->execute([$id('office-' . $suffix), 'Automated Test Office ' . $suffix, 'TEST' . $run . $suffix, 'Test Head', 'Head']);
        $db->prepare('UPDATE offices SET is_active = 0 WHERE id = ?')->execute([$id('office-inactive')]);
        $users = ['admin' => 'ADMINISTRATOR', 'secretary' => 'SECRETARIAT', 'head' => 'HEAD_OF_OFFICE', 'other-head' => 'HEAD_OF_OFFICE', 'filer' => 'NOMINEE', 'other-filer' => 'NOMINEE', 'A' => 'EVALUATOR', 'B' => 'EVALUATOR', 'C' => 'EVALUATOR', 'D' => 'EVALUATOR', 'E' => 'EVALUATOR', 'F' => 'EVALUATOR', 'inactive' => 'EVALUATOR', 'password-change' => 'EVALUATOR'];
        $insert = $db->prepare('INSERT INTO profiles (id, email, full_name, role, office_id, office_name, password_hash, is_active, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($users as $name => $role) {
            $other = $name === 'other-head';
            $insert->execute([$id($name), $name . '-' . $run . '@example.invalid', 'Automated Test ' . $name, $role,
                in_array($role, ['HEAD_OF_OFFICE', 'NOMINEE'], true) ? $id('office-' . ($other ? 'two' : 'one')) : null,
                in_array($role, ['HEAD_OF_OFFICE', 'NOMINEE'], true) ? 'Automated Test Office ' . ($other ? 'two' : 'one') : null,
                $hash, $name === 'inactive' ? 0 : 1, $name === 'password-change' ? 1 : 0]);
        }
        $award = $db->prepare('INSERT INTO awards (id, name, code, award_year, min_qualifying_score) VALUES (?, ?, ?, 2026, 85.00)');
        foreach (['one', 'two'] as $name) {
            $award->execute([$id('award-' . $name), 'Automated Test Award ' . $name, 'TEST' . $run . $name]);
            $db->prepare('INSERT INTO award_document_requirements (id, award_id, document_name, is_mandatory) VALUES (?, ?, ?, 1)')
                ->execute([$id('requirement-' . $name), $id('award-' . $name), 'Synthetic test attachment']);
            $db->prepare('INSERT INTO award_criteria (id, award_id, criterion_name, weight_percentage, max_score) VALUES (?, ?, ?, 100, 100)')
                ->execute([$id('criterion-' . $name), $id('award-' . $name), 'Synthetic test criterion']);
        }
        $db->commit();
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }
    echo "Test fixtures ready.\n";
    exit;
}

// Setup refuses databases with records. Cleanup is therefore limited to this run's fixtures.
$like = 'test-' . $run . '-%';
$db->beginTransaction();
try {
    $appIds = $db->prepare('SELECT id FROM applications WHERE nominator_id LIKE ?');
    $appIds->execute([$like]);
    $apps = $appIds->fetchAll(PDO::FETCH_COLUMN);
    foreach ($apps as $app) {
        $db->prepare('DELETE FROM notifications WHERE application_id = ?')->execute([$app]);
        $db->prepare('DELETE FROM applications WHERE id = ?')->execute([$app]);
    }
    foreach (['awards', 'profiles', 'offices'] as $table) $db->prepare("DELETE FROM {$table} WHERE id LIKE ?")->execute([$like]);
    $db->commit();
    echo "Test database fixtures removed.\n";
} catch (Throwable $error) {
    $db->rollBack();
    throw $error;
}
