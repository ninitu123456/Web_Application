import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory, parseTotals, validateEvidence, outputRoot, merge, sha, root } from '../../scripts/coverage-support.js';
import * as coverage from '../../scripts/coverage-support.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reportPaths = ['server/coverage-summary.json', 'server/lcov.info', 'database/coverage-summary.json', 'database/lcov.info'];

test('coverage CI pins the same exact Node runtime for producers and merge', async () => {
  const workflow = (await readFile(resolve(root, '.github/workflows/tests.yml'), 'utf8')).replace(/\r\n/g, '\n');
  assert.match(workflow, /^  COVERAGE_NODE_VERSION: '\d+\.\d+\.\d+'$/m);
  for (const job of ['unit', 'integration', 'coverage-integrity']) {
    const section = workflow.split(`\n  ${job}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0];
    assert.ok(section, `Missing ${job} job`);
    assert.match(section, /uses: actions\/setup-node@v4/);
    assert.match(section, /node-version: '\$\{\{ env\.COVERAGE_NODE_VERSION \}\}'/);
    assert.equal([...section.matchAll(/node-version:/g)].length, 1);
  }
});
async function checksums(directory) {
  return Promise.all(reportPaths.map(async (path) => ({ path, sha256: digest(await readFile(join(directory, path))) })));
}

test('F10: source manifest includes unloaded repositories, bootstrap and operational scripts', async () => {
  const { source, sourceHash, manifest } = await inventory();
  for (const path of ['server/server.js', 'server/repositories/claim.repository.js', 'server/repositories/health.repository.js', 'server/config/db.js', 'server/middleware/security.js', 'server/scripts/cleanup-images.js', 'database/scripts/config.js']) assert.ok(source.includes(path));
  assert.ok(!source.some((path) => path.includes('/tests/') || path === 'server/scripts/test-coverage.js'));
  assert.equal(sourceHash.length, 64); assert.ok(manifest.every((entry) => entry.sha256.length === 64));
  assert.throws(() => outputRoot('../outside'), /inside/);
});

test('P2: real merge enforces the complete report contract, including forged report checksums', { timeout: 120000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'findit-report-contract-'));
  const fixture = join(directory, 'fixture');
  try {
    const current = await inventory();
    const provider = JSON.parse(await readFile(resolve(root, 'node_modules/c8/package.json'), 'utf8')).version;
    // Minimal V8 data fixtures: reports are produced by the actual c8 reporter,
    // and every scenario invokes the production merge gate without mocks.
    const script = async (path) => ({ scriptId: '1', url: pathToFileURL(resolve(root, path)).href,
      functions: [{ functionName: '', isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: (await readFile(resolve(root, path), 'utf8')).length, count: 1 }] }] });
    for (const mode of ['unit', 'integration']) {
      const output = join(fixture, mode), raw = join(output, 'raw'); await mkdir(raw, { recursive: true });
      const tests = current.tests.filter((path) => path.endsWith(mode === 'unit' ? '.test.js' : '.integration.js'));
      const result = await Promise.all([...tests, mode === 'unit' ? 'server/utils/http-error.js' : 'server/utils/user-dto.js'].map(script));
      await writeFile(join(raw, 'coverage-tests.json'), JSON.stringify({ result }));
      if (mode === 'integration') await writeFile(join(raw, 'coverage-bootstrap.json'), JSON.stringify({ result: [await script('server/server.js')] }));
      await coverage.report(raw, output, current.source);
      const totals = { tests: tests.length, pass: tests.length, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
      await writeFile(join(output, 'tests.tap'), Object.entries(totals).map(([key, value]) => `# ${key} ${value}`).join('\n') + '\n');
      const entries = await coverage.rawInventory(raw);
      await writeFile(join(output, 'manifest.json'), JSON.stringify({ schema: coverage.artifactContract?.version ?? 1,
        contract: coverage.artifactContract, mode, sha: sha(), sourceHash: current.sourceHash, manifest: current.manifest,
        source: current.source, tests, root, node: process.version, provider, totals,
        raw: entries.map(({ name, sha256 }) => ({ name, sha256 })), reports: await checksums(output) }));
    }
    const mutateManifest = async (base, mode, mutate) => {
      const path = join(base, mode, 'manifest.json'), data = JSON.parse(await readFile(path, 'utf8'));
      mutate(data); await writeFile(path, JSON.stringify(data));
    };
    const absent = async (base, mode, paths) => { for (const path of paths) await rm(join(base, mode, path)); };
    const scenarios = [
      ['missing all unit reports', (base) => absent(base, 'unit', reportPaths)],
      ['missing all integration reports', (base) => absent(base, 'integration', reportPaths)],
      ['missing LCOV', (base) => absent(base, 'unit', ['server/lcov.info'])],
      ['missing JSON summary', (base) => absent(base, 'integration', ['database/coverage-summary.json'])],
      ['empty LCOV', (base) => writeFile(join(base, 'unit/database/lcov.info'), '')],
      ['empty JSON summary', (base) => writeFile(join(base, 'unit/server/coverage-summary.json'), '')],
      ['corrupt JSON', (base) => writeFile(join(base, 'unit/server/coverage-summary.json'), '{broken')],
      ['truncated LCOV', async (base) => { const path = join(base, 'integration/server/lcov.info'); const bytes = await readFile(path); await writeFile(path, bytes.subarray(0, Math.floor(bytes.length / 2))); }],
      ['tampered report unchanged raw', async (base) => { const path = join(base, 'unit/server/coverage-summary.json'); const data = JSON.parse(await readFile(path, 'utf8')); data.total.lines.covered++; await writeFile(path, JSON.stringify(data)); }],
      ['report checksum mismatch', (base) => mutateManifest(base, 'unit', (data) => { data.reports[0].sha256 = '0'.repeat(64); })],
      ['different source fingerprint', (base) => mutateManifest(base, 'unit', (data) => { data.sourceHash = '0'.repeat(64); })],
      ['different commit', (base) => mutateManifest(base, 'integration', (data) => { data.sha = '0'.repeat(40); })],
      ['different Node runtime', (base) => mutateManifest(base, 'integration', (data) => { data.node = 'v0.0.0'; })],
      ['different coverage configuration', (base) => mutateManifest(base, 'integration', (data) => { data.contract = { ...data.contract, all: false }; })],
      ['missing report checksum declaration', (base) => mutateManifest(base, 'unit', (data) => { data.reports.pop(); })],
      ['forged JSON plus matching manifest checksum', async (base) => {
        const path = join(base, 'unit/server/coverage-summary.json'), data = JSON.parse(await readFile(path, 'utf8'));
        for (const value of Object.values(data)) for (const key of ['lines', 'statements', 'branches', 'functions']) {
          value[key].covered = value[key].total; value[key].pct = 100;
        }
        await writeFile(path, JSON.stringify(data));
        await mutateManifest(base, 'unit', (metadata) => { metadata.reports.find((r) => r.path === 'server/coverage-summary.json').sha256 = digest(JSON.stringify(data)); });
      }],
      ['forged LCOV plus matching manifest checksum', async (base) => {
        const path = join(base, 'unit/server/lcov.info'); const text = (await readFile(path, 'utf8')).replace(/^DA:(\d+),\d+/m, 'DA:$1,999');
        await writeFile(path, text);
        await mutateManifest(base, 'unit', (metadata) => { metadata.reports.find((r) => r.path === 'server/lcov.info').sha256 = digest(text); });
      }]
    ];
    for (const [index, [name, mutate]] of scenarios.entries()) await t.test(name, async () => {
      const candidate = join(directory, `negative-${index}`); await cp(fixture, candidate, { recursive: true });
      await mutate(candidate);
      await assert.rejects(merge(candidate), /report|artifact|contract|SHA|manifest|coverage|LCOV|JSON/i);
      await assert.rejects(access(join(candidate, 'combined/manifest.json')));
    });
    await t.test('positive control: complete valid reports merge through real c8', async () => {
      const candidate = join(directory, 'positive'); await cp(fixture, candidate, { recursive: true });
      await merge(candidate);
      for (const path of reportPaths) assert.ok((await readFile(join(candidate, 'combined', path))).length > 0);
      const combined = JSON.parse(await readFile(join(candidate, 'combined/server/coverage-summary.json'), 'utf8'));
      assert.equal(Object.keys(combined).length - 1, current.source.filter((path) => path.startsWith('server/')).length);
      const unit = JSON.parse(await readFile(join(fixture, 'unit/server/coverage-summary.json'), 'utf8'));
      const integration = JSON.parse(await readFile(join(fixture, 'integration/server/coverage-summary.json'), 'utf8'));
      assert.ok(combined.total.lines.covered > Math.max(unit.total.lines.covered, integration.total.lines.covered));
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('F10: merge refuses mismatched SHA and tampered raw artifacts before reporting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'findit-coverage-gate-'));
  try {
    const current = await inventory(), unit = join(directory, 'unit');
    await mkdir(join(unit, 'raw'), { recursive: true });
    const data = { schema: coverage.artifactContract.version, contract: coverage.artifactContract, mode: 'unit', sha: 'wrong-sha', sourceHash: current.sourceHash, root, node: process.version, manifest: current.manifest, source: current.source };
    await writeFile(join(unit, 'manifest.json'), JSON.stringify(data));
    await assert.rejects(merge(directory), /SHA/);
    data.sha = sha(); data.raw = [{ name: 'coverage-test.json', sha256: 'incorrect' }];
    await writeFile(join(unit, 'manifest.json'), JSON.stringify(data));
    await writeFile(join(unit, 'raw/coverage-test.json'), JSON.stringify({ result: [{ url: 'node:internal/test', functions: [] }] }));
    await assert.rejects(merge(directory), /integrity/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('F10: integrity rejects missing/failed/skipped totals and missing test/bootstrap process coverage', () => {
  const passing = '# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.equal(parseTotals(passing).tests, 3);
  for (const bad of ['', passing.replace('# fail 0', '# fail 1'), passing.replace('# skipped 0', '# skipped 1'), passing.replace('# pass 3', '# pass 2')]) assert.throws(() => parseTotals(bad));
  const entries = [{ scripts: [{ path: 'server/tests/mysql.integration.js', executed: true }, { path: 'server/server.js', executed: true }] }];
  assert.throws(() => validateEvidence(entries, ['server/tests/missing.integration.js'], false), /missing/);
  assert.throws(() => validateEvidence(entries, ['server/tests/mysql.integration.js'], true), /bootstrap/);
  entries.push({ scripts: [{ path: 'server/server.js', executed: true }] });
  validateEvidence(entries, ['server/tests/mysql.integration.js'], true);
});
