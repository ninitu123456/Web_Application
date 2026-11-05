import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { readSecurityConfig } from '../config/env.js';

export function createSecurity(overrides = {}) {
  const config = { ...readSecurityConfig(), ...overrides };
  function limiter(name, windowMs, keyGenerator) {
    return rateLimit({
      windowMs, limit: config[`${name}Max`],
      standardHeaders: 'draft-7', legacyHeaders: false,
      // Forwarded headers are deliberately ignored: this app has no trusted proxy.
      validate: { xForwardedForHeader: false, forwardedHeader: false },
      ...(keyGenerator ? { keyGenerator } : {}),
      skip: (req) => req.method === 'OPTIONS' || (name === 'api' && /^\/health\/?$/i.test(req.path)),
      handler(_req, res) {
        res.set('Cache-Control', 'no-store').status(429).json({ success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' });
      },
      ...config[name]
    });
  }
  return {
    headers: helmet({
      strictTransportSecurity: config.production ? undefined : false,
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: config.production ? [] : null } }
    }),
    api: limiter('api', 60000), health: limiter('health', 60000), login: limiter('login', 900000), register: limiter('register', 900000),
    reset: rateLimit({ windowMs: 900000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, validate: { xForwardedForHeader: false, forwardedHeader: false }, handler: (_req, res) => res.status(429).json({ success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' }) }),
    upload: limiter('upload', 60000, (req) => String(req.user.id))
  };
}
