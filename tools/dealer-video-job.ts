/** Data-driven local Runway pilot job. Immutable intent precedes the only POST.
 * Commands: check|submit|status --plan=runs/.../plan.json --sha=<plan SHA256>
 * No generation on import, no automatic retries, no publishing or bank activation.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

export type Ref = { path: string; sha256: string };
export type VideoJobPlan = {
  schemaVersion: 1; id: string; dealerId: string; role: string;
  model: 'wan3'; ratio: 'auto_1080p'; duration: number; audio: false;
  maximumCredits: number; creditsPerSecond: 20; maximumPostAttempts: 1;
  budget: Ref; providerPriorTaskId: string;
  inputs: Array<Ref & { position: 'first' | 'last'; width: number; height: number }>;
  promptText: string; promptSha256: string; dependencies: Ref[];
  expected: { width: number; height: number; frames: number; fps: 30 };
  modelSupport: { checkedAt: string; sources: string[] };
  productionAccepted: false;
};
type Budget = { schemaVersion: 1; maximumCredits: number; maximumJobs: number; authorization: string };
const API = 'https://api.dev.runwayml.com';
const VERSION = '2024-11-06';
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SHA = /^[a-f0-9]{64}$/;
export const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const now = () => new Date().toISOString();
const exists = async (file: string) => { try { await access(file); return true; } catch (error: any) { if (error.code === 'ENOENT') return false; throw error; } };

export function validatePlan(p: VideoJobPlan): void {
  assert.equal(p.schemaVersion, 1); assert.match(p.id, /^[a-z0-9][a-z0-9-]{2,79}$/);
  assert.ok(p.dealerId && p.role); assert.equal(p.model, 'wan3'); assert.equal(p.ratio, 'auto_1080p');
  assert.ok(Number.isSafeInteger(p.duration) && p.duration >= 2 && p.duration <= 30);
  assert.equal(p.audio, false); assert.equal(p.creditsPerSecond, 20);
  assert.equal(p.maximumCredits, p.duration * p.creditsPerSecond);
  assert.ok(p.maximumCredits <= 300); assert.equal(p.maximumPostAttempts, 1);
  assert.equal(p.productionAccepted, false); assert.match(p.providerPriorTaskId, UUID);
  assert.ok(p.promptText.length > 0 && p.promptText.length <= 1000);
  assert.equal(p.promptSha256, hash(p.promptText));
  assert.equal(p.inputs.length, 2); assert.equal(p.inputs[0].position, 'first'); assert.equal(p.inputs[1].position, 'last');
  for (const input of p.inputs) { assert.ok(Number.isSafeInteger(input.width) && input.width > 0); assert.ok(Number.isSafeInteger(input.height) && input.height > 0); }
  assert.equal(p.inputs[0].width, p.inputs[1].width); assert.equal(p.inputs[0].height, p.inputs[1].height);
  assert.equal(p.expected.fps, 30); assert.equal(p.expected.frames, p.duration * 30);
  assert.equal(p.expected.width, p.inputs[0].width); assert.equal(p.expected.height, p.inputs[0].height);
  assert.ok(Number.isFinite(Date.parse(p.modelSupport.checkedAt)) && p.modelSupport.sources.length > 0);
  for (const source of p.modelSupport.sources) assert.match(source, /^https:\/\/(docs\.dev|dev)\.runwayml\.com\//);
  for (const ref of [p.budget, ...p.inputs, ...p.dependencies]) assert.match(ref.sha256, SHA);
}
async function safe(root: string, relative: string): Promise<string> {
  assert.ok(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':'));
  assert.ok(relative.split('/').every(part => part !== '..' && part !== '.' && part.length > 0));
  assert.ok(/^(runs|tools|src|references|private)\//.test(relative), 'Unsupported local artifact path');
  const base = path.resolve(root), full = path.resolve(base, relative);
  assert.ok(full.startsWith(base + path.sep));
  let cursor = full;
  while (cursor !== base) {
    try { assert.equal((await lstat(cursor)).isSymbolicLink(), false, 'Linked artifact path'); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    cursor = path.dirname(cursor);
  }
  return full;
}
async function durable(file: string, value: string | Uint8Array): Promise<void> {
  const handle = await open(file, 'wx');
  try { await handle.writeFile(value); await handle.sync(); } finally { await handle.close(); }
}
async function replace(file: string, value: unknown): Promise<void> {
  const temp = file + '.' + randomUUID() + '.tmp';
  await durable(temp, json(value));
  try { await rename(temp, file); } finally { await rm(temp, { force: true }); }
}
async function checked(root: string, ref: Ref): Promise<Buffer> {
  const bytes = await readFile(await safe(root, ref.path));
  assert.equal(hash(bytes), ref.sha256, 'Artifact hash changed: ' + ref.path); return bytes;
}
async function load(root: string, planPath: string, expectedSha: string) {
  assert.match(expectedSha, SHA); assert.ok(planPath.startsWith('runs/') && planPath.endsWith('/plan.json'));
  const bytes = await checked(root, { path: planPath, sha256: expectedSha });
  const p = JSON.parse(bytes.toString('utf8')) as VideoJobPlan; validatePlan(p);
  const inputBytes = [];
  for (const input of p.inputs) {
    assert.ok(input.path.startsWith('runs/'));
    const value = await checked(root, input);
    assert.equal(value.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG input required');
    assert.equal(value.readUInt32BE(16), input.width); assert.equal(value.readUInt32BE(20), input.height);
    assert.ok(Buffer.byteLength('data:image/png;base64,' + value.toString('base64')) < 5_000_000);
    inputBytes.push(value);
  }
  for (const ref of p.dependencies) await checked(root, ref);
  assert.ok(p.budget.path.startsWith('runs/'));
  const budget = JSON.parse((await checked(root, p.budget)).toString('utf8')) as Budget;
  assert.equal(budget.schemaVersion, 1); assert.ok(budget.authorization.length > 0);
  assert.ok(Number.isSafeInteger(budget.maximumCredits) && budget.maximumCredits > 0 && budget.maximumCredits <= 300);
  assert.ok(Number.isSafeInteger(budget.maximumJobs) && budget.maximumJobs > 0 && budget.maximumJobs <= 5);
  return { p, budget, inputBytes, folder: path.dirname(await safe(root, planPath)) };
}
async function requestHeaders(root: string) {
  const key = parseEnv(await readFile(path.join(root, '.env.local'), 'utf8')).RUNWAY_API_KEY;
  assert.ok(key, 'Local lab Runway credential unavailable');
  return { Authorization: `Bearer ${key}`, 'X-Runway-Version': VERSION, 'Content-Type': 'application/json' };
}
async function readApi(fetcher: typeof fetch, route: string, headers: Record<string, string>) {
  const response = await fetcher(API + route, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  assert.ok(response.ok, 'Runway read HTTP ' + response.status);
  return response.json();
}
async function reserve(root: string, p: VideoJobPlan, planSha: string, budget: Budget, planPath: string) {
  const dir = path.dirname(await safe(root, p.budget.path));
  const lockPath = path.join(dir, 'reservation.lock');
  const lock = await open(lockPath, 'wx');
  try {
    const folder = await safe(root, path.posix.dirname(p.budget.path) + '/reservations'); await mkdir(folder, { recursive: true });
    const rows = [];
    for (const name of await readdir(folder)) {
      assert.match(name, /^[a-z0-9-]+\.json$/);
      const row = JSON.parse(await readFile(await safe(root, path.posix.dirname(p.budget.path) + '/reservations/' + name), 'utf8'));
      assert.match(row.planSha256, SHA); assert.ok(Number.isSafeInteger(row.maximumCredits) && row.maximumCredits > 0);
      assert.ok(typeof row.statePath === 'string' && row.statePath.startsWith('runs/'));
      const statePath = await safe(root, row.statePath);
      if (await exists(statePath)) {
        const state = JSON.parse(await readFile(statePath, 'utf8'));
        assert.ok(!state.costAnomaly && !(Number.isFinite(state.reportedCredits) && state.reportedCredits > row.maximumCredits), 'Earlier job cost needs reconciliation');
      }
      rows.push(row);
    }
    const existing = rows.find(row => row.id === p.id);
    assert.ok(!existing, 'Job already reserved; never submit again from any folder');
    {
      assert.ok(rows.length + 1 <= budget.maximumJobs, 'Pilot job limit reached');
      assert.ok(rows.reduce((n, row) => n + row.maximumCredits, 0) + p.maximumCredits <= budget.maximumCredits, 'Pilot credit limit reached');
      await durable(path.join(folder, p.id + '.json'), json({ id: p.id, planSha256: planSha, maximumCredits: p.maximumCredits, statePath: path.posix.dirname(planPath) + '/state.json', reservedAt: now() }));
    }
  } finally { await lock.close(); await rm(lockPath); }
}
export async function submitJob(root: string, planPath: string, planSha: string, fetcher: typeof fetch = fetch) {
  const { p, budget, inputBytes, folder } = await load(root, planPath, planSha);
  const lockPath = path.join(folder, 'job.lock'), lock = await open(lockPath, 'wx');
  try {
    assert.equal(await exists(path.join(folder, 'submit-intent.json')), false, 'POST already attempted; never resubmit');
    assert.equal(await exists(path.join(folder, 'task.json')), false, 'Task already exists');
    const headers = await requestHeaders(root);
    const [org, prior] = await Promise.all([
      readApi(fetcher, '/v1/organization', headers), readApi(fetcher, '/v1/tasks/' + p.providerPriorTaskId, headers),
    ]);
    assert.equal(prior.id, p.providerPriorTaskId); assert.equal(prior.status, 'SUCCEEDED');
    assert.ok(Number.isFinite(org.creditBalance) && org.creditBalance >= p.maximumCredits, 'Insufficient API credits');
    await reserve(root, p, planSha, budget, planPath);
    const body = JSON.stringify({ model: p.model, ratio: p.ratio, duration: p.duration, audio: false, promptText: p.promptText,
      promptImage: p.inputs.map((input, index) => ({ position: input.position, uri: 'data:image/png;base64,' + inputBytes[index].toString('base64') })) });
    const intent = { id: p.id, planSha256: planSha, wireRequestSha256: hash(body), maximumCredits: p.maximumCredits,
      startedAt: now(), walletBefore: org.creditBalance, priorTaskId: prior.id, maximumPostAttempts: 1, automaticRetries: 0 };
    await durable(path.join(folder, 'submit-intent.json'), json(intent));
    await replace(path.join(folder, 'state.json'), { state: 'SUBMISSION_OUTCOME_UNKNOWN_NO_RETRY', taskId: null, planSha256: planSha });
    const response = await fetcher(API + '/v1/image_to_video', { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(60_000) });
    // Do not print response bodies: provider error echoes can include submitted image data.
    assert.ok(response.ok, 'Runway submit HTTP ' + response.status + '; no retry');
    const result = await response.json(); assert.match(result.id ?? '', UUID, 'Missing task ID; no retry');
    const receipt = { taskId: result.id, planSha256: planSha, wireRequestSha256: intent.wireRequestSha256, receivedAt: now() };
    await durable(path.join(folder, 'task.json'), json(receipt));
    const estimated = result.estimatedCost?.credits ?? null;
    const state = { state: 'SUBMITTED', ...receipt, maximumCredits: p.maximumCredits, reportedCredits: estimated,
      costAnomaly: estimated !== null && (!Number.isFinite(estimated) || estimated < 0 || estimated > p.maximumCredits) };
    await replace(path.join(folder, 'state.json'), state); return state;
  } finally { await lock.close(); await rm(lockPath); }
}
export async function checkJob(root: string, planPath: string, planSha: string) {
  const { p, folder } = await load(root, planPath, planSha);
  return { id: p.id, planSha256: planSha, model: p.model, duration: p.duration, maximumCredits: p.maximumCredits,
    inputs: p.inputs, attempted: await exists(path.join(folder, 'submit-intent.json')), taskKnown: await exists(path.join(folder, 'task.json')), networkWrites: 0 };
}
export async function statusJob(root: string, planPath: string, planSha: string, fetcher: typeof fetch = fetch) {
  const { p, folder } = await load(root, planPath, planSha);
  const receipt = JSON.parse(await readFile(path.join(folder, 'task.json'), 'utf8'));
  assert.equal(receipt.planSha256, planSha); assert.match(receipt.taskId, UUID);
  const statePath = path.join(folder, 'state.json');
  const previous = JSON.parse(await readFile(statePath, 'utf8'));
  if (previous.output) { await checked(root, previous.output); return previous; }
  const headers = await requestHeaders(root), task = await readApi(fetcher, '/v1/tasks/' + receipt.taskId, headers);
  assert.equal(task.id, receipt.taskId); assert.ok(['PENDING','THROTTLED','RUNNING','SUCCEEDED','FAILED','CANCELED','CANCELLED'].includes(task.status));
  const state: any = { state: task.status, ...receipt, checkedAt: now(), maximumCredits: p.maximumCredits,
    reportedCredits: task.cost?.credits ?? task.estimatedCost?.credits ?? previous.reportedCredits ?? null,
    creditSource: task.cost?.credits != null ? 'terminal-task-cost' : 'estimate-or-unknown',
    costAnomaly: previous.costAnomaly === true, productionAccepted: false, visualQaPending: true };
  if (state.reportedCredits !== null && (!Number.isFinite(state.reportedCredits) || state.reportedCredits < 0 || state.reportedCredits > p.maximumCredits)) state.costAnomaly = true;
  await replace(statePath, state);
  if (['SUCCEEDED','FAILED','CANCELED','CANCELLED'].includes(task.status)) {
    try {
      const org = await readApi(fetcher, '/v1/organization', headers), intent = JSON.parse(await readFile(path.join(folder, 'submit-intent.json'), 'utf8'));
      assert.ok(Number.isFinite(org.creditBalance));
      state.creditBalanceAfter = org.creditBalance; state.walletDelta = intent.walletBefore - org.creditBalance;
      state.walletDeltaIsNotInvoice = true;
      if (state.walletDelta > p.maximumCredits) {
        state.costAnomaly = true; state.reconciliationReason = 'Wallet decrease exceeds this job cap; attribution unverified';
      }
      await replace(statePath, state);
    } catch { /* Task and conservative reservation remain durable if balance cannot be read. */ }
  }
  if (task.status === 'FAILED') { state.failureCode = typeof task.failureCode === 'string' ? task.failureCode.slice(0, 100) : null; await replace(statePath, state); }
  if (task.status !== 'SUCCEEDED') return state;
  assert.ok(Array.isArray(task.output) && task.output.length === 1);
  const url = new URL(task.output[0]); assert.equal(url.protocol, 'https:'); assert.equal(url.username, ''); assert.equal(url.password, '');
  assert.ok(!url.port || url.port === '443'); assert.match(url.hostname, /(^|\.)(cloudfront\.net|runwayml\.com)$/);
  const outputPath = path.join(folder, 'original.mp4');
  if (!await exists(outputPath)) {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) });
    assert.ok(response.ok, 'Output download HTTP ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 1024 && bytes.length < 128_000_000);
    await durable(outputPath, bytes);
  }
  const output = { path: path.relative(root, outputPath).replaceAll('\\', '/'), sha256: hash(await readFile(outputPath)) };
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-threads','1','-count_frames','-show_streams','-show_format','-of','json',outputPath], { encoding: 'utf8', windowsHide: true, timeout: 60_000 }));
  const videos = probe.streams.filter((s: any) => s.codec_type === 'video'), audios = probe.streams.filter((s: any) => s.codec_type === 'audio'), v = videos[0];
  const observed = { width: v?.width, height: v?.height, frames: Number(v?.nb_read_frames), fps: v?.avg_frame_rate, timeBase: v?.time_base, seconds: Number(probe.format.duration), audioStreams: audios.length };
  const passed = videos.length === 1 && observed.width === p.expected.width && observed.height === p.expected.height && observed.frames === p.expected.frames && observed.fps === '30/1' && audios.length === 0 && Math.abs(observed.seconds - p.duration) < 1/60;
  const proof = { taskId: task.id, output, expected: p.expected, observed, passed, transforms: [], originalPreserved: true, productionAccepted: false, visualQaPending: true };
  const proofPath = path.join(folder, 'native-verification.json');
  if (await exists(proofPath)) assert.deepEqual(JSON.parse(await readFile(proofPath, 'utf8')), proof); else await durable(proofPath, json(proof));
  state.output = output; state.nativeVerification = { path: path.relative(root, proofPath).replaceAll('\\','/'), sha256: hash(await readFile(proofPath)) };
  state.state = passed ? 'NATIVE_VERIFIED_PENDING_VISUAL_QA' : 'ORIGINAL_PRESERVED_NATIVE_MISMATCH'; await replace(statePath, state);
  return state;
}
async function main() {
  const [action, ...rest] = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (const argument of rest) { const match = /^--(plan|sha)=(.+)$/.exec(argument); assert.ok(match, 'Unknown argument'); assert.ok(!args[match[1]], 'Duplicate argument'); args[match[1]] = match[2]; }
  assert.ok(args.plan && args.sha); const root = process.cwd();
  assert.equal(path.basename(root), 'snyggare-dealer'); assert.equal(process.version, 'v24.21.0');
  const result = action === 'check' ? await checkJob(root,args.plan,args.sha) : action === 'submit' ? await submitJob(root,args.plan,args.sha) : action === 'status' ? await statusJob(root,args.plan,args.sha) : assert.fail('Unknown action');
  console.log(json(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Video job failed'); process.exitCode = 1; });
}
