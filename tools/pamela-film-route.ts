import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDealerMotionTransition, initialDealerMotionState, planDealerSequence, presentedDealerCardMaterial,
  type BoardCard, type DealEvent, type RevealEvent, type DealerMotionContract, type HashRef, type Motion,
} from '../src/dealer-motion-contract.ts';
import { canonicalPlacement } from './dealer-motion-labels.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const contractPath = 'references/pamela-motion-contract-v2.json';
const proofReviewPath = 'references/pamela-physical-deal-review.json';
const runRoot = 'runs/20261110-pamela-film-route';
const anchorId = 'anchor.VILA';
const finishModes = ['direct', 'to-redo', 'via-redo'] as const;
type Finish = typeof finishModes[number];
type RenderReview = {
  status: 'approved';
  motionId: string;
  source: { sha256: string; startFrame: number; endFrameExclusive: number };
  scene: HashRef;
  video: HashRef;
  boardBefore: BoardCard[];
  boardAfter: BoardCard[];
  dealEvent?: DealEvent;
  revealEvent?: RevealEvent;
};
type AssemblyRequest = {
  contractSha256: string;
  targets: string;
  finish: Finish;
  roundId: string;
  initialBoard: BoardCard[];
  scene: HashRef;
  reviews: HashRef[];
};
type NativeCut = HashRef & { sourceFrames: number; range: [start: number, endExclusive: number] };

async function localFile(relative: string) {
  assert.match(relative, /^(runs|references|media)\//);
  assert.doesNotMatch(relative, /[\\:\x00-\x1f]/);
  assert.ok(relative.split('/').every(part => part && !part.startsWith('.')));
  const resolved = await realpath(path.resolve(root, relative));
  const local = path.relative(await realpath(root), resolved);
  assert.ok(local && !path.isAbsolute(local) && !local.startsWith(`..${path.sep}`) && local !== '..', `Outside Dealerlab: ${relative}`);
  return resolved;
}

async function fileSha(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function checked(ref: HashRef) {
  const file = await localFile(ref.path);
  assert.equal(await fileSha(file), ref.sha256, `Hash mismatch: ${ref.path}`);
  return file;
}

async function checkedJson(ref: HashRef) {
  const bytes = await readFile(await localFile(ref.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256, `Hash mismatch: ${ref.path}`);
  return JSON.parse(bytes.toString());
}

export function planPamelaFilmRoute(contract: DealerMotionContract, targets: string, finish: Finish) {
  assert.ok(finishModes.includes(finish), 'Unknown finish mode');
  const actions = targets.split(',');
  assert.equal(new Set(actions).size, actions.length, 'Each deal or reveal may appear only once');
  const endsWithReveal = actions.at(-1)!.startsWith('reveal:');
  assert.ok(!endsWithReveal || finish === 'direct', 'A final reveal ends at VILA');
  const placements = new Map(contract.cardPlacements.map(slot => [canonicalPlacement(contract, slot.id), slot.id]));
  const requested: string[] = [];
  let needsApproach = true;
  for (const [i, action] of actions.entries()) {
    if (action.startsWith('reveal:')) {
      const target = action.slice(7);
      const slot = placements.get(target);
      assert.equal(slot, 'D.K2', 'Reveal requires D.C2');
      assert.ok(!actions.slice(i + 1).includes(target), 'Hidden card must be placed before reveal');
      requested.push(`reveal.${slot}`);
      needsApproach = true;
      continue;
    }
    const slot = placements.get(action);
    assert.ok(slot, `Unknown canonical placement: ${action}`);
    if (needsApproach) requested.push('bridge.to-redo');
    requested.push(`deal.${slot}.release`);
    const last = i === actions.length - 1;
    const direct = actions[i + 1]?.startsWith('reveal:') || last && finish === 'direct';
    requested.push(`return.${slot}.${direct ? 'direct' : 'to-redo'}`);
    if (last && finish === 'via-redo') requested.push('bridge.to-vila');
    needsApproach = false;
  }
  const motionIds = requested;
  const missing = motionIds.filter(id => !contract.motions.some(motion => motion.id === id));
  const issues = missing.map(motionId => ({ motionId, reason: 'missing-v2-motion' }));
  const route = missing.length ? null : planDealerSequence(contract, { id: targets, anchorId, motionIds, requiredReturnMode: endsWithReveal ? 'none' : finish });
  return { requested, motionIds, route, issues: [...issues, ...(route?.issues ?? [])], readyForLocalAssembly: issues.length === 0 && route?.readyForLocalSimulation === true };
}

function run(command: 'ffmpeg' | 'ffprobe', args: string[]) {
  return execFileSync(command, ['-v', 'error', ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}

function frameDigests(file: string, start: number, end: number, fps: string) {
  const output = run('ffmpeg', ['-nostdin', '-threads', '1', '-i', file, '-map', '0:v:0',
    '-vf', `trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS`,
    '-an', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-threads', '1', '-f', 'framehash', '-hash', 'sha256', 'pipe:1']);
  const [numerator, denominator] = fps.split('/').map(Number);
  assert.ok(output.split(/\r?\n/).includes(`#tb 0: ${denominator}/${numerator}`), 'Frame time base changed');
  const digests = output.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map((line, index) => {
    const fields = line.split(',').map(field => field.trim());
    assert.equal(Number(fields[2]), index, 'Frame timestamp is not contiguous');
    assert.equal(Number(fields[3]), 1, 'Unexpected frame duration');
    return fields[5];
  });
  assert.equal(digests.length, end - start, 'Frame count changed');
  return digests;
}

type VideoStream = { codec_type: string; codec_name: string; width: number; height: number; pix_fmt: string; avg_frame_rate: string; r_frame_rate: string; time_base: string; nb_frames: string };

function clipFormat(file: string, count: number) {
  const { streams } = JSON.parse(run('ffprobe', ['-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,time_base,nb_frames', '-of', 'json', file])) as { streams: VideoStream[] };
  const [video] = streams;
  assert.ok(streams.length === 1 && video.codec_type === 'video' && video.codec_name === 'h264' && video.pix_fmt === 'yuv420p', 'Expected one silent H.264 yuv420p stream');
  assert.ok(video.r_frame_rate === video.avg_frame_rate && Number(video.nb_frames) === count, 'Expected exact source cadence and frame count');
  return { width: video.width, height: video.height, fps: video.avg_frame_rate, timeBase: video.time_base };
}

async function verifyP1Proof() {
  const review = JSON.parse(await readFile(await localFile(proofReviewPath), 'utf8'));
  const proof = review.sequences.find((item: { id: string }) => item.id === 'p1-c1-vila-deal-vila');
  assert.ok(proof, 'P1.C1 physical review is missing');
  const receiptRef = proof.evidence.find((item: HashRef) => item.path.endsWith('/receipt.json'));
  assert.ok(receiptRef, 'P1.C1 source receipt is missing');
  const receipt = await checkedJson(receiptRef);
  assert.ok(receipt.localMotionAccepted && receipt.localProofSeamAccepted);
  assert.deepEqual(receipt.proof, proof.video);
  const qa = await checkedJson(receipt.qa);
  const proofEvidence = await checkedJson(qa.evidence);
  assert.deepEqual(proofEvidence.output, proof.video);
  assert.deepEqual(proofEvidence.sources.map((item: { id: string; frames: number }) => [item.id, item.frames]), [['entry', 59], ['deal', 103], ['return', 60]]);
  const file = await checked(proof.video);
  const format = clipFormat(file, proof.frames);
  assert.deepEqual([format.width, format.height, format.fps, proof.frames], [1764, 1174, '30/1', 222]);
  const expected: string[] = [];
  const spans = [];
  for (const ref of proofEvidence.sources as (HashRef & { id: string; frames: number })[]) {
    const start = expected.length;
    expected.push(...frameDigests(await checked(ref), 0, ref.frames, format.fps));
    spans.push({ id: ref.id, source: { path: ref.path, sha256: ref.sha256 }, sourceRange: [0, ref.frames], outputRange: [start, expected.length] });
  }
  assert.deepEqual(frameDigests(file, 0, proof.frames, format.fps), expected);
  return { status: 'verified-raw-motion-proof', proof: proof.video, evidence: [receiptRef, receipt.qa, qa.evidence], spans, format, matchedDecodedFrames: expected.length, productionAccepted: false };
}

function checkDealSides(motion: Motion, card: BoardCard) {
  const release = motion.releaseFrame!;
  const track = motion.sideTrack!;
  const observed = track.ranges.filter(range => range.startFrame <= release && range.side !== 'UNKNOWN'
    && (range.method === 'marker-observation' || range.method === 'geometry-observation'));
  const sides = observed.map(range => range.side).filter((side, index, values) => index === 0 || side !== values[index - 1]);
  const expected = card.engine.frontAllowed ? ['BACK', 'EDGE', 'FRONT'] : ['BACK'];
  assert.deepEqual(sides, expected, `Unexpected physical side sequence before release: ${motion.id}`);
  const landing = observed.at(-1)!;
  assert.ok(landing.endFrameExclusive > release, `No physical side evidence at release: ${motion.id}`);
  assert.equal(presentedDealerCardMaterial(card, landing.side).surface, landing.side, `Missing authorised landing surface: ${motion.id}`);
}

export async function assembleFilmRoute(contractRef: HashRef, request: AssemblyRequest, take: string) {
  assert.equal(request.contractSha256, contractRef.sha256, 'Route approval refers to another contract revision');
  const contract = await checkedJson(contractRef) as DealerMotionContract;
  assert.deepEqual([contract.projectId, contract.dealerId, contract.bankId], ['snyggare-dealer', 'pamela-pilot', 'pamela-workspace-v1']);
  const route = planPamelaFilmRoute(contract, request.targets, request.finish);
  assert.ok(route.readyForLocalAssembly, `Route blocked: ${JSON.stringify(route.issues)}`);
  assert.equal(request.reviews.length, route.motionIds.length, 'Each route step needs its own approved render review');
  await checked(request.scene);
  const anchor = contract.anchors.find(item => item.id === anchorId)!;
  await checked(contract.assets.find(asset => asset.id === anchor.assetId)!);
  let state = initialDealerMotionState(contract, anchorId, request.roundId, request.initialBoard);
  const expected: string[] = [];
  const segments = [];
  let format: ReturnType<typeof clipFormat> | undefined;
  for (const [index, motionId] of route.motionIds.entries()) {
    const motion = contract.motions.find(item => item.id === motionId)!;
    const binding = motion.binding!;
    const asset = contract.assets.find(item => item.id === binding.assetId)!;
    const gate = contract.edgeGates.find(item => item.from.nodeId === state.boundary.nodeId && item.to.nodeId === motionId)!;
    for (const ref of [asset, gate.qa.evidence!, motion.qa.evidence!, motion.filmPath!.qa.evidence!]) await checked(ref);
    if (motion.geometry) for (const ref of [motion.geometry.cardTrack, motion.geometry.handMask]) await checked(ref);
    if (motion.sideTrack?.ranges.some(range => range.method === 'marker-observation')) await checked(contract.markerLegend.qa.evidence!);
    const review = await checkedJson(request.reviews[index]) as RenderReview;
    assert.equal(review.status, 'approved', 'Render review must attest preserved cards and visual continuity');
    assert.equal(review.motionId, motionId);
    assert.deepEqual(review.scene, request.scene);
    assert.deepEqual(review.source, { sha256: binding.sha256, startFrame: binding.startFrame, endFrameExclusive: binding.endFrameExclusive });
    assert.deepEqual(review.boardBefore, state.board, `Render begins with different cards: ${motionId}`);
    const { dealEvent, revealEvent } = review;
    assert.ok(!dealEvent || !revealEvent, 'Each motion consumes at most one engine event');
    state = applyDealerMotionTransition(contract, state, motionId, revealEvent ?? dealEvent);
    assert.deepEqual(review.boardAfter, state.board, `Render drops or changes cards: ${motionId}`);
    if (dealEvent) checkDealSides(motion, dealEvent.card);
    if (revealEvent?.front) await checked(revealEvent.front.qa.evidence!);
    const file = await checked(review.video);
    const count = binding.endFrameExclusive - binding.startFrame;
    const currentFormat = clipFormat(file, count);
    const [numerator, denominator] = currentFormat.fps.split('/').map(Number);
    assert.ok(Math.abs(numerator / denominator - asset.fps) < 1e-6, `Render retimes source: ${motionId}`);
    format ??= currentFormat;
    assert.deepEqual(currentFormat, format, 'Rendered segments need the same native output format');
    const start = expected.length;
    expected.push(...frameDigests(file, 0, count, format.fps));
    segments.push({ motionId, file, count, outputRange: [start, expected.length], review: request.reviews[index], video: review.video });
  }
  assert.ok(format);
  const output = await newTake(take);
  const [numerator, denominator] = format.fps.split('/').map(Number);
  const quote = (file: string) => `'${file.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`;
  const concat = path.join(output, 'concat.txt');
  await writeFile(concat, segments.map(segment => `file ${quote(segment.file)}\nduration ${(segment.count * denominator / numerator).toFixed(12)}`).join('\n') + '\n', { flag: 'wx' });
  const film = `${runRoot}/${take}/film.mp4`;
  const outputFile = path.join(output, 'film.pending.mp4');
  run('ffmpeg', ['-nostdin', '-n', '-f', 'concat', '-safe', '0', '-i', concat, '-map', '0:v:0', '-c:v', 'copy', '-movflags', '+faststart', outputFile]);
  assert.deepEqual(clipFormat(outputFile, expected.length), format);
  assert.deepEqual(frameDigests(outputFile, 0, expected.length, format.fps), expected);
  await checked(contractRef);
  await checked(request.scene);
  for (const segment of segments) {
    await checked(segment.review);
    await checked(segment.video);
  }
  const sha256 = await fileSha(outputFile);
  await rename(outputFile, path.resolve(root, film));
  return { status: 'assembled-from-reviewed-segments', contract: contractRef, scene: request.scene, motionIds: route.motionIds,
    film: { path: film, sha256 }, format, segments: segments.map(({ file, ...segment }) => segment),
    matchedDecodedFrames: expected.length, finalBoard: state.board, productionAccepted: false };
}

async function newTake(take: string) {
  assert.match(take, /^take-\d{2,}$/);
  const directory = path.resolve(root, runRoot);
  const runs = path.resolve(root, 'runs');
  assert.equal(await realpath(runs), runs, 'Runs directory must not be redirected');
  await mkdir(directory, { recursive: true });
  assert.equal(await realpath(directory), directory, 'Film output directory must not be redirected');
  const output = path.join(directory, take);
  await mkdir(output);
  return output;
}

async function joinNativeCuts(requestPath: string) {
  assert.match(requestPath, /^runs\/[a-z0-9-]+(?:\/[a-z0-9-]+)+\/review\/native-join-request\.json$/);
  const requestFile = await localFile(requestPath);
  const requestBytes = await readFile(requestFile);
  const requestRef = { path: requestPath, sha256: createHash('sha256').update(requestBytes).digest('hex') };
  const { cuts, review } = JSON.parse(requestBytes.toString()) as { cuts: NativeCut[]; review: HashRef };
  assert.ok(Array.isArray(cuts) && cuts.length >= 2 && cuts.length <= 8, 'Expected two to eight native cuts');
  await checked(review);
  const sourceFiles = [];
  const expected: string[] = [];
  for (const cut of cuts) {
    const [start, end] = cut.range;
    assert.ok([start, end, cut.sourceFrames].every(Number.isSafeInteger) && start >= 0 && end > start && end <= cut.sourceFrames);
    const file = await checked(cut);
    const { width, height, fps } = clipFormat(file, cut.sourceFrames);
    assert.deepEqual([width, height, fps], [1764, 1174, '30/1'], 'Expected Pamela native plane and cadence');
    sourceFiles.push(file);
    expected.push(...frameDigests(file, start, end, fps));
  }

  const directory = path.join(path.dirname(requestFile), 'native-join');
  await mkdir(directory);
  const pending = path.join(directory, 'clip.pending.mp4');
  const filters = cuts.map(({ range: [start, end] }, index) =>
    `[${index}:v]trim=start_frame=${start}:end_frame=${end},setpts=PTS-STARTPTS[cut${index}]`);
  const streams = cuts.map((_, index) => `[cut${index}]`).join('');
  filters.push(`${streams}concat=n=${cuts.length}:v=1:a=0[out]`);
  run('ffmpeg', ['-nostdin', '-n', ...sourceFiles.flatMap(file => ['-threads', '1', '-i', file]),
    '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[out]',
    '-c:v', 'libx264', '-crf', '0', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-threads', '2',
    '-fps_mode', 'passthrough', '-movflags', '+faststart', pending]);
  const format = clipFormat(pending, expected.length);
  assert.deepEqual([format.width, format.height, format.fps], [1764, 1174, '30/1']);
  assert.deepEqual(frameDigests(pending, 0, expected.length, format.fps), expected);
  await checked(requestRef);
  await checked(review);
  for (const cut of cuts) await checked(cut);
  const output = { path: path.relative(root, path.join(directory, 'clip.mp4')).split(path.sep).join('/'), sha256: await fileSha(pending) };
  await rename(pending, path.join(directory, 'clip.mp4'));
  const receipt = { status: 'native-cuts-verified', request: requestRef, review, cuts, output, format,
    matchedDecodedFrames: expected.length, renderedSceneAccepted: false, productionAccepted: false };
  await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}

const usage = 'Usage: node tools/pamela-film-route.ts plan P1.C1,P4.C1 [direct|to-redo|via-redo] | plan reveal:D.C2[,D.C3] | verify-p1-proof take-NN | assemble runs/.../request.json take-NN | join-native runs/.../review/native-join-request.json';
async function main() {
  const [command, input, last, ...extra] = process.argv.slice(2);
  assert.ok(!extra.length && input, usage);
  if (command === 'join-native') {
    assert.ok(!last, usage);
    console.log(JSON.stringify(await joinNativeCuts(input)));
    return;
  }
  if (command === 'verify-p1-proof') {
    assert.ok(!last, usage);
    const result = await verifyP1Proof();
    await writeFile(path.join(await newTake(input), 'receipt.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result));
    return;
  }
  const bytes = await readFile(await localFile(contractPath));
  const contract = JSON.parse(bytes.toString()) as DealerMotionContract;
  assert.deepEqual([contract.projectId, contract.dealerId, contract.bankId], ['snyggare-dealer', 'pamela-pilot', 'pamela-workspace-v1']);
  const ref = { path: contractPath, sha256: createHash('sha256').update(bytes).digest('hex') };
  if (command === 'plan') console.log(JSON.stringify({ contract: ref, revision: contract.revision, ...planPamelaFilmRoute(contract, input, (last ?? 'direct') as Finish) }, null, 2));
  else if (command === 'assemble' && last) {
    const request = JSON.parse(await readFile(await localFile(input), 'utf8')) as AssemblyRequest;
    const result = await assembleFilmRoute(ref, request, last);
    await writeFile(path.resolve(root, runRoot, last, 'receipt.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result));
  } else throw Error(usage);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
