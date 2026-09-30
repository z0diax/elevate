# Running tests

Unit checks need PHP on `PATH` and the installed npm dependencies:

```powershell
npm run test:unit
```

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
