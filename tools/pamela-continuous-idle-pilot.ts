import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { privateConfig } from '../src/media.ts';

// Sole paid writer for this one-job pilot. No retries, auto-refunds, activation or publication.
// prepare | continuous submit|status|download
const root = fileURLToPath(new URL('../', import.meta.url));
const run = 'runs/20261109-pamela-continuous-idle';
const folder = path.join(root, run);
const owner = 'pamela-continuous-idle';
const ledgerPath = path.join(root, 'runs/20261108-pamela-deal-pilot/qa/budget-ledger.json');
const source = 'runs/20261109-pamela-reference-kit/original/pamela-vila-station.png';
const sourceHash = 'ac2924b76ebab596918fa802b6145628ee805e0b37a04d1117c8dc4f4aae2621';
const execute = promisify(execFile);
const specs = { continuous: { duration: 12, credits: 240, role: "five-idle-beats-with-anchor-returns", prompt: "One continuous 12-second locked-camera take. Preserve Pamela's mature face, fine skin detail, hair, black blazer, ivory blouse, framing and light. Start and finish in the supplied VILA pose. Perform five small, distinct idle beats in order: one gentle breath, one slow blink, a tiny eye glance left, a tiny eye glance right, then a tiny downward eye glance. After EACH beat return to the same forward-looking VILA pose, relaxed closed mouth, head centred, hands planted with identical fingers; briefly settle before the next beat. Aim for returns near 2, 4, 6, 8 and 10.5 seconds; remain calmly in VILA to 12 seconds. Movements subtle and unhurried. Keep shoulders, elbows, wrists and palms still except natural breathing. Keep the shoe and its white card stationary. Preserve the green background and tabletop. No speaking, gestures, dealing, extra objects, cuts, camera motion or face restyling. The last pose and gentle breathing phase match the first for a direct loop." } } as const;
type Name = keyof typeof specs;
type Json = Record<string, any>;
type Job = {
  schemaVersion: 1; owner: string; name: Name; run: string; model: 'wan3'; ratio: 'auto_1080p'; duration: number;
  expectedCredits: number; state: string; taskId: string | null; reservationId: string; reservedAt: string;
  prompt: string; promptSha256: string; input: { path: string; sha256: string; bytes: number; width: number; height: number; transform: string };
  poseBefore: 'VILA'; poseAfter: 'VILA'; role: string; decision: string; productionAccepted: false; activated: false;
  checkedAt?: string; submittedAt?: string; httpStatus?: number; estimatedCost?: unknown; failureCode?: string;
  output?: { path: string; sha256: string; bytes: number }; qa?: Json;
};
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const exists = (file: string) => stat(file).then(() => true).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
const jobPath = (name: Name) => path.join(folder, `${name}.json`);
const receiptPath = (name: Name) => `${run}/${name}.json`;
const names = Object.keys(specs) as Name[];

async function atomicJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
async function withLedger<T>(change: (ledger: Json) => Promise<T>): Promise<T> {
  const lock = `${ledgerPath}.lock`;
  const token = JSON.stringify({ owner, pid: process.pid, nonce: randomUUID(), createdAt: new Date().toISOString() });
  await writeFile(lock, token, { flag: 'wx' });
  try {
    const original = await readFile(ledgerPath), ledger = JSON.parse(original.toString('utf8'));
    const result = await change(ledger);
    if (sha(await readFile(ledgerPath)) !== sha(original)) throw Error('Budget journal changed concurrently; no unsafe overwrite.');
    await atomicJson(ledgerPath, ledger);
    return result;
  } finally { if (await readFile(lock, 'utf8') === token) await rm(lock); }
}
function totals(ledger: Json) {
  const jobs = ledger.jobs as Json[];
  const pending = (ledger.reservations ?? []).filter((r: Json) => r.state !== 'released' && !jobs.some(j => j.path === r.path));
  const credits = jobs.reduce((n, j) => n + Number(j.apiMaximumCredits), 0) + pending.reduce((n: number, r: Json) => n + Number(r.credits), 0) + Number(ledger.failedAttempt?.conservativeReserveCredits ?? 0);
  if (!Number.isSafeInteger(credits) || credits < 0) throw Error('Invalid existing budget entries.');
  return { credits, jobCount: jobs.length + pending.length + (ledger.failedAttempt?.conservativeReserveCredits && !ledger.failedAttempt.billingVerified ? 1 : 0), remaining: Number(ledger.approved.runwayCredits) - credits };
}
async function input() {
  const bytes = await readFile(path.join(root, source));
  if (sha(bytes) !== sourceHash || bytes.length > 3_500_000) throw Error('Input identity or size mismatch.');
  const m = await sharp(bytes).metadata();
  if (m.format !== 'png' || m.width !== 1536 || m.height !== 1024 || (m.pages ?? 1) !== 1) throw Error('Unexpected VILA image dimensions.');
  const kit = JSON.parse(await readFile(path.join(root, 'runs/20261109-pamela-reference-kit/reference-kit.json'), 'utf8'));
  if (kit.identity.dealerId !== 'pamela-pilot' || !kit.anchors.some((a: Json) => a.id === 'VILA' && a.path === source && a.sha256 === sourceHash)) throw Error('Reference kit does not bind the required VILA image.');
  return bytes;
}
async function load(name: Name): Promise<Job> {
  const job = JSON.parse(await readFile(jobPath(name), 'utf8')) as Job;
  if (job.schemaVersion !== 1 || job.owner !== owner || job.name !== name || job.run !== run || job.model !== 'wan3' || job.ratio !== 'auto_1080p' || job.duration !== specs[name].duration || job.expectedCredits !== specs[name].credits || job.input.sha256 !== sourceHash || job.promptSha256 !== sha(job.prompt) || job.prompt !== specs[name].prompt) throw Error('Pilot receipt identity mismatch.');
  return job;
}
async function prepare() {
  if (!(await privateConfig(root)).RUNWAY_API_KEY) throw Error('No local lab Runway API key configured.');
  const bytes = await input();
  const providerBinding = await verifyProvider();
  for (const name of names) if (await exists(jobPath(name))) throw Error('Pilot receipt exists; do not prepare or submit again.');
  for (const spec of Object.values(specs)) if (spec.prompt.length > 1000) throw Error('Prompt exceeds conservative 1000-character cap.');
  await mkdir(folder, { recursive: true });
  const preparedAt = new Date().toISOString();
  await writeFile(path.join(folder, 'provider-binding.json'), JSON.stringify(providerBinding, null, 2) + '\n', {flag:'wx'});
  const jobs: Job[] = names.map(name => ({ schemaVersion: 1, owner, name, run, model: 'wan3', ratio: 'auto_1080p', duration: specs[name].duration, expectedCredits: specs[name].credits, state: 'prepared-not-submitted', taskId: null, reservationId: `${owner}-${name}-v1`, reservedAt: preparedAt, prompt: specs[name].prompt, promptSha256: sha(specs[name].prompt), input: { path: source, sha256: sourceHash, bytes: bytes.length, width: 1536, height: 1024, transform: 'none; identical complete original PNG supplied at first and last positions; no resize/crop/padding' }, poseBefore: 'VILA', poseAfter: 'VILA', role: specs[name].role, decision: 'candidate-awaiting-motion-and-loop-review', productionAccepted: false, activated: false }));
  await writeFile(path.join(folder, 'model-support.json'), JSON.stringify({ verifiedAt: preparedAt, model: 'wan3', endpoint: 'https://api.dev.runwayml.com/v1/image_to_video', apiVersion: '2024-11-06', ratio: 'auto_1080p', durationRangeSeconds: [2, 30], supportsFirstAndLast: true, inputReferencesMixedWithKeyframes: false, audio: false, inputAspectRatio: 1.5, sourceUnchanged: true, source: { path: source, sha256: sourceHash }, creditsPerSecond: 20, totalReservedCredits: 240, maxJobs: 1, maxCreditsPerJob: 240, sources: ['https://docs.dev.runwayml.com/assets/inputs/', 'https://docs.dev.runwayml.com/guides/pricing/'], invoiceVerified: false }, null, 2) + '\n', { flag: 'wx' });
  await withLedger(async ledger => {
    const before = totals(ledger);
    if (ledger.approved.runwayCredits > 4000 || before.credits + 240 > Math.min(4000, ledger.approved.runwayCredits) || before.jobCount + 1 > Math.min(16, ledger.approved.maxPaidVideoJobs) || 240 > Math.min(250, ledger.approved.maxJobCredits)) throw Error('Approved budget does not cover the single job.');
    if ((ledger.reservations ?? []).some((r: Json) => r.owner === owner) || ledger.jobs.some((j: Json) => j.path.startsWith(run + '/'))) throw Error('Pilot already reserved or accepted.');
    for (const job of jobs) { await writeFile(jobPath(job.name), JSON.stringify(job, null, 2) + '\n', { flag: 'wx' }); await writeFile(path.join(folder, `${job.name}-prompt.txt`), job.prompt + '\n', { flag: 'wx' }); }
    ledger.reservations ??= [];
    for (const job of jobs) ledger.reservations.push({ id: job.reservationId, owner, path: receiptPath(job.name), model: job.model, duration: job.duration, credits: job.expectedCredits, state: 'reserved-not-submitted', taskId: null, reservedAt: preparedAt, budgetAfterReservation: { conservativeReservedCredits: before.credits + 240, remainingCredits: before.remaining - 240, jobCount: before.jobCount + 1 } });
    return before;
  });
  for (const job of jobs) { job.state = 'reserved-not-submitted'; await atomicJson(jobPath(job.name), job); }
  console.log(JSON.stringify({ state: 'reserved-not-submitted', reservations: jobs.map(j => ({ name: j.name, credits: j.expectedCredits, receipt: receiptPath(j.name), promptCharacters: j.prompt.length })), reservedCredits: 240, taskIds: [] }));
}
async function headers() {
  const key = (await privateConfig(root)).RUNWAY_API_KEY;
  if (!key) throw Error('No local lab Runway API key.');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' };
}
async function responseJson(response: Response): Promise<Json> {
  const text = await response.text();
  if (text.length > 128_000) throw Error('Unexpectedly large API response.');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Unexpected API response shape.');
  return value;
}
async function updateLedger(job: Job) {
  await withLedger(async ledger => {
    const reservation = ledger.reservations?.find((r: Json) => r.id === job.reservationId && r.owner === owner);
    if (!reservation) throw Error('Durable reservation missing.');
    Object.assign(reservation, { state: job.state, taskId: job.taskId, checkedAt: new Date().toISOString() });
    if (job.taskId) {
      const row = { path: receiptPath(job.name), taskId: job.taskId, model: job.model, state: job.state, apiMaximumCredits: Math.max(job.expectedCredits, Number((job.estimatedCost as Json)?.credits ?? 0)), owner };
      const existing = ledger.jobs.find((j: Json) => j.path === row.path);
      if (existing && existing.taskId !== job.taskId) throw Error('Existing budget task ID differs.');
      if (existing) Object.assign(existing, row); else ledger.jobs.push(row);
    }
  });
}
async function submit(name: Name) {
  const job = await load(name);
  if (job.state !== 'reserved-not-submitted' || job.taskId || await exists(path.join(folder, `${name}.task-id.json`))) throw Error('Submit already attempted or uncertain; never retry automatically.');
  const bytes = await input();
  const requestHeaders = await headers();
  await withLedger(async ledger => {
    const reservation = ledger.reservations?.find((r: Json) => r.id === job.reservationId && r.owner === owner);
    if (!reservation || reservation.state !== 'reserved-not-submitted' || reservation.credits !== job.expectedCredits) throw Error('Reservation does not authorize submission.');
    if (ledger.jobs.filter((j: Json) => j.owner === owner).some((j: Json) => j.apiMaximumCredits > 240)) throw Error('Previous job exceeded its quoted cap; do not submit further.');
    if (totals(ledger).credits > Math.min(4000, ledger.approved.runwayCredits) || totals(ledger).jobCount > Math.min(16, ledger.approved.maxPaidVideoJobs)) throw Error('Shared budget exceeded.');
    await verifyProvider();
    ledger.submissionAttempts = Number(ledger.submissionAttempts) + 1;
    job.state = 'submission-started'; job.submittedAt = new Date().toISOString();
    await atomicJson(jobPath(name), job);
    reservation.state = 'submission-started'; reservation.submittedAt = job.submittedAt;
  });
  try {
    const imageUri = `data:image/png;base64,${bytes.toString('base64')}`;
    const response = await fetch('https://api.dev.runwayml.com/v1/image_to_video', { method: 'POST', headers: requestHeaders, redirect: 'error', signal: AbortSignal.timeout(60_000), body: JSON.stringify({ model: job.model, ratio: job.ratio, duration: job.duration, audio: false, promptText: job.prompt, promptImage: [{ position: 'first', uri: imageUri }, { position: 'last', uri: imageUri }] }) });
    job.httpStatus = response.status;
    if (!response.ok) { job.state = 'http-error-no-retry'; await atomicJson(jobPath(name), job); await updateLedger(job); throw Error(`Runway HTTP ${response.status}; reservation retained, no retry.`); }
    const result = await responseJson(response);
    if (typeof result.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(result.id)) throw Error('Missing valid task ID; submission outcome unknown.');
    job.taskId = result.id;
    await writeFile(path.join(folder, `${name}.task-id.json`), JSON.stringify({ taskId: result.id, receivedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
    job.estimatedCost = result.estimatedCost ?? null; job.state = 'submitted';
    await atomicJson(jobPath(name), job); await updateLedger(job);
    console.log(JSON.stringify({ name, taskId: job.taskId, state: job.state, expectedCredits: job.expectedCredits, apiEstimatedCost: job.estimatedCost }));
  } catch (error) {
    if (job.state !== 'http-error-no-retry' && job.state !== 'submitted') job.state = 'submission-outcome-uncertain-no-retry';
    await atomicJson(jobPath(name), job).catch(() => {});
    throw error;
  }
}
async function status(job: Job) {
  if (!job.taskId || !/^[a-f0-9-]{36}$/i.test(job.taskId)) throw Error('No durable task ID; do not submit again.');
  const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${job.taskId}`, { headers: await headers(), redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error(`Task status HTTP ${response.status}.`);
  const task = await responseJson(response);
  if (task.id !== job.taskId || typeof task.status !== 'string' || !/^[A-Z_]{1,40}$/.test(task.status)) throw Error('Task identity mismatch.');
  job.state = task.status; job.checkedAt = new Date().toISOString();
  if (typeof task.failureCode === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(task.failureCode)) job.failureCode = task.failureCode;
  await atomicJson(jobPath(job.name), job); await updateLedger(job);
  return task;
}
async function download(job: Job) {
  const relative = `${run}/original/pamela-${job.name}-wan3.mp4`, destination = path.join(root, relative);
  if (await exists(destination)) { if (job.output?.path !== relative || sha(await readFile(destination)) !== job.output.sha256) throw Error('Existing output identity mismatch.'); return job.output; }
  const task = await status(job);
  if (task.status !== 'SUCCEEDED' || !Array.isArray(task.output) || task.output.length !== 1 || typeof task.output[0] !== 'string') throw Error('Task has no single completed video.');
  const url = new URL(task.output[0]);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !/(^|\.)(cloudfront\.net|runwayml\.com)$/.test(url.hostname)) throw Error('Unexpected output host.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw Error(`Download HTTP ${response.status}.`);
  if (Number(response.headers.get('content-length') ?? 0) > 100_000_000) throw Error('Output too large.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 100_000_000) { await reader.cancel(); throw Error('Output too large.'); } chunks.push(value); }
  const bytes = Buffer.concat(chunks);
  if (bytes.toString('ascii', 4, 8) !== 'ftyp') throw Error('Expected original MP4.');
  await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx' });
  job.output = { path: relative, sha256: sha(bytes), bytes: bytes.length }; await atomicJson(jobPath(job.name), job);
  return job.output;
}
async function verifyProvider() {
  const known=JSON.parse(await readFile(path.join(root,'runs/20261109-pamela-idle-pilot/breath.json'),'utf8'));
  if(known.taskId!=='1b15ecb8-04a2-4dca-b6e5-b0606adc841b'||known.input.sha256!==sourceHash)throw Error('Known pilot binding changed');
  const requestHeaders=await headers();
  const orgResponse=await fetch('https://api.dev.runwayml.com/v1/organization',{headers:requestHeaders,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!orgResponse.ok)throw Error('Organization check HTTP '+orgResponse.status);
  const org=await responseJson(orgResponse);
  if(!Number.isFinite(org.creditBalance)||org.creditBalance<240)throw Error('API balance does not cover this 240-credit job');
  const priorResponse=await fetch('https://api.dev.runwayml.com/v1/tasks/'+known.taskId,{headers:requestHeaders,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!priorResponse.ok)throw Error('Prior pilot task is unavailable to this credential');
  const prior=await responseJson(priorResponse);if(prior.id!==known.taskId||prior.status!=='SUCCEEDED')throw Error('Pilot project continuity mismatch');
  return {checkedAt:new Date().toISOString(),endpoint:'https://api.dev.runwayml.com',credentialSource:'local lab .env.local / RUNWAY_API_KEY',projectName:null,organizationId:null,identityLimit:'API does not expose project/organization identity; scope verified by exact prior Pamela task',creditBalance:org.creditBalance,priorTask:{id:prior.id,status:prior.status},connectorUsed:false};
}
async function main() {
  const [name, action] = process.argv.slice(2);
  if (name === 'prepare' && !action && process.argv.length === 3) return prepare();
  if (!Object.hasOwn(specs,name ?? '') || !['submit','status','download'].includes(action ?? '') || process.argv.length !== 4) throw Error('Usage: prepare | continuous submit|status|download');
  if (action === 'submit') return submit(name as Name);
  const job = await load(name as Name);
  if (action === 'download') { console.log(JSON.stringify(await download(job))); return; }
  await status(job); console.log(JSON.stringify({name:job.name,taskId:job.taskId,state:job.state,failureCode:job.failureCode}));
}
try { await main(); }
catch (error) { console.error(error instanceof Error ? error.message : 'Pilot failed; inspect durable receipts.'); process.exitCode = 1; }
