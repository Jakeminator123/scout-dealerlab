import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { NEUTRAL_CARD_SOURCE as source, NEUTRAL_CARD_KEYFRAMES, trackNeutralCard, projectNeutralMesh, type NeutralCardFrame } from '../src/pamela-neutral-card-track.ts';

const run = 'runs/20261109-pamela-neutral-card-track', execute = promisify(execFile);
const W = source.width, H = source.height, hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
sharp.concurrency(1);
for (const p of ['qa', 'masks', 'skin-guards', 'shoe-paper', 'paint-support', 'demo-frames', 'render', 'layers']) await mkdir(`${run}/${p}`, { recursive: true });
if (hash(await readFile(source.path)) !== source.sha256) throw Error('Wrong source video');
const probe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', source.path], { windowsHide: true })).stdout).streams[0];
if (probe.width !== W || probe.height !== H || probe.avg_frame_rate !== '30/1' || +probe.nb_frames !== 360) throw Error('Unexpected source format');
const framePath = (n: number) => `${source.frameDirectory}/frame-${String(n).padStart(4, '0')}.png`;
const tag = (n: number) => String(n).padStart(4, '0');
const label = (text: string, w: number) => Buffer.from(`<svg width="${w}" height="26"><rect width="100%" height="100%" fill="#17212c"/><text x="8" y="19" fill="white" font-family="Arial" font-size="15">${text}</text></svg>`);
const texture = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><g fill="#a81e35" font-family="Arial" font-weight="bold"><text x="16" y="49" font-size="47">7</text><path d="M31 57 44 75 31 93 18 75Z"/><path d="M105 102 140 149 105 196 70 149Z"/><g transform="translate(210 294) rotate(180)"><text x="16" y="49" font-size="47">7</text><path d="M31 57 44 75 31 93 18 75Z"/></g><text x="82" y="246" font-size="17">P1</text></g></svg>`)).ensureAlpha().raw().toBuffer();

// Preserve raw edge measurements; stabilize only the authored ink filter.
// A nine-frame median followed by a nine-frame triangular mean suppresses
// one-frame focus pumping from the blank, low-resolution paper edge.
const measuredSigmas: number[] = [], renderSigmas: number[] = [];
if (!process.argv.includes('--qa') && !process.argv.includes('--metadata')) {
  for (let f = 0; f < source.frames; f++) measuredSigmas.push(trackNeutralCard(await sharp(framePath(f)).removeAlpha().raw().toBuffer(), f).record.inkBlurSigmaPx);
  const at = (xs: number[], n: number) => xs[Math.max(0, Math.min(357, n))];
  const median = measuredSigmas.map((_, f) => Array.from({ length: 9 }, (_, i) => at(measuredSigmas, f + i - 4)).sort((a, b) => a - b)[4]);
  for (let f = 0; f < source.frames; f++) renderSigmas.push(Array.from({ length: 9 }, (_, i) => at(median, f + i - 4) * (5 - Math.abs(i - 4))).reduce((a, b) => a + b, 0) / 25);
}

async function render(raw: Buffer, tracked: ReturnType<typeof trackNeutralCard>) {
  const uv = projectNeutralMesh(tracked.record.sections), ink = Buffer.alloc(W * H * 4), output = Buffer.from(raw), { left, top, width, height } = tracked.record.bounds;
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    const p = y * W + x, u = uv[p * 2], v = uv[p * 2 + 1];
    if (u < .04 || u > .96 || v < .04 || v > .96) continue;
    const tx = Math.max(0, Math.min(209, Math.round(u * 209))), ty = Math.max(0, Math.min(293, Math.round(v * 293))), j = (ty * 210 + tx) * 4;
    for (let c = 0; c < 4; c++) ink[p * 4 + c] = texture[j + c];
  }
  const blurred = await sharp(ink, { raw: { width: W, height: H, channels: 4 } }).blur(renderSigmas[tracked.record.sourceFrame] ?? tracked.record.inkBlurSigmaPx).raw().toBuffer();
  let changed = 0, changedSkin = 0, changedOutsideMask = 0;
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
    const p = y * W + x, j = p * 3, a = blurred[p * 4 + 3] / 255 * tracked.paint[p] / 255;
    if (a <= 0) continue;
    const light = Math.min(1.05, (raw[j] + raw[j + 1] + raw[j + 2]) / (3 * 245));
    for (let c = 0; c < 3; c++) output[j + c] = Math.round(raw[j + c] * (1 - a) + blurred[p * 4 + c] * light * a);
    if (output[j] !== raw[j] || output[j + 1] !== raw[j + 1] || output[j + 2] !== raw[j + 2]) { changed++; if (tracked.protectedSkin[p]) changedSkin++; if (!tracked.mask[p]) changedOutsideMask++; }
  }
  if (changedSkin || changedOutsideMask) throw Error('Printing breached the source paper/skin boundary');
  return { output, diagnostics: { changed, changedSkin, changedOutsideMask } };
}

if (process.argv.includes('--metadata')) {
  const tracking = JSON.parse(await readFile(`${run}/tracking.json`, 'utf8'));
  for (const record of tracking.frames) {
    const file = await readFile(framePath(record.sourceFrame));
    if (hash(file) !== record.sourcePngSha256) throw Error('Cached source changed since export');
    const observed = trackNeutralCard(await sharp(file).removeAlpha().raw().toBuffer(), record.sourceFrame).record;
    record.observedSections = observed.sections;
    record.sectionMeaning = record.sourceFrame > 172 ? 'sections = locked runtime geometry from frame172; observedSections = actual source-refined geometry' : 'sections and observedSections = actual source-refined geometry';
  }
  tracking.release.canonicalLayerSha256 = hash(await readFile(`${run}/layers/landed-canonical-front-demo.png`));
  tracking.geometryBoundary = 'Every frame retains observedSections and a visible paper mask. sections is the rendering mesh; from173 onward it equals the canonical172 mesh. A static runtime card does not establish a static or complete raw source.';
  await writeFile(`${run}/tracking.json`, JSON.stringify(tracking, null, 2) + '\n');
  console.log(JSON.stringify({ observedMeshes: tracking.frames.length, runtimeGeometryLockedAfter: 172 }));
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
  console.log(JSON.stringify({ contactSheets: 12, allFramesRepresented: 360, note: 'Contact sheets do not substitute for native contact and motion review.' }));
} else if (process.argv.includes('--inspect')) {
  const indices = [0, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 96, 97, 98, 99, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 160, 169, 170, 171, 172, 180, 357, 358, 359];
  const diagnostics = [];
  for (const f of indices) {
    const raw = await sharp(framePath(f)).removeAlpha().raw().toBuffer(), tracked = trackNeutralCard(raw, f), demo = await render(raw, tracked);
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
  let landed: NeutralCardFrame | null = null;
  for (let f = 0; f < source.frames; f++) {
    const file = await readFile(framePath(f)), raw = await sharp(file).removeAlpha().raw().toBuffer(), tracked = trackNeutralCard(raw, f);
    if (createHash('md5').update(raw).digest('hex') !== sourceFrameMd5[f]) throw Error(`Cached PNG is not the original decoded frame ${f}`);
    const observedSections = structuredClone(tracked.record.sections);
    if (f === 172) landed = structuredClone(tracked.record);
    // The independent runtime card keeps a fixed geometry after release; observed
    // masks still record source drift/disappearance instead of silently hiding it.
    if (f > 172 && landed) tracked.record.sections = structuredClone(landed.sections);
    const demo = await render(raw, tracked);
    await sharp(tracked.mask, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${run}/masks/frame-${tag(f)}.png`);
    await sharp(tracked.paint, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${run}/paint-support/frame-${tag(f)}.png`);
    await sharp(tracked.protectedSkin, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${run}/skin-guards/frame-${tag(f)}.png`);
    await sharp(tracked.shoePaper, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${run}/shoe-paper/frame-${tag(f)}.png`);
    await sharp(demo.output, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${run}/demo-frames/frame-${tag(f)}.png`);
    if (f === 172) {
      const bg: number[] = [0, 0, 0];
      for (let y = 980; y < 995; y++) for (let x = 160; x < 200; x++) for (let c = 0; c < 3; c++) bg[c] += raw[(y * W + x) * 3 + c] / 600;
      for (const [name, rgb] of [['front-demo', demo.output], ['neutral', raw]] as const) {
        const rgba = Buffer.alloc(W * H * 4);
        for (let p = 0; p < W * H; p++) {
          const a = tracked.mask[p] / 255;
          for (let c = 0; c < 3; c++) rgba[p * 4 + c] = a > .1 ? Math.max(0, Math.min(255, Math.round((rgb[p * 3 + c] - (1 - a) * bg[c]) / a))) : 0;
          rgba[p * 4 + 3] = tracked.mask[p];
        }
        await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${run}/layers/landed-canonical-${name}.png`);
      }
    }
    records.push({ ...tracked.record, observedSections, sectionMeaning: f > 172 ? 'sections = locked runtime geometry from frame172; observedSections = actual source-refined geometry' : 'sections and observedSections = actual source-refined geometry', sourcePngSha256: hash(file), decodedSourceRgbEquality: true, observedMask: `masks/frame-${tag(f)}.png`, paintSupport: `paint-support/frame-${tag(f)}.png`, skinGuard: `skin-guards/frame-${tag(f)}.png`, remainingShoePaper: `shoe-paper/frame-${tag(f)}.png` });
    records.at(-1).measuredInkBlurSigmaPx = measuredSigmas[f];
    records.at(-1).renderInkBlurSigmaPx = renderSigmas[f];
    diagnostics.push({ sourceFrame: f, ...demo.diagnostics });
    if (f % 60 === 0) console.log(JSON.stringify({ completedFrame: f, paperPixels: tracked.record.visiblePixels }));
  }
  await writeFile(`${run}/tracking.json`, JSON.stringify({ schemaVersion: 1, source, probe, zeroBasedFrames: true, nativeDimensions: true, productionAccepted: false,
    keyframes: NEUTRAL_CARD_KEYFRAMES, sidePolicy: { observedSide: 'UNKNOWN', demoAuthoredSide: 'FRONT', reason: 'Blank neutral paper alone cannot establish the physical face/back. The red 7 diamond with P1 mark is an explicit demonstration texture, not inferred card identity.' },
    method: 'Per-frame neutral-paper connected component inside an authored source-pixel gate; conservative warm-skin exclusion; 17 source-refined strip sections. No hidden hand/paper reconstruction.',
    confidenceMeaning: 'Heuristic review priority, not calibrated probability or accuracy percentage.',
    blur: 'Raw observed 10–90 percent paper-edge width / 2.563 gives a bounded isotropic ink-only Gaussian estimate. For the demonstration only, a 9-frame median and 9-frame triangular mean stabilize this filter; raw and rendered sigmas remain separate. This is not a known motion PSF or 3D shutter reconstruction; source RGB is never blurred.',
    release: { intervalFrames: [169, 172], canonicalFrame: 172, geometryLockedAfter: 172, canonicalLayer: 'layers/landed-canonical-front-demo.png', canonicalLayerSha256: hash(await readFile(`${run}/layers/landed-canonical-front-demo.png`)), neutralLayer: 'layers/landed-canonical-neutral.png', neutralLayerSha256: hash(await readFile(`${run}/layers/landed-canonical-neutral.png`)), canonicalEdgeTreatment: 'Measured local green background unmixed only in the independent RGBA layers; source demo pixels and silhouette unchanged.', sourceDisappearanceExpected: [358, 359] },
    geometryBoundary: 'Every frame retains observedSections and a visible paper mask. sections is the rendering mesh; from173 onward it equals the canonical172 mesh. A static runtime card does not establish a static or complete raw source.',
    limitations: ['Hidden grip UVs are authored and cannot be recovered from blank paper.', 'Skin guard is a conservative local color mask, not a complete anatomical hand matte.', 'The shoe extraction boundary is authored and needs close visual review.', 'Source paper edges and blur remain imperfect; no white source pixel is erased or replaced with black.', 'Observed masks record source disappearance; an independent card layer is required to persist after the source removes it.'],
    frames: records }, null, 2) + '\n');
  const movie = `${run}/render/neutral-card-front-demo.mp4`;
  await execute('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-framerate', '30', '-start_number', '0', '-i', `${run}/demo-frames/frame-%04d.png`, '-frames:v', '360', '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-threads', '4', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie], { windowsHide: true, maxBuffer: 200_000 });
  const finalProbe = JSON.parse((await execute('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', movie], { windowsHide: true })).stdout).streams[0];
  if (finalProbe.width !== W || finalProbe.height !== H || finalProbe.avg_frame_rate !== '30/1' || +finalProbe.nb_frames !== 360) throw Error('Demo format mismatch');
  await writeFile(`${run}/verification.json`, JSON.stringify({ source, frames: 360, changedSkinPixels: diagnostics.reduce((s, v) => s + v.changedSkin, 0), changedOutsidePaperMask: diagnostics.reduce((s, v) => s + v.changedOutsideMask, 0), diagnostics, movie: { path: movie, sha256: hash(await readFile(movie)), probe: finalProbe }, visualAcceptance: false }, null, 2) + '\n');
  console.log(JSON.stringify({ frames: records.length, movie, sha256: hash(await readFile(movie)) }));
}
