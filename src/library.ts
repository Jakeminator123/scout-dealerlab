import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const mediaTypes = new Set(['.mp4', '.webm', '.mov', '.png', '.jpg', '.jpeg', '.webp', '.avif']);
export const roots = ['gpt-underlag', 'extra', 'media', 'runs', 'docs', 'builds'];
export type Asset = { path: string; name: string; bytes: number; video: boolean };

export function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function safeFile(root: string, relative: string): Promise<string> {
  const parts = relative.split(/[\\/]/);
  if (!roots.includes(parts[0]) || parts.some(p => !p || p.startsWith('.') || p.includes(':') || p.includes('\0'))) throw new Error('Otillåten sökväg');
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Länkade filer visas inte');
  }
  const resolvedRoot = await realpath(root);
  const target = await realpath(path.join(root, ...parts));
  if (!inside(resolvedRoot, target) || !(await stat(target)).isFile()) throw new Error('Otillåten fil');
  return target;
}

export async function catalog(root: string): Promise<Asset[]> {
  const items: Asset[] = [];
  async function walk(relative: string) {
    if (relative === 'media/analysis' || relative === 'media/preview-cache') return;
    let entries;
    try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && mediaTypes.has(path.extname(entry.name).toLowerCase())) {
        const filename = await safeFile(root, name);
        items.push({ path: name, name: entry.name, bytes: (await stat(filename)).size, video: /\.(mp4|webm|mov)$/i.test(name) });
      }
    }
  }
  for (const folder of roots.filter(r => r !== 'docs')) await walk(folder);
  return items.sort((a, b) => a.path.localeCompare(b.path, 'sv'));
}

export async function fingerprint(root: string, relative: string) {
  if (!mediaTypes.has(path.extname(relative).toLowerCase())) throw new Error('Välj en mediefil');
  const filename = await safeFile(root, relative);
  const before = await stat(filename);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  let probe: unknown = null;
  let probeError: string | null = null;
  try {
    const result = await execute('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,pix_fmt,color_space,color_transfer,color_primaries,color_range:format=duration,size', '-of', 'json', filename], { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
    probe = JSON.parse(result.stdout);
  } catch { probeError = 'ffprobe kunde inte läsa filen; formatmetadata är okända.'; }
  const after = await stat(filename);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Filen ändrades under mätningen. Försök igen.');
  return { path: relative, sha256: hash.digest('hex'), bytes: after.size, probe, probeError };
}

// Refuse redirected output directories before writing any local experiment data.
export async function outputDirectory(root: string, relative: string) {
  const absolute = path.join(root, relative);
  const resolvedRoot = await realpath(root);
  let cursor = root;
  for (const part of relative.split('/')) {
    if (!/^[a-zA-Z0-9_-]+$/.test(part)) throw new Error('Ogiltig målmapp');
    cursor = path.join(cursor, part);
    await mkdir(cursor, { recursive: true });
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Länkade målmappar används inte');
    if (!inside(resolvedRoot, await realpath(cursor))) throw new Error('Målmappen pekar utanför arbetsytan');
  }
  return absolute;
}

export async function createExperiment(root: string, input: { title: string; source: string; reference: string; note: string }) {
  if (!input.title.trim() || input.title.length > 120 || input.note.length > 8000) throw new Error('Ange ett namn (högst 120 tecken) och en kort plan.');
  const source = await fingerprint(root, input.source);
  const reference = input.reference ? await fingerprint(root, input.reference) : null;
  const id = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + randomUUID().slice(0, 8);
  const directory = await outputDirectory(root, `runs/${id}`);
  for (const folder of ['original', 'processed', 'qa', 'export']) await outputDirectory(root, `runs/${id}/${folder}`);
  const job = { schemaVersion: 1, id, title: input.title.trim(), createdAt: new Date().toISOString(), status: 'planned-local-only', note: input.note, source, reference, generation: { provider: 'runway', model: null, prompt: null, taskId: null, seed: null, cost: null, submitted: false }, processingSteps: [] };
  await writeFile(path.join(directory, 'job.json'), JSON.stringify(job, null, 2) + '\n', { flag: 'wx' });
  return job;
}

export async function saveReview(root: string, input: { runId: string; asset: string; decision: string; note: string }) {
  if (!/^\d{14}-[a-f0-9]{8}$/.test(input.runId)) throw new Error('Välj ett giltigt försök');
  await safeFile(root, `runs/${input.runId}/job.json`);
  if (!['improved', 'unchanged', 'worse', 'unreviewed'].includes(input.decision) || !input.note.trim() || input.note.length > 8000) throw new Error('Ange beslut och observation');
  const asset = await fingerprint(root, input.asset);
  const review = { schemaVersion: 1, reviewedAt: new Date().toISOString(), decision: input.decision, note: input.note, asset, scope: 'local-visual-review-not-production-approval' };
  const directory = await outputDirectory(root, `runs/${input.runId}/qa`);
  const name = `${randomUUID()}.json`;
  await writeFile(path.join(directory, name), JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
  return `runs/${input.runId}/qa/${name}`;
}

export function byteRange(value: string | undefined, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error('Ogiltigt byteintervall');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) throw new Error('Byteintervall utanför fil');
  return { start, end };
}
