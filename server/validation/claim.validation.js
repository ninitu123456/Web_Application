import { HttpError } from '../utils/http-error.js';
import { positiveId } from './item.validation.js';

const invalid = () => new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
function answers(value) {
  if (!Array.isArray(value) || value.length > 3) throw invalid();
  const seen = new Set();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some((key) => !['questionId', 'answer'].includes(key))) throw invalid();
    if (typeof entry.answer !== 'string') throw invalid();
    const answer = entry.answer.trim();
    if (!answer || Array.from(answer).length > 300) throw invalid();
    const questionId = positiveId(entry.questionId);
    if (seen.has(questionId)) throw invalid();
    seen.add(questionId);
    return { questionId, answer };
  });
}
export function validateCreateClaim(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'proofDescription') ||
      Object.keys(body).some((key) => !['proofDescription', 'answers'].includes(key))) {
    throw invalid();
  }
  if (typeof body.proofDescription !== 'string') throw invalid();
  const proofDescription = body.proofDescription.trim();
  if (!proofDescription || Buffer.byteLength(proofDescription, 'utf8') > 65535) throw invalid();
  return { proofDescription, answers: body.answers === undefined ? [] : answers(body.answers) };
}

export { positiveId };
