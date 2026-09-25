<?php
declare(strict_types=1);

/**
 * City Government of Tacloban - PRAISE Management System
 * Automated 1-click database setup for XAMPP deployments.
 */

require_once __DIR__ . '/config/database.php';

// Database initialization is a local maintenance operation, never an HTTP API.
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Database setup is available from the command line only.');
}

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Content-Type: text/html; charset=UTF-8');

$database = new Database();
$rawDb = $database->getRawConnectionWithoutDB();
$isApi = isset($_GET['format']) && $_GET['format'] === 'json';

function respond_json(array $payload): never {
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload);
    exit();
}

function parse_sql_statements(string $sqlContent): array {
    $sqlContent = preg_replace('!/\*.*?\*/!s', '', $sqlContent) ?? $sqlContent;
    $lines = preg_split('/\r\n|\r|\n/', $sqlContent) ?: [];
    $cleanLines = [];

    foreach ($lines as $line) {
        $trimmed = ltrim($line);
        if (str_starts_with($trimmed, '--')) {
            continue;
        }
        $cleanLines[] = $line;
    }

    $cleanSql = implode(PHP_EOL, $cleanLines);
    return array_values(array_filter(array_map('trim', preg_split('/;\s*(?:\r?\n|$)/', $cleanSql) ?: []), static fn(string $statement): bool => $statement !== ''));
}

function render_message_page(string $title, string $message, string $accent = '#38bdf8'): never {
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">';
    echo '<title>HRMDO PRAISE MANAGEMENT Database Setup</title>';
    echo '<style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px; display: flex; align-items: center; justify-content: center; min-height: 80vh; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 640px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        h1 { margin: 0 0 12px; font-size: 24px; color: #ffffff; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 8px 0; }
        .accent { color: ' . $accent . '; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-family: monospace; font-size: 13px; }
      </style></head><body><div class="card">';
    echo '<h1 class="accent">' . htmlspecialchars($title) . '</h1>';
    echo '<p>' . htmlspecialchars($message) . '</p>';
    echo '</div></body></html>';
    exit();
}

if (!$rawDb) {
    http_response_code(503);
    $message = 'Database connection failed.';
    if ($isApi) {
        respond_json(['status' => 'error', 'message' => $message]);
    }
    render_message_page('XAMPP MySQL Connection Failed', $message, '#f87171');
}

try {
    $rawDb->exec('CREATE DATABASE IF NOT EXISTS `tacloban_praise_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');

    $db = $database->getConnection();
    if (!$db) {
        throw new Exception('Created the database but failed to reconnect to tacloban_praise_db.');
    }

    $sqlPath = __DIR__ . '/../database.sql';
    if (!file_exists($sqlPath)) {
        $sqlPath = __DIR__ . '/../public/tacloban_praise_db.sql';
    }

    if (!file_exists($sqlPath)) {
        throw new Exception('The deployment SQL file was not found. Expected database.sql in the project root.');
    }

    $sqlContent = (string)file_get_contents($sqlPath);

    $db->exec('SET FOREIGN_KEY_CHECKS = 0;');
    $queries = parse_sql_statements($sqlContent);
    $executedCount = 0;

    foreach ($queries as $query) {
        $db->exec($query);
        $executedCount++;
    }

    $db->exec('SET FOREIGN_KEY_CHECKS = 1;');

    if ($isApi) {
        respond_json([
            'status' => 'success',
            'message' => "Database initialized successfully with {$executedCount} queries executed.",
            'database' => 'tacloban_praise_db',
            'bootstrap_admin' => [
                'email' => 'admin@tacloban.gov.ph',
                'password' => 'ChangeMe123!',
            ],
        ]);
    }
} catch (Throwable $exception) {
    error_log('[setup_db.php:initialize] ' . get_class($exception) . ': ' . $exception->getMessage());
    if (isset($db) && $db instanceof PDO) {
        try {
            $db->exec('SET FOREIGN_KEY_CHECKS = 1;');
        } catch (Throwable $resetError) {
            error_log('[setup_db.php:reset_foreign_keys] ' . get_class($resetError) . ': ' . $resetError->getMessage());
        }
    }

    http_response_code(500);
    if ($isApi) {
        respond_json(['status' => 'error', 'message' => 'Database setup failed.']);
    }

    render_message_page('Database Setup Failed', 'Database setup failed.', '#f87171');
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tacloban PRAISE - Database Initialized</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      margin: 0;
      padding: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 32px;
      max-width: 680px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: #064e3b;
      color: #34d399;
      font-weight: 700;
      font-size: 12px;
      border-radius: 9999px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 24px;
      color: #ffffff;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.6;
      margin: 8px 0;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 20px 0;
    }
    .stat-box {
      background: #0f172a;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid #334155;
    }
    .stat-title {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: bold;
    }
    .stat-value {
      font-size: 18px;
      font-weight: bold;
      color: #38bdf8;
      margin-top: 4px;
    }
    .credential-box {
      margin: 20px 0;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #475569;
      background: #111827;
    }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      transition: background 0.2s;
      margin-top: 16px;
    }
    .btn:hover {
      background: #1d4ed8;
    }
    code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      color: #38bdf8;
      font-family: monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">MySQL Database Ready</span>
    <h1>HRMDO PRAISE MANAGEMENT Initialized</h1>
    <p>Your XAMPP MySQL database <code>tacloban_praise_db</code> has been created and loaded with the deployment schema, award configuration, office records, and bootstrap administrator account.</p>

    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-title">Database Name</div>
        <div class="stat-value" style="font-size: 15px;">tacloban_praise_db</div>
      </div>
      <div class="stat-box">
        <div class="stat-title">SQL Statements</div>
        <div class="stat-value"><?= htmlspecialchars((string)$executedCount) ?> Executed</div>
      </div>
      <div class="stat-box">
        <div class="stat-title">Charset / Collation</div>
        <div class="stat-value" style="font-size: 14px;">utf8mb4_unicode_ci</div>
      </div>
      <div class="stat-box">
        <div class="stat-title">Status</div>
        <div class="stat-value" style="color: #34d399; font-size: 15px;">Live & Connected</div>
      </div>
    </div>

    <div class="credential-box">
      <div class="stat-title">Bootstrap Administrator</div>
      <p>Email: <code>admin@tacloban.gov.ph</code></p>
      <p>Password: <code>ChangeMe123!</code></p>
      <p>Create the real deployment users from the Admin panel after your first login.</p>
    </div>

    <p>You can now access the live application:</p>
    <a href="../" class="btn">Open Tacloban PRAISE App &rarr;</a>
  </div>
</body>
</html>
