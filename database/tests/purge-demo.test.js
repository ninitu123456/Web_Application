import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDemoSeedAllowed } from '../scripts/seed-guard.js';
import { seedConfig } from '../scripts/config.js';
import { seed } from '../seeds/sample.js';
import { executePurge, checksum } from '../scripts/demo-purge.js';
test('production/provider seed refuses before connection or credentials and has no override', async () => {
  for (const env of [
    { NODE_ENV: 'production' },
    { RAILWAY_ENVIRONMENT_ID: 'fixture' },
    { RAILWAY_PROJECT_ID: 'fixture' },
    { VERCEL: '1' },
  ]) {
    assert.throws(() => assertDemoSeedAllowed(env), /forbidden/);
    assert.throws(() => seedConfig(env), /forbidden/);
  }
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let touched = false;
  try {
    await assert.rejects(
      () =>
        seed(
          {
            execute() {
              touched = true;
            },
          },
          'findit_db',
          {},
        ),
      /forbidden/,
    );
    assert.equal(touched, false);
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});
test('production execute requires fresh restorable backup bound to manifest before touching DB', async () => {
  const body = { version: 1, targetFingerprint: 'target', targets: [] },
    manifest = { ...body, fingerprint: checksum(body) };
  let touched = false;
  const connection = {
    query() {
      touched = true;
    },
  };
  await assert.rejects(
    () =>
      executePurge(connection, manifest, {
        confirm: manifest.fingerprint,
        targetFingerprint: 'target',
        maintenance: true,
      }),
    /backup/,
  );
  assert.equal(touched, false);
  await assert.rejects(
    () => executePurge(connection, manifest, { confirm: manifest.fingerprint, targetFingerprint: 'target' }),
    /Maintenance/,
  );
});

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('execute=false and maintenance-window=false are rejected before database access', () => {
  for (const script of ['purge-demo-data.js', 'purge-demo-assets.js'])
    for (const flag of ['--execute=false', '--maintenance-window=false']) {
      let failed = false;
      try {
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL('../scripts/' + script, import.meta.url)), flag],
          { stdio: 'pipe', env: { ...process.env, DB_USER: '', DB_PASSWORD: '' } },
        );
      } catch (error) {
        failed = true;
        assert.match(error.stderr.toString(), /Boolean.*flags do not accept values/);
      }
      assert.equal(failed, true);
    }
});
