-- Durable storage for Vercel containers; apply once before serving the cloud app.
CREATE TABLE IF NOT EXISTS praise_sessions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    payload MEDIUMBLOB NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX idx_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS praise_files (
    reference VARCHAR(255) NOT NULL PRIMARY KEY,
    owner_id VARCHAR(64) DEFAULT NULL,
    file_name VARCHAR(255) NOT NULL,
    total_size INT UNSIGNED NOT NULL,
    chunk_count INT UNSIGNED NOT NULL,
    metadata TEXT DEFAULT NULL,
    expires_at DATETIME DEFAULT NULL,
    INDEX idx_file_owner (owner_id, expires_at),
    INDEX idx_file_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS praise_file_chunks (
    reference VARCHAR(255) NOT NULL,
    part_no INT UNSIGNED NOT NULL,
    content MEDIUMBLOB NOT NULL,
    PRIMARY KEY (reference, part_no),
    CONSTRAINT fk_praise_file_chunks FOREIGN KEY (reference) REFERENCES praise_files(reference) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
