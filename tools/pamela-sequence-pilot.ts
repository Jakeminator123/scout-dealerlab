import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

// Usage: node tools/pamela-sequence-pilot.ts from-shoe|central-base submit|status|download
// No automatic retries, refunds, import or publication. Original files are never overwritten.
// central-input-contract.json: {schemaVersion:1, first:{path,sha256}, last:{path,sha256},
// source:{width,height}, prompt, cardStateBefore:{tableCardCount,description},
// cardStateAfter:{tableCardCount,description}}. Both central hand poses are REDO;
// the after image must retain exactly one additional card on the table.
const root = fileURLToPath(new URL('../', import.meta.url));
const run = 'runs/20261109-pamela-sequence';
const folder = path.join(root, run);
const planPath = path.join(root, 'references/production-plan.json');
const allowedInputRoots = [run + '/', 'runs/20261109-pamela-reference-kit/'];
const MAX_IMAGE = 3_500_000, MAX_VIDEO = 100_000_000;
const specs = {
  'from-shoe': { duration: 3, credits: 60, from: 'REDO', to: 'VILA' },
  'central-base': { duration: 6, credits: 120, from: 'REDO', to: 'REDO' },
} as const;
type Name = keyof typeof specs;
type Json = Record<string, unknown>;
type ImageInput = { path: string; sha256: string; width: number; height: number; bytes: number };
type CardState = { tableCardCount: number; description: string };
type Inputs = { first: ImageInput; last: ImageInput; firstBytes: Buffer; lastBytes: Buffer; prompt: string; cardStateBefore: CardState; cardStateAfter: CardState; contract?: { path: string; sha256: string } };
type Job = {
  schemaVersion: 1; name: Name; run: string; model: 'wan3'; ratio: 'auto_1080p'; duration: number;
  expectedCredits: number; state: string; taskId: string | null; startedAt: string;
  first: ImageInput; last: ImageInput; prompt: string; poseBefore: string; poseAfter: string;
  cardStateBefore: CardState; cardStateAfter: CardState; contract?: Inputs['contract'];
  reservation: { state: string; credits: number; before: Json; after: Json };
  decision: string; imported: false; estimatedCost?: unknown; checkedAt?: string; httpStatus?: number;
  output?: { path: string; sha256: string; bytes: number }; failureCode?: string;
};
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown, label: string): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Invalid ${label}.`);
  return value as Json;
};
const integer = (value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw Error(`Invalid ${label}.`);
  return value;
};
const nonempty = (value: unknown, label: string, max = 5000): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`Invalid ${label}.`);
  return value;
};
const exists = async (file: string) => stat(file).then(() => true).catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
async function bounded(file: string, max: number): Promise<Buffer> {
  const info = await stat(file);
  if (!info.isFile() || info.size < 1 || info.size > max) throw Error('Input file size outside permitted bounds.');
  const bytes = await readFile(file);
  if (bytes.length !== info.size || bytes.length > max) throw Error('Input changed while reading.');
  return bytes;
}
async function inputFile(relative: unknown): Promise<string> {
  const rel = nonempty(relative, 'relative input path', 500);
  if (rel.includes('\\') || path.isAbsolute(rel) || rel.includes(':') || rel.split('/').includes('..') || !allowedInputRoots.some(p => rel.startsWith(p))) throw Error('Input path outside this pilot.');
  const resolved = await realpath(path.join(root, rel)), canonicalRoot = await realpath(root);
  const canonicalRelative = path.relative(canonicalRoot, resolved).replaceAll('\\', '/');
  if (!allowedInputRoots.some(p => canonicalRelative.startsWith(p))) throw Error('Input link resolves outside this pilot.');
  return resolved;
}
async function imageInput(value: unknown, width: number, height: number): Promise<{ meta: ImageInput; bytes: Buffer }> {
  const ref = object(value, 'image reference'), relative = nonempty(ref.path, 'image path', 500);
  const expected = nonempty(ref.sha256, 'image hash', 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected) || !relative.endsWith('.png')) throw Error('A hash-bound PNG input is required.');
  const bytes = await bounded(await inputFile(relative), MAX_IMAGE);
  if (sha(bytes) !== expected) throw Error('Input image hash mismatch.');
  const meta = await sharp(bytes, { limitInputPixels: 16_777_216 }).metadata();
  if (meta.format !== 'png' || meta.width !== width || meta.height !== height || (meta.pages ?? 1) !== 1) throw Error('Source dimensions/format differ from the input contract.');
  return { meta: { path: relative, sha256: expected, width, height, bytes: bytes.length }, bytes };
}
function cardState(value: unknown): CardState {
  const state = object(value, 'card state');
  return { tableCardCount: integer(state.tableCardCount, 'table card count', 0, 100), description: nonempty(state.description, 'card-state description', 2000) };
}
async function prepare(name: Name): Promise<Inputs> {
  let first: unknown, last: unknown, width = 1536, height = 1024, prompt: string;
  let before: CardState, after: CardState, contract: Inputs['contract'];
  if (name === 'from-shoe') {
    first = { path: 'runs/20261109-pamela-reference-kit/original/pamela-redo-station.png', sha256: 'a9dd4882d84da1cc6f0fb3258d0fbd6d81fddac5a7f78efdaa225d6f9538576d' };
    last = { path: 'runs/20261109-pamela-reference-kit/original/pamela-vila-station.png', sha256: 'ac2924b76ebab596918fa802b6145628ee805e0b37a04d1117c8dc4f4aae2621' };
    before = after = { tableCardCount: 0, description: 'Single white card remains seated in the fixed black shoe; no card on the table.' };
    prompt = 'Locked camera, one continuous three-second transition between the supplied first REDO image and last VILA image. Preserve Pamela\'s exact mature face, age, hair, black blazer, ivory blouse, body scale and framing. Start with her left hand at the black shoe outlet. Without extracting or moving the white card, gently release contact and return the left hand to its exact resting position in the last VILA image. Her other hand stays in its original resting place. Her gaze calmly returns from the shoe toward the viewer. Keep the black shoe and its single white card completely stationary and unchanged. Preserve the green background and all props. Natural continuous shoulder, elbow, wrist and finger movement. Keep elbows and fingertips inside the frame. No camera movement, zoom, cut, new objects, additional cards, hand fading or extra fingers. Settle naturally into the exact final VILA pose.';
  } else {
    const relative = `${run}/central-input-contract.json`, bytes = await bounded(await inputFile(relative), 32_768);
    const data = object(JSON.parse(bytes.toString('utf8')), 'central contract');
    if (data.schemaVersion !== 1) throw Error('central-input-contract.json requires schemaVersion 1.');
    const source = object(data.source, 'source dimensions');
    width = integer(source.width, 'source width', 64, 4096); height = integer(source.height, 'source height', 64, 4096);
    first = data.first; last = data.last; prompt = nonempty(data.prompt, 'central prompt');
    before = cardState(data.cardStateBefore); after = cardState(data.cardStateAfter);
    if (after.tableCardCount !== before.tableCardCount + 1) throw Error('Central after-state must preserve one additional landed table card.');
    contract = { path: relative, sha256: sha(bytes) };
  }
  const a = await imageInput(first, width, height), b = await imageInput(last, width, height);
  if (name === 'central-base' && (a.meta.path === b.meta.path || a.meta.sha256 === b.meta.sha256)) throw Error('Central REDO endpoints require distinct card-state images; no same-anchor default.');
  return { first: a.meta, last: b.meta, firstBytes: a.bytes, lastBytes: b.bytes, prompt, cardStateBefore: before, cardStateAfter: after, contract };
}
async function atomicJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(tmp, file); }
  finally { await rm(tmp, { force: true }); }
}
async function reserve(name: Name, input: Inputs, jobPath: string): Promise<Job> {
  const lock = `${planPath}.lock`, token = JSON.stringify({ owner: 'pamela-sequence-pilot', pid: process.pid, nonce: randomUUID(), at: new Date().toISOString() });
  await writeFile(lock, token, { flag: 'wx' }); // An existing/stale lock needs inspection; never steal it.
  try {
    const original = await bounded(planPath, 1_000_000), plan = object(JSON.parse(original.toString('utf8')), 'production plan');
    const budget = object(plan.budget, 'budget'), spec = specs[name];
    const credits = integer(budget.knownReservedRunwayCredits, 'reserved credits'), jobs = integer(budget.videoJobs, 'job count');
    const attempts = integer(budget.submissionAttempts, 'submission attempts');
    const totalLimit = Math.min(2000, integer(budget.runwayCredits, 'credit limit', 1));
    const jobLimit = Math.min(16, integer(budget.maxVideoJobs, 'job limit', 1));
    const perJob = Math.min(250, integer(budget.maxCreditsPerJob, 'per-job limit', 1));
    if (credits + spec.credits > totalLimit || jobs + 1 > jobLimit || spec.credits > perJob) throw Error('Pilot budget exceeded.');
    const after = { knownReservedRunwayCredits: credits + spec.credits, videoJobs: jobs + 1, submissionAttempts: attempts + 1 };
    const job: Job = { schemaVersion: 1, name, run, model: 'wan3', ratio: 'auto_1080p', duration: spec.duration, expectedCredits: spec.credits,
      state: 'prepared-not-submitted', taskId: null, startedAt: new Date().toISOString(), first: input.first, last: input.last,
      prompt: input.prompt, poseBefore: spec.from, poseAfter: spec.to, cardStateBefore: input.cardStateBefore, cardStateAfter: input.cardStateAfter, contract: input.contract,
      reservation: { state: 'pending', credits: spec.credits, before: { knownReservedRunwayCredits: credits, videoJobs: jobs, submissionAttempts: attempts }, after },
      decision: 'candidate-awaiting-raw-motion-review-not-imported', imported: false };
    await writeFile(jobPath, JSON.stringify(job, null, 2) + '\n', { flag: 'wx' }); // Durable, non-retryable receipt before reservation/POST.
    try {
      if (sha(await bounded(planPath, 1_000_000)) !== sha(original)) throw Error('Budget changed during reservation.');
      Object.assign(budget, after, { remainingCredits: integer(budget.runwayCredits, 'credit limit') - after.knownReservedRunwayCredits });
      await atomicJson(planPath, plan);
      job.reservation.state = 'reserved'; job.state = 'submission-started'; await atomicJson(jobPath, job);
    } catch (error) {
      job.state = 'blocked-reservation-uncertain'; job.reservation.state = 'inspect-plan-before-any-further-action';
      await atomicJson(jobPath, job).catch(() => {});
      throw error; // No POST and no automatic refund/retry, including an ambiguous write outcome.
    }
    return job;
  } finally {
    if (await readFile(lock, 'utf8') === token) await rm(lock);
  }
}
async function loadJob(name: Name, jobPath: string): Promise<Job> {
  const job = object(JSON.parse((await bounded(jobPath, 64_000)).toString('utf8')), 'job receipt');
  if (job.schemaVersion !== 1 || job.name !== name || job.run !== run || job.model !== 'wan3' || job.ratio !== 'auto_1080p' || job.duration !== specs[name].duration || job.expectedCredits !== specs[name].credits || job.imported !== false) throw Error('Job identity mismatch.');
  if (typeof job.taskId !== 'string' || !/^[a-f0-9-]{36}$/i.test(job.taskId)) throw Error('No durable task ID. Inspect the existing receipt; never resubmit automatically.');
  return job as unknown as Job;
}
async function readResponse(response: Response): Promise<Json> {
  const reader = response.body?.getReader(); if (!reader) throw Error('Empty API response.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 128_000) { await reader.cancel(); throw Error('API response exceeds limit.'); } chunks.push(item.value); }
  return object(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'API response');
}
async function main(): Promise<void> {
  const arg = process.argv[2], action = process.argv[3];
  if (!Object.hasOwn(specs, arg ?? '') || !['submit', 'status', 'download'].includes(action ?? '') || process.argv.length !== 4) throw Error('Usage: from-shoe|central-base submit|status|download');
  const name = arg as Name, jobPath = path.join(folder, `${name}.json`);
  if (action === 'submit' && await exists(jobPath)) throw Error('Receipt already exists. Use its task ID/status; submission retry is forbidden.');
  const inputs = action === 'submit' ? await prepare(name) : null;
  const env = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8')), key = env.RUNWAY_API_KEY;
  if (!key) throw Error('No local Runway API key.');
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' };
  await mkdir(path.join(folder, 'original'), { recursive: true });
  if (inputs) {
    const job = await reserve(name, inputs, jobPath);
    try {
      const response = await fetch('https://api.dev.runwayml.com/v1/image_to_video', { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(60_000), body: JSON.stringify({
        model: 'wan3', ratio: 'auto_1080p', duration: specs[name].duration, audio: false, promptText: inputs.prompt,
        promptImage: [{ position: 'first', uri: `data:image/png;base64,${inputs.firstBytes.toString('base64')}` }, { position: 'last', uri: `data:image/png;base64,${inputs.lastBytes.toString('base64')}` }],
      }) });
      job.httpStatus = response.status;
      if (!response.ok) { job.state = 'http-error-no-auto-retry'; await atomicJson(jobPath, job); throw Error(`Runway HTTP ${response.status}; reservation retained.`); }
      const result = await readResponse(response);
      if (typeof result.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(result.id)) throw Error('Missing valid task ID; outcome unknown, never retry.');
      job.taskId = result.id;
      // A second small durable record preserves the returned ID even if the main receipt update fails.
      await writeFile(path.join(folder, `${name}.task-id.json`), JSON.stringify({ taskId: job.taskId, at: new Date().toISOString() }) + '\n', { flag: 'wx' });
      job.state = 'submitted'; job.estimatedCost = result.estimatedCost ?? null; await atomicJson(jobPath, job);
      console.log(JSON.stringify({ name, taskId: job.taskId, reservedCredits: specs[name].credits, decision: job.decision }));
    } catch (error) {
      if (job.state !== 'http-error-no-auto-retry') job.state = 'submission-outcome-needs-inspection';
      await atomicJson(jobPath, job).catch(() => {});
      if (job.taskId) console.error(JSON.stringify({ name, taskId: job.taskId, message: 'Preserve this task ID; do not resubmit.' }));
      throw error;
    }
    return;
  }
  const job = await loadJob(name, jobPath), output = `${run}/original/pamela-${name}-wan3.mp4`, outputPath = path.join(root, output);
  if (action === 'download' && await exists(outputPath)) {
    const bytes = await bounded(outputPath, MAX_VIDEO);
    if (job.output?.path !== output || job.output.sha256 !== sha(bytes)) throw Error('Existing original has no matching receipt; inspect it, do not overwrite.');
    console.log(JSON.stringify({ ...job.output, alreadyDownloaded: true })); return;
  }
  const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${job.taskId}`, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error(`Task status HTTP ${response.status}.`);
  const task = await readResponse(response);
  if (task.id !== job.taskId || typeof task.status !== 'string' || !/^[A-Z_]{1,40}$/.test(task.status)) throw Error('Task status identity mismatch.');
  await mkdir(path.join(root, 'private'), { recursive: true });
  await atomicJson(path.join(root, 'private', `pamela-sequence-${name}.json`), task);
  job.state = task.status; job.checkedAt = new Date().toISOString(); await atomicJson(jobPath, job);
  if (action === 'status') { console.log(JSON.stringify({ name, taskId: job.taskId, state: job.state })); return; }
  if (task.status !== 'SUCCEEDED' || !Array.isArray(task.output) || task.output.length !== 1 || typeof task.output[0] !== 'string') throw Error('No verified single completed output.');
  const url = new URL(task.output[0]);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !/(^|\.)(cloudfront\.net|runwayml\.com)$/.test(url.hostname)) throw Error('Unexpected output host.');
  const download = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!download.ok || !download.body) throw Error(`Download HTTP ${download.status}.`);
  const length = Number(download.headers.get('content-length') ?? 0);
  if (!Number.isFinite(length) || length > MAX_VIDEO) throw Error('Output exceeds file limit.');
  const reader = download.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  while (true) { const item = await reader.read(); if (item.done) break; total += item.value.length; if (total > MAX_VIDEO) { await reader.cancel(); throw Error('Output exceeds file limit.'); } chunks.push(item.value); }
  const bytes = Buffer.concat(chunks);
  if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw Error('Expected MP4 output.');
  await writeFile(outputPath, bytes, { flag: 'wx' });
  job.output = { path: output, sha256: sha(bytes), bytes: bytes.length }; job.decision = 'candidate-awaiting-raw-motion-review-not-imported';
  await atomicJson(jobPath, job); console.log(JSON.stringify(job.output));
}
await main();
