<?php
declare(strict_types=1);
require_once __DIR__ . '/../api/config/login_throttle.php';
function throttleCheck(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
$oldVercel = getenv('VERCEL_CONTAINER');
$oldProxies = getenv('TRUSTED_PROXY_IPS');
putenv('VERCEL_CONTAINER=0');
putenv('TRUSTED_PROXY_IPS=');
$server = ['REMOTE_ADDR' => '192.0.2.10', 'HTTP_X_FORWARDED_FOR' => '198.51.100.1', 'HTTP_X_VERCEL_FORWARDED_FOR' => '198.51.100.2'];
throttleCheck(login_client_ip($server) === '192.0.2.10', 'An untrusted request spoofed the client address.');
putenv('TRUSTED_PROXY_IPS=192.0.2.10,192.0.2.11');
$server['HTTP_X_FORWARDED_FOR'] = '198.51.100.1, 192.0.2.11';
throttleCheck(login_client_ip($server) === '198.51.100.1', 'Trusted proxy chain did not resolve.');
$server['HTTP_X_FORWARDED_FOR'] = 'spoofed, 192.0.2.11';
throttleCheck(login_client_ip($server) === '192.0.2.10', 'Malformed proxy chain was accepted.');
putenv('VERCEL_CONTAINER=1');
throttleCheck(login_client_ip($server) === '198.51.100.2', 'Vercel platform address was ignored.');
$server['HTTP_X_VERCEL_FORWARDED_FOR'] = '2001:0db8:0000:0000:0000:0000:0000:0001';
throttleCheck(login_client_ip($server) === '2001:db8::1', 'IPv6 spellings use different budgets.');
putenv($oldVercel === false ? 'VERCEL_CONTAINER' : 'VERCEL_CONTAINER=' . $oldVercel);
putenv($oldProxies === false ? 'TRUSTED_PROXY_IPS' : 'TRUSTED_PROXY_IPS=' . $oldProxies);

$now = 1800000000;
$originalZone = date_default_timezone_get();
date_default_timezone_set('Asia/Singapore');
$row = ['failed_count' => 7, 'window_started_at' => gmdate('Y-m-d H:i:s', $now - 899), 'blocked_until' => null];
throttleCheck(login_failure_state($row, $now)['count'] === 7, 'Active window was reset.');
$row['window_started_at'] = gmdate('Y-m-d H:i:s', $now - 900);
throttleCheck(login_failure_state($row, $now)['count'] === 0, 'Expired window was retained.');
$row['blocked_until'] = gmdate('Y-m-d H:i:s', $now + 60);
throttleCheck(login_failure_state($row, $now)['retry_after'] === 60, 'An expired failure window bypassed an active cooldown.');
$row['window_started_at'] = gmdate('Y-m-d H:i:s', $now - 301);
$row['blocked_until'] = gmdate('Y-m-d H:i:s', $now);
throttleCheck(login_failure_state($row, $now)['count'] === 0, 'An expired cooldown did not restore a fresh budget.');
date_default_timezone_set($originalZone);
throttleCheck(strlen(login_throttle_key('account:fixture')) === 64 && login_throttle_key('account:fixture') !== login_throttle_key('source:fixture'), 'Counter namespaces collide.');
echo "Login throttle time, identity and trusted-proxy checks passed.\n";
