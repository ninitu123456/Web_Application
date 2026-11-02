import { z } from 'zod';
import { HttpError } from '../utils/http-error.js';
import { businessActions, businessEntities } from '../utils/admin-dto.js';

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

// Unicode mode consumes valid surrogate pairs as one code point, so this
// range matches only unpaired UTF-16 surrogates that cannot be stored as JSON.
const reason = z.string().trim().refine((value) => !/[\uD800-\uDFFF]/u.test(value) && [...value].length >= 1 && [...value].length <= 1000 && Buffer.byteLength(value, 'utf8') <= 4000);
export const adminCloseInput = (body) => parse(z.strictObject({ reason }), body);
export const adminResolveInput = (body) => parse(z.strictObject({ decision: z.enum(['APPROVE', 'REJECT']), reason }), body);
const sort = z.enum(['newest', 'oldest']).prefault('newest');
export const adminClaimQuery = (query) => adminPagination(query, { status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED']).optional(), itemId: id.optional(), claimantId: id.optional(), sort });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => value >= '1000-01-01' && value <= '9999-12-31' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
export const adminActivityQuery = (query) => {
  const result = adminPagination(query, { action: z.enum(businessActions).optional(), entityType: z.enum(businessEntities).optional(), entityId: id.optional(), actorId: id.optional(), dateFrom: day.optional(), dateTo: day.optional(), sort });
  if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
  return result;
};


