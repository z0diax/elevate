-- Apply once. NULL origin preserves uncertainty in historical nominations.
ALTER TABLE applications
  ADD COLUMN nominating_office_id VARCHAR(64) NULL,
  ADD COLUMN nomination_origin VARCHAR(32) NULL,
  ADD COLUMN submission_account_name VARCHAR(255) NULL,
  ADD COLUMN submission_account_role VARCHAR(32) NULL;

CREATE TABLE nomination_signatures (
  application_id VARCHAR(64) NOT NULL PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  strokes JSON NOT NULL,
  signed_snapshot JSON NOT NULL,
  sha256 CHAR(64) NOT NULL,
  signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_signature_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
