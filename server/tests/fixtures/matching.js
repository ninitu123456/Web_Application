export const baseItem = { id: 1, type: 'LOST', status: 'OPEN', categoryId: 1, locationId: 1, eventDate: '2026-01-01', title: 'tai nghe', description: 'màu trắng' };
export const matchCases = [
  { name: 'exact', change: {}, score: 100, reasons: 4 },
  { name: 'different category', change: { categoryId: 2 }, score: 70, reasons: 3 },
  { name: 'different location', change: { locationId: 2 }, score: 80, reasons: 3 },
  { name: '15 days', change: { eventDate: '2026-01-16' }, score: 90, reasons: 4 },
  { name: '30 day boundary', change: { eventDate: '2026-01-31' }, score: 80, reasons: 3 },
  { name: 'beyond window', change: { eventDate: '2026-03-01' }, score: 80, reasons: 3 },
  // Intersection {tai, nghe}, union {tai, nghe, mau-with-accent, trang-with-accent, den-with-accent}: T=40.
  { name: 'partial text', change: { title: 'tai nghe', description: 'đen' }, score: 82, reasons: 4 },
  { name: 'no shared text', change: { title: 'ví', description: 'đen' }, score: 70, reasons: 3 },
  { name: 'threshold exactly', change: { eventDate: '2026-01-31', title: '', description: null }, score: 50, reasons: 2 },
  { name: 'below threshold', change: { categoryId: 2, title: '', description: '' }, score: 40, reasons: 2 },
  { name: 'mismatch', change: { categoryId: 2, locationId: 2, eventDate: '2026-03-01', title: 'ví', description: 'đen' }, score: 0, reasons: 0 }
];
