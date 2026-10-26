import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMatchScore } from '../utils/match-score.js';
import { matchingTransaction } from '../services/matching-transaction.js';
import { baseItem, matchCases } from './fixtures/matching.js';

for (const fixture of matchCases) test(`matching dataset: ${fixture.name}`, () => {
  const found = { ...baseItem, id: 2, type: 'FOUND', ...fixture.change };
  const result = calculateMatchScore(baseItem, found);
  assert.equal(result.score, fixture.score);
  assert.equal(result.reasons.length, fixture.reasons);
  assert.deepEqual(calculateMatchScore(found, baseItem), result);
});
test('matching normalizes Vietnamese NFC, case, punctuation and whitespace without removing accents', () => {
  const found = { ...baseItem, id: '2', type: 'FOUND', title: ' TAI, NGHE! ', description: ' MÀU\tTRẮNG '.normalize('NFD') };
  assert.equal(calculateMatchScore(baseItem, found).score, 100);
  assert.equal(calculateMatchScore({ ...baseItem, title: '', description: null }, { ...found, title: null, description: '' }).score, 70);
  assert.equal(calculateMatchScore({ ...baseItem, title: 'ví', description: '' }, { ...found, title: 'vi', description: '' }).score, 70);
});
test('matching rejects malformed Items, invalid dates, same Item/type and excluded states', () => {
  const found = { ...baseItem, id: 2, type: 'FOUND' };
  for (const change of [{ id: null }, { id: true }, { categoryId: 0 }, { locationId: '' }, { eventDate: '2026-02-30' }, { eventDate: '2026-02-29' }, { eventDate: new Date(NaN) }, { type: 'OTHER' }, { status: 'CLOSED' }, { status: 'RETURNED' }, { status: 'OTHER' }, { title: 4 }]) {
    assert.throws(() => calculateMatchScore({ ...baseItem, ...change }, found), TypeError);
    assert.throws(() => calculateMatchScore(baseItem, { ...found, ...change }), TypeError);
  }
  assert.throws(() => calculateMatchScore(null, found), TypeError);
  assert.throws(() => calculateMatchScore(baseItem, { ...found, id: '1' }), TypeError);
  assert.throws(() => calculateMatchScore(baseItem, { ...found, type: 'LOST' }), TypeError);
  assert.equal(calculateMatchScore({ ...baseItem, eventDate: '2024-02-29' }, { ...found, eventDate: new Date('2024-02-29T00:00:00Z') }).score, 100);
  for (const status of ['CLAIM_PENDING', 'CLAIMED']) assert.equal(calculateMatchScore({ ...baseItem, status }, found).score, 100);
});
test('rounding around 50 occurs before the persistence threshold', () => {
  // No category/text, same date/location = 40; text 1/3 adds 10.
  const lost = { ...baseItem, title: 'a', description: '' };
  const found = { ...lost, id: 2, type: 'FOUND', categoryId: 2, title: 'a b c' };
  assert.equal(calculateMatchScore(lost, found).score, 50);
  const item = { ...baseItem, title: 'a', description: '', eventDate: '2026-01-01' };
  const other = { ...item, id: 2, type: 'FOUND', locationId: 2, eventDate: '2026-01-16', title: 'a b c d e f' };
  assert.equal(calculateMatchScore(item, other).score, 45);
  const tokens = (n) => ['a', ...Array.from({ length: n - 1 }, (_, i) => `w${i}`)].join(' ');
  // category=30, location=20, date=0; strictly below/exactly above 50.
  assert.equal(calculateMatchScore(item, { ...other, locationId: 1, eventDate: '2026-01-31', title: tokens(6001) }).score, 50);
  assert.equal(calculateMatchScore(item, { ...other, locationId: 1, eventDate: '2026-01-31', title: tokens(5999) }).score, 50.01);
  // Base 40, Jaccard 1999/6000 adds 9.995: rounded score reaches 50.
  const many = (n) => Array.from({ length: n }, (_, i) => `v${i}`).join(' ');
  const a = { ...item, title: many(1999) };
  const b = { ...other, title: many(6000) };
  assert.equal(calculateMatchScore(a, b).score, 50);
  assert.equal(calculateMatchScore({ ...a, title: many(1998) }, b).score, 49.99);
});

function fakeConnection(overrides = {}) {
  const calls = [];
  return {
    calls,
    async query(statement) {
      const sql = statement.sql; calls.push(sql);
      if (sql.includes('DATABASE()')) return [[{ name: 'unit_matching' }]];
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      return [[]];
    },
    async beginTransaction() { calls.push('begin'); }, async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); }, release() { calls.push('release'); }, destroy() { calls.push('destroy'); },
    ...overrides
  };
}
test('matching transaction retries only rolled-back deadlock/lock-wait errors, at most three attempts', async () => {
  for (const code of ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']) {
    const connection = fakeConnection(); let attempts = 0;
    const pool = { async getConnection() { return connection; } };
    assert.equal(await matchingTransaction(pool, async () => { if (++attempts < 3) throw Object.assign(new Error('retry'), { code }); return 42; }), 42);
    assert.equal(attempts, 3);
    assert.equal(connection.calls.filter((c) => c === 'rollback').length, 2);
    assert.ok(connection.calls.findIndex((c) => c.includes('GET_LOCK')) < connection.calls.indexOf('begin'));
    attempts = 0;
    await assert.rejects(() => matchingTransaction(pool, async () => { attempts++; throw Object.assign(new Error('exhausted'), { code }); }), /exhausted/);
    assert.equal(attempts, 3);
  }
});
test('uncertain COMMIT and failed rollback destroy sessions without replay', async () => {
  for (const fault of ['commit', 'rollback']) {
    const connection = fakeConnection({ async [fault]() { throw Object.assign(new Error('lost response'), { code: 'ER_LOCK_DEADLOCK' }); } });
    let attempts = 0;
    await assert.rejects(() => matchingTransaction({ async getConnection() { return connection; } }, async () => { attempts++; if (fault === 'rollback') throw new Error('work failed'); }), /lost response|work failed/);
    assert.equal(attempts, 1); assert.ok(connection.calls.includes('destroy')); assert.ok(!connection.calls.includes('release'));
  }
});
test('lock wait failure starts no transaction and unconfirmed lock release destroys the connection', async () => {
  for (const kind of ['busy', 'release', 'nullRelease']) {
    const connection = fakeConnection(); const original = connection.query;
    connection.query = async (s) => {
      if (kind === 'busy' && s.sql.includes('GET_LOCK')) return [[{ acquired: 0 }]];
      if (kind !== 'busy' && s.sql.includes('RELEASE_LOCK')) return [[{ released: kind === 'release' ? 0 : null }]];
      return original(s);
    };
    await assert.rejects(() => matchingTransaction({ async getConnection() { return connection; } }, async () => 1));
    if (kind === 'busy') assert.ok(!connection.calls.includes('begin'));
    else assert.ok(connection.calls.includes('destroy'));
  }
});
test('ambiguous BEGIN and RELEASE failures destroy connections without reusing or retrying them', async () => {
  for (const kind of ['begin', 'release', 'get']) {
    const connection = fakeConnection(); const original = connection.query;
    if (kind === 'begin') connection.beginTransaction = async () => { throw new Error('BEGIN response lost'); };
    connection.query = async (statement) => {
      if (kind === 'release' && statement.sql.includes('RELEASE_LOCK')) throw new Error('RELEASE response lost');
      if (kind === 'get' && statement.sql.includes('GET_LOCK')) throw Object.assign(new Error('GET response lost'), { code: 'PROTOCOL_SEQUENCE_TIMEOUT' });
      return original(statement);
    };
    let attempts = 0;
    await assert.rejects(() => matchingTransaction({ async getConnection() { return connection; } }, async () => { attempts++; }));
    assert.equal(attempts, kind === 'release' ? 1 : 0);
    assert.ok(connection.calls.includes('destroy')); assert.ok(!connection.calls.includes('release'));
  }
});
