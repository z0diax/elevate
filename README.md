# HRMDO PRAISE MANAGEMENT

React frontend plus a PHP/MySQL API. Deploy the complete app to Vercel in a PHP container with a shared cloud database, or run it locally with XAMPP.

## Vercel deployment and shared data

Follow [README_VERCEL.md](README_VERCEL.md) to deploy the frontend and API together on Vercel. Records, sessions, and uploads persist in one cloud database with the existing account permissions. A local XAMPP instance alone does not make your data available outside your network.

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

## Mobile layout checks

Run `npm run build`, then `npm run test:mobile-browser` with Chrome or Edge installed. Set `CHROME_PATH` if the browser is outside the standard Windows installation paths. The check uses isolated fixture data and does not change the application database.

It checks login, registration, password setup, admin lists, reports, navigation, and dialogs at 320, 390, 768, and 1280 pixels. Phone and tablet admin lists use cards; desktop tables remain available from 1280 pixels. Screenshots are saved to the temporary review directory printed by the test.

Run `npm run test:nomination-browser` and `npm run test:nomination-viewer-browser` for nomination submission, touch signatures, and the shared viewer across user roles.
