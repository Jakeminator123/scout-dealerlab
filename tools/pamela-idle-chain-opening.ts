/** Empty-table VILA variants -> material-continuous source bridge -> actual bank head.
 * Explicit demo presentation comes from the selected bank, never guessed here.
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { openIdleShoeCardSurfaces, IDLE_SHOE_CARD_SOURCES, type IdleShoeSourceId } from '../src/pamela-idle-shoe-card.ts';
import { keyPamelaFrameWithPaper } from '../src/pamela-key-paper.ts';
import { padCanonicalForIdle } from '../src/pamela-idle-source-projection.ts';
import { pamelaIdleChainPlan } from '../src/pamela-idle-chain-plan.ts';
import { mixTemporalComposites } from '../src/pamela-temporal-join.ts';
type Ref = { path: string; sha256: string };
const RUN = 'runs/20261110-pamela-idle-chain-opening/take-01', W = 1764, H = 1174, CW = 1762, N = W * H;
const BANK: Ref = { path: 'runs/20261110-pamela-mask-bank/take-01/evidence.json', sha256: 'ed63d72517802affc241445070c3242c5440d0ab2122d6f55a36b22f372967dc' };
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string) => ({ path, sha256: hash(await readFile(path)) });
const checked = async (r: Ref) => { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, `Changed bound input ${r.path}`); return b; };
assert.equal(process.version, 'v24.21.0'); sharp.concurrency(1);
const surfaceProof: Ref = { path: process.argv[2], sha256: process.argv[3] }, surfaceReview: Ref = { path: process.argv[4], sha256: process.argv[5] };
assert.match(surfaceProof.path ?? '', /^runs\/20261110-pamela-idle-shoe-card\/take-\d{2}\/sealed-evidence\.json$/);
assert.match(surfaceReview.path ?? '', /^runs\/20261110-pamela-idle-shoe-card\/take-\d{2}\/review\.json$/);
assert.match(surfaceProof.sha256 ?? '', /^[a-f0-9]{64}$/); assert.match(surfaceReview.sha256 ?? '', /^[a-f0-9]{64}$/);
const surface = JSON.parse((await checked(surfaceProof)).toString()); await checked(surfaceReview);
for (const r of surface.code as Ref[]) await checked(r);
const bank = JSON.parse((await checked(BANK)).toString()), plan = JSON.parse((await checked(bank.plan)).toString());
assert.equal(surface.bankEvidence.sha256, BANK.sha256); assert.equal(plan.engineFixture.realGameValues, false);
const firstRef = bank.parts.find((p: { id: string }) => p.id === 'C1-P1'), first = JSON.parse((await checked(firstRef)).toString());
const sourcePolicy = plan.selections.find((s: { id: string }) => s.id === 'C1-P1').sidePolicy;
assert.equal(sourcePolicy.physicalSide, 'UNKNOWN');
const authoredSide = sourcePolicy.segments.find((s: { start: number; end: number }) => s.start <= 17 && s.end > 17).side;
assert.equal(authoredSide, 'FRONT');
const signal = plan.engineFixture.signals.find((s: { slotId: string }) => s.slotId === 'C1-P1'); assert.ok(signal);
const entryState = first.records[17].states.find((s: { slotId: string }) => s.slotId === signal.slotId); assert.equal(entryState.displayedSide, 'FRONT');
const design = plan.designs.find((d: { id: string }) => d.id === plan.renderDesign); assert.ok(design);
const texture = async (r: Ref) => { const { data, info } = await sharp(await checked(r)).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { rgb: data, width: info.width, height: info.height, id: r.sha256 }; };
const back = await texture(plan.artwork.back[design.back]), front = await texture(plan.artwork.front[design.front][signal.cardId]); assert.equal(front.id, entryState.textureId);
await checked(bank.compact); for (const r of plan.scene as Ref[]) await checked(r);
const room = await sharp(plan.scene[0].path).resize(CW, H, { fit: 'contain', background: '#24201d' }).removeAlpha().blur(8).modulate({ brightness: .58, saturation: .65 }).toBuffer();
const canonicalEmpty = await sharp(room).composite([{ input: await checked(plan.scene[1]) }]).removeAlpha().raw().toBuffer(), base = Buffer.from(padCanonicalForIdle(canonicalEmpty, 3));
await mkdir('runs/20261110-pamela-idle-chain-opening', { recursive: true }); await mkdir(RUN);
for (const name of ['sources', 'render', 'native', 'snapshot']) await mkdir(`${RUN}/${name}`);
const code = await Promise.all(['tools/pamela-idle-chain-opening.ts', 'src/pamela-idle-shoe-card.ts', 'src/pamela-key-paper.ts', 'src/pamela-key.ts', 'src/pamela-idle-chain-plan.ts', 'src/pamela-idle-source-projection.ts', 'src/pamela-temporal-join.ts'].map(ref));
for (const r of code) await copyFile(r.path, `${RUN}/snapshot/${r.path.replaceAll('/', '__')}`);
const bounds = { dealStart: 222, dealEndExclusive: 4180, retreatEndExclusive: 4269 }, mapping = pamelaIdleChainPlan(bounds).filter(r => r.outputFrame < 197);
const api = await openIdleShoeCardSurfaces();
type FrameRef = Ref & { source: string; frame: number; rgbSha256: string; sourceFrame?: Ref; verification?: unknown };
const sources = new Map<string, FrameRef>();
const sourcesWanted = new Map(mapping.flatMap(r => r.b ? [r.a, r.b] : [r.a]).map(f => [`${f.source}:${f.frame}`, f]));
for (const [key, f] of sourcesWanted) {
  if (f.source === 'bank') continue;
  assert.ok(f.source === 'B' || f.source === 'bridge'); const sourceId = f.source as IdleShoeSourceId, bound = api.refs.get(key); assert.ok(bound);
  const original = await sharp(await checked(bound)).removeAlpha().raw().toBuffer();
  const g = api.geometryFrame({ sourceId, sourceSha256: IDLE_SHOE_CARD_SOURCES[sourceId].sha256, frame: f.frame, originalRGB: original });
  const p = await api.paint(g, { slotId: signal.slotId, cardId: signal.cardId, frontAllowed: signal.frontAllowed, displaySide: authoredSide, back, front: id => { assert.equal(id, signal.cardId); return front; } });
  assert.equal(p.verification.changedOutsidePaperPixels, 0); assert.equal(p.verification.changedProtectedPixels, 0); assert.equal(p.states[0].textureId, entryState.textureId);
  const matte = keyPamelaFrameWithPaper(p.printed, W, H, p.paper, p.original), rgb = Buffer.from(base);
  for (let i = 0; i < N; i++) if (matte.alpha[i]) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(base[i * 3 + c] * (1 - matte.alpha[i]) + matte.rgb[i * 3 + c] * matte.alpha[i]);
  const path = `${RUN}/sources/${f.source}-${f.frame}.png`; await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path);
  sources.set(key, { ...await ref(path), ...f, rgbSha256: hash(rgb), sourceFrame: { path: bound.path, sha256: bound.sha256 }, verification: p.verification });
  if (sources.size % 40 === 0) console.log(JSON.stringify({ compositedSources: sources.size, tableCards: 0 }));
}
const head = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', bank.compact.path, '-vf', 'trim=start_frame=222:end_frame=226', '-an', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '1', 'pipe:1'], { windowsHide: true, maxBuffer: CW * H * 3 * 4 + 4096 });
assert.equal(head.length, CW * H * 3 * 4);
for (let i = 0; i < 4; i++) {
  const rgb = Buffer.from(padCanonicalForIdle(head.subarray(i * CW * H * 3, (i + 1) * CW * H * 3), 3)), frame = 222 + i, path = `${RUN}/sources/bank-${frame}.png`;
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path);
  sources.set(`bank:${frame}`, { ...await ref(path), source: 'bank', frame, rgbSha256: hash(rgb), sourceFrame: bank.compact });
}
const get = async (f: { source: string; frame: number }) => { const r = sources.get(`${f.source}:${f.frame}`); assert.ok(r); const b = await sharp(await checked(r)).removeAlpha().raw().toBuffer(); assert.equal(hash(b), r.rgbSha256); return b; };
const outputs = [];
for (const overlap of [0, 4] as const) {
  const id = overlap ? 'overlap-4' : 'direct', rows = pamelaIdleChainPlan(bounds, overlap).filter(r => ['opening-blink', 'opening-still', 'to-ready'].includes(r.segment));
  assert.equal(rows.length, 201 - overlap); const path = `${RUN}/render/${id}.mp4`;
  const child = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-threads', '1', '-movflags', '+faststart', path], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  child.stdin.on('error', () => {}); let errors = ''; child.stderr.on('data', b => errors += b); const done = once(child, 'close'), records = [];
  try {
    for (const r of rows) {
      const a = await get(r.a), rgb = r.b ? Buffer.from(mixTemporalComposites(a, await get(r.b), r.weightB)) : a; let native: Ref | null = null;
      if ([0, 64, 74, 75, 112, 113, 146, 151, 159, 181, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200].includes(r.outputFrame)) { const png = `${RUN}/native/${id}-${String(r.outputFrame).padStart(3, '0')}.png`; await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(png); native = await ref(png); }
      records.push({ ...r, outputRgbSha256: hash(rgb), native }); if (!child.stdin.write(rgb)) await once(child.stdin, 'drain');
    }
    child.stdin.end(); const [exit] = await done; assert.equal(exit, 0, errors);
  } catch (error) { child.stdin.destroy(); child.kill(); await done; throw error; }
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', path], { encoding: 'utf8', windowsHide: true }));
  assert.equal(probe.streams[0].width, W); assert.equal(probe.streams[0].height, H); assert.equal(probe.streams[0].avg_frame_rate, '30/1'); assert.equal(Number(probe.streams[0].nb_read_frames), rows.length);
  outputs.push({ id, overlap, frames: rows.length, output: await ref(path), probe, records });
}
for (const r of [...code, ...surface.code] as Ref[]) await checked(r);
await writeFile(`${RUN}/evidence.json`, JSON.stringify({ status: 'opening-material-and-overlap-awaiting-native-review', createdAt: new Date().toISOString(), bank: BANK, surfaceProof, surfaceReview, code, sources: [...sources.values()], outputs, scene: plan.scene, width: W, height: H, fps: 30, tableCards: 0, presentation: { signal, authoredSide, physicalSide: 'UNKNOWN', textureId: front.id, basis: 'Existing explicit demonstration bank only; no external engine or reveal event created.' }, bankHead: { source: bank.compact, startInclusive: 222, endExclusive: 226, originalDealSourceFrames: [17, 18, 19, 20], resumeAtBankFrame: 226, resumeAtOriginalDealFrame: 21 }, newApiJobs: 0, heldFrames: 0, retimed: false, productionAccepted: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ evidence: `${RUN}/evidence.json`, outputs: outputs.map(r => ({ id: r.id, frames: r.frames })) }));
