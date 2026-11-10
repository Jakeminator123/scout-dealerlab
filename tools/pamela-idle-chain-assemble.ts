/** Frame-exact assembly of the new VILA opening, existing deal bank and return.
 * Creates a separate local review candidate; never changes the selected bank.
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { pamelaIdleChainPlan, idleChainSegments } from '../src/pamela-idle-chain-plan.ts';

type Ref = { path: string; sha256: string };
const RUN = 'runs/20261110-pamela-idle-chain/take-01';
const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string): Promise<Ref> => ({ path, sha256: hash(await readFile(path)) });
const checked = async (r: Ref) => { const bytes = await readFile(r.path); assert.equal(hash(bytes), r.sha256, `Changed input ${r.path}`); return bytes; };
const json = async (r: Ref) => JSON.parse((await checked(r)).toString());
const openingRef: Ref = { path: process.argv[2], sha256: process.argv[3] };
assert.equal(process.version, 'v24.21.0');
assert.match(openingRef.path ?? '', /^runs\/20261110-pamela-idle-chain-opening\/take-\d{2}\/evidence\.json$/);
assert.match(openingRef.sha256 ?? '', /^[a-f0-9]{64}$/);
const bankRef = { path: 'runs/20261110-pamela-mask-bank/take-01/evidence.json', sha256: 'ed63d72517802affc241445070c3242c5440d0ab2122d6f55a36b22f372967dc' };
const bodyRef = { path: 'runs/20261110-pamela-idle-chain-bank-body/take-01/evidence.json', sha256: 'fbbcc85a1032b7fd7deff61b57c4d7070a918919675bec75d73e623093c67d7e' };
const returnProofRef = { path: 'runs/20261110-pamela-idle-return-overlap/take-01/evidence.json', sha256: '12c69a109d48bd5650703eafb812ef8b3f0e4d155e0f8ebca039d95042b9c017' };
const returnRenderRef = { path: 'runs/20261110-pamela-idle-return-overlap/take-01/render-evidence.json', sha256: '9ad6a4a28d26431d24a2ba1c644123fe9a2db5622d9075045c110215ce262aa0' };
const returnReviewRef = { path: 'runs/20261110-pamela-idle-return-overlap/take-01/review.json', sha256: '305f2af93f70912b515b921fd8997c3aacecac406ae8aaffcbbb0d4762892aaf' };
const bank = await json(bankRef), opening = await json(openingRef), body = await json(bodyRef);
const returnProof = await json(returnProofRef), returnRender = await json(returnRenderRef); await checked(returnReviewRef);
for (const proof of [opening, body, returnProof]) {
  assert.equal(proof.bank.sha256, bankRef.sha256);
  for (const r of proof.code as Ref[]) await checked(r);
}
const head = opening.outputs.find((r: { id: string }) => r.id === 'overlap-4');
const tail = returnRender.rendered.find((r: { id: string }) => r.id === 'overlap-4');
const tailFrames = returnProof.outputs.find((r: { id: string }) => r.id === 'overlap-4').records;
assert.equal(head.frames, 197); assert.equal(body.interval.startInclusive, 226); assert.equal(body.interval.endExclusive, 4249);
assert.equal(body.interval.frames, 4023); assert.equal(tail.frames, 99); assert.equal(returnProof.retained.cards, 14);
assert.equal(returnProof.retained.changedPixels, 0); assert.equal(opening.tableCards, 0);
const timeline = pamelaIdleChainPlan({ dealStart: 222, dealEndExclusive: 4180, retreatEndExclusive: 4269 }, 4, 4);
assert.equal(timeline.length, 4319);
assert.deepEqual(head.records.map((r: { outputFrame: number; a: unknown; b?: unknown; weightB: number }) => [r.outputFrame, r.a, r.b, r.weightB]), timeline.slice(0, 197).map(r => [r.outputFrame, r.a, r.b, r.weightB]));
for (let i = 0; i < 4023; i++) { assert.equal(timeline[197 + i].a.source, 'bank'); assert.equal(timeline[197 + i].a.frame, 226 + i); }
const mapTail = (r: { source: string; frame: number }) => r.source === 'retreat' ? { source: 'bank', frame: 4180 + r.frame - 1 } : r;
for (let i = 0; i < 99; i++) {
  const r = tailFrames[i], expected = timeline[4220 + i];
  assert.equal(r.outputFrame, i); assert.deepEqual(mapTail(r.a), expected.a);
  assert.deepEqual(r.b ? mapTail(r.b) : undefined, expected.b); assert.equal(r.weightB, expected.weightB);
}
const pieces = [
  { id: 'opening', ...head.output as Ref, frames: 197, startInclusive: 0, endExclusive: 197 },
  { id: 'deal-bank-and-retreat', ...body.output as Ref, frames: 4023, startInclusive: 197, endExclusive: 4220 },
  { id: 'return-and-closing-vila', path: tail.path as string, sha256: tail.sha256 as string, frames: 99, startInclusive: 4220, endExclusive: 4319 },
];
const run = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const probe = (path: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt,avg_frame_rate,time_base,nb_read_frames:format=duration', '-of', 'json', path], { encoding: 'utf8', windowsHide: true }));
for (const piece of pieces) {
  await checked(piece); const p = probe(piece.path), v = p.streams[0];
  assert.equal(v.codec_name, 'h264'); assert.equal(v.width, 1764); assert.equal(v.height, 1174); assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.avg_frame_rate, '30/1'); assert.equal(v.time_base, '1/15360'); assert.equal(Number(v.nb_read_frames), piece.frames);
}
await mkdir('runs/20261110-pamela-idle-chain', { recursive: true }); await mkdir(RUN);
for (const dir of ['render', 'qa', 'snapshot', 'native']) await mkdir(`${RUN}/${dir}`);
const code = await Promise.all(['tools/pamela-idle-chain-assemble.ts', 'src/pamela-idle-chain-plan.ts'].map(ref));
for (const r of code) await copyFile(r.path, `${RUN}/snapshot/${r.path.replaceAll('/', '__')}`);
const quote = (path: string) => `'${resolve(path).replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
const concatPath = `${RUN}/qa/concat.txt`;
await writeFile(concatPath, pieces.map(p => `file ${quote(p.path)}\nduration ${(p.frames / 30).toFixed(12)}\n`).join(''), { flag: 'wx' });
const outputPath = `${RUN}/render/vila-fourteen-vila.mp4`;
run(['-n', '-f', 'concat', '-safe', '0', '-i', concatPath, '-map', '0:v:0', '-an', '-c:v', 'copy', '-movflags', '+faststart', outputPath]);
const outputProbe = probe(outputPath), stream = outputProbe.streams[0];
assert.equal(Number(stream.nb_read_frames), 4319); assert.equal(stream.avg_frame_rate, '30/1');
assert.equal(stream.width, 1764); assert.equal(stream.height, 1174); assert.ok(Math.abs(Number(outputProbe.format.duration) - 4319 / 30) < .001);
const hashes = (text: string) => text.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1)!.trim());
const frameHash = (path: string) => run(['-threads', '1', '-i', path, '-an', '-pix_fmt', 'rgb24', '-fps_mode', 'passthrough', '-threads', '1', '-f', 'framemd5', 'pipe:1']);
const expected: string[] = [], componentQa = [];
for (const p of pieces) {
  const md5 = frameHash(p.path), rows = hashes(md5); assert.equal(rows.length, p.frames); expected.push(...rows);
  const path = `${RUN}/qa/${p.id}.framemd5`; await writeFile(path, md5, { flag: 'wx' }); componentQa.push({ id: p.id, ...await ref(path), frames: rows.length });
  console.log(JSON.stringify({ verifiedComponent: p.id, frames: rows.length }));
}
const actualMd5 = frameHash(outputPath), actual = hashes(actualMd5); assert.equal(actual.length, expected.length);
let changed = 0; actual.forEach((value, i) => { if (value !== expected[i]) changed++; }); assert.equal(changed, 0, 'Concatenation changed or dropped component frames');
await writeFile(`${RUN}/qa/full.framemd5`, actualMd5, { flag: 'wx' });
await writeFile(`${RUN}/qa/timeline.json`, JSON.stringify(timeline, null, 2) + '\n', { flag: 'wx' });
const packetText = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_entries', 'packet=pts,duration', '-of', 'json', outputPath], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const packets = JSON.parse(packetText).packets.sort((a: { pts: number }, b: { pts: number }) => a.pts - b.pts);
assert.equal(packets.length, 4319); packets.forEach((p: { pts: number; duration: number }, i: number) => { assert.equal(p.pts, i * 512, `Non-contiguous PTS at ${i}`); assert.equal(p.duration, 512); });
await writeFile(`${RUN}/qa/packets.json`, packetText, { flag: 'wx' });
const landmarks = [
  { label: 'VILA · blinkning', frame: 0 }, { label: 'VILA · lugn variant', frame: 75 }, { label: 'Mot REDO', frame: 113 },
  { label: 'REDO-skarven', frame: 193 },
  ...bank.assembly.compact.timeline.filter((r: { id: string }) => /^C[12]-P[1-7]$/.test(r.id)).map((r: { id: string; startInclusive: number }) => ({ label: `${r.id.startsWith('C1') ? 'Första' : 'Andra'} · plats ${r.id.at(-1)}`, frame: r.startInclusive - 29 })),
  { label: 'Till VILA', frame: 4151 }, { label: 'Vila börjar', frame: 4240 }, { label: 'VILO-skarven', frame: 4259 }, { label: 'Slutvila', frame: 4281 },
];
for (const r of code) await checked(r);
await writeFile(`${RUN}/evidence.json`, JSON.stringify({ schemaVersion: 1, status: 'local-full-chain-awaiting-native-and-browser-review', createdAt: new Date().toISOString(), bank: bankRef, opening: openingRef, body: bodyRef, returnProof: returnProofRef, returnRender: returnRenderRef, returnReview: returnReviewRef, code, pieces, output: await ref(outputPath), probe: outputProbe, frames: 4319, fps: 30, width: 1764, height: 1174, timeline: await ref(`${RUN}/qa/timeline.json`), segments: idleChainSegments(timeline), landmarks, verification: { decodedFrames: actual.length, changedDecodedFramesDuringAssembly: changed, contiguousFrameTimestamps: true, componentQa, fullQa: await ref(`${RUN}/qa/full.framemd5`), packets: await ref(`${RUN}/qa/packets.json`), heldFrames: 0, retimed: false, overlappingSourcePairs: 8, tableStartsEmpty: true, closingCards: 14 }, presentation: opening.presentation, loop: false, newApiJobs: 0, productionAccepted: false, limitations: ['The C1-P1 opening uses the existing explicit demonstration front signal, not a new game-engine decision.', 'Short face/skin softening remains at the four-frame joins; source-pose seams are not accepted as invisible.', 'The bank body was reencoded while preserving all centre pixels before encoding; final assembly itself is a stream copy.', 'Return shoe material stays neutral because no next-card identity is assigned. Physical card-side UNKNOWN tracks remain UNKNOWN.', 'Original shoe body remains in this full movie; independent room, table and shoe swaps have separate interactive proofs.'] }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ evidence: `${RUN}/evidence.json`, frames: 4319, seconds: 4319 / 30, changedAssemblyFrames: changed }));
