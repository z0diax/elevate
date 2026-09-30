<?php
declare(strict_types=1);

function login_throttle_key(string $email): string {
    return hash('sha256', strtolower($email));
}

function login_is_throttled(PDO $db, string $key): bool {
    $stmt = $db->prepare('SELECT blocked_until FROM login_throttle WHERE email_hash = :key');
    $stmt->execute([':key' => $key]);
    $blockedUntil = $stmt->fetchColumn();
    return $blockedUntil !== false && $blockedUntil !== null && strtotime((string)$blockedUntil) > time();
}

function record_login_failure(PDO $db, string $key): void {
    $db->beginTransaction();
    try {
        $db->prepare('INSERT IGNORE INTO login_throttle (email_hash, failed_count) VALUES (:key, 0)')->execute([':key' => $key]);
        $stmt = $db->prepare('SELECT failed_count, window_started_at FROM login_throttle WHERE email_hash = :key FOR UPDATE');
        $stmt->execute([':key' => $key]);
        $row = $stmt->fetch();
        $expired = strtotime((string)$row['window_started_at']) < time() - 900;
        $count = $expired ? 1 : (int)$row['failed_count'] + 1;
        $db->prepare('UPDATE login_throttle SET failed_count = :count, window_started_at = :started, blocked_until = :blocked WHERE email_hash = :key')
            ->execute([
                ':count' => min($count, 8),
                ':started' => $expired ? date('Y-m-d H:i:s') : $row['window_started_at'],
                ':blocked' => $count >= 8 ? date('Y-m-d H:i:s', time() + 300) : null,
                ':key' => $key,
            ]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function clear_login_failures(PDO $db, string $key): void {
    $db->prepare('DELETE FROM login_throttle WHERE email_hash = :key')->execute([':key' => $key]);
}
