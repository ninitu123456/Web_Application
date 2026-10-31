import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { resolveMysqlBinary } from '../scripts/mysql-binary.js';

test('isolated MySQL requires a valid explicit binary and never silently falls back', async () => {
  await assert.rejects(() => resolveMysqlBinary({ MYSQLD_PATH: 'relative/mysqld.exe' }), /absolute path/);
  await assert.rejects(() => resolveMysqlBinary({ MYSQLD_PATH: join(tmpdir(), 'nonexistent-findit-mysqld.exe'), PATH: process.env.PATH }), /MYSQLD_PATH/);
  await assert.rejects(() => resolveMysqlBinary({ PATH: '' }), /MYSQLD_PATH/);
});

test('isolated MySQL discovers PATH and versioned Windows installations, and honors explicit override', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'findit-binary-test-'));
  try {
    const bin = join(directory, 'MySQL', 'MySQL Server 8.4', 'bin');
    await mkdir(bin, { recursive: true });
    const binary = join(bin, 'mysqld.exe');
    await writeFile(binary, 'test executable placeholder'); await chmod(binary, 0o700);
    assert.equal(await resolveMysqlBinary({ PATH: bin }, 'win32'), binary);
    assert.equal(await resolveMysqlBinary({ Path: `"${bin}"` }, 'win32'), binary);
    assert.equal(await resolveMysqlBinary({ ProgramFiles: directory }, 'win32'), binary);
    assert.equal(await resolveMysqlBinary({ MYSQLD_PATH: binary, PATH: '' }), binary);
    await assert.rejects(() => resolveMysqlBinary({ MYSQLD_PATH: bin }), /MYSQLD_PATH/);
  } finally {
    const target = resolve(directory), child = relative(resolve(tmpdir()), target);
    assert.ok(child.startsWith('findit-binary-test-') && !child.includes(sep) && !isAbsolute(child));
    await rm(target, { recursive: true, force: true });
  }
});
