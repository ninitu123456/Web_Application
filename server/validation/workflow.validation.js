import { z } from 'zod';
import { HttpError } from '../utils/http-error.js';

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
  return result.data;
}
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const queryNumber = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(id);
const pageFields = { page: queryNumber.default(1), limit: queryNumber.pipe(z.number().max(100)).default(10) };
const safeOffset = (value) => Number.isSafeInteger((value.page - 1) * value.limit);
export const workflowId = (value) => parse(queryNumber, value);
export const pagination = (query) => parse(z.strictObject(pageFields).refine(safeOffset), query);
export const reportQuery = (query) => parse(z.strictObject({ ...pageFields, status: z.enum(['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED']).optional() }).refine(safeOffset), query);
export const createReportInput = (body) => parse(z.strictObject({
  targetType: z.enum(['ITEM', 'USER', 'CLAIM']), targetId: id,
  reason: z.string().trim().min(1).refine((value) => Array.from(value).length <= 50),
  description: z.string().trim().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 65535).optional()
}), body);
export const updateReportInput = (body) => parse(z.strictObject({ status: z.enum(['REVIEWING', 'RESOLVED', 'DISMISSED']) }), body);
