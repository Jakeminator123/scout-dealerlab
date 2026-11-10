/** Local, hash-bound raw-source review adapter. No API calls or runtime approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { once } from 'node:events';
import sharp from 'sharp';
import { pamelaIdleChainPlan } from '../src/pamela-idle-chain-plan.ts';
import { mixTemporalComposites, temporalJoin } from '../src/pamela-temporal-join.ts';
import { padCanonicalForIdle } from '../src/pamela-idle-source-projection.ts';
import { keyPamelaFrame } from '../src/pamela-key.ts';
import { planDealerSequence, type DealerMotionContract } from '../src/dealer-motion-contract.ts';

type Ref = { path: string; sha256: string };
type Asset = Ref & { id: string; width: number; height: number; fps: number; frames: number };
type Frame = { source: string; frame: number };
type Row = { outputFrame: number; segment: string; a: Frame; b?: Frame; weightB: number; retainedLayer: Ref | null; bRetainedLayer?: Ref };
type Variant = {
  id: string; ordinal: number; start: Ref & { source: Ref; sourceFrame: number; width: number; height: number };
  end: Ref & { sourceFrame: number; width: number; height: number }; retainedCards: { layer: Ref };
  expectedNativeFps: number; expectedFrames: number;
};
type Recipe = { id: string; contractPlanId: string; rows: Row[]; generated: { path: string; expected: { width: number; height: number; fps: number; frames: number } }; start: Ref; end: Ref; retainedLayer: Ref; looseCards: number; seams: { frame: number; from: string; to: string; status: string }[]; overrideInput?: Ref; reuseDecoded?: { directory: string; evidence: Ref; prefixFrames: number } };
type Plan = { schemaVersion: number; dealerId: string; input: Ref; code: Ref[]; contract: Ref; v1: Ref; evidence: Ref[]; assets: Asset[]; recipes: Recipe[]; width: number; height: number; fps: number; adapter: Record<string, unknown>; contractPlans: unknown[]; productionAccepted: false };
const ROOT = 'runs/20261110-pamela-direct-return-pilot';
const REVIEW = `${ROOT}/review`, PLAN = `${REVIEW}/plan.json`, W = 1764, H = 1174;
const INPUT: Ref = { path: `${ROOT}/preparation/plan.json`, sha256: 'f01154315e1d2cd71342d6c84616a3e40e831e9d1299b59651df46b411b8b7f6' };
const BANK: Ref = { path: 'runs/20261110-pamela-mask-bank/take-01/evidence.json', sha256: 'ed63d72517802affc241445070c3242c5440d0ab2122d6f55a36b22f372967dc' };
const OPENING: Ref = { path: 'runs/20261110-pamela-idle-chain-opening/take-01/evidence.json', sha256: 'f542279ec36087efdf8100831825ca315f25c60f0a4aa6b1d4066cf1c847c233' };
const BRIDGE: Asset = { id: 'bridge', path: 'runs/20261109-pamela-idle-ready-bridge/run-01/original/pamela-B-to-REDO-wan3-3s.mp4', sha256: '2df2e054051e85e4200025a8b955e0c871e41d6cf0fc78b59a25d107e941e569', width: W, height: H, fps: 30, frames: 90 };
sharp.concurrency(1);
const hash = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string): Promise<Ref> => ({ path, sha256: hash(await readFile(path)) });
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path: string) => { try { await access(path); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } };
async function checked(r: Ref) { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, `Changed source: ${r.path}`); return b; }
async function save(path: string, value: unknown) { await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); return ref(path); }
function probe(path: string) {
  const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-threads', '1', '-count_frames', '-show_streams', '-show_format', '-of', 'json', path], { encoding: 'utf8', windowsHide: true, maxBuffer: 1_000_000 }));
  const v = p.streams.filter((s: any) => s.codec_type === 'video');
  return { videoStreams: v.length, audioStreams: p.streams.filter((s: any) => s.codec_type === 'audio').length, width: v[0]?.width, height: v[0]?.height, fps: v[0]?.avg_frame_rate, frames: Number(v[0]?.nb_read_frames), timeBase: v[0]?.time_base, seconds: Number(p.format.duration) };
}
function verifyFormat(p: ReturnType<typeof probe>, expected: { width: number; height: number; fps: number; frames: number }) {
  return p.videoStreams === 1 && p.audioStreams === 0 && p.width === expected.width && p.height === expected.height && p.fps === `${expected.fps}/1` && p.frames === expected.frames && Math.abs(p.seconds - expected.frames / expected.fps) < 1 / 60;
}
async function png(r: Ref, channels: 3 | 4) {
  const s = sharp(await checked(r)), p = await (channels === 3 ? s.removeAlpha() : s.ensureAlpha()).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([p.info.width, p.info.height, p.info.channels], [W, H, channels]); return p.data;
}
function seams(rows: Row[]) { return rows.flatMap((r, i) => i && r.segment !== rows[i - 1].segment ? [{ frame: i, from: rows[i - 1].segment, to: r.segment, status: 'native-motion-and-card-QA-pending' }] : []); }

async function prepare() {
  const input = JSON.parse((await checked(INPUT)).toString()), bank = JSON.parse((await checked(BANK)).toString());
  await checked(OPENING);
  assert.equal(input.dealerId, 'pamela-pilot'); assert.equal(input.variants.length, 2);
  const contract = await ref('references/pamela-motion-contract-v2.json'), c: DealerMotionContract = JSON.parse((await checked(contract)).toString());
  assert.equal(c.dealerId, input.dealerId); assert.equal(c.projectId, 'snyggare-dealer');
  await checked(c.supersedes);
  const variants: Variant[] = input.variants;
  const assets: Asset[] = [{ ...input.idleSource, id: 'B' }, BRIDGE, ...variants.map(v => ({ ...v.start.source, id: v.id, width: 1762, height: H, fps: 30, frames: 360 }))];
  const probes = [];
  for (const a of assets) { await checked(a); const observed = probe(a.path); assert.ok(verifyFormat(observed, a), `Source native mismatch: ${a.id}`); probes.push({ id: a.id, observed }); }
  const trims = variants.map(v => {
    const t = bank.trimmed.find((t: any) => t.id === `C${v.ordinal}-P1`)?.interval;
    assert.equal(t?.sourceSha256, v.start.source.sha256); assert.ok(v.start.sourceFrame >= t.startInclusive && v.start.sourceFrame < t.endExclusive); return t;
  });
  const first = bank.assembly.compact.timeline.find((t: any) => t.id === 'C1-P1');
  const opening = pamelaIdleChainPlan({ dealStart: first.startInclusive, dealEndExclusive: first.endExclusive, retreatEndExclusive: first.endExclusive + 1 }).filter(r => ['opening-blink', 'opening-still', 'to-ready'].includes(r.segment));
  const map = (f: Frame): Frame => f.source === 'bank' ? { source: 'P1-K1', frame: f.frame - first.startInclusive + trims[0].startInclusive } : f;
  const recipes: Recipe[] = variants.map(v => {
    assert.deepEqual([v.start.width, v.start.height, v.end.width, v.end.height, v.expectedNativeFps, v.expectedFrames], [W, H, W, H, 30, 90]);
    const contractPlanId = `P1.after-K${v.ordinal}.direct`;
    assert.ok(c.plans.some(p => p.id === contractPlanId));
    const rows: Row[] = opening.map(r => ({ outputFrame: 0, segment: r.segment, a: map(r.a), ...(r.b ? { b: map(r.b) } : {}), weightB: r.weightB, retainedLayer: null }));
    const append = (segment: string, source: string, start: number, end: number, retainedLayer: Ref | null = null) => { for (let frame = start; frame < end; frame++) rows.push({ outputFrame: rows.length, segment, a: { source, frame }, weightB: 0, retainedLayer }); };
    append('give-K1', 'P1-K1', trims[0].startInclusive + 4, v.ordinal === 1 ? v.start.sourceFrame + 1 : trims[0].endExclusive);
    if (v.ordinal === 2) append('give-K2', 'P1-K2', trims[1].startInclusive, v.start.sourceFrame + 1);
    append('direct-return', 'generated', 0, v.expectedFrames);
    append('VILA-retained', 'B', v.end.sourceFrame + 1, input.idleSource.frames, v.retainedCards.layer);
    rows.forEach((r, i) => r.outputFrame = i);
    const finalGive = rows.findIndex(r => r.segment === 'direct-return') - 1;
    assert.deepEqual(rows[finalGive].a, { source: v.id, frame: v.start.sourceFrame });
    assert.ok(rows.slice(finalGive + 1).every(r => ['direct-return', 'VILA-retained'].includes(r.segment)), 'No REDO after final release');
    return { id: v.id, contractPlanId, rows, generated: { path: `${ROOT}/jobs/p1-k${v.ordinal}-take-01/original.mp4`, expected: { width: W, height: H, fps: 30, frames: v.expectedFrames } }, start: v.start, end: v.end, retainedLayer: v.retainedCards.layer, looseCards: v.ordinal, seams: seams(rows) };
  });
  for (const v of variants) { await png(v.start, 3); await png(v.end, 3); await png(v.retainedCards.layer, 4); }
  const code = await Promise.all(['tools/pamela-direct-return-review.ts', 'src/pamela-idle-chain-plan.ts', 'src/pamela-temporal-join.ts', 'src/pamela-idle-source-projection.ts', 'src/pamela-key.ts', 'src/dealer-motion-contract.ts'].map(ref));
  const plan: Plan = { schemaVersion: 1, dealerId: input.dealerId, input: INPUT, code, contract, v1: c.supersedes, evidence: [BANK, OPENING], assets, recipes, width: W, height: H, fps: 30, adapter: {
    mode: 'local-raw-reference-only', v1Changed: false, runtimeApproved: false, physicalSide: 'UNKNOWN',
    bindingOverrides: ['bridge.to-redo uses existing native B-to-REDO bridge6..89 instead of v2 legacy approach', 'release cuts and source trims come from preparation and reviewed bank intervals', 'generated returns remain missing/unapproved until local task/hash/native checks', 'closing VILA uses B327..359 with the unchanged preparation neutral-card layer'],
    sourceTransform: 'Only 1762-wide deal sources: explicit one-column RGB edge extension on each side, original columns preserved at x+1; no scaling/crop. B/bridge/generated remain1764 native.',
    openingEdit: 'Existing B252..326 then B289..326 and bridge6..89; final4 bridge frames overlap advancing C1-P1 frames17..20 using existing temporalJoin weights. Processed opening candidate, not native-seam approval.',
    board: 'Raw original/generation cards stay visible. No generated card replacement or drift concealment. Exact1/2-card persistence through generated motion is a required pending visual gate; only closing empty-source VILA receives its frozen source-derived card layer.',
    closing: 'Native B327..359 follows target B326 once, no automatic loop/reset or still-frame substitution.',
    k2: 'First give may return to REDO before second draw; after final K2 release no REDO/retreat source is used. C1-P1→C2-P1 is a new seam requiring visual QA.'
  }, contractPlans: recipes.map(r => planDealerSequence(c, c.plans.find(p => p.id === r.contractPlanId)!)), productionAccepted: false };
  await mkdir(REVIEW, { recursive: true });
  const saved = await save(PLAN, plan);
  await save(`${REVIEW}/preparation-check.json`, { plan: saved, probes, checks: ['All selected source video hashes and native formats match', 'All four anchors and both neutral layers hash/dimension checked', 'Exactly two data-driven P1 recipes; final cuts equal input anchors', 'No bridge/REDO segment after final release', 'v1 supersedes hash verified; no contract edits'], generatedFilmsRead: false, renderedFrames: 0, apiCalls: 0, productionAccepted: false });
  return { plan: saved, recipes: recipes.map(r => ({ id: r.id, frames: r.rows.length, seconds: r.rows.length / 30, expectedLooseCards: r.looseCards })), status: 'prepared-awaiting-generated-native-and-visual-QA' };
}

async function loadPlan(sha: string) {
  assert.match(sha, /^[a-f0-9]{64}$/); const p: Plan = JSON.parse((await checked({ path: PLAN, sha256: sha })).toString());
  assert.equal(p.dealerId, 'pamela-pilot'); assert.deepEqual([p.width, p.height, p.fps], [W, H, 30]);
  for (const r of [p.input, p.contract, p.v1, ...p.evidence, ...p.assets]) await checked(r);
  for (const r of p.code) {
    if (r.path === 'tools/pamela-direct-return-review.ts' && (await ref(r.path)).sha256 !== r.sha256) await checked({ path: `${REVIEW}/code/${r.sha256}.ts`, sha256: r.sha256 });
    else await checked(r);
  }
  return p;
}
async function generatedStatus(r: Recipe) {
  if (!await exists(r.generated.path)) return { id: r.id, status: 'missing-generated-original', passed: false };
  const original = await ref(r.generated.path), observed = probe(original.path), nativePassed = verifyFormat(observed, r.generated.expected), folder = original.path.slice(0, -'original.mp4'.length);
  const required = ['task.json', 'plan.json', 'native-verification.json'];
  const missing = []; for (const f of required) if (!await exists(folder + f)) missing.push(f);
  if (missing.length) return { id: r.id, status: 'missing-job-provenance', passed: false, original, observed, missing };
  const task = await json(folder + 'task.json'), job = await json(folder + 'plan.json'), proof = await json(folder + 'native-verification.json');
  const first = job.inputs?.find((x: any) => x.position === 'first'), last = job.inputs?.find((x: any) => x.position === 'last');
  const provenancePassed = job.dealerId === 'pamela-pilot' && job.inputs?.length === 2 && typeof task.taskId === 'string' && /^[a-f0-9-]{36}$/.test(task.taskId) && task.planSha256 === hash(await readFile(folder + 'plan.json')) && proof.taskId === task.taskId && proof.output?.sha256 === original.sha256 && proof.output?.path === original.path && first?.sha256 === r.start.sha256 && first?.path === r.start.path && last?.sha256 === r.end.sha256 && last?.path === r.end.path;
  return { id: r.id, status: !nativePassed ? 'native-mismatch-no-scaling' : !provenancePassed ? 'job-provenance-mismatch' : 'native-and-provenance-passed-visual-QA-pending', passed: nativePassed && provenancePassed && proof.passed === true, original, observed, taskId: task.taskId, expected: r.generated.expected, transforms: [] };
}

type Derivation = { sourceDirectory: string; evidence: Ref; previousLayer: Ref; pixelChecks: Record<string, unknown>; firstChangedFrame: number; evidenceData: any; originalRecipe: Recipe; refinementInputs: Ref };
async function render(p: Plan, r: Recipe, planSha: string, take: string, derived?: Derivation) {
  assert.match(take, /^take-[0-9]{2}$/); const dir = `${REVIEW}/${r.id}/${take}`;
  const state = await generatedStatus(r); assert.ok(state.passed && state.original, JSON.stringify(state));
  assert.ok(!await exists(dir), 'Use a new review take; existing evidence is immutable'); await mkdir(dir, { recursive: true });
  const liveCode = await ref('tools/pamela-direct-return-review.ts'), snapshotPath = `${REVIEW}/code/${liveCode.sha256}.ts`;
  await mkdir(`${REVIEW}/code`, { recursive: true });
  if (!await exists(snapshotPath)) await writeFile(snapshotPath, await checked(liveCode), { flag: 'wx' });
  const currentCode = { path: snapshotPath, sha256: liveCode.sha256 }; await checked(currentCode);
  const reusedEvidence = r.reuseDecoded ? JSON.parse((await checked(r.reuseDecoded.evidence)).toString()) : null;
  await save(`${dir}/intent.json`, { plan: { path: PLAN, sha256: planSha }, overrideInput: r.overrideInput ?? null, reuseDecoded: r.reuseDecoded ?? null, generated: state, currentCode, derivedFrom: derived?.evidence ?? null, visualQaPending: true });
  const frameMap = await save(`${dir}/frame-map.json`, { rows: r.rows, blendMode: 'Encoded RGB, existing temporalJoin smoothstep weights; both sources advance one native frame', productionAccepted: false });
  const sources = [...p.assets, { ...state.original, id: 'generated', ...r.generated.expected }];
  const ranges = new Map<string, { min: number; max: number }>();
  for (const row of r.rows) for (const f of [row.a, row.b].filter((x): x is Frame => !!x)) { const prior = ranges.get(f.source); ranges.set(f.source, { min: Math.min(prior?.min ?? f.frame, f.frame), max: Math.max(prior?.max ?? f.frame, f.frame) }); }
  for (const [id, range] of ranges) {
    const a = sources.find(a => a.id === id)!; assert.ok(a); await checked(a);
    if (derived) continue;
    if (r.reuseDecoded && ['B', 'bridge', 'P1-K1'].includes(id)) continue;
    const folder = `${dir}/source/${id}`; await mkdir(folder, { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', a.path, '-vf', `trim=start_frame=${range.min}:end_frame=${range.max + 1}`, '-an', '-fps_mode', 'passthrough', '-start_number', String(range.min), '-threads', '1', `${folder}/frame-%04d.png`], { windowsHide: true, maxBuffer: 1_000_000 });
  }
  const readFrame = async (f: Frame) => {
    const a = sources.find(a => a.id === f.source)!;
    const sourceRoot = r.reuseDecoded && ['B', 'bridge', 'P1-K1'].includes(f.source) ? r.reuseDecoded.directory : derived?.sourceDirectory ?? dir;
    const { data, info } = await sharp(`${sourceRoot}/source/${f.source}/frame-${String(f.frame).padStart(4, '0')}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [a.width, H, 3]);
    return a.width === 1762 ? Buffer.from(padCanonicalForIdle(data, 3)) : data;
  };
  const layer = await png(r.retainedLayer, 4), layerBytes = await checked(r.retainedLayer);
  const start = await png(r.start, 3), end = await png(r.end, 3);
  const lastGive = r.rows[r.rows.findIndex(row => row.segment === 'direct-return') - 1];
  assert.equal(hash(await readFrame(lastGive.a)), hash(start), 'Final give does not equal prepared start RGB');
  const endRaw = await readFrame({ source: 'B', frame: 326 });
  const originalLayerBytes = derived ? await checked(derived.previousLayer) : layerBytes;
  const endComposite = await sharp(endRaw, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: originalLayerBytes }]).removeAlpha().raw().toBuffer();
  assert.equal(hash(endComposite), hash(end), 'Retained idle does not reproduce prepared end RGB');
  const output = `${dir}/P1-proof.mp4`, records: unknown[] = [], snapshots: Ref[] = [];
  await mkdir(`${dir}/qa`, { recursive: true });
  const keep = new Set([0, r.rows.length - 1, ...r.seams.flatMap(s => [-2, -1, 0, 1, 2].map(d => s.frame + d))]);
  const encoder = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-threads', '4', '-pix_fmt', 'yuv420p', '-video_track_timescale', '15360', '-movflags', '+faststart', output], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '', unchangedPrefixFrames = 0; encoder.stderr.on('data', b => errors += b.toString()); const completed = once(encoder, 'close');
  const composite = async (rgb: Buffer, bytes: Buffer) => sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: bytes }]).removeAlpha().raw().toBuffer();
  const ensureClear = (rgb: Buffer, frame: number) => {
    const keyed = keyPamelaFrame(rgb, W, H); let overlaps = 0;
    for (let i = 0; i < W * H; i++) if (layer[i * 4 + 3] && keyed.alpha[i] > 0.01) overlaps++;
    assert.equal(overlaps, 0, `Closing card layer overlaps actor/source object at B${frame}`);
  };
  try {
    for (const row of r.rows) {
      let rgb = await readFrame(row.a);
      if (derived) {
        const originalRow = derived.originalRecipe.rows[row.outputFrame]; let originalRgb = rgb;
        if (originalRow.b) originalRgb = Buffer.from(mixTemporalComposites(originalRgb, await readFrame(originalRow.b), originalRow.weightB));
        if (originalRow.retainedLayer) originalRgb = await composite(originalRgb, originalLayerBytes);
        assert.equal(hash(originalRgb), derived.evidenceData.records[row.outputFrame].rgbSha256, `Changed cached baseline frame${row.outputFrame}`);
      }
      if (row.b) {
        let other = await readFrame(row.b);
        if (row.bRetainedLayer) {
          assert.ok(derived); const baseline = derived.originalRecipe.rows.find(x => x.a.source === 'B' && x.a.frame === row.b!.frame && !x.b && !x.retainedLayer); assert.ok(baseline);
          assert.equal(hash(other), derived.evidenceData.records[baseline.outputFrame].rgbSha256, 'Changed cached VILA pre-roll');
          ensureClear(other, row.b.frame); other = await composite(other, layerBytes);
        }
        rgb = Buffer.from(mixTemporalComposites(rgb, other, row.weightB));
      }
      if (row.retainedLayer) {
        ensureClear(rgb, row.a.frame); rgb = await composite(rgb, layerBytes);
      }
      if (r.reuseDecoded && row.outputFrame < r.reuseDecoded.prefixFrames) assert.equal(hash(rgb), reusedEvidence.records[row.outputFrame].rgbSha256, 'Reused prefix differs from first proof');
      if (derived && row.outputFrame < derived.firstChangedFrame) { assert.equal(hash(rgb), derived.evidenceData.records[row.outputFrame].rgbSha256); unchangedPrefixFrames++; }
      records.push({ outputFrame: row.outputFrame, rgbSha256: hash(rgb), segment: row.segment });
      if (keep.has(row.outputFrame)) { const file = `${dir}/qa/frame-${String(row.outputFrame).padStart(4, '0')}.png`; await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file); snapshots.push(await ref(file)); }
      if (!encoder.stdin.write(rgb)) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end(); const [code] = await completed; assert.equal(code, 0, errors);
  } catch (e) { encoder.stdin.destroy(); encoder.kill(); await completed.catch(() => {}); throw e; }
  const observed = probe(output); assert.ok(verifyFormat(observed, { width: W, height: H, fps: 30, frames: r.rows.length }));
  const evidence = await save(`${dir}/evidence.json`, { plan: { path: PLAN, sha256: planSha }, overrideInput: r.overrideInput ?? null, reuseDecoded: r.reuseDecoded ?? null, id: r.id, generated: state, currentCode, frameMap, output: await ref(output), observed, snapshots, records, seams: r.seams, finalGiveEqualsPreparedStartRgb: true, originalLayerComposedB326EqualsPreparedEndRgb: true, closingCardActorOverlap: 0, retainedCardLayer: r.retainedLayer, sourceTransforms: p.adapter.sourceTransform, generatedTransforms: derived ? ['Last4 original generated frames explicitly blend with advancingB323..326 using the softened existing card layer; no spatial warp or retiming'] : [], derivedFrom: derived?.evidence ?? null, refinement: derived ? { input: derived.refinementInputs, pixelChecks: derived.pixelChecks, unchangedPrefixFrames, firstChangedFrame: derived.firstChangedFrame, overlapFrames: 4, generatedFrames: [86, 89], idleFrames: [323, 326], followingIdleFrame: 327, weights: r.rows.filter(x => x.bRetainedLayer).map(x => x.weightB) } : null, generatedCardPersistence: 'raw-generated-source-never-patched; original90-frame-QA-separate', productionAccepted: false, apiCalls: 0, nextReview: ['Play whole proof in native geometry', 'Inspect all generated frames for card count/drift, hand anatomy, face and no shoe visit', 'Review dense ±2-frame seams; widen any suspicious boundary', 'No automatic approval or next paid job'] });
  return { evidence, output: await ref(output), status: 'rendered-awaiting-visual-QA' };
}

async function refine(p: Plan, r: Recipe, sha: string, take: string, sourceTake = 'take-01') {
  const sourceDirectory = `${REVIEW}/${r.id}/${sourceTake}`, evidence = await ref(`${sourceDirectory}/evidence.json`), evidenceData = JSON.parse((await checked(evidence)).toString());
  await checked(evidenceData.output);
  const refinementInputs = await ref(`${REVIEW}/refinement-inputs/evidence.json`), input = JSON.parse((await checked(refinementInputs)).toString());
  const entry = input.variants.find((x: any) => x.id === r.id); assert.ok(entry); assert.deepEqual(entry.source, r.retainedLayer);
  const before = await png(r.retainedLayer, 4), after = await png(entry.layer, 4); let corePixels = 0, changedCoreChannels = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (before[i * 4 + 3] !== 255) continue; let inner = true;
    for (let yy = -1; yy <= 1 && inner; yy++) for (let xx = -1; xx <= 1; xx++) if (before[((y + yy) * W + x + xx) * 4 + 3] !== 255) { inner = false; break; }
    if (!inner) continue; corePixels++; for (let c = 0; c < 4; c++) if (before[i * 4 + c] !== after[i * 4 + c]) changedCoreChannels++;
  }
  assert.equal(changedCoreChannels, 0); assert.equal(corePixels, entry.corePixels);
  const out = structuredClone(r), firstChangedFrame = out.rows.findIndex(x => x.segment === 'direct-return') + 86;
  const join = temporalJoin(Array.from({ length: 4 }, (_, i) => ({ source: 'generated', frame: 86 + i })), Array.from({ length: 4 }, (_, i) => ({ source: 'B', frame: 323 + i })), 4);
  for (const [i, j] of join.entries()) out.rows[firstChangedFrame + i] = { ...j, outputFrame: firstChangedFrame + i, segment: 'exit-overlap', retainedLayer: null, bRetainedLayer: entry.layer };
  for (const row of out.rows) if (row.segment === 'VILA-retained') row.retainedLayer = entry.layer;
  out.retainedLayer = entry.layer; out.seams = seams(out.rows);
  return render(p, out, sha, take, { sourceDirectory, evidence, previousLayer: r.retainedLayer, pixelChecks: { corePixels, changedCoreChannels, before: entry.before, after: entry.after, sigma: entry.sigma }, firstChangedFrame, evidenceData, originalRecipe: r, refinementInputs });
}

async function retakeRecipe(r: Recipe): Promise<Recipe> {
  assert.equal(r.id, 'P1-K2');
  const overrideInput = { path: `${REVIEW}/P1-K2/retake-input-02/plan.json`, sha256: '1d5b8d7a31fba71409f3ab898fa77300eedfdb46ec58048fdc4735b44a0baaf6' };
  const input = JSON.parse((await checked(overrideInput)).toString()); assert.equal(input.start.sourceFrame, 218);
  const out = structuredClone(r), at = out.rows.findIndex(x => x.segment === 'direct-return');
  assert.equal(out.rows[at - 1].a.frame, 210);
  out.rows.splice(at, 0, ...Array.from({ length: 8 }, (_, i) => ({ outputFrame: 0, segment: 'give-K2', a: { source: 'P1-K2', frame: 211 + i }, weightB: 0, retainedLayer: null })));
  out.rows.forEach((row, i) => row.outputFrame = i); out.seams = seams(out.rows);
  out.start = input.start; out.end = input.end; out.generated.path = `${ROOT}/jobs/p1-k2-take-02/original.mp4`; out.overrideInput = overrideInput;
  out.reuseDecoded = { directory: `${REVIEW}/P1-K2/take-01`, evidence: await ref(`${REVIEW}/P1-K2/take-01/evidence.json`), prefixFrames: out.rows.findIndex(x => x.segment === 'give-K2') };
  return out;
}

assert.equal(process.version, 'v24.21.0', 'Use project Volta Node');
const [action, ...args] = process.argv.slice(2), options: Record<string, string> = {};
for (const a of args) { const m = /^--(sha|variant|take)=(.+)$/.exec(a); assert.ok(m, 'Unknown argument'); assert.ok(!options[m[1]], 'Duplicate argument'); options[m[1]] = m[2]; }
if (action === 'prepare') { assert.equal(args.length, 0); console.log(JSON.stringify(await prepare())); }
else {
  const p = await loadPlan(options.sha);
  if (action === 'check') { const results = []; for (const r of p.recipes) results.push(await generatedStatus(r)); console.log(JSON.stringify({ status: 'checked-no-render', results, productionAccepted: false })); }
  else if (action === 'render') { const r = p.recipes.find(r => r.id === options.variant); assert.ok(r, 'Unknown variant'); console.log(JSON.stringify(await render(p, r, options.sha, options.take))); }
  else if (action === 'refine') { const r = p.recipes.find(r => r.id === options.variant); assert.ok(r, 'Unknown variant'); console.log(JSON.stringify(await refine(p, r, options.sha, options.take))); }
  else if (action === 'retake' || action === 'refine-retake') { const r = await retakeRecipe(p.recipes.find(r => r.id === 'P1-K2')!); console.log(JSON.stringify(action === 'retake' ? await render(p, r, options.sha, options.take) : await refine(p, r, options.sha, options.take, 'take-02'))); }
  else throw Error('Use prepare | check --sha=... | render --sha=... --variant=P1-K1 --take=take-01');
}
