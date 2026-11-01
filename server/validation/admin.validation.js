import { z } from 'zod';
import { HttpError } from '../utils/http-error.js';

const id = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const parse = (schema, input) => {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
  return result.data;
};
export const adminId = (value) => parse(id, value);
export const adminEmptyQuery = (query) => parse(z.strictObject({}), query);
const pageFields = { page: id.prefault('1'), limit: id.pipe(z.number().max(100)).prefault('10') };
export const adminPagination = (query, filters = {}) => parse(z.strictObject({ ...pageFields, ...filters }).refine((value) => Number.isSafeInteger((value.page - 1) * value.limit)), query);
export const adminUserQuery = (query) => adminPagination(query, { accountStatus: z.enum(['ACTIVE', 'SUSPENDED']).optional(), role: z.enum(['USER', 'ADMIN']).optional() });
export const adminItemQuery = (query) => adminPagination(query, { type: z.enum(['LOST', 'FOUND']).optional(), status: z.enum(['OPEN', 'CLAIM_PENDING', 'CLAIMED', 'RETURNED', 'CLOSED']).optional() });
const name = (maximum) => z.string().trim().min(1).max(maximum);
export const createLookupInput = (body, maximum) => parse(z.strictObject({ name: name(maximum) }), body);
export const updateLookupInput = (body, maximum) => parse(z.strictObject({ name: name(maximum).optional(), isActive: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0), body);
export const accountStatusInput = (body) => parse(z.strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']) }), body);
export const adminItemStatusInput = (body) => parse(z.strictObject({ status: z.literal('CLOSED') }), body);


