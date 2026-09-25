<?php
declare(strict_types=1);

function praise_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $isSecure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => $isSecure,
    ]);

    session_start();
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
}

function clear_auth_session(): void {
    praise_start_session();
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool)$params['secure'], (bool)$params['httponly']);
    }

    session_destroy();
}

function require_auth($db, array $roles = []): array {
    $user = get_session_user($db);
    if (!$user) {
        sendResponse(401, [], 'Authentication required.');
    }

    require_csrf();

    if (!empty($roles) && !in_array($user['role'], $roles, true)) {
        sendResponse(403, [], 'You are not authorized to perform this action.');
    }

    return $user;
}

function require_application_access(PDO $db, array $actor, string $applicationId): array {
    $applicationId = requireId($applicationId, 'application ID');
    $stmt = $db->prepare('SELECT id, nominator_id, nominee_id, office_id, status, processing_stage, assigned_evaluators FROM applications WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $applicationId]);
    $application = $stmt->fetch();
    if (!$application) sendResponse(404, [], 'Application not found.');
    $role = $actor['role'];
    $own = $application['nominator_id'] === $actor['id'] || $application['nominee_id'] === $actor['id'];
    if ($application['status'] === 'Draft' && $application['nominator_id'] !== $actor['id']) sendResponse(404, [], 'Application not found.');
    if ($application['status'] === 'Draft') return $application;
    if ($role === 'ADMINISTRATOR') return $application;
    if ($role === 'EVALUATOR') {
        $rows = $db->prepare('SELECT evaluator_id, status FROM application_evaluator_assignments WHERE application_id = :id');
        $rows->execute([':id' => $applicationId]);
        $assignments = $rows->fetchAll();
        if ($assignments) {
            foreach ($assignments as $assignment) {
                if ($assignment['evaluator_id'] === $actor['id'] && $assignment['status'] !== 'Reassigned') return $application;
            }
        } else {
            $legacy = json_decode((string)($application['assigned_evaluators'] ?? '[]'), true);
            if (is_array($legacy) && in_array($actor['id'], $legacy, true)) return $application;
        }
        sendResponse(404, [], 'Application not found.');
    }
    if ($own) return $application;
    if ($role === 'HEAD_OF_OFFICE' && !empty($actor['office_id']) && $application['office_id'] === $actor['office_id']) return $application;
    if ($role === 'SECRETARIAT' && in_array($application['processing_stage'], ['Document Verification', 'Evaluation', 'Deliberation', 'Final Decision', 'Awarded'], true)) return $application;
    sendResponse(404, [], 'Application not found.');
}
