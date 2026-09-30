-- Apply to an existing installation after a database backup, before serving API requests.
-- Safe to rerun: schema changes run only when the required definition is missing.

-- Legacy document status ENUMs must match the canonical VARCHAR definition.
SELECT COUNT(*) INTO @legacy_document_status FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents'
  AND COLUMN_NAME = 'status' AND DATA_TYPE = 'enum';
SET @ddl = IF(@legacy_document_status > 0,
    'ALTER TABLE `application_documents` MODIFY COLUMN `status` VARCHAR(50) NOT NULL DEFAULT ''Submitted''',
    'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

UPDATE `application_documents` SET `status` = 'Head Approved'
WHERE (`status` = '' OR `status` IS NULL)
  AND `verification_remarks` LIKE '%approved%Head%Office%';

-- Report settings may be absent or may lack columns added in earlier releases.
CREATE TABLE IF NOT EXISTS `report_settings` (
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

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'background_image_url';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `background_image_url` VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_prepared_label';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_prepared_label` VARCHAR(255) NOT NULL DEFAULT ''PREPARED BY (Nominator):''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_prepared_name';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_prepared_name` VARCHAR(255) NOT NULL DEFAULT ''{nominator_name}''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_prepared_title';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_prepared_title` VARCHAR(255) NOT NULL DEFAULT ''{nominator_position}''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_verified_label';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_verified_label` VARCHAR(255) NOT NULL DEFAULT ''VERIFIED BY (Secretariat):''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_verified_name';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_verified_name` VARCHAR(255) NOT NULL DEFAULT ''Atty. Paul Vincent G. Yu''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_verified_title';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_verified_title` VARCHAR(255) NOT NULL DEFAULT ''PRAISE Secretariat Lead''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_confirmed_label';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_confirmed_label` VARCHAR(255) NOT NULL DEFAULT ''CONFIRMED BY (HRMDO Head):''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_confirmed_name';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_confirmed_name` VARCHAR(255) NOT NULL DEFAULT ''Marites S. Bocar''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SELECT COUNT(*) INTO @column_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_settings' AND COLUMN_NAME = 'form_a1_confirmed_title';
SET @ddl = IF(@column_exists = 0, 'ALTER TABLE `report_settings` ADD COLUMN `form_a1_confirmed_title` VARCHAR(255) NOT NULL DEFAULT ''City Gov Dept Head II, HRMDO''', 'SELECT 1');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Keep any customized settings row; add only the missing default row.
INSERT IGNORE INTO `report_settings` (
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
