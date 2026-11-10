/** One approved, hash-bound Runway Dev Gen-4 Image POST. Status and original download are separate. */
import { lstat, mkdir, mkdtemp, open, readFile, rename, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import sharp from 'sharp';
import { readVerifiedDealerReferencePlan } from './dealer-reference-plan.ts';
import { hash, type Ref } from './dealer-video-job.ts';

const API = 'https://api.dev.runwayml.com';
const VERSION = '2024-11-06';
const ENDPOINT = '/v1/text_to_image';
const CREDITS = 8;
const MAX_OUTPUT_BYTES = 16_000_000;
const SHA = /^[0-9a-f]{64}$/;
const TASK_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const OUTPUT_HOST = 'dnznrvs05pmza.cloudfront.net'; // Runway Dev API Outputs reference.
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const now = () => new Date().toISOString();
const acceptance = { visualQaPending: true, productionAccepted: false } as const;
type Runtime = { fetcher: typeof fetch; getApiKey: () => Promise<string> };
type Loaded = Awaited<ReturnType<typeof load>>;
type JobTask = { taskId: string; planSha256: string; intentSha256: string; receivedAt: string; estimatedCredits: number | null; costAnomaly: boolean };

class JobError extends Error {}
function requireJob(condition: unknown, message: string): asserts condition {
  if (!condition) throw new JobError(message);
}
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const code = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;
async function stat(file: string) {
  try { return await lstat(file); }
  catch (error) { if (code(error) === 'ENOENT') return null; throw error; }
}
async function fileBytes(file: string) {
  const info = await stat(file);
  if (!info) return null;
  requireJob(info.isFile() && !info.isSymbolicLink(), 'Job artifacts must be regular local files');
  return readFile(file);
}
function parse(bytes: Buffer, message: string) {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new JobError(message); }
  const parsed = object(value);
  requireJob(parsed, message);
  return parsed;
}
function verifyRef(ref: Ref) {
  requireJob(SHA.test(ref.sha256) && /^runs\/.+\/.+\.json$/.test(ref.path) && !/[\\:<>|?*\x00-\x1f]/.test(ref.path) &&
    ref.path.split('/').every(part => part && part === part.trim() && !part.startsWith('.') && !part.endsWith('.')), 'Expected a local runs/ JSON path and exact SHA-256');
}
async function load(workspace: string, ref: Ref) {
  verifyRef(ref);
  let verified: Awaited<ReturnType<typeof readVerifiedDealerReferencePlan>>;
  try { verified = await readVerifiedDealerReferencePlan(workspace, ref); }
  catch { throw new JobError('Plan or input failed exact hash, still-image metadata, role or plan replay checks'); }
  const { plan, images } = verified;
  requireJob(plan.provider.name === 'Runway Dev API' && plan.provider.method === 'POST' && plan.provider.endpoint === ENDPOINT && plan.provider.version === VERSION &&
    plan.requestTemplate.model === 'gen4_image' && plan.requestTemplate.ratio === '1920:1080' && plan.expected.width === 1920 && plan.expected.height === 1080 &&
    plan.estimate.images === 1 && plan.estimate.credits === CREDITS && !plan.mediaTransferAuthorized && !plan.productionAccepted, 'Unsupported image plan or credit estimate');
  const sizedImages = images.map(image => ({ ...image, uriBytes: `data:${image.localImage.mimeType};base64,`.length + Math.ceil(image.bytes.length / 3) * 4 }));
  requireJob(sizedImages.every(image => image.uriBytes <= 5_000_000), 'A frozen reference exceeds Runway’s encoded data URI limit');
  return { ...verified, images: sizedImages, ref };
}
async function verifyAuthorization(job: Loaded, ref: Ref) {
  verifyRef(ref);
  let file = job.root;
  const segments = ref.path.split('/');
  for (const segment of segments.slice(0, -1)) {
    file = path.join(file, segment);
    const info = await stat(file);
    requireJob(info?.isDirectory() && !info.isSymbolicLink(), 'Authorization path must stay within regular local run folders');
  }
  const bytes = await fileBytes(path.join(file, segments.at(-1)!));
  requireJob(bytes && hash(bytes) === ref.sha256, 'Authorization hash mismatch');
  const approval = parse(bytes, 'Invalid operator authorization');
  const approvedPlan = object(approval.plan);
  requireJob(approval.schemaVersion === 1 && approval.kind === 'dealer-reference-image-authorization' && approval.mediaTransferAuthorized === true &&
    approval.maximumPostAttempts === 1 && approval.maximumCredits === CREDITS && typeof approval.approvedBy === 'string' && !!approval.approvedBy.trim() && approval.approvedBy.length <= 80 &&
    approvedPlan?.path === job.ref.path && approvedPlan.sha256 === job.ref.sha256, 'Operator authorization must bind this exact plan, image transfer, one POST and 8 credits');
}
async function jobFolder(job: Loaded, create = false) {
  let folder = job.root;
  for (const segment of ['runs', 'dealer-reference-jobs', job.ref.sha256]) {
    folder = path.join(folder, segment);
    if (create && segment !== 'runs') {
      try { await mkdir(folder); } catch (error) { if (code(error) !== 'EEXIST') throw error; }
    }
    const info = await stat(folder);
    if (!info && !create) return null;
    requireJob(info?.isDirectory() && !info.isSymbolicLink(), 'Job folder must be a regular directory');
  }
  return folder;
}
async function durable(file: string, bytes: Buffer | string) {
  const handle = await open(file, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

async function journal(job: Loaded) {
  const folder = await jobFolder(job);
  const [intentBytes, taskBytes] = folder ? await Promise.all([fileBytes(path.join(folder, 'submit-intent.json')), fileBytes(path.join(folder, 'task.json'))]) : [null, null];
  if (!intentBytes) {
    requireJob(!taskBytes, 'Task journal is missing its submit intent');
    return { folder, attempted: false, task: null };
  }
  const intent = parse(intentBytes, 'Submit intent is incomplete. Reconcile with Runway before further action');
  requireJob(intent.planSha256 === job.ref.sha256 && intent.maximumPostAttempts === 1 && intent.maximumCredits === CREDITS &&
    typeof intent.wireRequestSha256 === 'string' && SHA.test(intent.wireRequestSha256), 'Submit intent does not match the verified plan');
  if (!taskBytes) return { folder, attempted: true, task: null };
  const task = parse(taskBytes, 'Task receipt is incomplete. Reconcile with Runway before further action');
  requireJob(typeof task.taskId === 'string' && TASK_ID.test(task.taskId) && task.planSha256 === job.ref.sha256 && task.intentSha256 === hash(intentBytes) &&
    typeof task.receivedAt === 'string' && Number.isFinite(Date.parse(task.receivedAt)) && typeof task.costAnomaly === 'boolean' &&
    (task.estimatedCredits === null || typeof task.estimatedCredits === 'number' && Number.isFinite(task.estimatedCredits) && task.estimatedCredits >= 0), 'Task receipt does not match the submit intent');
  return { folder, attempted: true, task: { taskId: task.taskId, planSha256: task.planSha256, intentSha256: task.intentSha256,
    receivedAt: task.receivedAt, estimatedCredits: task.estimatedCredits, costAnomaly: task.costAnomaly } as JobTask };
}
async function headers(io: Runtime) {
  let key: string;
  try { key = await io.getApiKey(); } catch { throw new JobError('Local lab Runway credential unavailable'); }
  requireJob(typeof key === 'string' && key.length > 0 && !/\s/.test(key), 'Local lab Runway credential unavailable');
  return { Authorization: `Bearer ${key}`, 'X-Runway-Version': VERSION, 'Content-Type': 'application/json' };
}
async function request(io: Runtime, url: string | URL, init: RequestInit, label: string) {
  let response: Response;
  try { response = await io.fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(60_000) }); }
  catch { throw new JobError(`${label} transport failed`); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new JobError(`${label} HTTP ${response.status}`);
  }
  return response;
}
async function apiJson(io: Runtime, route: string, init: RequestInit, label: string) {
  const response = await request(io, API + route, init, label);
  let value: unknown;
  try { value = await response.json(); } catch { throw new JobError(`${label} returned invalid JSON`); }
  const parsed = object(value);
  requireJob(parsed, `${label} returned invalid JSON`);
  return parsed;
}
function credit(value: unknown) {
  const amount = object(value)?.credits;
  const number = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
  return { amount: number, anomaly: amount != null && (number === null || number > CREDITS) };
}

export async function checkReferenceJob(workspace: string, ref: Ref) {
  const job = await load(workspace, ref);
  const entry = await journal(job);
  return { plan: ref, role: job.plan.role, identity: job.plan.identity, expected: job.plan.expected, maximumCredits: CREDITS,
    references: job.images.map(({ tag, localImage, uriBytes }) => ({ tag, ...localImage, encodedBytes: uriBytes })),
    attempted: entry.attempted, taskKnown: !!entry.task, networkRequests: 0, ...acceptance };
}

export async function submitReferenceJob(workspace: string, ref: Ref, authorization: Ref, io: Runtime) {
  const job = await load(workspace, ref);
  await verifyAuthorization(job, authorization);
  const folder = (await jobFolder(job, true))!;
  const noRetry = 'A submit intent or task exists for this plan hash. Reconcile with Runway before further action';
  requireJob(!await stat(path.join(folder, 'submit-intent.json')) && !await stat(path.join(folder, 'task.json')), noRetry);
  const requestHeaders = await headers(io);
  const { model, ratio, promptText } = job.plan.requestTemplate;
  const body = JSON.stringify({ model, ratio, promptText, referenceImages: job.images.map(({ tag, localImage, bytes }) => ({ tag, uri: `data:${localImage.mimeType};base64,${bytes.toString('base64')}` })) });
  const intent = json({ schemaVersion: 1, plan: ref, planSha256: ref.sha256, authorization, wireRequestSha256: hash(body), maximumCredits: CREDITS,
    maximumPostAttempts: 1, automaticRetries: 0, recordedAt: now() });
  try { await durable(path.join(folder, 'submit-intent.json'), intent); }
  catch (error) { if (code(error) === 'EEXIST') throw new JobError(noRetry); throw error; }
  // The immutable intent exists before the only POST, even if its outcome cannot be recovered automatically.
  try {
    const result = await apiJson(io, ENDPOINT, { method: 'POST', headers: requestHeaders, body }, 'Runway image submit');
    requireJob(typeof result.id === 'string' && TASK_ID.test(result.id), 'Runway image submit did not return a task ID');
    const estimate = credit(result.estimatedCost);
    const task: JobTask = { taskId: result.id, planSha256: ref.sha256, intentSha256: hash(intent), receivedAt: now(), estimatedCredits: estimate.amount, costAnomaly: estimate.anomaly };
    await durable(path.join(folder, 'task.json'), json(task));
    return { state: 'SUBMITTED', ...task, maximumCredits: CREDITS, ...acceptance };
  } catch (error) {
    const reason = error instanceof JobError ? error.message : 'Task receipt could not be persisted';
    throw new JobError(`${reason}. Submit intent is retained. Reconcile with Runway before further action`);
  }
}

async function readTask(task: JobTask, io: Runtime) {
  const response = await apiJson(io, `/v1/tasks/${task.taskId}`, { method: 'GET', headers: await headers(io) }, 'Runway task status');
  requireJob(response.id === task.taskId && typeof response.status === 'string' && ['PENDING', 'THROTTLED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'CANCELLED'].includes(response.status), 'Runway returned a different task or invalid task state');
  const final = credit(response.cost), estimate = credit(response.estimatedCost);
  return { response, status: { state: response.status, ...task, maximumCredits: CREDITS,
    reportedCredits: final.amount ?? estimate.amount ?? task.estimatedCredits,
    creditSource: final.amount !== null ? 'terminal-task' : 'estimate-or-unknown', costAnomaly: task.costAnomaly || final.anomaly || estimate.anomaly, ...acceptance } };
}
export async function statusReferenceJob(workspace: string, ref: Ref, io: Runtime) {
  const job = await load(workspace, ref);
  const entry = await journal(job);
  if (!entry.task) return { state: entry.attempted ? 'SUBMISSION_OUTCOME_UNKNOWN_NO_RETRY' : 'NOT_SUBMITTED', planSha256: ref.sha256, taskId: null, ...acceptance };
  return (await readTask(entry.task, io)).status;
}

function outputUrl(output: unknown) {
  requireJob(Array.isArray(output) && output.length === 1 && typeof output[0] === 'string', 'Expected one Runway image output');
  let url: URL;
  try { url = new URL(output[0]); } catch { throw new JobError('Runway output URL is invalid'); }
  requireJob(url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && url.hostname === OUTPUT_HOST, 'Runway output URL is outside the documented download host');
  return url;
}
async function outputBytes(response: Response) {
  const size = response.headers.get('content-length');
  requireJob(!size || /^\d+$/.test(size) && Number(size) <= MAX_OUTPUT_BYTES, 'Runway image exceeds the download size limit');
  const reader = response.body?.getReader();
  requireJob(reader, 'Runway image response has no body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      requireJob(total <= MAX_OUTPUT_BYTES, 'Runway image exceeds the download size limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof JobError) throw error;
    throw new JobError('Runway image body could not be read');
  } finally { reader.releaseLock(); }
  requireJob(total > 0 && (!size || Number(size) === total), 'Runway image body size mismatch');
  return Buffer.concat(chunks, total);
}
async function nativeProof(job: Loaded, task: JobTask, bytes: Buffer, contentType: string | null) {
  let observed;
  try {
    const image = sharp(bytes, { failOn: 'error', limitInputPixels: 4096 * 4096 });
    const { width, height, format, pages = 1, orientation = 1 } = await image.metadata();
    requireJob((format === 'png' || format === 'jpeg' || format === 'webp') && width && height, 'Expected a decodable PNG, JPEG or WebP original');
    await image.stats();
    observed = { width, height, mimeType: MIME[format], pages, orientation, format };
  } catch { throw new JobError('Runway output is not a decodable supported image'); }
  const claimed = contentType === 'image/jpg' ? 'image/jpeg' : contentType;
  requireJob(claimed === observed.mimeType, 'Runway image MIME does not match the decoded original');
  const filename = `original.${observed.format === 'jpeg' ? 'jpg' : observed.format}`;
  const output = { path: `runs/dealer-reference-jobs/${job.ref.sha256}/download/${filename}`, sha256: hash(bytes) };
  const expected = job.plan.expected;
  const passed = observed.width === expected.width && observed.height === expected.height && observed.pages === 1 && observed.orientation === 1;
  return { filename, proof: { schemaVersion: 1, taskId: task.taskId, planSha256: job.ref.sha256, output, expected, observed, passed, originalPreserved: true, ...acceptance } };
}
async function existingDownload(job: Loaded, task: JobTask, folder: string) {
  const directory = path.join(folder, 'download'), info = await stat(directory);
  if (!info) return null;
  requireJob(info.isDirectory() && !info.isSymbolicLink(), 'Download folder must be a regular directory');
  const bytes = await fileBytes(path.join(directory, 'native-verification.json'));
  requireJob(bytes, 'Download is missing its native verification');
  const saved = parse(bytes, 'Invalid native verification');
  const mime = object(saved.observed)?.mimeType;
  const extension = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : null;
  requireJob(extension, 'Native verification is missing its image MIME');
  const original = await fileBytes(path.join(directory, `original.${extension}`));
  requireJob(original && original.length <= MAX_OUTPUT_BYTES, 'Download is missing its original image');
  const { proof } = await nativeProof(job, task, original, mime as string);
  requireJob(bytes.equals(Buffer.from(json(proof))), 'Original or native verification changed after download');
  return { state: proof.passed ? 'NATIVE_VERIFIED_PENDING_VISUAL_QA' : 'ORIGINAL_PRESERVED_NATIVE_MISMATCH', ...proof,
    nativeVerification: { path: `runs/dealer-reference-jobs/${job.ref.sha256}/download/native-verification.json`, sha256: hash(bytes) } };
}
async function publishDownload(folder: string, filename: string, bytes: Buffer, proof: string) {
  const temp = await mkdtemp(path.join(folder, '.download-'));
  const original = path.join(temp, filename), verification = path.join(temp, 'native-verification.json');
  let installed = false;
  try {
    await durable(original, bytes);
    await durable(verification, proof);
    try { await rename(temp, path.join(folder, 'download')); installed = true; }
    catch (error) { if (!(await stat(path.join(folder, 'download')))?.isDirectory()) throw error; }
  } finally {
    if (!installed) {
      for (const file of [original, verification]) await unlink(file).catch(error => { if (code(error) !== 'ENOENT') throw error; });
      await rmdir(temp);
    }
  }
}
export async function downloadReferenceJob(workspace: string, ref: Ref, io: Runtime) {
  const job = await load(workspace, ref);
  const { folder, task } = await journal(job);
  requireJob(folder && task, 'A durable Runway task ID is required before download');
  const existing = await existingDownload(job, task, folder);
  if (existing) return existing;
  const { response, status } = await readTask(task, io);
  requireJob(status.state === 'SUCCEEDED', 'Runway image task has not succeeded');
  // The signed URL is transient and the download never receives the API credential.
  const image = await request(io, outputUrl(response.output), { method: 'GET' }, 'Runway original download');
  const bytes = await outputBytes(image);
  const { filename, proof } = await nativeProof(job, task, bytes, image.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? null);
  await publishDownload(folder, filename, bytes, json(proof));
  const saved = await existingDownload(job, task, folder);
  requireJob(saved && saved.output.sha256 === proof.output.sha256, 'A different original is already preserved for this task');
  return saved;
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  const usage = 'Usage: node tools/dealer-reference-job.ts check|submit|status|download --plan=runs/.../plan.json --sha=<sha256> (submit adds --authorization=runs/.../authorization.json --authorization-sha=<sha256>)';
  const opts: Record<string, string> = {};
  requireJob(['check', 'submit', 'status', 'download'].includes(action), usage);
  for (const arg of args) {
    const match = /^--(plan|sha|authorization|authorization-sha)=(.+)$/.exec(arg);
    requireJob(match && !opts[match[1]], usage);
    opts[match[1]] = match[2];
  }
  requireJob(opts.plan && opts.sha && args.length === (action === 'submit' ? 4 : 2), usage);
  requireJob(process.version === 'v24.21.0', 'Use the pinned Volta Node 24.21.0');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const ref = { path: opts.plan, sha256: opts.sha };
  const io: Runtime = { fetcher: fetch, async getApiKey() { return parseEnv(await readFile(path.join(root, '.env.local'), 'utf8')).RUNWAY_API_KEY ?? ''; } };
  const result = action === 'check' ? await checkReferenceJob(root, ref) : action === 'submit' ?
    await submitReferenceJob(root, ref, { path: opts.authorization, sha256: opts['authorization-sha'] }, io) : action === 'status' ?
      await statusReferenceJob(root, ref, io) : await downloadReferenceJob(root, ref, io);
  console.log(json(result));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof JobError ? error.message : 'Reference image job failed during local validation or file I/O'); process.exitCode = 1; });
}
