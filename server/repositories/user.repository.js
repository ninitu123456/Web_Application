import { query, withConnection, databaseTimeout } from '../config/db.js';

const publicColumns = 'u.user_id, u.full_name, u.email, u.account_status, r.name AS role';
const fromUsers = 'FROM users u JOIN roles r ON r.role_id = u.role_id';
export function createUserRepository(pool) {
  return {
    async findByEmail(email) {
      const [[user]] = await query(pool, `SELECT ${publicColumns}, u.password_hash ${fromUsers} WHERE u.email = ?`, [email]);
      return user;
    },
    async findById(id) {
      const [[user]] = await query(pool, `SELECT ${publicColumns} ${fromUsers} WHERE u.user_id = ?`, [id]);
      return user;
    },
    async findUserRole() {
      const [[role]] = await query(pool, "SELECT role_id FROM roles WHERE name = 'USER'");
      return role;
    },
    async create({ roleId, fullName, email, passwordHash }) {
      // Read back by LAST_INSERT_ID on the same connection; never round BIGINT.
      return withConnection(pool, async (connection) => {
        await connection.query({
          sql: 'INSERT INTO users (role_id, full_name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())',
          timeout: databaseTimeout
        }, [roleId, fullName, email, passwordHash]);
        const [[user]] = await connection.query({
          sql: `SELECT ${publicColumns} ${fromUsers} WHERE u.user_id = LAST_INSERT_ID()`, timeout: databaseTimeout
        });
        return user;
      });
    },
    async updateFullName(id, fullName) {
      const [result] = await query(pool, 'UPDATE users SET full_name = ?, updated_at = UTC_TIMESTAMP() WHERE user_id = ?', [fullName, id]);
      return result.affectedRows;
    }
  };
}
