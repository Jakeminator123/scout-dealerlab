export const SEAT7_SOURCE = {
  path: 'runs/20261109-pamela-seat-bank/retakes/seat-7-end-card-v3/original/pamela-seat-7-wan3-end-card-v3.mp4',
  sha256: 'b37dbc6cafa99378786eff51ac1e8cb69c3bb01824b2107d390ddd7032a4620e',
  frameDirectory: 'runs/20261109-pamela-seat-bank/retakes/seat-7-end-card-v3/qa/seat-7/frames',
  width: 1762, height: 1174, fps: 30, frames: 360,
} as const;

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];
export type Section = { v: number; left: Point; right: Point; observedEdges: boolean };
export type Seat7CardFrame = {
  sourceFrame: number; side: 'UNKNOWN'; authoredDisplaySide: 'FRONT_8_CLUB_DEMONSTRATION_ONLY';
  quad: Quad; sections: Section[]; visiblePixels: number; centroid: Point | null;
  confidence: { value: number; calibratedProbability: false; reasons: string[] };
  bounds: { left: number; top: number; width: number; height: number };
  edgeTransitionPx: number; inkBlurSigmaPx: number; skinProtectedPixels: number;
  state: 'shoe-contact' | 'carried' | 'hand-contact' | 'released' | 'source-disappearance';
};
const W = SEAT7_SOURCE.width, H = SEAT7_SOURCE.height;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Source-pixel observations, not 3D reconstruction. The hidden grip corners are
// authored estimates. Visible mask edges refine the strip on every source frame.
export const SEAT7_KEYFRAMES: { frame: number; quad: Quad }[] = [
  { frame: 0, quad: [[1290,756],[1342,778],[1285,860],[1239,832]] },
  { frame: 50, quad: [[1290,756],[1342,778],[1285,860],[1239,832]] },
  { frame: 60, quad: [[1274,744],[1334,761],[1285,855],[1239,830]] },
  { frame: 65, quad: [[1285,717],[1334,738],[1298,837],[1241,812]] },
  { frame: 70, quad: [[1276,696],[1335,710],[1300,809],[1244,783]] },
  { frame: 75, quad: [[1290,659],[1345,681],[1310,770],[1255,734]] },
  { frame: 80, quad: [[1307,637],[1357,661],[1326,744],[1281,694]] },
  { frame: 85, quad: [[1343,638],[1381,678],[1364,747],[1324,682]] },
  { frame: 90, quad: [[1369,675],[1402,704],[1414,780],[1374,718]] },
  { frame: 95, quad: [[1402,733],[1441,764],[1462,834],[1415,780]] },
  { frame: 100, quad: [[1430,796],[1479,829],[1498,893],[1447,843]] },
  { frame: 105, quad: [[1450,851],[1502,872],[1531,951],[1474,904]] },
  { frame: 110, quad: [[1463,893],[1521,914],[1554,994],[1487,950]] },
  { frame: 120, quad: [[1486,948],[1545,967],[1577,1046],[1508,1011]] },
  { frame: 135, quad: [[1491,968],[1567,980],[1608,1058],[1523,1052]] },
  { frame: 150, quad: [[1506,991],[1599,1003],[1620,1067],[1533,1059]] },
  { frame: 170, quad: [[1526,991],[1616,1003],[1632,1070],[1545,1060]] },
  { frame: 188, quad: [[1537,994],[1614,1007],[1633,1070],[1549,1061]] },
  { frame: 359, quad: [[1537,994],[1614,1007],[1633,1070],[1549,1061]] },
];
export function seat7Quad(frame: number): Quad {
  if (!Number.isInteger(frame) || frame < 0 || frame >= SEAT7_SOURCE.frames) throw Error('Source frame must be an integer in 0..359');
  const hi = SEAT7_KEYFRAMES.findIndex(k => k.frame >= frame), b = SEAT7_KEYFRAMES[Math.max(0, hi)], a = SEAT7_KEYFRAMES[Math.max(0, hi - 1)];
  const t = b.frame === a.frame ? 0 : (frame - a.frame) / (b.frame - a.frame);
  return a.quad.map((p, i) => lerp(p, b.quad[i], t)) as Quad;
}
function inside(x: number, y: number, poly: Point[]) {
  let result = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) result = !result;
  return result;
}
const skin = (r: number, g: number, b: number) => r > 90 && r - g > 12 && r - b > 20;
const paperSupport = (r: number, g: number, b: number) => Math.min(r, b) > 70 && r - b < 22 && b - r < 24 && r - g < 16 && g - r < 145 && g - b < 150;
const paperCore = (r: number, g: number, b: number) => Math.min(r, g, b) > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 22;
export function trackSeat7Card(raw: Buffer, frame: number) {
  if (raw.length !== W * H * 3) throw Error('Expected native RGB24 source frame');
  const quad = seat7Quad(frame), center: Point = [quad.reduce((s, p) => s + p[0], 0) / 4, quad.reduce((s, p) => s + p[1], 0) / 4];
  // The bottom gate during extraction prevents painting the next card in the shoe.
  const gate = quad.map(p => [center[0] + (p[0] - center[0]) * (frame < 72 ? 1.025 : 1.13), center[1] + (p[1] - center[1]) * (frame < 72 ? 1.025 : 1.13)] as Point);
  const left = Math.max(0, Math.floor(Math.min(...gate.map(p => p[0])) - 3)), top = Math.max(0, Math.floor(Math.min(...gate.map(p => p[1])) - 3));
  const right = Math.min(W - 1, Math.ceil(Math.max(...gate.map(p => p[0])) + 3)), bottom = Math.min(H - 1, Math.ceil(Math.max(...gate.map(p => p[1])) + 3));
  const support = Buffer.alloc(W * H), protectedSkin = Buffer.alloc(W * H), seeds: number[] = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const p = y * W + x, j = p * 3, r = raw[j], g = raw[j + 1], b = raw[j + 2];
    if (skin(r, g, b)) { protectedSkin[p] = 255; continue; }
    if (!inside(x + .5, y + .5, gate)) continue;
    if (paperSupport(r, g, b)) support[p] = 1;
    if (paperCore(r, g, b)) seeds.push(p);
  }
  // Grow only neutral-paper components reached from opaque paper seeds.
  const visited = Buffer.alloc(W * H), components: number[][] = [];
  for (const seed of seeds) {
    if (visited[seed]) continue;
    const queue = [seed]; visited[seed] = 1;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], x = p % W;
      for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (n >= 0 && n < support.length && support[n] && !visited[n]) { visited[n] = 1; queue.push(n); }
    }
    if (queue.length > 20) components.push(queue);
  }
  components.sort((a, b) => b.length - a.length);
  const chosen = components[0] ?? [], mask = Buffer.alloc(W * H), paint = Buffer.alloc(W * H), shoePaper = Buffer.alloc(W * H);
  let sx = 0, sy = 0, skinProtectedPixels = 0;
  for (const p of chosen) {
    const j = p * 3, r = raw[j], g = raw[j + 1], b = raw[j + 2];
    // Soft chroma mixture estimate at green boundaries; no inferred hidden paper.
    const a = Math.min(clamp((Math.min(r, b) - 15) / 220), clamp((170 - (g - Math.min(r, b))) / 100));
    mask[p] = Math.round(a * 255); sx += p % W; sy += Math.floor(p / W);
  }
  for (let y = top + 1; y < bottom; y++) for (let x = left + 1; x < right; x++) {
    const p = y * W + x;
    if (protectedSkin[p]) { skinProtectedPixels++; continue; }
    if (!mask[p]) continue;
    // Printing is conservative at a contact edge; original white remains unchanged.
    paint[p] = Math.min(mask[p], mask[p - 1], mask[p + 1], mask[p - W], mask[p + W]);
  }
  const shoeMouth: Point[] = [[1293, 758], [1340, 779], [1285, 858], [1240, 832]];
  for (let y = 755; y <= 861; y++) for (let x = 1237; x <= 1343; x++) {
    const p = y * W + x, j = p * 3;
    if (!mask[p] && inside(x + .5, y + .5, shoeMouth) && !skin(raw[j], raw[j + 1], raw[j + 2]) && paperSupport(raw[j], raw[j + 1], raw[j + 2])) shoePaper[p] = 255;
  }
  const sections: Section[] = [];
  for (let k = 0; k <= 16; k++) {
    const v = k / 16, l = lerp(quad[0], quad[3], v), r = lerp(quad[1], quad[2], v), dx = r[0] - l[0], dy = r[1] - l[1], steps = Math.ceil(Math.hypot(dx, dy) * 1.4);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= steps; j++) {
      const u = -.12 + 1.24 * j / steps, x = Math.round(l[0] + dx * u), y = Math.round(l[1] + dy * u);
      if (x >= 0 && x < W && y >= 0 && y < H && mask[y * W + x] >= 200) { lo = Math.min(lo, u); hi = Math.max(hi, u); }
    }
    const observed = k > 0 && k < 16 && hi - lo > .72 && lo < .18 && hi > .82;
    sections.push({ v, left: observed ? [l[0] + dx * lo, l[1] + dy * lo] : l, right: observed ? [l[0] + dx * hi, l[1] + dy * hi] : r, observedEdges: observed });
  }
  const edgeWidths: number[] = [];
  const sample = (x: number, y: number) => { const j = (Math.round(y) * W + Math.round(x)) * 3; return Math.min(raw[j] ?? 0, raw[j + 2] ?? 0); };
  for (const section of sections.slice(2, -2)) if (section.observedEdges) {
    for (const flip of [false, true]) {
      const a = flip ? section.right : section.left, b = flip ? section.left : section.right, length = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
      const outside = sample(a[0] - dx * 6, a[1] - dy * 6), interior = sample(a[0] + dx * 6, a[1] + dy * 6);
      if (interior - outside < 100) continue;
      let x10: number | null = null, x90: number | null = null;
      for (let z = -6; z <= 6; z += .5) { const fraction = (sample(a[0] + dx * z, a[1] + dy * z) - outside) / (interior - outside); if (x10 === null && fraction >= .1) x10 = z; if (x90 === null && fraction >= .9) x90 = z; }
      if (x10 !== null && x90 !== null && x90 >= x10) edgeWidths.push(x90 - x10);
    }
  }
  edgeWidths.sort((a, b) => a - b);
  const edgeTransitionPx = edgeWidths[Math.floor(edgeWidths.length / 2)] ?? 1.5;
  const occluded = sections.filter(s => !s.observedEdges).length;
  const reasons = ['Blank surface does not identify physical face/back or material-point UV coordinates.', `${occluded}/17 strip sections use authored geometry where the complete width is not observed.`];
  if (frame < 72) reasons.push('Paper shares the shoe mouth; authored lower gate separates target from the next white card.');

  const record: Seat7CardFrame = {
    sourceFrame: frame, side: 'UNKNOWN', authoredDisplaySide: 'FRONT_8_CLUB_DEMONSTRATION_ONLY', quad, sections, visiblePixels: chosen.length,
    centroid: chosen.length ? [sx / chosen.length, sy / chosen.length] : null,
    confidence: { value: chosen.length < 100 ? .05 : Math.min(frame < 72 ? .55 : frame < 188 ? .72 : .9, .45 + .03 * (17 - occluded)), calibratedProbability: false, reasons },
    bounds: { left, top, width: right - left + 1, height: bottom - top + 1 }, edgeTransitionPx, inkBlurSigmaPx: clamp(edgeTransitionPx / 2.563, .4, 2.8), skinProtectedPixels,
    state: frame >= 188 ? 'released' : frame >= 125 ? 'hand-contact' : frame < 72 ? 'shoe-contact' : 'carried',
  };
  return { record, mask, paint, protectedSkin, shoePaper };
}


// Shared pure rasterizer; both verified sources have the same native canvas.
export { projectNeutralMesh } from './pamela-neutral-card-track.ts';

