import test from 'node:test';
import assert from 'node:assert/strict';
import { checksum } from '../scripts/demo-purge.js';
import { planDemoAssets, executeDemoAssets } from '../scripts/demo-assets.js';
const resource = (id) => ({
  public_id: id,
  asset_id: 'asset-' + id,
  version: 1,
  resource_type: 'image',
  type: 'upload',
  secure_url: 'https://res.cloudinary.com/fixture/image/upload/v1/' + id + '.png',
  created_at: '2026-01-01T00:00:00Z',
});
function receipt(ids = ['findit/items/fixture']) {
  const r = {
    state: 'COMMITTED',
    manifestFingerprint: 'db-manifest',
    targetFingerprint: 'db-target',
    committedAt: '2026-11-14T00:00:00Z',
    assets: ids.map((id) => ({
      publicId: id,
      cloudName: 'fixture',
      imageIds: ['1'],
      urlChecksum: checksum(resource(id).secure_url),
    })),
  };
  return { ...r, receiptChecksum: checksum(r) };
}
const adapter = {
  cloudName: 'fixture',
  resource: async (id) => resource(id),
  hasReference: async () => false,
};
test('asset dry-run is metadata-only and excludes retained references', async () => {
  let deletes = 0;
  const p = await planDemoAssets(receipt(['one', 'shared']), {
    ...adapter,
    hasReference: async (id) => id === 'shared',
    destroy: () => deletes++,
  });
  assert.equal(p.assets.length, 1);
  assert.equal(p.excluded.length, 1);
  assert.equal(deletes, 0);
});
test('asset cleanup requires committed receipt and refuses wrong cloud/url ownership', async () => {
  await assert.rejects(() => planDemoAssets({ ...receipt(), state: 'PENDING' }, adapter), /receipt/);
  await assert.rejects(() => planDemoAssets(receipt(), { ...adapter, cloudName: 'other' }), /ownership/);
  await assert.rejects(
    () =>
      planDemoAssets(receipt(), {
        ...adapter,
        resource: async (id) => ({ ...resource(id), secure_url: 'https://other.test/image' }),
      }),
    /ownership/,
  );
});
test('exact separate confirmation, replacement and new references prevent deletion', async () => {
  const p = await planDemoAssets(receipt(), adapter);
  let deletes = 0;
  const a = {
    ...adapter,
    maintenance: true,
    confirm: p.fingerprint,
    destroy: async () => {
      deletes++;
      return { result: 'ok' };
    },
  };
  await assert.rejects(() => executeDemoAssets(p, { ...a, confirm: 'wrong' }), /approved/);
  await assert.rejects(
    () =>
      executeDemoAssets(p, { ...a, resource: async (id) => ({ ...resource(id), asset_id: 'replacement' }) }),
    /replaced/,
  );
  await assert.rejects(() => executeDemoAssets(p, { ...a, hasReference: async () => true }), /referenced/);
  assert.equal(deletes, 0);
});
test('per-asset results support bounded operator retry without deleting replacements or repeating successful IDs', async () => {
  const p = await planDemoAssets(receipt(['first', 'second']), adapter);
  const calls = [];
  let fail = true;
  const a = {
    ...adapter,
    maintenance: true,
    confirm: p.fingerprint,
    destroy: async (id) => {
      calls.push(id);
      if (id === 'second' && fail) throw new Error('provider detail must not be logged');
      return { result: 'ok' };
    },
  };
  const one = await executeDemoAssets(p, a);
  assert.deepEqual(
    one.results.map((row) => row.status),
    ['DELETED', 'FAILED'],
  );
  fail = false;
  const two = await executeDemoAssets(p, { ...a, priorResults: one.results });
  assert.deepEqual(
    two.results.map((row) => row.status),
    ['PREVIOUSLY_COMPLETED', 'DELETED'],
  );
  assert.deepEqual(calls, ['first', 'second', 'second']);
});
test('already absent asset is reconciled without destroy', async () => {
  const p = await planDemoAssets(receipt(), adapter);
  let deletes = 0;
  const result = await executeDemoAssets(p, {
    ...adapter,
    maintenance: true,
    confirm: p.fingerprint,
    resource: async () => {
      throw { http_code: 404 };
    },
    destroy: async () => {
      deletes++;
    },
  });
  assert.equal(result.results[0].status, 'ALREADY_ABSENT');
  assert.equal(deletes, 0);
});
