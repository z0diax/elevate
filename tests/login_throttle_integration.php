<?php
declare(strict_types=1);
require_once __DIR__ . '/test_database_guard.php';
require_test_database();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/login_throttle.php';
putenv('VERCEL_CONTAINER=0');
putenv('TRUSTED_PROXY_IPS=');
$db = (new Database())->getConnection();
if (!$db) throw new RuntimeException('Dedicated test database is unavailable.');
if (($argv[1] ?? '') === 'worker') {
    $result = authenticate_throttled_login($db, (string)getenv('TEST_THROTTLE_EMAIL'), 'incorrect', ['REMOTE_ADDR' => '192.0.2.99']);
    echo $result['status'];
    exit();
}
function throttleDbCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
foreach ($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
    if ((int)$db->query('SELECT COUNT(*) FROM `' . str_replace('`', '``', $table) . '`')->fetchColumn() !== 0) throw new RuntimeException('Throttle integration requires an empty dedicated test database.');
}
$run = bin2hex(random_bytes(6));
$id = 'throttle-test-' . $run;
$email = 'throttle-' . $run . '@example.invalid';
$password = bin2hex(random_bytes(16));
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 4]);
$db->prepare("INSERT INTO profiles (id, email, full_name, role, password_hash, must_change_password) VALUES (?, ?, 'Synthetic throttle user', 'NOMINEE', ?, 0)")->execute([$id, $email, $hash]);
$login = static fn(string $address, string $secret, string $source = '192.0.2.1'): array => authenticate_throttled_login($db, $address, $secret, ['REMOTE_ADDR' => $source]);
$account = login_throttle_key('account:' . $id);
$source = login_throttle_key('source:192.0.2.1');
$children = [];
try {
    for ($i = 1; $i <= 8; $i++) {
        $result = $login($email, 'wrong');
        throttleDbCheck($result['status'] === ($i < 8 ? 401 : 429), 'Incorrect account threshold.');
    }
    throttleDbCheck($login(strtoupper($email), $password, '192.0.2.2')['status'] === 429, 'Case variation bypassed the account limit.');
    throttleDbCheck($login(str_replace('throttle', 'thrôttle', $email), $password, '192.0.2.3')['status'] === 429, 'Database collation alias bypassed the account limit.');
    $db->prepare('UPDATE login_throttle SET blocked_until = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE email_hash = ?')->execute([$account]);
    throttleDbCheck($login($email, $password)['status'] === 200, 'Correct password did not work after cooldown.');
    $count = $db->prepare('SELECT failed_count FROM login_throttle WHERE email_hash = ?');
    $count->execute([$account]); throttleDbCheck($count->fetchColumn() === false, 'Success did not reset account failures.');
    $count->execute([$source]); throttleDbCheck((int)$count->fetchColumn() === 8, 'Success reset unrelated source failures.');
    $db->exec('DELETE FROM login_throttle');
    $db->prepare('INSERT INTO login_throttle (email_hash, failed_count, window_started_at) VALUES (?, 7, UTC_TIMESTAMP() - INTERVAL 901 SECOND)')->execute([$account]);
    $db->exec("SET time_zone = '+08:00'");
    throttleDbCheck($login($email, 'wrong')['status'] === 401, 'A non-UTC database timezone broke window expiry.');
    $count->execute([$account]); throttleDbCheck((int)$count->fetchColumn() === 1, 'Expired window did not restart at one.');
    $db->exec("SET time_zone = '+00:00'");
    $db->exec('DELETE FROM login_throttle');
    for ($i = 1; $i <= 50; $i++) {
        $result = $login('missing-' . $run . '-' . $i . '@example.invalid', 'wrong');
        throttleDbCheck($result['status'] === ($i < 50 ? 401 : 429), 'Incorrect cross-account source threshold.');
    }
    $rows = (int)$db->query('SELECT COUNT(*) FROM login_throttle')->fetchColumn();
    throttleDbCheck($login('another-missing@example.invalid', 'wrong')['status'] === 429, 'Blocked source bypassed the limit with another email.');
    throttleDbCheck((int)$db->query('SELECT COUNT(*) FROM login_throttle')->fetchColumn() === $rows, 'Blocked requests created unbounded counter records.');
    throttleDbCheck($login($email, $password)['status'] === 429, 'Correct credentials bypassed a source cooldown.');
    throttleDbCheck($login($email, $password, '198.51.100.1')['status'] === 200, 'An unrelated source was blocked.');
    $db->exec('DELETE FROM login_throttle');
    $oldKey = login_throttle_key('old-fixture:' . $run);
    $db->prepare('INSERT INTO login_throttle (email_hash, failed_count, window_started_at, updated_at) VALUES (?, 1, UTC_TIMESTAMP() - INTERVAL 2 DAY, UTC_TIMESTAMP() - INTERVAL 2 DAY)')->execute([$oldKey]);
    $login($email, 'wrong');
    $count->execute([$oldKey]); throttleDbCheck($count->fetchColumn() === false, 'Expired throttle metadata was not cleaned up.');
    $db->exec('DELETE FROM login_throttle');

    // Separate PHP workers exercise real concurrent transactions, not the single-threaded HTTP test server.
    putenv('TEST_THROTTLE_EMAIL=' . $email);
    for ($i = 0; $i < 12; $i++) {
        $pipes = [];
        $process = proc_open([PHP_BINARY, __FILE__, 'worker'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, null, ['bypass_shell' => true, 'create_no_window' => true]);
        if (!is_resource($process)) throw new RuntimeException('Unable to start concurrency worker.');
        fclose($pipes[0]); $children[] = [$process, $pipes];
    }
    $statuses = [];
    foreach ($children as [$process, $pipes]) {
        $statuses[] = (int)stream_get_contents($pipes[1]);
        $error = stream_get_contents($pipes[2]);
        fclose($pipes[1]); fclose($pipes[2]);
        throttleDbCheck(proc_close($process) === 0, 'Concurrent worker failed: ' . $error);
    }
    $children = [];
    throttleDbCheck(count(array_filter($statuses, static fn(int $status): bool => $status === 401)) === 7, 'Concurrent requests exceeded the account budget.');
    throttleDbCheck(count(array_filter($statuses, static fn(int $status): bool => $status === 429)) === 5, 'Concurrent requests were not blocked consistently.');
    $count->execute([$account]); throttleDbCheck((int)$count->fetchColumn() === 8, 'Concurrent failures were lost or over-counted.');
    echo "Login throttle database, cooldown, collation, source and concurrency checks passed.\n";
} finally {
    foreach ($children as [$process, $pipes]) {
        if (is_resource($process)) proc_terminate($process);
        foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    }
    if ($db->inTransaction()) $db->rollBack();
    $db->exec('DELETE FROM login_throttle');
    $db->prepare('DELETE FROM profiles WHERE id = ?')->execute([$id]);
    putenv('TEST_THROTTLE_EMAIL');
}
