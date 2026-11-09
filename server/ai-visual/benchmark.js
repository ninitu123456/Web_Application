// Read-only model benchmark. No dotenv, database, Cloudinary or notifications.
import { performance } from 'node:perf_hooks';
import { createClipEncoder } from './clip-encoder.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from './config.js';

const paths = process.argv.slice(2);
if (!paths.length || paths.length > 1000) throw new Error('Usage: npm run ai-visual:benchmark -- <local image> [...]');
const started = performance.now(), initialCpu = process.cpuUsage();
let encoder;
try {
  encoder = await createClipEncoder();
  const samples = [];
  for (const path of paths) {
    const before = performance.now(), cpu = process.cpuUsage();
    const result = await encoder.embedFile(path);
    const used = process.cpuUsage(cpu);
    samples.push({ wallMs: performance.now() - before, inferenceMs: result.inferenceMs,
      cpuMs: (used.user + used.system) / 1000, rssBytes: process.memoryUsage().rss });
  }
  const cpu = process.cpuUsage(initialCpu);
  const sorted = samples.map(row => row.wallMs).sort((a, b) => a - b);
  console.log(JSON.stringify({ model: CLIP_MODEL_ID, revision: CLIP_MODEL_REVISION, device: 'cpu',
    platform: process.platform, arch: process.arch, node: process.version,
    images: samples.length, initializationMs: encoder.initializationMs, totalMs: performance.now() - started,
    totalCpuMs: (cpu.user + cpu.system) / 1000, peakRssBytes: process.resourceUsage().maxRSS * 1024,
    medianImageMs: sorted[Math.floor(sorted.length / 2)], p95ImageMs: sorted[Math.ceil(sorted.length * 0.95) - 1], samples }));
} finally { await encoder?.dispose(); }
