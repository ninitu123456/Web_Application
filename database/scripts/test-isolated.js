// Uses an existing mysqld binary and a fresh temporary data directory. Never
// connects to the installed MySQL service or reads the application's .env.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const binary = process.env.MYSQLD_PATH || 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe';
const directory = await mkdtemp(join(tmpdir(), 'findit-mysql-'));
const data = join(directory, 'data');
await mkdir(data);
const log = join(directory, 'mysql.log');
function start(args) {
  const process = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  process.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    process.once('error', reject);
    process.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`mysqld exited ${code}: ${stderr}`)));
  });
  // Attach a handler immediately, including while waiting for server readiness.
  done.catch(() => {});
  return { process, done };
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
let server, admin;
try {
  console.log('Initializing a temporary MySQL instance (installed service remains untouched)...');
  await start(['--no-defaults', '--initialize-insecure', `--basedir=${dirname(dirname(binary))}`, `--datadir=${data}`, `--log-error=${log}`]).done;
  const port = await freePort();
  server = start(['--no-defaults', `--basedir=${dirname(dirname(binary))}`, `--datadir=${data}`,
    '--bind-address=127.0.0.1', `--port=${port}`, '--mysqlx=0', '--skip-log-bin', '--local-infile=0', '--secure-file-priv=NULL', `--log-error=${log}`]);
  const deadline = Date.now() + 45000;
  while (!admin && Date.now() < deadline) {
    if (server.process.exitCode !== null) { await server.done; throw new Error('Temporary server stopped'); }
    try { admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', connectTimeout: 1000 }); }
    catch { await delay(250); }
  }
  if (!admin) throw new Error('Temporary MySQL startup timed out');
  // Verify the actual server before any setup/test writes. Ignore installed
  // service settings and all database/cloud credentials in the local .env.
  const [[instance]] = await admin.query('SELECT @@datadir AS directory, @@port AS port');
  if (resolve(instance.directory) !== resolve(data) || Number(instance.port) !== port) throw new Error('Temporary MySQL identity mismatch');
  const password = randomBytes(24).toString('hex');
  await admin.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [password]);
  console.log('Temporary MySQL is ready; executing integration tests.');
  const env = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USER: 'root', DB_PASSWORD: password, DB_NAME: 'findit_db',
    JWT_SECRET: randomBytes(32).toString('hex'), JWT_EXPIRES_IN: '3600',
    CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', CLOUDINARY_URL: '',
    SEED_ADMIN_EMAIL: 'admin@isolated.example.test', SEED_USER_EMAIL: 'user@isolated.example.test',
    SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'), SEED_USER_PASSWORD: randomBytes(24).toString('hex'),
    FINDIT_ISOLATED_DATADIR: data
  };
  async function execute(args) {
    const child = spawn(process.execPath, args, { windowsHide: true, stdio: 'inherit', env });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    if (code !== 0) throw new Error('Isolated MySQL integration tests failed');
  }
  if (process.argv.includes('--all')) {
    await execute([fileURLToPath(new URL('./cli.js', import.meta.url)), 'setup']);
    // One runner reports all suites and cannot silently skip a failed command.
    await execute(['--test',
      fileURLToPath(new URL('../../server/tests/mysql.integration.js', import.meta.url)),
      fileURLToPath(new URL('../../server/tests/items.integration.js', import.meta.url)),
      fileURLToPath(new URL('../../server/tests/auth/auth.integration.js', import.meta.url)),
      fileURLToPath(new URL('../tests/mysql.integration.js', import.meta.url))]);
  } else await execute(['--test', fileURLToPath(new URL('../tests/mysql.integration.js', import.meta.url))]);
} catch (error) {
  console.error(error.message);
  try { console.error(await readFile(log, 'utf8')); } catch { /* No log if executable was unavailable. */ }
  process.exitCode = 1;
} finally {
  if (admin) {
    try { await admin.query('SHUTDOWN'); } catch { /* SHUTDOWN may close the socket immediately. */ }
    await admin.end().catch(() => {});
  }
  if (server) {
    const exited = await Promise.race([server.done.then(() => true, () => true), delay(10000, undefined, { ref: false }).then(() => false)]);
    if (!exited) { server.process.kill(); await server.done.catch(() => {}); }
  }
  // Resolve and check the exact freshly allocated directory before recursive cleanup.
  const parent = resolve(tmpdir());
  const target = resolve(directory);
  const childPath = relative(parent, target);
  if (!childPath || childPath.startsWith('..') || isAbsolute(childPath) || childPath.includes(sep) || !childPath.startsWith('findit-mysql-')) {
    throw new Error('Refusing cleanup outside the owned temporary MySQL directory');
  }
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('Temporary MySQL stopped and its data directory removed.');
}
