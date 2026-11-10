/** Local Pamela outer-seat pilot. No network writes in --dry-run.
 * --dry-run [--verify-api] | --submit --seat=1|7 | --status --seat=1|7 | --download --seat=1|7
 * A submission reserves both jobs under the existing shared budget lock, then starts one job.
 * No automatic retry, polling loop, publication, activation, retiming or Main integration.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { privateConfig } from '../src/media.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = 'runs/20261109-pamela-seat-pilot-plan';
const owner = 'pamela-seat-pilot-1-7';
const ledgerPath = 'runs/20261108-pamela-deal-pilot/qa/budget-ledger.json';
const source = 'runs/20261109-pamela-reference-kit/original/pamela-redo-station.png';
const sourceHash = 'a9dd4882d84da1cc6f0fb3258d0fbd6d81fddac5a7f78efdaa225d6f9538576d';
const priorTaskId = '7535ff6b-d4a7-4fc8-90fc-79e661c49b15';
const endpoint = 'https://api.dev.runwayml.com';
const seats = [1, 7] as const;
type Seat = typeof seats[number];
type Json = Record<string, any>;
type Request = { model: 'wan3'; ratio: 'auto_1080p'; duration: 12; audio: false; promptText: string; promptImage: { position: 'first'; uri: string }[] };
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const absolute = (file: string) => path.join(root, file);
const read = async (file: string): Promise<Json> => JSON.parse(await readFile(absolute(file), 'utf8'));
const exists = (file: string) => stat(absolute(file)).then(() => true).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
const jobPath = (seat: Seat) => `${run}/seat-${seat}.json`;
const taskPath = (seat: Seat) => `${run}/seat-${seat}.task-id.json`;
const requestPath = (seat: Seat) => `${run}/seat-${seat}.request.json`;
async function atomic(file: string, value: unknown) {
  const temporary = `${absolute(file)}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, absolute(file)); }
  finally { await rm(temporary, { force: true }); }
}
async function fixed(file: string, bytes: string | Buffer) {
  if (await exists(file)) {
    if (sha(await readFile(absolute(file))) !== sha(bytes)) throw Error(`Existing artifact differs; preserve and review it: ${file}`);
  } else await writeFile(absolute(file), bytes, { flag: 'wx' });
}
async function withLedger<T>(change: (ledger: Json) => Promise<T>) {
  const lock = `${ledgerPath}.lock`, token = JSON.stringify({ owner, pid: process.pid, nonce: randomUUID(), createdAt: new Date().toISOString() });
  await writeFile(absolute(lock), token, { flag: 'wx' });
  try {
    const original = await readFile(absolute(ledgerPath)), ledger = JSON.parse(original.toString('utf8'));
    const result = await change(ledger);
    if (sha(await readFile(absolute(ledgerPath))) !== sha(original)) throw Error('Budget journal changed concurrently; do not overwrite');
    await atomic(ledgerPath, ledger); return result;
  } finally { if (await readFile(absolute(lock), 'utf8') === token) await rm(absolute(lock)); }
}
function totals(ledger: Json) {
  const jobs = ledger.jobs as Json[], pending = (ledger.reservations ?? []).filter((item: Json) => item.state !== 'released' && !jobs.some(job => job.path === item.path));
  const reserve = Number(ledger.failedAttempt?.conservativeReserveCredits ?? 0);
  const credits = jobs.reduce((n, item) => n + Number(item.apiMaximumCredits), 0) + pending.reduce((n: number, item: Json) => n + Number(item.credits), 0) + reserve;
  const jobCount = jobs.length + pending.length + (reserve && !ledger.failedAttempt?.billingVerified ? 1 : 0);
  if (!Number.isSafeInteger(credits) || credits < 0 || !Number.isSafeInteger(jobCount)) throw Error('Invalid budget accounting');
  return { credits, jobCount, remaining: Number(ledger.approved.runwayCredits) - credits };
}
function budget(ledger: Json, additionalJobs: number) {
  for (const key of ['runwayCredits', 'maxPaidVideoJobs', 'maxJobCredits']) if (!Number.isSafeInteger(ledger.approved?.[key]) || ledger.approved[key] < 1) throw Error(`Missing valid approved budget: ${key}`);
  const current = totals(ledger);
  if (current.credits + 240 * additionalJobs > Math.min(4000, ledger.approved.runwayCredits) || current.jobCount + additionalJobs > Math.min(16, ledger.approved.maxPaidVideoJobs) || 240 > Math.min(250, ledger.approved.maxJobCredits)) throw Error('Conflict: the approved monetary/job limits do not cover this pilot');
  if (ledger.jobs.some((job: Json) => job.owner === owner && job.apiMaximumCredits > 240)) throw Error('Earlier seat job exceeded estimate; stop before another paid job');
  return current;
}
function prompt(seat: Seat) {
  const side = seat === 1 ? 'far IMAGE-LEFT outer player position (viewer left, away from the shoe)' : 'far IMAGE-RIGHT outer player position (viewer right, below and outward from the shoe)';
  return `One continuous 12-second locked-camera take. Preserve Pamela's mature face, hair, black blazer, ivory blouse, body scale, green background, tabletop, light and fixed black shoe. Begin in the supplied REDO pose, fingers at the shoe. Settle for 1 second. Draw exactly one rigid standard playing card; maintain believable fingertip contact. Deal it to the ${side}, clearly beyond the central landing area but safely inside the frame. Keep shoulders, elbows, hands and the whole card visible; no camera movement. Place it flat once, release cleanly and leave it motionless there. Return both hands and gaze to the original REDO pose by 9 seconds, then settle through 12 seconds. The dealt card remains on the table; the next card stays in the shoe. Natural controlled reach, no stretch, floating, duplicate hand, disappearing card, cuts or extra dealing. This is a single deal and return, not a loop.`;
}
async function input() {
  const bytes = await readFile(absolute(source));
  if (sha(bytes) !== sourceHash) throw Error('Pamela REDO source identity changed');
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== 1536 || metadata.height !== 1024 || metadata.format !== 'png') throw Error('Unexpected REDO dimensions or format');
  const uri = `data:image/png;base64,${bytes.toString('base64')}`;
  if (Buffer.byteLength(uri) > 5_000_000) throw Error('Data URI exceeds documented image input cap');
  return { bytes, uri, width: metadata.width, height: metadata.height };
}
function body(seat: Seat, uri: string): Request { return { model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, promptText: prompt(seat), promptImage: [{ position: 'first', uri }] }; }
async function headers() {
  const key = (await privateConfig(root)).RUNWAY_API_KEY;
  if (!key) throw Error('Local lab Runway API credential unavailable');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' };
}
async function responseJson(response: Response): Promise<Json> {
  if (!response.ok) throw Error(`Runway HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 128_000) throw Error('Unexpected API response size');
  return JSON.parse(text);
}
async function verifyProvider(requiredCredits = 0) {
  const prior = await read('runs/20261109-pamela-continuous-idle/continuous.json');
  if (prior.taskId !== priorTaskId || prior.model !== 'wan3' || prior.duration !== 12) throw Error('Known Pamela API binding changed');
  const requestHeaders = await headers();
  const [organization, task] = await Promise.all(['/v1/organization', `/v1/tasks/${priorTaskId}`].map(async route => responseJson(await fetch(endpoint + route, { headers: requestHeaders, redirect: 'error', signal: AbortSignal.timeout(30_000) }))));
  if (task.id !== priorTaskId || task.status !== 'SUCCEEDED') throw Error('Account cannot access the known Pamela task');
  if (!Number.isFinite(organization.creditBalance) || organization.creditBalance < requiredCredits) throw Error('API balance does not cover the pending pilot');
  return { checkedAt: new Date().toISOString(), endpoint, credentialSource: 'local lab .env.local / RUNWAY_API_KEY', organizationId: organization.organizationId ?? organization.id ?? null, projectName: organization.projectName ?? null, creditBalance: organization.creditBalance, priorTask: { id: task.id, status: task.status }, identityLimit: 'Scope verified through the exact prior Pamela task; no connector workspace is assumed.', connectorUsed: false };
}
async function dryRun(online: boolean) {
  const image = await input(), ledger = await read(ledgerPath), own = (ledger.reservations ?? []).filter((row: Json) => row.owner === owner);
  const current = budget(ledger, seats.filter(seat => !own.some((row: Json) => row.path === jobPath(seat))).length);
  const map = await read('references/dealer-map.json');
  const mapping = seats.map(seat => {
    const node = map.nodes.find((item: Json) => item.playerSeat === seat), target = map.targets.find((item: Json) => item.playerSeat === seat);
    const expected = seat === 1 ? 'deal.player.left/box0' : 'deal.player.right/box6';
    if (node?.id !== expected || target?.box !== seat - 1) throw Error(`Canonical seat mapping changed: ${seat}`);
    return { seat, slot: expected, box: seat - 1, imageDirection: seat === 1 ? 'viewer-left' : 'viewer-right', mappingStatus: 'provisional-image-direction; no calibrated landing quad', landingQuad: target.landingQuad, measurementStatus: target.measurementStatus };
  });
  await mkdir(absolute(run), { recursive: true });
  const jobs = [];
  for (const seat of seats) {
    const request = body(seat, image.uri), bytes = JSON.stringify(request, null, 2) + '\n';
    await fixed(requestPath(seat), bytes);
    await fixed(`${run}/seat-${seat}.prompt.txt`, prompt(seat) + '\n');
    jobs.push({ seat, requestPath: requestPath(seat), requestSha256: sha(bytes), promptPath: `${run}/seat-${seat}.prompt.txt`, promptSha256: sha(prompt(seat)), promptCharacters: prompt(seat).length, model: 'wan3', duration: 12, expectedCredits: 240, startAnchor: { path: source, sha256: sourceHash, width: image.width, height: image.height, bytes: image.bytes.length, transform: 'none' }, lastAnchor: null, endPose: 'REDO requested in text; not guaranteed', tableStateAfter: 'one newly dealt card remains at the outer target', state: 'planned-not-submitted' });
  }
  const plan = { schemaVersion: 1, owner, dealerId: 'pamela-pilot', bankId: 'pamela-workspace-v1', status: 'prepared-first-only-reach-candidate', productionAccepted: false, endpoint: `${endpoint}/v1/image_to_video`, apiVersion: '2024-11-06', jobs, mapping,
    sevenSeatStatus: Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, status: i === 0 || i === 6 ? 'planned' : 'not-generated-by-this-pilot', existingCentralCandidate: i === 3 })),
    budget: { maxJobsThisPilot: 2, creditsPerJob: 240, totalCredits: 480, estimatedUsdBeforeTax: 4.8, monetaryCap: 4000, perJobCap: 250, paidJobCap: 16, expectedBaselineConservativeCredits: 1202, expectedBaselineConservativeJobs: 14, expectedRemainingAfterPilot: 2318, expectedRemainingJobSlotsAfterPilot: 0, reservationCreatedByDryRun: false },
    anchors: { mode: 'first-only', reason: 'No calibrated outer-seat end anchors exist. Reusing the empty-table REDO image would encourage card disappearance; the existing central end image would force the wrong landing position.', exactEndPoseGuaranteed: false },
    provenance: { approval: `${run}/authorization-evidence.json`, officialApi: `${run}/api-evidence.json`, budgetJournal: ledgerPath, referenceKit: 'runs/20261109-pamela-reference-kit/reference-kit.json', dealerMap: 'references/dealer-map.json' },
    execution: { submitOneAtATime: true, order: [1, 7], reviewFirstBeforeSecond: true, automaticRetries: false, automaticPolling: false, originalOutputPreserved: true, uploadUsed: false, firstImageSubmittedAsDataUri: true, requestFilesContainOriginalImageDataButNoCredentials: true },
    qa: ['Measure actual output dimensions, fps and frame count; prior Wan3 results were 1762x1174/30fps but this is not an API guarantee.', 'Review every frame for whole-hand/elbow visibility, finger/card contact, shoe stability, a stationary landed card and identity/light continuity.', 'Find real REDO boundaries and cut from the original; preserve source frame numbers, fps, hashes and motion speed. Do not freeze, morph or crossfade to hide a failed return.', 'Inspect final native/portrait projections before acceptance; do not inherit central card tracks or masks.', 'If the first outer reach fails, stop before job 2. No remaining retry slots are assumed after both planned jobs.'],
    limitations: ['Landing targets are described in image space and remain uncalibrated.', 'First-only conditioning does not guarantee the final REDO pose.', 'No full bank, Main integration or production approval follows from this pilot.'] };
  await fixed(`${run}/plan.json`, JSON.stringify(plan, null, 2) + '\n');
  if (online) await atomic(`${run}/provider-binding.json`, await verifyProvider(480));
  await atomic(`${run}/dry-run.json`, { checkedAt: new Date().toISOString(), currentBudget: current, sourceVerified: true, exactRequestFilesWritten: true, apiReadOnlyChecked: online, paidJobsStarted: 0, uploads: 0, journalChanged: false });
  console.log(JSON.stringify({ status: 'dry-run-complete', plan: `${run}/plan.json`, jobs: 2, totalCredits: 480, budgetBefore: current, apiReadOnlyChecked: online, paidJobsStarted: 0 }));
}
async function checkedJob(seat: Seat) {
  const plan = await read(`${run}/plan.json`), entry = plan.jobs.find((item: Json) => item.seat === seat);
  if (plan.owner !== owner || !entry || entry.model !== 'wan3' || entry.duration !== 12 || entry.expectedCredits !== 240) throw Error('Prepared pilot identity changed');
  const image = await input(), requestBytes = await readFile(absolute(requestPath(seat)));
  if (sha(requestBytes) !== entry.requestSha256 || JSON.stringify(JSON.parse(requestBytes.toString('utf8'))) !== JSON.stringify(body(seat, image.uri))) throw Error('Prepared request/source/prompt changed');
  return { entry, requestBytes };
}
async function submit(seat: Seat) {
  const { entry, requestBytes } = await checkedJob(seat);
  if (seat === 7 && (!(await exists(jobPath(1))) || (await read(jobPath(1))).state !== 'SUCCEEDED')) throw Error('Complete and inspect seat 1 first; refresh --status --seat=1 before submitting seat 7');
  if (await exists(taskPath(seat))) throw Error('Task ID already recorded; use --status, never resubmit');
  const existing = await exists(jobPath(seat)) ? await read(jobPath(seat)) : null;
  if (existing && existing.state !== 'reserved-not-submitted') throw Error('Submission already attempted or uncertain; no automatic retry');
  const ledgerBefore = await read(ledgerPath);
  const pendingCount = seats.filter(value => !ledgerBefore.jobs.some((job: Json) => job.path === jobPath(value))).length;
  const binding = await verifyProvider(pendingCount * 240);
  await atomic(`${run}/provider-binding.json`, binding);
  const requestHeaders = await headers();
  let job: Json = {};
  await withLedger(async ledger => {
    ledger.reservations ??= [];
    const missing = seats.filter(value => !ledger.reservations.some((row: Json) => row.owner === owner && row.path === jobPath(value)));
    budget(ledger, missing.length);
    for (const value of missing) {
      if (await exists(jobPath(value))) throw Error('Orphan pilot receipt exists; reconcile manually before any paid request');
      const prepared = (await checkedJob(value)).entry;
      const receipt = { ...prepared, owner, run, taskId: null, reservationId: `${owner}-${value}-v1`, state: 'reserved-not-submitted', reservedAt: new Date().toISOString(), productionAccepted: false };
      await writeFile(absolute(jobPath(value)), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
      ledger.reservations.push({ id: receipt.reservationId, owner, path: jobPath(value), model: 'wan3', duration: 12, credits: 240, state: receipt.state, taskId: null, reservedAt: receipt.reservedAt });
    }
    job = await read(jobPath(seat));
    const reservation = ledger.reservations.find((row: Json) => row.owner === owner && row.path === jobPath(seat));
    if (!reservation || reservation.credits !== 240 || reservation.state !== 'reserved-not-submitted' || job.state !== 'reserved-not-submitted' || job.taskId || await exists(taskPath(seat))) throw Error('Submission reservation is not unused');
    job.state = 'submission-started'; job.submittedAt = new Date().toISOString();
    await atomic(jobPath(seat), job);
    reservation.state = job.state; reservation.submittedAt = job.submittedAt;
    ledger.submissionAttempts = Number(ledger.submissionAttempts) + 1;
  });
  try {
    const response = await fetch(`${endpoint}/v1/image_to_video`, { method: 'POST', headers: requestHeaders, body: requestBytes.toString('utf8'), redirect: 'error', signal: AbortSignal.timeout(60_000) });
    job.httpStatus = response.status;
    if (!response.ok) { job.state = 'http-error-no-retry'; throw Error(`Runway HTTP ${response.status}; reservation retained`); }
    const result = await responseJson(response);
    if (typeof result.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(result.id)) throw Error('Task ID missing; submission outcome uncertain');
    // Save provider identity before status polling, ledger updates or any other API call.
    await writeFile(absolute(taskPath(seat)), JSON.stringify({ taskId: result.id, receivedAt: new Date().toISOString(), requestSha256: entry.requestSha256 }) + '\n', { flag: 'wx' });
    job.taskId = result.id; job.state = 'submitted'; job.estimatedCost = result.estimatedCost ?? null;
    await atomic(jobPath(seat), job); await updateLedger(job, seat);
    console.log(JSON.stringify({ seat, taskId: job.taskId, state: job.state, expectedCredits: 240, apiEstimatedCost: job.estimatedCost }));
  } catch (error) {
    if (job.state !== 'http-error-no-retry' && job.state !== 'submitted') job.state = 'submission-outcome-uncertain-no-retry';
    await atomic(jobPath(seat), job); await updateLedger(job, seat);
    throw error;
  }
}
async function updateLedger(job: Json, seat: Seat) {
  await withLedger(async ledger => {
    const reservation = ledger.reservations?.find((row: Json) => row.owner === owner && row.path === jobPath(seat));
    if (!reservation) throw Error('Durable reservation missing');
    Object.assign(reservation, { state: job.state, taskId: job.taskId, checkedAt: new Date().toISOString() });
    if (job.taskId) {
      const row = { path: jobPath(seat), taskId: job.taskId, model: 'wan3', state: job.state, apiMaximumCredits: Math.max(240, Number(job.estimatedCost?.credits ?? 0)), owner };
      const existing = ledger.jobs.find((item: Json) => item.path === row.path);
      if (existing && existing.taskId !== row.taskId) throw Error('Existing journal task ID differs');
      if (existing) Object.assign(existing, row); else ledger.jobs.push(row);
    }
  });
}
async function status(seat: Seat) {
  const receipt = await read(taskPath(seat)), job = await read(jobPath(seat));
  if (!/^[a-f0-9-]{36}$/i.test(receipt.taskId) || job.taskId && job.taskId !== receipt.taskId) throw Error('Task identity mismatch');
  const task = await responseJson(await fetch(`${endpoint}/v1/tasks/${receipt.taskId}`, { headers: await headers(), redirect: 'error', signal: AbortSignal.timeout(30_000) }));
  if (task.id !== receipt.taskId || !/^[A-Z_]{1,40}$/.test(task.status)) throw Error('Provider task identity/status mismatch');
  Object.assign(job, { taskId: receipt.taskId, state: task.status, checkedAt: new Date().toISOString() });
  if (typeof task.failureCode === 'string') job.failureCode = task.failureCode;
  await atomic(jobPath(seat), job); await updateLedger(job, seat);
  return { job, task };
}
async function download(seat: Seat) {
  const { job, task } = await status(seat), file = `${run}/original/pamela-seat-${seat}-wan3.mp4`;
  if (await exists(file)) { if (job.output?.sha256 !== sha(await readFile(absolute(file)))) throw Error('Existing output differs or lacks provenance'); return job.output; }
  if (task.status !== 'SUCCEEDED' || !Array.isArray(task.output) || task.output.length !== 1) throw Error('No single completed video available');
  const url = new URL(task.output[0]);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !/(^|\.)(cloudfront\.net|runwayml\.com)$/.test(url.hostname)) throw Error('Unexpected output host');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw Error(`Output download HTTP ${response.status}`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 100_000_000) { await reader.cancel(); throw Error('Output exceeds bounded download'); } chunks.push(next.value); }
  const bytes = Buffer.concat(chunks);
  await mkdir(absolute(`${run}/original`), { recursive: true });
  await writeFile(absolute(file), bytes, { flag: 'wx' });
  job.output = { path: file, sha256: sha(bytes), bytes: bytes.length }; await atomic(jobPath(seat), job);
  const ffprobe = 'C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin/ffprobe.exe';
  const { stdout } = await promisify(execFile)(ffprobe, ['-v', 'error', '-threads', '1', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', absolute(file)], { windowsHide: true, maxBuffer: 16000 });
  job.output.probe = JSON.parse(stdout); await atomic(jobPath(seat), job);
  return job.output;
}
async function main() {
  if (process.versions.node !== '24.21.0') throw Error('Use the project-pinned Node 24.21.0');
  const arguments_ = process.argv.slice(2), modes = arguments_.filter(value => ['--dry-run', '--submit', '--status', '--download'].includes(value));
  if (modes.length !== 1 || arguments_.some(value => !['--dry-run', '--submit', '--status', '--download', '--verify-api', '--seat=1', '--seat=7'].includes(value))) throw Error('Use --dry-run [--verify-api] | --submit|--status|--download --seat=1|7');
  if (modes[0] === '--dry-run') { if (arguments_.some(value => value.startsWith('--seat='))) throw Error('Dry-run prepares both seats'); await dryRun(arguments_.includes('--verify-api')); return; }
  const seatArgs = arguments_.filter(value => value.startsWith('--seat='));
  if (seatArgs.length !== 1 || arguments_.includes('--verify-api')) throw Error('Exactly one seat is required');
  const seat = Number(seatArgs[0].slice(7)) as Seat;
  if (modes[0] === '--submit') await submit(seat);
  else if (modes[0] === '--download') console.log(JSON.stringify({ seat, output: await download(seat) }));
  else { const { job } = await status(seat); console.log(JSON.stringify({ seat, taskId: job.taskId, state: job.state, checkedAt: job.checkedAt })); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
