import mysql from 'mysql2/promise';
import { quote } from '../schema.js';

export async function connect(config, selectDatabase = true) {
  const options = { ...config };
  if (!selectDatabase) delete options.database;
  const connection = await mysql.createConnection(options);
  try {
    const [[server]] = await connection.query('SELECT VERSION() AS version');
    const [major, minor, patch] = server.version.split('.').map(Number);
    if (/mariadb/i.test(server.version) || major < 8 || (major === 8 && minor === 0 && patch < 16)) {
      throw new Error('MySQL >= 8.0.16 is required for enforced CHECK constraints');
    }
    await connection.query("SET SESSION time_zone = '+00:00'");
    await connection.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    return connection;
  } catch (error) { await connection.end(); throw error; }
}
export async function initialize(connection, database) {
  const [rows] = await connection.execute(
    'SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
  if (rows.length && (rows[0].charset !== 'utf8mb4' || rows[0].collation !== 'utf8mb4_0900_ai_ci')) {
    throw new Error('Existing database has incompatible charset/collation; no changes made');
  }
  if (!rows.length) await connection.query(`CREATE DATABASE ${quote(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await connection.query(`USE ${quote(database)}`);
}
export async function withLock(connection, database, task) {
  const name = `findit:${database}`;
  const [[row]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [name]);
  if (Number(row.acquired) !== 1) throw new Error('Could not acquire database setup lock');
  try { return await task(); }
  finally { await connection.execute('SELECT RELEASE_LOCK(?)', [name]); }
}
