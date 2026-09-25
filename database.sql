-- ==============================================================================
-- CITY GOVERNMENT OF TACLOBAN - PRAISE MANAGEMENT SYSTEM
-- Deployment-oriented MySQL / MariaDB schema for XAMPP
-- Database: tacloban_praise_db
-- Bootstrap admin password: ChangeMe123!
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `tacloban_praise_db`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `tacloban_praise_db`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `application_evaluator_assignments`;
DROP TABLE IF EXISTS `award_route_evaluators`;
DROP TABLE IF EXISTS `award_evaluation_routes`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `application_history`;
DROP TABLE IF EXISTS `evaluation_scores`;
DROP TABLE IF EXISTS `evaluations`;
DROP TABLE IF EXISTS `endorsements`;
DROP TABLE IF EXISTS `application_documents`;
DROP TABLE IF EXISTS `applications`;
DROP TABLE IF EXISTS `award_criteria`;
DROP TABLE IF EXISTS `award_document_requirements`;
DROP TABLE IF EXISTS `award_eligibility_requirements`;
DROP TABLE IF EXISTS `awards`;
DROP TABLE IF EXISTS `report_settings`;
DROP TABLE IF EXISTS `profiles`;
DROP TABLE IF EXISTS `offices`;

CREATE TABLE `offices` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `head_name` VARCHAR(255) NOT NULL,
  `head_title` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `profiles` (
  `id` VARCHAR(64) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `full_name` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMINISTRATOR', 'SECRETARIAT', 'HEAD_OF_OFFICE', 'EVALUATOR', 'NOMINEE') NOT NULL,
  `office_id` VARCHAR(64) DEFAULT NULL,
  `office_name` VARCHAR(255) DEFAULT NULL,
  `position_title` VARCHAR(255) DEFAULT NULL,
  `employee_id` VARCHAR(50) DEFAULT NULL,
  `contact_number` VARCHAR(50) DEFAULT NULL,
  `barangay` VARCHAR(255) DEFAULT NULL,
  `avatar_url` VARCHAR(500) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_profiles_role` (`role`),
  KEY `idx_profiles_office` (`office_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `awards` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `description` TEXT DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `award_year` INT NOT NULL DEFAULT 2026,
  `min_qualifying_score` DECIMAL(5,2) NOT NULL DEFAULT 85.00,
  `is_on_the_spot` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `award_eligibility_requirements` (
  `id` VARCHAR(64) NOT NULL,
  `award_id` VARCHAR(64) NOT NULL,
  `requirement_description` TEXT NOT NULL,
  `is_mandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `order_index` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_award_eligibility` (`award_id`),
  CONSTRAINT `fk_eligibility_award`
    FOREIGN KEY (`award_id`) REFERENCES `awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `award_document_requirements` (
  `id` VARCHAR(64) NOT NULL,
  `award_id` VARCHAR(64) NOT NULL,
  `document_name` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `is_mandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_award_document_requirements` (`award_id`),
  CONSTRAINT `fk_document_requirement_award`
    FOREIGN KEY (`award_id`) REFERENCES `awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `award_criteria` (
  `id` VARCHAR(64) NOT NULL,
  `award_id` VARCHAR(64) NOT NULL,
  `criterion_name` VARCHAR(255) NOT NULL,
  `criterion_description` TEXT DEFAULT NULL,
  `weight_percentage` DECIMAL(5,2) NOT NULL,
  `max_score` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_award_criteria` (`award_id`),
  CONSTRAINT `fk_criteria_award`
    FOREIGN KEY (`award_id`) REFERENCES `awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `applications` (
  `id` VARCHAR(64) NOT NULL,
  `application_number` VARCHAR(64) NOT NULL UNIQUE,
  `award_id` VARCHAR(64) NOT NULL,
  `award_name` VARCHAR(255) NOT NULL,
  `award_year` INT NOT NULL DEFAULT 2026,
  `nominee_id` VARCHAR(64) DEFAULT NULL,
  `nominee_name` VARCHAR(255) NOT NULL,
  `employee_id` VARCHAR(50) DEFAULT NULL,
  `position_title` VARCHAR(255) NOT NULL,
  `office_id` VARCHAR(64) DEFAULT NULL,
  `office_name` VARCHAR(255) NOT NULL,
  `division_section` VARCHAR(255) DEFAULT NULL,
  `employment_category` VARCHAR(100) NOT NULL,
  `contact_number` VARCHAR(50) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `barangay` VARCHAR(255) DEFAULT NULL,
  `nomination_type` VARCHAR(50) NOT NULL DEFAULT 'Individual',
  `nominator_id` VARCHAR(64) DEFAULT NULL,
  `nominator_name` VARCHAR(255) NOT NULL,
  `nominator_position` VARCHAR(255) NOT NULL,
  `nominating_office` VARCHAR(255) NOT NULL,
  `justification` TEXT NOT NULL,
  `accomplishments` TEXT NOT NULL,
  `supporting_narrative` TEXT NOT NULL,
  `date_of_nomination` DATE NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Submitted',
  `processing_stage` VARCHAR(50) NOT NULL DEFAULT 'Submitted',
  `required_action` TEXT DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `final_weighted_score` DECIMAL(5,2) DEFAULT NULL,
  `deliberation_remarks` TEXT DEFAULT NULL,
  `deliberation_decision` ENUM('Approved', 'Not Approved') DEFAULT NULL,
  `deliberation_date` DATE DEFAULT NULL,
  `award_date` DATE DEFAULT NULL,
  `assigned_evaluators` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_applications_award` (`award_id`),
  KEY `idx_applications_nominee` (`nominee_id`),
  KEY `idx_applications_office` (`office_id`),
  KEY `idx_applications_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `application_documents` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `requirement_id` VARCHAR(64) DEFAULT NULL,
  `document_name` VARCHAR(255) NOT NULL,
  `file_url` TEXT NOT NULL,
  `file_size` BIGINT DEFAULT NULL,
  `file_type` VARCHAR(100) DEFAULT 'application/pdf',
  `status` VARCHAR(50) NOT NULL DEFAULT 'Submitted',
  `verification_remarks` TEXT DEFAULT NULL,
  `verified_by` VARCHAR(255) DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_application_documents_app` (`application_id`),
  CONSTRAINT `fk_documents_application`
    FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `endorsements` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `endorsed_by` VARCHAR(255) NOT NULL,
  `endorser_title` VARCHAR(255) NOT NULL,
  `decision` ENUM('Endorsed', 'Returned for Revision', 'Rejected') NOT NULL,
  `remarks` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_endorsements_app` (`application_id`),
  CONSTRAINT `fk_endorsements_application`
    FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `evaluations` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `evaluator_id` VARCHAR(64) NOT NULL,
  `evaluator_name` VARCHAR(255) NOT NULL,
  `evaluator_office` VARCHAR(255) DEFAULT NULL,
  `total_raw_score` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `weighted_percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `general_remarks` TEXT DEFAULT NULL,
  `is_submitted` TINYINT(1) NOT NULL DEFAULT 0,
  `submitted_at` DATETIME DEFAULT NULL,
  `reopened_at` DATETIME DEFAULT NULL,
  `reopened_by` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_application_evaluator` (`application_id`, `evaluator_id`),
  KEY `idx_evaluations_app` (`application_id`),
  CONSTRAINT `fk_evaluations_application`
    FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `evaluation_scores` (
  `id` VARCHAR(64) NOT NULL,
  `evaluation_id` VARCHAR(64) NOT NULL,
  `criterion_id` VARCHAR(64) NOT NULL,
  `criterion_name` VARCHAR(255) NOT NULL,
  `weight_percentage` DECIMAL(5,2) NOT NULL,
  `max_score` DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  `score` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `weighted_score` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `remarks` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evaluation_scores_eval` (`evaluation_id`),
  CONSTRAINT `fk_evaluation_scores_evaluation`
    FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `application_history` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `user_name` VARCHAR(255) NOT NULL,
  `user_role` VARCHAR(50) NOT NULL,
  `action` VARCHAR(255) NOT NULL,
  `previous_status` VARCHAR(50) DEFAULT NULL,
  `new_status` VARCHAR(50) NOT NULL,
  `remarks` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_application_history_app` (`application_id`),
  CONSTRAINT `fk_application_history_application`
    FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `target_role` VARCHAR(50) DEFAULT NULL,
  `application_id` VARCHAR(64) DEFAULT NULL,
  `application_number` VARCHAR(64) DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `link_tab` VARCHAR(100) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user` (`user_id`),
  KEY `idx_notifications_role` (`target_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `report_settings` (
  `id` VARCHAR(64) NOT NULL,
  `citation_text` TEXT NOT NULL,
  `conferment_text` TEXT NOT NULL,
  `left_signatory_name` VARCHAR(255) NOT NULL,
  `left_signatory_title` VARCHAR(255) NOT NULL,
  `center_signatory_name` VARCHAR(255) NOT NULL,
  `center_signatory_title` VARCHAR(255) NOT NULL,
  `right_signatory_name` VARCHAR(255) NOT NULL,
  `right_signatory_title` VARCHAR(255) NOT NULL,
  `form_a1_prepared_label` VARCHAR(255) NOT NULL DEFAULT 'PREPARED BY (Nominator):',
  `form_a1_prepared_name` VARCHAR(255) NOT NULL DEFAULT '{nominator_name}',
  `form_a1_prepared_title` VARCHAR(255) NOT NULL DEFAULT '{nominator_position}',
  `form_a1_verified_label` VARCHAR(255) NOT NULL DEFAULT 'VERIFIED BY (Secretariat):',
  `form_a1_verified_name` VARCHAR(255) NOT NULL DEFAULT 'Atty. Paul Vincent G. Yu',
  `form_a1_verified_title` VARCHAR(255) NOT NULL DEFAULT 'PRAISE Secretariat Lead',
  `form_a1_confirmed_label` VARCHAR(255) NOT NULL DEFAULT 'CONFIRMED BY (HRMDO Head):',
  `form_a1_confirmed_name` VARCHAR(255) NOT NULL DEFAULT 'Marites S. Bocar',
  `form_a1_confirmed_title` VARCHAR(255) NOT NULL DEFAULT 'City Gov Dept Head II, HRMDO',
  `background_image_url` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Seed data: offices
-- ------------------------------------------------------------------------------
INSERT INTO `offices` (`id`, `name`, `code`, `head_name`, `head_title`, `is_active`) VALUES
('off-1', 'City Human Resource Management Office', 'CHRMO', 'Atty. Maria Elena Santos', 'City Government Department Head II', 1),
('off-2', 'City Disaster Risk Reduction and Management Office', 'CDRRMO', 'Engr. Antonio R. Veloso', 'CDRRMO Officer-in-Charge', 1),
('off-3', 'City Health Office', 'CHO', 'Dr. Danilo P. Morales, M.D.', 'City Health Officer II', 1),
('off-4', 'City Social Welfare and Development Office', 'CSWDO', 'Ma. Lourdes G. Tan', 'CSWDO Head', 1),
('off-5', 'City Information and Communications Technology Office', 'CICTO', 'Engr. Ronald M. Gomez', 'IT Department Head', 1),
('off-6', 'City Planning and Development Office', 'CPDO', 'Arch. Fernando B. Reyes', 'City Planning Coordinator', 1),
('off-7', 'City Treasurer''s Office', 'CTO', 'Hon. Patricia V. Lim', 'City Treasurer', 1),
('off-8', 'City Administrator''s Office', 'CAO', 'Atty. Roberto C. Romualdez', 'City Administrator', 1);

-- ------------------------------------------------------------------------------
-- Seed data: bootstrap administrator
-- ------------------------------------------------------------------------------
INSERT INTO `profiles` (
  `id`, `email`, `full_name`, `role`, `office_id`, `office_name`, `position_title`,
  `employee_id`, `contact_number`, `barangay`, `password_hash`, `is_active`, `must_change_password`
) VALUES
('usr-admin-1', 'admin@tacloban.gov.ph', 'Tacloban PRAISE Administrator', 'ADMINISTRATOR', 'off-8', 'City Administrator''s Office', 'System Administrator', 'EMP-TAC-001', '0917-555-0101', 'Tacloban City', '$2y$10$5S8cOXrLFMLPZPB9Hl/LReImFWJM7A.ikVfxjgL0VOSK0L4ZDuv2y', 1, 1);

INSERT INTO `report_settings` (
  `id`,
  `citation_text`,
  `conferment_text`,
  `left_signatory_name`,
  `left_signatory_title`,
  `center_signatory_name`,
  `center_signatory_title`,
  `right_signatory_name`,
  `right_signatory_title`,
  `background_image_url`
) VALUES
('default', 'For exemplary dedication, outstanding performance, and unwavering commitment to public service excellence, having met all criteria and qualifying standards under the City of Tacloban PRAISE Guidelines.', 'Conferred this {award_date} at Tacloban City Hall, Kanhuraw Hill, Tacloban City, Leyte, Philippines.', 'Marites S. Bocar', 'City Government Dept. Head II, HRMDO', 'Atty. Irene V. Chiu', 'City Administrator / PRAISE Chairperson', 'Hon. Alfred S. Romualdez', 'City Mayor, Tacloban City', NULL);

-- ------------------------------------------------------------------------------
-- Seed data: awards
-- ------------------------------------------------------------------------------
INSERT INTO `awards` (`id`, `name`, `code`, `description`, `award_year`, `min_qualifying_score`, `is_active`) VALUES
('awd-1', 'Mayor Alfred S. Romualdez Award for Exemplary Public Service', 'MASR-EPS', 'The highest honor conferred to personnel demonstrating heroic devotion, unquestionable integrity, and extraordinary service to the people of Tacloban City.', 2026, 90.00, 1),
('awd-2', 'Outstanding Employee of the Year (Professional / Technical)', 'OEY-PROF', 'Conferred upon professional or technical personnel who demonstrated exceptional competence and tangible innovations.', 2026, 85.00, 1),
('awd-3', 'Outstanding Employee of the Year (Administrative / Support)', 'OEY-ADMIN', 'Recognizes administrative and support personnel exhibiting exemplary work ethic and public service.', 2026, 85.00, 1),
('awd-4', 'Innovator and Process Efficiency Award', 'INNOV-EFF', 'Given to individuals or teams who engineered digital solutions, operational streamlines, or disaster preparedness innovations saving public resources.', 2026, 88.00, 1),
('awd-5', 'Gawad Huwarang Lingkod Bayan (Community Frontliner)', 'GHLB-FRONT', 'Recognizes field workers, health responders, emergency responders, and other frontliners delivering compassionate on-the-ground service.', 2026, 85.00, 1);

INSERT INTO `award_criteria` (`id`, `award_id`, `criterion_name`, `criterion_description`, `weight_percentage`, `max_score`) VALUES
('crit-1-1', 'awd-1', 'Noteworthiness of Innovation and Public Impact', 'Tangible benefits, systemic transformation, and positive impact on Tacloban constituents.', 35.00, 100.00),
('crit-1-2', 'awd-1', 'Integrity, Ethical Standards, and Public Esteem', 'Exemplary personal conduct and adherence to Republic Act 6713.', 25.00, 100.00),
('crit-1-3', 'awd-1', 'Performance Rating and Productivity Output', 'Consistent Outstanding or Very Satisfactory IPCR ratings over the last two periods.', 20.00, 100.00),
('crit-1-4', 'awd-1', 'Sustained Dedication Beyond Call of Duty', 'Readiness to serve during emergencies, typhoons, and crisis scenarios.', 20.00, 100.00),
('crit-2-1', 'awd-2', 'Technical Excellence and Quality of Deliverables', 'Precision, accuracy, and adherence to civil service professional benchmarks.', 40.00, 100.00),
('crit-2-2', 'awd-2', 'Operational Efficiency and Time Management', 'Prompt execution of assignments and reduced turnaround times.', 30.00, 100.00),
('crit-2-3', 'awd-2', 'Client Satisfaction and Stakeholder Feedback', 'Verified positive feedback from internal and external constituents.', 30.00, 100.00),
('crit-3-1', 'awd-3', 'Reliability and Attendance', 'Consistency, punctuality, and dependable service delivery.', 35.00, 100.00),
('crit-3-2', 'awd-3', 'Quality of Administrative Support', 'Accuracy and responsiveness in clerical or support work.', 35.00, 100.00),
('crit-3-3', 'awd-3', 'Teamwork and Service Orientation', 'Support to offices, peers, and public-facing service.', 30.00, 100.00),
('crit-4-1', 'awd-4', 'Innovation Originality', 'Novelty and originality of the solution or improvement.', 30.00, 100.00),
('crit-4-2', 'awd-4', 'Operational Efficiency Gain', 'Measured time, cost, or manpower savings.', 40.00, 100.00),
('crit-4-3', 'awd-4', 'Replicability and Sustainability', 'Potential for city-wide adoption and long-term sustainability.', 30.00, 100.00),
('crit-5-1', 'awd-5', 'Community Service Impact', 'Direct impact on barangays and frontline beneficiaries.', 40.00, 100.00),
('crit-5-2', 'awd-5', 'Responsiveness in Critical Situations', 'Performance under field pressure and urgent service situations.', 35.00, 100.00),
('crit-5-3', 'awd-5', 'Professionalism and Compassion', 'Ethical conduct and empathy while serving the public.', 25.00, 100.00);

INSERT INTO `award_eligibility_requirements` (`id`, `award_id`, `requirement_description`, `is_mandatory`, `order_index`) VALUES
('elig-1-1', 'awd-1', 'Must have served at least two consecutive years in the City Government of Tacloban.', 1, 1),
('elig-1-2', 'awd-1', 'Must have at least a Very Satisfactory IPCR rating for the last two consecutive rating periods.', 1, 2),
('elig-1-3', 'awd-1', 'Must not have been convicted of any administrative offense or crime involving moral turpitude.', 1, 3),
('elig-2-1', 'awd-2', 'Must have rendered at least one year of continuous service.', 1, 1),
('elig-2-2', 'awd-2', 'Must have no pending administrative case at the time of nomination.', 1, 2),
('elig-3-1', 'awd-3', 'Must have demonstrated consistent support performance during the current award cycle.', 1, 1),
('elig-4-1', 'awd-4', 'Innovation must be documented and verifiable within city operations.', 1, 1),
('elig-5-1', 'awd-5', 'Nominee must serve in a frontline or field-based public service function.', 1, 1);

INSERT INTO `award_document_requirements` (`id`, `award_id`, `document_name`, `description`, `is_mandatory`) VALUES
('dreq-1-1', 'awd-1', 'Official Form A-1 PRAISE Nomination Form', 'Fully accomplished nomination form with detailed justification and signatures.', 1),
('dreq-1-2', 'awd-1', 'Certified True Copy of IPCR Ratings', 'Authenticated IPCR for the last two consecutive rating periods.', 1),
('dreq-1-3', 'awd-1', 'Executive Summary of Major Accomplishments', 'Detailed portfolio of innovations with documentary evidence.', 1),
('dreq-1-4', 'awd-1', 'City Legal or HR Clearance', 'Certificate of No Pending Administrative Case.', 1),
('dreq-2-1', 'awd-2', 'Official Form A-1 PRAISE Nomination Form', 'Signed by the nominator and Head of Office.', 1),
('dreq-2-2', 'awd-2', 'Certified True Copy of IPCR Ratings', 'Authenticated IPCR ratings.', 1),
('dreq-2-3', 'awd-2', 'HR or Legal Clearance', 'Certificate of No Pending Case.', 1),
('dreq-3-1', 'awd-3', 'Official Form A-1 PRAISE Nomination Form', 'Signed nomination form.', 1),
('dreq-3-2', 'awd-3', 'Supervisor Endorsement Memorandum', 'Administrative supervisor endorsement.', 1),
('dreq-4-1', 'awd-4', 'Innovation Brief', 'Narrative explaining the innovation or process improvement.', 1),
('dreq-4-2', 'awd-4', 'Supporting Metrics or Evidence', 'Before-and-after metrics, screenshots, or measurable results.', 1),
('dreq-5-1', 'awd-5', 'Official Form A-1 PRAISE Nomination Form', 'Signed frontline award nomination form.', 1),
('dreq-5-2', 'awd-5', 'Incident, Service, or Deployment Evidence', 'Relevant reports, certifications, or citations.', 1);

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

SET FOREIGN_KEY_CHECKS = 1;
