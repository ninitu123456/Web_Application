// All production routes, including canonical admin moderation.
export const protectedRoutes = [
  ['GET', '/admin/claims'], ['GET', '/admin/activity-logs'],
  ['PATCH', '/admin/claims/1/resolve', { decision: 'APPROVE', reason: 'Review' }],
  ['PATCH', '/admin/items/1/close', { reason: 'Review' }],
  ['GET', '/users/me'], ['PATCH', '/users/me', { fullName: 'Changed' }],
  ['GET', '/items/1/matches'], ['GET', '/items/1/claims'],
  ['POST', '/items/1/claims', { proofDescription: 'private' }],
  ['POST', '/items', {}], ['PATCH', '/items/1', { title: 'Changed' }],
  ['PATCH', '/items/1/close'], ['POST', '/items/1/images'], ['DELETE', '/items/1/images/1'],
  ['GET', '/claims/mine'], ...['approve', 'reject', 'complete'].map((action) => ['PATCH', `/claims/1/${action}`]),
  ['GET', '/notifications'], ['GET', '/notifications/unread-count'],
  ['PATCH', '/notifications/read-all'], ['PATCH', '/notifications/1/read'],
  ['POST', '/reports', { targetType: 'ITEM', targetId: 1, reason: 'spam' }], ['GET', '/reports/mine'],
  ['GET', '/admin/dashboard'], ['GET', '/admin/users'], ['GET', '/admin/users/1'],
  ['PATCH', '/admin/users/1/status', { status: 'SUSPENDED' }],
  ['GET', '/admin/items'], ['GET', '/admin/items/1'], ['PATCH', '/admin/items/1/status', { status: 'CLOSED' }],
  ...['categories', 'locations'].flatMap((kind) => [
    ['GET', `/admin/${kind}`], ['POST', `/admin/${kind}`, { name: 'New' }],
    ['PATCH', `/admin/${kind}/1`, { isActive: false }], ['DELETE', `/admin/${kind}/1`]
  ]),
  ['GET', '/admin/reports'], ['GET', '/admin/reports/1'], ['PATCH', '/admin/reports/1', { status: 'REVIEWING' }]
];

export function assertNoPrivateData(assert, value, secrets = []) {
  const forbidden = new Set(['password_hash', 'passwordHash', 'proof_description', 'proofDescription', 'private_identifiers', 'privateIdentifiers', 'contact_info', 'cloudinary_public_id', 'event_key', 'active_target_key', 'stack', 'sql']);
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      assert.ok(!forbidden.has(key), `Private field ${key}`);
      visit(child);
    }
  };
  visit(value);
  for (const secret of secrets) assert.ok(!JSON.stringify(value).includes(secret), 'Private value leaked');
}
