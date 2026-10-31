import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

async function executable(path) {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch { return false; }
}

// Resolve only an executable. The caller always supplies --no-defaults and an
// owned temporary datadir; finding an installed binary never reuses its service.
export async function resolveMysqlBinary(env = process.env, platform = process.platform) {
  if (env.MYSQLD_PATH) {
    if (!isAbsolute(env.MYSQLD_PATH) || !await executable(env.MYSQLD_PATH)) {
      throw new Error('MYSQLD_PATH must point to an existing executable using an absolute path. Use the mysqld binary from a MySQL 8.0.16+ installation or portable archive.');
    }
    return resolve(env.MYSQLD_PATH);
  }
  const filename = platform === 'win32' ? 'mysqld.exe' : 'mysqld';
  const searchPath = env.PATH ?? env.Path ?? '';
  const candidates = searchPath.split(platform === 'win32' ? ';' : ':').filter(Boolean)
    .map((directory) => join(directory.replace(/^"(.*)"$/, '$1'), filename));
  if (platform === 'win32') {
    for (const root of [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean)) {
      const mysql = join(root, 'MySQL');
      let entries;
      try { entries = await readdir(mysql, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries.filter((entry) => entry.isDirectory() && /^MySQL Server \d/.test(entry.name))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))) {
        candidates.push(join(mysql, entry.name, 'bin', filename));
      }
    }
  }
  for (const path of candidates) if (await executable(path)) return resolve(path);
  throw new Error('MySQL server executable was not found. Install/extract MySQL 8.0.16+ and set MYSQLD_PATH to its absolute bin/mysqld.exe path (or put mysqld on PATH). Only a fresh temporary database instance will be used.');
}
