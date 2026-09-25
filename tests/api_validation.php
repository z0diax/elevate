<?php
declare(strict_types=1);

function sendResponse($status, $data = [], $message = ''): never {
    throw new RuntimeException((string)$status . ': ' . $message);
}

require_once __DIR__ . '/../api/config/validation.php';

$checks = 0;
function accepts(callable $test): void {
    global $checks;
    $test();
    $checks++;
}
function rejects(callable $test): void {
    global $checks;
    try {
        $test();
    } catch (RuntimeException $error) {
        if (!str_starts_with($error->getMessage(), '400:')) throw $error;
        $checks++;
        return;
    }
    throw new RuntimeException('Expected a 400 validation error.');
}

foreach (['app-123', 'a1', 'usr-17_2'] as $id) accepts(fn() => requireId($id));
foreach (['', '0 OR 1=1', "1' OR '1'='1", "'; DROP TABLE users; --", '1 UNION SELECT x', 'admin\'--', '%27%20OR%201%3D1', '-5', str_repeat('x', 65), [], new stdClass()] as $id) rejects(fn() => requireId($id));
foreach ([0, 10, 10.25, '7.5'] as $score) accepts(fn() => requireDecimal($score, 'score', 0, 10.25));
foreach ([-1, 11, 999999, 'NaN', '1e2', '1.234', [], null] as $score) rejects(fn() => requireDecimal($score, 'score', 0, 10.25));
foreach ([true, false, 1, 0, '1', '0'] as $boolean) accepts(fn() => requireBool($boolean, 'flag'));
foreach (['false', 'yes', 2, [], null] as $boolean) rejects(fn() => requireBool($boolean, 'flag'));
accepts(fn() => requireDate('2026-09-25', 'date'));
foreach (['2026-99-99', '2026-02-30', 'random text'] as $date) rejects(fn() => requireDate($date, 'date'));
foreach ([-1, 0, 999999999, 'abc', '1 OR 1=1'] as $limit) rejects(fn() => requireIntRange($limit, 'limit', 1, 100));
accepts(fn() => requireIntRange('100', 'limit', 1, 100));
rejects(fn() => requireFields(['name' => 'Test', 'role' => 'ADMINISTRATOR'], ['name']));
rejects(fn() => requireFields(['title' => 'Test', 'status' => 'Approved'], ['title']));
rejects(fn() => requireFields(['sort' => 'created_at DESC; DROP TABLE users'], []));

echo "Passed {$checks} validation checks.\n";
