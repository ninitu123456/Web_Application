import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export function configFromEnv(env = process.env) {
  if (!env.DB_USER || env.DB_PASSWORD === undefined) {
    throw new Error('Missing DB_USER / DB_PASSWORD. Configure the local .env using .env.example.');
  }
  const port = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DB_PORT');
  const database = env.DB_NAME || 'findit_db';
  if (database !== 'findit_db') throw new Error('DB_NAME must be findit_db; integration tests generate their own database name.');
  return {
    host: env.DB_HOST || '127.0.0.1', port, user: env.DB_USER, password: env.DB_PASSWORD, database,
    charset: 'utf8mb4', timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true,
    multipleStatements: false, connectTimeout: 10000
  };
}
export function seedConfig(env = process.env) {
  const result = {};
  for (const role of ['ADMIN', 'USER']) {
    const email = env[`SEED_${role}_EMAIL`];
    const password = env[`SEED_${role}_PASSWORD`];
    if (!email || !password) throw new Error(`Missing SEED_${role}_EMAIL / SEED_${role}_PASSWORD`);
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid SEED_${role}_EMAIL`);
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error(`SEED_${role}_PASSWORD must have at most 72 UTF-8 bytes (bcrypt limit)`);
    }
    result[role] = { email, password };
  }
  if (result.ADMIN.email.toLowerCase() === result.USER.email.toLowerCase()) throw new Error('Seed emails must be different');
  return result;
}
