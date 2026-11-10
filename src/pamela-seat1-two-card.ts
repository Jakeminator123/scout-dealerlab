import { NEUTRAL_CARD_SOURCE, type Point, type Quad } from './pamela-neutral-card-track.ts';

export const TWO_CARD_PROOF = {
  source: NEUTRAL_CARD_SOURCE,
  originalTrack: 'runs/20261109-pamela-neutral-card-track/tracking.json',
  firstSourceFrame: 140,
  lastSourceFrame: 185,
  firstCardFrame: 172,
  offsetWindow: [162, 166] as const,
  secondCardOffsetNative: [18, -6] as Point,
  observedPhysicalSide: 'UNKNOWN',
  authoredDisplaySide: 'FRONT_DEMONSTRATION_ONLY',
  hiddenShiftSupported: false,
  productionAccepted: false,
} as const;

export const C2_PILOT_ANCHOR = {
  basePath: 'runs/20261109-pamela-reference-kit/original/pamela-redo-station.png',
  baseSha256: 'a9dd4882d84da1cc6f0fb3258d0fbd6d81fddac5a7f78efdaa225d6f9538576d',
  width: 1536, height: 1024,
  neutralLayerPath: 'runs/20261109-pamela-neutral-card-track/layers/landed-canonical-neutral.png',
  neutralLayerSha256: '069d4bd699ee4aed44be186c0c894004252f0e38a91ab9e3cb75d08df5e43198',
  sourceMaskPath: 'runs/20261109-pamela-neutral-card-track/masks/frame-0172.png',
  sourceMaskSha256: 'e613f0ad3e1e90ec93a219f43c6e02f3caf1812b19dfbc901ebe113832c6f9ec',
  secondOffsetNative: [18, -6] as Point,
} as const;

export function secondCardOffset(frame: number): Point {
  const [start, end] = TWO_CARD_PROOF.offsetWindow;
  const t = Math.max(0, Math.min(1, (frame - start) / (end - start)));
  const eased = t * t * (3 - 2 * t);
  return [TWO_CARD_PROOF.secondCardOffsetNative[0] * eased, TWO_CARD_PROOF.secondCardOffsetNative[1] * eased];
}

export function polygonArea(points: Quad) {
  return Math.abs(points.reduce((s, p, i) => {
    const q = points[(i + 1) % points.length];
    return s + p[0] * q[1] - q[0] * p[1];
  }, 0)) / 2;
}

/** Card-only translation with premultiplied bilinear sampling. */
export function compositeCard(output: Buffer, rgba: Buffer, offset: Point, width: number, height: number, roi = [100, 820, 390, 190]) {
  const [dx, dy] = offset;
  for (let y = roi[1]; y < Math.min(height, roi[1] + roi[3]); y++) for (let x = roi[0]; x < Math.min(width, roi[0] + roi[2]); x++) {
    const sx = x - dx, sy = y - dy, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let alpha = 0;
    const rgb = [0, 0, 0];
    for (const [ox, oy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const xx = x0 + ox, yy = y0 + oy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const j = (yy * width + xx) * 4, a = rgba[j + 3] / 255 * weight;
      alpha += a;
      for (let c = 0; c < 3; c++) rgb[c] += rgba[j + c] * a;
    }
    if (!alpha) continue;
    const j = (y * width + x) * 3;
    for (let c = 0; c < 3; c++) output[j + c] = Math.round(rgb[c] + output[j + c] * (1 - alpha));
  }
}
