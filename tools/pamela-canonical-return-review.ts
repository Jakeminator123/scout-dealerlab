/** Local canonical-endpoint proof. Never submits jobs or modifies historical proofs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import sharp from 'sharp';
import { padCanonicalForIdle } from '../src/pamela-idle-source-projection.ts';

type Ref = { path: string; sha256: string };
type Variant = { id: string; start: Ref; end: Ref; source: Ref; startSourceFrame: number; proposedProofPrefix: { startInclusive: number; endInclusive: number; preexistingLooseCards: number } };
type Row = { outputFrame: number; phase: 'give-from-REDO' | 'raw-direct-return' | 'labelled-display-hold'; source: 'give' | 'generated' | 'canonical-end'; sourceFrame: number | null; generatedMotion: boolean };
type Recipe = { id: string; source: Ref; start: Ref; end: Ref; prefix: Variant['proposedProofPrefix']; looseCards: number; rows: Row[]; expectedFrames: number };
type Plan = { schemaVersion: number; dealerId: string; input: Ref; code: Ref[]; canonicalAnchor: Ref; nativeCanonical: Ref; recipes: Recipe[]; width: number; height: number; fps: number; productionAccepted: false };
const ROOT = 'runs/20261110-pamela-direct-return-pilot';
const DIR = `${ROOT}/review/canonical-return`, PLAN = `${DIR}/plan.json`, W = 1764, H = 1174;
const INPUT: Ref = { path: `${ROOT}/review/canonical-input-01/plan-v2.json`, sha256: 'f4fe3e13c4e09cf511ee6d93fbdc2a9d901f145270a23cf1ee5bb693e86e303c' };
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string): Promise<Ref> => ({ path, sha256: hash(await readFile(path)) });
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const checked = async (r: Ref) => { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, `Changed bytes: ${r.path}`); return b; };
const exists = async (p: string) => { try { await access(p); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } };
async function save(path: string, value: unknown) { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); return ref(path); }
async function imageRgb(path: string, width: number) {
  const p = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([p.info.width, p.info.height, p.info.channels], [width, H, 3]); return p.data;
}
function probe(path: string) {
  const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-threads', '1', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8', windowsHide: true, maxBuffer: 1_000_000 }));
  const v = p.streams.filter((s: any) => s.codec_type === 'video');
  return { videoStreams: v.length, audioStreams: p.streams.filter((s: any) => s.codec_type === 'audio').length, width: v[0]?.width, height: v[0]?.height, fps: v[0]?.avg_frame_rate, frames: Number(v[0]?.nb_read_frames), seconds: Number(p.format.duration), timeBase: v[0]?.time_base };
}
function native(p: ReturnType<typeof probe>, width: number, frames: number) {
  assert.deepEqual([p.videoStreams, p.audioStreams, p.width, p.height, p.fps, p.frames], [1, 0, width, H, '30/1', frames], 'Native format mismatch; no implicit resize');
  assert.ok(Math.abs(p.seconds - frames / 30) < 1 / 60);
}
async function prepare() {
  const p = JSON.parse((await checked(INPUT)).toString()); assert.equal(p.dealerId, 'pamela-pilot');
  await checked(p.canonicalAnchor); await checked(p.nativeCanonical);
  assert.equal(p.canonicalAnchor.sha256, 'ac2924b76ebab596918fa802b6145628ee805e0b37a04d1117c8dc4f4aae2621');
  const recipes: Recipe[] = [], sourceFormats = [];
  for (const v of p.variants as Variant[]) {
    assert.ok(['P1-K1', 'P1-K2'].includes(v.id)); const k2 = v.id === 'P1-K2';
    assert.deepEqual([v.proposedProofPrefix.startInclusive, v.proposedProofPrefix.endInclusive, v.startSourceFrame], k2 ? [22, 218, 218] : [0, 194, 194]);
    for (const r of [v.source, v.start, v.end]) await checked(r);
    await imageRgb(v.start.path, W); await imageRgb(v.end.path, W);
    const observed = probe(v.source.path); native(observed, 1762, 360); sourceFormats.push({ id: v.id, observed });
    const rows: Row[] = [], append = (row: Omit<Row, 'outputFrame'>) => rows.push({ outputFrame: rows.length, ...row });
    for (let f = v.proposedProofPrefix.startInclusive; f <= v.proposedProofPrefix.endInclusive; f++) append({ phase: 'give-from-REDO', source: 'give', sourceFrame: f, generatedMotion: false });
    for (let f = 0; f < 90; f++) append({ phase: 'raw-direct-return', source: 'generated', sourceFrame: f, generatedMotion: true });
    for (let f = 0; f < 30; f++) append({ phase: 'labelled-display-hold', source: 'canonical-end', sourceFrame: null, generatedMotion: false });
    assert.equal(rows.length, k2 ? 317 : 315);
    recipes.push({ id: v.id, source: v.source, start: v.start, end: v.end, prefix: v.proposedProofPrefix, looseCards: k2 ? 2 : 1, rows, expectedFrames: rows.length });
  }
  assert.deepEqual(recipes.map(r => r.id).sort(), ['P1-K1', 'P1-K2']);
  await mkdir(DIR, { recursive: true });
  const code = await Promise.all(['tools/pamela-canonical-return-review.ts', 'src/pamela-idle-source-projection.ts'].map(ref));
  const plan: Plan = { schemaVersion: 1, dealerId: 'pamela-pilot', input: INPUT, code, canonicalAnchor: p.canonicalAnchor, nativeCanonical: p.nativeCanonical, recipes, width: W, height: H, fps: 30, productionAccepted: false };
  const saved = await save(PLAN, plan);
  await save(`${DIR}/preparation-check.json`, { plan: saved, sourceFormats, nativeTransforms: 'Only 1762-wide give prefix: copy-edge pad one column each side, original RGB exact at x+1. Generated90frames stay native1764. End PNG already contains explicit canonical transform.', noBSegments: true, noRawReturnPatchOrBlend: true, displayHoldFrames: 30, displayHoldIsMotionEvidence: false, apiCalls: 0, productionAccepted: false });
  return { plan: saved, recipes: recipes.map(r => ({ id: r.id, frames: r.expectedFrames, seconds: r.expectedFrames / 30 })), status: 'prepared-no-generated-films-read' };
}
async function loadPlan(sha: string) {
  const p: Plan = JSON.parse((await checked({ path: PLAN, sha256: sha })).toString());
  assert.equal(p.dealerId, 'pamela-pilot'); await checked(p.input); await checked(p.canonicalAnchor); await checked(p.nativeCanonical);
  for (const r of p.code) await checked(r); return p;
}
async function jobStatus(r: Recipe, jobId: string) {
  assert.match(jobId, /^[a-z0-9][a-z0-9-]+$/);
  const directory = `${ROOT}/jobs/${jobId}`, path = `${directory}/original.mp4`;
  if (!await exists(path)) return { passed: false as const, status: 'missing-generated-original', original: null };
  const original = await ref(path), observed = probe(path); native(observed, W, 90);
  const job = await json(`${directory}/plan.json`), task = await json(`${directory}/task.json`), proof = await json(`${directory}/native-verification.json`);
  assert.equal(job.dealerId, 'pamela-pilot'); assert.equal(job.model, 'wan3'); assert.equal(job.duration, 3);
  assert.match(task.taskId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(task.planSha256, (await ref(`${directory}/plan.json`)).sha256); assert.equal(proof.taskId, task.taskId);
  assert.deepEqual(proof.output, original); assert.equal(proof.passed, true); assert.equal(job.inputs.length, 2);
  for (const [position, expected] of [['first', r.start], ['last', r.end]] as const) {
    const input = job.inputs.find((x: any) => x.position === position); assert.ok(input);
    assert.deepEqual([input.path, input.sha256, input.width, input.height], [expected.path, expected.sha256, W, H]); await checked(expected);
  }
  assert.notEqual(r.start.path, r.end.path);
  return { passed: true as const, status: 'native-input-task-provenance-passed-awaiting-visual-QA', original, observed, taskId: task.taskId, jobPlanSha256: task.planSha256 };
}
async function render(p: Plan, r: Recipe, sha: string, jobId: string, take: string) {
  assert.match(take, /^take-[0-9]{2}$/); const state = await jobStatus(r, jobId); assert.ok(state.passed && state.original, 'Generated movie missing');
  await checked(r.source); await checked(r.start); await checked(r.end);
  const dir = `${DIR}/${r.id}/${take}`; assert.ok(!await exists(dir), 'Existing takes are immutable'); await mkdir(`${dir}/qa`, { recursive: true });
  for (const [name, path, first, last] of [['give', r.source.path, r.prefix.startInclusive, r.prefix.endInclusive], ['generated', state.original.path, 0, 89]] as const) {
    await mkdir(`${dir}/source/${name}`, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', path, '-vf', `trim=start_frame=${first}:end_frame=${last + 1}`, '-an', '-fps_mode', 'passthrough', '-start_number', String(first), '-threads', '1', `${dir}/source/${name}/frame-%04d.png`], { windowsHide: true, maxBuffer: 1_000_000 });
  }
  const frame = async (kind: string, f: number) => imageRgb(`${dir}/source/${kind}/frame-${String(f).padStart(4, '0')}.png`, kind === 'give' ? 1762 : W);
  assert.equal(hash(Buffer.from(padCanonicalForIdle(await frame('give', r.prefix.endInclusive), 3))), hash(await imageRgb(r.start.path, W)), 'Prefix last frame differs from generation start');
  const end = await imageRgb(r.end.path, W), label = Buffer.from(`<svg width="920" height="48"><rect width="920" height="48" rx="7" fill="#13222b"/><text x="14" y="31" fill="white" font-family="sans-serif" font-size="23">VISNINGSHÅLLNING · kanonisk VILA · ${r.looseCards} kort · ingen ny rörelse</text></svg>`);
  const hold = await sharp(end, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: label, left: 20, top: 16 }]).removeAlpha().raw().toBuffer();
  const output = `${dir}/P1-canonical-proof.mp4`, encoder = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-video_size', `${W}x${H}`, '-framerate', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-threads', '4', '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360', '-movflags', '+faststart', '-n', output], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  const done = once(encoder, 'close'); let errors = ''; encoder.stderr.on('data', b => { errors = (errors + b.toString()).slice(-4000); });
  const prefixFrames = r.prefix.endInclusive - r.prefix.startInclusive + 1, boundaries = [0, prefixFrames - 1, prefixFrames, prefixFrames + 89, prefixFrames + 90, r.rows.length - 1];
  const chosen = new Set(boundaries.flatMap(f => [-2, -1, 0, 1, 2].map(d => f + d)).filter(f => f >= 0 && f < r.rows.length)), rgbHashes = [];
  try {
    for (const row of r.rows) {
      const rgb = row.source === 'canonical-end' ? hold : row.source === 'give' ? Buffer.from(padCanonicalForIdle(await frame('give', row.sourceFrame!), 3)) : await frame('generated', row.sourceFrame!);
      rgbHashes.push({ frame: row.outputFrame, sha256: hash(rgb) });
      if (chosen.has(row.outputFrame)) await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${dir}/qa/pre-encode-${String(row.outputFrame).padStart(4, '0')}.png`);
      if (!encoder.stdin.write(rgb)) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end(); const [exitCode] = await done; assert.equal(exitCode, 0, errors);
  } catch (e) { encoder.stdin.destroy(); encoder.kill(); throw e; }
  const observed = probe(output); native(observed, W, r.expectedFrames);
  const chosenFrames = [...chosen].sort((a, b) => a - b);
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', output, '-vf', `select='${chosenFrames.map(f => `eq(n,${f})`).join('+')}'`, '-fps_mode', 'vfr', '-threads', '1', `${dir}/qa/encoded-%03d.png`], { windowsHide: true, maxBuffer: 1_000_000 });
  const frameMap = await save(`${dir}/frame-map.json`, { rows: r.rows, fps: 30, indexBase: 0, sourcePadding: 'give1762→1764:1copy-edgecolumn each side', displayHold: { frames: 30, input: r.end, labelBox: [20, 16, 920, 48], generatedMotion: false }, BFrames: 0, rawReturnBlendFrames: 0 });
  const evidence = await save(`${dir}/evidence.json`, { schemaVersion: 1, dealerId: p.dealerId, id: r.id, plan: { path: PLAN, sha256: sha }, generated: state, output: await ref(output), observed, frameMap, endpoints: { start: r.start, end: r.end }, rgbHashes, encodedQaFrameMap: chosenFrames.map((frame, i) => ({ frame, file: `qa/encoded-${String(i + 1).padStart(3, '0')}.png` })), canonicalAnchor: p.canonicalAnchor, prefixLastEqualsInputStartRgb: true, rawGeneratedFramesPreserved: 90, noCardOrHandPatch: true, noBOpeningBridgeClosing: true, displayHoldIsMotionEvidence: false, visualQaPending: true, accepted: false, productionAccepted: false, apiCalls: 0 });
  return { evidence, output: await ref(output), observed, status: 'rendered-visual-QA-required' };
}
sharp.concurrency(1);
const [action, ...args] = process.argv.slice(2), option = (name: string) => args.find(s => s.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
if (action === 'prepare') console.log(JSON.stringify(await prepare()));
else {
  assert.ok(['check', 'render'].includes(action), 'Use prepare, check or render');
  const sha = option('plan-sha'); assert.match(sha, /^[a-f0-9]{64}$/); const p = await loadPlan(sha), r = p.recipes.find(r => r.id === option('variant')); assert.ok(r, 'Choose P1-K1 or P1-K2');
  console.log(JSON.stringify(action === 'check' ? await jobStatus(r, option('job')) : await render(p, r, sha, option('job'), option('take'))));
}
