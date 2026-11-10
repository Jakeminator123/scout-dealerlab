import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

type Ref = { path: string; sha256: string };
type Region = { x: number; y: number; width: number; height: number };
type Markers = { area: number; center: [number, number] | null; bounds: [number, number, number, number] | null };
type MarkerColor = 'blue' | 'yellow';

const safeRun = /^runs\/[a-z0-9-]+(?:\/[a-z0-9-]+)+$/;
const safeAsset = /^runs\/[a-z0-9-]+(?:\/[a-z0-9_.-]+)+$/;
const round = (n: number) => Number(n.toFixed(3));
const colorMatch: Record<MarkerColor, (r: number, g: number, b: number) => boolean> = {
  blue: (r, g, b) => b > 50 && b > 1.5 * r && b > 1.15 * g,
  yellow: (r, g, b) => r > 110 && g > 90 && r > 0.88 * g && g > 0.72 * r && b < 0.58 * g,
};

function check(ref: Ref) {
  assert.match(ref.path, safeAsset);
  assert.ok(ref.path.split('/').every(part => part !== '.' && part !== '..'));
  const bytes = readFileSync(ref.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256, ref.path);
  return bytes;
}

function rgbFrames(file: string, region: Region, frames: number) {
  const { x, y, width, height } = region;
  const stride = width * height * 3;
  const bytes = execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-threads', '1', '-filter_threads', '1', '-i', file,
    '-vf', 'crop=' + [width, height, x, y].join(':') + ':exact=1',
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-fps_mode', 'passthrough', 'pipe:1',
  ], { maxBuffer: frames * stride + 65_536, windowsHide: true });
  assert.equal(bytes.length, frames * stride, 'Decoded format or cadence changed');
  return Array.from({ length: frames }, (_, frame) => bytes.subarray(frame * stride, (frame + 1) * stride));
}

function markers(bytes: Buffer, { x, y, width, height }: Region, color: MarkerColor) {
  let left = width, top = height, right = -1, bottom = -1;
  let area = 0, sumX = 0, sumY = 0;
  const mask = new Uint8Array(width * height);
  const matches = colorMatch[color];
  for (let i = 0; i < mask.length; i++) {
    const j = i * 3;
    if (!matches(bytes[j], bytes[j + 1], bytes[j + 2])) continue;
    const col = i % width, row = Math.floor(i / width);
    mask[i] = 1;
    left = Math.min(left, col); right = Math.max(right, col);
    top = Math.min(top, row); bottom = Math.max(bottom, row);
    area++; sumX += col; sumY += row;
  }
  const summary: Markers = area === 0
    ? { area, center: null, bounds: null }
    : { area, center: [round(x + sumX / area), round(y + sumY / area)], bounds: [x + left, y + top, x + right, y + bottom] };
  return { summary, mask };
}

function iou(a: Uint8Array, b: Uint8Array) {
  let union = 0, intersection = 0;
  for (let i = 0; i < a.length; i++) { union += a[i] | b[i]; intersection += a[i] & b[i]; }
  return union ? round(intersection / union) : 0;
}
function distance(a: Markers['center'], b: Markers['center']) {
  return a && b ? round(Math.hypot(a[0] - b[0], a[1] - b[1])) : null;
}

const [run, rawRegion, rawSettle, name = 'markers', color = 'blue', ...extra] = process.argv.slice(2);
assert.ok(run && rawRegion && rawSettle && extra.length === 0, 'Usage: <run> x,y,width,height settledStart,settledEndExclusive [reportName] [blue|yellow]');
assert.ok(color === 'blue' || color === 'yellow', 'Unknown marker color');
assert.match(run, safeRun);
assert.match(name, /^[a-z0-9][a-z0-9-]{0,63}$/);
const state = JSON.parse(readFileSync(run + '/state.json', 'utf8')) as { planSha256: string; output: Ref; nativeVerification: Ref };
assert.equal(state.output.path, run + '/original.mp4');
check(state.output);
const native = JSON.parse(check(state.nativeVerification).toString());
assert.ok(native.passed && native.originalPreserved && native.output.sha256 === state.output.sha256);
const { width: sourceWidth, height: sourceHeight, frames } = native.observed;
const regionParts = rawRegion.split(','), settleParts = rawSettle.split(',');
assert.equal(regionParts.length, 4);
assert.equal(settleParts.length, 2);
assert.ok([...regionParts, ...settleParts].every(part => /^\d+$/.test(part)));
const [x, y, width, height] = regionParts.map(Number);
const [first, end] = settleParts.map(Number);
assert.ok([x, y, width, height, first, end].every(Number.isSafeInteger));
assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= sourceWidth && y + height <= sourceHeight);
assert.ok(first >= 0 && end > first && end <= frames && width * height * frames <= 34_000_000);
const plan = JSON.parse(check({ path: run + '/plan.json', sha256: state.planSha256 }).toString()) as { inputs: (Ref & { position: string })[] };
const endImage = plan.inputs.find(input => input.position === 'last');
assert.ok(endImage);
check(endImage);

const region = { x, y, width, height };
const target = markers(rgbFrames(endImage.path, region, 1)[0], region, color);
assert.ok(target.summary.area, 'No selected marker in the chosen target region');
const decoded = rgbFrames(state.output.path, region, frames).map(frame => markers(frame, region, color));
const anchor = decoded[first];
assert.ok(anchor.summary.area, 'Chosen settled start has no selected marker');
const values = decoded.map(({ summary, mask }, frame) => ({
  frame, ...summary, targetDistance: distance(summary.center, target.summary.center), targetIoU: iou(mask, target.mask),
  driftFromSettledStart: distance(summary.center, anchor.summary.center), iouFromSettledStart: iou(mask, anchor.mask),
}));
const settled = values.slice(first, end);
const drifts = settled.flatMap(row => row.driftFromSettledStart === null ? [] : [row.driftFromSettledStart]);
const summary = {
  first: settled[0], last: settled.at(-1),
  framesWithMarker: settled.filter(row => row.area > 0).length,
  maxSettledDriftPx: drifts.length === settled.length ? Math.max(...drifts) : null,
  minSettledMaskIoU: Math.min(...settled.map(row => row.iouFromSettledStart)),
};
const review = { source: state.output, endImage, region, color, settledRange: [first, end], expectedFootprint: target.summary,
  summary, frames: values, decision: 'Measurement only. Physical side, hand contact and seams require native visual QA.' };
mkdirSync(run + '/review', { recursive: true });
writeFileSync(run + '/review/' + name + '.json', JSON.stringify(review, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary));
