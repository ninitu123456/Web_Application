import { query, transaction, databaseTimeout } from '../config/db.js';

const userColumns = 'u.user_id, u.full_name, u.email, u.account_status, u.created_at, u.updated_at, r.name AS role';
const tableConfig = { categories: { table: 'categories', id: 'category_id', entity: 'CATEGORY' }, locations: { table: 'locations', id: 'location_id', entity: 'LOCATION' } };
export function createAdminRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  const repo = {
    withTransaction(operation) {
      return transaction(pool, (connection) => operation(createAdminRepository(pool, (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values))));
    },
    async dashboard() {
      const [[users]] = await execute("SELECT COUNT(*) AS total, SUM(account_status='ACTIVE') AS active, SUM(account_status='SUSPENDED') AS suspended FROM users");
      const [[items]] = await execute("SELECT COUNT(*) AS total, SUM(type='LOST') AS lost, SUM(type='FOUND') AS found, SUM(status='RETURNED') AS returned FROM items");
      const [[claims]] = await execute('SELECT COUNT(*) AS total FROM claims');
      const [[matches]] = await execute('SELECT COUNT(*) AS total FROM matches');
      const [[reports]] = await execute('SELECT COUNT(*) AS total FROM reports');
      const [itemStatuses] = await execute('SELECT status, COUNT(*) AS total FROM items GROUP BY status');
      const [claimStatuses] = await execute('SELECT status, COUNT(*) AS total FROM claims GROUP BY status');
      const [reportStatuses] = await execute('SELECT status, COUNT(*) AS total FROM reports GROUP BY status');
      const [categories] = await execute('SELECT c.category_id AS id, c.name, COUNT(i.item_id) AS total FROM categories c LEFT JOIN items i ON i.category_id=c.category_id GROUP BY c.category_id, c.name ORDER BY total DESC, c.name LIMIT 20');
      const [recentActivity] = await execute("SELECT DATE(created_at) AS date, COUNT(*) AS total FROM activity_logs WHERE created_at >= UTC_DATE() - INTERVAL 29 DAY GROUP BY DATE(created_at) ORDER BY date");
      return { users, items, claims: claims.total, matches: matches.total, reports: reports.total, itemStatuses, claimStatuses, reportStatuses, categories, recentActivity };
    },
    async listUsers(options) {
      const where = [], values = [];
      if (options.accountStatus) { where.push('u.account_status=?'); values.push(options.accountStatus); }
      if (options.role) { where.push('r.name=?'); values.push(options.role); }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const [[count]] = await execute(`SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.role_id=u.role_id${clause}`, values);
      const [rows] = await execute(`SELECT ${userColumns} FROM users u JOIN roles r ON r.role_id=u.role_id${clause} ORDER BY u.created_at DESC, u.user_id DESC LIMIT ? OFFSET ?`, [...values, options.limit, (options.page - 1) * options.limit]);
      return { rows, total: Number(count.total) };
    },
    async findUser(id) { const [[row]] = await execute(`SELECT ${userColumns} FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=?`, [id]); return row; },
    async setUserStatus(actorId, id, status) {
      return repo.withTransaction(async (source) => {
        // Serialize all status writers BEFORE locking users. A current locking
        // read after waiting sees the preceding writer's committed decision.
        const [[adminRole]] = await source.run("SELECT role_id FROM roles WHERE name='ADMIN' FOR UPDATE");
        const [accounts] = await source.run(`SELECT ${userColumns} FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.role_id=? OR u.user_id IN (?, ?) ORDER BY u.user_id FOR UPDATE`, [adminRole.role_id, actorId, id]);
        const row = accounts.find((account) => String(account.user_id) === String(id));
        const actor = accounts.find((account) => String(account.user_id) === String(actorId));
        if (!row) return undefined;
        if (String(actorId) === String(id) && row.account_status !== status) return { selfChange: true };
        if (row.role === 'ADMIN' && row.account_status === 'ACTIVE' && status !== 'ACTIVE' &&
            accounts.filter((account) => account.role === 'ADMIN' && account.account_status === 'ACTIVE').length <= 1) return { lastAdmin: true };
        if (!actor || actor.role !== 'ADMIN' || actor.account_status !== 'ACTIVE') return { actorForbidden: true };
        if (row.account_status !== status) {
          await source.run('UPDATE users SET account_status=?, updated_at=UTC_TIMESTAMP() WHERE user_id=?', [status, id]);
          await source.run("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, 'USER_STATUS_CHANGED', 'USER', ?, ?, UTC_TIMESTAMP())", [actorId, id, JSON.stringify({ previousStatus: row.account_status, status })]);
        }
        return source.findUser(id);
      });
    },
    async listLookup(kind) {
      const cfg = tableConfig[kind];
      const [rows] = await execute(`SELECT ${cfg.id}, name, is_active FROM ${cfg.table} ORDER BY name, ${cfg.id}`);
      return rows;
    },
    async createLookup(actorId, kind, input) {
      const cfg = tableConfig[kind], entity = cfg.entity;
      return repo.withTransaction(async (source) => {
        const [result] = await source.run(`INSERT INTO ${cfg.table} (name) VALUES (?)`, [input.name]);
        await source.run('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [actorId, `${entity}_CREATED`, entity, result.insertId, JSON.stringify({ name: input.name })]);
        const [[row]] = await source.run(`SELECT ${cfg.id}, name, is_active FROM ${cfg.table} WHERE ${cfg.id}=?`, [result.insertId]);
        return row;
      });
    },
    async updateLookup(actorId, kind, id, input, deactivate = false) {
      const cfg = tableConfig[kind], entity = cfg.entity;
      return repo.withTransaction(async (source) => {
        const [[row]] = await source.run(`SELECT ${cfg.id}, name, is_active FROM ${cfg.table} WHERE ${cfg.id}=? FOR UPDATE`, [id]);
        if (!row) return undefined;
        const name = input.name ?? row.name;
        const active = deactivate ? false : input.isActive ?? Boolean(Number(row.is_active));
        if (name !== row.name || active !== Boolean(Number(row.is_active))) {
          await source.run(`UPDATE ${cfg.table} SET name=?, is_active=? WHERE ${cfg.id}=?`, [name, active, id]);
          const action = !active ? `${entity}_DISABLED` : `${entity}_UPDATED`;
          await source.run('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [actorId, action, entity, id, JSON.stringify({ name, isActive: active })]);
        }
        const [[updated]] = await source.run(`SELECT ${cfg.id}, name, is_active FROM ${cfg.table} WHERE ${cfg.id}=?`, [id]);
        return updated;
      });
    },
    async run(sql, values = []) { return execute(sql, values); }
  };
  return repo;
}

