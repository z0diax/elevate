<?php
/**
 * Export MySQL Database or JSON Backup for Tacloban PRAISE
 */
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

$format = $_GET['format'] ?? 'sql';

if ($format === 'json') {
    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="tacloban_praise_backup_' . date('Y-m-d') . '.json"');

    if (!$db) {
        echo json_encode(["error" => "Database not connected"]);
        exit();
    }

    $backup = [
        "offices" => $db->query("SELECT * FROM offices")->fetchAll(PDO::FETCH_ASSOC),
        "profiles" => $db->query("SELECT * FROM profiles")->fetchAll(PDO::FETCH_ASSOC),
        "awards" => $db->query("SELECT * FROM awards")->fetchAll(PDO::FETCH_ASSOC),
        "award_criteria" => $db->query("SELECT * FROM award_criteria")->fetchAll(PDO::FETCH_ASSOC),
        "award_document_requirements" => $db->query("SELECT * FROM award_document_requirements")->fetchAll(PDO::FETCH_ASSOC),
        "award_eligibility_requirements" => $db->query("SELECT * FROM award_eligibility_requirements")->fetchAll(PDO::FETCH_ASSOC),
        "applications" => $db->query("SELECT * FROM applications")->fetchAll(PDO::FETCH_ASSOC),
        "application_documents" => $db->query("SELECT * FROM application_documents")->fetchAll(PDO::FETCH_ASSOC),
        "endorsements" => $db->query("SELECT * FROM endorsements")->fetchAll(PDO::FETCH_ASSOC),
        "evaluations" => $db->query("SELECT * FROM evaluations")->fetchAll(PDO::FETCH_ASSOC),
        "evaluation_scores" => $db->query("SELECT * FROM evaluation_scores")->fetchAll(PDO::FETCH_ASSOC),
        "application_history" => $db->query("SELECT * FROM application_history")->fetchAll(PDO::FETCH_ASSOC),
        "notifications" => $db->query("SELECT * FROM notifications")->fetchAll(PDO::FETCH_ASSOC),
        "exported_at" => date('c')
    ];

    echo json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit();
} else {
    // Deliver SQL dump file
    $sqlPath = __DIR__ . '/../database.sql';
    if (file_exists($sqlPath)) {
        header('Content-Type: application/sql');
        header('Content-Disposition: attachment; filename="tacloban_praise_db.sql"');
        readfile($sqlPath);
        exit();
    } else {
        echo "-- Error: database.sql not found";
    }
}
