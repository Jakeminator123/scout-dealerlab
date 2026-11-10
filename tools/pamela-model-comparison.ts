import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { privateConfig } from '../src/media.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const v5 = process.argv[2] === 'wan3give';
const ready = process.argv[2] === 'wan3ready';
const production = v5 || ready;
const run = ready ? 'runs/20261109-pamela-reference-kit' : v5 ? 'runs/20261108-pamela-v5-body' : 'runs/20261108-pamela-model-comparison';
const folder = path.join(root, run);
const key = (await privateConfig(root)).RUNWAY_API_KEY;
if (!key) throw Error('No local Runway API key.');
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': '2024-11-06' };
const allowed = { gen45: { model: 'gen4.5', ratio: '1104:832', credits: 60, duration: 5 }, wan3: { model: 'wan3', ratio: 'auto_720p', credits: 50, duration: 5 }, wan3give: { model: 'wan3', ratio: 'auto_1080p', credits: 120, duration: 6 }, wan3ready: { model: 'wan3', ratio: 'auto_1080p', credits: 60, duration: 3 } } as const;
const name = process.argv[2] as keyof typeof allowed, action = process.argv[3];
if (!Object.hasOwn(allowed, name)) throw Error('Only the two approved comparison jobs are supported.');
const spec = allowed[name], jobPath = path.join(folder, `${name}.json`);
await mkdir(folder, { recursive: true });
await mkdir(path.join(folder, 'original'), { recursive: true });
if (action === 'submit') {
  const source = ready ? `${run}/original/pamela-vila-station.png` : v5 ? `${run}/original/pamela-v5-body.png` : 'runs/20261108210457-pamela-v4-focused/input/pamela-v4-1104x832-padded.png';
  const bytes = await readFile(path.join(root, source));
  if(bytes.length>3500000)throw Error('Image exceeds the bounded data-URI input size.');
  const base = JSON.parse(await readFile(path.join(root, 'runs/20261108210457-pamela-v4-focused/runway-pilot.json'), 'utf8'));
  const plan=JSON.parse(await readFile(path.join(root,'references/production-plan.json'),'utf8'));
  if(production&&(plan.budget.knownReservedRunwayCredits+spec.credits>plan.budget.runwayCredits||plan.budget.videoJobs+1>plan.budget.maxVideoJobs||spec.credits>plan.budget.maxCreditsPerJob))throw Error('Pilot budget exceeded.');
  const v5Prompt='Locked camera, one continuous six-second shot of exactly Pamela in the supplied first and last frame. Preserve her exact face, mature age, facial lines, short brunette hair, ivory blouse, black blazer, proportions, framing and continuous waist below her hands. Her face must not become younger or a different woman. Uniform green screen. Keep torso and head still. From 0 to 0.7 seconds hold the exact resting pose. From 0.7 to 2.0 seconds her left hand, on camera-right, reaches to an invisible card shoe at waist height just outside her right elbow, pinches one invisible stiff card and transfers it toward her other hand. From 2.0 to 3.6 seconds her right hand, on camera-left, makes one low, smooth central dealing motion forward toward the camera over an invisible horizontal tabletop, releases the invisible card, then withdraws. By 5.2 seconds both hands return precisely to the first resting pose. Hold that pose through the end. Preserve natural finger anatomy and plausible wrist rotation. Only forearms, wrists and fingers move; no speaking, camera movement, zoom, cuts or torso drift. Both elbows and fingertips stay inside the frame. No visible card, table, shoe, rail, stool or other props; these will be rendered as separate calibrated layers. No chopped abdomen or floating torso. The last pose exactly matches the first.';
  const job = { name, model: spec.model, ratio: spec.ratio, duration: spec.duration, expectedCredits: spec.credits,
    budget: { runwayTotal: 2000, perJob: 250, maxJobs: 16, thisJobMaxCredits: spec.credits, knownReservedBefore:plan.budget.knownReservedRunwayCredits },
    approval: 'Jakob approved pilot budget and model comparison in main chat 2026-11-08.',
    input: { path: source, sha256: createHash('sha256').update(bytes).digest('hex'), width: production?1536:1104, height: production?1024:832, resize: production?null:[1104,736], padding: production?[0,0,0,0]:[0,48,0,48] },
    prompt: ready?'Locked camera, one continuous three-second transition between these exact first and last images. Preserve the exact mature Pamela face, age, hair, black blazer, ivory blouse, body scale, green background and black shoe position. Start in the first resting VILA pose. Pamela calmly lowers her gaze toward the black shoe at camera-right and moves only her left forearm and hand to its front outlet. Her fingers gently contact the upper edge of the single plain white card and finish in exactly the last REDO pose, ready to draw. The white card stays seated in the shoe and is not extracted. Her other hand remains still in its original resting position. Smooth natural shoulder, elbow, wrist and finger motion, with no passage through the plastic and no hovering at the endpoint. Keep all elbows and fingertips visible inside the frame throughout. No zoom, camera motion, cuts, extra card, extra fingers, table edge, room or new object. Hold the final contact pose for the last half second.':v5?v5Prompt:base.prompt, endpointMode: ready?'VILA-first-REDO-last':spec.model === 'wan3' ? 'same-first-and-last' : 'first-only', motionSource:production?null:undefined, trackPolicy:production?'New image geometry and generated timing. No old card tracks or frame times inherited.':undefined, lastInput:null as {path:string;sha256:string}|null, state: 'submission-started', startedAt: new Date().toISOString(), taskId: null as string | null, estimatedCost: null as unknown };
  const lastPath=ready?`${run}/original/pamela-redo-station.png`:source;
  const lastBytes=ready?await readFile(path.join(root,lastPath)):bytes;
  if(lastBytes.length>3500000)throw Error('Last image exceeds bounded input size.');
  if(ready)job.lastInput={path:lastPath,sha256:createHash('sha256').update(lastBytes).digest('hex')};
  await writeFile(jobPath, JSON.stringify(job, null, 2), { flag: 'wx' });
  if(production){plan.budget.knownReservedRunwayCredits+=spec.credits;plan.budget.videoJobs+=1;plan.budget.submissionAttempts+=1;await writeFile(path.join(root,'references/production-plan.json'),JSON.stringify(plan,null,2));}
  const uri = `data:image/png;base64,${bytes.toString('base64')}`;
  const lastUri=`data:image/png;base64,${lastBytes.toString('base64')}`;
  const response = await fetch('https://api.dev.runwayml.com/v1/image_to_video', { method: 'POST', headers, signal: AbortSignal.timeout(60000), body: JSON.stringify({ model: spec.model, duration: spec.duration, ratio: spec.ratio, promptText: job.prompt, promptImage: spec.model === 'wan3' ? [{ uri, position: 'first' }, { uri:lastUri, position: 'last' }] : uri, ...(spec.model === 'wan3' ? { audio: false } : {}) }) });
  if (!response.ok) throw Error(`Runway returned HTTP ${response.status}; saved attempt must be inspected before any retry.`);
  const result = await response.json();
  if (!result.id) throw Error('Missing task ID; do not retry.');
  job.taskId = result.id; job.estimatedCost = result.estimatedCost || null; job.state = 'submitted';
  await writeFile(jobPath, JSON.stringify(job, null, 2));
  console.log(JSON.stringify({ name, taskId: job.taskId, expectedCredits: spec.credits, estimatedCost: job.estimatedCost }));
} else if (action === 'status' || action === 'download') {
  const job = JSON.parse(await readFile(jobPath, 'utf8'));
  if (!/^[\da-z-]+$/i.test(job.taskId || '')) throw Error('No saved task ID.');
  const privateFile = path.join(root, 'private', `pamela-comparison-${name}.json`);
  if (action === 'status') {
    const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${job.taskId}`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Task status HTTP ${response.status}.`);
    const task = await response.json();
    await writeFile(privateFile, JSON.stringify(task, null, 2));
    job.state = task.status; job.checkedAt = new Date().toISOString(); await writeFile(jobPath, JSON.stringify(job, null, 2));
    console.log(JSON.stringify({ name, taskId: job.taskId, state: task.status, progress: task.progress, failureCode: task.failureCode }));
  } else {
    const task = JSON.parse(await readFile(privateFile, 'utf8'));
    if (task.id !== job.taskId || task.status !== 'SUCCEEDED' || task.output?.length !== 1) throw Error('No verified single output.');
    const url = new URL(task.output[0]);
    if (url.protocol !== 'https:' || !/(?:\.cloudfront\.net|\.runwayml\.com)$/.test(url.hostname)) throw Error('Unexpected output host.');
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(`Download HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.toString('ascii',4,8) !== 'ftyp') throw Error('Expected MP4.');
    const output = ready?`${run}/original/pamela-vila-till-redo-wan3.mp4`:v5?`${run}/original/pamela-v5-pos4-iv-wan3.mp4`:`${run}/original/pamela-v4-${name}-padded-idle.mp4`;
    await writeFile(path.join(root, output), bytes, { flag: 'wx' });
    job.output = { path: output, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }; job.decision = 'candidate-awaiting-motion-review';
    await writeFile(jobPath, JSON.stringify(job, null, 2)); console.log(JSON.stringify(job.output));
  }
} else throw Error('Choose submit, status or download.');
