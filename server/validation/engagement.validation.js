import { z } from 'zod';
import { parse } from './workflow.validation.js';

const text = (max) => z.string().trim().min(1).refine((value) => Array.from(value).length <= max);
export const contactInput = (body) => parse(z.strictObject({
  fullName: text(100),
  email: z.string().trim().max(255).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  topic: z.enum(['GENERAL', 'ACCOUNT', 'ITEM', 'REPORT', 'OTHER']),
  body: text(3000),
  itemUrl: z.string().trim().max(500).regex(/^https?:\/\/\S+$/).optional()
}), body);
export const contactQuery = (query) => parse(z.strictObject({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).default(1),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().max(100)).default(10),
  status: z.enum(['NEW', 'HANDLED']).optional()
}).refine((value) => (value.page - 1) * value.limit <= 100000), query);
const MAX_AHEAD = 60 * 24 * 3600 * 1000;
export const appointmentInput = (body, now = Date.now()) => parse(z.strictObject({
  appointmentAt: z.string().datetime({ offset: true }).refine((value) => {
    const time = Date.parse(value);
    return time > now && time - now <= MAX_AHEAD;
  }),
  place: text(200)
}), body);
export const disputeInput = (body) => parse(z.strictObject({ reason: text(1000) }), body);
