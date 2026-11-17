<?php
declare(strict_types=1);
require_once __DIR__ . '/database.php';

const PRAISE_FILE_CHUNK_SIZE = 512 * 1024;

function database_file_storage(): bool { return getenv('FILE_STORAGE') === 'database'; }

function storage_database(): PDO {
    $db = (new Database())->getConnection();
    if (!$db) throw new RuntimeException('File database is unavailable.');
    return $db;
}

function database_materialize_file(string $reference, ?PDO $db = null): ?string {
    $db ??= storage_database();
    $stmt = $db->prepare('SELECT file_name, total_size, chunk_count FROM praise_files WHERE reference = ?');
    $stmt->execute([$reference]);
    $file = $stmt->fetch();
    if (!$file || (int)$file['total_size'] > 10 * 1024 * 1024) return null;
    $extension = strtolower(pathinfo($file['file_name'], PATHINFO_EXTENSION));
    if (!in_array($extension, ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp'], true)) return null;
    $tmp = tempnam(sys_get_temp_dir(), 'praise-');
    if ($tmp === false) throw new RuntimeException('Temporary file storage is unavailable.');
    $target = $tmp . '.' . $extension;
    if (!rename($tmp, $target)) { @unlink($tmp); throw new RuntimeException('Unable to prepare temporary file.'); }
    register_shutdown_function(static function () use ($target): void { if (is_file($target)) @unlink($target); });
    $handle = fopen($target, 'wb');
    if (!$handle) throw new RuntimeException('Unable to write temporary file.');
    $size = 0;
    try {
        $part = $db->prepare('SELECT content FROM praise_file_chunks WHERE reference = ? AND part_no = ?');
        for ($index = 0; $index < (int)$file['chunk_count']; $index++) {
            $part->execute([$reference, $index]);
            $content = $part->fetchColumn();
            if (!is_string($content) || fwrite($handle, $content) !== strlen($content)) return null;
            $size += strlen($content);
        }
    } finally { fclose($handle); }
    return $size === (int)$file['total_size'] ? $target : null;
}

function database_store_file(PDO $db, string $reference, string $path): void {
    $size = filesize($path);
    if ($size === false || $size < 1 || $size > 10 * 1024 * 1024) throw new RuntimeException('Invalid file size.');
    $db->prepare('INSERT INTO praise_files (reference, file_name, total_size, chunk_count) VALUES (?, ?, ?, ?)')
        ->execute([$reference, basename($reference), $size, (int)ceil($size / PRAISE_FILE_CHUNK_SIZE)]);
    $handle = fopen($path, 'rb');
    if (!$handle) throw new RuntimeException('Unable to read uploaded file.');
    try {
        $insert = $db->prepare('INSERT INTO praise_file_chunks (reference, part_no, content) VALUES (?, ?, ?)');
        $index = 0;
        while (!feof($handle)) {
            $content = fread($handle, PRAISE_FILE_CHUNK_SIZE);
            if ($content === false) throw new RuntimeException('Unable to read uploaded file.');
            if ($content !== '') $insert->execute([$reference, $index++, $content]);
        }
    } finally { fclose($handle); }
}

function database_delete_file(PDO $db, string $reference): void {
    $db->prepare('DELETE FROM praise_files WHERE reference = ?')->execute([$reference]);
}

function consume_staged_upload(PDO $db, string $reference, string $userId): void {
    $stmt = $db->prepare('DELETE FROM praise_files WHERE reference = ? AND owner_id = ? AND expires_at > UTC_TIMESTAMP()');
    $stmt->execute([$reference, $userId]);
    if ($stmt->rowCount() !== 1) throw new RuntimeException('Upload has expired or was already used.');
}

/** Resolve a completed upload only through its authenticated owner's database row. */
function load_staged_upload(PDO $db, array $actor, string $target): array {
    $input = getJsonInput();
    requireFields($input, ['upload_id']);
    $id = $input['upload_id'] ?? null;
    if (!is_string($id) || !preg_match('~^staging/[a-f0-9]{32}$~D', $id)) sendResponse(400, [], 'Invalid upload ID.');
    $stmt = $db->prepare('SELECT * FROM praise_files WHERE reference = ? AND owner_id = ? AND expires_at > UTC_TIMESTAMP()');
    $stmt->execute([$id, $actor['id']]);
    $upload = $stmt->fetch();
    if (!$upload) sendResponse(404, [], 'Upload not found or expired.');
    $metadata = json_decode((string)$upload['metadata'], true, 16, JSON_THROW_ON_ERROR);
    if (($metadata['target'] ?? '') !== $target) sendResponse(400, [], 'Upload belongs to a different form.');
    $path = database_materialize_file($id, $db);
    if ($path === null) sendResponse(409, [], 'Upload is incomplete. Please upload the file again.');
    return [
        'reference' => $id,
        'fields' => $metadata['fields'],
        'file' => ['name' => $upload['file_name'], 'tmp_name' => $path, 'size' => (int)$upload['total_size'], 'error' => UPLOAD_ERR_OK],
    ];
}

function stream_stored_file(string $path): void {
    // Flush incrementally instead of buffering a 10 MB response in a Function.
    while (ob_get_level() > 0) ob_end_flush();
    $handle = fopen($path, 'rb');
    if (!$handle) throw new RuntimeException('Unable to read stored file.');
    try {
        while (!feof($handle)) {
            $part = fread($handle, 65536);
            if ($part === false) throw new RuntimeException('Unable to read stored file.');
            echo $part;
            flush();
        }
    } finally { fclose($handle); }
}
