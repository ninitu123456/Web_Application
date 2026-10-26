const eligible = new Set(['OPEN', 'CLAIM_PENDING', 'CLAIMED']);
const invalid = () => { throw new TypeError('Invalid matching Item'); };
function identifier(value) {
  if (!((typeof value === 'string' && /^[1-9]\d*$/.test(value)) || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0))) invalid();
  if (BigInt(value) > 18446744073709551615n) invalid();
  return String(value);
}
function day(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) invalid();
    value = value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1000) invalid();
  return date.getTime() / 86400000;
}
function words(title, description) {
  for (const text of [title, description]) if (text != null && typeof text !== 'string') invalid();
  return new Set(`${title ?? ''} ${description ?? ''}`.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ').split(/\s+/u).filter(Boolean));
}
export function matchingItem(item) {
  if (!item || typeof item !== 'object' || !['LOST', 'FOUND'].includes(item.type) || !eligible.has(item.status)) invalid();
  return {
    id: identifier(item.id), type: item.type,
    category: identifier(item.categoryId), location: identifier(item.locationId),
    day: day(item.eventDate), words: words(item.title, item.description)
  };
}
export function calculateMatchScore(first, second) {
  const a = matchingItem(first), b = matchingItem(second);
  if (a.id === b.id || a.type === b.type) invalid();
  const c = a.category === b.category ? 100 : 0;
  const l = a.location === b.location ? 100 : 0;
  const d = 100 * Math.max(0, 1 - Math.abs(a.day - b.day) / 30);
  const intersection = [...a.words].filter((word) => b.words.has(word)).length;
  const union = a.words.size + b.words.size - intersection;
  const t = union ? 100 * intersection / union : 0;
  const reasons = [];
  if (c) reasons.push('Cùng danh mục');
  if (l) reasons.push('Cùng địa điểm');
  if (d) reasons.push('Thời gian xảy ra gần nhau');
  if (t) reasons.push('Nội dung có từ ngữ tương đồng');
  return { score: Math.round((0.30 * c + 0.20 * l + 0.20 * d + 0.30 * t + Number.EPSILON) * 100) / 100, reasons };
}
