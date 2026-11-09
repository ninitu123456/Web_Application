import { createHash } from 'node:crypto';

const mailError = (code, extra = {}) => Object.assign(new Error('Email delivery unavailable'), { code, delivery: 'UNKNOWN', ...extra });
const address = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/[\r\n]/.test(value);
export function validateMailRequest(request, requireIdempotency = false) {
  if (!request || request.version !== 1 || request.url !== 'https://api.resend.com/emails' || request.method !== 'POST' ||
      request.contentType !== 'application/json' || typeof request.body !== 'string' || request.body.length > 100000 ||
      Object.keys(request).some(key => !['version', 'url', 'method', 'contentType', 'body', 'idempotencyKey'].includes(key)) ||
      (requireIdempotency || request.idempotencyKey !== undefined) && !/^findit-match\/[a-f0-9]{64}$/.test(request.idempotencyKey ?? '')) {
    throw mailError('EMAIL_SNAPSHOT_INVALID', { permanent: true, delivery: 'NOT_SENT' });
  }
  let body;
  try { body = JSON.parse(request.body); } catch { throw mailError('EMAIL_SNAPSHOT_INVALID', { permanent: true, delivery: 'NOT_SENT' }); }
  if (!body || typeof body.from !== 'string' || !body.from.trim() || /[\r\n]/.test(body.from) ||
      !Array.isArray(body.to) || body.to.length !== 1 || !address(body.to[0]) || typeof body.subject !== 'string' || typeof body.text !== 'string' ||
      body.html !== undefined && typeof body.html !== 'string' || Object.keys(body).some(key => !['from', 'to', 'subject', 'text', 'html'].includes(key))) {
    throw mailError('EMAIL_SNAPSHOT_INVALID', { permanent: true, delivery: 'NOT_SENT' });
  }
  return request;
}
export function createMailer(env = process.env, fetchRequest = globalThis.fetch, { timeoutMs = 8000 } = {}) {
  const apiKey = env.RESEND_API_KEY?.trim(), from = env.EMAIL_FROM?.trim();
  const configured = Boolean(apiKey && from && env.FRONTEND_URL);
  if (configured) {
    const url = new URL(env.FRONTEND_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\r\n]/.test(from + apiKey)) throw new Error('Invalid email configuration');
  }
  const pending = new Set();
  let closed = false;
  function prepare({ to, subject, text, html, messageId }) {
    if (!address(to)) throw mailError('INVALID_RECIPIENT', { delivery: 'NOT_SENT' });
    return validateMailRequest({ version: 1, url: 'https://api.resend.com/emails', method: 'POST', contentType: 'application/json',
      body: JSON.stringify({ from, to: [to], subject, text, ...(html === undefined ? {} : { html }) }),
      ...(messageId ? { idempotencyKey: `findit-match/${createHash('sha256').update(messageId).digest('hex')}` } : {}) });
  }
  return {
    configured, frontendUrl: env.FRONTEND_URL?.replace(/\/$/, ''), prepare,
    async send(input) {
      if (!configured || closed) throw mailError('EMAIL_UNAVAILABLE', { delivery: 'NOT_SENT' });
      const request = input.request ? validateMailRequest(input.request, true) : prepare(input);
      const controller = new AbortController();
      const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
      let started = false;
      pending.add(controller);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        if (input.beforeSend && !await input.beforeSend()) throw mailError('EMAIL_LEASE_LOST', { delivery: 'NOT_SENT' });
        if (input.notAfter !== undefined && Date.now() >= input.notAfter) throw mailError('EMAIL_RETRY_WINDOW_EXPIRED', { permanent: true, delivery: 'NOT_SENT' });
        if (signal.aborted) throw mailError('EMAIL_LEASE_LOST', { delivery: 'NOT_SENT' });
        const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': request.contentType };
        // Only non-secret match event IDs are used as idempotency keys. Never a reset URL/token.
        if (request.idempotencyKey) headers['Idempotency-Key'] = request.idempotencyKey;
        started = true;
        const response = await fetchRequest(request.url, {
          method: request.method, headers, redirect: 'error', signal,
          body: request.body
        });
        if (!response.ok) {
          if (response.status === 409) {
            const result = await response.json().catch(() => null);
            if (result?.name === 'invalid_idempotent_request') throw mailError('RESEND_IDEMPOTENCY_CONFLICT', { permanent: true });
            if (result?.name === 'concurrent_idempotent_requests') throw mailError('RESEND_IDEMPOTENCY_PENDING');
            throw mailError('RESEND_FAILED');
          }
          await response.body?.cancel().catch(() => {});
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get('retry-after'));
            throw mailError('RESEND_RATE_LIMIT', { delivery: 'NOT_SENT', ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter: Math.min(86400, Math.ceil(retryAfter)) } : {}) });
          }
          if ([401, 403].includes(response.status)) throw mailError('RESEND_AUTH', { permanent: true, delivery: 'NOT_SENT' });
          if ([400, 422].includes(response.status)) throw mailError('RESEND_REJECTED', { permanent: true, delivery: 'NOT_SENT' });
          throw mailError('RESEND_FAILED');
        }
        const result = await response.json();
        if (typeof result?.id !== 'string' || !result.id.trim()) throw mailError('RESEND_FAILED');
        return { id: result.id };
      } catch (error) {
        // Never propagate provider bodies, request headers, tokens or fetch error causes.
        if (signal.aborted) throw mailError(input.signal?.aborted ? 'EMAIL_LEASE_LOST' : 'EMAIL_TIMEOUT', { delivery: started ? 'UNKNOWN' : 'NOT_SENT' });
        if (['RESEND_RATE_LIMIT', 'RESEND_AUTH', 'RESEND_REJECTED', 'RESEND_FAILED', 'RESEND_IDEMPOTENCY_CONFLICT', 'RESEND_IDEMPOTENCY_PENDING',
          'EMAIL_LEASE_LOST', 'EMAIL_RETRY_WINDOW_EXPIRED'].includes(error.code)) throw error;
        throw mailError('RESEND_FAILED', { delivery: started ? 'UNKNOWN' : 'NOT_SENT' });
      } finally { clearTimeout(timer); pending.delete(controller); }
    },
    close() { closed = true; for (const controller of pending) controller.abort(); }
  };
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function matchEmail(payload, frontendUrl) {
  const url = `${frontendUrl}/do-vat/${encodeURIComponent(payload.itemId)}`;
  const note = 'Đây chỉ là gợi ý tương đồng, không xác nhận chắc chắn hai vật phẩm là một.';
  return { subject: 'FindIt — Có đồ vật phù hợp với bài đăng của bạn',
    text: `${payload.ownTitle}\nĐồ vật liên quan: ${payload.title}\nĐiểm tương đồng: ${payload.score}/100\n${note}\nXem chi tiết: ${url}`,
    html: `<h2>Có gợi ý đồ vật phù hợp</h2><p>Bài của bạn: ${escapeHtml(payload.ownTitle)}</p><p>Đồ vật liên quan: ${escapeHtml(payload.title)}</p><p>Điểm tương đồng: ${escapeHtml(payload.score)}/100</p><p>${note}</p><a href="${escapeHtml(url)}">Xem chi tiết</a>` };
}
