import nodemailer from 'nodemailer';

export function createMailer(env = process.env, transportFactory = nodemailer.createTransport) {
  const configured = Boolean(env.SMTP_HOST && env.SMTP_FROM && env.FRONTEND_URL && env.SMTP_USER && env.SMTP_PASSWORD);
  let transport;
  if (configured) {
    const url = new URL(env.FRONTEND_URL);
    const port = Number(env.SMTP_PORT || 465);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !Number.isInteger(port) || port < 1 || port > 65535 || !['true', 'false', undefined].includes(env.SMTP_SECURE)) throw new Error('Invalid email configuration');
    transport = transportFactory({ host: env.SMTP_HOST, port, secure: env.SMTP_SECURE !== 'false',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, dnsTimeout: 5000,
      logger: false, debug: false });
  }
  return {
    configured, frontendUrl: env.FRONTEND_URL?.replace(/\/$/, ''),
    async send({ to, subject, text, html, messageId }) {
      if (!transport) throw Object.assign(new Error('Email unavailable'), { code: 'SMTP_UNAVAILABLE' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || /[\r\n]/.test(to)) throw Object.assign(new Error('Invalid recipient'), { code: 'INVALID_RECIPIENT' });
      const result = await transport.sendMail({ from: env.SMTP_FROM, to, subject, text, html, messageId, disableFileAccess: true, disableUrlAccess: true });
      if (!result.accepted?.length) throw Object.assign(new Error('Email not accepted'), { code: 'SMTP_REJECTED' });
    },
    close() { transport?.close(); }
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
