-- Preserve the original office as the first/default assignment.
CREATE TABLE IF NOT EXISTS `profile_offices` (
  `profile_id` VARCHAR(64) NOT NULL,
  `office_id` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`profile_id`, `office_id`),
  KEY `idx_profile_offices_office` (`office_id`),
  CONSTRAINT `fk_profile_offices_profile` FOREIGN KEY (`profile_id`) REFERENCES `profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_profile_offices_office` FOREIGN KEY (`office_id`) REFERENCES `offices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `profile_offices` (`profile_id`, `office_id`, `sort_order`)
SELECT p.id, p.office_id, 0 FROM profiles p JOIN offices o ON o.id = p.office_id;
