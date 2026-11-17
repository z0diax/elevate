<?php
declare(strict_types=1);

/** Accept the General connection variables added by the Vercel TiDB integration. */
function database_environment(string $key): string|false {
    $value = getenv($key);
    if ($value !== false) return $value;
    $aliases = ['DB_HOST' => 'TIDB_HOST', 'DB_PORT' => 'TIDB_PORT', 'DB_NAME' => 'TIDB_DATABASE', 'DB_USER' => 'TIDB_USER', 'DB_PASS' => 'TIDB_PASSWORD'];
    return isset($aliases[$key]) ? getenv($aliases[$key]) : false;
}

function app_environment(): string {
    $value = strtolower(trim((string)(getenv('APP_ENV') ?: '')));
    if (!in_array($value, ['development', 'production'], true)) {
        throw new RuntimeException('APP_ENV must be development or production.');
    }
    return $value;
}

function app_is_https(array $server): bool {
    $https = strtolower((string)($server['HTTPS'] ?? ''));
    if (in_array($https, ['on', '1', 'true'], true) || (string)($server['SERVER_PORT'] ?? '') === '443') return true;

    $remote = (string)($server['REMOTE_ADDR'] ?? '');
    $trusted = array_filter(array_map('trim', explode(',', (string)(getenv('TRUSTED_PROXY_IPS') ?: ''))));
    if ($remote !== '' && in_array($remote, $trusted, true)) {
        return strtolower(trim((string)($server['HTTP_X_FORWARDED_PROTO'] ?? ''))) === 'https';
    }
    return false;
}

function app_production_config_errors(array $server): array {
    $errors = [];
    if ((string)(getenv('APP_ENV') ?: '') !== 'production') $errors[] = 'APP_ENV must explicitly be production.';
    foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $key) {
        if (trim((string)(database_environment($key) ?: '')) === '') $errors[] = $key . ' is required.';
    }
    if (strtolower(trim((string)(database_environment('DB_USER') ?: ''))) === 'root') $errors[] = 'DB_USER must be a dedicated account.';
    $port = (string)(database_environment('DB_PORT') ?: '');
    if ($port !== '' && (!ctype_digit($port) || (int)$port < 1 || (int)$port > 65535)) $errors[] = 'DB_PORT is invalid.';

    $uploadDir = trim((string)(getenv('PRIVATE_UPLOAD_DIR') ?: ''));
    if (getenv('FILE_STORAGE') !== 'database' && ($uploadDir === '' || !preg_match('~^(?:[A-Za-z]:[\\\\/]|/|\\\\\\\\)~', $uploadDir))) {
        $errors[] = 'PRIVATE_UPLOAD_DIR must be an absolute path.';
    }
    foreach (['FILE_STORAGE', 'SESSION_STORAGE'] as $storageKey) {
        $storage = getenv($storageKey);
        if ($storage !== false && !in_array($storage, ['filesystem', 'database'], true)) $errors[] = $storageKey . ' is invalid.';
    }
    if (getenv('VERCEL_CONTAINER') === '1' && (getenv('FILE_STORAGE') !== 'database' || getenv('SESSION_STORAGE') !== 'database')) {
        $errors[] = 'Vercel requires database-backed files and sessions.';
    }
    $origins = trim((string)(getenv('CORS_ALLOWED_ORIGINS') ?: ''));
    if ($origins !== '') {
        foreach (explode(',', $origins) as $origin) {
            if (!preg_match('~^https://(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(?::[0-9]{1,5})?$~D', trim($origin))) {
                $errors[] = 'CORS_ALLOWED_ORIGINS must contain only exact HTTPS origins.';
                break;
            }
        }
    }
    $proxies = trim((string)(getenv('TRUSTED_PROXY_IPS') ?: ''));
    if ($proxies !== '') {
        foreach (explode(',', $proxies) as $ip) {
            if (!filter_var(trim($ip), FILTER_VALIDATE_IP)) {
                $errors[] = 'TRUSTED_PROXY_IPS contains an invalid address.';
                break;
            }
        }
    }
    $idle = (string)(getenv('SESSION_IDLE_SECONDS') ?: '28800');
    if (!ctype_digit($idle) || (int)$idle < 900 || (int)$idle > 86400) $errors[] = 'SESSION_IDLE_SECONDS must be between 900 and 86400.';
    if (!app_is_https($server)) $errors[] = 'HTTPS is required.';
    return $errors;
}
