import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const run = 'runs/20261109-pamela-reference-kit';
const kit = JSON.parse(await readFile(`${run}/reference-kit.json`, 'utf8'));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
if (hash(await readFile(kit.clip.path)) !== kit.clip.sha256) throw Error('Film bytes changed; repeat frame extraction and QA.');
const regions = [
  { name: 'face', left: 620, top: 70, width: 220, height: 250 },
  { name: 'hands-and-shoe', left: 520, top: 540, width: 980, height: 300 },
];
const endpointDifferences = [];
for (const [index, frame] of [[0, 'selected-01.png'], [1, 'selected-04.png']] as const) {
  const anchor = kit.anchors[index];
  if (hash(await readFile(anchor.path)) !== anchor.sha256) throw Error('Anchor changed');
  const a = await sharp(anchor.path).removeAlpha().raw().toBuffer();
  // Measurement only: map the decoded native frame back to the 1536x1024 source plane.
  const b = await sharp(`${run}/qa/${frame}`).resize(1536, 1024, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const measurements = regions.map(region => {
    let absoluteDifference = 0;
    for (let y = region.top; y < region.top + region.height; y++) {
      for (let x = region.left; x < region.left + region.width; x++) {
        const p = (y * 1536 + x) * 3;
        for (let c = 0; c < 3; c++) absoluteDifference += Math.abs(a[p + c] - b[p + c]);
      }
    }
    return { ...region, meanAbsoluteRgbDifference: absoluteDifference / (region.width * region.height * 3) };
  });
  endpointDifferences.push({ pose: anchor.id, anchorSha256: anchor.sha256, decodedFrame: index ? 89 : 0, measurements });
}
const result = {
  schemaVersion: 1, checkedAt: new Date().toISOString(), film: kit.clip,
  decision: 'candidate-for-to-shoe-review-not-production-accepted',
  mainSlot: 'transition.shoe/to-shoe',
  intendedEndpoints: { start: 'VILA', end: 'REDO', samePoseRequired: false, loop: false },
  review: {
    contactSheet: { path: `${run}/qa/all-90-frames.jpg`, frames: 90, scale: 'overview; not full-resolution anatomy acceptance' },
    originalFramesInspected: [0, 30, 60, 89],
    observations: [
      'Head turns toward the shoe; the camera-right hand reaches its outlet and touches the blank card.',
      'Both hands and elbows remain within the displayed frame in the 90-frame overview; inspected originals show no crop.',
      'The card remains seated. Actual extraction, landing and release have not been demonstrated.',
      'The green workstation plate cuts the lower torso at an implied tabletop. A replaceable-table composition is not accepted.',
    ],
    stillUnknown: [
      'Stable joins to a future REDO idle, central deal and return-to-VILA film.',
      'Full arm reach to central and outer seats; exact fingertip/card geometry and hand masking.',
      'Identity acceptance against the user-selected v5 body image throughout all frames.',
    ],
  },
  endpointDifferences,
  measurementLimit: 'RGB difference measures changed pixels after frame scaling, not a pose/identity score. No acceptance threshold is invented. No endpoint is replaced or frozen to hide drift.',
};
await writeFile(`${run}/qa/decision.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sha256: kit.clip.sha256, endpointDifferences, accepted: false }));
