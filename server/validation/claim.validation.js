import { HttpError } from '../utils/http-error.js';
import { positiveId } from './item.validation.js';

export function validateCreateClaim(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'proofDescription')) {
    throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
  }
  if (typeof body.proofDescription !== 'string') throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
  const proofDescription = body.proofDescription.trim();
  if (!proofDescription || Buffer.byteLength(proofDescription, 'utf8') > 65535) throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
  return { proofDescription };
}

export { positiveId };
