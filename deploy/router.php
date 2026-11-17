<?php
declare(strict_types=1);

// Only the built frontend is in the document root. Backend source stays outside it.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($path)) { http_response_code(400); exit(); }
if (getenv('VERCEL_CONTAINER') === '1') $_SERVER['HTTPS'] = 'on';
$backend = dirname(__DIR__) . '/backend/api';
$endpoints = ['auth', 'applications', 'documents', 'uploads', 'awards', 'award_routes',
    'offices', 'evaluations', 'notifications', 'audit_logs', 'report_settings', 'export', 'health'];
if (preg_match('~^/api/([a-z_]+)\.php$~D', $path, $matches) && in_array($matches[1], $endpoints, true)) {
    $_SERVER['SCRIPT_NAME'] = $path;
    require $backend . '/' . $matches[1] . '.php';
    exit();
}
if (preg_match('~^/uploads/certificate_templates/(certificate_background_[0-9]+_[0-9]{4}\.(jpg|png|webp))$~D', $path, $matches)) {
    require_once $backend . '/config/database_storage.php';
    $file = database_materialize_file(ltrim($path, '/'));
    if ($file !== null) {
        header('Content-Type: image/' . ($matches[2] === 'jpg' ? 'jpeg' : $matches[2]));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: public, max-age=3600');
        stream_stored_file($file);
        exit();
    }
}
if (preg_match('~^/(api|uploads|assets|\.)(?:/|$)~', $path) || preg_match('~\.[a-z0-9]+$~i', $path)) {
    http_response_code(404);
    header('Content-Type: text/plain');
    exit('Not found.');
}
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-cache');
readfile(__DIR__ . '/index.html');
