import { createHash } from 'node:crypto';

// Production policy is deliberately absent until independently validated.
export function decideVisualNotification({ snapshotComplete, eligible, policyValidated = false, shadowMode = false, demoMode = false, synthetic = false, score, demoThreshold }) {
  if (!snapshotComplete) return { disposition: 'SUPPRESSED', reason: 'SNAPSHOT_INCOMPLETE' };
  if (!eligible) return { disposition: 'SUPPRESSED', reason: 'NOT_ELIGIBLE' };
  if (shadowMode) return { disposition: 'ABSTAIN', reason: 'SHADOW_MODE_NO_DELIVERY' };
  if (demoMode && synthetic && Number.isFinite(score) && Number.isFinite(demoThreshold) && score >= demoThreshold) return { disposition: 'DEMO_ELIGIBLE', reason: 'DEMO_ONLY_FIXTURE_POLICY' };
  if (demoMode && synthetic) return { disposition: 'SUPPRESSED', reason: 'DEMO_ONLY_FIXTURE_BELOW_THRESHOLD' };
  if (!policyValidated) return { disposition: 'SUPPRESSED', reason: 'NO_VALIDATED_NOTIFICATION_POLICY' };
  return { disposition: 'ABSTAIN', reason: 'POLICY_REQUIRES_REVIEW' };
}

export function aiVisualEventKey(recipientId, lostItemId, foundItemId) {
  const pair = [String(recipientId), String(lostItemId), String(foundItemId)].join(':');
  return `AI_VISUAL:${createHash('sha256').update(pair).digest('hex')}`;
}
