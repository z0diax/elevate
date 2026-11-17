<?php
declare(strict_types=1);

function assigned_office_ids(array $user): array {
    return $user['office_ids'] ?? (empty($user['office_id']) ? [] : [$user['office_id']]);
}

function has_assigned_office(array $user, string $officeId): bool {
    return $officeId !== '' && in_array($officeId, assigned_office_ids($user), true);
}

function load_profile_offices(PDO $db, array $user): array {
    $stmt = $db->prepare('SELECT o.id, o.name FROM profile_offices p JOIN offices o ON o.id = p.office_id WHERE p.profile_id = ? ORDER BY p.sort_order, o.name');
    $stmt->execute([$user['id']]);
    $offices = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // Profiles created by older clients retain their original assignment.
    if (!$offices && !empty($user['office_id'])) {
        $offices = [['id' => $user['office_id'], 'name' => $user['office_name'] ?? '']];
    }
    $user['office_ids'] = array_column($offices, 'id');
    $user['office_names'] = array_column($offices, 'name');
    return $user;
}

function validate_profile_offices(PDO $db, array &$data): void {
    if (!array_key_exists('office_ids', $data) && !array_key_exists('office_id', $data)) return;
    $ids = array_key_exists('office_ids', $data) ? $data['office_ids'] : (empty($data['office_id']) ? [] : [$data['office_id']]);
    if (!is_array($ids) || !array_is_list($ids) || count($ids) > 500) {
        sendResponse(400, [], 'Office assignments must be a list of office IDs.');
    }
    $names = [];
    $unique = [];
    $stmt = $db->prepare('SELECT name FROM offices WHERE id = ? AND is_active = 1');
    foreach ($ids as $id) {
        $id = requireId($id, 'office ID');
        if (in_array($id, $unique, true)) continue;
        $stmt->execute([$id]);
        $name = $stmt->fetchColumn();
        if ($name === false) sendResponse(400, [], 'Office not found or inactive.');
        $unique[] = $id;
        $names[] = $name;
    }
    $data['office_ids'] = $unique;
    $data['office_id'] = $unique[0] ?? null;
    $data['office_name'] = $names[0] ?? null;
}

function save_profile_offices(PDO $db, string $profileId, array $ids): void {
    $db->prepare('DELETE FROM profile_offices WHERE profile_id = ?')->execute([$profileId]);
    $stmt = $db->prepare('INSERT INTO profile_offices (profile_id, office_id, sort_order) VALUES (?, ?, ?)');
    foreach ($ids as $index => $id) $stmt->execute([$profileId, $id, $index]);
}
