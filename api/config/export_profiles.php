<?php
declare(strict_types=1);

/** Profile columns permitted in routine administrative JSON exports. */
function export_safe_profiles($db): array {
    return $db->query(
        'SELECT id, email, full_name, role, office_id, office_name, position_title, '
        . 'employee_id, contact_number, barangay, avatar_url, is_active, '
        . 'must_change_password, last_login_at, created_at, updated_at '
        . 'FROM profiles'
    )->fetchAll(PDO::FETCH_ASSOC);
}
