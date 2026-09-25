<?php
declare(strict_types=1);

// Configure PRIVATE_UPLOAD_DIR in production. The fallback is a sibling of the
// XAMPP htdocs directory for the standard htdocs/<project> installation.
function private_document_dir(): string {
    $configured = getenv('PRIVATE_UPLOAD_DIR');
    $dir = $configured !== false && trim($configured) !== ''
        ? trim($configured)
        : dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'praise_private_uploads';
    return rtrim($dir, '/\\') . DIRECTORY_SEPARATOR;
}

function prepare_private_document_dir(): ?string {
    $configured = getenv('PRIVATE_UPLOAD_DIR');
    if ($configured !== false && trim($configured) !== ''
        && !preg_match('~^(?:[A-Za-z]:[\\\\/]|/|\\\\\\\\)~', trim($configured))) return null;
    $dir = private_document_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) return null;
    $realDir = realpath($dir);
    if ($realDir === false) return null;
    $documentRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($documentRoot !== false) {
        $root = rtrim(str_replace('\\', '/', $documentRoot), '/');
        $candidate = str_replace('\\', '/', $realDir);
        if (DIRECTORY_SEPARATOR === '\\') {
            $root = strtolower($root);
            $candidate = strtolower($candidate);
        }
        if ($candidate === $root || str_starts_with($candidate, $root . '/')) return null;
    }
    return rtrim($realDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
}

function legacy_document_dir(): string {
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR;
}

function document_storage_path(string $reference): ?string {
    if (!preg_match('~^(private|uploads)/([A-Za-z0-9_-]+\.(?:pdf|docx|jpe?g|png))$~iD', $reference, $matches)) return null;
    $base = $matches[1] === 'private' ? prepare_private_document_dir() : legacy_document_dir();
    if ($base === null) return null;
    $realBase = realpath($base);
    $realFile = realpath($base . $matches[2]);
    if ($realBase === false || $realFile === false || is_link($base . $matches[2])) return null;
    $prefix = rtrim($realBase, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (strncmp($realFile, $prefix, strlen($prefix)) !== 0 || !is_file($realFile)) return null;
    return $realFile;
}

function public_document_url(string $id): string {
    return 'api/documents.php?action=download&id=' . rawurlencode($id);
}
