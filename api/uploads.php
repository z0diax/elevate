<?php
declare(strict_types=1);
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/session_auth.php';
require_once __DIR__ . '/config/database_storage.php';

if (!database_file_storage()) sendResponse(404, [], 'Chunked uploads are not enabled.');
$db = storage_database();
$actor = require_auth($db);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendResponse(405, [], 'Method not allowed.');

if (($_GET['action'] ?? '') === 'start') {
    $data = getJsonInput();
    requireFields($data, ['target', 'file_name', 'file_size', 'fields']);
    $target = $data['target'] ?? '';
    if (!in_array($target, ['documents', 'certificate'], true)) sendResponse(400, [], 'Invalid upload target.');
    if ($target === 'certificate' && !in_array($actor['role'], ['ADMINISTRATOR', 'SECRETARIAT'], true)) sendResponse(403, [], 'Not authorized.');
    $fields = $data['fields'] ?? [];
    if (!is_array($fields)) sendResponse(400, [], 'Invalid upload fields.');
    requireFields($fields, $target === 'documents' ? ['application_id', 'document_id', 'requirement_id', 'document_name'] : []);
    if ($target === 'documents') {
        $application = require_application_access($db, $actor, requireId($fields['application_id'] ?? '', 'application ID'));
        if ($application['nominator_id'] !== $actor['id']) sendResponse(403, [], 'Only the original filer can upload documents.');
        if (!in_array($application['status'], ['Draft', 'Returned for Revision', 'Incomplete'], true)) sendResponse(409, [], 'Attachments cannot be changed at this stage.');
    }
    $name = requireText($data['file_name'] ?? '', 'file name', 255, true);
    $allowed = $target === 'documents' ? ['pdf', 'docx', 'jpg', 'jpeg', 'png'] : ['jpg', 'jpeg', 'png', 'webp'];
    if (!in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), $allowed, true)) sendResponse(400, [], 'Unsupported file type.');
    $size = requireIntRange($data['file_size'] ?? 0, 'file size', 1, ($target === 'documents' ? 10 : 8) * 1024 * 1024);
    $db->beginTransaction();
    try {
        // Serialize quota checks for simultaneous requests from this account.
        $db->prepare('SELECT id FROM profiles WHERE id = ? FOR UPDATE')->execute([$actor['id']]);
        $db->exec('DELETE FROM praise_files WHERE expires_at < UTC_TIMESTAMP() LIMIT 20');
        $quota = $db->prepare('SELECT COUNT(*) FROM praise_files WHERE owner_id = ? AND expires_at IS NOT NULL');
        $quota->execute([$actor['id']]);
        if ((int)$quota->fetchColumn() >= 3) {
            $db->rollBack();
            sendResponse(429, [], 'Too many pending uploads. Please wait 10 minutes before trying again.');
        }
        $id = 'staging/' . bin2hex(random_bytes(16));
        $parts = (int)ceil($size / PRAISE_FILE_CHUNK_SIZE);
        $db->prepare('INSERT INTO praise_files (reference, owner_id, file_name, total_size, chunk_count, metadata, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $actor['id'], $name, $size, $parts, json_encode(['target' => $target, 'fields' => $fields], JSON_THROW_ON_ERROR), gmdate('Y-m-d H:i:s', time() + 600)]);
        $db->commit();
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
    sendResponse(201, ['upload_id' => $id, 'chunk_size' => PRAISE_FILE_CHUNK_SIZE, 'chunk_count' => $parts]);
}

if (($_GET['action'] ?? '') === 'part') {
    requireFields($_POST, ['upload_id', 'part_no']);
    requireFields($_FILES, ['chunk']);
    $id = $_POST['upload_id'] ?? '';
    if (!is_string($id) || !preg_match('~^staging/[a-f0-9]{32}$~D', $id)) sendResponse(400, [], 'Invalid upload ID.');
    $index = requireIntRange($_POST['part_no'] ?? -1, 'part number', 0, 19);
    $file = $_FILES['chunk'] ?? [];
    if (!is_array($file) || ($file['error'] ?? -1) !== UPLOAD_ERR_OK || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) sendResponse(400, [], 'Invalid upload chunk.');
    $db->beginTransaction();
    try {
        $stmt = $db->prepare('SELECT total_size, chunk_count FROM praise_files WHERE reference = ? AND owner_id = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE');
        $stmt->execute([$id, $actor['id']]);
        $upload = $stmt->fetch();
        if (!$upload) { $db->rollBack(); sendResponse(404, [], 'Upload not found or expired.'); }
        $expected = min(PRAISE_FILE_CHUNK_SIZE, (int)$upload['total_size'] - $index * PRAISE_FILE_CHUNK_SIZE);
        if ($index >= (int)$upload['chunk_count'] || filesize($file['tmp_name']) !== $expected) { $db->rollBack(); sendResponse(400, [], 'Upload chunk has an invalid size.'); }
        $content = file_get_contents($file['tmp_name']);
        if ($content === false) throw new RuntimeException('Unable to read upload chunk.');
        $db->prepare('INSERT INTO praise_file_chunks (reference, part_no, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)')->execute([$id, $index, $content]);
        $db->commit();
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
    sendResponse(200, ['part_no' => $index]);
}
sendResponse(400, [], 'Invalid upload action.');
