<?php
declare(strict_types=1);

function requireFields(array $data, array $allowed): void {
    foreach ($data as $key => $_) {
        if (!is_string($key) || !in_array($key, $allowed, true)) {
            sendResponse(400, [], 'Unexpected request field.');
        }
    }
}

function requireId($value, string $name = 'ID'): string {
    // IDs in this schema are VARCHAR(64), including generated app-/usr- IDs.
    if (!is_string($value) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/D', $value)) {
        sendResponse(400, [], "Invalid {$name}.");
    }
    return $value;
}

function optionalId($value, string $name = 'ID'): ?string {
    return $value === null || $value === '' ? null : requireId($value, $name);
}

function requireText($value, string $name, int $max, bool $required = false): string {
    $length = is_string($value)
        ? ($max <= 500 ? (function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : preg_match_all('/./us', $value)) : strlen($value))
        : false;
    if ($length === false || $length > $max || ($required && trim($value) === '')) {
        sendResponse(400, [], "Invalid {$name}.");
    }
    return $value;
}

function requireBool($value, string $name): bool {
    if (is_bool($value)) return $value;
    if ($value === 1 || $value === '1') return true;
    if ($value === 0 || $value === '0') return false;
    sendResponse(400, [], "Invalid {$name}.");
}

function requireIntRange($value, string $name, int $min, int $max): int {
    if ((!is_int($value) && !(is_string($value) && preg_match('/^[0-9]+$/D', $value)))
        || filter_var($value, FILTER_VALIDATE_INT) === false
        || (int)$value < $min || (int)$value > $max) {
        sendResponse(400, [], "Invalid {$name}.");
    }
    return (int)$value;
}

function requireDecimal($value, string $name, float $min, float $max): float {
    if ((!is_int($value) && !is_float($value) && !is_string($value))
        || !preg_match('/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/D', (string)$value)
        || (float)$value < $min || (float)$value > $max) {
        sendResponse(400, [], "Invalid {$name}.");
    }
    return (float)$value;
}

function requireDate($value, string $name): string {
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) sendResponse(400, [], "Invalid {$name}.");
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) sendResponse(400, [], "Invalid {$name}.");
    return $value;
}

function requireEmail($value): string {
    if (!is_string($value) || strlen($value) > 255 || !filter_var($value, FILTER_VALIDATE_EMAIL)) {
        sendResponse(400, [], 'Invalid email address.');
    }
    return $value;
}
