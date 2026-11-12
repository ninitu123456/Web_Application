import { readdir, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';

function within(root, target) {
  const path = relative(root, target);
  if (isAbsolute(path) || path === '..' || path.startsWith('..' + sep)) throw new Error('Corpus paths must stay inside the supplied directory');
}

// Each query photograph is a separate LOST item. Each gallery object is one
// FOUND item with up to five views; relevance is labelled physical object ID.
export async function readAiCorpus(directory) {
  const root = await realpath(resolve(directory)), items = [];
  for (const kind of ['queries', 'gallery']) {
    const parent = await realpath(resolve(root, kind)); within(root, parent);
    const groups = (await readdir(parent, { withFileTypes: true })).filter(entry => !entry.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of groups) {
      if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.name)) throw new Error('Object IDs must be directories named with letters, digits, underscore or hyphen');
      const group = await realpath(resolve(parent, entry.name)); within(root, group);
      const names = (await readdir(group)).filter(name => !name.startsWith('.')).sort();
      if (!names.length || names.length > 5) throw new Error('Each object directory requires 1-5 JPEG, PNG or WebP photographs');
      const images = [];
      for (const name of names) {
        if (!/\.(jpe?g|png|webp)$/i.test(name)) throw new Error('Corpus supports JPEG, PNG and WebP files only');
        const path = await realpath(resolve(group, name)); within(root, path);
        const info = await stat(path);
        if (!info.isFile() || info.size < 1 || info.size > 5 * 1024 * 1024) throw new Error('Each corpus image must be a nonempty file up to 5 MiB');
        images.push(path);
      }
      if (kind === 'queries') for (const [index, image] of images.entries()) items.push({ id: `q-${entry.name}-${index}`, objectId: entry.name, type: 'LOST', images: [image] });
      else items.push({ id: `g-${entry.name}`, objectId: entry.name, type: 'FOUND', images });
    }
  }
  if (!items.some(item => item.type === 'LOST') || !items.some(item => item.type === 'FOUND') || items.length > 60 || items.reduce((n, item) => n + item.images.length, 0) > 100) {
    throw new Error('Corpus requires queries and gallery, at most 60 items and 100 images');
  }
  return items;
}

export function retrievalMetrics(items, predictions, ks = [1, 3]) {
  const gallery = items.filter(item => item.type === 'FOUND');
  const queries = items.filter(item => item.type === 'LOST').map(query => {
    const relevant = new Set(gallery.filter(item => item.objectId === query.objectId).map(item => item.id));
    const ranking = predictions[query.id] ?? [];
    if (new Set(ranking.map(item => item.id)).size !== ranking.length || ranking.some(item => !gallery.some(g => g.id === item.id) || !Number.isFinite(item.cosineScore) || item.cosineScore < -1.00001 || item.cosineScore > 1.00001)) throw new Error('Invalid or duplicate retrieval result');
    const atK = Object.fromEntries(ks.map(k => {
      if (!Number.isSafeInteger(k) || k < 1) throw new Error('K must be a positive integer');
      const hits = ranking.slice(0, k).filter(item => relevant.has(item.id)).length;
      return [k, { precision: hits / k, recall: relevant.size ? hits / relevant.size : null }];
    }));
    return { id: query.id, objectId: query.objectId, relevantCount: relevant.size, ranking, atK };
  });
  const atK = Object.fromEntries(ks.map(k => {
    const eligible = queries.filter(query => query.relevantCount > 0);
    return [k, { precision: queries.length ? queries.reduce((sum, query) => sum + query.atK[k].precision, 0) / queries.length : null,
      recall: eligible.length ? eligible.reduce((sum, query) => sum + query.atK[k].recall, 0) / eligible.length : null }];
  }));
  return { queryCount: queries.length, galleryCount: gallery.length, queriesWithoutRelevantGallery: queries.filter(query => !query.relevantCount).length,
    definition: 'Macro averages; Precision@K divides by K including unfilled slots; Recall@K excludes queries with no relevant gallery item. Physical object IDs define relevance. Cosine is not a probability.', atK, queries };
}

export async function createSyntheticAiCorpus(root) {
  const { default: sharp } = await import('sharp');
  for (const [kind, object, file, angle] of [
    ['queries', 'bag-a', 'front.png', 0], ['queries', 'bag-a', 'angled.png', 14],
    ['queries', 'bottle-a', 'front.png', 0], ['gallery', 'bag-a', 'view.png', -12],
    ['gallery', 'bag-a', 'front.png', 0], ['gallery', 'bag-b', 'lookalike.png', 7],
    ['gallery', 'bottle-a', 'view.png', 12]
  ]) {
    const folder = resolve(root, kind, object); await mkdir(folder, { recursive: true });
    const shape = object.startsWith('bag')
      ? `<path d="M145 100 C145 35 255 35 255 100" fill="none" stroke="#24352c" stroke-width="20"/><rect x="95" y="90" width="210" height="260" rx="45" fill="${object === 'bag-a' ? '#29794f' : '#406c62'}"/><rect x="130" y="225" width="140" height="90" rx="20" fill="#9ab983"/><path d="M140 165 H260" stroke="#dac47b" stroke-width="10"/>`
      : '<rect x="175" y="35" width="50" height="50" rx="10" fill="#555"/><rect x="140" y="80" width="120" height="290" rx="40" fill="#2879c4"/><rect x="140" y="160" width="120" height="100" fill="#c3dfec"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="420"><rect width="400" height="420" fill="#f0eee8"/><g transform="rotate(${angle} 200 210)">${shape}</g></svg>`;
    await writeFile(resolve(folder, file), await sharp(Buffer.from(svg)).png().toBuffer());
  }
}
