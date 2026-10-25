import { HttpError } from '../utils/http-error.js';

function invalid() { throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ'); }
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); }
function onlyKeys(value, allowed) { object(value); if (Object.keys(value).some((key) => !allowed.includes(key))) invalid(); }
function required(value, fields) { if (fields.some((key) => !Object.hasOwn(value, key))) invalid(); }
function string(value, max, allowEmpty = false) {
  if (typeof value !== 'string') invalid();
  const result = value.trim();
  if ((!allowEmpty && !result) || Array.from(result).length > max || Buffer.byteLength(result, 'utf8') > 65535) invalid();
  return result;
}
export function positiveId(value) {
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) invalid();
  return id;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) invalid();
  return value;
}
export function validateCreateItem(body) {
  onlyKeys(body, ['title', 'type', 'categoryId', 'locationId', 'eventDate', 'description', 'color']);
  required(body, ['title', 'type', 'categoryId', 'locationId', 'eventDate', 'description']);
  if (!['LOST', 'FOUND'].includes(body.type)) invalid();
  return { title: string(body.title, 200), type: body.type, categoryId: positiveId(body.categoryId), locationId: positiveId(body.locationId), eventDate: date(body.eventDate), description: string(body.description, 65535), color: body.color === undefined || body.color === null ? null : string(body.color, 80) };
}
export function validateUpdateItem(body) {
  const fields = ['title', 'categoryId', 'locationId', 'eventDate', 'description', 'color'];
  onlyKeys(body, fields);
  if (!Object.keys(body).length) invalid();
  const result = {};
  for (const key of Object.keys(body)) {
    if (key === 'title') result.title = string(body.title, 200);
    if (key === 'categoryId' || key === 'locationId') result[key] = positiveId(body[key]);
    if (key === 'eventDate') result.eventDate = date(body.eventDate);
    if (key === 'description') result.description = string(body.description, 65535);
    if (key === 'color') result.color = body.color === null ? null : string(body.color, 80);
  }
  return result;
}
export function validateSearch(query) {
  const fields = ['keyword', 'type', 'category', 'location', 'status', 'page', 'limit', 'dateFrom', 'dateTo', 'sort'];
  onlyKeys(query, fields);
  const result = { page: query.page === undefined ? 1 : positiveId(query.page), limit: query.limit === undefined ? 10 : positiveId(query.limit) };
  if (result.limit > 100) invalid();
  if (!Number.isSafeInteger((result.page - 1) * result.limit)) invalid();
  if (query.keyword !== undefined) result.keyword = string(query.keyword, 200);
  if (query.type !== undefined) { if (!['LOST', 'FOUND'].includes(query.type)) invalid(); result.type = query.type; }
  for (const key of ['category', 'location']) if (query[key] !== undefined) result[key] = positiveId(query[key]);
  if (query.status !== undefined) {
    const statuses = ['OPEN', 'CLAIM_PENDING', 'CLAIMED', 'RETURNED', 'CLOSED'];
    if (!statuses.includes(query.status)) invalid(); result.status = query.status;
  }
  if (query.dateFrom !== undefined) result.dateFrom = date(query.dateFrom);
  if (query.dateTo !== undefined) result.dateTo = date(query.dateTo);
  if (result.dateFrom && result.dateTo && result.dateFrom > result.dateTo) invalid();
  if (query.sort !== undefined) {
    if (!['newest', 'oldest', 'eventDateAsc', 'eventDateDesc'].includes(query.sort)) invalid(); result.sort = query.sort;
  }
  return result;
}
