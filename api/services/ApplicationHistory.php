<?php
declare(strict_types=1);

function addHistory(PDO $db, string $appId, array $user, string $action, ?string $previousStatus, string $newStatus, string $remarks = ''): void {
    $stmt = $db->prepare("
        INSERT INTO application_history (id, application_id, user_id, user_name, user_role, action, previous_status, new_status, remarks)
        VALUES (:id, :application_id, :user_id, :user_name, :user_role, :action, :previous_status, :new_status, :remarks)
    ");
    $stmt->execute([
        ':id' => 'log-' . bin2hex(random_bytes(16)),
        ':application_id' => $appId,
        ':user_id' => $user['id'] ?? null,
        ':user_name' => $user['full_name'] ?? 'System',
        ':user_role' => $user['role'] ?? 'SECRETARIAT',
        ':action' => $action,
        ':previous_status' => $previousStatus,
        ':new_status' => $newStatus,
        ':remarks' => $remarks,
    ]);
}
