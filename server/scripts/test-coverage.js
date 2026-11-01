import { mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
await mkdir(new URL('../../coverage/', import.meta.url), { recursive: true });
const tests = [];
for (const directory of ['../tests/', '../tests/auth/']) {
  const url = new URL(directory, import.meta.url);
  for (const file of (await readdir(url)).sort()) if (file.endsWith('.test.js')) tests.push(fileURLToPath(new URL(file, url)));
}
const child = spawn(process.execPath, ['--test', '--experimental-test-coverage',
  '--test-coverage-include=server/**/*.js', '--test-coverage-exclude=server/tests/**',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=lcov', '--test-reporter-destination=coverage/unit.lcov', ...tests], { cwd: root, windowsHide: true, stdio: 'inherit' });
child.once('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code) => { process.exitCode = code ?? 1; });
