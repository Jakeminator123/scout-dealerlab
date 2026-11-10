import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { projectNeutralMesh } from '../src/pamela-neutral-card-track.ts';
import { TWO_CARD_PROOF as plan, C2_PILOT_ANCHOR as anchor, secondCardOffset, polygonArea, compositeCard } from '../src/pamela-seat1-two-card.ts';

const run = 'runs/20261109-pamela-seat1-two-card', trackRun = 'runs/20261109-pamela-neutral-card-track';
const W = plan.source.width, H = plan.source.height, N = W * H, execute = promisify(execFile);
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex'), tag = (n: number) => String(n).padStart(4, '0');
const sourcePath = (n: number) => `${plan.source.frameDirectory}/frame-${tag(n)}.png`;
sharp.concurrency(1);
for (const folder of ['frames', 'source-contour-evidence', 'foreground-guards', 'layers', 'qa', 'render', 'generation-anchors']) await mkdir(`${run}/${folder}`, { recursive: true });
if (hash(await readFile(plan.source.path)) !== plan.source.sha256) throw Error('Unexpected source video');
const trackBytes = await readFile(plan.originalTrack), tracking = JSON.parse(trackBytes.toString());
if (tracking.source.sha256 !== plan.source.sha256 || tracking.frames.length !== 360) throw Error('Unexpected tracking input');
if (process.argv.includes('--anchors')) {
  const folder = `${run}/generation-anchors`, baseBytes = await readFile(anchor.basePath), neutralBytes = await readFile(anchor.neutralLayerPath), maskBytes = await readFile(anchor.sourceMaskPath), source172 = await readFile(sourcePath(172));
  if (hash(baseBytes) !== anchor.baseSha256 || hash(neutralBytes) !== anchor.neutralLayerSha256 || hash(maskBytes) !== anchor.sourceMaskSha256 || hash(source172) !== tracking.frames[172].sourcePngSha256) throw Error('Anchor input hash mismatch');
  const baseMeta = await sharp(baseBytes).metadata();
  if (baseMeta.width !== anchor.width || baseMeta.height !== anchor.height) throw Error('Wrong REDO dimensions');
  const aw = anchor.width, ah = anchor.height, scale = [aw / W, ah / H], offset = [anchor.secondOffsetNative[0] * scale[0], anchor.secondOffsetNative[1] * scale[1]] as [number, number];
  const base = await sharp(baseBytes).removeAlpha().raw().toBuffer();
  const c1 = await sharp(neutralBytes).resize(aw, ah, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer(), c2 = Buffer.alloc(aw * ah * 4);
  for (let y = 740; y < 900; y++) for (let x = 80; x < 380; x++) {
    const sx = x - offset[0], sy = y - offset[1], ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy, p = (y * aw + x) * 4;
    let a = 0; const rgb = [0, 0, 0];
    for (const [ox, oy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const q = ((iy + oy) * aw + ix + ox) * 4, alpha = c1[q + 3] / 255 * weight;
      a += alpha; for (let c = 0; c < 3; c++) rgb[c] += c1[q + c] * alpha;
    }
    if (a) { for (let c = 0; c < 3; c++) c2[p + c] = Math.round(rgb[c] / a); c2[p + 3] = Math.round(a * 255); }
  }
  const first = Buffer.from(base), last = Buffer.from(base), roi = [80, 740, 300, 160];
  compositeCard(first, c1, [0, 0], aw, ah, roi);
  compositeCard(last, c1, [0, 0], aw, ah, roi); compositeCard(last, c2, [0, 0], aw, ah, roi);
  const union = Buffer.alloc(aw * ah), outside = { first: 0, last: 0 };
  let changedFirst = 0, changedLast = 0, loX = aw, hiX = 0, loY = ah, hiY = 0, firstOnly = 0;
  for (let p = 0; p < aw * ah; p++) {
    union[p] = Math.max(c1[p * 4 + 3], c2[p * 4 + 3]);
    if (union[p]) { const x = p % aw, y = Math.floor(p / aw); loX = Math.min(loX, x); hiX = Math.max(hiX, x); loY = Math.min(loY, y); hiY = Math.max(hiY, y); }
    if (c1[p * 4 + 3] > 200 && c2[p * 4 + 3] < 30) firstOnly++;
    const j = p * 3, f = first[j] !== base[j] || first[j + 1] !== base[j + 1] || first[j + 2] !== base[j + 2], l = last[j] !== base[j] || last[j + 1] !== base[j + 1] || last[j + 2] !== base[j + 2];
    if (f) changedFirst++; if (l) changedLast++; if (!union[p]) { if (f) outside.first++; if (l) outside.last++; }
  }
  if (outside.first || outside.last) throw Error('Anchor changed pixels outside card alpha union');
  const firstPath = `${folder}/FIRST-redo-with-neutral-c1.png`, lastPath = `${folder}/LAST-redo-with-neutral-c1-c2.png`;
  await sharp(first, { raw: { width: aw, height: ah, channels: 3 } }).png().toFile(firstPath);
  await sharp(last, { raw: { width: aw, height: ah, channels: 3 } }).png().toFile(lastPath);
  for (const [name, rgba] of [['c1-neutral-layer', c1], ['c2-neutral-layer', c2]] as const) await sharp(rgba, { raw: { width: aw, height: ah, channels: 4 } }).png().toFile(`${folder}/${name}.png`);
  await sharp(union, { raw: { width: aw, height: ah, channels: 1 } }).png().toFile(`${folder}/card-roi-alpha.png`);
  const quad1 = tracking.frames[172].quad.map((p: number[]) => [p[0] * scale[0], p[1] * scale[1]]), quad2 = quad1.map((p: number[]) => [p[0] + offset[0], p[1] + offset[1]]);
  const centre = (q: number[][]) => [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
  const crops = await Promise.all([firstPath, lastPath].map(p => sharp(p).extract({ left: 90, top: 760, width: 260, height: 105 }).png().toBuffer()));
  await sharp({ create: { width: 520, height: 105, channels: 3, background: '#171717' } }).composite(crops.map((input, i) => ({ input, left: i * 260, top: 0 }))).png().toFile(`${folder}/FIRST-LAST-card-detail.png`);
  await writeFile(`${folder}/anchors.json`, JSON.stringify({ schemaVersion: 1, localPreparationOnly: true, apiGenerationStarted: false, productionAccepted: false, observedPhysicalSide: 'UNKNOWN', authoredAppearance: 'Two neutral blank paper surfaces; no demo print and no side inference.', base: { path: anchor.basePath, sha256: hash(baseBytes), width: aw, height: ah }, sourceCard: { video: plan.source, sourceFrame: 172, sourcePng: sourcePath(172), sourcePngSha256: hash(source172), originalAlpha: anchor.sourceMaskPath, originalAlphaSha256: hash(maskBytes), neutralRgba: anchor.neutralLayerPath, neutralRgbaSha256: hash(neutralBytes), originalAuthoredQuad: tracking.frames[172].quad, originalObservedSections: tracking.frames[172].observedSections }, transform: { cardOnlyCanvasMapping: scale, nativeVideoCanvas: [W, H], anchorCanvas: [aw, ah], baseImageResized: false, note: 'The card alone maps native video coordinates to the original REDO image grid. Whole-image pixels are never warped.', authoredC2OffsetNative: anchor.secondOffsetNative, authoredC2OffsetAnchor: offset }, target: { c1Quad: quad1, c2Quad: quad2, c1Centre: centre(quad1), c2Centre: centre(quad2), centresAreAuthoredQuadMeans: true }, outputs: { first: { path: firstPath, sha256: hash(await readFile(firstPath)) }, last: { path: lastPath, sha256: hash(await readFile(lastPath)) }, c1LayerSha256: hash(await readFile(`${folder}/c1-neutral-layer.png`)), c2LayerSha256: hash(await readFile(`${folder}/c2-neutral-layer.png`)), unionAlphaSha256: hash(await readFile(`${folder}/card-roi-alpha.png`)) }, pixelProof: { compared: aw * ah, outsideAlphaUnionChanged: outside, changedFirst, changedLast, alphaBounds: [loX, loY, hiX - loX + 1, hiY - loY + 1], c1OpaquePixelsVisibleBesideC2: firstOnly }, limitations: ['C2 position and overlap are authored, not observed motion.', 'Neutral paper cannot establish face/back identity.', 'No new inter-card shadow is invented.', 'These are image anchors for a possible separately authorized pilot, not a proven C2 deal.'], reproduction: 'node tools/pamela-seat1-two-card.ts --anchors' }, null, 2) + '\n');
  console.log(JSON.stringify({ firstPath, lastPath, outside, firstOnly, centres: [centre(quad1), centre(quad2)] })); process.exit(0);
}
const measurements = [];
for (const record of tracking.frames) {
  const mask = await sharp(`${trackRun}/${record.observedMask}`).greyscale().raw().toBuffer();
  if (mask.length !== N) throw Error('Expected one-channel source contour');
  const effectiveArea = mask.reduce((sum, v) => sum + v / 255, 0);
  measurements.push({ sourceFrame: record.sourceFrame, state: record.state, nonzeroVisiblePixels: record.visiblePixels, alphaWeightedPixels: effectiveArea, authoredQuadArea: polygonArea(record.quad), meanObservedStripWidth: record.observedSections.reduce((sum: number, s: any) => sum + Math.hypot(s.right[0] - s.left[0], s.right[1] - s.left[1]), 0) / 17, observedSections: record.observedSections.filter((s: any) => s.observedEdges).length });
}
const travel = measurements.filter(m => m.sourceFrame >= 84 && m.sourceFrame <= 171), minimum = [...travel].sort((a, b) => a.nonzeroVisiblePixels - b.nonzeroVisiblePixels)[0], maximum = Math.max(...travel.map(m => m.nonzeroVisiblePixels));
await writeFile(`${run}/visibility.json`, JSON.stringify({ source: plan.source, trackSha256: hash(trackBytes), movementRange: [84, 171], minimum, maximumVisiblePixels: maximum, minimumAsFractionOfMaximum: minimum.nonzeroVisiblePixels / maximum, minimumAsFractionOfCanonical172: minimum.nonzeroVisiblePixels / tracking.frames[172].visiblePixels, decision: 'NO_SUPPORTED_HIDDEN_SHIFT_WINDOW', reason: 'Original frame164 still shows a wide paper surface; contact hides only the grip end. The offset in this proof is deliberately visible and rejected as a hidden-motion technique.', metricsAreNotOcclusionGroundTruth: true, frames: measurements }, null, 2) + '\n');
if (process.argv.includes('--measure')) { console.log(JSON.stringify({ minimum, max: maximum })); process.exit(0); }

const sourceFiles = new Map<number, Buffer>(), rawFrames = new Map<number, Buffer>();
async function rawFrame(frame: number) {
  if (!rawFrames.has(frame)) {
    const b = await readFile(sourcePath(frame));
    if (hash(b) !== tracking.frames[frame].sourcePngSha256) throw Error(`Source PNG changed: ${frame}`);
    sourceFiles.set(frame, b); rawFrames.set(frame, await sharp(b).removeAlpha().raw().toBuffer());
  }
  return rawFrames.get(frame)!;
}
const plate = await rawFrame(0);
const firstLayerPath = `${trackRun}/layers/landed-canonical-front-demo.png`, firstLayerBytes = await readFile(firstLayerPath);
if (hash(firstLayerBytes) !== tracking.release.canonicalLayerSha256) throw Error('First card layer changed');
const firstCard = await sharp(firstLayerBytes).ensureAlpha().raw().toBuffer();
await writeFile(`${run}/layers/card1-7-diamond-static.png`, firstLayerBytes);
const texture = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><g fill="#142333" font-family="Arial" font-weight="bold"><text x="15" y="49" font-size="44">K</text><text x="14" y="91" font-size="43">♣</text><text x="59" y="190" font-size="125">♣</text><g transform="translate(210 294) rotate(180)"><text x="15" y="49" font-size="44">K</text><text x="14" y="91" font-size="43">♣</text></g><text x="82" y="246" font-size="17">P2</text></g></svg>')).ensureAlpha().raw().toBuffer();

async function cardAndGuard(frame: number) {
  const record = tracking.frames[frame], raw = await rawFrame(frame), maskFile = await readFile(`${trackRun}/${record.observedMask}`), mask = await sharp(maskFile).greyscale().raw().toBuffer();
  if (mask.length !== N) throw Error('Expected one-channel source contour');
  const guard = Buffer.alloc(N), rgba = Buffer.alloc(N * 4), authoredFill = Buffer.alloc(N), ink = Buffer.alloc(N * 4), uv = projectNeutralMesh(record.sections);
  // This is a local foreground holdout, not a whole-person matte. Preserve all
  // original non-green pixels outside the observed paper, including pale nails.
  for (let y = 820; y < 1010; y++) for (let x = 100; x < 490; x++) {
    const p = y * W + x, j = p * 3, r = raw[j], g = raw[j + 1], b = raw[j + 2];
    if (!mask[p] && !(g - r > 65 && g - b > 55 && r < 170 && b < 170)) guard[p] = 255;
  }
  for (let y = 820; y < 1010; y++) for (let x = 100; x < 490; x++) {
    const p = y * W + x, j = p * 3, u = uv[p * 2], v = uv[p * 2 + 1];
    let a = mask[p] / 255;
    if (!a && guard[p] && u >= 0 && u <= 1 && v >= 0 && v <= 1) { a = 1; authoredFill[p] = 255; }
    if (!a) continue;
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = authoredFill[p] ? 246 : Math.max(0, Math.min(255, Math.round((raw[j + c] - (1 - a) * plate[j + c]) / a)));
    rgba[p * 4 + 3] = Math.round(a * 255);
    if (u < .04 || u > .96 || v < .04 || v > .96) continue;
    const tx = Math.round(u * 209), ty = Math.round(v * 293), t = (ty * 210 + tx) * 4;
    for (let c = 0; c < 4; c++) ink[p * 4 + c] = texture[t + c];
  }
  const blurredInk = await sharp(ink, { raw: { width: W, height: H, channels: 4 } }).blur(record.renderInkBlurSigmaPx).raw().toBuffer();
  for (let p = 0; p < N; p++) if (rgba[p * 4 + 3]) {
    const a = blurredInk[p * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = Math.round(rgba[p * 4 + c] * (1 - a) + blurredInk[p * 4 + c] * a);
  }
  return { raw, mask, maskFile, guard, rgba, authoredFillPixels: authoredFill.reduce((s, v) => s + (v ? 1 : 0), 0) };
}

const canonicalSecond = await cardAndGuard(172);
await sharp(canonicalSecond.rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${run}/layers/card2-king-club-canonical.png`);
const diagnostics = [], sourceSequence = [];
for (let f = plan.firstSourceFrame; f <= plan.lastSourceFrame; f++) {
  const current = await cardAndGuard(f), output = Buffer.from(current.raw), offset = secondCardOffset(f);
  // Restore only the source paper's own observed support from the verified
  // paper-free same-pixel frame0 plate. Never paint a black fill or erase skin.
  let removedPixels = 0;
  for (let p = 0; p < N; p++) if (current.mask[p]) { for (let c = 0; c < 3; c++) output[p * 3 + c] = plate[p * 3 + c]; removedPixels++; }
  compositeCard(output, firstCard, [0, 0], W, H);
  compositeCard(output, f >= 172 ? canonicalSecond.rgba : current.rgba, offset, W, H);
  let protectedPixelsChanged = 0, outsideLocalRoiChanged = 0;
  for (let p = 0; p < N; p++) {
    const x = p % W, y = Math.floor(p / W), j = p * 3;
    if (current.guard[p]) for (let c = 0; c < 3; c++) output[j + c] = current.raw[j + c];
    const changed = output[j] !== current.raw[j] || output[j + 1] !== current.raw[j + 1] || output[j + 2] !== current.raw[j + 2];
    if (changed && current.guard[p]) protectedPixelsChanged++;
    if (changed && !(x >= 100 && x < 490 && y >= 820 && y < 1010)) outsideLocalRoiChanged++;
  }
  if (protectedPixelsChanged || outsideLocalRoiChanged) throw Error('Composite changed protected foreground or outside ROI');
  const index = f - plan.firstSourceFrame;
  await sharp(output, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${run}/frames/frame-${tag(index)}.png`);
  await writeFile(`${run}/source-contour-evidence/frame-${tag(f)}.png`, current.maskFile);
  await sharp(current.guard, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${run}/foreground-guards/frame-${tag(f)}.png`);
  diagnostics.push({ sourceFrame: f, outputFrame: index, offset, removedPixels, protectedPixelsChanged, outsideLocalRoiChanged, authoredHiddenPaperPixels: current.authoredFillPixels, sourceMaskSha256: hash(current.maskFile), sourcePngSha256: hash(sourceFiles.get(f)!) });
  sourceSequence.push(f);
}
const movie = `${run}/render/contact-probe-visible-offset.mp4`;
await execute('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-framerate', '30', '-i', `${run}/frames/frame-%04d.png`, '-frames:v', String(sourceSequence.length), '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-threads', '4', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie], { windowsHide: true, maxBuffer: 200_000 });
const selected = [140, 150, 161, 164, 166, 172, 180, 185], panels: sharp.OverlayOptions[] = [];
for (const [i, f] of selected.entries()) {
  const original = await sharp(await rawFrame(f), { raw: { width: W, height: H, channels: 3 } }).extract({ left: 110, top: 830, width: 370, height: 170 }).png().toBuffer();
  const demo = await sharp(`${run}/frames/frame-${tag(f - plan.firstSourceFrame)}.png`).extract({ left: 110, top: 830, width: 370, height: 170 }).png().toBuffer();
  const label = Buffer.from(`<svg width="740" height="26"><rect width="100%" height="100%" fill="#17212c"/><text x="8" y="18" fill="white" font-family="Arial" font-size="14">Source ${f}: ORIGINAL | TWO CARDS; VISIBLE offset ${secondCardOffset(f).map(v => v.toFixed(1)).join(',')}</text></svg>`);
  const x = (i % 2) * 740, y = Math.floor(i / 2) * 196;
  panels.push({ input: label, left: x, top: y }, { input: original, left: x, top: y + 26 }, { input: demo, left: x + 370, top: y + 26 });
}
await sharp({ create: { width: 1480, height: 784, channels: 3, background: '#171717' } }).composite(panels).png().toFile(`${run}/qa/contact-proof.png`);
const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', movie], { windowsHide: true })).stdout).streams[0];
if (probe.width !== W || probe.height !== H || probe.avg_frame_rate !== '30/1' || +probe.nb_frames !== sourceSequence.length) throw Error('Unexpected proof format');
await writeFile(`${run}/evidence.json`, JSON.stringify({ plan, sourceTrackSha256: hash(trackBytes), sourceSequence, movie: { path: movie, sha256: hash(await readFile(movie)), probe }, decision: 'CONTACT_PROOF_ONLY_HIDDEN_SHIFT_REJECTED', fullTwoDealMovieProduced: false, firstCard: { originalLayerPath: firstLayerPath, originalLayerSha256: hash(firstLayerBytes), invariantSourceFrame: 172, invariantOffset: [0, 0], authoredPrint: '7 diamond P1' }, secondCard: { authoredPrint: 'King club P2', offsetWindow: plan.offsetWindow, finalOffsetNative: plan.secondCardOffsetNative, hiddenShiftSupported: false }, cleanPlate: { sourceFrame: 0, sourcePngSha256: hash(sourceFiles.get(0)!), replacementSupport: 'Nonzero original observed paper mask only; no skin removal; no black fill.', limits: 'Local background and contact shadows can differ over time; this is a bounded contact compositing proof.' }, boundaries: { nativePngProtectedForegroundChanges: 0, nativePngOutsideRoiChanges: 0, roi: [100, 820, 390, 190], encodedMovieIsLossy: true }, limitations: ['No credible hidden or edge-on shift was observed; visible sliding is expected and not accepted as a full second deal.', 'Physical side is UNKNOWN; unique front prints and offset are explicitly authored.', 'Occluded paper under the original grip is an authored neutral fill behind the original foreground guard, not observed reconstruction.', 'Local foreground holdout is not a whole-dealer matte; original contours are preserved separately.', 'Original source shadow is not moved with the authored card offset.'], reproduction: ['Node24.21.0 / installed sharp / ffmpeg9', 'node tools/pamela-seat1-two-card.ts --measure', 'node tools/pamela-seat1-two-card.ts'], diagnostics }, null, 2) + '\n');
console.log(JSON.stringify({ decision: 'CONTACT_PROOF_ONLY', frames: sourceSequence.length, movie, sha256: hash(await readFile(movie)) }));
