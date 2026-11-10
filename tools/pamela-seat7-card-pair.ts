import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { SEAT7_SOURCE as source, projectNeutralMesh, type Seat7CardFrame } from '../src/pamela-seat7-card-track.ts';
import { PAIR_PROPOSAL, pairOffset, lowerSections, pairForegroundGuard, stripPoint } from '../src/pamela-seat7-card-pair.ts';

const run = 'runs/20261109-pamela-seat7-card-pair', frozen = 'runs/20261109-pamela-seat7-card-track';
const W = source.width, H = source.height, N = W * H, execute = promisify(execFile);
const tag = (f: number) => String(f).padStart(4, '0'), hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
sharp.concurrency(1);
for (const p of ['qa', 'pair-frames', 'single-frames', 'masks', 'render']) await mkdir(`${run}/${p}`, { recursive: true });
const trackingBytes = await readFile(`${frozen}/tracking.json`), tracking = JSON.parse(trackingBytes.toString());
if (hash(await readFile(source.path)) !== source.sha256) throw Error('Source identity mismatch');
const frozenCodePaths = ['src/pamela-seat7-card-track.ts', 'tools/pamela-seat7-card-track.ts', 'src/pamela-neutral-card-track.ts'];
const frozenCodeHashes = Object.fromEntries(await Promise.all(frozenCodePaths.map(async p => [p, hash(await readFile(p))])));
const texture = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><g fill="#b11c32" font-family="Arial" font-weight="bold"><text x="9" y="34" font-size="32">K</text><text x="10" y="62" font-size="29">♦</text><g transform="translate(210 294) rotate(180)"><text x="9" y="34" font-size="32">K</text><text x="10" y="62" font-size="29">♦</text></g><text x="57" y="190" font-size="125">♦</text><text x="78" y="246" font-size="17">P7-C2</text></g></svg>')).ensureAlpha().raw().toBuffer();
const label = (s: string, width: number) => Buffer.from(`<svg width="${width}" height="28"><rect width="100%" height="100%" fill="#15212a"/><text x="8" y="20" fill="white" font-family="Arial" font-size="15">${s}</text></svg>`);
const readMono = async (path: string) => {
  const meta = await sharp(path).metadata(), bytes = await sharp(path).greyscale().raw().toBuffer();
  if (meta.channels !== 1 || bytes.length !== N) throw Error(`Not one byte per mask pixel: ${path}`);
  return bytes;
};
const saveMono = async (path: string, b: Buffer) => {
  await sharp(b, { raw: { width: W, height: H, channels: 1 } }).greyscale().toColourspace('b-w').png().toFile(path);
  if (!(await readMono(path)).equals(b)) throw Error('Mask roundtrip mismatch');
};

async function render(f: number) {
  const record = tracking.frames[f] as Seat7CardFrame & { sourcePngSha256: string; renderInkBlurSigmaPx: number; observedMaskSha256: string };
  const sourceFile = await readFile(`${source.frameDirectory}/frame-${tag(f)}.png`);
  if (hash(sourceFile) !== record.sourcePngSha256) throw Error(`Source PNG changed: ${f}`);
  const raw = await sharp(sourceFile).removeAlpha().raw().toBuffer();
  const singleFile = await readFile(`${frozen}/demo-frames/frame-${tag(f)}.png`), single = await sharp(singleFile).removeAlpha().raw().toBuffer();
  const maskPath = `${frozen}/masks/frame-${tag(f)}.png`;
  if (hash(await readFile(maskPath)) !== record.observedMaskSha256) throw Error(`Frozen mask changed: ${f}`);
  const mask = await readMono(maskPath), skin = await readMono(`${frozen}/skin-guards/frame-${tag(f)}.png`), shoe = await readMono(`${frozen}/shoe-paper/frame-${tag(f)}.png`);
  const bottom = lowerSections(record.sections, f), uv = projectNeutralMesh(bottom);
  const pts = bottom.flatMap(s => [s.left, s.right]).concat(record.sections.flatMap(s => [s.left, s.right]));
  const bounds = { left: Math.max(0, Math.floor(Math.min(...pts.map(p => p[0]))) - 8), top: Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))) - 8), right: Math.min(W - 1, Math.ceil(Math.max(...pts.map(p => p[0]))) + 8), bottom: Math.min(H - 1, Math.ceil(Math.max(...pts.map(p => p[1]))) + 8) };
  const { guard, skin: extendedSkin } = pairForegroundGuard(raw, mask, skin, bounds);
  // The stricter pair guard also protects mixed skin boundaries that the frozen
  // ink demonstration did not classify. Restore those source pixels in BOTH
  // sides of this comparison, without changing the frozen tracking or files.
  let frozenUpperInkSuppressedPixels = 0;
  for (let p = 0; p < N; p++) if (guard[p]) {
    if (single[p * 3] !== raw[p * 3] || single[p * 3 + 1] !== raw[p * 3 + 1] || single[p * 3 + 2] !== raw[p * 3 + 2]) frozenUpperInkSuppressedPixels++;
    for (let c = 0; c < 3; c++) single[p * 3 + c] = raw[p * 3 + c];
  }
  const top = Buffer.alloc(N), lower = Buffer.alloc(N * 4), lowerAlpha = Buffer.alloc(N), offset = pairOffset(f), activated = offset[0] !== 0 || offset[1] !== 0;
  const channels: number[][] = [[], [], []];
  for (let p = 0; p < N; p++) if (mask[p] > 245) for (let c = 0; c < 3; c++) channels[c].push(raw[p * 3 + c]);
  const paperRgb = channels.map(xs => { xs.sort((a, b) => a - b); return xs[Math.floor(xs.length * .65)] ?? 240; });
  const sourceAlpha = (sx: number, sy: number) => {
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let a = 0;
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const q = (y0 + dy) * W + x0 + dx;
      // Original contour is transported, not the full authored quad. Only
      // paper hidden by the observed warm grip gets an authored completion.
      const value = mask[q] || (extendedSkin[q] ? 255 : 0);
      a += value * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
    }
    return Math.round(a);
  };
  for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) {
    const p = y * W + x;
    top[p] = mask[p];
    const u = uv[p * 2], v = uv[p * 2 + 1];
    if (!activated || u < 0 || v < 0 || u > 1 || v > 1) continue;
    // Rounded corners on the authored lower surface, in its local UV space.
    const dx = Math.max(.025 - u, 0, u - .975), dy = Math.max(.018 - v, 0, v - .982);
    if ((dx / .025) ** 2 + (dy / .018) ** 2 > 1) continue;
    const point = stripPoint(record.sections, u, v), sourceCoverage = sourceAlpha(point[0] - .5, point[1] - .5);
    if (!sourceCoverage) continue;
    const tx = Math.max(0, Math.min(209, Math.round(u * 209))), ty = Math.max(0, Math.min(293, Math.round(v * 293))), j = (ty * 210 + tx) * 4, a = texture[j + 3] / 255;
    for (let c = 0; c < 3; c++) lower[p * 4 + c] = Math.round(paperRgb[c] * (1 - a) + texture[j + c] * a);
    lower[p * 4 + 3] = sourceCoverage;
  }
  const sigma = Math.max(.4, record.renderInkBlurSigmaPx), blurred = await sharp(lower, { raw: { width: W, height: H, channels: 4 } }).blur(sigma).raw().toBuffer();
  const topSoft = await sharp(top, { raw: { width: W, height: H, channels: 1 } }).blur(.55).greyscale().raw().toBuffer();
  const shadowSoft = await sharp(top, { raw: { width: W, height: H, channels: 1 } }).blur(1.1).greyscale().raw().toBuffer();
  if (topSoft.length !== N || shadowSoft.length !== N) throw Error('Unexpected blur channels');
  const output = Buffer.from(single), shadow = Buffer.alloc(N);
  let changed = 0, changedGuard = 0, changedSkin = 0, changedShoe = 0, changedOutsideRoi = 0, singleOutsidePaper = 0, originalGuardChanged = 0, exposedArea = 0, shadowArea = 0;
  for (let p = 0; p < N; p++) {
    const a = activated && !guard[p] && !mask[p] && !shoe[p] ? blurred[p * 4 + 3] / 255 * (1 - topSoft[p] / 255) : 0;
    lowerAlpha[p] = Math.round(a * 255); exposedArea += a;
    const s = a > 0 ? .20 * shadowSoft[p] / 255 : 0;
    shadow[p] = Math.round(s * 255); if (shadow[p]) shadowArea++;
    if (a > 0) for (let c = 0; c < 3; c++) output[p * 3 + c] = Math.round(single[p * 3 + c] * (1 - a) + blurred[p * 4 + c] * (1 - s) * a);
    let different = false, upperDiff = false;
    for (let c = 0; c < 3; c++) { if (output[p * 3 + c] !== single[p * 3 + c]) different = true; if (single[p * 3 + c] !== raw[p * 3 + c]) upperDiff = true; }
    if (upperDiff && !mask[p]) singleOutsidePaper++;
    if (guard[p] && (output[p * 3] !== raw[p * 3] || output[p * 3 + 1] !== raw[p * 3 + 1] || output[p * 3 + 2] !== raw[p * 3 + 2])) originalGuardChanged++;
    if (different) { changed++; if (guard[p]) changedGuard++; if (skin[p] || extendedSkin[p]) changedSkin++; if (shoe[p]) changedShoe++; const x = p % W, y = Math.floor(p / W); if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) changedOutsideRoi++; }
  }
  if (changedGuard || changedSkin || changedShoe || changedOutsideRoi || singleOutsidePaper || originalGuardChanged) throw Error(`Pixel preservation failed at ${f}`);
  await sharp(output, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${run}/pair-frames/frame-${tag(f)}.png`);
  await sharp(single, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${run}/single-frames/frame-${tag(f)}.png`);
  await saveMono(`${run}/masks/lower-visible-${tag(f)}.png`, lowerAlpha);
  await saveMono(`${run}/masks/foreground-${tag(f)}.png`, guard);
  await saveMono(`${run}/masks/inter-card-shadow-${tag(f)}.png`, shadow);
  const originalCentre = stripPoint(record.sections, .5, .5), lowerCentre = stripPoint(bottom, .5, .5);
  const result = { sourceFrame: f, sourcePngSha256: record.sourcePngSha256, frozenSourceMaskSha256: record.observedMaskSha256, frozenInkDemoSha256: hash(singleFile), singlePngSha256: hash(await readFile(`${run}/single-frames/frame-${tag(f)}.png`)), pairPngSha256: hash(await readFile(`${run}/pair-frames/frame-${tag(f)}.png`)), sourceVisiblePixels: record.visiblePixels, offsetUv: offset, projectedOffsetPx: [lowerCentre[0] - originalCentre[0], lowerCentre[1] - originalCentre[1]], lowerVisibleAlphaAreaPx: exposedArea, sourceBoundUpperMesh: record.sections, authoredLowerMesh: bottom, backgroundAppearanceGate: bounds, changed, changedGuard, changedSkin, changedShoe, changedOutsideRoi, singleOutsidePaper, originalGuardChanged, frozenUpperInkSuppressedPixels, interCardShadowPixels: shadowArea, paperRgb, blurSigmaPx: sigma };
  return result;
}

const critical = [80,90,92,93,94,95,96,97,98,99,100,101,102,105,110,125,150,170,184,188,210];
const frames = process.argv.includes('--all') ? Array.from({ length: 131 }, (_, i) => 80 + i) : critical;
const records = [];
for (const f of frames) { records.push(await render(f)); if (f % 20 === 0) console.log(JSON.stringify({ renderedSourceFrame: f })); }
for (const f of critical) {
  const r = records.find(r => r.sourceFrame === f)!;
  const crop = { left: Math.max(0, r.backgroundAppearanceGate.left - 20), top: Math.max(0, r.backgroundAppearanceGate.top - 20), width: r.backgroundAppearanceGate.right - r.backgroundAppearanceGate.left + 41, height: r.backgroundAppearanceGate.bottom - r.backgroundAppearanceGate.top + 41 };
  const files = [`${source.frameDirectory}/frame-${tag(f)}.png`, `${run}/single-frames/frame-${tag(f)}.png`, `${run}/pair-frames/frame-${tag(f)}.png`];
  const panels = await Promise.all(files.map(p => sharp(p).extract(crop).png().toBuffer()));
  await sharp({ create: { width: crop.width * 3, height: crop.height + 28, channels: 3, background: '#15212a' } }).composite([...panels.map((input, i) => ({ input, left: i * crop.width, top: 28 })), ...[`${f} original`, 'One: 8C', 'Pair: 8C + KD'].map((s, i) => ({ input: label(s, crop.width), left: i * crop.width, top: 0 }))]).png().toFile(`${run}/qa/native-${tag(f)}.png`);
}
for (let i = 0; i < records.length; i += 15) {
  const set = records.slice(i, i + 15), overlays: sharp.OverlayOptions[] = [];
  for (let j = 0; j < set.length; j++) {
    const r = set[j], q = r.backgroundAppearanceGate, crop = { left: q.left - 10, top: q.top - 10, width: q.right - q.left + 21, height: q.bottom - q.top + 21 };
    const input = await sharp(`${run}/pair-frames/frame-${tag(r.sourceFrame)}.png`).extract(crop).resize(260, 200, { fit: 'contain', background: '#15212a' }).png().toBuffer();
    overlays.push({ input, left: (j % 5) * 260, top: Math.floor(j / 5) * 228 + 28 }, { input: label(`f${r.sourceFrame} | C2 ${Math.round(r.lowerVisibleAlphaAreaPx)}px`, 260), left: (j % 5) * 260, top: Math.floor(j / 5) * 228 });
  }
  await sharp({ create: { width: 1300, height: Math.ceil(set.length / 5) * 228, channels: 3, background: '#15212a' } }).composite(overlays).png().toFile(`${run}/qa/pair-sheet-${tag(set[0].sourceFrame)}.png`);
}
const movies: any[] = [];
if (process.argv.includes('--all')) {
  for (const kind of ['single', 'pair']) {
    const path = `${run}/render/seat7-${kind}-80-210.mp4`;
    await execute('ffmpeg', ['-v','error','-nostdin','-y','-framerate','30','-start_number','80','-i',`${run}/${kind}-frames/frame-%04d.png`,'-frames:v','131','-an','-c:v','libx264','-crf','14','-preset','fast','-threads','4','-pix_fmt','yuv420p','-movflags','+faststart',path], { windowsHide: true });
    const probe = JSON.parse((await execute('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',path], { windowsHide: true })).stdout).streams[0];
    if (probe.width !== W || probe.height !== H || probe.avg_frame_rate !== '30/1' || +probe.nb_frames !== 131) throw Error('Movie format mismatch');
    movies.push({ path, sha256: hash(await readFile(path)), probe });
  }
  const comparison = `${run}/render/seat7-one-versus-pair-native-roi.mp4`;
  await execute('ffmpeg', ['-v','error','-nostdin','-y','-i',movies[0].path,'-i',movies[1].path,'-filter_complex','[0:v]crop=446:510:1230:590[a];[1:v]crop=446:510:1230:590[b];[a][b]hstack=inputs=2[v]','-map','[v]','-an','-c:v','libx264','-crf','14','-threads','4','-pix_fmt','yuv420p','-movflags','+faststart',comparison], { windowsHide: true });
  movies.push({ path: comparison, sha256: hash(await readFile(comparison)), meaning: 'Left one card, right pair, native spatial scale, same source frames and fps.' });
}
for (const path of frozenCodePaths) if (hash(await readFile(path)) !== frozenCodeHashes[path]) throw Error('Frozen code changed during run');
const evidence = { schemaVersion: 1, source, sourceTracking: { path: `${frozen}/tracking.json`, sha256: hash(trackingBytes) }, frozenCodeHashes, proposal: PAIR_PROPOSAL, frames: records, movies, reproduction: `node tools/pamela-seat7-card-pair.ts ${process.argv.includes('--all') ? '--all' : '--inspect'}`, runtime: { node: process.version, sharp: sharp.versions.sharp }, codeHashes: Object.fromEntries(await Promise.all(['src/pamela-seat7-card-pair.ts','tools/pamela-seat7-card-pair.ts'].map(async p => [p,hash(await readFile(p))]))), validation: { frameCount: records.length, sourcePngHashMatches: records.length, maskChannel: 1, maskBytesPerFrame: N, savedMaskExactRoundtrips: records.length * 3, changedGuardPixels: records.reduce((s,r)=>s+r.changedGuard,0), changedSkinPixels: records.reduce((s,r)=>s+r.changedSkin,0), changedShoePixels: records.reduce((s,r)=>s+r.changedShoe,0), changedOutsideRoiPixels: records.reduce((s,r)=>s+r.changedOutsideRoi,0), unchangedThroughOffsetStart: records.filter(r=>r.sourceFrame<=92).every(r=>r.changed===0), losslessPixelCheckScope: 'PNG RGB only; MP4 is lossy.' }, acceptance: { visual: 'PENDING_NATIVE_REVIEW', runtime: false, physicalScale: false }, limitations: ['Physical card side remains UNKNOWN; both prints and the extra card are authored.', 'Source has one visible card, not evidence of two. Hidden lower surface and UV extrapolation are authored, not a recovered back layer.', 'Foreground preservation is against a conservative local appearance mask, not an anatomical truth mask. Protected original pixels are exact.', 'Median source paper color and isotropic blur approximate illumination and shutter; original hand shadows are not transferred to the extra card.', 'The lower card is already aligned under the upper at frame80, not introduced as a second deal. Smooth sliding during the thin phase may remain perceptible.', 'No physical card-size approval, video warp, face/blouse edit, API call or runtime acceptance.'] };
await writeFile(`${run}/evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ frames: records.length, critical: records.filter(r=>[95,105,150,188].includes(r.sourceFrame)).map(r=>({ frame:r.sourceFrame, source:r.sourceVisiblePixels, extraArea:r.lowerVisibleAlphaAreaPx, offset:r.projectedOffsetPx })), validation:evidence.validation, movies }));
