import { HttpError } from '../utils/http-error.js';

function invalid() { throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ'); }
function objectWith(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== fields.length || Object.keys(body).some((key) => !fields.includes(key))) invalid();
}
export function validateFullName(value) {
  if (typeof value !== 'string') invalid();
  const name = value.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > 150) invalid();
  return name;
}
function email(value) {
  if (typeof value !== 'string') invalid();
  const normalized = value.trim().toLowerCase();
  if (Array.from(normalized).length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) invalid();
  return normalized;
}
function password(value, minimum) {
  if (typeof value !== 'string' || Array.from(value).length < minimum || Buffer.byteLength(value, 'utf8') > 72) invalid();
  return value;
}
export function validateRegister(body) {
  objectWith(body, ['fullName', 'email', 'password']);
  return { fullName: validateFullName(body.fullName), email: email(body.email), password: password(body.password, 8) };
}
export function validateLogin(body) {
  objectWith(body, ['email', 'password']);
  return { email: email(body.email), password: password(body.password, 1) };
}
export function validateProfile(body) {
  objectWith(body, ['fullName']);
  return { fullName: validateFullName(body.fullName) };
}
