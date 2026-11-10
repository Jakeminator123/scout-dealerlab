import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { privateConfig } from '../src/media.ts';

// Sole paid writer for this two-job pilot. No retries, auto-refunds, activation or publication.
// prepare | breath|glance submit|status|download|qa
const root = fileURLToPath(new URL('../', import.meta.url));
const run = 'runs/20261109-pamela-idle-pilot';
const folder = path.join(root, run);
const owner = 'pamela-idle-pilot';
const ledgerPath = path.join(root, 'runs/20261108-pamela-deal-pilot/qa/budget-ledger.json');
const source = 'runs/20261109-pamela-reference-kit/original/pamela-vila-station.png';
const sourceHash = 'ac2924b76ebab596918fa802b6145628ee805e0b37a04d1117c8dc4f4aae2621';
const execute = promisify(execFile);
const specs = {
  breath: { duration: 6, credits: 120, role: 'grundloop-andning', prompt: "Locked camera, continuous six-second idle breathing loop. The identical first and last VILA image define the exact resting pose. Preserve Pamela's mature face, age, hair, black blazer, ivory blouse, body proportions, lighting and entire framing. She looks calmly forward with a closed relaxed mouth. Only one very subtle, slow natural inhale and exhale moves the upper chest and fabric; return to the starting breathing phase smoothly. Head, gaze, shoulders, arms, wrists and every finger remain in their original resting positions. Keep both hands planted, with unchanged finger anatomy. Keep the black shoe and its single white card completely stationary. Preserve the green background and green tabletop. No speaking, smile change, gestures, card dealing, new objects, zoom, pan or cut. End naturally in the exact original VILA pose with quiet continuous breathing, suitable for a direct repeat." },
  glance: { duration: 3, credits: 60, role: 'viloinstick-blick-ned', prompt: "Locked camera, continuous three-second resting-pose variation. The identical first and last VILA image define the exact resting pose. Preserve Pamela's mature face, age, hair, black blazer, ivory blouse, body proportions, lighting and full framing. Begin looking calmly toward the viewer. Briefly lower only the eyes toward the tabletop in front of her, then gently return the gaze fully forward before the end. Keep the head nearly still, mouth closed and expression unchanged. Maintain very quiet natural breathing. Both shoulders, arms, elbows, wrists, palms and all fingers stay in their original resting positions throughout. Keep the black shoe and its single white card completely stationary. Preserve the green background and tabletop. No speaking, smile change, hand movement, reaching, card dealing, extra fingers, new objects, zoom, pan or cut. End naturally in the exact original forward-looking VILA pose." },
} as const;
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
  return { credits, jobCount: jobs.length + pending.length, remaining: Number(ledger.approved.runwayCredits) - credits };
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
  for (const name of names) if (await exists(jobPath(name))) throw Error('Pilot receipt exists; do not prepare or submit again.');
  for (const spec of Object.values(specs)) if (spec.prompt.length > 1000) throw Error('Prompt exceeds conservative 1000-character cap.');
  await mkdir(folder, { recursive: true });
  const preparedAt = new Date().toISOString();
  const jobs: Job[] = names.map(name => ({ schemaVersion: 1, owner, name, run, model: 'wan3', ratio: 'auto_1080p', duration: specs[name].duration, expectedCredits: specs[name].credits, state: 'prepared-not-submitted', taskId: null, reservationId: `${owner}-${name}-v1`, reservedAt: preparedAt, prompt: specs[name].prompt, promptSha256: sha(specs[name].prompt), input: { path: source, sha256: sourceHash, bytes: bytes.length, width: 1536, height: 1024, transform: 'none; identical complete original PNG supplied at first and last positions; no resize/crop/padding' }, poseBefore: 'VILA', poseAfter: 'VILA', role: specs[name].role, decision: 'candidate-awaiting-motion-and-loop-review', productionAccepted: false, activated: false }));
  await writeFile(path.join(folder, 'model-support.json'), JSON.stringify({ verifiedAt: preparedAt, model: 'wan3', endpoint: 'https://api.dev.runwayml.com/v1/image_to_video', apiVersion: '2024-11-06', ratio: 'auto_1080p', durationRangeSeconds: [2, 30], supportsFirstAndLast: true, inputReferencesMixedWithKeyframes: false, audio: false, inputAspectRatio: 1.5, sourceUnchanged: true, source: { path: source, sha256: sourceHash }, creditsPerSecond: 20, totalReservedCredits: 180, maxJobs: 2, maxCreditsPerJob: 120, sources: ['https://docs.dev.runwayml.com/assets/inputs/', 'https://docs.dev.runwayml.com/guides/pricing/'], invoiceVerified: false }, null, 2) + '\n', { flag: 'wx' });
  await withLedger(async ledger => {
    const before = totals(ledger);
    if (ledger.approved.runwayCredits > 2000 || before.credits + 180 > Math.min(2000, ledger.approved.runwayCredits) || before.jobCount + 2 > Math.min(16, ledger.approved.maxPaidVideoJobs) || 120 > Math.min(250, ledger.approved.maxJobCredits)) throw Error('Approved budget does not cover both jobs.');
    if ((ledger.reservations ?? []).some((r: Json) => r.owner === owner) || ledger.jobs.some((j: Json) => j.path.startsWith(run + '/'))) throw Error('Pilot already reserved or accepted.');
    for (const job of jobs) { await writeFile(jobPath(job.name), JSON.stringify(job, null, 2) + '\n', { flag: 'wx' }); await writeFile(path.join(folder, `${job.name}-prompt.txt`), job.prompt + '\n', { flag: 'wx' }); }
    ledger.reservations ??= [];
    for (const job of jobs) ledger.reservations.push({ id: job.reservationId, owner, path: receiptPath(job.name), model: job.model, duration: job.duration, credits: job.expectedCredits, state: 'reserved-not-submitted', taskId: null, reservedAt: preparedAt, budgetAfterBothReservations: { conservativeReservedCredits: before.credits + 180, remainingCredits: before.remaining - 180, jobCount: before.jobCount + 2 } });
    return before;
  });
  for (const job of jobs) { job.state = 'reserved-not-submitted'; await atomicJson(jobPath(job.name), job); }
  console.log(JSON.stringify({ state: 'reserved-not-submitted', reservations: jobs.map(j => ({ name: j.name, credits: j.expectedCredits, receipt: receiptPath(j.name), promptCharacters: j.prompt.length })), reservedCredits: 180, taskIds: [] }));
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
    if (ledger.jobs.filter((j: Json) => j.owner === owner).some((j: Json) => j.apiMaximumCredits > specs[j.path.includes('breath') ? 'breath' : 'glance'].credits)) throw Error('Previous job exceeded its quoted cap; do not submit further.');
    if (totals(ledger).credits > 2000 || totals(ledger).jobCount > 16) throw Error('Shared budget exceeded.');
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
async function qa(job: Job) {
  if (!job.output || job.state !== 'SUCCEEDED') throw Error('Download a completed original before QA.');
  const movie = path.join(root, job.output.path);
  if (sha(await readFile(movie)) !== job.output.sha256) throw Error('Original output hash changed.');
  const dir = path.join(folder, 'qa', job.name); await mkdir(dir, { recursive: true });
  if (await exists(path.join(dir, 'inspection.json'))) throw Error('QA receipt already exists; inspect it instead of overwriting.');
  const probe = JSON.parse((await execute('ffprobe', ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,codec_name,pix_fmt:format=duration','-of','json',movie], { windowsHide: true, maxBuffer: 12000 })).stdout);
  const stream = probe.streams[0], [num, den] = stream.avg_frame_rate.split('/').map(Number), fps = num / den, frameCount = Number(stream.nb_read_frames);
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || !Number.isFinite(fps) || fps <= 0) throw Error('Video timing could not be measured.');
  await execute('ffmpeg', ['-v','error','-nostdin','-i',movie,'-fps_mode','passthrough','-threads','4','-n',path.join(dir,'frame-%03d.png')], { windowsHide: true, timeout: 120000, maxBuffer: 2000 });
  // Every frame is retained and included in a contact sheet; native PNGs remain the anatomy evidence.
  const pageFrames = 60, thumbWidth = 256, thumbHeight = Math.round(stream.height * thumbWidth / stream.width), sheets: Json[] = [];
  for (let start = 0; start < frameCount; start += pageFrames) {
    const count = Math.min(pageFrames, frameCount - start), rows = Math.ceil(count / 6), inputs: OverlayOptions[] = [];
    for (let j = 0; j < count; j++) inputs.push({ input: await sharp(path.join(dir,`frame-${String(start+j+1).padStart(3,'0')}.png`)).resize(thumbWidth,thumbHeight).png().toBuffer(), left: (j%6)*thumbWidth, top: Math.floor(j/6)*(thumbHeight+22) });
    const labels = `<svg width="${thumbWidth*6}" height="${rows*(thumbHeight+22)}">${Array.from({length:count},(_,j)=>`<text x="${(j%6)*thumbWidth+8}" y="${Math.floor(j/6)*(thumbHeight+22)+thumbHeight+16}" fill="white" font-family="Arial" font-size="13">${start+j} / ${((start+j)/fps).toFixed(2)}s</text>`).join('')}</svg>`;
    inputs.push({ input: Buffer.from(labels), left: 0, top: 0 });
    const filename = `all-frames-${String(start).padStart(3,'0')}.jpg`;
    await sharp({ create: { width: thumbWidth*6, height: rows*(thumbHeight+22), channels:3, background:'#141a1d' } }).composite(inputs).jpeg({quality:95}).toFile(path.join(dir, filename));
    sheets.push({ path:`${run}/qa/${job.name}/${filename}`, firstFrame:start, lastFrame:start+count-1, allFramesIncluded:true });
  }
  const list = path.join(dir,'loop-concat.txt');
  const localMovie = path.relative(dir,movie).replaceAll('\\','/');
  await writeFile(list, Array(3).fill(`file '${localMovie}'`).join('\n')+'\n',{flag:'wx'});
  const loop = path.join(dir,'raw-loop-3x.mp4');
  await execute('ffmpeg',['-v','error','-nostdin','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart','-n',loop],{windowsHide:true,timeout:60000,maxBuffer:2000});
  const record = { schemaVersion:1, checkedAt:new Date().toISOString(), film:{...job.output,width:stream.width,height:stream.height,fps,frameCount,duration:Number(probe.format.duration),codec:stream.codec_name,pixelFormat:stream.pix_fmt}, input:job.input, sourceAspectRatio:1.5, outputAspectRatio:stream.width/stream.height, expectedDuration:job.duration, contactSheets:sheets, nativeFramePattern:`${run}/qa/${job.name}/frame-%03d.png`, frameNumbering:'filename001 means frameIndex0', loop:{path:`${run}/qa/${job.name}/raw-loop-3x.mp4`,sha256:sha(await readFile(loop)),method:'three stream-copy concatenations of the complete original; no crossfade, freeze, frame removal, interpolation or fps conversion'}, visualReview:{status:'pending',allFramesViewed:false,nativeFrameIndices:[],findings:[]}, productionAccepted:false, activated:false };
  await atomicJson(path.join(dir,'inspection.json'), record);
  job.qa = { path:`${run}/qa/${job.name}/inspection.json`, film:record.film, status:'awaiting-visual-review' }; await atomicJson(jobPath(job.name),job);
  console.log(JSON.stringify({name:job.name,film:record.film,contactSheets:sheets,loop:record.loop}));
}

async function main() {
  const [name, action] = process.argv.slice(2);
  if (name === 'prepare' && !action && process.argv.length === 3) return prepare();
  if (!Object.hasOwn(specs,name ?? '') || !['submit','status','download','qa'].includes(action ?? '') || process.argv.length !== 4) throw Error('Usage: prepare | breath|glance submit|status|download|qa');
  if (action === 'submit') return submit(name as Name);
  const job = await load(name as Name);
  if (action === 'qa') return qa(job);
  if (action === 'download') { console.log(JSON.stringify(await download(job))); return; }
  await status(job); console.log(JSON.stringify({name:job.name,taskId:job.taskId,state:job.state,failureCode:job.failureCode}));
}
try { await main(); }
catch (error) { console.error(error instanceof Error ? error.message : 'Pilot failed; inspect durable receipts.'); process.exitCode = 1; }
