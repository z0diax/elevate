-- Archiving organizes All Applications while preserving nomination records and references.
ALTER TABLE applications ADD COLUMN archived_at DATETIME DEFAULT NULL;
