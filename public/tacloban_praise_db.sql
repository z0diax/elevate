-- ==============================================================================
-- CITY GOVERNMENT OF TACLOBAN - PRAISE MANAGEMENT SYSTEM
-- Program on Awards and Incentives for Service Excellence
-- Complete MySQL / MariaDB Database Dump for XAMPP (Apache + MySQL + PHP)
-- Target: phpMyAdmin / MySQL 5.7+ / MariaDB 10.4+
-- Database: tacloban_praise_db
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `tacloban_praise_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `tacloban_praise_db`;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- Table structure for table `offices`
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- Table structure for table `profiles` (Users)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `profiles`;
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
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_role` (`role`),
  KEY `idx_office` (`office_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `awards`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `awards`;
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

-- ------------------------------------------------------------------------------
-- Table structure for table `award_eligibility_requirements`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `award_eligibility_requirements`;
CREATE TABLE `award_eligibility_requirements` (
  `id` VARCHAR(64) NOT NULL,
  `award_id` VARCHAR(64) NOT NULL,
  `requirement_description` TEXT NOT NULL,
  `is_mandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `order_index` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_award_eligibility` (`award_id`),
  CONSTRAINT `fk_eligibility_award` FOREIGN KEY (`award_id`) REFERENCES `awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `award_document_requirements`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `award_document_requirements`;
CREATE TABLE `award_document_requirements` (
  `id` VARCHAR(64) NOT NULL,
  `award_id` VARCHAR(64) NOT NULL,
  `document_name` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `is_mandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_award_doc_req` (`award_id`),
  CONSTRAINT `fk_docreq_award` FOREIGN KEY (`award_id`) REFERENCES `awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `award_criteria`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `award_criteria`;
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
  CONSTRAINT `fk_criteria_award` FOREIGN KEY (`award_id`) REFERENCES `awards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `applications`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `applications`;
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
  KEY `idx_award` (`award_id`),
  KEY `idx_nominee` (`nominee_id`),
  KEY `idx_office_app` (`office_id`),
  KEY `idx_status` (`status`),
  KEY `idx_stage` (`processing_stage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `application_documents`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `application_documents`;
CREATE TABLE `application_documents` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `requirement_id` VARCHAR(64) DEFAULT NULL,
  `document_name` VARCHAR(255) NOT NULL,
  `file_url` TEXT NOT NULL,
  `file_size` BIGINT DEFAULT 1500000,
  `file_type` VARCHAR(100) DEFAULT 'application/pdf',
  `status` VARCHAR(50) NOT NULL DEFAULT 'Submitted',
  `verification_remarks` TEXT DEFAULT NULL,
  `verified_by` VARCHAR(255) DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_app_docs` (`application_id`),
  CONSTRAINT `fk_docs_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `endorsements`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `endorsements`;
CREATE TABLE `endorsements` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `endorsed_by` VARCHAR(255) NOT NULL,
  `endorser_title` VARCHAR(255) NOT NULL,
  `decision` ENUM('Endorsed', 'Returned for Revision', 'Rejected') NOT NULL,
  `remarks` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_endorsement_app` (`application_id`),
  CONSTRAINT `fk_endorsement_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `evaluations`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `evaluations`;
CREATE TABLE `evaluations` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `evaluator_id` VARCHAR(64) NOT NULL,
  `evaluator_name` VARCHAR(255) NOT NULL,
  `evaluator_office` VARCHAR(255) DEFAULT NULL,
  `total_raw_score` DECIMAL(5,2) DEFAULT 0.00,
  `weighted_percentage` DECIMAL(5,2) DEFAULT 0.00,
  `general_remarks` TEXT DEFAULT NULL,
  `is_submitted` TINYINT(1) NOT NULL DEFAULT 0,
  `submitted_at` DATETIME DEFAULT NULL,
  `reopened_at` DATETIME DEFAULT NULL,
  `reopened_by` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_app_evaluator` (`application_id`, `evaluator_id`),
  KEY `idx_eval_app` (`application_id`),
  KEY `idx_eval_user` (`evaluator_id`),
  CONSTRAINT `fk_eval_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `evaluation_scores`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `evaluation_scores`;
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
  KEY `idx_eval_score_parent` (`evaluation_id`),
  CONSTRAINT `fk_score_evaluation` FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `application_history` (Audit Trail)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `application_history`;
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
  KEY `idx_history_app` (`application_id`),
  CONSTRAINT `fk_history_application` FOREIGN KEY (`application_id`) REFERENCES `applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `notifications`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
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
  KEY `idx_notif_user` (`user_id`),
  KEY `idx_notif_role` (`target_role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table structure for table `report_settings`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `report_settings`;
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

-- ==============================================================================
-- SEED DATA INSERTION
-- ==============================================================================

-- Offices
INSERT INTO `offices` (`id`, `name`, `code`, `head_name`, `head_title`, `is_active`) VALUES
('off-1', 'City Human Resource Management Office', 'CHRMO', 'Atty. Maria Elena Santos', 'City Government Department Head II', 1),
('off-2', 'City Disaster Risk Reduction and Management Office', 'CDRRMO', 'Engr. Antonio R. Veloso', 'CDRRMO Officer-in-Charge', 1),
('off-3', 'City Health Office', 'CHO', 'Dr. Danilo P. Morales, M.D.', 'City Health Officer II', 1),
('off-4', 'City Social Welfare and Development Office', 'CSWDO', 'Ma. Lourdes G. Tan', 'CSWDO Head', 1),
('off-5', 'City Information and Communications Technology Office', 'CICTO', 'Engr. Ronald M. Gomez', 'IT Department Head', 1),
('off-6', 'City Planning and Development Office', 'CPDO', 'Arch. Fernando B. Reyes', 'City Planning Coordinator', 1),
('off-7', 'City Treasurer\'s Office', 'CTO', 'Hon. Patricia V. Lim', 'City Treasurer', 1),
('off-8', 'City Administrator\'s Office', 'CAO', 'Atty. Roberto C. Romualdez', 'City Administrator', 1);

-- Profiles (Users)
INSERT INTO `profiles` (`id`, `email`, `full_name`, `role`, `office_id`, `office_name`, `position_title`, `employee_id`, `contact_number`, `barangay`) VALUES
('usr-admin-1', 'admin@tacloban.gov.ph', 'Atty. Roberto Romualdez', 'ADMINISTRATOR', 'off-8', 'City Administrator\'s Office', 'City Administrator / PRAISE Chair', 'EMP-TAC-001', '0917-555-0101', 'Brgy. 54-A, Tacloban City'),
('usr-sec-1', 'chrmo.secretariat@tacloban.gov.ph', 'Ma. Victoria D. Alcantara', 'SECRETARIAT', 'off-1', 'City Human Resource Management Office', 'Supervising Administrative Officer', 'EMP-TAC-042', '0918-555-0142', 'Brgy. 88, San Jose, Tacloban City'),
('usr-head-1', 'antonio.veloso@tacloban.gov.ph', 'Engr. Antonio R. Veloso', 'HEAD_OF_OFFICE', 'off-2', 'City Disaster Risk Reduction and Management Office', 'CDRRMO Department Head', 'EMP-TAC-108', '0920-555-0108', 'Brgy. 91, Abucay, Tacloban City'),
('usr-eval-1', 'danilo.morales@tacloban.gov.ph', 'Dr. Danilo P. Morales, M.D.', 'EVALUATOR', 'off-3', 'City Health Office', 'City Health Officer / PRAISE Committee Member', 'EMP-TAC-077', '0922-555-0177', 'Brgy. 62-A, Sagkahan, Tacloban City'),
('usr-eval-2', 'elena.santos@tacloban.gov.ph', 'Atty. Maria Elena Santos', 'EVALUATOR', 'off-1', 'City Human Resource Management Office', 'CHRMO Head / PRAISE Vice Chair', 'EMP-TAC-015', '0919-555-0115', 'Brgy. 37, Downtown, Tacloban City'),
('usr-eval-3', 'ronald.gomez@tacloban.gov.ph', 'Engr. Ronald M. Gomez', 'EVALUATOR', 'off-5', 'City Information and Communications Technology Office', 'IT Officer / PRAISE Technical Evaluator', 'EMP-TAC-094', '0928-555-0194', 'Brgy. 99, Diit, Tacloban City'),
('usr-nom-1', 'kristine.garcia@tacloban.gov.ph', 'Engr. Kristine Mae Garcia', 'NOMINEE', 'off-2', 'City Disaster Risk Reduction and Management Office', 'Disaster Management Officer III', 'EMP-TAC-321', '0917-888-0321', 'Brgy. 6-A, Santo Niño, Tacloban City'),
('usr-nom-2', 'bernardo.reyes@tacloban.gov.ph', 'Bernardo L. Reyes, RN', 'NOMINEE', 'off-3', 'City Health Office', 'Nurse II / Community Health Coordinator', 'EMP-TAC-405', '0921-888-0405', 'Brgy. 83-B, San Jose, Tacloban City');

-- Report Settings
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

-- Awards
INSERT INTO `awards` (`id`, `name`, `code`, `description`, `award_year`, `min_qualifying_score`, `is_active`) VALUES
('awd-1', 'Mayor Alfred S. Romualdez Award for Exemplary Public Service', 'MASR-EPS', 'The highest honor conferred to individual personnel demonstrating heroic devotion, unquestionable integrity, and extraordinary service to the people of Tacloban City.', 2026, 90.00, 1),
('awd-2', 'Outstanding Employee of the Year (Professional / Technical)', 'OEY-PROF', 'Conferred upon permanent or contractual personnel in professional/technical categories who demonstrated exceptional competence and tangible innovations.', 2026, 85.00, 1),
('awd-3', 'Outstanding Employee of the Year (Administrative / Support)', 'OEY-ADMIN', 'Recognizing clerks, administrative aides, and support staff exhibiting exemplary work ethic, prompt service, and dedication beyond the call of duty.', 2026, 85.00, 1),
('awd-4', 'Innovator and Process Efficiency Award', 'INNOV-EFF', 'Given to individuals or teams who engineered digital solutions, operational streamlines, or disaster preparedness innovations saving government resources.', 2026, 88.00, 1),
('awd-5', 'Gawad Huwarang Lingkod Bayan (Community Frontliner)', 'GHLB-FRONT', 'Recognizes field workers, health responders, traffic enforcers, and emergency responders delivering compassionate on-the-ground service in Tacloban City.', 2026, 85.00, 1);

-- Award Criteria
INSERT INTO `award_criteria` (`id`, `award_id`, `criterion_name`, `criterion_description`, `weight_percentage`, `max_score`) VALUES
('crit-1-1', 'awd-1', 'Noteworthiness of Innovation & Public Impact', 'Tangible benefits, systemic transformation, and positive impact on Tacloban constituents', 35.00, 100.00),
('crit-1-2', 'awd-1', 'Integrity, Ethical Standards & Public Esteem', 'Exemplary personal conduct and adherence to Republic Act 6713 Code of Conduct', 25.00, 100.00),
('crit-1-3', 'awd-1', 'Performance Rating & Productivity Output', 'Consistent Outstanding or Very Satisfactory IPCR ratings over the last 2 rating periods', 20.00, 100.00),
('crit-1-4', 'awd-1', 'Sustained Dedication Beyond Call of Duty', 'Demonstrated readiness to serve during city emergencies, typhoons, and crisis scenarios', 20.00, 100.00),
('crit-2-1', 'awd-2', 'Technical Excellence & Quality of Deliverables', 'Precision, accuracy, and adherence to civil service professional benchmarks', 40.00, 100.00),
('crit-2-2', 'awd-2', 'Operational Efficiency & Time Management', 'Prompt execution of assignments and reduction of processing turnaround times', 30.00, 100.00),
('crit-2-3', 'awd-2', 'Client Satisfaction & Stakeholder Feedback', 'Verified positive feedback from internal and external Tacloban constituents', 30.00, 100.00);

-- Award Eligibility Requirements
INSERT INTO `award_eligibility_requirements` (`id`, `award_id`, `requirement_description`, `is_mandatory`, `order_index`) VALUES
('elig-1-1', 'awd-1', 'Must have served at least 2 consecutive years in the City Government of Tacloban.', 1, 1),
('elig-1-2', 'awd-1', 'Must have at least a Very Satisfactory (VS) IPCR rating for the last two consecutive rating periods.', 1, 2),
('elig-1-3', 'awd-1', 'Must not have been convicted of any administrative offense or crime involving moral turpitude.', 1, 3);

-- Award Document Requirements
INSERT INTO `award_document_requirements` (`id`, `award_id`, `document_name`, `description`, `is_mandatory`) VALUES
('dreq-1-1', 'awd-1', 'Official Form A-1 PRAISE Nomination Form', 'Fully accomplished nomination form with detailed justification and signatures', 1),
('dreq-1-2', 'awd-1', 'Certified True Copy of IPCR Ratings', 'Authenticated IPCR for the last 2 consecutive rating periods', 1),
('dreq-1-3', 'awd-1', 'Executive Summary of Major Accomplishments', 'Detailed portfolio of innovations with photographic or documentary evidence', 1),
('dreq-1-4', 'awd-1', 'City Legal / Ombudsman & HR Clearance', 'Certificate of No Pending Administrative Case from CHRMO / City Legal', 1),
('dreq-2-1', 'awd-2', 'Official Form A-1 PRAISE Nomination Form', 'Signed by Nominator and Head of Office', 1),
('dreq-2-2', 'awd-2', 'Certified True Copy of IPCR Ratings', 'Authenticated IPCR ratings', 1),
('dreq-2-3', 'awd-2', 'HR / Legal Clearance', 'Certificate of No Pending Case', 1);

-- Initial Applications
INSERT INTO `applications` (`id`, `application_number`, `award_id`, `award_name`, `award_year`, `nominee_id`, `nominee_name`, `employee_id`, `position_title`, `office_id`, `office_name`, `division_section`, `employment_category`, `contact_number`, `email`, `barangay`, `nomination_type`, `nominator_id`, `nominator_name`, `nominator_position`, `nominating_office`, `justification`, `accomplishments`, `supporting_narrative`, `date_of_nomination`, `status`, `processing_stage`, `required_action`, `remarks`, `final_weighted_score`, `assigned_evaluators`, `created_at`) VALUES
('app-1', 'PRAISE-2026-00001', 'awd-1', 'Mayor Alfred S. Romualdez Award for Exemplary Public Service', 2026, 'usr-nom-1', 'Engr. Kristine Mae Garcia', 'EMP-TAC-321', 'Disaster Management Officer III', 'off-2', 'City Disaster Risk Reduction and Management Office', 'Operations and Early Warning Division', 'Permanent / Plantilla', '0917-888-0321', 'kristine.garcia@tacloban.gov.ph', 'Brgy. 6-A, Santo Niño, Tacloban City', 'Individual', 'usr-head-1', 'Engr. Antonio R. Veloso', 'CDRRMO Department Head', 'City Disaster Risk Reduction and Management Office', 'Pioneered Tacloban Automated Coastal Water Surge Early Warning Telemetry Network that protected over 14,000 coastal families during tropical depressions.', 'Deployment of 12 real-time tide gauges and flood telemetry nodes across San Pedro Bay and Cancabato Bay; Reduced evacuation lead time from 4 hours to 45 minutes.', 'Engr. Garcia has consistently served with unmatched valor and dedication during typhoon response missions in Tacloban City.', '2026-02-10', 'For Evaluation', 'Evaluation', 'Evaluator assessment in progress', 'Endorsed and verified complete with all 4 authentic civil service attachments.', 92.50, '["usr-eval-1", "usr-eval-2", "usr-eval-3"]', NOW() - INTERVAL 5 DAY),
('app-2', 'PRAISE-2026-00002', 'awd-2', 'Outstanding Employee of the Year (Professional / Technical)', 2026, 'usr-nom-2', 'Bernardo L. Reyes, RN', 'EMP-TAC-405', 'Nurse II / Community Health Coordinator', 'off-3', 'City Health Office', 'Barangay Health Services Division', 'Permanent / Plantilla', '0921-888-0405', 'bernardo.reyes@tacloban.gov.ph', 'Brgy. 83-B, San Jose, Tacloban City', 'Individual', 'usr-eval-1', 'Dr. Danilo P. Morales, M.D.', 'City Health Officer', 'City Health Office', 'Demonstrated exceptional leadership in establishing the Northern Tacloban Mobile Nutrition and Immunization Clinic, reaching 98.4% immunization coverage in remote barangays.', 'Organized 48 community health outreaches across Tacloban North relocation sites, providing free pediatric checkups and maternal health care.', 'Consistently rated Outstanding (4.92) in IPCR with zero client complaints and commendations from barangay chairpersons.', '2026-02-14', 'For Verification', 'Document Verification', 'Awaiting Secretariat document verification', 'Nomination submitted and endorsed by CHO Head.', NULL, '[]', NOW() - INTERVAL 3 DAY);

-- Application Documents
INSERT INTO `application_documents` (`id`, `application_id`, `requirement_id`, `document_name`, `file_url`, `file_size`, `file_type`, `status`, `verification_remarks`, `verified_by`, `verified_at`) VALUES
('doc-app1-1', 'app-1', 'dreq-1-1', 'Official Form A-1 PRAISE Nomination Form', 'https://tacloban.gov.ph/praise/docs/PRAISE-2026-00001-FormA1.pdf', 1845000, 'application/pdf', 'Verified', 'Form A-1 signed by CDRRMO Head and complete with all biographical data.', 'Ma. Victoria D. Alcantara', NOW() - INTERVAL 4 DAY),
('doc-app1-2', 'app-1', 'dreq-1-2', 'Certified True Copy of IPCR Ratings (2025-1 & 2025-2)', 'https://tacloban.gov.ph/praise/docs/PRAISE-2026-00001-IPCR.pdf', 2100000, 'application/pdf', 'Verified', 'Validated rating of 4.95 (Outstanding) in both rating periods.', 'Ma. Victoria D. Alcantara', NOW() - INTERVAL 4 DAY),
('doc-app1-3', 'app-1', 'dreq-1-3', 'Executive Summary of Major Accomplishments', 'https://tacloban.gov.ph/praise/docs/PRAISE-2026-00001-Accomplishments.pdf', 4500000, 'application/pdf', 'Verified', 'Telemetry maps and certification from DOST-PAGASA included.', 'Ma. Victoria D. Alcantara', NOW() - INTERVAL 4 DAY),
('doc-app1-4', 'app-1', 'dreq-1-4', 'City Legal / Ombudsman & HR Clearance', 'https://tacloban.gov.ph/praise/docs/PRAISE-2026-00001-Clearance.pdf', 950000, 'application/pdf', 'Verified', 'Certificate of No Pending Administrative Case issued Jan 2026.', 'Ma. Victoria D. Alcantara', NOW() - INTERVAL 4 DAY),
('doc-app2-1', 'app-2', 'dreq-2-1', 'Official Form A-1 PRAISE Nomination Form', 'https://tacloban.gov.ph/praise/docs/PRAISE-2026-00002-FormA1.pdf', 1600000, 'application/pdf', 'Submitted', NULL, NULL, NULL),
('doc-app2-2', 'app-2', 'dreq-2-2', 'Certified True Copy of IPCR Ratings', 'https://tacloban.gov.ph/praise/docs/PRAISE-2026-00002-IPCR.pdf', 1900000, 'application/pdf', 'Submitted', NULL, NULL, NULL),
('doc-app2-3', 'app-2', 'dreq-2-3', 'HR / Legal Clearance', 'https://tacloban.gov.ph/praise/docs/PRAISE-2026-00002-Clearance.pdf', 850000, 'application/pdf', 'Submitted', NULL, NULL, NULL);

-- Application History / Audit Trail
INSERT INTO `application_history` (`id`, `application_id`, `user_id`, `user_name`, `user_role`, `action`, `previous_status`, `new_status`, `remarks`, `created_at`) VALUES
('log-1', 'app-1', 'usr-head-1', 'Engr. Antonio R. Veloso', 'HEAD_OF_OFFICE', 'Nomination Submitted', 'Draft', 'For Endorsement', 'Nomination created for Engr. Kristine Mae Garcia', NOW() - INTERVAL 5 DAY),
('log-2', 'app-1', 'usr-head-1', 'Engr. Antonio R. Veloso', 'HEAD_OF_OFFICE', 'Head of Office: Endorsed', 'For Endorsement', 'For Verification', 'Strongly endorsed for city-wide recognition due to disaster innovations.', NOW() - INTERVAL 4 DAY),
('log-3', 'app-1', 'usr-sec-1', 'Ma. Victoria D. Alcantara', 'SECRETARIAT', 'Secretariat Verified All Documents', 'For Verification', 'Verified', 'All 4 mandatory documentary attachments validated compliant.', NOW() - INTERVAL 4 DAY),
('log-4', 'app-1', 'usr-sec-1', 'Ma. Victoria D. Alcantara', 'SECRETARIAT', 'Routed to Evaluators', 'Verified', 'For Evaluation', 'Assigned 3 PRAISE Committee Evaluators.', NOW() - INTERVAL 3 DAY);

-- Notifications
INSERT INTO `notifications` (`id`, `user_id`, `target_role`, `application_id`, `application_number`, `title`, `message`, `is_read`, `link_tab`) VALUES
('notif-1', 'usr-eval-1', 'EVALUATOR', 'app-1', 'PRAISE-2026-00001', 'New Evaluation Assignment', 'You have been assigned to evaluate Engr. Kristine Mae Garcia for the Mayor Alfred S. Romualdez Award.', 0, 'evaluator-queue'),
('notif-2', 'usr-sec-1', 'SECRETARIAT', 'app-2', 'PRAISE-2026-00002', 'New Nomination for Verification', 'Bernardo L. Reyes, RN nomination requires Secretariat document verification.', 0, 'secretariat-workbench');

SET FOREIGN_KEY_CHECKS = 1;
