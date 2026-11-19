# Deploy the whole app on Vercel

The React frontend and PHP API run together in a Vercel container. A MySQL-compatible cloud database connected to Vercel stores application records, login sessions, attachments, and certificate images. Local XAMPP does not need to stay online.

`Dockerfile.vercel` builds React and installs PHP 8.4 with PDO MySQL and ZIP support. Only built assets and the router are in the public directory; backend source and configuration stay outside it. The router exposes an explicit API allowlist and denies direct attachment URLs. Downloads retain the existing account and nomination permissions.

## Connect a database

1. Create or select the `tacloban-praise` project in Vercel.
2. Add the [TiDB Cloud integration](https://vercel.com/marketplace/tidb-cloud). Choose **Cluster**, a MySQL-compatible **Starter** instance, and the **General** connection option. Select `tacloban-praise` as the Vercel project.
3. Finish the integration. Vercel should have these server-only variables: `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, and `TIDB_DATABASE`.

The backend accepts these directly. Existing `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, and `DB_NAME` variables take precedence. For production, use the restricted runtime account described below instead of an integration administrator. Keep secrets out of `VITE_*` variables and source control.

If the integration points to `sys`, use `node scripts/cloud_database.mjs create-app-database` to create a dedicated `tacloban_praise_db` database. Set `DB_NAME=tacloban_praise_db` in the Vercel Production environment as a **Config** value, then pull the environment again before importing. Keep TiDB system schemas separate from application data. Set up separate application databases before enabling Preview or Development deployments.

The container sets `APP_ENV=production`, `FILE_STORAGE=database`, `SESSION_STORAGE=database`, and `DB_SSL_CA=/etc/ssl/certs/ca-certificates.crt`. It verifies the database server's TLS certificate. PHP reads its process environment; it does not automatically load a `.env` file.

The current deployment uses Tokyo (`hnd1`) to match the connected TiDB cluster's `ap-northeast-1` region. If the database moves, update `regions` in `vercel.json` to keep the backend close to it.

## Production database permissions

Production uses a dedicated SQL account with only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `tacloban_praise_db`.*. It does not need schema changes, user administration, global privileges, or `GRANT OPTION`. This applies to records, database sessions, and database file storage.

Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASS` for **Production** in Vercel. Store `DB_PASS` as a Secret/sensitive variable. Keep administrator `TIDB_USER` and `TIDB_PASSWORD` out of that environment, even when `DB_*` takes precedence: a compromised application must not have administrator credentials available in its process. Environment changes require a new deployment; old deployments retain their previous environment.

Use a separate privileged account for CLI migrations/imports. To provision a runtime account from that maintenance connection, the SQL is:

```sql
CREATE USER '<instance-prefix>.praise_runtime'@'%'
  IDENTIFIED BY '<securely-generated-password>' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON `tacloban_praise_db`.* TO '<instance-prefix>.praise_runtime'@'%';
```

Use the instance's username prefix for TiDB Starter; dedicated MySQL-compatible servers can use an unprefixed name. Verify the account with `SHOW GRANTS`, connect with TLS and certificate verification, and test normal database reads and transactionally rolled-back writes before switching production. Never test denied DDL by attempting to drop an application table. Retain a protected maintenance connection and the previous deployment during verification; rolling back to an old deployment also restores its old credentials.

Preview and Development must receive their own database/account before being used with real data. The initial integration may share administrator credentials across those environments; changing the production account does not fix those remaining scopes.

## Prepare the database

Setup is a CLI maintenance operation, never a public HTTP endpoint or an automatic step on every deployment. Load the cloud connection settings into the PHP process first.

Keep maintenance connection settings in an ignored `.env.maintenance` file, using the server-side `DB_*` fields from `.env.example` and a privileged maintenance account. Supply that file explicitly, for example `node scripts/cloud_database.mjs inspect --env-file=.env.maintenance`. The helper loads it into PHP without displaying passwords and selects the local certificate bundle. Apply the same `--env-file=.env.maintenance` option to the other Node maintenance commands below.

The helper still supports `.env.cloud` by default for existing installations. Do not overwrite your only maintenance configuration with `vercel env pull`: Production now uses restricted credentials and a sensitive password may not be downloadable. Downloaded runtime settings are not a migration account. Keep all maintenance files out of source control and deployment inputs.

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

## Login rate limiting

Before deploying the rate-limited login API to an existing installation, create its counter table with the maintenance account:

```text
node scripts/cloud_database.mjs add-login-throttle --env-file=.env.maintenance
```

This applies `database_migrations/20260929_login_throttle.sql`, which only creates `login_throttle` if missing. It does not change existing accounts, nominations, files, or evaluations. New installations already include the table. The restricted production account's database-scoped DML permissions cover it; do not grant it schema or user-administration privileges.

Eight failed attempts against one account within 15 minutes trigger a five-minute cooldown. A separate source-address budget allows 50 failures across accounts in 15 minutes before the same cooldown. Unknown and disabled accounts receive generic errors. Blocked attempts return HTTP 429 with `Retry-After`; correct credentials cannot bypass an active cooldown. A successful login resets that account's failure budget while preserving unrelated source failures. Checks and counter updates are serialized in database transactions across container instances.

Source addresses come from Vercel's overwritten forwarding headers in the Vercel container; see [Vercel request headers](https://vercel.com/docs/headers/request-headers). Other deployments use the direct address or an explicitly trusted proxy chain; untrusted forwarding headers are ignored. Counter times use UTC, raw emails and IP addresses are not stored in the throttle table, and expired metadata is removed in bounded batches. If throttle storage is unavailable, login returns HTTP 503 instead of bypassing the limit. Existing authenticated sessions continue to work.

## Deploy

Use a current Vercel CLI with Container support, or import the repository through the dashboard. `Dockerfile.vercel` and `vercel.json` select Container. An external PHP server and `PHP_BACKEND_URL` are no longer needed.

```text
vercel link --project tacloban-praise
vercel deploy
```

After checking the preview and database, publish production with `vercel deploy --prod`. Use separate preview and production databases when testing changes; a preview connected to production data can change production records.

## Shared data and uploads

All visitors use the same database, subject to their roles. Sessions work across container instances and restarts. API responses are not cached.

Nominee API responses include nomination details, documents, correction instructions, and workflow status. Evaluation scores, evaluator assignments, and internal committee fields are filtered on the server, including confidential details embedded in history entries. This changes response visibility only; stored evaluations and history are retained.

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
