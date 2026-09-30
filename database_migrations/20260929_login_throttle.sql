-- Apply during maintenance before deploying the production-hardened auth API.
CREATE TABLE IF NOT EXISTS `login_throttle` (
  `email_hash` CHAR(64) NOT NULL PRIMARY KEY,
  `failed_count` INT NOT NULL DEFAULT 0,
  `window_started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `blocked_until` DATETIME DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_login_throttle_updated` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
