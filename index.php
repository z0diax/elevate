<?php
declare(strict_types=1);

$scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
$appBase = rtrim(str_replace('/index.php', '', $scriptName), '/');
if ($appBase === '/' || $appBase === '.') {
    $appBase = '';
}

$distIndex = __DIR__ . '/dist/index.html';

if (is_file($distIndex) && is_readable($distIndex)) {
    $html = file_get_contents($distIndex);

    if ($html === false) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=UTF-8');
        echo "Unable to read dist/index.html.";
        exit();
    }

    $baseHref = $appBase === '' ? '/' : $appBase . '/';
    $baseTag = '    <base href="' . htmlspecialchars($baseHref, ENT_QUOTES, 'UTF-8') . '">' . PHP_EOL;
    $html = preg_replace('/<head(\s*[^>]*)>/', '<head$1>' . PHP_EOL . $baseTag, $html, 1) ?? $html;

    header('Content-Type: text/html; charset=UTF-8');
    echo $html;
    exit();
}

header('Content-Type: text/html; charset=UTF-8');
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tacloban PRAISE XAMPP Setup</title>
    <style>
      body {
        margin: 0;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      main {
        max-width: 720px;
        margin: 0 auto;
        padding: 48px 24px;
      }
      .card {
        background: rgba(15, 23, 42, 0.82);
        border: 1px solid #334155;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.35);
      }
      h1 {
        margin-top: 0;
        font-size: 28px;
      }
      code {
        background: #1e293b;
        border-radius: 6px;
        padding: 2px 6px;
      }
      a {
        color: #93c5fd;
      }
      ol {
        padding-left: 20px;
      }
      li + li {
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>Tacloban PRAISE is not built yet</h1>
        <p>XAMPP can serve this app after the Vite frontend is built once.</p>
        <ol>
          <li>Run <code>npm install</code></li>
          <li>Run <code>npm run build</code></li>
          <li>Refresh this page</li>
          <li>Initialize the database at <a href="<?php echo htmlspecialchars(($appBase === '' ? '' : $appBase) . '/api/setup_db.php', ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars(($appBase === '' ? '' : $appBase) . '/api/setup_db.php', ENT_QUOTES, 'UTF-8'); ?></a></li>
        </ol>
        <p>Deployment notes are in <code>README_XAMPP.md</code>.</p>
      </div>
    </main>
  </body>
</html>
