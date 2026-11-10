import { SEAT7_SOURCE, type Section, type Point } from './pamela-seat7-card-track.ts';

export const PAIR_PROPOSAL = {
  sourceFrames: [80, 210], startOffsetFrame: 92, endOffsetFrame: 102,
  lowerCardOffsetUv: [-0.13, -0.12] as Point,
  upperInstance: 'P7-C1-8C', lowerInstance: 'P7-C2-KD',
  observedPhysicalSide: 'UNKNOWN', authoredSide: 'FRONT',
  meaning: 'Two cards are authored as aligned from frame80; only the lower card slides in local card coordinates during the thin turn. Not a second deal or an inferred physical event.',
} as const;

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function pairOffset(frame: number): Point {
  const t = clamp((frame - PAIR_PROPOSAL.startOffsetFrame) / (PAIR_PROPOSAL.endOffsetFrame - PAIR_PROPOSAL.startOffsetFrame));
  const s = t * t * (3 - 2 * t);
  return [PAIR_PROPOSAL.lowerCardOffsetUv[0] * s, PAIR_PROPOSAL.lowerCardOffsetUv[1] * s];
}

// Piecewise affine continuation of the observed source strips. Outside v=0..1,
// only the first/last strip is extrapolated; this hidden geometry is authored.
export function stripPoint(sections: Section[], u: number, v: number): Point {
  const k = clamp(Math.floor(v * (sections.length - 1)), 0, sections.length - 2);
  const a = sections[k], b = sections[k + 1], t = (v - a.v) / (b.v - a.v);
  const l: Point = [a.left[0] + t * (b.left[0] - a.left[0]), a.left[1] + t * (b.left[1] - a.left[1])];
  const r: Point = [a.right[0] + t * (b.right[0] - a.right[0]), a.right[1] + t * (b.right[1] - a.right[1])];
  return [l[0] + u * (r[0] - l[0]), l[1] + u * (r[1] - l[1])];
}
export function lowerSections(sections: Section[], frame: number): Section[] {
  const [du, dv] = pairOffset(frame);
  return sections.map(s => ({ v: s.v, left: stripPoint(sections, du, s.v + dv), right: stripPoint(sections, 1 + du, s.v + dv), observedEdges: false }));
}

// Deliberately conservative: new paper may cover only observed green or dark
// neutral background. All other pixels, including skin, are kept exactly.
// This is a local appearance gate, not a complete anatomical hand matte.
export function pairForegroundGuard(raw: Buffer, originalMask: Buffer, frozenSkin: Buffer, bounds: { left: number; top: number; right: number; bottom: number }) {
  const W = SEAT7_SOURCE.width, H = SEAT7_SOURCE.height, guard = Buffer.alloc(W * H), skin = Buffer.alloc(W * H);
  for (let y = bounds.top; y <= bounds.bottom; y++) for (let x = bounds.left; x <= bounds.right; x++) {
    const p = y * W + x, j = p * 3, r = raw[j], g = raw[j + 1], b = raw[j + 2];
    const warm = r > 65 && r - g > 8 && r - b > 12;
    if (frozenSkin[p] || warm) skin[p] = 255;
    const green = g > 65 && g > r * 1.25 && g > b * 1.16;
    const charcoal = Math.max(r, g, b) < 118 && Math.max(r, g, b) - Math.min(r, g, b) < 27;
    if (!originalMask[p] && (!green && !charcoal || warm)) guard[p] = 255;
  }
  // Protect the one-pixel mixed skin boundary as well as opaque fingers.
  for (let y = bounds.top + 1; y < bounds.bottom; y++) for (let x = bounds.left + 1; x < bounds.right; x++) {
    const p = y * W + x;
    if (skin[p] || skin[p - 1] || skin[p + 1] || skin[p - W] || skin[p + W]) guard[p] = 255;
  }
  return { guard, skin };
}
