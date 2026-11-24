# Running tests

Run `npm run test:nomination-pdf` for nomination PDF pagination, recorded signatures, evaluator privacy, attachment failures, and byte-for-byte preservation of PDF, image, and Word attachments. Synthetic review PDFs are written under `tmp/pdfs/`. The nomination viewer browser suite also exercises full PDF downloads on desktop and mobile.

Run `npm run test:deployment` for URL resolution checks for Vercel root deployments and XAMPP subdirectories. Set `TEST_CLOUD_STORAGE=1` when running `node tests/integration.mjs` against a separate empty test database to check durable sessions/files, chunked uploads, and the full workflow, including a server restart and a file larger than Vercel's request limit.

Unit checks need PHP on `PATH` and the installed npm dependencies:

```powershell
npm run test:unit
```

Set `APP_ENV=development` in the PHP process for local XAMPP tests. Signature unit checks run as part of this suite.

The unit suite includes nominee response/history privacy checks. The integration suite verifies that scores and committee notes stay private in nomination lists, individual records, form/history responses, and repeated submission requests, while staff retain review access and nominees retain documents and published workflow status. These checks use synthetic records in the dedicated test database; no production migration is needed.

Login-throttle unit checks cover cooldown/window boundaries, UTC handling, normalized IP addresses, and trusted forwarding headers. The integration suite checks HTTP 429/`Retry-After` and existing-session behavior. Its separate `login_throttle_integration.php` check uses the same dedicated empty test database for account/source limits, email collation aliases, successful-login resets, retention, non-UTC database sessions, and twelve concurrent PHP workers. It removes its synthetic account and counters afterward.

After building, run `npm run test:nomination-browser` for the real headless Chromium signature and Form A1 check. It uses an installed Chrome/Edge (`CHROME_PATH` can override detection), synthetic browser fixtures, and no database. Screenshots and the generated PDF are saved in a printed temporary directory. No extra test-library dependencies are installed.

Run `npm run test:nomination-viewer-browser` after building to verify the shared read-only viewer from each role dashboard, deliberation, and submission lists on desktop and mobile. This uses the same installed Chromium approach and checks fresh retrieval, long narratives, legacy fields, loading/error/retry states, keyboard focus and Escape, and document previews without mutation controls. The API integration suite also checks the form endpoint's role restrictions, draft privacy, reassigned evaluators, history redaction, and document records in a dedicated test database.

To check the nomination migration against historical data, create a separate empty dedicated test database, set both `TEST_DB_NAME` and `DB_NAME` to its name, and run `php tests/nomination_identity_migration.php`. It refuses a database with existing tables, creates only synthetic legacy data, and removes its two test tables afterward.

Integration checks need PHP with `pdo_mysql` and MySQL/MariaDB. They create synthetic accounts and nominations through the real API. Configure a **dedicated empty** database with a name ending in `_test` (or `_test_<suffix>`). The scripts refuse the normal `tacloban_praise_db` database, refuse a test database containing records, and never create or drop the normal database.

PowerShell example for XAMPP:

```powershell
$env:TEST_DB_NAME = 'tacloban_praise_test'
$env:DB_NAME = $env:TEST_DB_NAME
# Set DB_HOST, DB_PORT, DB_USER, DB_PASS if the XAMPP defaults do not apply.
php tests/create_test_db.php
npm run test:integration
```

For POSIX shells, export both `TEST_DB_NAME` and `DB_NAME` with the same value before running the same commands. `create_test_db.php` creates the named database only if needed. Setup creates the project schema only when the database has no tables; it rejects any existing records. No real employee data, uploaded documents, or fixed production IDs are used.

The integration runner starts a local PHP server on a free loopback port, connects it only to the selected test database, and creates a temporary private upload directory outside the web root. It generates synthetic PDF, DOCX, JPG/JPEG and PNG files in memory, removes test records and upload files at the end, and exits nonzero on failure. If the process is interrupted, use a new empty test database for the next run. Apache is not required. The standalone reassignment transaction test uses connection-local temporary tables, but it also requires the explicit test database guard.

The built-in PHP server does not interpret Apache `.htaccess`; the suite checks that `uploads/.htaccess` retains `Require all denied` and exercises authorized document downloads. Direct HTTP denial is enforced by Apache when the application is hosted in XAMPP.

To verify the evaluation revision migration against a legacy submitted row, create a **separate empty** database whose name ends in `_test`, set both `TEST_DB_NAME` and `DB_NAME` to that name, then run `php tests/evaluation_revision_migration.php`. This check creates only its own minimal tables and removes them after verifying that the old score remains intact and revision history is writable.

The Administrator revision coverage runs in the standard integration and nomination viewer browser suites. The integration check also simulates a failed signature insert using a test-only trigger to verify transaction rollback. Use a disposable database account with permission to create and remove that trigger. The upgrade test, `php tests/nomination_revision_migration.php`, uses a separate empty guarded test database and verifies that original signatures, unsigned records, endorsements, attachments, and active-request uniqueness survive the migration.
