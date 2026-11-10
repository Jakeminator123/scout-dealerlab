/** Preserve the decoded bank motion on the wider native idle grid.
 * A separate review derivative: no crop/stretch, new API job or bank selection.
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { padCanonicalForIdle } from '../src/pamela-idle-source-projection.ts';
const RUN = 'runs/20261110-pamela-idle-chain-bank-body/take-01', W = 1762, H = 1174, OW = 1764, BYTES = W * H * 3;
const BANK = { path: 'runs/20261110-pamela-mask-bank/take-01/evidence.json', sha256: 'ed63d72517802affc241445070c3242c5440d0ab2122d6f55a36b22f372967dc' };
type Ref = { path: string; sha256: string };
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string) => ({ path, sha256: hash(await readFile(path)) });
const checked = async (r: Ref) => { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, r.path); return b; };
assert.equal(process.version, 'v24.21.0'); sharp.concurrency(1);
const bank = JSON.parse((await checked(BANK)).toString()), plan = JSON.parse((await checked(bank.plan)).toString());
assert.equal(plan.width, W); assert.equal(plan.height, H); assert.equal(plan.fps, 30); assert.equal(bank.verification.trimmedFrames, 4404);
assert.equal(bank.engineFixture.realGameValues, false);
const timeline = bank.assembly.compact.timeline, first = timeline.find((x: { id: string }) => x.id === 'C1-P1'), retreat = timeline.find((x: { id: string }) => x.id === 'to-vila');
assert.equal(first.startInclusive, 222); assert.equal(retreat.startInclusive, 4180); assert.equal(retreat.endExclusive, 4269);
const start = first.startInclusive + 4, endExclusive = retreat.endExclusive - 20, frames = endExclusive - start;
assert.equal(start, 226); assert.equal(endExclusive, 4249); assert.equal(frames, 4023);
await checked(bank.compact);
await mkdir('runs/20261110-pamela-idle-chain-bank-body', { recursive: true }); await mkdir(RUN);
for (const name of ['render', 'native', 'snapshot']) await mkdir(`${RUN}/${name}`);
const code = await Promise.all(['tools/pamela-idle-chain-bank-body.ts', 'src/pamela-idle-source-projection.ts'].map(ref));
for (const r of code) await copyFile(r.path, `${RUN}/snapshot/${r.path.replaceAll('/', '__')}`);
const output = `${RUN}/render/bank-body-1764.mp4`;
const decode = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', bank.compact.path, '-vf', `trim=start_frame=${start}:end_frame=${endExclusive}`, '-an', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '1', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const encode = spawn('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${OW}x${H}`, '-r', '30', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-threads', '1', '-movflags', '+faststart', output], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
encode.stdin!.on('error', () => {});
const observe = (child: ChildProcess) => { let error = ''; child.stderr!.on('data', b => error += b); return new Promise<{ code: number | null; error: string }>(resolve => { child.once('error', e => resolve({ code: -1, error: String(e) })); child.once('close', code => resolve({ code, error })); }); };
const decoded = observe(decode), encoded = observe(encode);
encode.once('close', code => { if (code !== 0 && decode.exitCode === null) decode.kill(); });
async function* rgbFrames() {
  let frame = Buffer.allocUnsafe(BYTES), offset = 0;
  for await (const raw of decode.stdout!) {
    const chunk = raw as Buffer; let at = 0;
    while (at < chunk.length) {
      const n = Math.min(BYTES - offset, chunk.length - at); chunk.copy(frame, offset, at, at + n); offset += n; at += n;
      if (offset === BYTES) { yield frame; frame = Buffer.allocUnsafe(BYTES); offset = 0; }
    }
  }
  assert.equal(offset, 0, 'Partial raw source frame');
}
const records = []; let frame = 0;
try {
  for await (const original of rgbFrames()) {
    assert.ok(frame < frames, 'Extra decoded frame');
    const padded = Buffer.from(padCanonicalForIdle(original, 3));
    for (let y = 0; y < H; y++) assert.equal(Buffer.compare(original.subarray(y * W * 3, (y + 1) * W * 3), padded.subarray((y * OW + 1) * 3, (y * OW + 1 + W) * 3)), 0, `Centre columns changed at frame${frame}, row${y}`);
    let native: Ref | null = null;
    if ([0, 1, 1968, 1972, 3784, 3788, frames - 2, frames - 1].includes(frame)) { const path = `${RUN}/native/frame-${String(frame).padStart(4, '0')}.png`; await sharp(padded, { raw: { width: OW, height: H, channels: 3 } }).png().toFile(path); native = await ref(path); }
    records.push({ frame, sourceFrame: start + frame, decodedSourceRgbSha256: hash(original), paddedRgbSha256: hash(padded), unchangedCentreColumns: true, native });
    if (!encode.stdin!.write(padded)) await once(encode.stdin!, 'drain'); frame++;
    if (frame % 600 === 0) console.log(JSON.stringify({ frames: frame, total: frames }));
  }
  const d = await decoded; assert.equal(d.code, 0, d.error); assert.equal(frame, frames);
  encode.stdin!.end(); const e = await encoded; assert.equal(e.code, 0, e.error);
} catch (error) {
  if (decode.exitCode === null) decode.kill(); if (encode.exitCode === null) encode.kill(); await Promise.all([decoded, encoded]);
  await writeFile(`${RUN}/failure.json`, JSON.stringify({ error: String(error), framesCompleted: frame }, null, 2) + '\n', { flag: 'wx' }); throw error;
}
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
assert.equal(probe.streams[0].width, OW); assert.equal(probe.streams[0].height, H); assert.equal(probe.streams[0].avg_frame_rate, '30/1'); assert.equal(Number(probe.streams[0].nb_read_frames), frames);
await writeFile(`${RUN}/evidence.json`, JSON.stringify({ status: 'padded-bank-body-awaiting-whole-chain-review', createdAt: new Date().toISOString(), bank: BANK, source: bank.compact, interval: { startInclusive: start, endExclusive, frames }, output: await ref(output), probe, code, records, verification: { frames, unchangedCentrePixelsBeforeEncoding: W * H * frames, changedCentrePixelsBeforeEncoding: 0, removedSourceColumns: 0, heldFrames: 0, retimedFrames: 0 }, limitations: ['H264 review derivative is reencoded; decoded output pixels are not claimed byte-identical to the input movie.', 'This is only the bank-body component; new opening and return remain separate review gates.'], newApiJobs: 0, productionAccepted: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ evidence: `${RUN}/evidence.json`, frames, sourceStart: start, sourceEndExclusive: endExclusive }));
