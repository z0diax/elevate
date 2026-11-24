ALTER TABLE application_documents ADD COLUMN file_name VARCHAR(255) NULL AFTER document_name;
ALTER TABLE endorsements MODIFY created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS nomination_revision_requests (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL,
    revision_number INT NOT NULL,
    requested_by VARCHAR(64) NOT NULL,
    requested_by_name VARCHAR(255) NOT NULL,
    requested_by_role VARCHAR(32) NOT NULL,
    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    instructions TEXT NOT NULL,
    scope ENUM('details', 'attachments', 'both') NOT NULL,
    previous_status VARCHAR(50) NOT NULL,
    previous_stage VARCHAR(50) NOT NULL,
    previous_action TEXT,
    previous_updated_at DATETIME,
    status ENUM('Pending', 'In Progress', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
    active_application_id VARCHAR(64) GENERATED ALWAYS AS
        (CASE WHEN status IN ('Pending', 'In Progress') THEN application_id ELSE NULL END) STORED,
    started_at DATETIME,
    completed_by VARCHAR(64),
    completed_at DATETIME,
    remarks TEXT,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(64),
    cancelled_at DATETIME,
    draft_details JSON,
    draft_remarks TEXT,
    draft_generation INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_active_nomination_revision (active_application_id),
    UNIQUE KEY uq_nomination_revision_number (application_id, revision_number),
    CONSTRAINT fk_nomination_revision_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nomination_revision_files (
    id VARCHAR(64) PRIMARY KEY,
    revision_id VARCHAR(64) NOT NULL,
    attachment_key VARCHAR(74) NOT NULL,
    document JSON,
    UNIQUE KEY uq_revision_attachment (revision_id, attachment_key),
    CONSTRAINT fk_revision_files_request FOREIGN KEY (revision_id) REFERENCES nomination_revision_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nomination_versions (
    application_id VARCHAR(64) NOT NULL,
    version_number INT NOT NULL,
    nomination JSON NOT NULL,
    workflow JSON NOT NULL,
    PRIMARY KEY (application_id, version_number),
    CONSTRAINT fk_nomination_versions_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nomination_revision_signatures (
    application_id VARCHAR(64) NOT NULL,
    version_number INT NOT NULL,
    account_id VARCHAR(64) NOT NULL,
    strokes JSON NOT NULL,
    signed_snapshot JSON NOT NULL,
    sha256 CHAR(64) NOT NULL,
    signed_at DATETIME NOT NULL,
    PRIMARY KEY (application_id, version_number),
    CONSTRAINT fk_revision_signature_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nomination_document_history (
    id VARCHAR(64) PRIMARY KEY,
    application_id VARCHAR(64) NOT NULL,
    document_id VARCHAR(64) NOT NULL,
    sha256 CHAR(64),
    document JSON NOT NULL,
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_nomination_document_version (application_id, document_id, sha256),
    CONSTRAINT fk_nomination_document_history_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
