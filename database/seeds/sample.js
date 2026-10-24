import bcrypt from 'bcryptjs';
import { withLock } from '../scripts/connection.js';
import { verifyMigrations } from '../scripts/migrate.js';

export const marker = 'findit:sample:v1';
export const categoryNames = ['Thiết bị điện tử', 'Giấy tờ và thẻ', 'Chìa khóa', 'Đồ dùng cá nhân'];
export const locationNames = ['Tòa nhà A - UIT', 'Tòa nhà B - UIT', 'Thư viện UIT', 'Khuôn viên UIT'];
export const fixtures = [
  { key: 'lost-earphones', role: 'USER', title: '[Mẫu FindIT] Mất tai nghe', type: 'LOST', category: 0, location: 0, color: 'Trắng' },
  { key: 'found-earphones', role: 'ADMIN', title: '[Mẫu FindIT] Nhặt được tai nghe', type: 'FOUND', category: 0, location: 0, color: 'Trắng' },
  { key: 'lost-keys', role: 'USER', title: '[Mẫu FindIT] Mất chùm chìa khóa', type: 'LOST', category: 2, location: 2, color: null },
  { key: 'found-card', role: 'ADMIN', title: '[Mẫu FindIT] Nhặt được thẻ sinh viên', type: 'FOUND', category: 1, location: 1, color: null }
];
const fullName = (role) => `FindIT Sample ${role}`;
const description = 'Dữ liệu mẫu phục vụ phát triển FindIT, không phải thông tin thất lạc thực tế.';

async function ensureLookup(connection, table, idColumn, name, write) {
  let [rows] = await connection.execute(`SELECT ${idColumn} AS id, is_active FROM ${table} WHERE name = ?`, [name]);
  if (!rows.length && write) {
    await connection.execute(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
    [rows] = await connection.execute(`SELECT ${idColumn} AS id, is_active FROM ${table} WHERE name = ?`, [name]);
  }
  if (rows.length !== 1 || Number(rows[0].is_active) !== 1) throw new Error(`Missing/inactive seed lookup in ${table}`);
  return rows[0].id;
}

async function processSeed(connection, credentials, write) {
  const users = {};
  for (const role of ['USER', 'ADMIN']) {
    let [roles] = await connection.execute('SELECT role_id FROM roles WHERE name = ?', [role]);
    if (!roles.length && write) {
      await connection.execute('INSERT INTO roles (name) VALUES (?)', [role]);
      [roles] = await connection.execute('SELECT role_id FROM roles WHERE name = ?', [role]);
    }
    if (!roles.length) throw new Error(`Missing seed role ${role}`);
    const { email, password } = credentials[role];
    let [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length && write) {
      const hash = await bcrypt.hash(password, 12);
      await connection.execute(
        `INSERT INTO users (role_id, full_name, email, password_hash, contact_info, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [roles[0].role_id, fullName(role), email, hash, marker]);
      [rows] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
    }
    const user = rows[0];
    if (!user || user.contact_info !== marker || user.full_name !== fullName(role) ||
        String(user.role_id) !== String(roles[0].role_id) || user.account_status !== 'ACTIVE' ||
        !await bcrypt.compare(password, user.password_hash)) {
      throw new Error(`Seed ${role} account missing or conflicts with an existing account; no account is overwritten`);
    }
    users[role] = user.user_id;
  }
  const categories = [], locations = [];
  for (const name of categoryNames) categories.push(await ensureLookup(connection, 'categories', 'category_id', name, write));
  for (const name of locationNames) locations.push(await ensureLookup(connection, 'locations', 'location_id', name, write));
  for (const fixture of fixtures) {
    const identifier = `${marker}:${fixture.key}`;
    let [rows] = await connection.execute('SELECT * FROM items WHERE private_identifiers = ?', [identifier]);
    if (!rows.length && write) {
      await connection.execute(
        `INSERT INTO items (user_id, category_id, location_id, title, description, type, color, private_identifiers, event_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-10-15', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [users[fixture.role], categories[fixture.category], locations[fixture.location], fixture.title, description, fixture.type, fixture.color, identifier]);
      [rows] = await connection.execute('SELECT * FROM items WHERE private_identifiers = ?', [identifier]);
    }
    const item = rows[0];
    if (rows.length !== 1 || String(item.user_id) !== String(users[fixture.role]) ||
        String(item.category_id) !== String(categories[fixture.category]) || String(item.location_id) !== String(locations[fixture.location]) ||
        item.title !== fixture.title || item.type !== fixture.type || item.status !== 'OPEN' ||
        item.description !== description || item.color !== fixture.color || item.event_date.toISOString().slice(0, 10) !== '2026-10-15') {
      throw new Error(`Seed item ${fixture.key} missing or changed; no item is overwritten`);
    }
  }
  return { roles: 2, users: 2, categories: categories.length, locations: locations.length, items: fixtures.length };
}

export async function seed(connection, database, credentials) {
  return withLock(connection, database, async () => {
    await verifyMigrations(connection, database);
    await connection.beginTransaction();
    try {
      const result = await processSeed(connection, credentials, true);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
  });
}
export async function verifySeed(connection, database, credentials) {
  return withLock(connection, database, async () => {
    await verifyMigrations(connection, database);
    return processSeed(connection, credentials, false);
  });
}
