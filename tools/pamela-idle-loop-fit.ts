import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';

// Local analysis only. Pixels are transformed only for metric/contact-sheet evidence.
// Exported movies keep the original YUV frame values, dimensions and timing.
const run = 'runs/20261109-pamela-idle-loop-fit';
const execute = promisify(execFile);
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const W = 440, H = 293, FW = 1762, FH = 1174, FPS = 30;
const isBreath = process.argv.includes('--breath');
sharp.concurrency(1);
type Rect = { left: number; top: number; width: number; height: number };
const regions: Record<string, Rect> = {
  face: { left: 775, top: 120, width: 205, height: 230 },
  eyes: { left: 785, top: 184, width: 176, height: 61 },
  mouth: { left: 810, top: 262, width: 125, height: 70 },
  leftHand: { left: 635, top: 752, width: 213, height: 139 },
  rightHand: { left: 894, top: 749, width: 212, height: 143 },
  torso: { left: 597, top: 369, width: 552, height: 373 },
};
const smallRects = Object.fromEntries(Object.entries(regions).map(([k, r]) => [k, {
  left: Math.round(r.left * W / FW), top: Math.round(r.top * H / FH),
  width: Math.round(r.width * W / FW), height: Math.round(r.height * H / FH),
}]));
const contract = JSON.parse(await readFile('references/pamela-motion-contract.json', 'utf8'));
const sources = Object.fromEntries(['continuous-idle-raw', 'breath-raw'].map(id => {
  const s = contract.assets.find((v: any) => v.id === id);
  if (!s) throw Error(`Missing source ${id}`);
  return [id, s];
})) as Record<string, any>;
await mkdir(`${run}/qa`, { recursive: true });
await mkdir(`${run}/render`, { recursive: true });
for (const s of Object.values(sources)) {
  if (hash(await readFile(s.path)) !== s.sha256) throw Error(`Source hash mismatch: ${s.id}`);
  s.probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,avg_frame_rate,nb_frames,pix_fmt', '-of', 'json', s.path], { windowsHide: true })).stdout).streams[0];
  if (s.probe.width !== FW || s.probe.height !== FH || s.probe.avg_frame_rate !== '30/1' || +s.probe.nb_frames !== s.frames || s.probe.pix_fmt !== 'yuv420p') throw Error('Source format mismatch');
}
const mae = (a: Buffer, b: Buffer) => { let t = 0; for (let n = 0; n < a.length; n++) t += Math.abs(a[n] - b[n]); return t / a.length; };
function crop(b: Buffer, r: Rect) {
  const o = Buffer.alloc(r.width * r.height * 3);
  for (let y = 0; y < r.height; y++) b.copy(o, y * r.width * 3, ((r.top + y) * W + r.left) * 3, ((r.top + y) * W + r.left + r.width) * 3);
  return o;
}
function centroid(b: Buffer, r: Rect) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const at = ((r.top + y) * W + r.left + x) * 3;
    const R = b[at], G = b[at + 1], B = b[at + 2];
    if (R > 70 && G > 35 && B > 25 && R > G * 1.12 && R > B * 1.12) { sx += x + r.left; sy += y + r.top; n++; }
  }
  if (!n) throw Error('Empty skin proxy');
  return { x: sx / n * FW / W, y: sy / n * FH / H, pixels: n };
}
function silhouette(b: Buffer, nativeY: number) {
  const y = Math.round(nativeY * H / FH), found: number[] = [];
  for (let x = Math.round(530 * W / FW); x < Math.round(1190 * W / FW); x++) {
    const at = (y * W + x) * 3, R = b[at], G = b[at + 1], B = b[at + 2];
    if (R < 85 && G < 100 && B < 95) found.push(x * FW / W);
  }
  return [found[0], found.at(-1)] as [number, number];
}
type Feature = { rgb: Record<string, Buffer>; pose: number[]; skin: Record<string, ReturnType<typeof centroid>> };
async function features(s: any): Promise<Feature[]> {
  const { stdout } = await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', s.path,
    '-vf', `scale=${W}:${H}:flags=area`, '-threads', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
  { encoding: 'buffer', windowsHide: true, maxBuffer: W * H * 3 * (s.frames + 1) });
  if (stdout.length !== W * H * 3 * s.frames) throw Error('Metric decode frame count mismatch');
  return Array.from({ length: s.frames }, (_, f) => {
    const b = stdout.subarray(f * W * H * 3, (f + 1) * W * H * 3);
    const skin = Object.fromEntries(['face', 'leftHand', 'rightHand'].map(k => [k, centroid(b, smallRects[k])]));
    return { rgb: Object.fromEntries(Object.entries(smallRects).map(([k, r]) => [k, crop(b, r)])), skin,
      pose: [...Object.values(skin).flatMap(p => [p.x, p.y]), ...silhouette(b, 420), ...silhouette(b, 650)] };
  });
}
function appearance(f: Feature[], start: number, end: number) {
  return Object.fromEntries(Object.keys(regions).map(k => [k, mae(f[end].rgb[k], f[start].rgb[k])]));
}
function temporal(f: Feature[], start: number, end: number) {
  const p = Math.max(0, end - 2), n = Math.min(f.length - 1, start + 2);
  return Object.fromEntries(Object.keys(regions).map(k => {
    const a = f[end].rgb[k], b = f[start].rgb[k], prev = f[p].rgb[k], next = f[n].rgb[k];
    let velocityMismatch = 0, jumpResidual = 0, incoming = 0, outgoing = 0;
    for (let j = 0; j < a.length; j++) {
      const vin = (a[j] - prev[j]) / (end - p), vout = (next[j] - b[j]) / (n - start), jump = b[j] - a[j];
      velocityMismatch += Math.abs(vout - vin); jumpResidual += Math.abs(jump - (vin + vout) / 2);
      incoming += Math.abs(vin); outgoing += Math.abs(vout);
    }
    return [k, { incoming: incoming / a.length, outgoing: outgoing / a.length,
      velocityMismatch: velocityMismatch / a.length, jumpResidual: jumpResidual / a.length }];
  }));
}
function poseMetric(f: Feature[], start: number, end: number) {
  const p = Math.max(0, end - 2), n = Math.min(f.length - 1, start + 2);
  const jump = f[start].pose.map((v, k) => v - f[end].pose[k]);
  const incoming = f[end].pose.map((v, k) => (v - f[p].pose[k]) / (end - p));
  const outgoing = f[n].pose.map((v, k) => (v - f[start].pose[k]) / (n - start));
  const rms = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  return { jumpRmsPx: rms(jump), jumpMaxAbsPx: Math.max(...jump.map(Math.abs)),
    incomingRmsPxPerFrame: rms(incoming), outgoingRmsPxPerFrame: rms(outgoing),
    velocityMismatchRmsPxPerFrame: rms(incoming.map((v, k) => outgoing[k] - v)),
    residualRmsPx: rms(jump.map((v, k) => v - (incoming[k] + outgoing[k]) / 2)),
    coordinateOrder: ['faceX', 'faceY', 'leftHandX', 'leftHandY', 'rightHandX', 'rightHandY', 'shoulderRowLeft', 'shoulderRowRight', 'elbowRowLeft', 'elbowRowRight'],
    startPose: f[start].pose, endPose: f[end].pose };
}
function assess(f: Feature[], start: number, end: number) {
  const app = appearance(f, start, end), time = temporal(f, start, end), pose = poseMetric(f, start, end);
  const appearanceScore = app.face + app.eyes * .5 + app.mouth * .25 + (app.leftHand + app.rightHand) * .5 + app.torso * .3;
  const temporalScore = time.face.velocityMismatch + time.eyes.velocityMismatch * .5 + (time.leftHand.velocityMismatch + time.rightHand.velocityMismatch) * .4;
  return { startFrameInclusive: start, endFrameInclusive: end, endFrameExclusive: end + 1, frames: end - start + 1, seconds: (end - start + 1) / FPS,
    appearance: app, temporal: time, pose, score: appearanceScore + temporalScore * 1.5 + pose.jumpRmsPx * .75 + pose.velocityMismatchRmsPxPerFrame };
}
async function nativeFrames(s: any, indices: number[]): Promise<Map<number, Buffer>> {
  const unique = [...new Set(indices)].sort((a, b) => a - b), bytes = FW * FH * 3;
  const selection = unique.map(index => `eq(n\\,${index})`).join('+');
  const raw = (await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '4', '-i', s.path, '-vf', `select=${selection}`,
    '-fps_mode', 'passthrough', '-frames:v', String(unique.length), '-threads', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
  { encoding: 'buffer', maxBuffer: bytes * (unique.length + 1), windowsHide: true })).stdout;
  if (raw.length !== bytes * unique.length) throw Error('Native evidence frame count mismatch');
  const result = new Map<number, Buffer>();
  for (let i = 0; i < unique.length; i++) result.set(unique[i], await sharp(raw.subarray(i * bytes, (i + 1) * bytes), { raw: { width: FW, height: FH, channels: 3 } }).png().toBuffer());
  return result;
}
async function evidence(s: any, c: any, name: string) {
  const indices = [c.endFrameInclusive - 2, c.endFrameInclusive - 1, c.endFrameInclusive,
    c.startFrameInclusive, c.startFrameInclusive + 1, c.startFrameInclusive + 2];
  const pictures: Buffer[] = [], originals = await nativeFrames(s, indices);
  for (const index of indices) {
    const b = originals.get(index)!; pictures.push(b);
    await writeFile(`${run}/qa/${name}-source-${String(index).padStart(3, '0')}.png`, b);
  }
  const native: Record<string, any> = {};
  for (const [key, r] of Object.entries(regions)) {
    const crops: Buffer[] = [];
    for (const p of pictures) crops.push(await sharp(p).extract(r).removeAlpha().raw().toBuffer());
    native[key] = { roi: r, jumpRgbMae: mae(crops[2], crops[3]), previousStepRgbMae: mae(crops[1], crops[2]), nextStepRgbMae: mae(crops[3], crops[4]) };
    if (key === 'torso') continue;
    const panels: sharp.OverlayOptions[] = [];
    for (let j = 0; j < 6; j++) {
      const label = Buffer.from(`<svg width="${r.width}" height="25"><rect width="100%" height="100%" fill="#17232e"/><text x="6" y="18" fill="white" font-family="Arial" font-size="14">${indices[j]} ${j === 3 ? 'LOOP' : ''}</text></svg>`);
      panels.push({ input: label, left: j * r.width, top: 0 },
        { input: await sharp(crops[j], { raw: { width: r.width, height: r.height, channels: 3 } }).png().toBuffer(), left: j * r.width, top: 25 });
    }
    await sharp({ create: { width: r.width * 6, height: r.height + 25, channels: 3, background: '#111' } }).composite(panels).png().toFile(`${run}/qa/${name}-${key}-native.png`);
  }
  const fullPanels: sharp.OverlayOptions[] = [];
  for (let j = 0; j < 6; j++) fullPanels.push({ input: await sharp(pictures[j]).resize(881, 587).png().toBuffer(), left: (j % 3) * 881, top: Math.floor(j / 3) * 612 + 25 },
    { input: Buffer.from(`<svg width="881" height="25"><rect width="100%" height="100%" fill="#17232e"/><text x="8" y="19" fill="white" font-family="Arial" font-size="17">${name}: source ${indices[j]}${j === 3 ? ' (loop begins)' : ''}</text></svg>`), left: (j % 3) * 881, top: Math.floor(j / 3) * 612 });
  await sharp({ create: { width: 2643, height: 1224, channels: 3, background: '#111' } }).composite(fullPanels).png().toFile(`${run}/qa/${name}-fullframe.png`);
  return native;
}
async function frameHashes(path: string) {
  const text = (await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', path, '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-'], { maxBuffer: 2_000_000, windowsHide: true })).stdout;
  return text.split(/\r?\n/).filter(v => v && !v.startsWith('#')).map(v => v.split(',').at(-1)!.trim());
}

if (process.argv.includes('--review')) {
  const variants = JSON.parse(await readFile(`${run}/evidence.json`, 'utf8'));
  const base = JSON.parse(await readFile(`${run}/breath-evidence.json`, 'utf8'));
  const summarize = (c: any, baseline: any, classification: string, blinkIntervals: number[][], observations: string[]) => ({
    name: c.name, sourceId: c.sourceId, sourceSha256: c.sourceSha256, startFrameInclusive: c.startFrameInclusive,
    endFrameInclusive: c.endFrameInclusive, frames: c.frames, fps: 30, seconds: c.seconds,
    recommendedClassification: classification, observedBlinkCount: blinkIntervals.length,
    approximateAffectedSourceFrames: blinkIntervals, blinkCountingMethod: 'Manual inspection of every native eye crop in the selected interval; intervals are approximate, counts are visual observations.',
    nativeFaceJumpRgbMae: c.native.face.jumpRgbMae, baselineNativeFaceJumpRgbMae: baseline.native.face.jumpRgbMae,
    nativeFaceJumpReductionPercent: (1 - c.native.face.jumpRgbMae / baseline.native.face.jumpRgbMae) * 100,
    observations, realTimePlaybackReviewed: false, productionAccepted: false,
    browserTriple: c.clips.find((v: any) => v.role === 'browser-review-proxy' && v.repeats === 3),
    originalPixelMaster: c.clips.find((v: any) => v.role === 'lossless-original-frame-master' && v.repeats === 1),
  });
  const review = {
    schemaVersion: 1, createdAt: new Date().toISOString(), authorRole: 'bounded local idle seam analysis',
    conclusion: 'Three better local cut candidates: one blink-free breathing base, one blink insert, one side-glance insert. None is an activated or perceptually approved runtime loop.',
    candidates: [
      summarize(base.candidates[0], base.baseline.breath6s, 'calm-breathing-base-candidate', [], [
        'All 180 native eye frames of the breath source inspected; no blink observed, including the 135-frame selected segment.',
        'No large head/gaze/hand action seen in the complete original-frame contact sheets. The breathing motion and seam still require real-time review.',
        'Endpoint skin detail is more consistent than original 179 to 0, but residual skin-texture and brightness differences remain visible in native crops.',
      ]),
      summarize(variants.candidates[0], variants.baseline.continuous12s, 'blink-insert-candidate', [[286, 290], [332, 337]], [
        'Two complete blinks remain; no blink is cut at the seam. Native face, both hands and full-frame seam contact sheets were inspected.',
        'Direct repeated playback would produce about 46 blinks/minute by arithmetic extrapolation; this is not a recommended playback cadence or a medical norm.',
        'Retain for an occasional insert assessment, not an endlessly repeated calm base.',
      ]),
      summarize(variants.candidates[1], variants.baseline.continuous12s, 'side-glance-insert-candidate', [[184, 187], [213, 216], [234, 238]], [
        'Three complete blinks and a visible side glance around source 217 to 232, returning forward before the endpoint.',
        'Direct repeated playback would produce about 50 blinks/minute by arithmetic extrapolation; no playback policy is assigned.',
        'Native face and full-frame seam contact sheets inspected. Retain as an occasional glance insert candidate.',
      ]),
    ],
    evidence: ['scan.json', 'breath-scan.json', 'evidence.json', 'breath-evidence.json', 'qa/breath-eyes-all-000.png', 'qa/breath-eyes-all-060.png', 'qa/breath-eyes-all-120.png'],
    originalContinuousEyeEvidence: ['runs/20261109-pamela-continuous-idle/qa/eyes-all-180.png', 'runs/20261109-pamela-continuous-idle/qa/eyes-all-240.png', 'runs/20261109-pamela-continuous-idle/qa/eyes-all-300.png'],
    unresolvedGates: ['Real-time triple-playback judgment in the composed scene.', 'Base-to-variant and variant-to-base seams are different edges and remain unverified.', 'VILA-to-REDO and REDO-to-VILA compatibility, persistent table/card state and final runtime policy remain unverified.'],
    metricBoundary: 'Percent reductions refer only to native face-ROI RGB MAE. They are not beauty, realism or acceptance scores. Pose proxies and finite RGB derivatives are not anatomical tracking or optical flow.',
    sourceProcessing: 'Only contiguous cuts and exact repeats. Lossless masters compare equal for every original decoded YUV420p frame. H.264 High CRF14 browser proxies have compression loss but preserve the selected frame order, count, dimensions and 30 fps.',
    resourceOwnership: 'No server, browser tab, paid job or persistent helper was created by this subtask.',
  };
  await writeFile(`${run}/review.json`, JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify(review.candidates.map((c: any) => ({ name: c.name, classification: c.recommendedClassification, blinkCount: c.observedBlinkCount,
    seconds: c.seconds, nativeFaceJumpRgbMae: c.nativeFaceJumpRgbMae, reductionPercent: c.nativeFaceJumpReductionPercent })), null, 2));
} else if (process.argv.includes('--export')) {
  const scan = JSON.parse(await readFile(`${run}/${isBreath ? 'breath-scan' : 'scan'}.json`, 'utf8'));
  const selections = process.argv.filter(v => /^\d+:\d+$/.test(v)).map(v => v.split(':').map(Number));
  if (selections.length < 1 || selections.length > 2) throw Error('Supply one or two zero-based inclusive start:end pairs');
  if (isBreath && selections.length !== 1) throw Error('Only one breath candidate is authorized');
  const s = sources[isBreath ? 'breath-raw' : 'continuous-idle-raw'], decoded = await frameHashes(s.path), outputs: any[] = [];
  for (const [key, baseline] of Object.entries(scan.baseline) as [string, any][]) {
    baseline.native = {};
    const indices = [baseline.endFrameInclusive - 1, baseline.endFrameInclusive, baseline.startFrameInclusive, baseline.startFrameInclusive + 1];
    for (const [name, roi] of Object.entries(regions)) {
      const rgb: Buffer[] = [];
      for (const index of indices) rgb.push(await sharp(`${run}/qa/baseline-${key}-source-${String(index).padStart(3, '0')}.png`).extract(roi).removeAlpha().raw().toBuffer());
      baseline.native[name] = { roi, jumpRgbMae: mae(rgb[1], rgb[2]), previousStepRgbMae: mae(rgb[0], rgb[1]), nextStepRgbMae: mae(rgb[2], rgb[3]) };
    }
  }
  for (let i = 0; i < selections.length; i++) {
    const [start, end] = selections[i], c = scan.ranked.find((v: any) => v.startFrameInclusive === start && v.endFrameInclusive === end);
    if (!c) throw Error('Selection absent from fully ranked scan');
    const name = `${isBreath ? 'breath-base' : `candidate-${i + 1}`}-${start}-${end}`, native = await evidence(s, c, name);
    const clips: any[] = [];
    for (const repeats of [1, 3]) {
      const output = `${run}/render/${name}${repeats === 3 ? '-triple' : ''}.mp4`;
      const filter = `trim=start_frame=${start}:end_frame=${end + 1},setpts=PTS-STARTPTS${repeats === 3 ? `,loop=loop=2:size=${c.frames}:start=0,setpts=N/(30*TB)` : ''}`;
      await execute('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-threads', '1', '-i', s.path, '-vf', filter, '-an',
        '-c:v', 'libx264', '-qp', '0', '-preset', 'fast', '-threads', '4', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-movflags', '+faststart', output], { maxBuffer: 200_000, windowsHide: true });
      const outHashes = await frameHashes(output), expected = Array.from({ length: repeats }, () => decoded.slice(start, end + 1)).flat();
      if (outHashes.length !== expected.length || outHashes.some((v, k) => v !== expected[k])) throw Error('Output differs from original decoded source frames');
      const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', output], { windowsHide: true })).stdout).streams[0];
      if (probe.avg_frame_rate !== '30/1' || probe.width !== FW || probe.height !== FH || +probe.nb_frames !== expected.length) throw Error('Output metadata mismatch');
      clips.push({ path: output, sha256: hash(await readFile(output)), repeats, frames: expected.length, fps: 30,
        seconds: expected.length / 30, role: 'lossless-original-frame-master', decodedSourceFrameEquality: { checked: expected.length, matched: expected.length, pixelFormat: 'yuv420p', method: 'ffmpeg framemd5 every original and exported frame' }, probe });
      const preview = output.replace('.mp4', '-preview.mp4');
      await execute('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-threads', '1', '-i', output, '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast',
        '-profile:v', 'high', '-threads', '4', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-movflags', '+faststart', preview], { maxBuffer: 200_000, windowsHide: true });
      const previewProbe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames,profile', '-of', 'json', preview], { windowsHide: true })).stdout).streams[0];
      if (previewProbe.avg_frame_rate !== '30/1' || previewProbe.width !== FW || previewProbe.height !== FH || +previewProbe.nb_frames !== expected.length) throw Error('Browser preview metadata mismatch');
      clips.push({ path: preview, sha256: hash(await readFile(preview)), repeats, frames: expected.length, fps: 30, seconds: expected.length / 30,
        role: 'browser-review-proxy', compression: 'H.264 high profile CRF14, full frame dimensions, no geometric or timing transforms; lossy pixels',
        decodedSourceFrameEquality: 'not pixel-identical; compression-only derivative of verified lossless master', probe: previewProbe });
    }
    outputs.push({ name, sourceId: s.id, sourceSha256: s.sha256, ...c, native, clips, accepted: false });
  }
  await writeFile(`${run}/${isBreath ? 'breath-evidence' : 'evidence'}.json`, JSON.stringify({ schemaVersion: 1, dealerId: contract.dealerId, createdAt: new Date().toISOString(), sources,
    status: 'local-loop-candidates-native-seam-stills-reviewed-realtime-acceptance-pending', productionAccepted: false,
    processing: { trimmingOnly: true, crossfade: false, morph: false, freeze: false, retime: false, imageEnhancement: false, nativeDimensions: true,
      masters: 'lossless YUV420p with every decoded frame checked', browserProxies: 'CRF14 H.264 High; compression-only derivatives, not pixel-identical' },
    baseline: scan.baseline, candidates: outputs, metricLimitations: scan.metricLimitations,
    nextGate: 'View the triple movie in real time and compare native seam face/eyes/hands. A better numeric score is not endpoint beauty, perceptual continuity, bridge compatibility or runtime acceptance.' }, null, 2) + '\n');
  console.log(JSON.stringify(outputs.map(v => ({ name: v.name, seconds: v.seconds, native: v.native, clips: v.clips })), null, 2));
} else {
  const target = sources[isBreath ? 'breath-raw' : 'continuous-idle-raw'];
  const continuous = await features(target), breath = isBreath ? continuous : await features(sources['breath-raw']);
  const maxFrames = isBreath ? 165 : 240;
  const ranked: any[] = [];
  for (let start = 0; start < continuous.length - 74; start++) for (let frames = 75; frames <= maxFrames && start + frames <= continuous.length; frames++) {
    ranked.push(assess(continuous, start, start + frames - 1));
  }
  ranked.sort((a, b) => a.score - b.score);
  const baseline: Record<string, any> = isBreath ? { breath6s: assess(breath, 0, 179) } : { continuous12s: assess(continuous, 0, 359), breath6s: assess(breath, 0, 179) };
  const shortlist: any[] = [];
  for (const c of ranked) if (shortlist.every(o => Math.abs(o.startFrameInclusive - c.startFrameInclusive) + Math.abs(o.endFrameInclusive - c.endFrameInclusive) >= 25)) { shortlist.push(c); if (shortlist.length === 12) break; }
  const metricLimitations = [
    'All metrics rank candidates; none measure beauty or establish perceptual acceptance.',
    'RGB metrics use separately weighted face, eyes, mouth, each hand and torso; the large static green background cannot dominate.',
    'Scan RGB is area-downsampled to 440x293; selected endpoint crops are remeasured at native resolution.',
    'Temporal RGB derivatives use two source-frame steps at each side; they include compression, illumination and texture evolution as well as motion. They are not optical flow.',
    'Pose proxies are thresholded skin centroids plus silhouette crossings at shoulder/elbow rows, in native pixel units; they are not calibrated anatomical landmarks or 3D pose.',
    'Score weights are explicit heuristics, not validated perceptual thresholds. Lower is a search aid only.',
    'Any internal cut changes blink cadence and needs review of complete motion and REDO bridge compatibility.'
  ];
  await writeFile(`${run}/${isBreath ? 'breath-scan' : 'scan'}.json`, JSON.stringify({ schemaVersion: 1, sources, fps: FPS, frameConvention: 'zero based; inclusive start/end; endFrameExclusive also recorded',
    search: { sourceId: target.id, minFrames: 75, maxFrames, candidateCount: ranked.length, score: 'face + .5 eyes + .25 mouth + .5 each hand + .3 torso + 1.5 weighted temporal RGB velocity mismatch + .75 pose jump RMS + pose velocity mismatch RMS', regions, metricWidth: W, metricHeight: H },
    metricLimitations, baseline, shortlist, retainedRanking: 'Best 1000 plus diverse shortlist from the complete exhaustive search',
    ranked: [...new Set([...ranked.slice(0, 1000), ...shortlist])] }, null, 2) + '\n');
  if (!isBreath) for (const [key, c] of Object.entries(baseline)) await evidence(sources[key === 'continuous12s' ? 'continuous-idle-raw' : 'breath-raw'], c, `baseline-${key}`);
  for (let j = 0; j < 4; j++) await evidence(target, shortlist[j], `${isBreath ? 'breath-' : ''}search-${j + 1}`);
  await writeFile(`${run}/${isBreath ? 'breath-' : ''}pose-tracks.json`, JSON.stringify({ regions, sourceId: target.id, tracks: continuous.map((v, frame) => ({ frame, pose: v.pose, skin: v.skin })) }, null, 2) + '\n');
  if (isBreath) {
    const r = regions.eyes, bytes = r.width * r.height * 3;
    const raw = (await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '4', '-i', target.path, '-vf', `crop=${r.width}:${r.height}:${r.left}:${r.top}:exact=1`,
      '-threads', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: bytes * (target.frames + 1), windowsHide: true })).stdout;
    if (raw.length !== bytes * target.frames) throw Error('Eye inspection frame count mismatch');
    for (let start = 0; start < target.frames; start += 60) {
      const panels: sharp.OverlayOptions[] = [];
      for (let j = 0; j < Math.min(60, target.frames - start); j++) {
        panels.push({ input: await sharp(raw.subarray((start + j) * bytes, (start + j + 1) * bytes), { raw: { width: r.width, height: r.height, channels: 3 } }).png().toBuffer(),
          left: (j % 6) * r.width, top: Math.floor(j / 6) * (r.height + 24) + 24 },
        { input: Buffer.from(`<svg width="${r.width}" height="24"><rect width="100%" height="100%" fill="#17232e"/><text x="6" y="17" fill="white" font-family="Arial" font-size="14">${start + j}</text></svg>`),
          left: (j % 6) * r.width, top: Math.floor(j / 6) * (r.height + 24) });
      }
      await sharp({ create: { width: r.width * 6, height: (r.height + 24) * 10, channels: 3, background: '#111' } }).composite(panels).png().toFile(`${run}/qa/breath-eyes-all-${String(start).padStart(3, '0')}.png`);
    }
  }
  console.log(JSON.stringify({ baseline, shortlist: shortlist.map(c => ({ start: c.startFrameInclusive, end: c.endFrameInclusive, seconds: c.seconds, score: c.score, appearance: c.appearance, pose: c.pose })) }, null, 2));
}
