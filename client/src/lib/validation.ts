export const utf8Bytes = (value: string) =>
  new TextEncoder().encode(value).length;
export const characters = (value: string) => Array.from(value).length;
export function validEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    characters(normalized) <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  );
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
