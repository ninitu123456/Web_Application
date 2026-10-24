import { configFromEnv, seedConfig } from './config.js';
import { connect, initialize } from './connection.js';
import { migrate, verifyMigrations } from './migrate.js';
import { seed, verifySeed } from '../seeds/sample.js';

let connection;
try {
  const command = process.argv[2];
  if (!['init', 'migrate', 'seed', 'setup', 'verify'].includes(command)) throw new Error('Unknown database command');
  const config = configFromEnv();
  // Validate all seed inputs before setup creates a database or applies DDL.
  const credentials = ['setup', 'seed', 'verify'].includes(command) ? seedConfig() : null;
  connection = await connect(config, !['init', 'setup'].includes(command));
  if (['init', 'setup'].includes(command)) {
    await initialize(connection, config.database);
    console.log(`Database ready: ${config.database}`);
  }
  if (['setup', 'migrate'].includes(command)) console.log(`Applied migrations: ${await migrate(connection, config.database)}`);
  if (['setup', 'seed'].includes(command)) console.log('Seed verified:', await seed(connection, config.database, credentials));
  if (['setup', 'verify'].includes(command)) {
    await verifyMigrations(connection, config.database);
    console.log('Schema PASS: 11 business tables + _schema_migrations');
    console.log('Seed PASS:', await verifySeed(connection, config.database, credentials));
  }
} catch (error) {
  console.error(`Database command failed${error.code ? ` (${error.code})` : ''}: ${error.message}`);
  process.exitCode = 1;
} finally { if (connection) await connection.end(); }
