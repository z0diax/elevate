# Deploy the whole app on Vercel

The React frontend and PHP API run together in a Vercel container. A MySQL-compatible cloud database connected to Vercel stores application records, login sessions, attachments, and certificate images. Local XAMPP does not need to stay online.

`Dockerfile.vercel` builds React and installs PHP 8.4 with PDO MySQL and ZIP support. Only built assets and the router are in the public directory; backend source and configuration stay outside it. The router exposes an explicit API allowlist and denies direct attachment URLs. Downloads retain the existing account and nomination permissions.

## Connect a database

1. Create or select the `tacloban-praise` project in Vercel.
2. Add the [TiDB Cloud integration](https://vercel.com/marketplace/tidb-cloud). Choose **Cluster**, a MySQL-compatible **Starter** instance, and the **General** connection option. Select `tacloban-praise` as the Vercel project.
3. Finish the integration. Vercel should have these server-only variables: `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, and `TIDB_DATABASE`.

The backend accepts these directly. Existing `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME` variables take precedence. Keep secrets out of `VITE_*` variables and source control.

If the integration points to `sys`, use `node scripts/cloud_database.mjs create-app-database` to create a dedicated `tacloban_praise_db` database. Set `DB_NAME=tacloban_praise_db` in the Vercel Production environment as a **Config** value, then pull the environment again before importing. Keep TiDB system schemas separate from application data. Set up separate application databases before enabling Preview or Development deployments.

The container sets `APP_ENV=production`, `FILE_STORAGE=database`, `SESSION_STORAGE=database`, and `DB_SSL_CA=/etc/ssl/certs/ca-certificates.crt`. It verifies the database server's TLS certificate. PHP reads its process environment; it does not automatically load a `.env` file.

The current deployment uses Tokyo (`hnd1`) to match the connected TiDB cluster's `ap-northeast-1` region. If the database moves, update `regions` in `vercel.json` to keep the backend close to it.

## Prepare the database

Setup is a CLI maintenance operation, never a public HTTP endpoint or an automatic step on every deployment. Load the cloud connection settings into the PHP process first.

With the linked Vercel CLI, download settings to the ignored `.env.cloud` file using `vercel env pull .env.cloud --environment=production`. The Node helper loads that file into PHP without displaying passwords and selects the local certificate bundle.

To preserve the current XAMPP accounts and records in a **new empty cloud database**, run `node scripts/cloud_database.mjs import-local`. This reads the local `tacloban_praise_db`, copies its schema and records, and imports referenced attachment files. It refuses to overwrite cloud tables and does not change local data. `SOURCE_DB_HOST`, `SOURCE_DB_PORT`, `SOURCE_DB_NAME`, `SOURCE_DB_USER`, `SOURCE_DB_PASS`, and `SOURCE_PRIVATE_UPLOAD_DIR` can override the local XAMPP defaults. A missing referenced file stops the import before copying records.

For a **new empty database**:

```text
php scripts/cloud_database.php initialize-empty
```

This refuses a database containing tables. It installs the canonical schema, bootstrap account, and durable storage tables without changing the provider's database name. Change the bootstrap password before opening access.

The environment-file helper equivalent is `node scripts/cloud_database.mjs initialize-empty`.

For an **existing database**, migrate the records first, apply pending upgrades described in [README_XAMPP.md](README_XAMPP.md), then run:

```text
php scripts/cloud_database.php add-cloud-storage
```

This adds only the cloud storage tables. It does not automatically import local records or files. Retaining an existing installation also requires importing private attachments and certificate backgrounds into durable storage. Do not run the destructive XAMPP fresh-install script against existing data.

The migration `database_migrations/20261117_cloud_storage.sql` creates `praise_sessions`, `praise_files`, and `praise_file_chunks`. Binary chunks stay below common database packet limits. Files are reassembled only in request-local temporary storage for content validation, signatures, and downloads. The database holds the durable copy; include these tables in backups.

## Deploy

Use a current Vercel CLI with Container support, or import the repository through the dashboard. `Dockerfile.vercel` and `vercel.json` select Container. An external PHP server and `PHP_BACKEND_URL` are no longer needed.

```text
vercel link --project tacloban-praise
vercel deploy
```

After checking the preview and database, publish production with `vercel deploy --prod`. Use separate preview and production databases when testing changes; a preview connected to production data can change production records.

## Shared data and uploads

All visitors use the same database, subject to their roles. Sessions work across container instances and restarts. API responses are not cached.

The Vercel frontend build enables `VITE_CLOUD_UPLOADS=1`. Attachments are sent in 512 KB requests and assembled on the server, preserving the 10 MB attachment and 8 MB certificate-image limits. Every part requires authentication and CSRF. Pending uploads expire after ten minutes, are limited per account, and are consumed atomically. Actual PDF, DOCX, and image contents are still validated. Downloads stream incrementally.

Unsaved nomination drafts, pending files saved by the browser, and display preferences stay on that device. Submitted records and uploaded documents are shared. Screens may need refreshing to show another user's changes; this does not add live subscriptions.

## Verify

- `/api/health.php` returns JSON with `database_connected: true`.
- Login survives refreshes and container restarts; logout invalidates the session.
- A 6–10 MB attachment uploads and downloads correctly.
- Authorized users on other devices can view submitted nominations and files.
- Private drafts and attachments remain restricted to permitted accounts.
- Certificate backgrounds render, and backend source/setup URLs return 404.

Local checks: `npm run lint`, `npm run test:unit`, `npm run test:deployment`, and `npm run build`.

For cloud integration checks, create a separate empty test database. Set `APP_ENV=development`, `TEST_DB_NAME` and `DB_NAME` to its `*_test` name, and `TEST_CLOUD_STORAGE=1`, then run `node tests/integration.mjs`. It refuses the application database and checks sessions/files across a server restart, chunk uploads, and the full nomination workflow.

XAMPP remains available for local development with filesystem storage; see [README_XAMPP.md](README_XAMPP.md).

References: [Vercel PHP containers](https://vercel.com/kb/guide/deploy-php-on-vercel-with-docker), [TiDB integration](https://docs.pingcap.com/tidbcloud/integrate-tidbcloud-with-vercel/), [Vercel limits](https://vercel.com/docs/functions/limitations).
