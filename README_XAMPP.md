# Tacloban PRAISE XAMPP Guide

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
5. Open `http://localhost/tacloban-praise/api/setup_db.php`
6. Open `http://localhost/tacloban-praise/`
7. Sign in with the bootstrap administrator account:

   - Email: `admin@tacloban.gov.ph`
   - Password: `ChangeMe123!`
   - Create the real deployment users from the Admin panel after first login

## How it works

- `index.php` serves the built frontend from `dist/index.html`
- `.htaccess` keeps `/api` and `/uploads` untouched and maps `/assets/*` to `dist/assets/*`
- `src/lib/mysqlService.ts` resolves the correct project-relative API base for XAMPP subdirectory installs

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
