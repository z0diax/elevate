<?php
declare(strict_types=1);

/** Require an explicitly named, separate database before any integration write. */
function require_test_database(): string {
    $name = trim((string)(getenv('TEST_DB_NAME') ?: ''));
    $configured = trim((string)(getenv('DB_NAME') ?: ''));
    if (!preg_match('/^[a-zA-Z0-9_]*_test(?:_[a-zA-Z0-9_]+)?$/D', $name)
        || $name === 'tacloban_praise_db' || $configured !== $name) {
        throw new RuntimeException('Set TEST_DB_NAME and DB_NAME to the same dedicated *_test database. Refusing to write to the application database.');
    }
    return $name;
}
