# HRMDO PRAISE MANAGEMENT

React frontend plus a PHP/MySQL API for XAMPP deployment.

## Development

Prerequisite: Node.js

1. Run `npm install`
2. Run `npm run dev`

## XAMPP deployment

1. Copy the project to `C:\xampp\htdocs\tacloban-praise`
2. Run `npm install`
3. Run `npm run build`
4. Start Apache and MySQL in XAMPP
5. For a fresh installation only, run `C:\xampp\php\php.exe C:\xampp\htdocs\tacloban-praise\setup_db.php` locally to import `database.sql`
6. Open `http://localhost/tacloban-praise/`

The XAMPP-specific deployment notes are in `README_XAMPP.md`.

For an existing database, apply pending `.sql` files from `database_migrations/` in filename order before serving requests. Run the `.php` audit/backfill utility separately as described in the XAMPP guide. Do not run the fresh-install setup script against an existing database.
Before deploying the relational-only evaluator code, run the evaluator assignment audit, backfill, and verification commands in `README_XAMPP.md`. The legacy column stays in place until all historical nominations have been reviewed.
