<?php
declare(strict_types=1);
require_once __DIR__ . '/database.php';

final class PraiseDatabaseSession implements SessionHandlerInterface, SessionUpdateTimestampHandlerInterface {
    private PDO $db;
    public function __construct() {
        $db = (new Database())->getConnection();
        if (!$db) throw new RuntimeException('Session database is unavailable.');
        $this->db = $db;
    }
    public function open(string $path, string $name): bool { return true; }
    public function close(): bool {
        if ($this->db->inTransaction()) $this->db->commit();
        return true;
    }
    public function validateId(string $id): bool {
        $stmt = $this->db->prepare('SELECT 1 FROM praise_sessions WHERE id = ? AND expires_at > UTC_TIMESTAMP()');
        $stmt->execute([$id]);
        return $stmt->fetchColumn() !== false;
    }
    public function read(string $id): string|false {
        // A dedicated connection holds the session row lock until PHP closes it.
        // Application transactions use their own connection and do not interfere.
        if (!$this->db->inTransaction()) $this->db->beginTransaction();
        $this->db->prepare("INSERT IGNORE INTO praise_sessions (id, payload, expires_at) VALUES (?, '', UTC_TIMESTAMP())")->execute([$id]);
        $stmt = $this->db->prepare('SELECT payload, expires_at FROM praise_sessions WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row && strtotime($row['expires_at'] . ' UTC') > time() ? (string)$row['payload'] : '';
    }
    public function write(string $id, string $data): bool {
        $expiry = gmdate('Y-m-d H:i:s', time() + (int)ini_get('session.gc_maxlifetime'));
        $stmt = $this->db->prepare('INSERT INTO praise_sessions (id, payload, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), expires_at = VALUES(expires_at)');
        return $stmt->execute([$id, $data, $expiry]);
    }
    public function updateTimestamp(string $id, string $data): bool { return $this->write($id, $data); }
    public function destroy(string $id): bool {
        $this->db->prepare('DELETE FROM praise_sessions WHERE id = ?')->execute([$id]);
        return $this->close();
    }
    public function gc(int $max_lifetime): int|false {
        $stmt = $this->db->prepare('DELETE FROM praise_sessions WHERE expires_at < UTC_TIMESTAMP()');
        $stmt->execute();
        return $stmt->rowCount();
    }
}
