/** Local review only: frozen P1 geometry/guards, authored sides, no API jobs.
 * CPU movies are references; the new Next route renders these atlases in Three.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { openBankCardSurfaces, type BankSurfaceSelection, type BankMaterials, type BankEngineSignal } from '../src/pamela-bank-card-surfaces.ts';
import { cardProjectiveUv } from '../src/pamela-two-sided-card.ts';
import { checkedMaterialBytes, materialHash as hash, type FrozenRef } from '../src/pamela-frozen-material-track.ts';

const runRoot = 'runs/20261110-pamela-card-side-review';
const take = process.argv.find(a => a.startsWith('--take='))?.slice(7);
assert.match(take ?? '', /^\d{2}$/);
const run = `${runRoot}/take-${take}`, W = 1762, H = 1174, FPS = 30, COUNT = 360, PAGE = 4096;
const execute = promisify(execFile), ref = async (path: string): Promise<FrozenRef> => ({ path, sha256: hash(await readFile(path)) });
const planRef = await ref('runs/20261110-pamela-mask-bank/take-01/plan.json');
const plan = JSON.parse((await checkedMaterialBytes(planRef)).toString());
assert.equal(plan.width, W); assert.equal(plan.height, H); assert.equal(plan.fps, FPS);
assert.equal(plan.productionAccepted, false);
sharp.concurrency(1);
await mkdir(runRoot, { recursive: true }); await mkdir(run);
for (const d of ['assets', 'atlas', 'render', 'native', 'sheets', 'snapshot']) await mkdir(`${run}/${d}`);
const code = [];
for (const path of ['tools/pamela-card-side-review.ts', 'src/pamela-bank-card-surfaces.ts', 'src/pamela-frozen-material-track.ts', 'src/pamela-two-sided-card.ts', 'src/pamela-paper-material.ts', 'src/pamela-edge-card-track.ts', 'src/pamela-p1-side-calibration.ts', 'src/pamela-card-atlas.ts']) {
  const r = await ref(path); code.push(r); await writeFile(`${run}/snapshot/${path.replaceAll('/', '__')}`, await checkedMaterialBytes(r), { flag: 'wx' });
}
async function solid(name: string, color: string) {
  const path = `${run}/assets/${name}.png`;
  await sharp({ create: { width: 252, height: 352, channels: 3, background: color } }).png().toFile(path);
  return ref(path);
}
const blue = await solid('authored-front-blue', '#155cff'), yellow = await solid('authored-back-yellow', '#fff000');
const styles = [
  { id: 'diagnostic', label: 'Blue FRONT / yellow BACK - AUTHORED', back: yellow, front: { AC: blue, KH: blue } },
  { id: 'sg-classic', label: 'SG / classic', back: plan.artwork.back.sg as FrozenRef, front: { AC: plan.artwork.front.classic.AC as FrozenRef, KH: plan.artwork.front.classic.KH as FrozenRef } },
  { id: 'blue-ivory', label: 'Blue / ivory', back: plan.artwork.back.blue as FrozenRef, front: { AC: plan.artwork.front.ivory.AC as FrozenRef, KH: plan.artwork.front.ivory.KH as FrozenRef } },
];
async function texture(r: FrozenRef) { const { data, info } = await sharp(await checkedMaterialBytes(r)).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { rgb: data, width: info.width, height: info.height, id: r.sha256 }; }
const materials: BankMaterials[] = await Promise.all(styles.map(async s => ({ back: await texture(s.back), front: new Map(await Promise.all(Object.entries(s.front).map(async ([id, r]) => [id, await texture(r)] as const))) })));
const signals = new Map<string, BankEngineSignal>([['C1-P1', { cardId: 'AC', frontAllowed: true }], ['C2-P1', { cardId: 'KH', frontAllowed: true }]]);
const selected: BankSurfaceSelection[] = ['C1-P1', 'C2-P1'].map(id => { const s = plan.selections.find((s: BankSurfaceSelection) => s.id === id); assert(s); return s; });
const records: any[] = [], clips: any[] = [];
let current = { clipId: '', frame: -1 };
function encoder(path: string) {
  const child = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-threads', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let error = ''; child.stderr.on('data', b => error += b); child.stdin.on('error', () => {}); const done = once(child, 'close');
  return { async write(b: Buffer) { if (child.exitCode !== null) throw Error(error || 'Encoder stopped'); if (!child.stdin.write(b)) await once(child.stdin, 'drain'); }, async finish() { child.stdin.end(); const [exit] = await done; assert.equal(exit, 0, error); }, abort() { child.stdin.destroy(); if (child.exitCode === null) child.kill(); } };
}
function phaseWindows(id: string) {
  const boundaries = id === 'C1-P1' ? [0, 75, 165, 211, COUNT] : [0, 63, 165, 225, COUNT];
  return ['acquire/shoe', 'hand/transport', 'release-inspection', 'landed/retreat'].map((label, i) => ({ label, startFrame: boundaries[i], endFrameExclusive: boundaries[i + 1], status: 'inspection-window-not-accepted-event-cue' }));
}
const sampleFrames: Record<string, number[]> = {
  'C1-P1': [0, 45, 60, 75, 105, 150, 170, 185, 195, 210, 225, 350],
  'C2-P1': [0, 45, 63, 82, 83, 103, 104, 113, 114, 118, 119, 150, 195, 211, 225, 350],
};
function labelSvg(label: string, width: number, height = 30) { return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#151b21"/><text x="10" y="21" fill="white" font-family="Arial" font-size="16">${label.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</text></svg>`); }
try {
  for (const selection of selected) {
    const id = selection.id, track = await openBankCardSurfaces(selection), evidence = JSON.parse((await checkedMaterialBytes(selection.evidence)).toString());
    assert.equal(selection.sidePolicy.physicalSide, 'UNKNOWN');
    const frozen = selection.kind === 'edge' ? evidence.records : evidence.frames;
    const md5 = (await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', track.source.path, '-pix_fmt', 'rgb24', '-threads', '1', '-f', 'framemd5', '-'], { windowsHide: true, maxBuffer: 200000 })).stdout.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split(',').at(-1)!.trim());
    assert.equal(md5.length, COUNT);
    let page = 0, x = 0, y = 0, row = 0;
    let maskPage = Buffer.alloc(PAGE * PAGE), uvPage = Buffer.alloc(PAGE * PAGE * 3);
    const pages: any[] = [], frames: any[] = [], contacts: { frame: number; image: Buffer }[] = [];
    const movies = styles.map(s => ({ id: s.id, path: `${run}/render/${id}-${s.id}-cpu-reference.mp4` }));
    const encoders = movies.map(m => encoder(m.path));
    async function savePage() {
      const height = Math.max(1, y + row), base = `${run}/atlas/${id}-page-${page}`;
      await sharp(maskPage.subarray(0, PAGE * height), { raw: { width: PAGE, height, channels: 1 } }).png().toFile(base + '-mask.png');
      await sharp(uvPage.subarray(0, PAGE * height * 3), { raw: { width: PAGE, height, channels: 3 } }).png().toFile(base + '-uv12.png');
      pages.push({ width: PAGE, height, mask: await ref(base + '-mask.png'), uv: await ref(base + '-uv12.png') });
      page++; x = 0; y = 0; row = 0; maskPage = Buffer.alloc(PAGE * PAGE); uvPage = Buffer.alloc(PAGE * PAGE * 3);
    }
    try {
      for (let f = 0; f < COUNT; f++) {
        current = { clipId: id, frame: f };
        const data = await track.geometryFrame(f);
        assert.equal(createHash('md5').update(data.original).digest('hex'), md5[f], `${id}:${f} source decode differs`);
        const cards = [];
        for (const g of data.geometry) {
          const b = g.bounds; assert(b.width <= PAGE && b.height <= PAGE);
          if (x + b.width > PAGE) { x = 0; y += row; row = 0; }
          if (y + b.height > PAGE) await savePage();
          const rectangle = { page, left: x, top: y, width: b.width, height: b.height };
          const uvAt = g.uvAt ?? (g.physicalSide === 'EDGE' ? () => [0, 0] : cardProjectiveUv(g.quad));
          let visible = 0, guarded = 0;
          for (let yy = 0; yy < b.height; yy++) for (let xx = 0; xx < b.width; xx++) {
            const p = (b.top + yy) * W + b.left + xx, dest = (y + yy) * PAGE + x + xx;
            if (g.guard[p]) { if (g.coverage[p]) guarded++; continue; }
            const a = g.coverage[p]; maskPage[dest] = a; if (!a) continue; visible++;
            const [u, v] = uvAt(b.left + xx + .5, b.top + yy + .5);
            assert(Number.isFinite(u) && Number.isFinite(v));
            const uu = Math.round(Math.max(0, Math.min(1, u)) * 4095), vv = Math.round(Math.max(0, Math.min(1, v)) * 4095);
            uvPage[dest * 3] = uu >> 4; uvPage[dest * 3 + 1] = (uu & 15) * 16 + (vv >> 8); uvPage[dest * 3 + 2] = vv & 255;
          }
          cards.push({ slotId: g.slotId, observedPhysicalSide: 'UNKNOWN', authoredDisplaySide: g.physicalSide, policyMethod: 'authored', bounds: b, atlas: rectangle, coverageSha256: hash(Buffer.from(g.coverage)), handGuardSha256: hash(Buffer.from(g.guard)), visiblePixels: visible, guardedCoveragePixels: guarded });
          x += b.width; row = Math.max(row, b.height);
        }
        const rendered = await Promise.all(materials.map(m => track.paint(data, m, signals)));
        for (let i = 0; i < rendered.length; i++) {
          assert.equal(rendered[i].verification.changedOutsidePaperPixels, 0); assert.equal(rendered[i].verification.changedProtectedPixels, 0);
          await encoders[i].write(rendered[i].printed);
        }
        const sourcePng = selection.kind === 'edge' ? { path: `${track.source.frameDirectory}/frame-${String(f).padStart(4, '0')}.png`, sha256: frozen[f].sourcePngSha256 } : frozen[f].source;
        const native: any[] = [];
        if (sampleFrames[id].includes(f)) {
          const b = data.geometry.at(-1)!.bounds, left = Math.max(0, b.left - 100), top = Math.max(0, b.top - 75);
          const crop = { left, top, width: Math.min(W - left, Math.max(360, b.width + 200)), height: Math.min(H - top, Math.max(260, b.height + 150)) };
          const pictures = [data.original, ...rendered.map(r => r.printed)], labels = ['Original / side UNKNOWN', ...styles.map(s => s.label)];
          const tiles = [];
          for (let i = 0; i < pictures.length; i++) {
            const tile = await sharp(pictures[i], { raw: { width: W, height: H, channels: 3 } }).extract(crop).resize(440, 300, { fit: 'contain', background: '#14191f' }).extend({ top: 30, bottom: 30, left: 0, right: 0, background: '#14191f' }).composite([{ input: labelSvg(labels[i], 440), top: 0, left: 0 }, { input: labelSvg(`${id} f${f} (${(f / FPS).toFixed(3)} s)`, 440), top: 330, left: 0 }]).png().toBuffer();
            tiles.push({ input: tile, left: i * 440, top: 0 });
            if (i > 0) { const path = `${run}/native/${id}-${String(f).padStart(4, '0')}-${styles[i - 1].id}.png`; await sharp(pictures[i], { raw: { width: W, height: H, channels: 3 } }).png().toFile(path); native.push({ style: styles[i - 1].id, ...await ref(path) }); }
          }
          contacts.push({ frame: f, image: await sharp({ create: { width: 1760, height: 360, channels: 3, background: '#14191f' } }).composite(tiles).png().toBuffer() });
        }
        frames.push({ frame: f, sourcePng, sourceRgbSha256: hash(data.original), observedPhysicalSide: 'UNKNOWN', policyMethod: 'authored', cards });
        records.push({ clipId: id, frame: f, source: sourcePng, sourceRgbSha256: hash(data.original), cards, variants: rendered.map((r, i) => ({ id: styles[i].id, ...r.verification })), native });
        if (f % 60 === 59) console.log(JSON.stringify({ clipId: id, frames: f + 1, total: COUNT }));
      }
      await Promise.all(encoders.map(e => e.finish())); await savePage();
    } catch (error) { encoders.forEach(e => e.abort()); throw error; }
    const outputs = [];
    for (const m of movies) {
      const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', m.path], { windowsHide: true })).stdout);
      assert.equal(Number(probe.streams[0].nb_read_frames), COUNT); assert.equal(probe.streams[0].avg_frame_rate, '30/1');
      outputs.push({ id: m.id, ...await ref(m.path), renderer: 'existing-CPU-reference-not-GPU-capture', probe });
    }
    const sheets = [];
    for (let i = 0; i < contacts.length; i += 4) {
      const group = contacts.slice(i, i + 4), path = `${run}/sheets/${id}-contact-${String(i / 4 + 1).padStart(2, '0')}.png`;
      await sharp({ create: { width: 1760, height: group.length * 360, channels: 3, background: '#14191f' } }).composite(group.map((r, j) => ({ input: r.image, top: j * 360, left: 0 }))).png().toFile(path);
      sheets.push({ ...await ref(path), sourceFrames: group.map(r => r.frame) });
    }
    clips.push({ id, source: { ...track.source, width: W, height: H, fps: FPS, frames: COUNT }, selection, observedPhysicalSide: 'UNKNOWN', policyMethod: 'authored', phaseWindows: phaseWindows(id), pages, frames, outputs, sheets });
  }
  const frameRecords = `${run}/frame-records.json`; await writeFile(frameRecords, JSON.stringify(records, null, 2) + '\n', { flag: 'wx' });
  const manifest = { schemaVersion: 1, projectId: 'snyggare-dealer', dealerId: 'pamela-pilot', bankId: 'pamela-workspace-v1', createdAt: new Date().toISOString(), status: 'local-review-candidate', activeSelectionChanged: false, newApiJobs: 0, productionAccepted: false, sourcePlan: planRef, code, markerLegend: { method: 'authored-diagnostic-overlay', observedInOriginal: false, FRONT: '#155cff', BACK: '#fff000', EDGE: 'neutral-original-edge', observedPhysicalSide: 'UNKNOWN' }, uvEncoding: { format: 'RGB12+12', maxNormalizedQuantizationError: .5 / 4095, note: 'Mask excludes existing hand/shoe guards; RGB encoding keeps alpha opaque. GPU uses existing printCard GLSL. C1 CPU reference additionally retains its existing 0.65px ink softness.' }, engineFixture: { kind: 'demonstration-only', realGame: false, cards: [...signals].map(([slotId, signal]) => ({ slotId, ...signal })) }, styles, clips, frameRecords: await ref(frameRecords), verification: { sourceFramesMatchedToDecodedOriginal: records.length, cpuMaterialFrames: records.length * styles.length, changedOutsidePaperPixels: 0, changedProtectedPixels: 0, threeNextRoute: '/pamela-sidprov', gpuReviewStatus: 'pending-WebView-review', videoDecoderGpuParityVerified: false }, missing: ['Independent physical FRONT/BACK evidence is absent in the blank originals.', 'Acquire starts with an already-held paper in the shoe; pre-roll before source frame 0 is unavailable.', 'Exact acquire/release/settled event cues are not accepted; phase ranges are inspection windows.', 'Direct return to VILA is not present in these REDO-return sources.', 'Three/GPU capture and perceptual acceptance are separate from CPU integrity checks.'], limitations: ['C2-P1 authored FRONT/EDGE/BACK/EDGE/FRONT schedule retains both passages.', 'Original hand guards and existing approximate UV/blur boundaries are retained, not newly accepted.', 'No new physical two-colour source is generated.', 'CPU movies preserve native 1762x1174, all 360 integer source frames and 30 fps; images are not original replacements.'] };
  for (const r of code) await checkedMaterialBytes(r); await checkedMaterialBytes(planRef);
  await writeFile(`${run}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  await writeFile(`${run}/report.md`, `# P1 card-side review\n\nProject snyggare-dealer / pamela-pilot / pamela-workspace-v1.\n\n- 2 source films, 720 native frames, 3 materials (2160 CPU material frames).\n- Source RGB matched to decoded originals; 0 changed protected/outside-paper pixels.\n- Blue FRONT / yellow BACK is authored; observedPhysicalSide remains UNKNOWN.\n- Full 12 s CPU reference movies and native contact sheets are in this directory.\n- Actual Three/Next shader preview: /pamela-sidprov. GPU review remains pending until inspected.\n- Phase windows are inspection aids, not accepted game cues. Direct VILA return is missing.\n- No new API jobs, active bank change or production acceptance.\n`, { flag: 'wx' });
  console.log(JSON.stringify({ run, manifest: await ref(`${run}/manifest.json`), clips: clips.length, frames: records.length, cpuMaterialFrames: records.length * styles.length }));
} catch (error) {
  await writeFile(`${run}/failure.json`, JSON.stringify({ status: 'incomplete-not-accepted', current, completedFrames: records.length, error: String(error), newApiJobs: 0, productionAccepted: false }, null, 2) + '\n');
  throw error;
}
