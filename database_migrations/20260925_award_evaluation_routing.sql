CREATE TABLE IF NOT EXISTS `award_evaluation_routes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `award_id` VARCHAR(64) NOT NULL,
  `required_evaluators` INT NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_award_route` (`award_id`),
  CONSTRAINT `fk_route_award` FOREIGN KEY (`award_id`) REFERENCES `awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `award_route_evaluators` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `route_id` VARCHAR(64) NOT NULL,
  `evaluator_id` VARCHAR(64) NOT NULL,
  `sequence_no` INT NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY `uq_route_evaluator` (`route_id`, `evaluator_id`),
  CONSTRAINT `fk_route_evaluator_route` FOREIGN KEY (`route_id`) REFERENCES `award_evaluation_routes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_route_evaluator_user` FOREIGN KEY (`evaluator_id`) REFERENCES `profiles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `application_evaluator_assignments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `application_id` VARCHAR(64) NOT NULL,
  `evaluator_id` VARCHAR(64) NOT NULL,
  `route_id` VARCHAR(64) DEFAULT NULL,
  `sequence_no` INT NOT NULL DEFAULT 1,
  `status` ENUM('Pending', 'In Progress', 'Completed', 'Reassigned') NOT NULL DEFAULT 'Pending',
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` DATETIME DEFAULT NULL,
  UNIQUE KEY `uq_application_evaluator` (`application_id`, `evaluator_id`),
  KEY `idx_assignment_evaluator` (`evaluator_id`, `status`),
  CONSTRAINT `fk_assignment_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_assignment_evaluator` FOREIGN KEY (`evaluator_id`) REFERENCES `profiles` (`id`),
  CONSTRAINT `fk_assignment_route` FOREIGN KEY (`route_id`) REFERENCES `award_evaluation_routes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
