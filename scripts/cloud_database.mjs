import { loadEnv } from 'vite';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Read only ignored environment files; never put connection secrets in arguments or output.
const env = { ...process.env, ...loadEnv('cloud', process.cwd(), '') };
if (!(env.TIDB_HOST || env.DB_HOST)) throw new Error('Pull the cloud connection settings into .env.cloud first. See README_VERCEL.md.');
env.APP_ENV = 'production';
if (!env.DB_SSL_CA) {
  env.DB_SSL_CA = [
    'C:/xampp/apache/bin/curl-ca-bundle.crt',
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/ssl/cert.pem',
  ].find(path => existsSync(path));
}
if (!env.DB_SSL_CA) throw new Error('Set DB_SSL_CA to your local trusted certificate bundle before connecting.');
const result = spawnSync('php', ['scripts/cloud_database.php', process.argv[2] || 'add-cloud-storage'], {
  env, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
