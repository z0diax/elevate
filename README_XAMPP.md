# HRMDO PRAISE MANAGEMENT XAMPP Guide

This project runs on XAMPP with:

1. A Vite-built frontend in `dist/`
2. A PHP API in `api/`
3. MySQL or MariaDB using `database.sql`
4. Apache rewrite rules from the root `.htaccess`

## Setup

1. Copy the project to `C:\xampp\htdocs\tacloban-praise`
2. Start Apache and MySQL from the XAMPP control panel
3. Run `npm install`
4. Run `npm run build`
5. Run `C:\xampp\php\php.exe C:\xampp\htdocs\tacloban-praise\setup_db.php` locally
6. Open `http://localhost/tacloban-praise/`
7. Sign in with the bootstrap administrator account:

   - Email: `admin@tacloban.gov.ph`
   - Password: `ChangeMe123!`
   - Create the real deployment users from the Admin panel after first login

## How it works

- `index.php` serves the built frontend from `dist/index.html`
- `.htaccess` keeps `/api` and `/uploads` untouched and maps `/assets/*` to `dist/assets/*`
- `src/lib/mysqlService.ts` resolves the correct project-relative API base for XAMPP subdirectory installs

## API origins and Vite development

The built frontend and PHP API use the same origin; no CORS configuration is needed for normal deployment. `npm run dev` serves Vite on port 3000 and proxies `/api` to XAMPP at `http://localhost/<project-folder>/api`. If Apache uses another host or the project lives at another URL path, set `PHP_API_PROXY_TARGET` (for example `http://127.0.0.1`) and `PHP_API_PROXY_BASE_PATH` (for example `tacloban-praise`) before starting Vite. Set `PHP_API_PROXY_BASE_PATH` to an empty string when Apache serves the API directly at `/api`. Login, logout, document uploads, and other API requests then use the Vite origin and send the PHP session cookie with `credentials: 'same-origin'`.

For a separately hosted frontend that must call PHP directly across origins, configure the Apache/PHP environment variable `CORS_ALLOWED_ORIGINS` as a comma-separated list of exact HTTP(S) origins, such as `http://localhost:3000,http://127.0.0.1:3000`. No origins are allowed by default. A direct cross-origin client must send credentials with its requests; the existing Vite frontend uses the proxy and needs no cookie-setting change. Restart Apache after changing its environment. Restricting CORS does not provide CSRF protection.

## Database config

If your MySQL credentials differ from the XAMPP defaults, edit `api/config/database.php`.

```php
private $host = "localhost";
private $db_name = "tacloban_praise_db";
private $username = "root";
private $password = "";
private $port = "3306";
```

## Notes

- The frontend must be built at least once before Apache can serve it correctly.
- The checked-in `index.html` is the Vite development entry and is not the Apache runtime entry.
- `setup_db.php` loads the checked-in `database.sql`, which now seeds only the bootstrap administrator plus the base award and office configuration.

## Nomination attachment uploads

New uploads and replacements accept PDF, DOCX, JPG, JPEG, and PNG up to 10 MB per file. PHP needs Fileinfo and image inspection (`getimagesize`). DOCX validation uses ZipArchive or the bundled PharData ZIP reader. Set `upload_max_filesize = 10M` and `post_max_size = 12M` (or larger) in the deployment's PHP configuration so the application can enforce its own limit. Restart Apache after changing PHP settings.

Set the PHP/Apache environment variable `PRIVATE_UPLOAD_DIR` to an absolute, writable directory **outside Apache's document root** in production, then restart Apache. For the standard `htdocs/<project>` XAMPP layout, the fallback is `praise_private_uploads` beside `htdocs`. The API refuses uploads if the resolved directory is inside the document root. Back up this private directory with the database.

Keep `uploads/.htaccess` and allow Apache directory overrides: it denies direct HTTP access to legacy nomination documents. The `uploads/certificate_templates/.htaccess` exception keeps intentionally public certificate background images available. Historical `application_documents.file_url` values in the `uploads/<filename>` format remain readable through the authenticated `api/documents.php?action=download&id=<document-id>` endpoint; no destructive migration is required. Existing files can stay in `uploads/` until moved by a separately planned migration. Verify a known `/uploads/<filename>` URL returns 403 after deployment; if overrides are disabled, add an equivalent Apache directory denial before serving the site.
# Award evaluation routing upgrade

For an existing XAMPP database, run `database_migrations/20260925_award_evaluation_routing.sql` once against `tacloban_praise_db`. The migration adds award routes, route members, and nomination assignment snapshots. A fresh command-line setup already includes these tables.

After upgrading, an Administrator must configure **Evaluation Routing** for each award in Awards Management before Secretariat can forward a verified nomination. Existing nominations with only `assigned_evaluators` JSON continue to use that legacy panel; newly routed nominations use `application_evaluator_assignments` as their assignment source. Editing a route affects future nominations only.

Pending evaluator reassignment is not yet available in the interface. If an assigned evaluator becomes inactive after routing, restore their account access while the nomination is evaluated or add an Administrator reassignment action in a future update.
