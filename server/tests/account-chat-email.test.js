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
test('mail transport is optional, requires acceptance, and escapes match HTML', async () => {
  const disabled = createMailer({});
  assert.equal(disabled.configured, false);
  await assert.rejects(() => disabled.send({ to: 'a@test.example' }), e => e.code === 'SMTP_UNAVAILABLE');
  const env = { SMTP_HOST: 'localhost', SMTP_USER: 'test', SMTP_PASSWORD: 'test', SMTP_FROM: 'test@example.test', FRONTEND_URL: 'https://example.test' };
  let options, sent;
  const mailer = createMailer(env, config => { options = config; return { sendMail: async mail => { sent = mail; return { accepted: ['test@example.test'] }; } }; });
  await mailer.send({ to: 'test@example.test', text: 'hello' });
  assert.equal(options.logger, false); assert.equal(sent.disableFileAccess, true);
  await assert.rejects(() => mailer.send({ to: 'invalid\r\nBcc:test@example.test' }), e => e.code === 'INVALID_RECIPIENT');
  const rejecting = createMailer(env, () => ({ sendMail: async () => ({ accepted: [] }) }));
  await assert.rejects(() => rejecting.send({ to: 'test@example.test' }), e => e.code === 'SMTP_REJECTED');
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
