import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const run = 'runs/20261109-pamela-sequence';
const first = 'runs/20261109-pamela-reference-kit/original/pamela-redo-station.png';
const last = `${run}/original/pamela-redo-after-central.png`;
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const aBytes = await readFile(first), bBytes = await readFile(last);
const aMeta = await sharp(aBytes).metadata(), bMeta = await sharp(bBytes).metadata();
if (aMeta.width !== 1536 || aMeta.height !== 1024 || bMeta.width !== 1536 || bMeta.height !== 1024) throw Error('Unexpected source geometry');
const a = await sharp(aBytes).removeAlpha().raw().toBuffer(), b = await sharp(bBytes).removeAlpha().raw().toBuffer();
const regions = [{ id: 'face', x: 620, y: 70, w: 220, h: 250 }, { id: 'body-hands-shoe', x: 450, y: 330, w: 1030, h: 470 }];
const differences = regions.map(r => { let sum = 0; for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)for(let c=0;c<3;c++)sum+=Math.abs(a[(y*1536+x)*3+c]-b[(y*1536+x)*3+c]); return {...r, meanAbsoluteRgbDifference: sum/(r.w*r.h*3)}; });
let minX=1536,minY=1024,maxX=-1,maxY=-1,count=0;
for(let y=850;y<1000;y++)for(let x=650;x<900;x++){const i=(y*1536+x)*3;if(b[i]>210&&b[i+1]>210&&b[i+2]>210){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}}
if(count<1000)throw Error('No usable white landing card region found');
const prompt = 'Locked camera, one continuous six-second shot between the exact supplied REDO anchors. Preserve Pamela\'s mature identity, face, age, hair, black blazer, ivory blouse, body scale, the green studio and the black shoe in their exact positions. Start with her left hand (camera-right) touching the plain white card at the shoe outlet. Hold briefly. She smoothly draws exactly one rigid plain white unprinted card out of that actual outlet, brings it to her right hand near the middle, then her right hand makes one low controlled forward dealing action to the empty central foreground, directly below her resting-hand area. Place that same card flat exactly where it lies in the last image. It must remain a rigid perspective rectangle with its thin warm edge, with no rank, suit or symbol. Her fingertips visibly contact it until placement, then release it cleanly. The card stays stationary on the green surface for the rest of the shot. No appearing card, no fading, no card passing through fingers or the shoe. By 5.4 seconds her right hand returns to its original resting position and her left hand returns to the shoe outlet where the next card is seated, matching the last REDO pose and downward gaze. Exactly one new card remains on the table, and the shoe has the next card ready. Do not remove the landed card to match the hand pose. Preserve all fingers and complete arms inside the original frame throughout the full reach. No camera move, zoom, cuts, new table edge, torso drift or changed face. Settle naturally for the final half second.';
const contract = {
  schemaVersion: 1, createdAt: new Date().toISOString(), first: { path: first, sha256: hash(aBytes) }, last: { path: last, sha256: hash(bBytes) }, source: { width: 1536, height: 1024 },
  prompt, handPoseBefore: 'REDO', handPoseAfter: 'REDO', cardStateBefore: { tableCardCount: 0, description: 'One card seated at shoe outlet, no landed tabletop card.' }, cardStateAfter: { tableCardCount: 1, description: 'One landed central card remains; the next card is seated at the shoe outlet. Same hand pose does not mean identical whole scene.' },
  mainSlot: 'deal.player.centre/box3', takeKey: '4:base', measurementStatus: 'proposed', accepted: false,
  proposedLandingQuadSourcePx: [[713,882],[823,882],[833,948],[703,948]],
  generatedEndAnchor: { provider: 'built-in image_gen', exactModel: null, costUsd: null, promptPath: `${run}/central-end-anchor-prompt.txt`, whiteRegionBounds: { minX,minY,maxX,maxY,thresholdWhitePixels:count,method:'RGB>210 in bounded foreground ROI; bbox is not a four-corner track' }, differences, inspected: 'Whole original inspected: same REDO composition and an additional flat blank card. Difference statistics are not identity or pose acceptance.' },
  geometryBoundary: 'This requested target and edited still do not measure generated motion. New full-resolution card corners, contact times and hand masks must come from the resulting film. No Astrid tracks.',
};
await writeFile(`${run}/central-input-contract.json`, JSON.stringify(contract,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({inputHashes:[contract.first.sha256,contract.last.sha256],differences,cardBounds:contract.generatedEndAnchor.whiteRegionBounds}));
