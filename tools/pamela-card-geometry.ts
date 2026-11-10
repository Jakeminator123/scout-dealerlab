import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { projectDealerPixel, type StageProjection } from '../src/pamela-stage-projection.ts';

type Point = [number, number];
const run = 'runs/20261109-pamela-card-geometry', execute = promisify(execFile);
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const manifestPath = 'runs/20261109-pamela-landed-card-layers/manifest.json', bankPath = 'runs/20261109-pamela-seat-bank/bank-index.json', contractPath = 'references/pamela-stage-contract.json';
const manifestBytes = await readFile(manifestPath), bankBytes = await readFile(bankPath), contractBytes = await readFile(contractPath);
const manifest = JSON.parse(manifestBytes.toString()), bank = JSON.parse(bankBytes.toString()), contract = JSON.parse(contractBytes.toString());
const W = 1762, H = 1174, N = W * H;
const p: StageProjection = { width: contract.dealerPlacement.width, sourceWidth: W, sourceHeight: H, contactSourceY: contract.dealerPlacement.contactSourceY, depth: contract.dealerPlacement.depth, tableHeight: contract.table.feltHeight + .004, camera: contract.camera.position, cameraTarget: contract.camera.target };
const standard = { designWidth: 63, designLength: 88, authoredSceneUnitsPerDesignUnit: .005, widthSceneUnits: .315, lengthSceneUnits: .44, areaSceneUnitsSquared: .1386, physicalMeasurement: false, scaleAccepted: false, orientation: 'Long axis points toward the authored dealer/table contact centre; source card orientation is not reused.' };
sharp.concurrency(1);
await mkdir(run, { recursive: true });
await mkdir(`${run}/qa`, { recursive: true });
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (q: Point[]) => Math.abs(q.reduce((s, a, i) => { const b = q[(i + 1) % q.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
function hull(points: Point[]) {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), lower: Point[] = [], upper: Point[] = [];
  for (const point of sorted) { while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop(); lower.push(point); }
  for (const point of sorted.toReversed()) { while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop(); upper.push(point); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function quadFromBoundary(boundary: Point[]) {
  const q = hull(boundary);
  while (q.length > 4) {
    let best = 0, loss = Infinity;
    for (let i = 0; i < q.length; i++) { const value = Math.abs(cross(q[(i + q.length - 1) % q.length], q[i], q[(i + 1) % q.length])); if (value < loss) { loss = value; best = i; } }
    q.splice(best, 1);
  }
  const groups: Point[][] = [[], [], [], []];
  for (const point of boundary) {
    let which = -1, distance = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
      const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2;
      if (t < .1 || t > .9) continue;
      const d = Math.abs(cross(a, b, point)) / Math.sqrt(length2);
      if (d < distance && d < 4) { distance = d; which = i; }
    }
    if (which >= 0) groups[which].push(point);
  }
  const lines = groups.map((g, i) => {
    if (g.length < 8) return { origin: q[i], direction: [q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]] as Point, points: g.length };
    const mean: Point = [g.reduce((s, v) => s + v[0], 0) / g.length, g.reduce((s, v) => s + v[1], 0) / g.length];
    let xx = 0, yy = 0, xy = 0;
    for (const point of g) { const x = point[0] - mean[0], y = point[1] - mean[1]; xx += x * x; yy += y * y; xy += x * y; }
    const angle = Math.atan2(2 * xy, xx - yy) / 2;
    return { origin: mean, direction: [Math.cos(angle), Math.sin(angle)] as Point, points: g.length };
  });
  const fitted = lines.map((line, i) => {
    const previous = lines[(i + 3) % 4], [ax, ay] = previous.origin, [ux, uy] = previous.direction, [bx, by] = line.origin, [vx, vy] = line.direction;
    const denominator = ux * vy - uy * vx;
    if (Math.abs(denominator) < 1e-6) throw Error('Degenerate quad edge fit');
    const t = ((bx - ax) * vy - (by - ay) * vx) / denominator;
    return [ax + t * ux, ay + t * uy] as Point;
  });
  let start = 0; for (let i = 1; i < 4; i++) if (fitted[i][0] + fitted[i][1] < fitted[start][0] + fitted[start][1]) start = i;
  return { quad: Array.from({ length: 4 }, (_, i) => fitted[(start + i) % 4]), fittedEdgeSupportPoints: lines.map(l => l.points), initialHull: hull(boundary) };
}
function sourceFromTable(world: Point): Point {
  const [cx, cy, cz] = p.camera, dy = p.camera[1] - p.cameraTarget[1], dz = p.camera[2] - p.cameraTarget[2], length = Math.hypot(dy, dz);
  const ny = dy / length, nz = dz / length;
  const t = ((p.tableHeight - cy) * ny + (p.depth - cz) * nz) / ((p.tableHeight - cy) * ny + (world[1] - cz) * nz);
  const sx = cx + t * (world[0] - cx), sy = cy + t * (p.tableHeight - cy), h = (sy - p.tableHeight) * length / dz;
  return [(sx / p.width + .5) * W, p.contactSourceY - h * W / p.width];
}
function worldFromSource(point: Point): Point { const w = projectDealerPixel(point[0], point[1], p); return [w[0], w[2]]; }
function regularCard(center: Point): Point[] {
  const dx = -center[0], dz = p.depth - center[1], length = Math.hypot(dx, dz), along: Point = [dx / length, dz / length], across: Point = [-along[1], along[0]];
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([side, end]) => [center[0] + side * across[0] * standard.widthSceneUnits / 2 + end * along[0] * standard.lengthSceneUnits / 2, center[1] + side * across[1] * standard.widthSceneUnits / 2 + end * along[1] * standard.lengthSceneUnits / 2] as Point);
}
const records: any[] = [], contacts: sharp.OverlayOptions[] = [];
let maxRoundtripErrorPx = 0;
for (const record of manifest.records.slice().sort((a: any, b: any) => a.seat - b.seat)) {
  const bankRecord = bank.seats.find((r: any) => r.seat === record.seat);
  if (bankRecord.output.sha256 !== record.sourceSha256 || record.sourceFrame !== 350) throw Error('Stale landed-card source');
  const [videoBytes, sourceBytes, layerBytes] = await Promise.all([readFile(record.source), readFile(record.sourceFramePng.path), readFile(record.layer.path)]);
  if (hash(videoBytes) !== record.sourceSha256 || hash(sourceBytes) !== record.sourceFramePng.sha256 || hash(layerBytes) !== record.layer.sha256) throw Error(`Source hash mismatch at seat${record.seat}`);
  const sourceRgb = await sharp(sourceBytes).removeAlpha().raw().toBuffer(), rgba = await sharp(layerBytes).ensureAlpha().raw().toBuffer();
  const exact = await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '4', '-i', record.source, '-vf', 'select=eq(n\\,350)', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { windowsHide: true, encoding: 'buffer', maxBuffer: 10_000_000 });
  if (!Buffer.from(exact.stdout).equals(sourceRgb)) throw Error(`Frame350 is not exact source RGB at seat${record.seat}`);
  let alphaPixels = 0, opaquePixels = 0, weightedArea = 0, cx = 0, cy = 0;
  const boundary: Point[] = [], binary = Buffer.alloc(N), bounds = record.layer.bounds;
  for (let i = 0; i < N; i++) {
    const a = rgba[i * 4 + 3] / 255;
    if (a) alphaPixels++;
    weightedArea += a; cx += i % W * a; cy += Math.floor(i / W) * a;
    if (a >= .5) { binary[i] = 1; opaquePixels++; }
  }
  if (alphaPixels !== record.layer.alphaPixels) throw Error('Published layer alpha count differs');
  for (let y = bounds.top; y < bounds.top + bounds.height; y++) for (let x = bounds.left; x < bounds.left + bounds.width; x++) {
    const i = y * W + x;
    if (binary[i] && (!binary[i - 1] || !binary[i + 1] || !binary[i - W] || !binary[i + W])) boundary.push([x + .5, y + .5]);
  }
  const fit = quadFromBoundary(boundary), rawQuad = fit.quad, center: Point = [cx / weightedArea, cy / weightedArea], worldQuad = rawQuad.map(worldFromSource), centerWorld = worldFromSource(center), cleanWorldQuad = regularCard(centerWorld), cleanSourceQuad = cleanWorldQuad.map(sourceFromTable);
  const lengths = worldQuad.map((v, i) => Math.hypot(v[0] - worldQuad[(i + 1) % 4][0], v[1] - worldQuad[(i + 1) % 4][1])), pairA = (lengths[0] + lengths[2]) / 2, pairB = (lengths[1] + lengths[3]) / 2;
  const angles = worldQuad.map((v, i) => { const a = worldQuad[(i + 3) % 4], b = worldQuad[(i + 1) % 4], ux = a[0] - v[0], uy = a[1] - v[1], vx = b[0] - v[0], vy = b[1] - v[1]; return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))) * 180 / Math.PI; });
  for (const sourcePoint of [...rawQuad, ...cleanSourceQuad]) { const roundtrip = sourceFromTable(worldFromSource(sourcePoint)); maxRoundtripErrorPx = Math.max(maxRoundtripErrorPx, Math.hypot(roundtrip[0] - sourcePoint[0], roundtrip[1] - sourcePoint[1])); }
  const row = { seat: record.seat, source: record.source, sourceSha256: record.sourceSha256, sourceFrame: 350, sourceFramePng: record.sourceFramePng, sourceRgbExact: true, layer: record.layer, raw: { alphaSupportPixels: alphaPixels, alphaWeightedAreaPx: weightedArea, halfAlphaPixels: opaquePixels, sourceWhiteCorePixels: record.sourceWhiteCorePixels, fittedQuadSourcePx: rawQuad, fittedQuadAreaPx: area(rawQuad), quadFit: 'Four least-squares edge lines on alpha>=0.5 boundary; rounded corners extrapolated, not hand-authored physical corners.', fittedEdgeSupportPoints: fit.fittedEdgeSupportPoints, sourceCentroidPx: center, tablePlaneQuad: worldQuad, tablePlaneCentroid: centerWorld, tablePlaneAreaSceneUnitsSquared: area(worldQuad), meanOppositeEdgeLengths: [pairA, pairB], shortLongEdgeRatio: Math.min(pairA, pairB) / Math.max(pairA, pairB), cornerAnglesDegrees: angles }, proposedStandard: { tablePlaneQuad: cleanWorldQuad, sourcePlaneQuadPx: cleanSourceQuad, projectedSourceAreaPx: area(cleanSourceQuad), sourceCentroidReused: true, tablePlaneAreaSceneUnitsSquared: area(cleanWorldQuad), rawToProposedWorldAreaRatio: area(worldQuad) / standard.areaSceneUnitsSquared } };
  records.push(row);
  const crop = { left: Math.round(center[0]) - 160, top: Math.round(center[1]) - 80, width: 320, height: 160 };
  const points = rawQuad.map(v => `${v[0] - crop.left},${v[1] - crop.top}`).join(' '), standardPoints = cleanSourceQuad.map(v => `${v[0] - crop.left},${v[1] - crop.top}`).join(' ');
  const overlay = Buffer.from(`<svg width="320" height="160"><polygon points="${points}" fill="none" stroke="#ffb145" stroke-width="1.4"/><polygon points="${standardPoints}" fill="none" stroke="#51e0f4" stroke-width="1.4" stroke-dasharray="4 3"/></svg>`);
  const image = await sharp(sourceBytes).extract(crop).composite([{ input: overlay }]).png().toBuffer();
  const header = Buffer.from(`<svg width="320" height="62"><rect width="100%" height="100%" fill="#16212b"/><g font-family="Arial" fill="white"><text x="9" y="20" font-size="17">Seat ${record.seat} / source frame350</text><text x="9" y="39" font-size="13">alpha ${alphaPixels}px | quad ${area(rawQuad).toFixed(0)}px</text><text x="9" y="56" font-size="13">plane ${area(worldQuad).toFixed(3)}u² | ratio ${(Math.min(pairA, pairB) / Math.max(pairA, pairB)).toFixed(3)}</text></g></svg>`);
  const col = (record.seat - 1) % 4, gridRow = Math.floor((record.seat - 1) / 4);
  contacts.push({ input: header, left: col * 320, top: gridRow * 222 }, { input: image, left: col * 320, top: gridRow * 222 + 62 });
}
if (records.length !== 7 || maxRoundtripErrorPx > .000001) throw Error('Incomplete bank or projection roundtrip failed');
const legend = Buffer.from('<svg width="320" height="222"><rect width="100%" height="100%" fill="#16212b"/><g font-family="Arial" font-size="17"><text x="14" y="36" fill="#ffb145">Orange: raw fitted silhouette</text><text x="14" y="66" fill="#51e0f4">Cyan: authored 63:88 proposal</text><text x="14" y="106" fill="white">Same 1:1 source-pixel scale</text><text x="14" y="136" fill="white">0.315 × 0.440 scene units</text><text x="14" y="166" fill="white">No physical scale accepted</text></g></svg>');
contacts.push({ input: legend, left: 960, top: 222 });
await sharp({ create: { width: 1280, height: 444, channels: 3, background: '#16212b' } }).composite(contacts).png().toFile(`${run}/raw-card-contact-sheet.png`);

const plot = (point: Point): Point => [800 + point[0] * 185, 365 + point[1] * 185];
const poly = (points: Point[]) => points.map(v => plot(v).map(n => n.toFixed(2)).join(',')).join(' ');
let drawing = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#10202a"/><g font-family="Arial"><text x="45" y="42" font-size="27" fill="white">One authored table plane / seven source frame350 cards</text><text x="45" y="74" font-size="17" fill="#c4d2d9">Orange = raw fitted quads. Cyan = equal 63:88 cards. Units and camera are authored; no video changed.</text>';
const tableX = 800 - contract.table.width / 2 * 185, tableY = 365 - contract.table.depth / 2 * 185;
drawing += `<rect x="${tableX}" y="${tableY + 85}" width="${contract.table.width * 185}" height="${contract.table.depth * 185}" rx="75" fill="#244b3c" stroke="#60796d" stroke-width="3"/>`;
// Move the authored geometry down85px as one plotting transform only.
drawing += '<g transform="translate(0 85)">';
for (let x = -3.5; x <= 3.5; x += .5) drawing += `<path d="M${plot([x, -1.6]).join(' ')} L${plot([x, 1.6]).join(' ')}" stroke="#496757" stroke-width=".6"/>`;
for (let z = -1.5; z <= 1.5; z += .5) drawing += `<path d="M${plot([-3.6, z]).join(' ')} L${plot([3.6, z]).join(' ')}" stroke="#496757" stroke-width=".6"/>`;
for (const row of records) {
  drawing += `<polygon points="${poly(row.proposedStandard.tablePlaneQuad)}" fill="#53d6e2" fill-opacity=".21" stroke="#66eafa" stroke-width="2"/><polygon points="${poly(row.raw.tablePlaneQuad)}" fill="none" stroke="#ffb145" stroke-width="2"/>`;
  const xy = plot(row.raw.tablePlaneCentroid); drawing += `<text x="${xy[0]}" y="${xy[1] + 60}" text-anchor="middle" font-size="19" fill="white">${row.seat}</text>`;
}
const dealer = plot([0, p.depth]); drawing += `<circle cx="${dealer[0]}" cy="${dealer[1]}" r="6" fill="white"/><text x="${dealer[0]}" y="${dealer[1] - 16}" text-anchor="middle" font-size="16" fill="white">authored dealer contact centre</text></g>`;
drawing += `<text x="45" y="812" font-size="18" fill="white">Common proposal: 63 × 88 design units × 0.005 = 0.315 × 0.440 scene units; area 0.1386u².</text><text x="45" y="841" font-size="17" fill="#c4d2d9">Source centroids retained. Orientation points toward dealer centre. Raw silhouette ≠ accepted card dimensions.</text><text x="45" y="870" font-size="17" fill="#ffcb82">Blockers: uncalibrated camera/scale, unequal raw footprints, and hand contact tied to the original paper geometry.</text></g></svg>`;
await writeFile(`${run}/table-plane-map.svg`, drawing);
await sharp(Buffer.from(drawing)).png().toFile(`${run}/table-plane-map.png`);
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650"><rect width="100%" height="100%" fill="#10202a"/><g font-family="Arial" fill="white"><text x="38" y="47" font-size="27">Authored card standard / 63:88</text><rect x="110" y="112" width="283.5" height="396" rx="13" fill="#f7f5ef" stroke="#66eafa" stroke-width="3"/><text x="252" y="555" text-anchor="middle" font-size="21">63 design units = 0.315u</text><text x="458" y="170" font-size="22">Length: 88 = 0.440u</text><text x="458" y="215" font-size="22">Area: 0.1386u²</text><text x="458" y="260" font-size="22">All seven use this same plane</text><text x="458" y="305" font-size="22">Physical millimetres: unknown</text><text x="458" y="350" font-size="22">Scale acceptance: pending</text><text x="458" y="395" font-size="22">Observed face/back: UNKNOWN</text><text x="38" y="610" font-size="18">Proposal only. No source video warp, body edit, engine rule or runtime approval.</text></g></svg>`;
await writeFile(`${run}/card-standard.svg`, standardSvg); await sharp(Buffer.from(standardSvg)).png().toFile(`${run}/card-standard.png`);
const worldAreas = records.map(r => r.raw.tablePlaneAreaSceneUnitsSquared), sourceAreas = records.map(r => r.raw.alphaSupportPixels);
const evidence = { schemaVersion: 1, productionAccepted: false, physicalScaleAccepted: false, sourceFrame: 350, sources: { bankIndex: { path: bankPath, sha256: hash(bankBytes) }, landedManifest: { path: manifestPath, sha256: hash(manifestBytes) }, stageContract: { path: contractPath, sha256: hash(contractBytes), status: contract.status }, projectionModule: { path: 'src/pamela-stage-projection.ts', sha256: hash(await readFile('src/pamela-stage-projection.ts')) } }, projection: p, standard, validation: { sourceVideosHashMatched: 7, exactDecodedSourceFrame350Matches: 7, sourceLayerHashesMatched: 7, maximumProjectionRoundtripErrorPx: maxRoundtripErrorPx, rawAlphaAreaMaxMinRatio: Math.max(...sourceAreas) / Math.min(...sourceAreas), rawTablePlaneAreaMaxMinRatio: Math.max(...worldAreas) / Math.min(...worldAreas), canonicalAreaEqualForAllSeats: records.every(r => Math.abs(r.proposedStandard.tablePlaneAreaSceneUnitsSquared - standard.areaSceneUnitsSquared) < 1e-10) }, cornerOrder: 'Cyclic image quad, starting at minimum x+y; does not identify physical grip or card side.', blockers: ['The stage camera, fold baseline and scene unit scale are authored, not recovered physical calibration.', 'Existing raw cards have unequal footprint areas and distorted edge ratios under the same authored table projection; source alpha area is not an approved scale.', 'A pure scale/rotation of card ink cannot retarget the original white paper silhouette or hand contact. Source paper removal, new paper geometry and hand occlusion must be reviewed together.', 'The proposed0.005 scene-unit/design-unit scale and radial orientation are local comparison choices requiring acceptance before new end anchors.', 'Source-frame350 contact-free silhouettes do not establish pickup grip geometry, motion blur, side identity or a successful second-card path.'], outputArtifacts: ['raw-card-contact-sheet.png', 'table-plane-map.png', 'table-plane-map.svg', 'card-standard.png', 'card-standard.svg'], records, reproduction: 'node tools/pamela-card-geometry.ts', runtime: { node: process.version, sharp: sharp.versions.sharp }, toolSha256: hash(await readFile('tools/pamela-card-geometry.ts')) };
const endpointAsymmetry = { sourceYDifferenceSeat7MinusSeat1Px: records[6].raw.sourceCentroidPx[1] - records[0].raw.sourceCentroidPx[1], tableDepthDifferenceSeat7MinusSeat1Units: records[6].raw.tablePlaneCentroid[1] - records[0].raw.tablePlaneCentroid[1], sourceCentresRetainedNotRegularized: true };
evidence.blockers.push('Seat1 and seat7 endpoints also differ in depth: 103.674 source pixels / 0.775 authored table units. Equal card dimensions alone do not create symmetric target positions.');
Object.assign(evidence, { endpointAsymmetry, outputArtifactHashes: Object.fromEntries(await Promise.all(evidence.outputArtifacts.map(async name => [name, hash(await readFile(`${run}/${name}`))]))) });
await writeFile(`${run}/geometry.json`, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ seats: records.length, pixelAreaRatio: evidence.validation.rawAlphaAreaMaxMinRatio, worldAreaRatio: evidence.validation.rawTablePlaneAreaMaxMinRatio, roundtrip: maxRoundtripErrorPx, rows: records.map(r => ({ seat: r.seat, alpha: r.raw.alphaSupportPixels, sourceQuadArea: r.raw.fittedQuadAreaPx, stageArea: r.raw.tablePlaneAreaSceneUnitsSquared, rawRatio: r.raw.shortLongEdgeRatio, standardPixels: r.proposedStandard.projectedSourceAreaPx })) }));
