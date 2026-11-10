import { paperCoverage } from './pamela-paper-coverage.ts';
export const SYMMETRIC_P1_SOURCE = {
  path: 'runs/20261109-pamela-seat-bank/retakes/seat-1-symmetric-v2/original/pamela-seat-1-wan3-symmetric-v2.mp4',
  sha256: '8402ddfcaabf1356b25b28fc8e7e3ca59121260eee6b188b7bfed431b2af9307',
  frameDirectory: 'runs/20261109-pamela-seat-bank/retakes/seat-1-symmetric-v2/qa/seat-1/frames',
  width: 1762, height: 1174, fps: 30, frames: 360,
} as const;

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];
export type Section = { v: number; left: Point; right: Point; observedEdges: boolean };
export type SymmetricP1CardFrame = {
  sourceFrame: number; side: 'UNKNOWN'; authoredDisplaySide: 'SEPARATE_FRONT_AND_SG_BACK_DIAGNOSTICS';
  quad: Quad; sections: Section[]; visiblePixels: number; centroid: Point | null;
  confidence: { value: number; calibratedProbability: false; reasons: string[] };
  bounds: { left: number; top: number; width: number; height: number };
  edgeTransitionPx: number; inkBlurSigmaPx: number; skinProtectedPixels: number;
  state: 'shoe-contact' | 'carried' | 'hand-contact' | 'released' | 'source-disappearance';
  authoredSearchQuad: Quad; contourQuadFitted: boolean; hiddenGripCornerInferred: boolean;
};
const W = SYMMETRIC_P1_SOURCE.width, H = SYMMETRIC_P1_SOURCE.height;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// Source-pixel observations, not 3D reconstruction. The hidden grip corners are
// authored estimates. Visible mask edges refine the strip on every source frame.
export const SYMMETRIC_P1_KEYFRAMES: { frame: number; quad: Quad }[] = [
  {"frame":0,"quad":[[1290,756],[1342,778],[1285,860],[1239,832]]},
  {"frame":50,"quad":[[1290,756],[1342,778],[1285,860],[1239,832]]},
  {"frame":60,"quad":[[1284,749],[1340,775],[1285,860],[1239,832]]},
  {"frame":65,"quad":[[1267,737],[1332,758],[1289,851],[1230,820]]},
  {"frame":70,"quad":[[1235,714],[1310,737],[1274,837],[1203,805]]},
  {"frame":75,"quad":[[1170,698],[1249,726],[1198,831],[1130,790]]},
  {"frame":80,"quad":[[1080,717],[1158,735],[1107,836],[1045,794]]},
  {"frame":85,"quad":[[985,721],[1068,759],[1010,850],[930,792]]},
  {"frame":90,"quad":[[876,739],[949,777],[870,859],[815,805]]},
  {"frame":95,"quad":[[768,753],[827,799],[745,879],[701,816]]},
  {"frame":100,"quad":[[666,775],[714,830],[624,896],[595,825]]},
  {"frame":105,"quad":[[547,796],[584,868],[493,922],[475,846]]},
  {"frame":110,"quad":[[461,815],[495,887],[405,941],[391,865]]},
  {"frame":115,"quad":[[394,831],[423,905],[333,962],[323,883]]},
  {"frame":120,"quad":[[333,851],[358,927],[269,979],[265,897]]},
  {"frame":125,"quad":[[283,870],[309,943],[222,1001],[221,918]]},
  {"frame":130,"quad":[[246,888],[270,967],[183,1021],[181,937]]},
  {"frame":135,"quad":[[212,908],[240,989],[154,1045],[150,957]]},
  {"frame":140,"quad":[[205,926],[230,1008],[144,1064],[142,974]]},
  {"frame":145,"quad":[[205,950],[221,1023],[132,1068],[143,996]]},
  {"frame":150,"quad":[[214,972],[211,1044],[130,1071],[145,1008]]},
  {"frame":155,"quad":[[224,992],[207,1061],[126,1071],[145,1009]]},
  {"frame":160,"quad":[[225,995],[208,1062],[123,1072],[146,1007]]},
  {"frame":180,"quad":[[224,995],[207,1062],[125,1072],[148,1006]]},
  {"frame":194,"quad":[[225,995],[209,1063],[128,1072],[148,1006]]},
  {"frame":359,"quad":[[225,995],[209,1063],[128,1072],[148,1006]]},
];
export function symmetricP1Quad(frame: number): Quad {
  if (!Number.isInteger(frame) || frame < 0 || frame >= SYMMETRIC_P1_SOURCE.frames) throw Error('Source frame must be an integer in 0..359');
  const hi = SYMMETRIC_P1_KEYFRAMES.findIndex(k => k.frame >= frame), b = SYMMETRIC_P1_KEYFRAMES[Math.max(0, hi)], a = SYMMETRIC_P1_KEYFRAMES[Math.max(0, hi - 1)];
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
function fitVisibleQuad(pixels:number[],mask:Buffer,template:Quad,guard:Buffer){
 const points=pixels.filter(p=>mask[p]>=200).map(p=>[p%W,Math.floor(p/W)] as Point).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const hull:Point[]=[];for(const p of points){while(hull.length>1&&cross(hull.at(-2)!,hull.at(-1)!,p)<=0)hull.pop();hull.push(p);}const lower=hull.length;
 for(let i=points.length-2;i>=0;i--){const p=points[i];while(hull.length>lower&&cross(hull.at(-2)!,hull.at(-1)!,p)<=0)hull.pop();hull.push(p);}hull.pop();
 while(hull.length>4){let smallest=Infinity,index=0;for(let i=0;i<hull.length;i++){const area=Math.abs(cross(hull[(i+hull.length-1)%hull.length],hull[i],hull[(i+1)%hull.length]));if(area<smallest){smallest=area;index=i;}}hull.splice(index,1);}
 if(hull.length!==4)return {quad:template,fitted:false,hidden:false};
 let quad=template,best=Infinity;for(const order of [hull,[...hull].reverse()])for(let start=0;start<4;start++){const trial=Array.from({length:4},(_,i)=>order[(i+start)%4]) as Quad,score=trial.reduce((s,p,i)=>s+(p[0]-template[i][0])**2+(p[1]-template[i][1])**2,0);if(score<best){best=score;quad=trial;}}
 let hidden=false;for(let y=Math.max(0,quad[0][1]-12);y<=Math.min(H-1,quad[0][1]+12);y++)for(let x=Math.max(0,quad[0][0]-12);x<=Math.min(W-1,quad[0][0]+12);x++)if(guard[y*W+x])hidden=true;
 // The three unobscured corners anchor an explicitly authored affine estimate
 // of the held corner. This is not observed 3D or material-point recovery.
 if(hidden)quad=[[quad[1][0]+quad[3][0]-quad[2][0],quad[1][1]+quad[3][1]-quad[2][1]],quad[1],quad[2],quad[3]];
 return {quad,fitted:true,hidden};
}
export function trackSymmetricP1Card(raw: Buffer, frame: number) {
  if (raw.length !== W * H * 3) throw Error('Expected native RGB24 source frame');
  let quad = symmetricP1Quad(frame);const authoredSearchQuad=structuredClone(quad),center: Point = [quad.reduce((s, p) => s + p[0], 0) / 4, quad.reduce((s, p) => s + p[1], 0) / 4];
  // The bottom gate during extraction prevents painting the next card in the shoe.
  const gate = quad.map(p => [center[0] + (p[0] - center[0]) * (frame < 65 ? 1.025 : 1.75), center[1] + (p[1] - center[1]) * (frame < 65 ? 1.025 : 1.75)] as Point);
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
  let chosen = components[0] ?? [];
  // During extraction the moving sheet touches the darker next sheet. A local
  // bright-paper component locates the top sheet; its contour restricts the
  // existing neutral support. No skin pixels or new chroma support are added.
  if(frame>=65&&frame<=76){
    const bright=new Set(chosen.filter(p=>Math.min(raw[p*3],raw[p*3+1],raw[p*3+2])>220&&Math.max(raw[p*3],raw[p*3+1],raw[p*3+2])-Math.min(raw[p*3],raw[p*3+1],raw[p*3+2])<20)),parts:number[][]=[];
    while(bright.size){const seed=bright.values().next().value!,part=[seed];bright.delete(seed);for(let i=0;i<part.length;i++)for(const n of[part[i]-1,part[i]+1,part[i]-W,part[i]+W])if(bright.delete(n))part.push(n);parts.push(part);}parts.sort((a,b)=>b.length-a.length);
    if(parts[0]?.length>1000){const binary=Buffer.alloc(W*H);for(const p of parts[0])binary[p]=255;const outline=fitVisibleQuad(parts[0],binary,quad,protectedSkin).quad,c:Point=[outline.reduce((s,p)=>s+p[0],0)/4,outline.reduce((s,p)=>s+p[1],0)/4],gate=outline.map(p=>[c[0]+(p[0]-c[0])*1.04,c[1]+(p[1]-c[1])*1.04] as Point);chosen=chosen.filter(p=>inside(p%W+.5,Math.floor(p/W)+.5,gate));}
  }
  const mask = Buffer.alloc(W * H), paint = Buffer.alloc(W * H), shoePaper = Buffer.alloc(W * H);
  let sx = 0, sy = 0, skinProtectedPixels = 0;
  for (const p of chosen) {
    const j = p * 3, r = raw[j], g = raw[j + 1], b = raw[j + 2];
    // Soft chroma mixture estimate at green boundaries; no inferred hidden paper.
    const a = Math.min(clamp((Math.min(r, b) - 15) / 220), clamp((170 - (g - Math.min(r, b))) / 100));
    mask[p] = Math.round(a * 255); sx += p % W; sy += Math.floor(p / W);
  }
  const fitted=frame>=65?fitVisibleQuad(chosen,mask,quad,protectedSkin):{quad,fitted:false,hidden:false};quad=fitted.quad;
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
  if (frame < 76) reasons.push('Paper shares the shoe mouth; authored lower gate separates target from the next white card.');

  const record: SymmetricP1CardFrame = {
    sourceFrame: frame, side: 'UNKNOWN', authoredDisplaySide: 'SEPARATE_FRONT_AND_SG_BACK_DIAGNOSTICS', quad, sections, authoredSearchQuad, contourQuadFitted:fitted.fitted, hiddenGripCornerInferred:fitted.hidden, visiblePixels: chosen.length,
    centroid: chosen.length ? [sx / chosen.length, sy / chosen.length] : null,
    confidence: { value: chosen.length < 100 ? .05 : Math.min(frame < 76 ? .55 : frame < 194 ? .72 : .9, .45 + .03 * (17 - occluded)), calibratedProbability: false, reasons },
    bounds: { left, top, width: right - left + 1, height: bottom - top + 1 }, edgeTransitionPx, inkBlurSigmaPx: clamp(edgeTransitionPx / 2.563, .4, 2.8), skinProtectedPixels,
    state: frame >= 194 ? 'released' : frame >= 150 ? 'hand-contact' : frame < 76 ? 'shoe-contact' : 'carried',
  };
  const coverage = paperCoverage(raw, mask, protectedSkin, W, H);
  return { record, mask, paint, protectedSkin, shoePaper, coverage: coverage.coverage, coverageDiagnostics: { opaquePixels: coverage.opaquePixels, edgePixels: coverage.edgePixels } };
}


// Shared pure rasterizer; both verified sources have the same native canvas.
export { projectNeutralMesh } from './pamela-neutral-card-track.ts';

