import { isDeepStrictEqual } from 'node:util';
import { tables, metadata, indexes } from '../schema.js';

function expectedColumn(definition) {
  const type = definition.match(/^(ENUM\([^)]*\)|[A-Z]+(?:\(\d+(?:,\d+)?\))?(?: UNSIGNED)?)/)[0];
  const defaultMatch = definition.match(/DEFAULT (?:'([^']*)'|(TRUE|FALSE|\d+))/);
  return {
    type: type.replace('BOOLEAN', 'TINYINT(1)').toLowerCase(),
    nullable: !definition.includes('NOT NULL'),
    default: defaultMatch ? (defaultMatch[1] ?? ({ TRUE: '1', FALSE: '0' }[defaultMatch[2]] ?? defaultMatch[2])) : null,
    extra: definition.includes('AUTO_INCREMENT') ? 'auto_increment' : ''
  };
}
// Compare boolean structure, preserving operator precedence. MySQL adds
// redundant parentheses, charset introducers and escaped quotes to its output.
export function normalizeCheck(expression) {
  const source = expression.replace(/\\'/g, "'").replace(/_utf8mb4/gi, '').replace(/`/g, '');
  const tokens = [];
  const pattern = /\s*('(?:''|[^'])*'|[a-zA-Z_][a-zA-Z0-9_]*|\d+(?:\.\d+)?|>=|<=|<>|=|\(|\))/y;
  let offset = 0;
  while (offset < source.trimEnd().length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error('Unsupported CHECK expression; manual review required');
    const token = match[1];
    tokens.push(token.startsWith("'") ? token : /^\d/.test(token) ? String(Number(token)) : token.toLowerCase());
    offset = pattern.lastIndex;
  }
  let position = 0;
  const take = () => {
    if (position >= tokens.length) throw new Error('Incomplete CHECK expression');
    return tokens[position++];
  };
  const expect = (token) => { if (take() !== token) throw new Error('Unexpected CHECK expression'); };
  const merge = (operator, nodes) => nodes.length === 1 ? nodes[0] :
    [operator, ...nodes.flatMap((node) => node[0] === operator ? node.slice(1) : [node])];
  function atom() {
    if (tokens[position] === '(') { take(); const result = or(); expect(')'); return result; }
    const left = take(), operator = take();
    if (operator === 'is') {
      const negate = tokens[position] === 'not';
      if (negate) take();
      expect('null');
      return [negate ? 'is not null' : 'is null', left];
    }
    if (!['=', '>=', '<=', '<>'].includes(operator)) throw new Error('Unsupported CHECK operator');
    return [operator, left, take()];
  }
  function and() {
    const nodes = [atom()];
    while (tokens[position] === 'and') { take(); nodes.push(atom()); }
    return merge('and', nodes);
  }
  function or() {
    const nodes = [and()];
    while (tokens[position] === 'or') { take(); nodes.push(and()); }
    return merge('or', nodes);
  }
  const result = or();
  if (position !== tokens.length) throw new Error('Trailing CHECK tokens');
  return JSON.stringify(result);
}
export async function listTables(connection, database) {
  const [rows] = await connection.execute(
    'SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation, TABLE_TYPE AS kind FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?', [database]);
  return rows;
}
export async function inspectTable(connection, database, table, { allowPendingAdditiveIndexes = false } = {}) {
  const problems = [];
  const [columns] = await connection.execute(
    'SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS value_default, EXTRA AS extra, COLLATION_NAME AS collation FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [database, table.name]);
  if (!isDeepStrictEqual(columns.map((c) => c.name), Object.keys(table.columns))) problems.push('column names/order');
  for (const column of columns) {
    if (!table.columns[column.name]) continue;
    const expected = expectedColumn(table.columns[column.name]);
    const actual = { type: column.type.toLowerCase(), nullable: column.nullable === 'YES',
      default: column.value_default === null ? null : String(column.value_default), extra: column.extra.toLowerCase() };
    if (!isDeepStrictEqual(expected, actual)) problems.push(`column ${column.name}`);
    if (column.collation !== null && column.collation !== 'utf8mb4_0900_ai_ci') problems.push(`collation ${column.name}`);
  }
  const [stats] = await connection.execute(
    'SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, COLUMN_NAME AS column_name, SEQ_IN_INDEX AS position, SUB_PART AS prefix_length, INDEX_TYPE AS index_type, IS_VISIBLE AS visible FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX', [database, table.name]);
  const actualIndexes = {};
  for (const index of stats) {
    actualIndexes[index.name] ??= { unique: Number(index.non_unique) === 0, columns: [] };
    actualIndexes[index.name].columns.push(index.column_name);
    if (index.prefix_length !== null || index.index_type !== 'BTREE' || index.visible !== 'YES') problems.push(`index options ${index.name}`);
  }
  const expectedIndexes = { ...indexes(table) };
  let additiveIndexes = {};
  if (table.name === 'items') {
    additiveIndexes = {
      idx_items_status_event_date: { unique: false, columns: ['status', 'event_date'] },
      idx_items_type_status: { unique: false, columns: ['type', 'status'] },
      idx_items_created_at: { unique: false, columns: ['created_at'] }
    };
    if (allowPendingAdditiveIndexes) {
      for (const [name, definition] of Object.entries(additiveIndexes)) {
        if (actualIndexes[name] && !isDeepStrictEqual(actualIndexes[name], definition)) problems.push(`index ${name}`);
      }
      additiveIndexes = Object.fromEntries(Object.entries(additiveIndexes).filter(([name]) => actualIndexes[name]));
    }
    Object.assign(expectedIndexes, additiveIndexes);
  }
  if (!isDeepStrictEqual(expectedIndexes, actualIndexes)) problems.push('indexes/primary/unique');
  const [keys] = await connection.execute(
    `SELECT k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS column_name, k.REFERENCED_TABLE_NAME AS target_table,
      k.REFERENCED_COLUMN_NAME AS target_column, k.REFERENCED_TABLE_SCHEMA AS target_schema, r.DELETE_RULE AS on_delete, r.UPDATE_RULE AS on_update
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
       ON k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME = r.CONSTRAINT_NAME AND k.TABLE_NAME = r.TABLE_NAME
     WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ?`, [database, table.name]);
  const actualKeys = {};
  for (const key of keys) {
    if (actualKeys[key.name]) problems.push(`composite FK ${key.name}`);
    actualKeys[key.name] = { column: key.column_name, table: key.target_table, target: key.target_column };
    if (key.target_schema !== database || key.on_delete !== 'RESTRICT' || key.on_update !== 'RESTRICT') problems.push(`FK rules ${key.name}`);
  }
  if (!isDeepStrictEqual(table.foreign ?? {}, actualKeys)) problems.push('foreign keys');
  const [checks] = await connection.execute(
    `SELECT t.CONSTRAINT_NAME AS name, c.CHECK_CLAUSE AS clause, t.ENFORCED AS enforced
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS t JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS c
       ON t.CONSTRAINT_SCHEMA = c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME = c.CONSTRAINT_NAME
     WHERE t.TABLE_SCHEMA = ? AND t.TABLE_NAME = ? AND t.CONSTRAINT_TYPE = 'CHECK'`, [database, table.name]);
  const actualChecks = Object.fromEntries(checks.map((c) => [c.name, normalizeCheck(c.clause)]));
  const expectedChecks = Object.fromEntries(Object.entries(table.checks ?? {}).map(([name, clause]) => [name, normalizeCheck(clause)]));
  if (!isDeepStrictEqual(actualChecks, expectedChecks) || checks.some((c) => c.enforced !== 'YES')) {
    problems.push(`CHECK constraints (actual ${JSON.stringify(actualChecks)}, expected ${JSON.stringify(expectedChecks)})`);
  }
  const [triggers] = await connection.execute('SELECT TRIGGER_NAME FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?', [database, table.name]);
  if (triggers.length) problems.push('unexpected triggers');
  return problems.map((problem) => `${table.name}: ${problem}`);
}
export async function assertExistingSchema(connection, database, { complete = false, allowPendingAdditiveIndexes = false } = {}) {
  const expected = new Map([...tables, metadata].map((table) => [table.name, table]));
  const existing = await listTables(connection, database);
  const problems = [];
  for (const table of existing) {
    if (!expected.has(table.name)) { problems.push(`unexpected table/view ${table.name}`); continue; }
    if (table.kind !== 'BASE TABLE' || table.engine !== 'InnoDB' || table.collation !== 'utf8mb4_0900_ai_ci') problems.push(`${table.name}: storage options`);
    problems.push(...await inspectTable(connection, database, expected.get(table.name), { allowPendingAdditiveIndexes }));
  }
  if (complete) for (const name of expected.keys()) if (!existing.some((table) => table.name === name)) problems.push(`missing table ${name}`);
  if (problems.length) throw new Error(`Schema mismatch; refusing changes:\n${problems.join('\n')}`);
  return existing.map((table) => table.name);
}
