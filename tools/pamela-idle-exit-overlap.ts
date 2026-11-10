import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { keyPamelaFrame } from '../src/pamela-key.ts';
import { padCanonicalForIdle } from '../src/pamela-idle-source-projection.ts';
import { temporalJoin, mixTemporalComposites, type TemporalFrame, type TemporalJoinFrame } from '../src/pamela-temporal-join.ts';

type Ref = { path: string; sha256: string };
const W = 1764, H = 1174, CW = 1762;
const RUN = 'runs/20261110-pamela-idle-exit-overlap/take-01';
const SOURCE = 'runs/20261109-pamela-idle-ready-bridge/run-01/qa/take-01/evidence.json';
const BANK = 'runs/20261110-pamela-two-sided-bank/take-02/evidence.json';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string): Promise<Ref> => ({ path, sha256: hash(await readFile(path)) });
async function checked(r: Ref) { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, `BOUND_FILE_CHANGED ${r.path}`); return b; }
const json = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const save = (p: string, value: unknown) => writeFile(p, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const frames = (source: string, start: number, end: number): TemporalFrame[] => Array.from({ length: end - start }, (_, i) => ({ source, frame: start + i }));
const key = (f: TemporalFrame) => `${f.source}-${f.frame}`;
assert.equal(process.version, 'v24.21.0'); sharp.concurrency(1);
assert.equal((await ref(SOURCE)).sha256, 'e06eac8ac37304b79f77a425f3bbaf640a4983edca439ad23d94bf79cd5db26c');
assert.equal((await ref(BANK)).sha256, 'fd9cd8078f35d52fbe1932cb484c0ebd60db60cf5e4a0ef1716237598867fd82');
const source = await json(SOURCE), bank = await json(BANK), plan = JSON.parse((await checked(bank.plan)).toString());
for (const r of source.sourceBindings) await checked(r);
for (const r of plan.scene) await checked(r);
await mkdir('runs/20261110-pamela-idle-exit-overlap', { recursive: true }); await mkdir(RUN);
for (const d of ['sources', 'render', 'native', 'snapshot']) await mkdir(`${RUN}/${d}`);
const code = await Promise.all(['tools/pamela-idle-exit-overlap.ts', 'src/pamela-temporal-join.ts', 'src/pamela-key.ts', 'src/pamela-idle-source-projection.ts'].map(ref));
for (const c of code) await copyFile(c.path, `${RUN}/snapshot/${c.path.split('/').at(-1)}`);

const room = await sharp(plan.scene[0].path).resize(CW, H, { fit: 'contain', background: '#24201d' }).removeAlpha().blur(8).modulate({ brightness: .58, saturation: .65 }).toBuffer();
let canonical = await sharp(room).composite([{ input: await checked(plan.scene[1]) }]).removeAlpha().raw().toBuffer();
const cardSupport = new Uint8Array(W * H), cardRefs: Ref[] = [];
for (let seat = 1; seat <= 7; seat++) {
  const r: Ref = bank.landed.find((r: Ref & { id: string }) => r.id === `C2-P${seat}`); assert.ok(r); cardRefs.push(r);
  const rgba = await sharp(await checked(r)).ensureAlpha().raw().toBuffer(); assert.equal(rgba.length, CW * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < CW; x++) {
    const p = y * CW + x, a = rgba[p * 4 + 3] / 255;
    if (a) { const q = y * W + x + 1; assert.equal(cardSupport[q], 0, 'Retained pairs overlap'); cardSupport[q] = 1;
      for (let c = 0; c < 3; c++) canonical[p * 3 + c] = Math.round(canonical[p * 3 + c] * (1 - a) + rgba[p * 4 + c] * a);
    }
  }
}
const base = Buffer.from(padCanonicalForIdle(canonical, 3));
await sharp(base, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${RUN}/native/fourteen-card-base.png`);
const prefix = frames('B', 305, 327), bridge = frames('bridge', 6, 90), incoming = frames('bank', 17, 38);
const sourceRecords = new Map<string, Ref & { source: string; frame: number; rgbSha256: string; original: Ref; originalRgbSha256: string }>();
for (const f of [...prefix, ...bridge, ...incoming]) {
  const original = source.frames.find((r: TemporalFrame) => r.source === f.source && r.frame === f.frame); assert.ok(original);
  const native = await sharp(await checked(original)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(native.info.height, H); assert.equal(native.info.channels, 3);
  const rgb = native.info.width === CW ? Buffer.from(padCanonicalForIdle(native.data, 3)) : native.data; assert.equal(rgb.length, W * H * 3); assert.equal(hash(rgb), original.rgbSha256);
  const matte = keyPamelaFrame(rgb, W, H), composite = Buffer.from(base);
  for (let p = 0; p < W * H; p++) {
    const a = matte.alpha[p];
    if (cardSupport[p]) assert.equal(a, 0, `Dealer intersects retained cards ${key(f)} ${p}`);
    if (a) for (let c = 0; c < 3; c++) composite[p * 3 + c] = Math.round(base[p * 3 + c] * (1 - a) + matte.rgb[p * 3 + c] * a);
  }
  const path = `${RUN}/sources/${key(f)}.png`; await sharp(composite, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path);
  sourceRecords.set(key(f), { ...await ref(path), ...f, rgbSha256: hash(composite), original: { path: original.path, sha256: original.sha256 }, originalRgbSha256: original.rgbSha256 });
  if (sourceRecords.size % 25 === 0) console.log(JSON.stringify({ compositedSources: sourceRecords.size, retainedCards: 14 }));
}
const get = async (f: TemporalFrame) => { const r = sourceRecords.get(key(f)); assert.ok(r); const b = await sharp(await checked(r)).removeAlpha().raw().toBuffer(); assert.equal(hash(b), r.rgbSha256); return b; };
const crops = { face: { left: 730, top: 70, width: 290, height: 340 }, grip: { left: 1190, top: 590, width: 225, height: 260 } };
const outputs = [];
for (const overlap of [0, 4, 8, 12]) {
  const suffix = overlap ? `overlap-${overlap}` : 'direct';
  const mapped: TemporalJoinFrame[] = [...prefix.map(a => ({ outputFrame: 0, a, weightB: 0 })), ...temporalJoin(bridge, incoming, overlap)].map((f, outputFrame) => ({ ...f, outputFrame }));
  const file = `${RUN}/render/${suffix}.mp4`;
  const child = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-threads', '1', '-movflags', '+faststart', file], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', b => errors += b); const done = once(child, 'close');
  const records = [], metrics: Record<string, unknown>[] = []; let previous: Buffer | undefined;
  const start = prefix.length + bridge.length - overlap, end = prefix.length + bridge.length;
  try {
    for (const f of mapped) {
      const a = await get(f.a), b = f.b ? await get(f.b) : undefined;
      const rgb = b ? Buffer.from(mixTemporalComposites(a, b, f.weightB)) : a;
      let retainedChanges = 0; for (let p = 0; p < cardSupport.length; p++) if (cardSupport[p]) for (let c = 0; c < 3; c++) if (rgb[p * 3 + c] !== base[p * 3 + c]) retainedChanges++;
      assert.equal(retainedChanges, 0);
      const nativeRefs: Ref[] = [];
      if (f.outputFrame >= start - 2 && f.outputFrame <= end + 2) {
        for (const [name, roi] of Object.entries(crops)) {
          const path = `${RUN}/native/${suffix}-${name}-${String(f.outputFrame).padStart(3, '0')}.png`;
          await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).extract(roi).png().toFile(path); nativeRefs.push(await ref(path));
          if (previous) { let sum = 0; for (let y = roi.top; y < roi.top + roi.height; y++) for (let x = roi.left; x < roi.left + roi.width; x++) for (let c = 0; c < 3; c++) { const p = (y * W + x) * 3 + c; sum += Math.abs(rgb[p] - previous[p]); } metrics.push({ outputFrame: f.outputFrame, roi: name, rgbMeanAbsoluteStep: sum / (roi.width * roi.height * 3) }); }
        }
      }
      records.push({ ...f, rgbSha256: hash(rgb), retainedChanges, nativeRefs }); previous = rgb;
      if (!child.stdin.write(rgb)) await once(child.stdin, 'drain');
    }
    child.stdin.end(); const [exit] = await done; assert.equal(exit, 0, errors);
  } catch (error) { child.stdin.destroy(); child.kill(); await done; throw error; }
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
  const v = probe.streams[0]; assert.equal(Number(v.nb_read_frames), mapped.length); assert.equal(v.avg_frame_rate, '30/1'); assert.equal(v.width, W); assert.equal(v.height, H);
  outputs.push({ id: suffix, output: await ref(file), frames: mapped.length, overlap, durationConsumedSeconds: overlap / 30, transition: { start, endExclusive: end }, records, metrics, probe });
  console.log(JSON.stringify({ rendered: suffix, frames: mapped.length, unchangedRetainedCards: 14 }));
}
await save(`${RUN}/evidence.json`, { status: 'processed-overlap-candidates-awaiting-optical-review', createdAt: new Date().toISOString(), sourceEvidence: await ref(SOURCE), bank: await ref(BANK), code, scene: plan.scene, retained: { cards: 14, layers: cardRefs, changedPixels: 0 }, sourceRecords: [...sourceRecords.values()], outputs, width: W, height: H, fps: 30, retimed: false, heldFrames: 0, apiCalls: 0, productionAccepted: false, limits: ['Temporal overlap is processed footage, not a native seamless cut', 'Source motion is unchanged but overlap shortens total duration by4/30,8/30 or12/30 seconds', 'Encoded RGB blending can create double contours; native optical acceptance is required', 'Original videos and all previous review versions remain unchanged', 'H264 previews are lossy; hashes of input RGB and native PNG crops bind verification before encoding'] });
console.log(JSON.stringify({ evidence: `${RUN}/evidence.json`, outputs: outputs.map(o => ({ id: o.id, frames: o.frames })) }));
