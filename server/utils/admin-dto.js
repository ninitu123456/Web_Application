function safeId(value) { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Admin ID cannot be represented safely in the API'); return id; }
const timestamp = (value) => value instanceof Date ? value.toISOString() : value ?? null;
export function adminUserDto(row) { return { id: safeId(row.user_id), fullName: row.full_name, email: row.email, role: row.role, accountStatus: row.account_status, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) }; }
export function lookupDto(row, idColumn) { return { id: safeId(row[idColumn]), name: row.name, isActive: Boolean(Number(row.is_active)) }; }
export function dashboardNumber(value) { const number = Number(value ?? 0); if (!Number.isSafeInteger(number) || number < 0) throw new Error('Admin aggregate cannot be represented safely in the API'); return number; }
