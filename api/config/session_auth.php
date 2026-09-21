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

    if (!empty($roles) && !in_array($user['role'], $roles, true)) {
        sendResponse(403, [], 'You are not authorized to perform this action.');
    }

    return $user;
}
