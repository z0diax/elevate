<?php
declare(strict_types=1);

const LOGIN_ACCOUNT_FAILURE_LIMIT = 8;
const LOGIN_SOURCE_FAILURE_LIMIT = 50;
const LOGIN_FAILURE_WINDOW_SECONDS = 900;
const LOGIN_BLOCK_SECONDS = 300;
// A dummy hash keeps unknown/disabled-account failures on the password verification path.
const LOGIN_DUMMY_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

function login_throttle_key(string $identity): string {
    return hash('sha256', $identity);
}

function login_client_ip(array $server): string {
    $remote = (string)($server['REMOTE_ADDR'] ?? '');
    if (getenv('VERCEL_CONTAINER') === '1') {
        // Vercel overwrites these platform headers; direct XAMPP requests cannot opt in.
        foreach (['HTTP_X_VERCEL_FORWARDED_FOR', 'HTTP_X_FORWARDED_FOR'] as $header) {
            $ip = trim((string)($server[$header] ?? ''));
            if (filter_var($ip, FILTER_VALIDATE_IP)) return (string)inet_ntop(inet_pton($ip));
        }
    }
    $trusted = array_filter(array_map('trim', explode(',', (string)(getenv('TRUSTED_PROXY_IPS') ?: ''))));
    if (in_array($remote, $trusted, true)) {
        $chain = array_map('trim', explode(',', (string)($server['HTTP_X_FORWARDED_FOR'] ?? '')));
        if (count($chain) <= 16 && !array_filter($chain, static fn(string $ip): bool => filter_var($ip, FILTER_VALIDATE_IP) === false)) {
            while (in_array($remote, $trusted, true) && $chain) $remote = array_pop($chain);
        }
    }
    return filter_var($remote, FILTER_VALIDATE_IP) ? (string)inet_ntop(inet_pton($remote)) : 'unknown-source';
}

function login_failure_state(array $row, int $now): array {
    $blocked = empty($row['blocked_until']) ? 0 : (int)strtotime($row['blocked_until'] . ' UTC');
    $started = (int)strtotime($row['window_started_at'] . ' UTC');
    if ($blocked > $now) return ['count' => (int)$row['failed_count'], 'started' => $started, 'retry_after' => $blocked - $now];
    // A completed cooldown starts a fresh budget, even within the original window.
    $expired = $blocked > 0 || $started <= $now - LOGIN_FAILURE_WINDOW_SECONDS;
    return ['count' => $expired ? 0 : (int)$row['failed_count'], 'started' => $expired ? $now : $started, 'retry_after' => 0];
}

/** Serialize account/source checks with password verification so concurrent guesses cannot overrun the limit. */
function authenticate_throttled_login(PDO $db, string $email, string $password, array $server): array {
    $lookup = $db->prepare('SELECT * FROM profiles WHERE email = ? LIMIT 1');
    $lookup->execute([$email]);
    $user = $lookup->fetch();
    // Use the stored identity: database collation aliases must share the same account budget.
    $accountKey = login_throttle_key($user ? 'account:' . $user['id'] : 'email:' . strtolower(trim($email)));
    $sourceKey = login_throttle_key('source:' . login_client_ip($server));
    $limits = [$accountKey => LOGIN_ACCOUNT_FAILURE_LIMIT, $sourceKey => LOGIN_SOURCE_FAILURE_LIMIT];
    ksort($limits, SORT_STRING);

    for ($attempt = 0; ; $attempt++) {
        $db->beginTransaction();
        try {
            // A no-op upsert takes an exclusive lock immediately; INSERT IGNORE can deadlock on lock upgrade.
            $insert = $db->prepare('INSERT INTO login_throttle (email_hash, failed_count, window_started_at, updated_at) VALUES (?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE email_hash = VALUES(email_hash)');
            $lock = $db->prepare('SELECT failed_count, window_started_at, blocked_until FROM login_throttle WHERE email_hash = ? FOR UPDATE');
            $rows = [];
            foreach ($limits as $key => $limit) {
                $insert->execute([$key]);
                $lock->execute([$key]);
                $rows[$key] = $lock->fetch();
                if (!$rows[$key]) throw new RuntimeException('Login throttle record is unavailable.');
            }
            $now = (int)$db->query('SELECT UNIX_TIMESTAMP()')->fetchColumn();
            $states = array_map(static fn(array $row): array => login_failure_state($row, $now), $rows);
            $retry = max(array_column($states, 'retry_after'));
            if ($retry > 0) {
                // Do not accumulate new account/source rows for already blocked requests.
                $db->rollBack();
                return ['status' => 429, 'retry_after' => $retry];
            }

            $passwordMatches = password_verify($password, (string)($user['password_hash'] ?? LOGIN_DUMMY_HASH));
            if ($user && (bool)$user['is_active'] && $passwordMatches) {
                $db->prepare('DELETE FROM login_throttle WHERE email_hash = ?')->execute([$accountKey]);
                // A successful account login must not clear a source's failures against other accounts.
                $db->commit();
                return ['status' => 200, 'user' => $user];
            }

            $update = $db->prepare('UPDATE login_throttle SET failed_count = ?, window_started_at = ?, blocked_until = ?, updated_at = UTC_TIMESTAMP() WHERE email_hash = ?');
            foreach ($limits as $key => $limit) {
                $count = min($states[$key]['count'] + 1, $limit);
                $blocked = $count >= $limit ? gmdate('Y-m-d H:i:s', $now + LOGIN_BLOCK_SECONDS) : null;
                $update->execute([$count, gmdate('Y-m-d H:i:s', $states[$key]['started']), $blocked, $key]);
                if ($blocked !== null) $retry = LOGIN_BLOCK_SECONDS;
            }
            $db->commit();
            break;
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            if ($error instanceof PDOException && $attempt < 3
                && ($error->getCode() === '40001' || in_array((int)($error->errorInfo[1] ?? 0), [1205, 1213], true))) {
                usleep(random_int(10000, 30000) * ($attempt + 1));
                continue;
            }
            throw $error;
        }
    }
    // Bounded cleanup removes only obsolete throttle metadata, never application records.
    try { $db->exec('DELETE FROM login_throttle WHERE updated_at < UTC_TIMESTAMP() - INTERVAL 1 DAY LIMIT 20'); }
    catch (PDOException $error) { error_log('[login_throttle] Deferred expired-counter cleanup.'); }
    return ['status' => $retry > 0 ? 429 : 401, 'retry_after' => $retry];
}
