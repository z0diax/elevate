<?php
declare(strict_types=1);
require_once __DIR__ . '/test_database_guard.php';
require_test_database();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/services/NominationRevisionPolicy.php';
require_once __DIR__ . '/../api/services/NominationSignature.php';

$db = (new Database())->getConnection();
if (!$db || $db->query('SHOW TABLES')->fetchColumn() !== false) {
    throw new RuntimeException('Use a separate empty dedicated test database for the nomination revision migration.');
}
$legacyTables = ['applications', 'application_documents', 'endorsements', 'nomination_signatures'];
try {
    $schema = file_get_contents(__DIR__ . '/../database.sql');
    foreach ($legacyTables as $table) {
        if (!preg_match('/CREATE TABLE `?' . $table . '`? \([\s\S]+?\) ENGINE=InnoDB[^;]+;/', $schema, $matches)) {
            throw new RuntimeException('Fixture definition missing for ' . $table);
        }
        $legacy = preg_replace('/^.*`file_name`.*\R/m', '', $matches[0]);
        $legacy = str_replace(['DATETIME(6)', 'CURRENT_TIMESTAMP(6)'], ['DATETIME', 'CURRENT_TIMESTAMP'], $legacy);
        $db->exec($legacy);
    }
    $applicationInsert = $db->prepare("INSERT INTO applications
        (id, application_number, award_id, award_name, nominee_name, position_title, office_name, employment_category,
        contact_number, email, nominator_name, nominator_position, nominating_office, justification, accomplishments,
        supporting_narrative, date_of_nomination, status)
        VALUES (?, ?, 'award', 'Award', 'Legacy Nominee', 'Staff', 'Legacy Office', 'Permanent', '09000000',
        'legacy@example.invalid', 'Legacy Nominee', 'Staff', 'Legacy Office', 'Justification', 'Accomplishments',
        'Narrative', '2026-10-08', 'For Endorsement')");
    $applicationInsert->execute(['legacy-signed', 'PRAISE-LEGACY-SIGNED']);
    $applicationInsert->execute(['legacy-unsigned', 'PRAISE-LEGACY-UNSIGNED']);
    $db->exec("INSERT INTO application_documents (id, application_id, document_name, file_url) VALUES ('document', 'legacy-signed', 'Evidence', 'private/evidence.pdf')");
    $db->exec("INSERT INTO endorsements (id, application_id, endorsed_by, endorser_title, decision, remarks) VALUES ('endorsement', 'legacy-signed', 'Head', 'Head', 'Endorsed', 'Recorded')");
    $strokes = '[[[0.1, 0.1], [0.5, 0.5]]]';
    $snapshot = '{"id":"legacy-signed","nominee_name":"Legacy Nominee"}';
    $digest = nomination_signature_digest($strokes, $snapshot);
    $db->prepare('INSERT INTO nomination_signatures (application_id, account_id, strokes, signed_snapshot, sha256) VALUES (?, ?, ?, ?, ?)')
        ->execute(['legacy-signed', 'filer', $strokes, $snapshot, $digest]);
    $original = nomination_version_signature($db, 'legacy-signed', 1);

    $migration = file_get_contents(__DIR__ . '/../database_migrations/20261124_nomination_revisions.sql');
    foreach (explode(';', $migration) as $statement) if (trim($statement) !== '') $db->exec($statement);
    $after = nomination_version_signature($db, 'legacy-signed', 1);
    if ($after !== $original || nomination_signature_digest($after['strokes'], $after['signed_snapshot']) !== $digest) {
        throw new RuntimeException('Legacy signature or digest was changed.');
    }
    if (nomination_version_signature($db, 'legacy-unsigned', 1) !== null || nomination_version_number($db, 'legacy-unsigned') !== 1) {
        throw new RuntimeException('Unsigned legacy nomination became signed.');
    }
    if ($db->query("SELECT file_url FROM application_documents WHERE id = 'document'")->fetchColumn() !== 'private/evidence.pdf'
        || $db->query("SELECT decision FROM endorsements WHERE id = 'endorsement'")->fetchColumn() !== 'Endorsed') {
        throw new RuntimeException('Legacy attachment or endorsement changed.');
    }
    $insert = $db->prepare("INSERT INTO nomination_revision_requests (id, application_id, revision_number, requested_by,
        requested_by_name, requested_by_role, instructions, scope, previous_status, previous_stage)
        VALUES (?, 'legacy-signed', ?, 'administrator', 'Administrator', 'ADMINISTRATOR', 'Correct the attachment',
            'attachments', 'For Endorsement', 'Endorsement')");
    $insert->execute(['revision-first', 1]);
    try {
        $insert->execute(['revision-second', 2]);
        throw new RuntimeException('Duplicate active revision accepted.');
    } catch (PDOException $error) {
        if ($error->getCode() !== '23000') throw $error;
    }
    $db->exec("UPDATE nomination_revision_requests SET status = 'Cancelled' WHERE id = 'revision-first'");
    $insert->execute(['revision-second', 2]);
    echo "Nomination revision migration preserved legacy records, digest compatibility, and active-request uniqueness.\n";
} finally {
    $tables = ['nomination_document_history', 'nomination_revision_signatures', 'nomination_versions',
        'nomination_revision_files', 'nomination_revision_requests', ...array_reverse($legacyTables)];
    foreach ($tables as $table) $db->exec("DROP TABLE IF EXISTS $table");
}
