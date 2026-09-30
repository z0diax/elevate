-- Apply once after the existing schema migrations. Existing submissions remain version 1.
ALTER TABLE evaluations ADD COLUMN version_number INT NOT NULL DEFAULT 1 AFTER is_submitted;

CREATE TABLE evaluation_revision_history (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  application_id VARCHAR(64) NOT NULL,
  evaluation_id VARCHAR(64) NOT NULL,
  evaluator_id VARCHAR(64) NOT NULL,
  revision_number INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  previous_snapshot JSON NOT NULL,
  new_snapshot JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evaluation_revision (evaluation_id, revision_number),
  KEY idx_revision_application (application_id),
  CONSTRAINT fk_revision_evaluation FOREIGN KEY (evaluation_id) REFERENCES evaluations (id) ON DELETE CASCADE,
  CONSTRAINT fk_revision_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
