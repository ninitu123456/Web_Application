import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateRegister, validateReset, validateForgot } from '../validation/auth.validation.js';
import { createMailer, matchEmail } from '../services/mail.service.js';
import { retryDelay } from '../services/email-worker.js';
import { createChatService, chatPage, validateMessage } from '../services/chat.service.js';

test('confirmation is required, exact, and stripped before persistence', () => {
  const data = { fullName: 'A', email: 'a@test.example', password: 'password123', confirmPassword: 'password123' };
  assert.equal(Object.hasOwn(validateRegister(data), 'confirmPassword'), false);
  for (const body of [{ ...data, confirmPassword: undefined }, { ...data, confirmPassword: 'Password123' }, { ...data, password: 'short', confirmPassword: 'short' }]) assert.throws(() => validateRegister(body), e => e.status === 400);
  assert.throws(() => validateReset({ token: 'a'.repeat(64), password: 'password123', confirmPassword: 'other' }), e => e.status === 400);
  assert.throws(() => validateForgot({ email: 'bad' }), e => e.status === 400);
});
test('Resend is optional and sends authenticated HTTPS requests with stable idempotency', async () => {
  const disabled = createMailer({});
  assert.equal(disabled.configured, false);
  await assert.rejects(() => disabled.send({ to: 'a@test.example' }), e => e.code === 'EMAIL_UNAVAILABLE');
  const env = { RESEND_API_KEY: 'test-api-key', EMAIL_FROM: 'FindIt <test@example.test>', FRONTEND_URL: 'https://example.test' };
  const requests = [];
  const mailer = createMailer(env, async (url, options) => { requests.push({ url, ...options }); return Response.json({ id: 'email-accepted' }); });
  const input = { to: 'test@example.test', subject: 'FindIt', text: 'hello', html: '<p>hello</p>', messageId: '<findit-match-1@example.test>' };
  assert.deepEqual(await mailer.send(input), { id: 'email-accepted' });
  await mailer.send(input);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(requests[0].headers.Authorization, 'Bearer test-api-key');
  assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
  assert.equal(requests[0].redirect, 'error');
  assert.deepEqual(JSON.parse(requests[0].body), { from: env.EMAIL_FROM, to: [input.to], subject: input.subject, text: input.text, html: input.html });
  await mailer.send({ to: input.to, subject: 'Reset', text: 'private reset link' });
  assert.equal(Object.hasOwn(requests[2].headers, 'Idempotency-Key'), false);
  assert.equal(Object.hasOwn(JSON.parse(requests[2].body), 'html'), false);
  await assert.rejects(() => mailer.send({ to: 'invalid\r\nBcc:test@example.test' }), e => e.code === 'INVALID_RECIPIENT');
  assert.equal(requests.length, 3);
  mailer.close();
  await assert.rejects(() => mailer.send(input), e => e.code === 'EMAIL_UNAVAILABLE');
});
test('Resend failures are sanitized, timeout is bounded, and rate limits preserve retry-after', async () => {
  const env = { RESEND_API_KEY: 'private-api-key', EMAIL_FROM: 'test@example.test', FRONTEND_URL: 'https://example.test' };
  const input = { to: 'test@example.test', subject: 'Reset', text: 'secret-token' };
  for (const [status, code, permanent] of [[400, 'RESEND_REJECTED', true], [401, 'RESEND_AUTH', true], [403, 'RESEND_AUTH', true], [422, 'RESEND_REJECTED', true], [429, 'RESEND_RATE_LIMIT', false], [500, 'RESEND_FAILED', false], [503, 'RESEND_FAILED', false]]) {
    const mailer = createMailer(env, async () => Response.json({ message: 'private-api-key secret-token' }, { status, headers: { 'Retry-After': '90' } }));
    await assert.rejects(() => mailer.send(input), error => {
      assert.equal(error.code, code); assert.equal(Boolean(error.permanent), permanent);
      if (status === 429) assert.equal(error.retryAfter, 90);
      assert.ok(!JSON.stringify(error).includes('private-api-key')); assert.ok(!String(error).includes('secret-token'));
      return true;
    });
  }
  for (const response of [Response.json({}), new Response('not JSON', { status: 200 })]) {
    const mailer = createMailer(env, async () => response);
    await assert.rejects(() => mailer.send(input), e => e.code === 'RESEND_FAILED');
  }
  const network = createMailer(env, async () => { throw new Error('private-api-key secret-token'); });
  await assert.rejects(() => network.send(input), e => e.code === 'RESEND_FAILED' && !String(e).includes('secret-token'));
  const hangingFetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  const timeout = createMailer(env, hangingFetch, { timeoutMs: 15 });
  await assert.rejects(() => timeout.send(input), e => e.code === 'EMAIL_TIMEOUT');
  const closing = createMailer(env, hangingFetch);
  const pending = closing.send(input);
  closing.close();
  await assert.rejects(() => pending, e => e.code === 'EMAIL_TIMEOUT');
});
test('match email HTML is escaped and retry backoff remains bounded', () => {
  const env = { FRONTEND_URL: 'https://example.test' };
  const email = matchEmail({ title: '<img src=x onerror=alert(1)>', ownTitle: 'Ví', score: 50, itemId: '7' }, env.FRONTEND_URL);
  assert.ok(email.html.includes('&lt;img')); assert.ok(!email.html.includes('<img')); assert.ok(email.text.includes('50/100'));
  assert.deepEqual([1, 2, 3, 4, 5].map(retryDelay), [30, 60, 120, 240, 480]);
});
test('chat validates identity, cursors, text size and shares rate limits across retries', async () => {
  const clientId = randomUUID();
  for (const content of ['', ' ', 'a'.repeat(2001), '\u0000']) assert.throws(() => validateMessage({ clientId, content }), e => e.status === 400);
  assert.throws(() => chatPage({ before: '-1' }), e => e.status === 400);
  assert.throws(() => chatPage({ limit: 101 }), e => e.status === 400);
  assert.equal(validateMessage({ clientId, content: '<script>alert(1)</script>' }).content, '<script>alert(1)</script>'); // Stored text; React escapes on render.
  const service = createChatService({ send: async () => ({ recipients: ['1', '2'], message: { id: '1' } }) });
  try {
    assert.throws(() => service.create({ id: '1' }, { userId: '1' }), e => e.status === 400);
    for (let i = 0; i < 30; i++) await service.send({ id: '1' }, '1', { content: 'Hello', clientId });
    await assert.rejects(() => service.send({ id: '1' }, '1', { content: 'Hello', clientId }), e => e.status === 429);
  } finally { service.close(); }
});
