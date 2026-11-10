import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inside, outputDirectory, safeFile } from './library.ts';

type Entry = { frame: number; sha256: string; lastUsed: number };
type Policy = { enabled: boolean; maxFramesPerSource: number; minimumAgeMinutes: number; pinnedFrames: string[] };
const queues = new Map<string, Promise<unknown>>();
const defaults: Policy = { enabled: false, maxFramesPerSource: 20, minimumAgeMinutes: 60, pinnedFrames: [] };

async function checked(root: string, relative: string) {
  const resolvedRoot = await realpath(root);
  let cursor = root;
  for (const part of relative.split('/')) {
    if (!part || part === '..' || part.startsWith('.') || part.includes('\\') || part.includes(':')) throw Error('Unsafe cache path');
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw Error('Linked cache paths are not allowed');
  }
  const resolved = await realpath(cursor);
  if (!inside(resolvedRoot, resolved)) throw Error('Cache path escaped workspace');
  return resolved;
}

export async function previewPolicy(root: string): Promise<Policy> {
  let value;
  try { value = JSON.parse(await readFile(await checked(root, 'references/media-retention.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...defaults }; throw error; }
  if (typeof value.enabled !== 'boolean' || !Number.isInteger(value.maxFramesPerSource) || value.maxFramesPerSource < 1 || value.maxFramesPerSource > 500 || !Number.isFinite(value.minimumAgeMinutes) || value.minimumAgeMinutes < 1 || !Array.isArray(value.pinnedFrames) || value.pinnedFrames.some((p: unknown) => typeof p !== 'string')) throw Error('Invalid preview retention policy');
  return value;
}

async function evidence(root: string): Promise<string> {
  const text: string[] = [];
  async function walk(relative: string) {
    let entries;
    try { entries = await readdir(await checked(root, relative), { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw Error('Linked evidence directory requires manual cache review');
      if (entry.name.startsWith('.')) continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (/\.(md|json|txt)$/i.test(entry.name)) text.push(await readFile(await checked(root, child), 'utf8'));
    }
  }
  for (const directory of ['docs', 'references', 'runs']) await walk(directory);
  // JSON can escape separators; Markdown and manifests can use Windows paths.
  return text.join('\n').replace(/\\+/g, '/');
}

async function maintain(root: string, sourceHash: string, currentFrame: number) {
  if (!/^[a-f0-9]{64}$/.test(sourceHash) || !Number.isSafeInteger(currentFrame) || currentFrame < 0) throw Error('Invalid preview cache identity');
  const directory = `media/preview-cache/${sourceHash}`;
  await outputDirectory(root, directory);
  const indexPath = `${directory}/index.json`;
  let index: { schemaVersion: number; sourceSha256: string; frames: Entry[] } = { schemaVersion: 1, sourceSha256: sourceHash, frames: [] };
  try { index = JSON.parse(await readFile(await checked(root, indexPath), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (index.schemaVersion !== 1 || index.sourceSha256 !== sourceHash || !Array.isArray(index.frames) || index.frames.some(e => !Number.isSafeInteger(e.frame) || e.frame < 0 || !/^[a-f0-9]{64}$/.test(e.sha256) || !Number.isFinite(e.lastUsed)) || new Set(index.frames.map(e => e.frame)).size !== index.frames.length) throw Error('Invalid preview cache manifest');
  const file = `${directory}/frame-${currentFrame}.png`;
  const digest = createHash('sha256').update(await readFile(await safeFile(root, file))).digest('hex');
  const now = Date.now();
  index.frames = index.frames.filter(e => e.frame !== currentFrame);
  index.frames.push({ frame: currentFrame, sha256: digest, lastUsed: now });
  const policy = await previewPolicy(root);
  const documents = await evidence(root);
  const newest = [...index.frames].sort((a, b) => b.lastUsed - a.lastUsed);
  const keep = new Set(newest.slice(0, policy.maxFramesPerSource).map(e => e.frame));
  const candidates: string[] = [], deleted: string[] = [];
  for (const entry of newest) {
    const relative = `${directory}/frame-${entry.frame}.png`;
    if (keep.has(entry.frame) || now - entry.lastUsed < policy.minimumAgeMinutes * 60000 || policy.pinnedFrames.includes(relative) || documents.includes(relative)) continue;
    let filename: string;
    try { filename = await checked(root, relative); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (!(await lstat(filename)).isFile()) continue;
    const currentDigest = createHash('sha256').update(await readFile(filename)).digest('hex');
    if (currentDigest !== entry.sha256) continue; // Never delete modified or unowned bytes.
    candidates.push(relative);
    if (policy.enabled) {
      // Revalidate the exact file and ancestors immediately before deleting one owned cache file.
      await unlink(await checked(root, relative));
      deleted.push(relative);
      index.frames = index.frames.filter(e => e.frame !== entry.frame);
    }
  }
  const temporary = `${directory}/index-${randomUUID()}.json`;
  await writeFile(path.join(root, temporary), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
  try {
    try { await checked(root, indexPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rename(await checked(root, temporary), path.join(root, indexPath));
  } finally { await unlink(path.join(root, temporary)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return { enabled: policy.enabled, limit: policy.maxFramesPerSource, candidates, deleted };
}

export async function maintainPreviewFrames(root: string, sourceHash: string, currentFrame: number) {
  const key = `${root}|${sourceHash}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(() => maintain(root, sourceHash, currentFrame));
  queues.set(key, work);
  try { return await work; } finally { if (queues.get(key) === work) queues.delete(key); }
}
