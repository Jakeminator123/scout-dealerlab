/** Local deterministic input preparation only. Never contacts a generation API. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { keyPamelaFrame } from '../src/pamela-key.ts';
import { padCanonicalForIdle, PAMELA_IDLE_SOURCE } from '../src/pamela-idle-source-projection.ts';

sharp.concurrency(1);
const ROOT = 'runs/20261110-pamela-direct-return-pilot/preparation';
const PREFLIGHT = `${ROOT}/preflight-02.json`;
const W = 1762, PW = 1764, H = 1174, STARTS = [194, 210], END = 326;
type Ref = { path: string; sha256: string };
const hash = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');
const ref = async (path: string): Promise<Ref> => ({ path, sha256: hash(await readFile(path)) });
const json = async (path: string): Promise<any> => JSON.parse(await readFile(path, 'utf8'));
async function checked(r: Ref) { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, `Changed source: ${r.path}`); return b; }
async function rgb(b: Buffer, width: number) { const r = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true }); assert.deepEqual([r.info.width, r.info.height, r.info.channels], [width, H, 3]); return r.data; }
async function mono(r: Ref) { const b = await sharp(await checked(r)).greyscale().raw().toBuffer({ resolveWithObject: true }); assert.deepEqual([b.info.width, b.info.height, b.info.channels], [W, H, 1]); return b.data; }
const artifacts: Ref[] = [];
async function save(path: string, b: Buffer | string) { try { await writeFile(path, b, { flag: 'wx' }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; assert.equal(hash(await readFile(path)), hash(typeof b === 'string' ? Buffer.from(b) : b), `Refuse changed output: ${path}`); } const r = await ref(path); artifacts.push(r); return r; }
const saveJson = (path: string, value: unknown) => save(path, JSON.stringify(value, null, 2) + '\n');
const probe = (path: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,time_base,nb_frames:format=duration', '-of', 'json', path], { encoding: 'utf8', windowsHide: true }));
const extract = (path: string, frame: number) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const label = (width: number, text: string) => Buffer.from(`<svg width="${width}" height="24"><rect width="100%" height="100%" fill="#18252c"/><text x="6" y="17" fill="white" font-size="14">${text}</text></svg>`);
async function sheet(id: string, paths: Array<{ path: string; frame: number }>, roi: { left: number; top: number; width: number; height: number }, columns = 4) {
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const [i, p] of paths.entries()) {
    const left = i % columns * roi.width, top = Math.floor(i / columns) * (roi.height + 24);
    overlays.push({ input: label(roi.width, `${id} native f${p.frame}`), left, top });
    overlays.push({ input: await sharp(p.path).extract(roi).png().toBuffer(), left, top: top + 24 });
  }
  return save(`${ROOT}/qa/${id}.png`, await sharp({ create: { width: columns * roi.width, height: Math.ceil(paths.length / columns) * (roi.height + 24), channels: 3, background: '#18252c' } }).composite(overlays).png().toBuffer());
}

async function prepare() {
  assert.equal(process.version, 'v24.21.0', 'Use the project Volta Node');
  const c1Ref = await ref('runs/20261109-pamela-edge-card-track/take-02/p1/evidence.json');
  assert.equal(c1Ref.sha256, 'ad69cc9a91f68292213f4d23e0a7d0a8ec5912c582444deb117b388db5ac91e9');
  const c2Ref = await ref('runs/20261109-pamela-c2-motion-track/take-01/seat-1/draft-02/track.json');
  assert.equal(c2Ref.sha256, 'cc9a001383f96eeacbd18ce62a77949b1efdd52ecf5a9892503a03e1a2d0bd17');
  const c1 = await json(c1Ref.path), c2 = await json(c2Ref.path);
  await checked(c1.source); await checked(c2.source); await checked(PAMELA_IDLE_SOURCE);
  const idleFrameRef = { path: `runs/20261109-pamela-idle-anchor-review/job01-width-mismatch-01/native/frame-${String(END).padStart(4, '0')}.png`, sha256: 'bf12fb29eb3e4f137c2f497bcb5418c0c3e9822fa62f549f0d2e0c389cde4021' };
  const idleOriginal = await checked(idleFrameRef), idleExtract = extract(PAMELA_IDLE_SOURCE.path, END), idleRgb = await rgb(idleExtract, PW);
  assert.equal(hash(idleRgb), hash(await rgb(idleOriginal, PW)), 'Idle cached frame differs from fresh source decode');
  const idleKey = keyPamelaFrame(idleRgb, PW, H), idleProbe = probe(PAMELA_IDLE_SOURCE.path);
  const prepared: any[] = [];
  // Validate both complete endpoints before writing any media.
  for (let i = 0; i < 2; i++) {
    const ordinal = i + 1, frame = STARTS[i], record = i === 0 ? c1.records[frame] : c2.frames[frame];
    const source = i === 0 ? c1.source : c2.source;
    const originalRef: Ref = i === 0 ? { path: `${source.frameDirectory}/frame-${String(frame).padStart(4, '0')}.png`, sha256: record.sourcePngSha256 } : record.source;
    const rawPng = await checked(originalRef), fresh = extract(source.path, frame), sourceRgb = await rgb(fresh, W);
    assert.equal(hash(sourceRgb), hash(await rgb(rawPng, W)), 'Cached start differs from fresh source decode');
    const coverage = Buffer.alloc(W * H), guard = Buffer.alloc(W * H), visiblePerCard = [0, 0];
    const maskRefs: Ref[] = [];
    if (i === 0) {
      const cr = record.masks.find((r: any) => r.type === 'coverage'), gr = record.masks.find((r: any) => r.type === 'hand-guards');
      coverage.set(await mono(cr)); guard.set(await mono(gr)); maskRefs.push(cr, gr);
      for (const a of coverage) if (a) visiblePerCard[0]++;
    } else {
      const mask = await rgb(await checked(record.mask), W); maskRefs.push(record.mask);
      for (let p = 0; p < W * H; p++) {
        const j = p * 3; assert.ok(!(mask[j] && mask[j + 1]), 'Two visible card masks overlap');
        coverage[p] = Math.max(mask[j], mask[j + 1]); guard[p] = mask[j + 2];
        if (mask[j]) visiblePerCard[0]++; if (mask[j + 1]) visiblePerCard[1]++;
      }
    }
    const keyed = keyPamelaFrame(sourceRgb, W, H), rgba = Buffer.alloc(W * H * 4);
    let protectedCoverage = 0, alphaPixels = 0, opaquePixels = 0, minX = W, maxX = 0, minY = H, maxY = 0;
    for (let p = 0; p < W * H; p++) {
      if (coverage[p] && guard[p]) protectedCoverage++;
      if (!coverage[p] || guard[p]) continue;
      const a = Math.min(coverage[p], Math.round(keyed.alpha[p] * 255)); if (!a) continue;
      // Keep the opaque card core byte-exact; only the partially covered rim uses despilled edge RGB.
      const j = p * 3, q = p * 4; for (let c = 0; c < 3; c++) rgba[q + c] = a === 255 ? sourceRgb[j + c] : keyed.rgb[j + c]; rgba[q + 3] = a;
      alphaPixels++; if (a === 255) opaquePixels++;
      const x = p % W, y = Math.floor(p / W); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    assert.equal(protectedCoverage, 0, 'Selected endpoint still has guarded paper; do not invent hidden card pixels');
    assert.ok(alphaPixels > 4000 && opaquePixels > 3500 && maxX < 300 && minY > 950, 'Unexpected landed-card support');
    assert.ok(visiblePerCard.slice(0, ordinal).every(n => n > 1000), 'One required visible card is missing');
    const paddedStart = Buffer.from(padCanonicalForIdle(sourceRgb, 3)), paddedLayer = Buffer.from(padCanonicalForIdle(rgba, 4));
    for (let y = 0; y < H; y++) assert.equal(hash(paddedStart.subarray((y * PW + 1) * 3, (y * PW + 1 + W) * 3)), hash(sourceRgb.subarray(y * W * 3, (y + 1) * W * 3)));
    let endActorOverlap = 0, expandedActorOverlap = 0;
    const margin = 32;
    for (let y = minY - margin; y <= maxY + margin; y++) for (let x = minX + 1 - margin; x <= maxX + 1 + margin; x++) if (idleKey.alpha[y * PW + x] > 0) expandedActorOverlap++;
    for (let p = 0; p < PW * H; p++) if (paddedLayer[p * 4 + 3] && idleKey.alpha[p] > 0) endActorOverlap++;
    assert.equal(endActorOverlap, 0, 'Idle foreground intersects card: unsafe derived end reference');
    assert.equal(expandedActorOverlap, 0, 'Idle foreground is too near the card rectangle');
    const endRgb = await sharp(idleRgb, { raw: { width: PW, height: H, channels: 3 } }).composite([{ input: paddedLayer, raw: { width: PW, height: H, channels: 4 }, blend: 'over' }]).removeAlpha().raw().toBuffer();
    let changedOutsideLayer = 0, changedOpaqueCore = 0;
    for (let p = 0; p < PW * H; p++) for (let c = 0; c < 3; c++) {
      if (!paddedLayer[p * 4 + 3] && endRgb[p * 3 + c] !== idleRgb[p * 3 + c]) changedOutsideLayer++;
      if (paddedLayer[p * 4 + 3] === 255 && endRgb[p * 3 + c] !== paddedStart[p * 3 + c]) changedOpaqueCore++;
    }
    assert.equal(changedOutsideLayer, 0); assert.equal(changedOpaqueCore, 0, 'Opaque paper differs between endpoints');
    prepared.push({ id: `P1-K${ordinal}`, ordinal, source, frame, originalRef, fresh, sourceRgb, paddedStart, paddedLayer, endRgb, maskRefs, track: i === 0 ? c1Ref : c2Ref,
      probe: probe(source.path), bounds: { left: minX + 1, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      checks: { protectedCoverage, alphaPixels, opaquePixels, visiblePerCard: visiblePerCard.slice(0, ordinal), endActorOverlap, expandedActorOverlap, expandedMarginPixels: margin, changedOutsideLayerChannels: changedOutsideLayer, changedOpaqueCoreChannels: changedOpaqueCore, freshDecodeMatchesCachedRgb: true, unchangedSourceInteriorColumns: W } });
  }
  await mkdir(ROOT, { recursive: true }); for (const d of ['qa', 'sources', 'anchors', 'layers']) await mkdir(`${ROOT}/${d}`, { recursive: true });
  const idleCopy = await save(`${ROOT}/sources/idle-B-f0326.png`, idleExtract);
  const variants: any[] = [];
  for (const p of prepared) {
    const sourceCopy = await save(`${ROOT}/sources/${p.id}-f${p.frame}.png`, p.fresh);
    const start = await save(`${ROOT}/anchors/${p.id}-start.png`, await sharp(p.paddedStart, { raw: { width: PW, height: H, channels: 3 } }).png().toBuffer());
    const end = await save(`${ROOT}/anchors/${p.id}-end.png`, await sharp(p.endRgb, { raw: { width: PW, height: H, channels: 3 } }).png().toBuffer());
    const layer = await save(`${ROOT}/layers/${p.id}-neutral-cards.png`, await sharp(p.paddedLayer, { raw: { width: PW, height: H, channels: 4 } }).png().toBuffer());
    const window = Array.from({ length: 19 }, (_, n) => p.frame - 6 + n);
    const directory = p.ordinal === 1 ? c1.source.frameDirectory : 'runs/20261109-pamela-seat-bank/c2/bank-v2-stage-1/qa/seat-1/frames';
    const native = window.map(frame => ({ frame, path: `${directory}/frame-${String(frame).padStart(4, '0')}.png` }));
    for (const n of native) { const r = p.ordinal === 1 ? c1.records[n.frame] : c2.frames[n.frame]; await checked(p.ordinal === 1 ? { path: n.path, sha256: r.sourcePngSha256 } : r.source); }
    const nativeSheet = await sheet(`${p.id}-release`, native, { left: 90, top: 850, width: 500, height: 250 });
    const preview = await save(`${ROOT}/qa/${p.id}-endpoints.png`, await sharp({ create: { width: 1764, height: 611, channels: 3, background: '#18252c' } }).composite([
      { input: label(882, `${p.id}: original source f${p.frame}, +1 px per side`), left: 0, top: 0 },
      { input: label(882, `VILA B326 + same ${p.ordinal} neutral card(s)`), left: 882, top: 0 },
      { input: await sharp(start.path).resize(882, 587).png().toBuffer(), left: 0, top: 24 },
      { input: await sharp(end.path).resize(882, 587).png().toBuffer(), left: 882, top: 24 },
    ]).png().toBuffer());
    const prompt = `One continuous locked-camera shot of exactly the same Pamela, black jacket, hair, face, lighting, bright green background, green table and card shoe in the supplied first and last frames. Start exactly at the first frame: ${p.ordinal === 1 ? 'one blank white card is already' : 'two overlapping blank white cards are already'} landed at far image-left, and the empty dealing hand has just released the card and is visibly clear of it. Move that empty hand directly inward to the central resting pose in the last frame, with natural gentle deceleration. The other hand remains near the center and settles into the supplied resting pose. Never reach toward, visit, touch or draw from the shoe. Never pass through a ready-at-shoe pose. Keep exactly ${p.ordinal} loose table card${p.ordinal === 1 ? '' : 's'}, preserving every supplied card outline, overlap, orientation and pixel location throughout. The existing blank display card in the shoe mouth remains unchanged and is not an extra loose table card. No new card, retrieval, flip or hand contact with the landed cards. Gently turn her face toward the camera and finish at the exact supplied calm resting pose. No camera move, zoom, cut, body scaling, new objects, speech or blink at either endpoint.`;
    variants.push({ id: p.id, dealerId: 'pamela-pilot', target: 'P1', ordinal: p.ordinal, looseTableCards: p.ordinal, start: { ...start, width: PW, height: H, source: { path: p.source.path, sha256: p.source.sha256 }, sourceFrame: p.frame, sourceFps: 30, originalFrame: p.originalRef, extracted: sourceCopy, transform: 'padCanonicalForIdle: edge-replicate one RGB column per side; original 1762 columns byte-exact at x+1; no scaling/crop' }, end: { ...end, width: PW, height: H, source: PAMELA_IDLE_SOURCE, sourceFrame: END, extracted: idleCopy, transform: 'Native B326 unchanged outside the same source-derived neutral-card RGBA layer; sharp over at identical pixels' }, retainedCards: { layer, sourceFrame: p.frame, source: { path: p.source.path, sha256: p.source.sha256 }, track: p.track, masks: p.maskRefs, method: 'Frozen paper coverage AND NOT hand guard; keyPamelaFrame RGB/alpha, alpha=min(key alpha, frozen coverage); pad RGBA transparently by x+1; no new geometry or invented hidden paper', bounds: p.bounds, shadowPolicy: 'No synthetic shadow; source neutral opaque paper pixels retained, chroma edge follows existing keyer' }, sourceProbe: p.probe, checks: p.checks, review: { consecutiveStartWindow: [window[0], window.at(-1)], nativeSheet, preview, fullStartAndEnd: [start, end], status: 'awaiting-native-visual-review' }, requestedDurationSeconds: 3, expectedNativeFps: 30, expectedFrames: 90, modelCandidate: 'wan3-first-last', prompt, promptSha256: hash(Buffer.from(prompt)), restrictions: ['No API calls by this tool', 'Exactly one unique job per variant; root persists task ID before retry', 'No direct return reuse across K1/K2 without a separate source/pose/mask compatibility proof', 'Generation quality and exact output geometry must be verified after generation'], productionAccepted: false });
  }
  const endWindow = Array.from({ length: 11 }, (_, i) => ({ frame: 316 + i, path: `runs/20261109-pamela-idle-anchor-review/job01-width-mismatch-01/native/frame-${String(316 + i).padStart(4, '0')}.png` }));
  const endSheets = [await sheet('VILA-face', endWindow, { left: 700, top: 100, width: 350, height: 330 }), await sheet('VILA-hands', endWindow, { left: 620, top: 730, width: 520, height: 190 }, 3)];
  const code = await Promise.all(['tools/pamela-direct-return-prepare.ts', 'src/pamela-key.ts', 'src/pamela-idle-source-projection.ts', 'src/pamela-stage-projection.ts'].map(ref));
  const preflight = { schemaVersion: 1, status: 'inputs-prepared-awaiting-native-visual-review', createdAt: new Date().toISOString(), node: process.version, dealerId: 'pamela-pilot', variants, idleSource: { ...PAMELA_IDLE_SOURCE, probe: idleProbe, cachedFrame: idleFrameRef, freshFrame: idleCopy }, endReview: { consecutiveWindow: [316, 326], sheets: endSheets }, code, artifacts, maximumMediaProcesses: 1, apiCalls: 0, sourceMediaChanged: false, bodyReturnReuse: { allowed: false, reason: 'K1 f194 and K2 f210 have different arm/body pose and one versus two visible table cards. Prepare two source-bound returns; a common later body interval may be audited only after generation.' }, limitations: ['Technical reference compositing only; no generated movement or semantic front/back inference', 'Explicit one-pixel alignment preserves native source geometry; this is not measured camera recovery', 'Source lighting remains baked; matte/edge quality is a candidate and will be visually inspected', 'An endpoint with correct pixels does not prove generated card persistence or seamless motion', 'New output SHA invalidates dependent QA; root verifies first/last, all retained cards and shoe avoidance'] };
  await saveJson(PREFLIGHT, preflight);
  console.log(JSON.stringify({ status: preflight.status, variants: variants.map(v => ({ id: v.id, start: v.start.path, end: v.end.path, checks: v.checks })), preflight: await ref(PREFLIGHT) }));
}

async function finalize() {
  const p = await json(PREFLIGHT); assert.equal(p.status, 'inputs-prepared-awaiting-native-visual-review');
  for (const r of [...p.artifacts, ...p.code]) await checked(r);
  const plan = { ...p, status: 'local-inputs-native-reviewed-ready-for-root-submission', preparedEvidence: await ref(PREFLIGHT), priorPreparation: { evidence: await ref(`${ROOT}/preflight.json`), toolSnapshot: await ref(`${ROOT}/preflight-01-tool.ts`), reason: 'Type annotation corrected after focused tsc; deterministic inputs rerun and every existing output byte-compared, no media overwritten' }, opaqueCardCorePolicy: 'For alpha255 the layer copies original source RGB byte-exact; only mixed edge pixels use existing keyer RGB', validation: { focusedStrictTypeScript: 'passed with --ignoreConfig and explicit file', nativeViews: 'Both final end PNG and all four native boundary sheets reviewed; source full start frames reviewed before composition' }, reviewedAt: new Date().toISOString(), variants: p.variants.map((v: any) => ({ ...v, review: { ...v.review, status: 'native-endpoints-and-consecutive-boundary-sheets-reviewed', observations: ['Empty hand visibly clear of paper at chosen start', 'End card layer stays far from resting hands and shoe', 'One or two visible card silhouettes agree with the selected source', 'Endpoint reference accepted for a bounded pilot only; generated output and seams remain unapproved'] } })) };
  await saveJson(`${ROOT}/plan.json`, plan); console.log(JSON.stringify({ status: plan.status, plan: await ref(`${ROOT}/plan.json`), variants: plan.variants.map((v: any) => ({ id: v.id, start: v.start.sha256, end: v.end.sha256 })) }));
}
if (process.argv.includes('--finalize')) await finalize(); else await prepare();
