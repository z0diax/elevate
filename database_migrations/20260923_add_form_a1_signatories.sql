ALTER TABLE `report_settings`
  ADD COLUMN `form_a1_prepared_label` VARCHAR(255) NOT NULL DEFAULT 'PREPARED BY (Nominator):' AFTER `right_signatory_title`,
  ADD COLUMN `form_a1_prepared_name` VARCHAR(255) NOT NULL DEFAULT '{nominator_name}' AFTER `form_a1_prepared_label`,
  ADD COLUMN `form_a1_prepared_title` VARCHAR(255) NOT NULL DEFAULT '{nominator_position}' AFTER `form_a1_prepared_name`,
  ADD COLUMN `form_a1_verified_label` VARCHAR(255) NOT NULL DEFAULT 'VERIFIED BY (Secretariat):' AFTER `form_a1_prepared_title`,
  ADD COLUMN `form_a1_verified_name` VARCHAR(255) NOT NULL DEFAULT 'Atty. Paul Vincent G. Yu' AFTER `form_a1_verified_label`,
  ADD COLUMN `form_a1_verified_title` VARCHAR(255) NOT NULL DEFAULT 'PRAISE Secretariat Lead' AFTER `form_a1_verified_name`,
  ADD COLUMN `form_a1_confirmed_label` VARCHAR(255) NOT NULL DEFAULT 'CONFIRMED BY (HRMDO Head):' AFTER `form_a1_verified_title`,
  ADD COLUMN `form_a1_confirmed_name` VARCHAR(255) NOT NULL DEFAULT 'Marites S. Bocar' AFTER `form_a1_confirmed_label`,
  ADD COLUMN `form_a1_confirmed_title` VARCHAR(255) NOT NULL DEFAULT 'City Gov Dept Head II, HRMDO' AFTER `form_a1_confirmed_name`;
