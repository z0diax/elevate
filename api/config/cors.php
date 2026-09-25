<?php
/**
 * CORS and HTTP response utility for XAMPP PHP API
 */

// Keep PHP diagnostics in server logs, never in JSON responses.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

function corsAllowedOrigins(): array {
    $configured = getenv('CORS_ALLOWED_ORIGINS');
    if ($configured === false || trim($configured) === '') return [];

    $origins = [];
    foreach (explode(',', $configured) as $entry) {
        $origin = rtrim(trim($entry), '/');
        // Only complete HTTP(S) origins are accepted: no paths, wildcards, or credentials.
        if (preg_match('~^https?://(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(?::[0-9]{1,5})?$~D', $origin)) {
            $origins[] = $origin;
        }
    }
    return array_unique($origins);
}

function corsVaryOnOrigin(): void {
    foreach (headers_list() as $headerLine) {
        if (stripos($headerLine, 'Vary:') !== 0) continue;
        $value = trim(substr($headerLine, 5));
        if (preg_match('/(?:^|,)\s*Origin\s*(?:,|$)/i', $value)) return;
        header('Vary: ' . $value . ', Origin');
        return;
    }
    header('Vary: Origin');
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? null;
$allowedOrigin = is_string($origin) && in_array($origin, corsAllowedOrigins(), true);
corsVaryOnOrigin();
header('Content-Type: application/json; charset=UTF-8');

if ($allowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}

// Preflight stops before any endpoint authentication or business logic.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if ($origin !== null && !$allowedOrigin) {
        http_response_code(403);
        exit();
    }
    if ($allowedOrigin) {
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
        header('Access-Control-Max-Age: 3600');
    }
    http_response_code(204);
    exit();
}

function sendResponse($status, $data = [], $message = "") {
    http_response_code($status);
    echo json_encode([
        "status" => ($status >= 200 && $status < 300) ? "success" : "error",
        "message" => $message,
        "data" => $data,
        "timestamp" => date('c')
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

function logInternalError(Throwable $error, string $context): void {
    error_log('[' . $context . '] ' . get_class($error) . ': ' . $error->getMessage());
}

function sendInternalError(Throwable $error, string $context, string $message = 'An unexpected server error occurred.'): void {
    logInternalError($error, $context);
    sendResponse(500, [], $message);
}

set_exception_handler(static function (Throwable $error): void {
    sendInternalError($error, basename($_SERVER['SCRIPT_NAME'] ?? 'api') . ':uncaught');
});

function getJsonInput() {
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (!preg_match('~^application/json(?:\s*;|\s*$)~i', $type)) sendResponse(415, [], 'JSON content type required.');
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > 1048576) sendResponse(413, [], 'JSON request is too large.');
    if (trim($raw) === '') sendResponse(400, [], 'Invalid JSON request.');
    try {
        $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        sendResponse(400, [], 'Invalid JSON request.');
    }
    if (!is_array($data) || !str_starts_with(ltrim($raw), '{')) sendResponse(400, [], 'JSON object required.');
    return $data;
}

require_once __DIR__ . '/validation.php';
