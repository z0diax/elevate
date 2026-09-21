<?php
declare(strict_types=1);

require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/session_auth.php';

$database = new Database();
$db = $database->getConnection();

if (!$db) {
    sendResponse(503, [], 'Database connection failed.');
}

function default_report_settings(): array {
    return [
        'id' => 'default',
        'citation_text' => 'For exemplary dedication, outstanding performance, and unwavering commitment to public service excellence, having met all criteria and qualifying standards under the City of Tacloban PRAISE Guidelines.',
        'conferment_text' => 'Conferred this {award_date} at Tacloban City Hall, Kanhuraw Hill, Tacloban City, Leyte, Philippines.',
        'left_signatory_name' => 'Marites S. Bocar',
        'left_signatory_title' => 'City Government Dept. Head II, HRMDO',
        'center_signatory_name' => 'Atty. Irene V. Chiu',
        'center_signatory_title' => 'City Administrator / PRAISE Chairperson',
        'right_signatory_name' => 'Hon. Alfred S. Romualdez',
        'right_signatory_title' => 'City Mayor, Tacloban City',
        'background_image_url' => null,
    ];
}

function ensure_report_settings_table(PDO $db): void {
    $db->exec("
        CREATE TABLE IF NOT EXISTS `report_settings` (
          `id` VARCHAR(64) NOT NULL,
          `citation_text` TEXT NOT NULL,
          `conferment_text` TEXT NOT NULL,
          `left_signatory_name` VARCHAR(255) NOT NULL,
          `left_signatory_title` VARCHAR(255) NOT NULL,
          `center_signatory_name` VARCHAR(255) NOT NULL,
          `center_signatory_title` VARCHAR(255) NOT NULL,
          `right_signatory_name` VARCHAR(255) NOT NULL,
          `right_signatory_title` VARCHAR(255) NOT NULL,
          `background_image_url` VARCHAR(500) DEFAULT NULL,
          `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $columnCheck = $db->query("SHOW COLUMNS FROM `report_settings` LIKE 'background_image_url'");
    if ($columnCheck && !$columnCheck->fetch(PDO::FETCH_ASSOC)) {
        $db->exec("ALTER TABLE `report_settings` ADD COLUMN `background_image_url` VARCHAR(500) DEFAULT NULL AFTER `right_signatory_title`");
    }

    $stmt = $db->prepare("SELECT COUNT(*) FROM `report_settings` WHERE `id` = 'default'");
    $stmt->execute();
    $exists = (int)$stmt->fetchColumn() > 0;

    if ($exists) {
        return;
    }

    $defaults = default_report_settings();
    $insert = $db->prepare("
        INSERT INTO `report_settings` (
            `id`,
            `citation_text`,
            `conferment_text`,
            `left_signatory_name`,
            `left_signatory_title`,
            `center_signatory_name`,
            `center_signatory_title`,
            `right_signatory_name`,
            `right_signatory_title`,
            `background_image_url`
        ) VALUES (
            :id,
            :citation_text,
            :conferment_text,
            :left_signatory_name,
            :left_signatory_title,
            :center_signatory_name,
            :center_signatory_title,
            :right_signatory_name,
            :right_signatory_title,
            :background_image_url
        )
    ");
    $insert->execute([
        ':id' => $defaults['id'],
        ':citation_text' => $defaults['citation_text'],
        ':conferment_text' => $defaults['conferment_text'],
        ':left_signatory_name' => $defaults['left_signatory_name'],
        ':left_signatory_title' => $defaults['left_signatory_title'],
        ':center_signatory_name' => $defaults['center_signatory_name'],
        ':center_signatory_title' => $defaults['center_signatory_title'],
        ':right_signatory_name' => $defaults['right_signatory_name'],
        ':right_signatory_title' => $defaults['right_signatory_title'],
        ':background_image_url' => $defaults['background_image_url'],
    ]);
}

function fetch_report_settings(PDO $db): array {
    $stmt = $db->prepare("
        SELECT
            `citation_text`,
            `conferment_text`,
            `left_signatory_name`,
            `left_signatory_title`,
            `center_signatory_name`,
            `center_signatory_title`,
            `right_signatory_name`,
            `right_signatory_title`,
            `background_image_url`,
            `updated_at`
        FROM `report_settings`
        WHERE `id` = 'default'
        LIMIT 1
    ");
    $stmt->execute();
    $settings = $stmt->fetch();

    if (!$settings) {
        ensure_report_settings_table($db);
        $stmt->execute();
        $settings = $stmt->fetch();
    }

    return $settings ?: [];
}

function require_non_empty_string(array $data, string $field): string {
    $value = trim((string)($data[$field] ?? ''));
    if ($value === '') {
        sendResponse(400, [], "Field '{$field}' is required.");
    }

    return $value;
}

function optional_string(array $data, string $field): ?string {
    $value = trim((string)($data[$field] ?? ''));
    return $value === '' ? null : $value;
}

function get_certificate_background_upload_dir(): string {
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'certificate_templates' . DIRECTORY_SEPARATOR;
}

function delete_certificate_background_file(?string $relativePath): void {
    if (!$relativePath) {
        return;
    }

    $normalized = ltrim(str_replace('\\', '/', $relativePath), '/');
    if (!str_starts_with($normalized, 'uploads/certificate_templates/')) {
        return;
    }

    $baseDir = get_certificate_background_upload_dir();
    $realBaseDir = realpath($baseDir);
    $targetPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $normalized);
    $realTargetPath = realpath($targetPath);

    if ($realBaseDir && $realTargetPath && str_starts_with(str_replace('\\', '/', $realTargetPath), str_replace('\\', '/', $realBaseDir)) && is_file($realTargetPath)) {
        @unlink($realTargetPath);
    }
}

ensure_report_settings_table($db);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    require_auth($db);
    sendResponse(200, fetch_report_settings($db));
}

if ($method === 'POST') {
    require_auth($db, ['ADMINISTRATOR', 'SECRETARIAT']);

    if (!isset($_FILES['background_image'])) {
        sendResponse(400, [], 'background_image file is required.');
    }

    $file = $_FILES['background_image'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        sendResponse(400, [], 'Certificate background upload failed.');
    }

    if (($file['size'] ?? 0) > 8 * 1024 * 1024) {
        sendResponse(400, [], 'Certificate background image must not exceed 8 MB.');
    }

    $mimeType = $file['type'] ?? '';
    $allowedMimeTypes = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    if (!isset($allowedMimeTypes[$mimeType])) {
        sendResponse(400, [], 'Only JPG, PNG, and WEBP certificate background images are supported.');
    }

    $uploadDir = get_certificate_background_upload_dir();
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        sendResponse(500, [], 'Failed to prepare the certificate background upload directory.');
    }

    $extension = $allowedMimeTypes[$mimeType];
    $safeName = 'certificate_background_' . time() . '_' . rand(1000, 9999) . '.' . $extension;
    $targetPath = $uploadDir . $safeName;

    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        sendResponse(500, [], 'Failed to store the uploaded certificate background image.');
    }

    sendResponse(201, [
        'background_image_url' => 'uploads/certificate_templates/' . $safeName,
    ], 'Certificate background uploaded.');
}

if ($method === 'PUT') {
    require_auth($db, ['ADMINISTRATOR', 'SECRETARIAT']);

    $data = getJsonInput();
    $payload = [
        'citation_text' => require_non_empty_string($data, 'citation_text'),
        'conferment_text' => require_non_empty_string($data, 'conferment_text'),
        'left_signatory_name' => require_non_empty_string($data, 'left_signatory_name'),
        'left_signatory_title' => require_non_empty_string($data, 'left_signatory_title'),
        'center_signatory_name' => require_non_empty_string($data, 'center_signatory_name'),
        'center_signatory_title' => require_non_empty_string($data, 'center_signatory_title'),
        'right_signatory_name' => require_non_empty_string($data, 'right_signatory_name'),
        'right_signatory_title' => require_non_empty_string($data, 'right_signatory_title'),
        'background_image_url' => optional_string($data, 'background_image_url'),
    ];

    $currentSettings = fetch_report_settings($db);

    $stmt = $db->prepare("
        UPDATE `report_settings`
        SET
            `citation_text` = :citation_text,
            `conferment_text` = :conferment_text,
            `left_signatory_name` = :left_signatory_name,
            `left_signatory_title` = :left_signatory_title,
            `center_signatory_name` = :center_signatory_name,
            `center_signatory_title` = :center_signatory_title,
            `right_signatory_name` = :right_signatory_name,
            `right_signatory_title` = :right_signatory_title,
            `background_image_url` = :background_image_url
        WHERE `id` = 'default'
    ");
    $stmt->execute([
        ':citation_text' => $payload['citation_text'],
        ':conferment_text' => $payload['conferment_text'],
        ':left_signatory_name' => $payload['left_signatory_name'],
        ':left_signatory_title' => $payload['left_signatory_title'],
        ':center_signatory_name' => $payload['center_signatory_name'],
        ':center_signatory_title' => $payload['center_signatory_title'],
        ':right_signatory_name' => $payload['right_signatory_name'],
        ':right_signatory_title' => $payload['right_signatory_title'],
        ':background_image_url' => $payload['background_image_url'],
    ]);

    if (($currentSettings['background_image_url'] ?? null) !== $payload['background_image_url']) {
        delete_certificate_background_file($currentSettings['background_image_url'] ?? null);
    }

    sendResponse(200, fetch_report_settings($db), 'Certificate template updated.');
}

sendResponse(405, [], 'Method not allowed.');
