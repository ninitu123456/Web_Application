// Explicit asset manifests only; this module never creates a provider client.
import { checksum } from './demo-purge.js';
function verifiedReceipt(receipt) {
  const { receiptChecksum, ...body } = receipt;
  if (receipt.state !== 'COMMITTED' || checksum(body) !== receiptChecksum)
    throw new Error('Verified committed DB receipt required before asset reconciliation');
}
function owned(asset, resource, cloudName, committedAt) {
  if (
    asset.cloudName !== cloudName ||
    resource.public_id !== asset.publicId ||
    resource.resource_type !== 'image' ||
    resource.type !== 'upload' ||
    !resource.asset_id ||
    !Number.isSafeInteger(resource.version) ||
    checksum(resource.secure_url) !== asset.urlChecksum ||
    Date.parse(resource.created_at) > Date.parse(committedAt) ||
    !Number.isFinite(Date.parse(resource.created_at))
  )
    throw new Error('Asset identity/ownership changed; new manifest review required');
}
export async function planDemoAssets(receipt, { resource, hasReference, cloudName }) {
  verifiedReceipt(receipt);
  const assets = [],
    excluded = [];
  for (const asset of receipt.assets) {
    if (await hasReference(asset.publicId)) {
      excluded.push({ publicId: asset.publicId, reason: 'Retained reference' });
      continue;
    }
    let current;
    try {
      current = await resource(asset.publicId);
    } catch (error) {
      if (error.http_code === 404) {
        excluded.push({ publicId: asset.publicId, reason: 'Already absent' });
        continue;
      }
      throw new Error('Asset metadata verification failed');
    }
    owned(asset, current, cloudName, receipt.committedAt);
    assets.push({ ...asset, assetId: current.asset_id, version: current.version });
  }
  const plan = {
    version: 1,
    dbReceiptChecksum: receipt.receiptChecksum,
    manifestFingerprint: receipt.manifestFingerprint,
    targetFingerprint: receipt.targetFingerprint,
    committedAt: receipt.committedAt,
    cloudName,
    assets,
    excluded,
  };
  return { ...plan, fingerprint: checksum(plan) };
}
export async function executeDemoAssets(
  plan,
  {
    confirm,
    maintenance = false,
    cloudName,
    resource,
    destroy,
    hasReference,
    priorResults = [],
    onResult = async () => {},
  },
) {
  const { fingerprint, ...body } = plan;
  if (
    checksum(body) !== fingerprint ||
    confirm !== fingerprint ||
    cloudName !== plan.cloudName ||
    !maintenance
  )
    throw new Error('Exact separately approved asset manifest/cloud and maintenance window required');
  const done = new Set(
    priorResults
      .filter((row) => ['DELETED', 'ALREADY_ABSENT'].includes(row.status))
      .map((row) => row.publicId),
  );
  const missing = new Set();
  // Preflight every approved ID before deleting any; never enumerate a folder.
  for (const asset of plan.assets) {
    if (done.has(asset.publicId)) continue;
    if (await hasReference(asset.publicId))
      throw new Error('Asset is referenced; new manifest review required');
    let current;
    try {
      current = await resource(asset.publicId);
    } catch (error) {
      if (error.http_code === 404) {
        missing.add(asset.publicId);
        continue;
      }
      throw new Error('Asset metadata verification failed');
    }
    owned(asset, current, cloudName, plan.committedAt);
    if (current.asset_id !== asset.assetId || current.version !== asset.version)
      throw new Error('Asset replaced; new manifest review required');
  }
  const results = [];
  for (const asset of plan.assets) {
    let status;
    if (done.has(asset.publicId)) status = 'PREVIOUSLY_COMPLETED';
    else if (missing.has(asset.publicId)) status = 'ALREADY_ABSENT';
    else {
      if (await hasReference(asset.publicId)) throw new Error('New reference detected; stop asset cleanup');
      // Maintenance pauses writers; recheck immutable identity immediately before deletion.
      const current = await resource(asset.publicId);
      owned(asset, current, cloudName, plan.committedAt);
      if (current.asset_id !== asset.assetId || current.version !== asset.version)
        throw new Error('Asset replaced; stop cleanup');
      try {
        const result = await destroy(asset.publicId);
        status =
          result.result === 'ok' ? 'DELETED' : result.result === 'not found' ? 'ALREADY_ABSENT' : 'FAILED';
      } catch {
        status = 'FAILED';
      }
    }
    const result = { publicId: asset.publicId, assetId: asset.assetId, version: asset.version, status };
    results.push(result);
    await onResult(result);
  }
  return { manifestFingerprint: fingerprint, results };
}
