import { collect, merge, outputRoot } from '../../scripts/coverage-support.js';

try {
  const mode = process.argv[2] ?? 'unit', base = outputRoot(process.argv[3]);
  if (mode === 'combined') await merge(base);
  else await collect(mode, base);
} catch (error) { console.error(error.message); process.exitCode = 1; }
