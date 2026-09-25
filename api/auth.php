<?php
declare(strict_types=1);

/**
 * Auth, sessions, and user profile management API.
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

header('Cache-Control: no-store');

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function validate_account_office(PDO $db, $officeId): void {
    if ($officeId === null || $officeId === '') return;
    $officeId = requireId($officeId, 'office ID');
    $stmt = $db->prepare('SELECT id FROM offices WHERE id = :id AND is_active = 1');
    $stmt->execute([':id' => $officeId]);
    if (!$stmt->fetch()) sendResponse(400, [], 'Office not found.');
}

if ($method === 'GET') {
    if ($action === 'current') {
        $currentUser = get_session_user($db);
        if (!$currentUser) {
            sendResponse(200, null, 'No active session.');
        }
        $currentUser['csrf_token'] = get_or_create_csrf_token();
        sendResponse(200, $currentUser);
    }

    $actor = require_auth($db);

    if (isset($_GET['id'])) {
        $_GET['id'] = requireId($_GET['id'], 'user ID');
        if ($actor['role'] !== 'ADMINISTRATOR' && (string)$_GET['id'] !== (string)$actor['id']) {
            sendResponse(403, [], 'You are not authorized to view this user.');
        }
        $stmt = $db->prepare("
            SELECT id, email, full_name, role, office_id, office_name, position_title,
                   employee_id, contact_number, barangay, avatar_url, is_active,
                   must_change_password, created_at, updated_at, last_login_at
            FROM profiles
            WHERE id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $_GET['id']]);
        $user = $stmt->fetch();

        if (!$user) {
            sendResponse(404, [], 'User not found.');
        }

        sendResponse(200, format_profile_record($user));
    }

    if ($actor['role'] !== 'ADMINISTRATOR') {
        sendResponse(200, [$actor]);
    }
    $role = $_GET['role'] ?? null;
    if ($role !== null && !in_array($role, ['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'EVALUATOR', 'NOMINEE'], true)) sendResponse(400, [], 'Invalid user role.');
    $sql = "
        SELECT id, email, full_name, role, office_id, office_name, position_title,
               employee_id, contact_number, barangay, avatar_url, is_active,
               must_change_password, created_at, updated_at, last_login_at
        FROM profiles
    ";
    $params = [];

    if ($role) {
        $sql .= " WHERE role = :role";
        $params[':role'] = $role;
    }

    $sql .= " ORDER BY full_name ASC";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $users = array_map('format_profile_record', $stmt->fetchAll());

    sendResponse(200, $users);
}

if ($method === 'POST') {
    $data = $action === 'logout' ? [] : getJsonInput();

    if ($action === 'login') {
        requireFields($data, ['email', 'password']);
        $email = trim(requireText($data['email'] ?? '', 'email', 255));
        $password = requireText($data['password'] ?? '', 'password', 1024);

        if ($email === '' || $password === '') {
            sendResponse(400, [], 'Email and password are required.');
        }

        $stmt = $db->prepare("
            SELECT *
            FROM profiles
            WHERE email = :email
            LIMIT 1
        ");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !(bool)$user['is_active']) {
            sendResponse(401, [], 'Invalid credentials.');
        }

        if (!password_verify($password, $user['password_hash'])) {
            sendResponse(401, [], 'Invalid credentials.');
        }

        set_auth_session($user['id']);
        $db->prepare("UPDATE profiles SET last_login_at = NOW() WHERE id = :id")->execute([':id' => $user['id']]);

        $profile = format_profile_record($user);
        $profile['csrf_token'] = get_or_create_csrf_token();
        sendResponse(200, $profile, 'Login successful.');
    }

    if ($action === 'logout') {
        require_auth($db);
        clear_auth_session();
        sendResponse(200, null, 'Logout successful.');
    }

    if ($action === 'register_nominee') {
        requireFields($data, ['full_name', 'email', 'password']);
        $fullName = trim(requireText($data['full_name'] ?? '', 'full name', 255));
        $email = trim(requireText($data['email'] ?? '', 'email', 255));
        $password = requireText($data['password'] ?? '', 'password', 1024);

        if ($fullName === '' || $email === '' || $password === '') {
            sendResponse(400, [], 'Full name, email, and password are required.');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendResponse(400, [], 'Please provide a valid email address.');
        }

        if (strlen($password) < 8) {
            sendResponse(400, [], 'Password must be at least 8 characters long.');
        }

        $existingUser = $db->prepare('SELECT id FROM profiles WHERE email = :email LIMIT 1');
        $existingUser->execute([':email' => $email]);
        if ($existingUser->fetch()) {
            sendResponse(409, [], 'An account already exists for this email address.');
        }

        $id = 'usr-' . time() . '-' . rand(100, 999);
        $db->prepare("\n            INSERT INTO profiles (id, email, full_name, role, password_hash, is_active, must_change_password)\n            VALUES (:id, :email, :full_name, 'NOMINEE', :password_hash, 1, 0)\n        ")->execute([
            ':id' => $id,
            ':email' => $email,
            ':full_name' => $fullName,
            ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);

        $stmt = $db->prepare("\n            SELECT id, email, full_name, role, office_id, office_name, position_title,\n                   employee_id, contact_number, barangay, avatar_url, is_active,\n                   must_change_password, created_at, updated_at, last_login_at\n            FROM profiles\n            WHERE id = :id\n        ");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();

        set_auth_session($id);
        $db->prepare('UPDATE profiles SET last_login_at = NOW() WHERE id = :id')->execute([':id' => $id]);

        $profile = format_profile_record($user);
        $profile['csrf_token'] = get_or_create_csrf_token();
        sendResponse(201, $profile, 'Nominee account created successfully.');
    }

    require_auth($db, ['ADMINISTRATOR']);
    requireFields($data, ['full_name', 'email', 'role', 'password', 'office_id', 'office_name', 'position_title', 'employee_id', 'contact_number', 'barangay', 'is_active', 'must_change_password']);

    if (empty($data['full_name']) || empty($data['email']) || empty($data['role']) || empty($data['password'])) {
        sendResponse(400, [], 'full_name, email, role, and password are required.');
    }
    if (!in_array($data['role'], ['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'EVALUATOR', 'NOMINEE'], true)) {
        sendResponse(400, [], 'Invalid user role.');
    }
    requireEmail($data['email']);
    requireText($data['full_name'], 'full name', 255, true);
    requireText($data['password'], 'password', 1024, true);
    if (strlen($data['password']) < 8) sendResponse(400, [], 'Password must be at least 8 characters long.');
    foreach (['office_name' => 255, 'position_title' => 255, 'employee_id' => 50, 'contact_number' => 50, 'barangay' => 255] as $field => $max) if (isset($data[$field])) requireText($data[$field], $field, $max);
    if (isset($data['office_id'])) $data['office_id'] = optionalId($data['office_id'], 'office ID');
    validate_account_office($db, $data['office_id'] ?? null);
    foreach (['is_active', 'must_change_password'] as $field) if (array_key_exists($field, $data)) $data[$field] = requireBool($data[$field], $field);

    $id = 'usr-' . time() . '-' . rand(100, 999);
    $stmt = $db->prepare("
        INSERT INTO profiles (
            id, email, full_name, role, office_id, office_name, position_title,
            employee_id, contact_number, barangay, password_hash, is_active, must_change_password
        ) VALUES (
            :id, :email, :full_name, :role, :office_id, :office_name, :position_title,
            :employee_id, :contact_number, :barangay, :password_hash, :is_active, :must_change_password
        )
    ");

    $stmt->execute([
        ':id' => $id,
        ':email' => trim((string)$data['email']),
        ':full_name' => trim((string)$data['full_name']),
        ':role' => $data['role'],
        ':office_id' => $data['office_id'] ?? null,
        ':office_name' => $data['office_name'] ?? null,
        ':position_title' => $data['position_title'] ?? null,
        ':employee_id' => $data['employee_id'] ?? null,
        ':contact_number' => $data['contact_number'] ?? null,
        ':barangay' => $data['barangay'] ?? null,
        ':password_hash' => password_hash((string)$data['password'], PASSWORD_DEFAULT),
        ':is_active' => !isset($data['is_active']) || $data['is_active'] ? 1 : 0,
        ':must_change_password' => !empty($data['must_change_password']) ? 1 : 0,
    ]);

    $stmt = $db->prepare("
        SELECT id, email, full_name, role, office_id, office_name, position_title,
               employee_id, contact_number, barangay, avatar_url, is_active,
               must_change_password, created_at, updated_at, last_login_at
        FROM profiles
        WHERE id = :id
    ");
    $stmt->execute([':id' => $id]);
    $user = $stmt->fetch();

    sendResponse(201, format_profile_record($user), 'User created successfully.');
}

if ($method === 'PUT') {
    require_auth($db, ['ADMINISTRATOR']);

    $data = getJsonInput();
    requireFields($data, ['id', 'full_name', 'role', 'office_id', 'office_name', 'position_title', 'employee_id', 'contact_number', 'barangay', 'is_active', 'must_change_password', 'password']);
    if (empty($data['id'])) {
        sendResponse(400, [], 'User id is required for update.');
    }
    requireId($data['id'], 'user ID');
    if (isset($data['full_name'])) requireText($data['full_name'], 'full name', 255, true);
    foreach (['office_name' => 255, 'position_title' => 255, 'employee_id' => 50, 'contact_number' => 50, 'barangay' => 255] as $field => $max) if (isset($data[$field])) requireText($data[$field], $field, $max);
    if (isset($data['office_id'])) $data['office_id'] = optionalId($data['office_id'], 'office ID');
    validate_account_office($db, $data['office_id'] ?? null);
    foreach (['is_active', 'must_change_password'] as $field) if (array_key_exists($field, $data)) $data[$field] = requireBool($data[$field], $field);
    if (array_key_exists('password', $data)) {
        requireText($data['password'], 'password', 1024);
        if ($data['password'] !== '' && strlen($data['password']) < 8) sendResponse(400, [], 'Password must be at least 8 characters long.');
    }
    if (isset($data['role']) && !in_array($data['role'], ['ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'EVALUATOR', 'NOMINEE'], true)) {
        sendResponse(400, [], 'Invalid user role.');
    }

    $fields = [
        'full_name' => $data['full_name'] ?? null,
        'role' => $data['role'] ?? null,
        'office_id' => $data['office_id'] ?? null,
        'office_name' => $data['office_name'] ?? null,
        'position_title' => $data['position_title'] ?? null,
        'employee_id' => $data['employee_id'] ?? null,
        'contact_number' => $data['contact_number'] ?? null,
        'barangay' => $data['barangay'] ?? null,
        'is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : null,
        'must_change_password' => array_key_exists('must_change_password', $data) ? (!empty($data['must_change_password']) ? 1 : 0) : null,
    ];

    try {
        $db->beginTransaction();
        $stmt = $db->prepare("
            UPDATE profiles SET
                full_name = COALESCE(:full_name, full_name),
                role = COALESCE(:role, role),
                office_id = CASE WHEN :has_office_id_assignment = 1 THEN :office_id ELSE office_id END,
                office_name = CASE WHEN :has_office_name_assignment = 1 THEN :office_name ELSE office_name END,
                position_title = COALESCE(:position_title, position_title),
                employee_id = COALESCE(:employee_id, employee_id),
                contact_number = COALESCE(:contact_number, contact_number),
                barangay = COALESCE(:barangay, barangay),
                is_active = COALESCE(:is_active, is_active),
                must_change_password = COALESCE(:must_change_password, must_change_password)
            WHERE id = :id
        ");

        $hasOfficeAssignment = (array_key_exists('office_id', $data) || array_key_exists('office_name', $data)) ? 1 : 0;
        $stmt->execute([
            ':id' => $data['id'],
            ':full_name' => $fields['full_name'],
            ':role' => $fields['role'],
            ':office_id' => $fields['office_id'],
            ':office_name' => $fields['office_name'],
            ':has_office_id_assignment' => $hasOfficeAssignment,
            ':has_office_name_assignment' => $hasOfficeAssignment,
            ':position_title' => $fields['position_title'],
            ':employee_id' => $fields['employee_id'],
            ':contact_number' => $fields['contact_number'],
            ':barangay' => $fields['barangay'],
            ':is_active' => $fields['is_active'],
            ':must_change_password' => $fields['must_change_password'],
        ]);

        if (!empty($data['password'])) {
            $db->prepare("
                UPDATE profiles
                SET password_hash = :password_hash, must_change_password = 0
                WHERE id = :id
            ")->execute([
                ':id' => $data['id'],
                ':password_hash' => password_hash((string)$data['password'], PASSWORD_DEFAULT),
            ]);
        }

        $stmt = $db->prepare("
            SELECT id, email, full_name, role, office_id, office_name, position_title,
                   employee_id, contact_number, barangay, avatar_url, is_active,
                   must_change_password, created_at, updated_at, last_login_at
            FROM profiles
            WHERE id = :id
        ");
        $stmt->execute([':id' => $data['id']]);
        $user = $stmt->fetch();
        if (!$user) {
            $db->rollBack();
            sendResponse(404, [], 'User not found.');
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        sendInternalError($e, 'auth.php:update_user', 'Failed to update user account.');
    }

    sendResponse(200, format_profile_record($user), 'User updated successfully.');
}

if ($method === 'DELETE') {
    $actor = require_auth($db, ['ADMINISTRATOR']);
    $data = getJsonInput();
    $userId = requireId($_GET['id'] ?? ($data['id'] ?? null), 'user ID');

    if ($userId === '') {
        sendResponse(400, [], 'User id is required for deletion.');
    }

    if ($userId === $actor['id']) {
        sendResponse(403, [], 'You cannot delete your own account.');
    }

    $stmt = $db->prepare('SELECT id, role, is_active FROM profiles WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $targetUser = $stmt->fetch();

    if (!$targetUser) {
        sendResponse(404, [], 'User not found.');
    }

    if ($targetUser['role'] === 'ADMINISTRATOR' && (bool)$targetUser['is_active']) {
        $activeAdminCount = (int)$db->query("SELECT COUNT(*) FROM profiles WHERE role = 'ADMINISTRATOR' AND is_active = 1")->fetchColumn();
        if ($activeAdminCount <= 1) {
            sendResponse(409, [], 'At least one active administrator account must remain.');
        }
    }

    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM notifications WHERE user_id = :user_id')
            ->execute([':user_id' => $userId]);
        $db->prepare('DELETE FROM profiles WHERE id = :id')
            ->execute([':id' => $userId]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendInternalError($e, 'auth.php:delete_user', 'Failed to delete user.');
    }

    sendResponse(200, ['id' => $userId], 'User deleted successfully.');
}

sendResponse(405, [], 'Method not allowed.');
