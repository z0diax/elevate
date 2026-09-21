<?php
/**
 * Offices / City Departments API
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], "Database connection failed.");
}

$method = $_SERVER['REQUEST_METHOD'];

function normalize_office(array $office): array {
    $office['is_active'] = (bool)$office['is_active'];
    return $office;
}

function find_office_by_id(PDO $db, string $officeId): ?array {
    $stmt = $db->prepare("SELECT * FROM offices WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $officeId]);
    $office = $stmt->fetch();
    return $office ?: null;
}

function find_office_by_code(PDO $db, string $officeCode): ?array {
    $stmt = $db->prepare("SELECT * FROM offices WHERE code = :code LIMIT 1");
    $stmt->execute([':code' => $officeCode]);
    $office = $stmt->fetch();
    return $office ?: null;
}

function get_office_dependency_counts(PDO $db, string $officeId): array {
    $profileStmt = $db->prepare("SELECT COUNT(*) FROM profiles WHERE office_id = :office_id");
    $profileStmt->execute([':office_id' => $officeId]);

    $applicationStmt = $db->prepare("SELECT COUNT(*) FROM applications WHERE office_id = :office_id");
    $applicationStmt->execute([':office_id' => $officeId]);

    return [
        'profiles' => (int)$profileStmt->fetchColumn(),
        'applications' => (int)$applicationStmt->fetchColumn(),
    ];
}

if ($method === 'GET') {
    require_auth($db);

    $stmt = $db->query("SELECT * FROM offices WHERE is_active = 1 ORDER BY name ASC");
    $offices = array_map('normalize_office', $stmt->fetchAll());
    sendResponse(200, $offices);
} elseif ($method === 'POST') {
    require_auth($db, ['ADMINISTRATOR']);

    $data = getJsonInput();
    if (empty($data['name']) || empty($data['code']) || empty($data['head_name'])) {
        sendResponse(400, [], "Missing required fields: name, code, head_name.");
    }

    $name = trim((string)$data['name']);
    $code = trim((string)$data['code']);
    $headName = trim((string)$data['head_name']);
    $headTitle = trim((string)($data['head_title'] ?? 'Department Head'));

    if (find_office_by_code($db, $code)) {
        sendResponse(409, [], "Office code {$code} already exists. Use a unique office code.");
    }

    $id = 'off-' . time() . '-' . rand(10, 99);
    try {
        $stmt = $db->prepare("
            INSERT INTO offices (id, name, code, head_name, head_title, is_active)
            VALUES (:id, :name, :code, :head_name, :head_title, 1)
        ");
        $stmt->execute([
            ':id' => $id,
            ':name' => $name,
            ':code' => $code,
            ':head_name' => $headName,
            ':head_title' => $headTitle,
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            sendResponse(409, [], "Office code {$code} already exists. Use a unique office code.");
        }
        sendResponse(500, [], 'Failed to create office.');
    }

    sendResponse(201, normalize_office([
        'id' => $id,
        'name' => $name,
        'code' => $code,
        'head_name' => $headName,
        'head_title' => $headTitle,
        'is_active' => true,
    ]), "Office created.");
} elseif ($method === 'PUT') {
    require_auth($db, ['ADMINISTRATOR']);

    $data = getJsonInput();
    if (empty($data['id']) || empty($data['name']) || empty($data['code']) || empty($data['head_name'])) {
        sendResponse(400, [], "Missing required fields: id, name, code, head_name.");
    }

    $existing = find_office_by_id($db, (string)$data['id']);

    if (!$existing) {
        sendResponse(404, [], "Office not found.");
    }

    $officeWithCode = find_office_by_code($db, trim((string)$data['code']));
    if ($officeWithCode && $officeWithCode['id'] !== $data['id']) {
        sendResponse(409, [], "Office code " . trim((string)$data['code']) . " already exists. Use a unique office code.");
    }

    $db->beginTransaction();
    try {
        $updateOffice = $db->prepare("
            UPDATE offices
            SET name = :name,
                code = :code,
                head_name = :head_name,
                head_title = :head_title,
                is_active = :is_active
            WHERE id = :id
        ");
        $updateOffice->execute([
            ':id' => $data['id'],
            ':name' => trim((string)$data['name']),
            ':code' => trim((string)$data['code']),
            ':head_name' => trim((string)$data['head_name']),
            ':head_title' => trim((string)($data['head_title'] ?? 'Department Head')),
            ':is_active' => array_key_exists('is_active', $data) ? (!empty($data['is_active']) ? 1 : 0) : ((int)$existing['is_active']),
        ]);

        if ($existing['name'] !== $data['name']) {
            $db->prepare("
                UPDATE profiles
                SET office_name = :office_name
                WHERE office_id = :office_id
            ")->execute([
                ':office_name' => trim((string)$data['name']),
                ':office_id' => $data['id'],
            ]);

            $db->prepare("
                UPDATE applications
                SET office_name = :office_name
                WHERE office_id = :office_id
            ")->execute([
                ':office_name' => trim((string)$data['name']),
                ':office_id' => $data['id'],
            ]);
        }

        $db->commit();
    } catch (Throwable $error) {
        $db->rollBack();
        sendResponse(500, [], "Failed to update office: " . $error->getMessage());
    }

    $office = find_office_by_id($db, (string)$data['id']);

    sendResponse(200, normalize_office($office), "Office updated.");
} elseif ($method === 'DELETE') {
    require_auth($db, ['ADMINISTRATOR']);

    $data = getJsonInput();
    $officeId = trim((string)($data['id'] ?? ($_GET['id'] ?? '')));

    if ($officeId === '') {
        sendResponse(400, [], "Office id is required.");
    }

    $existing = find_office_by_id($db, $officeId);
    if (!$existing) {
        sendResponse(404, [], "Office not found.");
    }

    $dependencyCounts = get_office_dependency_counts($db, $officeId);
    if ($dependencyCounts['profiles'] > 0 || $dependencyCounts['applications'] > 0) {
        $dependencies = [];
        if ($dependencyCounts['profiles'] > 0) {
            $dependencies[] = $dependencyCounts['profiles'] . ' user account' . ($dependencyCounts['profiles'] === 1 ? '' : 's');
        }
        if ($dependencyCounts['applications'] > 0) {
            $dependencies[] = $dependencyCounts['applications'] . ' nomination record' . ($dependencyCounts['applications'] === 1 ? '' : 's');
        }

        sendResponse(
            409,
            ['dependencies' => $dependencyCounts],
            "Cannot delete office while it is still linked to " . implode(' and ', $dependencies) . "."
        );
    }

    $stmt = $db->prepare("DELETE FROM offices WHERE id = :id");
    $stmt->execute([':id' => $officeId]);

    sendResponse(200, ['id' => $officeId], "Office permanently deleted.");
}
