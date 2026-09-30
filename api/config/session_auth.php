<?php
declare(strict_types=1);
require_once __DIR__ . '/runtime.php';

function praise_session_cookie_path(): string {
    $path = dirname(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/auth.php')));
    return rtrim(str_replace('\\', '/', $path), '/') . '/';
}

function praise_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $production = app_environment() === 'production';
    $isSecure = app_is_https($_SERVER);
    if ($production && !$isSecure) throw new RuntimeException('HTTPS is required for production sessions.');
    $idle = (int)(getenv('SESSION_IDLE_SECONDS') ?: 28800);
    if ($idle < 900 || $idle > 86400) throw new RuntimeException('Invalid session inactivity timeout.');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.gc_maxlifetime', (string)$idle);
    session_name('PRAISESESSID');
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => $production || $isSecure,
        'path' => praise_session_cookie_path(),
        'lifetime' => 0,
    ]);

    session_start();
    if (isset($_SESSION['last_activity']) && time() - (int)$_SESSION['last_activity'] > $idle) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    if (isset($_SESSION['praise_user_id'])) $_SESSION['last_activity'] = time();
}

function format_profile_record(array $user): array {
    unset($user['password_hash']);
    $user['is_active'] = isset($user['is_active']) ? (bool)$user['is_active'] : true;
    $user['must_change_password'] = isset($user['must_change_password']) ? (bool)$user['must_change_password'] : false;
    return $user;
}

function get_session_user_id(): ?string {
    praise_start_session();
    return $_SESSION['praise_user_id'] ?? null;
}

function get_or_create_csrf_token(): string {
    praise_start_session();
    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token']) || $_SESSION['csrf_token'] === '') {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function require_csrf(): void {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }

    praise_start_session();
    $expected = $_SESSION['csrf_token'] ?? null;
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
    if (!is_string($expected) || $expected === '' || !is_string($provided) || !hash_equals($expected, $provided)) {
        sendResponse(403, [], 'Invalid or missing CSRF token.');
    }
}

function get_session_user($db): ?array {
    $userId = get_session_user_id();
    if (!$userId) {
        return null;
    }

    $stmt = $db->prepare("
        SELECT id, email, full_name, role, office_id, office_name, position_title,
               employee_id, contact_number, barangay, avatar_url, is_active,
               must_change_password, created_at, updated_at, last_login_at
        FROM profiles
        WHERE id = :id AND is_active = 1
        LIMIT 1
    ");
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch();

    return $user ? format_profile_record($user) : null;
}

function set_auth_session(string $userId): void {
    praise_start_session();
    session_regenerate_id(true);
    $_SESSION['praise_user_id'] = $userId;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    $_SESSION['last_activity'] = time();
}

function clear_auth_session(): void {
    praise_start_session();
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => (bool)$params['secure'],
            'httponly' => (bool)$params['httponly'],
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }

    session_destroy();
}

function require_auth($db, array $roles = [], bool $allowPasswordChange = false): array {
    $user = get_session_user($db);
    if (!$user) {
        sendResponse(401, [], 'Authentication required.');
    }

    require_csrf();

    if (!$allowPasswordChange && !empty($user['must_change_password'])) {
        sendResponse(403, [], 'Password change required.');
    }

    if (!empty($roles) && !in_array($user['role'], $roles, true)) {
        sendResponse(403, [], 'You are not authorized to perform this action.');
    }

    return $user;
}

function require_application_access(PDO $db, array $actor, string $applicationId): array {
    $applicationId = requireId($applicationId, 'application ID');
    $stmt = $db->prepare('SELECT id, nominator_id, nominee_id, office_id, status, processing_stage FROM applications WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $applicationId]);
    $application = $stmt->fetch();
    if (!$application) sendResponse(404, [], 'Application not found.');
    $role = $actor['role'];
    $own = $application['nominator_id'] === $actor['id'] || $application['nominee_id'] === $actor['id'];
    if ($application['status'] === 'Draft' && $application['nominator_id'] !== $actor['id']) sendResponse(404, [], 'Application not found.');
    if ($application['status'] === 'Draft') return $application;
    if ($role === 'ADMINISTRATOR') return $application;
    if ($role === 'EVALUATOR') {
        $assignment = $db->prepare("SELECT 1 FROM application_evaluator_assignments WHERE application_id = :id AND evaluator_id = :evaluator_id AND status <> 'Reassigned' LIMIT 1");
        $assignment->execute([':id' => $applicationId, ':evaluator_id' => $actor['id']]);
        if ($assignment->fetchColumn() !== false) return $application;
        sendResponse(404, [], 'Application not found.');
    }
    if ($own) return $application;
    if ($role === 'HEAD_OF_OFFICE' && !empty($actor['office_id']) && $application['office_id'] === $actor['office_id']) return $application;
    if ($role === 'SECRETARIAT' && in_array($application['processing_stage'], ['Document Verification', 'Evaluation', 'Deliberation', 'Final Decision', 'Awarded'], true)) return $application;
    sendResponse(404, [], 'Application not found.');
}
