import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateConfig } from '../src/media.ts';
import { safeFile } from '../src/library.ts';

// Explicitly approved single pilot. Separate actions make uncertain submission impossible to retry silently.
const root = fileURLToPath(new URL('../', import.meta.url));
const run = 'runs/20261108210457-pamela-v4-focused';
const planFile = path.join(root, run, 'runway-pilot.json');
const taskFile = path.join(root, 'private/runway-pamela-v4-task.json');
const plan = JSON.parse(await readFile(planFile, 'utf8'));
const key = (await privateConfig(root)).RUNWAY_API_KEY;
if (!key) throw Error('Runway API key is missing from this lab.');
const headers = { Authorization: `Bearer ${key}`, 'X-Runway-Version': '2024-11-06', 'Content-Type': 'application/json' };
const save = () => writeFile(planFile, JSON.stringify(plan, null, 2));
const action = process.argv[2];
if (action === 'submit') {
  if (plan.taskId || plan.state !== 'prepared-awaiting-cost-approval') throw Error('Pilot already submitted or uncertain; inspect its saved state.');
  if (plan.model !== 'gen4.5' || plan.count !== 1 || plan.durationSeconds !== 5 || plan.ratio !== '1104:832') throw Error('Pilot does not match the reviewed request.');
  const bytes = await readFile(await safeFile(root, plan.input.path));
  if (createHash('sha256').update(bytes).digest('hex') !== plan.input.sha256 || bytes.length > 5 * 1024 * 1024) throw Error('Input changed or exceeds the model limit.');
  plan.approval = 'Jakob explicitly approved this pilot and credit use today, 2026-11-08, in the main chat.';
  plan.submittedAt = new Date().toISOString(); plan.state = 'submission-started'; await save();
  let response: Response;
  try { response = await fetch('https://api.dev.runwayml.com/v1/image_to_video', { method: 'POST', headers, signal: AbortSignal.timeout(60000), body: JSON.stringify({ model: plan.model, duration: plan.durationSeconds, ratio: plan.ratio, promptText: plan.prompt, promptImage: `data:image/png;base64,${bytes.toString('base64')}` }) }); }
  catch { throw Error('Submission outcome is uncertain. Do not submit again automatically.'); }
  if (!response.ok) { plan.state = 'submission-rejected'; plan.httpStatus = response.status; await save(); throw Error(`Runway submission returned HTTP ${response.status}.`); }
  const result = await response.json();
  if (typeof result.id !== 'string') throw Error('Submission returned no task ID. Do not retry automatically.');
  plan.taskId = result.id; plan.estimatedCost = result.estimatedCost || null; plan.state = 'submitted'; await save();
  console.log(JSON.stringify({ taskId: plan.taskId, state: plan.state, estimatedCost: plan.estimatedCost }));
} else if (action === 'status') {
  if (!/^[a-zA-Z0-9-]+$/.test(plan.taskId || '')) throw Error('No valid saved task ID.');
  const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${plan.taskId}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Runway task returned HTTP ${response.status}.`);
  const task = await response.json();
  await mkdir(path.dirname(taskFile), { recursive: true });
  await writeFile(taskFile, JSON.stringify(task, null, 2));
  plan.state = task.status; plan.lastCheckedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ taskId: plan.taskId, state: plan.state, progress: task.progress, failureCode: task.failureCode }));
} else if (action === 'download') {
  const task = JSON.parse(await readFile(taskFile, 'utf8'));
  if (task.id !== plan.taskId || task.status !== 'SUCCEEDED' || task.output?.length !== 1) throw Error('No successful single output for this task.');
  const url = new URL(task.output[0]);
  if (url.protocol !== 'https:' || url.username || url.password || !/(?:\.cloudfront\.net|\.runwayml\.com)$/.test(url.hostname)) throw Error('Unexpected Runway output host.');
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`Video download returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 100 * 1024 * 1024 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw Error('Unexpected output file.');
  const output = `${run}/original/pamela-v4-vila-gen45-5s.mp4`;
  await writeFile(path.join(root, output), bytes, { flag: 'wx' });
  plan.output = { path: output, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  plan.downloadedAt = new Date().toISOString(); plan.decision = 'candidate-awaiting-motion-review'; await save();
  console.log(JSON.stringify(plan.output));
} else throw Error('Choose submit, status or download.');
