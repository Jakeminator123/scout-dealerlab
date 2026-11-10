import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { SEAT7_SOURCE as source, SEAT7_KEYFRAMES, trackSeat7Card, projectNeutralMesh, type Seat7CardFrame } from '../src/pamela-seat7-card-track.ts';

const run = 'runs/20261109-pamela-seat7-card-track', execute = promisify(execFile);
const W = source.width, H = source.height, hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
sharp.concurrency(1);
for (const p of ['qa', 'masks', 'skin-guards', 'shoe-paper', 'paint-support', 'demo-frames', 'render', 'layers']) await mkdir(`${run}/${p}`, { recursive: true });
if (hash(await readFile(source.path)) !== source.sha256) throw Error('Wrong source video');
const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', source.path], { windowsHide: true })).stdout).streams[0];
if (probe.width !== W || probe.height !== H || probe.avg_frame_rate !== '30/1' || +probe.nb_frames !== 360) throw Error('Unexpected source format');
const framePath = (n: number) => `${source.frameDirectory}/frame-${String(n).padStart(4, '0')}.png`;
const tag = (n: number) => String(n).padStart(4, '0');
const label = (text: string, w: number) => Buffer.from(`<svg width="${w}" height="26"><rect width="100%" height="100%" fill="#17212c"/><text x="8" y="19" fill="white" font-family="Arial" font-size="15">${text}</text></svg>`);
const texture = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><g fill="#142b33" font-family="Arial" font-weight="bold"><text x="15" y="49" font-size="45">8</text><text x="14" y="91" font-size="43">♣</text><text x="59" y="190" font-size="125">♣</text><g transform="translate(210 294) rotate(180)"><text x="15" y="49" font-size="45">8</text><text x="14" y="91" font-size="43">♣</text></g><text x="82" y="246" font-size="17">P7</text></g></svg>')).ensureAlpha().raw().toBuffer();

// Preserve raw edge measurements; stabilize only the authored ink filter.
// A nine-frame median followed by a nine-frame triangular mean suppresses
// one-frame focus pumping from the blank, low-resolution paper edge.
const measuredSigmas: number[] = [], renderSigmas: number[] = [];
if (!process.argv.includes('--qa') && !process.argv.includes('--metadata') && !process.argv.includes('--inspect')) {
  for (let f = 0; f < source.frames; f++) measuredSigmas.push(trackSeat7Card(await sharp(framePath(f)).removeAlpha().raw().toBuffer(), f).record.inkBlurSigmaPx);
  const at = (xs: number[], n: number) => xs[Math.max(0, Math.min(359, n))];
  const median = measuredSigmas.map((_, f) => Array.from({ length: 9 }, (_, i) => at(measuredSigmas, f + i - 4)).sort((a, b) => a - b)[4]);
  for (let f = 0; f < source.frames; f++) renderSigmas.push(Array.from({ length: 9 }, (_, i) => at(median, f + i - 4) * (5 - Math.abs(i - 4))).reduce((a, b) => a + b, 0) / 25);
}

async function render(raw: Buffer, tracked: ReturnType<typeof trackSeat7Card>) {
  const uv = projectNeutralMesh(tracked.record.sections), ink = Buffer.alloc(W * H * 4), output = Buffer.from(raw), { left, top, width, height } = tracked.record.bounds;
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    const p = y * W + x, u = uv[p * 2], v = uv[p * 2 + 1];
    if (u < .04 || u > .96 || v < .04 || v > .96) continue;
    const tx = Math.max(0, Math.min(209, Math.round(u * 209))), ty = Math.max(0, Math.min(293, Math.round(v * 293))), j = (ty * 210 + tx) * 4;
    for (let c = 0; c < 4; c++) ink[p * 4 + c] = texture[j + c];
  }
  const blurred = await sharp(ink, { raw: { width: W, height: H, channels: 4 } }).blur(renderSigmas[tracked.record.sourceFrame] ?? tracked.record.inkBlurSigmaPx).raw().toBuffer();
  let changed = 0, changedSkin = 0, changedOutsideMask = 0, changedShoePaper = 0;
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    const p = y * W + x, j = p * 3, a = blurred[p * 4 + 3] / 255 * tracked.paint[p] / 255;
    if (a <= 0) continue;
    const light = Math.min(1.05, (raw[j] + raw[j + 1] + raw[j + 2]) / (3 * 245));
    for (let c = 0; c < 3; c++) output[j + c] = Math.round(raw[j + c] * (1 - a) + blurred[p * 4 + c] * light * a);
    if (output[j] !== raw[j] || output[j + 1] !== raw[j + 1] || output[j + 2] !== raw[j + 2]) { changed++; if (tracked.protectedSkin[p]) changedSkin++; if (!tracked.mask[p]) changedOutsideMask++; if (tracked.shoePaper[p]) changedShoePaper++; }
  }
  if (changedSkin || changedOutsideMask || changedShoePaper) throw Error('Printing breached the source paper/skin/shoe boundary');
  return { output, diagnostics: { changed, changedSkin, changedOutsideMask, changedShoePaper } };
}

async function writeMono(path: string, bytes: Buffer) {
  if (bytes.length !== W * H) throw Error('Expected one source-mask byte per pixel');
  await sharp(bytes, { raw: { width: W, height: H, channels: 1 } }).greyscale().toColourspace('b-w').png().toFile(path);
  const metadata = await sharp(path).metadata(), decoded = await sharp(path).greyscale().raw().toBuffer();
  if (metadata.channels !== 1 || decoded.length !== W * H || !decoded.equals(bytes)) throw Error('Mask did not roundtrip exactly as one channel');
}

if (process.argv.includes('--metadata')) {
  const tracking = JSON.parse(await readFile(`${run}/tracking.json`, 'utf8'));
  for (const record of tracking.frames) {
    const file = await readFile(framePath(record.sourceFrame));
    if (hash(file) !== record.sourcePngSha256) throw Error('Cached source changed since export');
    const observed = trackSeat7Card(await sharp(file).removeAlpha().raw().toBuffer(), record.sourceFrame).record;
    record.observedSections = observed.sections;
    record.sectionMeaning = record.sourceFrame > 188 ? 'sections = locked runtime geometry from frame188; observedSections = actual source-refined geometry' : 'sections and observedSections = actual source-refined geometry';
  }
  tracking.release.canonicalLayerSha256 = hash(await readFile(`${run}/layers/landed-canonical-8-club-demo.png`));
  tracking.geometryBoundary = 'Every frame retains observedSections and a visible paper mask. sections is the rendering mesh; from189 onward it equals the canonical188 mesh. A static runtime card does not establish a static or complete raw source.';
  await writeFile(`${run}/tracking.json`, JSON.stringify(tracking, null, 2) + '\n');
  console.log(JSON.stringify({ observedMeshes: tracking.frames.length, runtimeGeometryLockedAfter: 188 }));
} else if (process.argv.includes('--qa')) {
  const tracking = JSON.parse(await readFile(`${run}/tracking.json`, 'utf8'));
  for (let start = 0; start < source.frames; start += 30) {
    const panels: sharp.OverlayOptions[] = [];
    for (let j = 0; j < 30 && start + j < source.frames; j++) {
      const f = start + j, r = tracking.frames[f].bounds, pad = 18;
      const region = { left: Math.max(0, r.left - pad), top: Math.max(0, r.top - pad), width: Math.min(W - Math.max(0, r.left - pad), r.width + pad * 2), height: Math.min(H - Math.max(0, r.top - pad), r.height + pad * 2) };
      const input = await sharp(`${run}/demo-frames/frame-${tag(f)}.png`).extract(region).resize(280, 200, { fit: 'contain', background: '#171717' }).png().toBuffer();
      panels.push({ input, left: (j % 6) * 280, top: Math.floor(j / 6) * 226 + 26 }, { input: label(`Source ${f} | ${tracking.frames[f].state}`, 280), left: (j % 6) * 280, top: Math.floor(j / 6) * 226 });
    }
    await sharp({ create: { width: 1680, height: 1130, channels: 3, background: '#171717' } }).composite(panels).png().toFile(`${run}/qa/all-demo-${tag(start)}.png`);
  }
  const critical = [0,50,55,60,65,70,75,80,85,90,95,100,105,110,120,130,135,145,150,170,180,184,188,195,240,300,359];
  for (const f of critical) {
    const r = tracking.frames[f].bounds, pad = 25, region = { left: Math.max(0, r.left - pad), top: Math.max(0, r.top - pad), width: Math.min(W - Math.max(0, r.left - pad), r.width + pad * 2), height: Math.min(H - Math.max(0, r.top - pad), r.height + pad * 2) };
    const panels = await Promise.all([framePath(f), `${run}/demo-frames/frame-${tag(f)}.png`, `${run}/masks/frame-${tag(f)}.png`].map(p => sharp(p).extract(region).png().toBuffer()));
    await sharp({ create: { width: region.width * 3, height: region.height + 26, channels: 3, background: '#181818' } }).composite([...panels.map((input, i) => ({ input, left: i * region.width, top: 26 })), { input: label(`${f} ORIGINAL | FINAL 8 CLUB | VISIBLE MASK`, region.width * 3), left: 0, top: 0 }]).png().toFile(`${run}/qa/inspect-${tag(f)}.png`);
  }
  await writeFile(`${run}/inspection.json`, JSON.stringify({ source, finalExportCompared: true, frames: critical.map(f => tracking.frames[f]) }, null, 2) + '\n');
  console.log(JSON.stringify({ contactSheets: 12, allFramesRepresented: 360, nativeComparisons: critical.length, note: 'Contact sheets do not substitute for native contact and motion review.' }));
} else if (process.argv.includes('--inspect')) {
  const indices = [0,50,55,60,65,70,75,80,85,90,95,100,105,110,120,130,135,145,150,170,180,184,188,195,240,300,359];
  const diagnostics = [];
  for (const f of indices) {
    const raw = await sharp(framePath(f)).removeAlpha().raw().toBuffer(), tracked = trackSeat7Card(raw, f), demo = await render(raw, tracked);
    const r = tracked.record.bounds, pad = 25, region = { left: Math.max(0, r.left - pad), top: Math.max(0, r.top - pad), width: Math.min(W - Math.max(0, r.left - pad), r.width + pad * 2), height: Math.min(H - Math.max(0, r.top - pad), r.height + pad * 2) };
    const panels = [await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).extract(region).png().toBuffer(), await sharp(demo.output, { raw: { width: W, height: H, channels: 3 } }).extract(region).png().toBuffer(), await sharp(tracked.mask, { raw: { width: W, height: H, channels: 1 } }).extract(region).png().toBuffer()];
    await sharp({ create: { width: region.width * 3, height: region.height + 26, channels: 3, background: '#181818' } }).composite(panels.map((input, i) => ({ input, left: i * region.width, top: 26 })).concat([{ input: label(`${f} ORIGINAL | PRINT DEMO | VISIBLE MASK`, region.width * 3), left: 0, top: 0 }])).png().toFile(`${run}/qa/inspect-${tag(f)}.png`);
    diagnostics.push({ ...tracked.record, measuredInkBlurSigmaPx: measuredSigmas[f], renderInkBlurSigmaPx: renderSigmas[f], ...demo.diagnostics });
  }
  await writeFile(`${run}/inspection.json`, JSON.stringify({ source, frames: diagnostics }, null, 2) + '\n');
  console.log(JSON.stringify(diagnostics.map(v => ({ frame: v.sourceFrame, pixels: v.visiblePixels, sigma: v.inkBlurSigmaPx, changed: v.changed })), null, 2));
} else {
  const records: any[] = [], diagnostics: any[] = [];
  const sourceFrameMd5 = (await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '4', '-i', source.path, '-pix_fmt', 'rgb24', '-f', 'framemd5', '-'], { windowsHide: true, maxBuffer: 200_000 })).stdout
    .split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1)!.trim());
  if (sourceFrameMd5.length !== 360) throw Error('Original RGB frame count mismatch');
  let landed: Seat7CardFrame | null = null;
  for (let f = 0; f < source.frames; f++) {
    const file = await readFile(framePath(f)), raw = await sharp(file).removeAlpha().raw().toBuffer(), tracked = trackSeat7Card(raw, f);
    if (createHash('md5').update(raw).digest('hex') !== sourceFrameMd5[f]) throw Error(`Cached PNG is not the original decoded frame ${f}`);
    const observedSections = structuredClone(tracked.record.sections);
    if (f === 188) landed = structuredClone(tracked.record);
    // The independent runtime card keeps a fixed geometry after release; observed
    // masks still record observed source silhouette variation.
    if (f > 188 && landed) tracked.record.sections = structuredClone(landed.sections);
    const demo = await render(raw, tracked);
    await writeMono(`${run}/masks/frame-${tag(f)}.png`, tracked.mask);
    await writeMono(`${run}/paint-support/frame-${tag(f)}.png`, tracked.paint);
    await writeMono(`${run}/skin-guards/frame-${tag(f)}.png`, tracked.protectedSkin);
    await writeMono(`${run}/shoe-paper/frame-${tag(f)}.png`, tracked.shoePaper);
    await sharp(demo.output, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${run}/demo-frames/frame-${tag(f)}.png`);
    if (f === 188) {
      const bg: number[] = [0, 0, 0];
      for (let y = 1090; y < 1110; y++) for (let x = 1550; x < 1600; x++) for (let c = 0; c < 3; c++) bg[c] += raw[(y * W + x) * 3 + c] / 1000;
      for (const [name, rgb] of [['8-club-demo', demo.output], ['neutral', raw]] as const) {
        const rgba = Buffer.alloc(W * H * 4);
        for (let p = 0; p < W * H; p++) {
          const a = tracked.mask[p] / 255;
          for (let c = 0; c < 3; c++) rgba[p * 4 + c] = a > .1 ? Math.max(0, Math.min(255, Math.round((rgb[p * 3 + c] - (1 - a) * bg[c]) / a))) : 0;
          rgba[p * 4 + 3] = tracked.mask[p];
        }
        await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${run}/layers/landed-canonical-${name}.png`);
      }
    }
    records.push({ ...tracked.record, observedSections, sectionMeaning: f > 188 ? 'sections = locked runtime geometry from frame188; observedSections = actual source-refined geometry' : 'sections and observedSections = actual source-refined geometry', sourcePngSha256: hash(file), decodedSourceRgbEquality: true, observedMask: `masks/frame-${tag(f)}.png`, paintSupport: `paint-support/frame-${tag(f)}.png`, skinGuard: `skin-guards/frame-${tag(f)}.png`, remainingShoePaper: `shoe-paper/frame-${tag(f)}.png` });
    records.at(-1).measuredInkBlurSigmaPx = measuredSigmas[f];
    records.at(-1).renderInkBlurSigmaPx = renderSigmas[f];
    records.at(-1).observedMaskSha256 = hash(await readFile(`${run}/masks/frame-${tag(f)}.png`));
    records.at(-1).maskChannels = 1;
    records.at(-1).decodedMaskBytes = W * H;
    diagnostics.push({ sourceFrame: f, ...demo.diagnostics });
    if (f % 60 === 0) console.log(JSON.stringify({ completedFrame: f, paperPixels: tracked.record.visiblePixels }));
  }
  await writeFile(`${run}/tracking.json`, JSON.stringify({ schemaVersion: 1, source, probe, zeroBasedFrames: true, nativeDimensions: true, productionAccepted: false,
    keyframes: SEAT7_KEYFRAMES, sidePolicy: { observedSide: 'UNKNOWN', demoAuthoredSide: 'FRONT', reason: 'Blank neutral paper alone cannot establish the physical face/back. The dark 8 club with P7 mark is an explicit demonstration texture, not inferred card identity.' },
    method: 'Per-frame neutral-paper connected component inside an authored source-pixel gate; conservative warm-skin exclusion; 17 source-refined strip sections. No hidden hand/paper reconstruction.',
    confidenceMeaning: 'Heuristic review priority, not calibrated probability or accuracy percentage.',
    maskEncoding: 'Grayscale PNG, one channel. Decode sharp(file).greyscale().raw(): exactly width*height bytes. All four mask families roundtrip byte-exactly.',
    blur: 'Raw observed 10–90 percent paper-edge width / 2.563 gives a bounded isotropic ink-only Gaussian estimate. For the demonstration only, a 9-frame median and 9-frame triangular mean stabilize this filter; raw and rendered sigmas remain separate. This is not a known motion PSF or 3D shutter reconstruction; source RGB is never blurred.',
    release: { intervalFrames: [184, 188], canonicalFrame: 188, geometryLockedAfter: 188, canonicalLayer: 'layers/landed-canonical-8-club-demo.png', canonicalLayerSha256: hash(await readFile(`${run}/layers/landed-canonical-8-club-demo.png`)), neutralLayer: 'layers/landed-canonical-neutral.png', neutralLayerSha256: hash(await readFile(`${run}/layers/landed-canonical-neutral.png`)), canonicalEdgeTreatment: 'Measured local green background unmixed only in the independent RGBA layers; source demo pixels and silhouette unchanged.', sourceDisappearanceExpected: [] },
    geometryBoundary: 'Every frame retains observedSections and a visible paper mask. sections is the rendering mesh; from189 onward it equals the canonical188 mesh. A static runtime card does not establish a static or complete raw source.',
    limitations: ['Hidden grip UVs are authored and cannot be recovered from blank paper.', 'Skin guard is a conservative local color mask, not a complete anatomical hand matte.', 'The shoe extraction boundary is authored and needs close visual review.', 'Source paper edges and blur remain imperfect; no white source pixel is erased or replaced with black.', 'Observed masks record source silhouette variation; an independent canonical layer provides fixed runtime geometry.'],
    frames: records }, null, 2) + '\n');
  const movie = `${run}/render/seat7-8-club-demo.mp4`;
  await execute('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-framerate', '30', '-start_number', '0', '-i', `${run}/demo-frames/frame-%04d.png`, '-frames:v', '360', '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-threads', '4', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie], { windowsHide: true, maxBuffer: 200_000 });
  const finalProbe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', movie], { windowsHide: true })).stdout).streams[0];
  if (finalProbe.width !== W || finalProbe.height !== H || finalProbe.avg_frame_rate !== '30/1' || +finalProbe.nb_frames !== 360) throw Error('Demo format mismatch');
  await writeFile(`${run}/verification.json`, JSON.stringify({ source, frames: 360, nativeSourceRgbEqualFrames: 360, maskRoundtrips: 1440, decodedMaskBytesPerFrame: W * H, maskChannels: 1, changedSkinPixels: diagnostics.reduce((s, v) => s + v.changedSkin, 0), changedShoePaperPixels: diagnostics.reduce((s, v) => s + v.changedShoePaper, 0), changedOutsidePaperMask: diagnostics.reduce((s, v) => s + v.changedOutsideMask, 0), pixelCheckScope: 'Native lossless RGB demo PNGs before lossy H.264 encoding.', diagnostics, movie: { path: movie, sha256: hash(await readFile(movie)), probe: finalProbe }, visualAcceptance: false, runtimeAcceptance: false }, null, 2) + '\n');
  console.log(JSON.stringify({ frames: records.length, movie, sha256: hash(await readFile(movie)) }));
}

