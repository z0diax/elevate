ALTER TABLE `application_documents`
  MODIFY COLUMN `status` VARCHAR(50) NOT NULL DEFAULT 'Submitted';

UPDATE `application_documents`
SET `status` = 'Head Approved'
WHERE (`status` = '' OR `status` IS NULL)
  AND `verification_remarks` LIKE '%approved%Head%Office%';
