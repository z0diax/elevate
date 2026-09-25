<?php
/**
 * Export MySQL Database or JSON Backup for Tacloban PRAISE
 */
ini_set('display_errors', '0');
ini_set('log_errors', '1');
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/session_auth.php';

$database = new Database();
$db = $database->getConnection();
if (!$db) sendResponse(503, [], 'Database connection failed.');
require_auth($db, ['ADMINISTRATOR']);

$format = $_GET['format'] ?? 'sql';
if (!in_array($format, ['sql', 'json'], true)) sendResponse(400, [], 'Invalid export format.');

if ($format === 'json') {
    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="tacloban_praise_backup_' . date('Y-m-d') . '.json"');

    if (!$db) {
        http_response_code(503);
        echo json_encode(["error" => "Database not connected"]);
        exit();
    }

    try {
    $backup = [
        "offices" => $db->query("SELECT * FROM offices")->fetchAll(PDO::FETCH_ASSOC),
        "profiles" => $db->query("SELECT * FROM profiles")->fetchAll(PDO::FETCH_ASSOC),
        "awards" => $db->query("SELECT * FROM awards")->fetchAll(PDO::FETCH_ASSOC),
        "award_evaluation_routes" => $db->query("SELECT * FROM award_evaluation_routes")->fetchAll(PDO::FETCH_ASSOC),
        "award_route_evaluators" => $db->query("SELECT * FROM award_route_evaluators")->fetchAll(PDO::FETCH_ASSOC),
        "award_criteria" => $db->query("SELECT * FROM award_criteria")->fetchAll(PDO::FETCH_ASSOC),
        "award_document_requirements" => $db->query("SELECT * FROM award_document_requirements")->fetchAll(PDO::FETCH_ASSOC),
        "award_eligibility_requirements" => $db->query("SELECT * FROM award_eligibility_requirements")->fetchAll(PDO::FETCH_ASSOC),
        "applications" => $db->query("SELECT * FROM applications")->fetchAll(PDO::FETCH_ASSOC),
        "application_evaluator_assignments" => $db->query("SELECT * FROM application_evaluator_assignments")->fetchAll(PDO::FETCH_ASSOC),
        "application_documents" => $db->query("SELECT * FROM application_documents")->fetchAll(PDO::FETCH_ASSOC),
        "endorsements" => $db->query("SELECT * FROM endorsements")->fetchAll(PDO::FETCH_ASSOC),
        "evaluations" => $db->query("SELECT * FROM evaluations")->fetchAll(PDO::FETCH_ASSOC),
        "evaluation_scores" => $db->query("SELECT * FROM evaluation_scores")->fetchAll(PDO::FETCH_ASSOC),
        "application_history" => $db->query("SELECT * FROM application_history")->fetchAll(PDO::FETCH_ASSOC),
        "notifications" => $db->query("SELECT * FROM notifications")->fetchAll(PDO::FETCH_ASSOC),
        "exported_at" => date('c')
    ];

    echo json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    } catch (Throwable $error) {
        error_log('[export.php:json] ' . get_class($error) . ': ' . $error->getMessage());
        http_response_code(500);
        echo json_encode(["error" => "Failed to export database backup."]);
    }
    exit();
} else {
    // Deliver SQL dump file
    $sqlPath = __DIR__ . '/../database.sql';
    if (is_readable($sqlPath)) {
        header('Content-Type: application/sql');
        header('Content-Disposition: attachment; filename="tacloban_praise_db.sql"');
        readfile($sqlPath);
        exit();
    } else {
        error_log('[export.php:sql] Deployment SQL file is unavailable.');
        http_response_code(500);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'Failed to export database backup.';
    }
}
