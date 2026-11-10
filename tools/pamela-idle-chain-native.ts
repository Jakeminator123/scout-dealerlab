/** Dense decoded-frame evidence at every new VILA-chain boundary. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
type Ref = { path: string; sha256: string };
type Box = { left: number; top: number; width: number; height: number };
const RUN = 'runs/20261110-pamela-idle-chain/take-01', DIR = `${RUN}/native-review`;
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string): Promise<Ref> => ({ path, sha256: hash(await readFile(path)) });
const checked = async (r: Ref) => { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, r.path); return b; };
const proofRef = { path: `${RUN}/evidence.json`, sha256: process.argv[2] };
assert.equal(process.version, 'v24.21.0'); assert.match(proofRef.sha256 ?? '', /^[a-f0-9]{64}$/); sharp.concurrency(1);
const e = JSON.parse((await checked(proofRef)).toString()); await checked(e.output);
assert.equal(e.frames, 4319); assert.equal(e.verification.changedDecodedFramesDuringAssembly, 0);
const face = { left: 730, top: 70, width: 300, height: 340 };
const leftHand = { left: 610, top: 730, width: 260, height: 180 };
const restingHand = { left: 870, top: 730, width: 270, height: 190 };
const shoeHand = { left: 1190, top: 620, width: 230, height: 280 };
const groups: { id: string; start: number; end: number; rois: Record<string, Box> }[] = [
  { id: 'opening-idle-variant', start: 70, end: 80, rois: { face, leftHand, rightHand: restingHand } },
  { id: 'opening-bridge', start: 109, end: 118, rois: { face, leftHand, rightHand: restingHand } },
  { id: 'entry-to-bank', start: 189, end: 203, rois: { face, leftHand, shoeHand } },
  { id: 'body-to-return', start: 4216, end: 4226, rois: { face, leftHand, rightHand: restingHand } },
  { id: 'return-to-idle', start: 4236, end: 4246, rois: { face, leftHand, rightHand: restingHand } },
  { id: 'return-four-frame-mix', start: 4255, end: 4269, rois: { face, leftHand, rightHand: restingHand } },
  { id: 'closing-idle-repeat', start: 4277, end: 4287, rois: { face, leftHand, rightHand: restingHand } },
];
const wanted = [...new Set([...groups.flatMap(g => Array.from({ length: g.end - g.start }, (_, i) => g.start + i)), 0, 75, 113, 193, 197, 4151, 4220, 4240, 4281, 4318])].sort((a, b) => a - b);
await mkdir(DIR); await mkdir(`${DIR}/decoded`); await mkdir(`${DIR}/sheets`);
const code = await ref('tools/pamela-idle-chain-native.ts');
await writeFile(`${DIR}/executed-tool.ts`, await checked(code), { flag: 'wx' });
const filter = `select=${wanted.map(f => `eq(n\\,${f})`).join('+')}`;
execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-threads', '1', '-i', e.output.path, '-vf', filter, '-fps_mode', 'passthrough', '-frames:v', String(wanted.length), '-threads', '1', '-start_number', '0', `${DIR}/decoded/selected-%03d.png`], { windowsHide: true, maxBuffer: 1024 * 1024 });
const decoded = await Promise.all(wanted.map(async (frame, i) => ({ frame, ...await ref(`${DIR}/decoded/selected-${String(i).padStart(3, '0')}.png`) })));
const byFrame = new Map(decoded.map(r => [r.frame, r]));
const sheets = [];
for (const group of groups) for (const [roi, box] of Object.entries(group.rois)) {
  const cells = [], cols = 3, rowHeight = box.height + 25, count = group.end - group.start;
  for (let i = 0; i < count; i++) {
    const frame = group.start + i, x = (i % cols) * box.width, y = Math.floor(i / cols) * rowHeight;
    const b = await checked(byFrame.get(frame)!);
    cells.push({ input: Buffer.from(`<svg width="${box.width}" height="25"><rect width="100%" height="100%" fill="#eee"/><text x="6" y="18" font-size="15" fill="#111">${group.id}: ${frame}</text></svg>`), left: x, top: y });
    cells.push({ input: await sharp(b).extract(box).png().toBuffer(), left: x, top: y + 25 });
  }
  const path = `${DIR}/sheets/${group.id}-${roi}.png`;
  await sharp({ create: { width: box.width * cols, height: Math.ceil(count / cols) * rowHeight, channels: 3, background: '#ddd' } }).composite(cells).png().toFile(path);
  sheets.push({ group: group.id, roi, box, sourceStartInclusive: group.start, sourceEndExclusive: group.end, ...await ref(path) });
}
await checked(code); await checked(proofRef); await checked(e.output);
await writeFile(`${DIR}/evidence.json`, JSON.stringify({ status: 'dense-native-sheets-awaiting-optical-review', createdAt: new Date().toISOString(), proof: proofRef, output: e.output, code, decoded, sheets, decodedFrames: decoded.length, nativeCrops: sheets.reduce((n, s) => n + s.sourceEndExclusive - s.sourceStartInclusive, 0), scaled: false, productionAccepted: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ evidence: `${DIR}/evidence.json`, decodedFrames: decoded.length, sheets: sheets.length }));
