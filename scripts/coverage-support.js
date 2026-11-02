import { readdir, readFile, mkdir, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { resolve, relative, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const slash = (value) => value.split(sep).join('/');
// v2 requires both machine reports per scope. c8's lcov-report/ HTML is optional.
// The contract is pinned in manifests; its include/exclude scope is unchanged.
export const artifactContract = Object.freeze({
  version: 2, all: true,
  scopes: Object.freeze([
    Object.freeze({ name: 'server', include: 'server/**/*.js' }),
    Object.freeze({ name: 'database', include: 'database/**/*.js' })
  ]),
  exclude: Object.freeze(['server/tests/**', 'database/tests/**', 'server/scripts/test-coverage.js']),
  reporters: Object.freeze(['json-summary', 'lcov']),
  reports: Object.freeze(['coverage-summary.json', 'lcov.info'])
});
export const sha = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
export async function files(directory) {
  const result = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.name.endsWith('.js')) result.push(path);
  }
  return result.sort();
}
export async function inventory() {
  const javascript = [...await files('server'), ...await files('database')];
  const source = javascript.filter((path) => !path.includes('/tests/') && path !== 'server/scripts/test-coverage.js');
  const tests = javascript.filter((path) => path.includes('/tests/') && /\.(test|integration)\.js$/.test(path));
  const inputs = [...javascript, 'scripts/coverage-support.js', 'package.json', 'package-lock.json', '.github/workflows/tests.yml'];
  const manifest = [];
  for (const path of inputs.sort()) manifest.push({ path, sha256: hash(await readFile(resolve(root, path))) });
  return { source, tests, manifest, sourceHash: hash(JSON.stringify(manifest)) };
}
export function parseTotals(output) {
  const totals = {};
  for (const match of output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)) totals[match[1]] = Number(match[2]);
  if (!(totals.tests > 0) || totals.pass !== totals.tests || ['fail', 'cancelled', 'skipped', 'todo'].some((key) => totals[key] !== 0)) throw new Error('Coverage requires complete passing TAP totals with no skips');
  return totals;
}
export async function execute(args, env = process.env, echo = true) {
  const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk; if (echo) process.stdout.write(chunk); });
  const code = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
  if (code !== 0) throw new Error(`Coverage child exited ${code}\n${output.slice(-4000)}`);
  return output;
}
export function outputRoot(value = 'coverage/audit3') {
  const path = resolve(root, value), parent = resolve(root, 'coverage');
  if (!path.startsWith(parent + sep)) throw new Error('Coverage output must be inside repository coverage/');
  return path;
}
export async function freshDirectory(path) {
  // Never delete or overwrite prior local reports/artifacts.
  await mkdir(path, { recursive: false });
}
export async function rawInventory(directory) {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    if (!/^coverage-.*\.json$/.test(name)) throw new Error(`Unexpected coverage artifact: ${name}`);
    const bytes = await readFile(join(directory, name));
    const data = JSON.parse(bytes);
    if (!Array.isArray(data.result) || !data.result.length) throw new Error('Empty/corrupt V8 coverage');
    entries.push({ name, sha256: hash(bytes), scripts: data.result.filter((script) => script.url.startsWith('file:')).map((script) => ({ path: slash(relative(root, fileURLToPath(script.url))), executed: script.functions.some((fn) => fn.ranges.some((range) => range.count > 0)) })) });
  }
  if (!entries.length) throw new Error('Missing raw coverage');
  return entries;
}
export function validateEvidence(entries, expectedTests, integration) {
  const loaded = new Set(entries.flatMap((entry) => entry.scripts.filter((script) => script.executed).map((script) => script.path)));
  for (const file of expectedTests) if (!loaded.has(file)) throw new Error(`Test subprocess coverage missing: ${file}`);
  if (integration && !entries.some((entry) => entry.scripts.some((script) => script.path === 'server/server.js' && script.executed) && !entry.scripts.some((script) => script.path.includes('/tests/')))) throw new Error('Standalone bootstrap subprocess coverage missing');
}
function validateSummary(summary, source, scope) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) || !summary.total) throw new Error('Invalid coverage JSON summary report');
  const actual = Object.keys(summary).filter((key) => key !== 'total').map((key) => slash(relative(root, key))).sort();
  const expected = source.filter((path) => path.startsWith(scope + '/')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Incomplete ${scope} source manifest in report`);
  for (const entry of Object.values(summary)) for (const metric of ['lines', 'statements', 'branches', 'functions']) {
    const value = entry?.[metric];
    if (!value || !['total', 'covered', 'skipped'].every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0) ||
        value.covered > value.total || typeof value.pct !== 'number' || !Number.isFinite(value.pct) || value.pct < 0 || value.pct > 100) throw new Error('Invalid coverage summary report metrics');
  }
}
async function reportSet(directory, source) {
  const result = [];
  for (const { name } of artifactContract.scopes) for (const file of artifactContract.reports) {
    const path = `${name}/${file}`, bytes = await readFile(join(directory, path)), text = bytes.toString('utf8');
    if (!text.trim()) throw new Error(`Empty coverage report: ${path}`);
    if (file === 'coverage-summary.json') validateSummary(JSON.parse(text), source, name);
    else {
      const actual = [...text.matchAll(/^SF:(.+)$/gm)].map((match) => slash(match[1].trim())).sort();
      const expected = source.filter((path) => path.startsWith(name + '/')).sort();
      if (!text.trimEnd().endsWith('end_of_record') || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Invalid or truncated LCOV report: ${path}`);
    }
    result.push({ path, sha256: hash(bytes), bytes });
  }
  return result;
}
const reportDigests = (entries) => entries.map(({ path, sha256 }) => ({ path, sha256 }));
export async function report(raw, output, source) {
  for (const { name: scope, include } of artifactContract.scopes) {
    const directory = join(output, scope);
    await execute(['node_modules/c8/bin/c8.js', 'report', '--all', '--src=' + scope, '--include=' + include,
      ...artifactContract.exclude.map((path) => '--exclude=' + path),
      '--temp-directory=' + raw, '--reports-dir=' + directory,
      ...artifactContract.reporters.map((name) => '--reporter=' + name), '--reporter=text'], process.env);
    validateSummary(JSON.parse(await readFile(join(directory, 'coverage-summary.json'), 'utf8')), source, scope);
  }
}
export async function collect(mode, base) {
  if (!['unit', 'integration'].includes(mode)) throw new Error('Invalid coverage mode');
  const before = await inventory(), directory = join(base, mode);
  await mkdir(base, { recursive: true }); await freshDirectory(directory);
  const raw = join(directory, 'raw'); await mkdir(raw);
  const expectedTests = before.tests.filter((path) => mode === 'unit' ? path.endsWith('.test.js') : path.endsWith('.integration.js'));
  const args = mode === 'unit' ? ['--test', '--test-reporter=tap', ...expectedTests] : ['database/scripts/test-isolated.js', '--all'];
  const output = await execute(args, { ...process.env, NODE_V8_COVERAGE: raw, FINDIT_COVERAGE_TAP: '1' });
  const totals = parseTotals(output), entries = await rawInventory(raw);
  validateEvidence(entries, expectedTests, mode === 'integration');
  const after = await inventory();
  if (before.sourceHash !== after.sourceHash) throw new Error('Sources changed during coverage');
  const provider = JSON.parse(await readFile(resolve(root, 'node_modules/c8/package.json'), 'utf8')).version;
  await report(raw, directory, before.source);
  const reports = reportDigests(await reportSet(directory, before.source));
  await writeFile(join(directory, 'tests.tap'), output);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schema: artifactContract.version, contract: artifactContract, mode, sha: sha(), sourceHash: before.sourceHash, manifest: before.manifest, source: before.source, tests: expectedTests, root, node: process.version, provider, totals, raw: entries.map(({ name, sha256 }) => ({ name, sha256 })), reports }, null, 2));
}
export async function merge(base) {
  const current = await inventory(), metadata = [];
  for (const mode of ['unit', 'integration']) {
    const directory = join(base, mode), data = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (data.schema !== artifactContract.version || data.mode !== mode || data.sha !== sha() || data.sourceHash !== current.sourceHash || data.root !== root || data.node !== process.version || JSON.stringify(data.manifest) !== JSON.stringify(current.manifest) || JSON.stringify(data.source) !== JSON.stringify(current.source)) throw new Error('Coverage source SHA, manifest, toolchain or checkout mismatch');
    if (JSON.stringify(data.contract) !== JSON.stringify(artifactContract)) throw new Error('Coverage artifact contract/configuration mismatch');
    const entries = await rawInventory(join(directory, 'raw'));
    if (JSON.stringify(data.raw) !== JSON.stringify(entries.map(({ name, sha256 }) => ({ name, sha256 })))) throw new Error('Raw coverage artifact integrity mismatch');
    const expected = current.tests.filter((path) => mode === 'unit' ? path.endsWith('.test.js') : path.endsWith('.integration.js'));
    if (JSON.stringify(data.tests) !== JSON.stringify(expected) || JSON.stringify(parseTotals(await readFile(join(directory, 'tests.tap'), 'utf8'))) !== JSON.stringify(data.totals)) throw new Error('Coverage test inventory/totals mismatch');
    validateEvidence(entries, expected, mode === 'integration');
    const reports = await reportSet(directory, current.source);
    if (JSON.stringify(data.reports) !== JSON.stringify(reportDigests(reports))) throw new Error('Coverage report manifest/checksum mismatch');
    metadata.push(data);
  }
  const provider = JSON.parse(await readFile(resolve(root, 'node_modules/c8/package.json'), 'utf8')).version;
  if (metadata.some((data) => data.provider !== provider)) throw new Error('Coverage provider mismatch');
  // Checksums detect damage, but a manifest can be edited alongside a report.
  // Re-render with the pinned c8/config/source and compare the actual content.
  // No combined success artifact is created until both input sets pass.
  const scratch = await mkdtemp(join(tmpdir(), 'findit-coverage-verify-'));
  try {
    for (const data of metadata) {
      const directory = join(base, data.mode), regenerated = join(scratch, data.mode);
      await report(join(directory, 'raw'), regenerated, current.source);
      const expected = await reportSet(regenerated, current.source), actual = await reportSet(directory, current.source);
      if (JSON.stringify(data.reports) !== JSON.stringify(reportDigests(actual)) ||
          actual.some((entry, index) => entry.path !== expected[index].path || !entry.bytes.equals(expected[index].bytes))) throw new Error(`Coverage ${data.mode} reports do not match raw V8 execution`);
      const raw = await rawInventory(join(directory, 'raw'));
      if (JSON.stringify(data.raw) !== JSON.stringify(raw.map(({ name, sha256 }) => ({ name, sha256 })))) throw new Error('Raw coverage changed during report verification');
    }
    if ((await inventory()).sourceHash !== current.sourceHash || metadata.some((data) => data.sha !== sha())) throw new Error('Coverage source SHA changed during report verification');
  } finally { await rm(scratch, { recursive: true, force: true }); }
  const directory = join(base, 'combined'); await freshDirectory(directory);
  const raw = join(directory, 'raw'); await mkdir(raw);
  for (const data of metadata) for (const entry of data.raw) await copyFile(join(base, data.mode, 'raw', entry.name), join(raw, data.mode + '-' + entry.name));
  await report(raw, directory, current.source);
  const reports = reportDigests(await reportSet(directory, current.source));
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schema: artifactContract.version, contract: artifactContract, mode: 'combined', sha: sha(), sourceHash: current.sourceHash, provider, node: process.version, source: current.source, reports, inputs: metadata }, null, 2));
}
