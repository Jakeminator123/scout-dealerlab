export const NEUTRAL_CARD_SOURCE = {
  path: 'runs/20261109-pamela-seat-bank/original/pamela-seat-1-wan3-first-last.mp4',
  sha256: '5abd5dd1107d7433c8efc0d95164c2c7af3b2b9703f1123c87f8f02da378bc0b',
  frameDirectory: 'runs/20261109-pamela-seat-bank/qa/seat-1/frames',
  width: 1762, height: 1174, fps: 30, frames: 360,
} as const;

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];
export type Section = { v: number; left: Point; right: Point; observedEdges: boolean };
export type NeutralCardFrame = {
  sourceFrame: number; side: 'UNKNOWN'; authoredDisplaySide: 'FRONT_DEMONSTRATION_ONLY';
  quad: Quad; sections: Section[]; visiblePixels: number; centroid: Point | null;
  confidence: { value: number; calibratedProbability: false; reasons: string[] };
  bounds: { left: number; top: number; width: number; height: number };
  edgeTransitionPx: number; inkBlurSigmaPx: number; skinProtectedPixels: number;
  state: 'shoe-contact' | 'carried' | 'hand-contact' | 'released' | 'source-disappearance';
};
const W = NEUTRAL_CARD_SOURCE.width, H = NEUTRAL_CARD_SOURCE.height;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Source-pixel observations, not 3D reconstruction. The hidden grip corners are
// authored estimates. Visible mask edges refine the strip on every source frame.
export const NEUTRAL_CARD_KEYFRAMES: { frame: number; quad: Quad }[] = [
  { frame: 0, quad: [[1290, 756], [1342, 778], [1285, 860], [1239, 832]] },
  { frame: 50, quad: [[1291, 752], [1347, 774], [1285, 858], [1239, 832]] },
  { frame: 60, quad: [[1296, 727], [1347, 749], [1285, 859], [1239, 831]] },
  { frame: 65, quad: [[1297, 707], [1348, 728], [1285, 859], [1238, 831]] },
  { frame: 70, quad: [[1300, 684], [1353, 702], [1296, 843], [1248, 820]] },
  { frame: 75, quad: [[1300, 640], [1361, 656], [1318, 810], [1260, 789]] },
  { frame: 80, quad: [[1301, 604], [1364, 617], [1324, 773], [1260, 752]] },
  { frame: 85, quad: [[1295, 583], [1360, 596], [1311, 750], [1246, 731]] },
  { frame: 90, quad: [[1274, 579], [1344, 591], [1285, 734], [1206, 716]] },
  { frame: 95, quad: [[1220, 590], [1293, 608], [1212, 743], [1144, 718]] },
  { frame: 96, quad: [[1200, 603], [1283, 617], [1203, 745], [1121, 724]] },
  { frame: 97, quad: [[1187, 607], [1274, 621], [1195, 747], [1110, 727]] },
  { frame: 98, quad: [[1170, 617], [1257, 630], [1171, 753], [1086, 731]] },
  { frame: 99, quad: [[1140, 628], [1218, 645], [1120, 765], [1040, 737]] },
  { frame: 100, quad: [[1120, 618], [1191, 647], [1085, 768], [1021, 730]] },
  { frame: 105, quad: [[995, 649], [1052, 687], [928, 796], [875, 751]] },
  { frame: 110, quad: [[860, 684], [917, 727], [770, 823], [713, 770]] },
  { frame: 115, quad: [[716, 700], [771, 747], [596, 842], [559, 782]] },
  { frame: 120, quad: [[593, 723], [638, 774], [456, 858], [430, 800]] },
  { frame: 125, quad: [[495, 748], [531, 797], [350, 893], [328, 836]] },
  { frame: 130, quad: [[418, 780], [455, 824], [268, 919], [252, 865]] },
  { frame: 135, quad: [[361, 814], [402, 851], [214, 953], [200, 893]] },
  { frame: 140, quad: [[347, 852], [388, 893], [181, 955], [169, 910]] },
  { frame: 145, quad: [[313, 873], [354, 911], [154, 965], [147, 922]] },
  { frame: 150, quad: [[310, 891], [350, 930], [147, 967], [138, 923]] },
  { frame: 160, quad: [[328, 898], [350, 938], [146, 965], [136, 921]] },
  { frame: 172, quad: [[330, 898], [350, 938], [146, 965], [136, 921]] },
  { frame: 359, quad: [[330, 898], [350, 938], [146, 965], [136, 921]] },
];
export function authoredQuad(frame: number): Quad {
  if (!Number.isInteger(frame) || frame < 0 || frame >= NEUTRAL_CARD_SOURCE.frames) throw Error('Source frame must be an integer in 0..359');
  const hi = NEUTRAL_CARD_KEYFRAMES.findIndex(k => k.frame >= frame), b = NEUTRAL_CARD_KEYFRAMES[Math.max(0, hi)], a = NEUTRAL_CARD_KEYFRAMES[Math.max(0, hi - 1)];
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
export function trackNeutralCard(raw: Buffer, frame: number) {
  if (raw.length !== W * H * 3) throw Error('Expected native RGB24 source frame');
  const quad = authoredQuad(frame), center: Point = [quad.reduce((s, p) => s + p[0], 0) / 4, quad.reduce((s, p) => s + p[1], 0) / 4];
  // The bottom gate during extraction prevents painting the next card in the shoe.
  const gate = quad.map(p => [center[0] + (p[0] - center[0]) * (frame < 84 ? 1.025 : 1.13), center[1] + (p[1] - center[1]) * (frame < 84 ? 1.025 : 1.13)] as Point);
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
  if (frame < 84) reasons.push('Paper shares the shoe mouth; authored lower gate separates target from the next white card.');
  if (frame >= 358) reasons.push('Original source removes the landed card; persistence must be supplied by an independent card layer.');
  const record: NeutralCardFrame = {
    sourceFrame: frame, side: 'UNKNOWN', authoredDisplaySide: 'FRONT_DEMONSTRATION_ONLY', quad, sections, visiblePixels: chosen.length,
    centroid: chosen.length ? [sx / chosen.length, sy / chosen.length] : null,
    confidence: { value: chosen.length < 100 ? .05 : Math.min(frame < 84 ? .55 : frame < 172 ? .72 : frame < 358 ? .9 : .1, .45 + .03 * (17 - occluded)), calibratedProbability: false, reasons },
    bounds: { left, top, width: right - left + 1, height: bottom - top + 1 }, edgeTransitionPx, inkBlurSigmaPx: clamp(edgeTransitionPx / 2.563, .4, 2.8), skinProtectedPixels,
    state: frame >= 358 ? 'source-disappearance' : frame >= 172 ? 'released' : frame >= 145 ? 'hand-contact' : frame < 84 ? 'shoe-contact' : 'carried',
  };
  return { record, mask, paint, protectedSkin, shoePaper };
}

export function projectNeutralMesh(sections: Section[]) {
  const uv = new Float32Array(W * H * 2); uv.fill(-1);
  type Vertex = { p: Point; uv: Point };
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1], al: Vertex = { p: a.left, uv: [0, a.v] }, ar: Vertex = { p: a.right, uv: [1, a.v] }, bl: Vertex = { p: b.left, uv: [0, b.v] }, br: Vertex = { p: b.right, uv: [1, b.v] };
    for (const [a, b, c] of [[al, ar, br], [al, br, bl]]) {
      const [ax, ay] = a.p, [bx, by] = b.p, [cx, cy] = c.p, d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < .0001) continue;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by, cy))); y++) for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))); x++) {
        const wa = ((by - cy) * (x + .5 - cx) + (cx - bx) * (y + .5 - cy)) / d, wb = ((cy - ay) * (x + .5 - cx) + (ax - cx) * (y + .5 - cy)) / d, wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const p = (y * W + x) * 2; uv[p] = wa * a.uv[0] + wb * b.uv[0] + wc * c.uv[0]; uv[p + 1] = wa * a.uv[1] + wb * b.uv[1] + wc * c.uv[1];
      }
    }
  }
  return uv;
}
