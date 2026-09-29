<?php
declare(strict_types=1);

function sendResponse(int $status, array $data = [], string $message = ''): never {
    throw new RuntimeException((string)$status . ': ' . $message);
}

require_once __DIR__ . '/../api/config/session_auth.php';
require_once __DIR__ . '/../api/config/export_profiles.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

final class ProfileExportStatement {
    public function __construct(private array $rows) {}
    public function fetchAll(int $mode): array { return $this->rows; }
}

final class ProfileExportDb {
    public function __construct(private array $rows) {}
    public function query(string $sql): ProfileExportStatement {
        check((bool)preg_match('/^SELECT (.+) FROM profiles$/D', $sql, $matches), 'Unexpected profile export query.');
        $columns = array_map('trim', explode(',', $matches[1]));
        check(!in_array('*', $columns, true), 'Profile export must list safe columns.');
        $selected = array_flip($columns);
        return new ProfileExportStatement(array_map(
            static fn(array $row): array => array_intersect_key($row, $selected),
            $this->rows
        ));
    }
}

final class AuthStatement {
    private ?string $id = null;
    public function __construct(private array $users) {}
    public function execute(array $params): void { $this->id = $params[':id']; }
    public function fetch(): array|false { return $this->users[$this->id] ?? false; }
}

final class AuthDb {
    public function __construct(private array $users) {}
    public function prepare(string $sql): AuthStatement { return new AuthStatement($this->users); }
}

$row = [
    'id' => 'admin', 'email' => 'admin@example.test', 'full_name' => 'Administrator',
    'role' => 'ADMINISTRATOR', 'office_id' => null, 'is_active' => 1,
    'password_hash' => 'fixture-secret-hash',
];
$profiles = export_safe_profiles(new ProfileExportDb([$row]));
check(count($profiles) === 1, 'Profile record was omitted.');
foreach (['id', 'email', 'full_name', 'role', 'office_id', 'is_active'] as $field) {
    check(array_key_exists($field, $profiles[0]), "Safe profile field missing: {$field}");
}
check(!array_key_exists('password_hash', $profiles[0]), 'Password hash was exported.');
$json = json_encode(['profiles' => $profiles], JSON_THROW_ON_ERROR);
check(!str_contains($json, '"password_hash"') && !str_contains($json, 'fixture-secret-hash'), 'Credential material appears in JSON.');

$_SERVER['REQUEST_METHOD'] = 'GET';
praise_start_session();
$db = new AuthDb([
    'admin' => $row,
    'evaluator' => ['id' => 'evaluator', 'role' => 'EVALUATOR', 'is_active' => 1],
]);
$_SESSION['praise_user_id'] = 'admin';
check(require_auth($db, ['ADMINISTRATOR'])['role'] === 'ADMINISTRATOR', 'Administrator was denied.');

foreach ([['evaluator', '403:'], [null, '401:']] as [$userId, $expected]) {
    if ($userId === null) unset($_SESSION['praise_user_id']);
    else $_SESSION['praise_user_id'] = $userId;
    try {
        require_auth($db, ['ADMINISTRATOR']);
        throw new RuntimeException('Unauthorized user was allowed.');
    } catch (RuntimeException $error) {
        check(str_starts_with($error->getMessage(), $expected), 'Unexpected authorization result.');
    }
}

unset($_SESSION['praise_user_id']);
session_destroy();
echo "Export profile and authorization checks passed.\n";
