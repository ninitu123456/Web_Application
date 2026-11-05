import { createHash } from 'node:crypto';

const mailError = (code, extra = {}) => Object.assign(new Error('Email delivery unavailable'), { code, ...extra });
export function createMailer(env = process.env, fetchRequest = globalThis.fetch, { timeoutMs = 8000 } = {}) {
  const apiKey = env.RESEND_API_KEY?.trim(), from = env.EMAIL_FROM?.trim();
  const configured = Boolean(apiKey && from && env.FRONTEND_URL);
  if (configured) {
    const url = new URL(env.FRONTEND_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\r\n]/.test(from + apiKey)) throw new Error('Invalid email configuration');
  }
  const pending = new Set();
  let closed = false;
  return {
    configured, frontendUrl: env.FRONTEND_URL?.replace(/\/$/, ''),
    async send({ to, subject, text, html, messageId }) {
      if (!configured || closed) throw mailError('EMAIL_UNAVAILABLE');
      if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || /[\r\n]/.test(to)) throw mailError('INVALID_RECIPIENT');
      const controller = new AbortController();
      pending.add(controller);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
        // Only non-secret match event IDs are used as idempotency keys. Never a reset URL/token.
        if (messageId) headers['Idempotency-Key'] = `findit-match/${createHash('sha256').update(messageId).digest('hex')}`;
        const response = await fetchRequest('https://api.resend.com/emails', {
          method: 'POST', headers, redirect: 'error', signal: controller.signal,
          body: JSON.stringify({ from, to: [to], subject, text, ...(html === undefined ? {} : { html }) })
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          if (response.status === 429) {
            const retryAfter = Number(response.headers.get('retry-after'));
            throw mailError('RESEND_RATE_LIMIT', Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter: Math.min(86400, Math.ceil(retryAfter)) } : {});
          }
          if ([401, 403].includes(response.status)) throw mailError('RESEND_AUTH', { permanent: true });
          if ([400, 422].includes(response.status)) throw mailError('RESEND_REJECTED', { permanent: true });
          throw mailError('RESEND_FAILED');
        }
        const result = await response.json();
        if (typeof result?.id !== 'string' || !result.id.trim()) throw mailError('RESEND_FAILED');
        return { id: result.id };
      } catch (error) {
        // Never propagate provider bodies, request headers, tokens or fetch error causes.
        if (controller.signal.aborted) throw mailError('EMAIL_TIMEOUT');
        if (['RESEND_RATE_LIMIT', 'RESEND_AUTH', 'RESEND_REJECTED', 'RESEND_FAILED'].includes(error.code)) throw error;
        throw mailError('RESEND_FAILED');
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
