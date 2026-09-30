<?php
declare(strict_types=1);

function sendResponse(int $status, array $data = [], string $message = ''): never {
    throw new RuntimeException("{$status}: {$message}");
}

require_once __DIR__ . '/test_database_guard.php';
require_test_database();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/validation.php';
require_once __DIR__ . '/../api/config/session_auth.php';
require_once __DIR__ . '/../api/services/EvaluationRoutingService.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

function expect_reassignment_error(callable $action, int $status): void {
    try {
        $action();
    } catch (EvaluatorReassignmentError $error) {
        check($error->httpStatus === $status, "Expected HTTP {$status}, got {$error->httpStatus}.");
        return;
    }
    throw new RuntimeException("Expected reassignment error {$status}.");
}

$db = (new Database())->getConnection();
if (!$db) throw new RuntimeException('MySQL is required for the reassignment regression test.');
// These tables exist only in this connection and shadow permanent tables.
$db->exec('CREATE TEMPORARY TABLE applications (id VARCHAR(64) PRIMARY KEY, application_number VARCHAR(64), status VARCHAR(64), processing_stage VARCHAR(64), nominator_id VARCHAR(64), nominee_id VARCHAR(64), office_id VARCHAR(64), assigned_evaluators JSON NULL, final_weighted_score DECIMAL(5,2) NULL, updated_at DATETIME NULL) ENGINE=InnoDB');
$db->exec('CREATE TEMPORARY TABLE profiles (id VARCHAR(64) PRIMARY KEY, full_name VARCHAR(255), role VARCHAR(50), is_active TINYINT) ENGINE=InnoDB');
$db->exec('CREATE TEMPORARY TABLE application_evaluator_assignments (id VARCHAR(64) PRIMARY KEY, application_id VARCHAR(64), evaluator_id VARCHAR(64), route_id VARCHAR(64) NULL, sequence_no INT, status VARCHAR(50), assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME NULL, UNIQUE KEY uq_application_evaluator (application_id, evaluator_id)) ENGINE=InnoDB');
$db->exec('CREATE TEMPORARY TABLE application_history (id VARCHAR(64) PRIMARY KEY, application_id VARCHAR(64), user_id VARCHAR(64), user_name VARCHAR(255), user_role VARCHAR(50), action VARCHAR(100), previous_status VARCHAR(64), new_status VARCHAR(64), remarks TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
$db->exec('CREATE TEMPORARY TABLE notifications (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), target_role VARCHAR(50), application_id VARCHAR(64), application_number VARCHAR(64), title VARCHAR(255), message TEXT, link_tab VARCHAR(100)) ENGINE=InnoDB');
$db->exec('CREATE TEMPORARY TABLE award_route_evaluators (route_id VARCHAR(64), evaluator_id VARCHAR(64)) ENGINE=InnoDB');
$db->exec('CREATE TEMPORARY TABLE evaluations (application_id VARCHAR(64), evaluator_id VARCHAR(64), weighted_percentage DECIMAL(5,2), is_submitted TINYINT) ENGINE=InnoDB');

$admin = ['id' => 'admin', 'full_name' => 'Test Administrator', 'role' => 'ADMINISTRATOR'];
$checks = 0;
function fixture(PDO $db, string $oldStatus = 'Pending'): void {
    foreach (['notifications', 'application_history', 'evaluations', 'application_evaluator_assignments', 'award_route_evaluators', 'applications', 'profiles'] as $table) {
        $db->exec("DELETE FROM {$table}");
    }
    $db->exec("INSERT INTO applications (id, application_number, status, processing_stage, nominator_id, nominee_id, office_id, assigned_evaluators) VALUES ('app-1', 'NOM-101', 'For Evaluation', 'Evaluation', 'filer', 'nominee', 'office', JSON_ARRAY('A','B','C'))");
    $users = [
        ['admin', 'Test Administrator', 'ADMINISTRATOR', 1],
        ['A', 'Evaluator A', 'EVALUATOR', 1], ['B', 'Evaluator B', 'EVALUATOR', 1],
        ['C', 'Evaluator C', 'EVALUATOR', 1], ['D', 'Evaluator D', 'EVALUATOR', 1],
        ['E', 'Inactive Evaluator', 'EVALUATOR', 0],
        ['head', 'Office Head', 'HEAD_OF_OFFICE', 1],
        ['secretariat', 'Secretariat User', 'SECRETARIAT', 1],
        ['nominee', 'Nominee User', 'NOMINEE', 1],
    ];
    $profileInsert = $db->prepare('INSERT INTO profiles (id, full_name, role, is_active) VALUES (?, ?, ?, ?)');
    foreach ($users as $user) $profileInsert->execute($user);
    $assignmentInsert = $db->prepare('INSERT INTO application_evaluator_assignments (id, application_id, evaluator_id, route_id, sequence_no, status) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ([['A', 'Pending', 1], ['B', 'Pending', 2], ['C', $oldStatus, 3]] as [$id, $status, $sequence]) {
        $assignmentInsert->execute(["assign-{$id}", 'app-1', $id, 'route-1', $sequence, $status]);
        $db->prepare('INSERT INTO award_route_evaluators (route_id, evaluator_id) VALUES (?, ?)')->execute(['route-1', $id]);
    }
}

function statuses(PDO $db): array {
    return $db->query('SELECT evaluator_id, status FROM application_evaluator_assignments ORDER BY evaluator_id')->fetchAll(PDO::FETCH_KEY_PAIR);
}

function progress(PDO $db): array {
    return $db->query("SELECT SUM(status <> 'Reassigned') AS active_count, SUM(status = 'Completed') AS completed_count FROM application_evaluator_assignments WHERE application_id = 'app-1'")->fetch(PDO::FETCH_ASSOC);
}

fixture($db);
$db->exec('DELETE FROM application_evaluator_assignments');
try {
    require_application_access($db, ['id' => 'A', 'role' => 'EVALUATOR'], 'app-1');
    throw new RuntimeException('Legacy JSON alone granted evaluator access.');
} catch (RuntimeException $error) {
    check(str_starts_with($error->getMessage(), '404:'), 'Unexpected legacy-only access result.');
}
$checks++;

fixture($db);
check(require_application_access($db, ['id' => 'A', 'role' => 'EVALUATOR'], 'app-1')['id'] === 'app-1', 'Active assigned evaluator lacks access.');
try {
    require_application_access($db, ['id' => 'E', 'role' => 'EVALUATOR'], 'app-1');
    throw new RuntimeException('Unassigned evaluator gained access.');
} catch (RuntimeException $error) {
    check(str_starts_with($error->getMessage(), '404:'), 'Unexpected unassigned access result.');
}
$checks++;

fixture($db);
$oldBefore = $db->query("SELECT assigned_at, route_id, sequence_no FROM application_evaluator_assignments WHERE evaluator_id = 'C'")->fetch(PDO::FETCH_ASSOC);
reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D');
check(statuses($db) === ['A' => 'Pending', 'B' => 'Pending', 'C' => 'Reassigned', 'D' => 'Pending'], 'Pending replacement did not preserve history.');
check((int)progress($db)['active_count'] === 3, 'Active count changed after replacement.');
check((int)$db->query('SELECT COUNT(*) FROM application_history')->fetchColumn() === 1, 'History entry missing.');
check((int)$db->query('SELECT COUNT(*) FROM notifications')->fetchColumn() === 2, 'Evaluator notifications missing.');
check($db->query("SELECT GROUP_CONCAT(evaluator_id ORDER BY evaluator_id) FROM award_route_evaluators")->fetchColumn() === 'A,B,C', 'Award route changed.');
$oldAfter = $db->query("SELECT assigned_at, route_id, sequence_no FROM application_evaluator_assignments WHERE evaluator_id = 'C'")->fetch(PDO::FETCH_ASSOC);
$newAssignment = $db->query("SELECT route_id, sequence_no FROM application_evaluator_assignments WHERE evaluator_id = 'D'")->fetch(PDO::FETCH_ASSOC);
check($oldAfter === $oldBefore && $newAssignment['route_id'] === null && $newAssignment['sequence_no'] === $oldBefore['sequence_no'], 'Assignment provenance or order changed.');
$history = $db->query('SELECT user_id, user_name, action, remarks, created_at FROM application_history LIMIT 1')->fetch(PDO::FETCH_ASSOC);
check($history['user_id'] === 'admin' && $history['user_name'] === 'Test Administrator' && $history['action'] === 'Evaluator Reassigned' && $history['created_at'] !== null, 'Administrator audit details missing.');
check(str_contains($history['remarks'], 'Evaluator C') && str_contains($history['remarks'], 'Evaluator D') && str_contains($history['remarks'], 'NOM-101'), 'Reassignment history is incomplete.');
check($db->query('SELECT GROUP_CONCAT(user_id ORDER BY user_id) FROM notifications')->fetchColumn() === 'C,D', 'Wrong evaluator notifications were created.');
$checks++;

fixture($db, 'In Progress');
$db->exec("INSERT INTO evaluations (application_id, evaluator_id, weighted_percentage, is_submitted) VALUES ('app-1', 'C', 42.00, 1)");
$db->exec("UPDATE applications SET final_weighted_score = 42.00 WHERE id = 'app-1'");
reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D');
check(statuses($db)['C'] === 'Reassigned' && statuses($db)['D'] === 'Pending', 'In-progress replacement failed.');
check((int)$db->query("SELECT COUNT(*) FROM evaluations WHERE evaluator_id = 'C'")->fetchColumn() === 1, 'Old evaluation data was deleted.');
check($db->query("SELECT final_weighted_score FROM applications WHERE id = 'app-1'")->fetchColumn() === null, 'Stale consolidated score was retained.');
check((int)$db->query("SELECT COUNT(*) FROM evaluations e JOIN application_evaluator_assignments a ON a.application_id = e.application_id AND a.evaluator_id = e.evaluator_id WHERE e.is_submitted = 1 AND a.status <> 'Reassigned'")->fetchColumn() === 0, 'Old evaluation still contributes to active scoring.');
try {
    require_application_access($db, ['id' => 'C', 'role' => 'EVALUATOR'], 'app-1');
    throw new RuntimeException('Reassigned evaluator retained access.');
} catch (RuntimeException $error) {
    check(str_starts_with($error->getMessage(), '404:'), 'Unexpected access check result.');
}
check(require_application_access($db, ['id' => 'D', 'role' => 'EVALUATOR'], 'app-1')['id'] === 'app-1', 'Replacement evaluator lacks access.');
$checks++;

fixture($db, 'Completed');
$db->exec("INSERT INTO evaluations (application_id, evaluator_id, weighted_percentage, is_submitted) VALUES ('app-1', 'C', 88.00, 1)");
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D'), 409);
check(statuses($db)['C'] === 'Completed' && (int)$db->query('SELECT COUNT(*) FROM evaluations')->fetchColumn() === 1, 'Completed evaluation changed.');
$checks++;

fixture($db);
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', 'B'), 409);
check(count(statuses($db)) === 3, 'Duplicate replacement changed assignments.');
$checks++;

fixture($db);
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', 'E'), 409);
check(statuses($db)['C'] === 'Pending', 'Inactive evaluator attempt changed assignments.');
$checks++;

foreach (['head', 'secretariat', 'admin', 'nominee'] as $replacementId) {
    fixture($db);
    expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', $replacementId), 400);
    check(statuses($db)['C'] === 'Pending', 'Wrong-role attempt changed assignments.');
    $checks++;
}

foreach (['SECRETARIAT', 'HEAD_OF_OFFICE', 'EVALUATOR', 'NOMINEE'] as $role) {
    fixture($db);
    expect_reassignment_error(fn() => reassign_application_evaluator($db, ['id' => 'other', 'role' => $role], 'app-1', 'C', 'D'), 403);
    check(statuses($db)['C'] === 'Pending', 'Non-Administrator attempt changed assignments.');
    $checks++;
}

fixture($db);
$db->exec("UPDATE application_evaluator_assignments SET status = 'Completed' WHERE evaluator_id IN ('A', 'B')");
reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D');
$before = progress($db);
check((int)$before['active_count'] === 3 && (int)$before['completed_count'] === 2, 'Reassigned row affected completion count.');
$db->exec("UPDATE application_evaluator_assignments SET status = 'Completed' WHERE evaluator_id = 'D'");
$after = progress($db);
check((int)$after['active_count'] === 3 && (int)$after['completed_count'] === 3, 'Replacement completion was not counted.');
$checks++;

fixture($db);
reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D');
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', 'E'), 409);
check(count(statuses($db)) === 4 && (int)$db->query('SELECT COUNT(*) FROM application_history')->fetchColumn() === 1, 'Double reassignment created extra records.');
$checks++;

fixture($db);
reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D');
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'A', 'C'), 409);
check(count(statuses($db)) === 4, 'A historical evaluator was assigned a second time.');
$checks++;

fixture($db);
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', 'C'), 400);
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'missing', 'D'), 404);
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', 'missing'), 404);
$db->exec("UPDATE applications SET status = 'Evaluation Completed', processing_stage = 'Deliberation' WHERE id = 'app-1'");
expect_reassignment_error(fn() => reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D'), 409);
check(count(statuses($db)) === 3, 'Invalid requests changed assignments.');
$checks++;

fixture($db);
$db->exec("UPDATE applications SET final_weighted_score = 50.00 WHERE id = 'app-1'");
$db->exec('ALTER TABLE notifications ADD UNIQUE KEY uq_one_notification_per_app (application_id)');
try {
    reassign_application_evaluator($db, $admin, 'app-1', 'C', 'D');
    throw new RuntimeException('Expected temporary notification constraint failure.');
} catch (PDOException $error) {
    check(statuses($db)['C'] === 'Pending' && !isset(statuses($db)['D']), 'Failed transaction did not restore assignments.');
    check((int)$db->query('SELECT COUNT(*) FROM application_history')->fetchColumn() === 0, 'Failed transaction retained history.');
    check((float)$db->query("SELECT final_weighted_score FROM applications WHERE id = 'app-1'")->fetchColumn() === 50.0, 'Failed transaction changed the consolidated score.');
}
$checks++;

echo "Passed {$checks} reassignment transaction scenarios using temporary MySQL tables.\n";
