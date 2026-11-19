import { loadEnv } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

// Read only ignored environment files; never put connection secrets in arguments or output.
const args = process.argv.slice(2);
const envFileOption = args.find(arg => arg.startsWith('--env-file='));
const fileSettings = envFileOption
  ? parseEnv(readFileSync(envFileOption.slice('--env-file='.length), 'utf8'))
  : loadEnv('cloud', process.cwd(), '');
const env = { ...process.env, ...fileSettings };
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
const result = spawnSync('php', ['scripts/cloud_database.php', args.find(arg => !arg.startsWith('--env-file=')) || 'add-cloud-storage'], {
  env, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
