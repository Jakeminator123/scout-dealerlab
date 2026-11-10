import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const exec = promisify(execFile);
const run = 'runs/20261108-pamela-contact-round2';
const parent = JSON.parse(await readFile('runs/20261108-pamela-deal-pilot/composite/layered-scene.json', 'utf8'));
const role = (name: string): string => parent.sources.find((s: { role: string }) => s.role === name).path;
const hash = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
for (const source of parent.sources) if (await hash(source.path) !== source.sha256) throw Error('Source changed; calibration must be repeated.');
await mkdir(`${run}/composite`, { recursive: true });
await mkdir(`${run}/qa`, { recursive: true });

// Measure the green termination of the central torso on every source frame.
// This narrow diagnostic is not a full body/hand segmentation or visual acceptance.
const raw = (await exec('ffmpeg', ['-v', 'error', '-nostdin', '-i', role('dealer'), '-vf', 'crop=80:200:500:640', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '4', 'pipe:1'], { encoding: 'buffer', windowsHide: true, maxBuffer: 10000000 })).stdout;
if (raw.length !== 63 * 80 * 200 * 3) throw Error('Unexpected source frame count.');
const cuts: { frame: number; sourceCutY: number }[] = [];
for (let f = 0; f < 63; f++) {
  let greenRows = 0, cut = -1;
  for (let y = 0; y < 200; y++) {
    let green = 0;
    for (let x = 0; x < 80; x++) {
      const p = ((f * 200 + y) * 80 + x) * 3;
      if (raw[p + 1] > 90 && raw[p + 1] > raw[p] * 1.35 && raw[p + 1] > raw[p + 2] * 1.35) green++;
    }
    greenRows = green >= 68 ? greenRows + 1 : 0;
    if (greenRows === 3) { cut = y - 2 + 640; break; }
  }
  if (cut < 0) throw Error('Central torso termination could not be measured.');
  cuts.push({ frame: f, sourceCutY: cut });
}
const table = await sharp(role('table')).resize(1920, 870).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let tableStart = 0;
while (tableStart < 870 && table.data[(tableStart * 1920 + 960) * 4 + 3] < 245) tableStart++;
const tableEdgeY = tableStart + 285;
const oldCutMin = Math.min(...cuts.map(c => c.sourceCutY * .6 - 8));
// One shared translation preserves all existing hand/card/shoe relative positions.
// A 2 px overlap with the measured rear edge prevents a room-colored strip here.
const shiftY = Math.ceil(tableEdgeY - oldCutMin + 2);
if (shiftY < 0 || shiftY > 60) throw Error('Unexpected fit; inspect geometry before rendering.');
const framePaths = Array.from({ length: 123 }, (_, n) => `.runtime/pamela-card-frames/${String(n).padStart(4, '0')}.png`);
const cardFrameHashes = [];
for (const file of framePaths) cardFrameHashes.push(await hash(file));

const variants: { name: string; room: string; table: string }[] = [
  { name: 'pamela-contact-fit', room: '', table: '' },
  { name: 'pamela-contact-fit-dim', room: ',colorchannelmixer=rr=0.66:gg=0.66:bb=0.72', table: ',colorchannelmixer=rr=0.58:gg=0.62:bb=0.70' },
];
const outputs = [];
for (const variant of variants) {
  const filter = [
    `[0:v]v360=input=equirect:output=flat:yaw=0:pitch=0:h_fov=97.1:v_fov=65:w=1920:h=1080,setsar=1${variant.room}[room]`,
    `[1:v]scale=1920:870:flags=lanczos,format=rgba${variant.table}[table]`,
    '[room][table]overlay=0:285:shortest=1[stage]',
    `[stage][4:v]overlay=0:${shiftY}:shortest=1[cardstage]`,
    '[2:v]scale=288:160:flags=lanczos,format=rgba[shoe]',
    `[cardstage][shoe]overlay=1061:${355 + shiftY}:shortest=1[furniture]`,
    '[3:v]format=rgba,colorkey=0x00cc33:0.29:0.08,scale=648:1152:flags=lanczos,tpad=start_duration=1.25:stop_duration=1.25:start_mode=clone:stop_mode=clone[dealer]',
    `[furniture][dealer]overlay=636:${-8 + shiftY}:shortest=1,format=yuv420p[out]`,
  ].join(';');
  const output = `${run}/composite/${variant.name}.mp4`;
  const exists = await access(output).then(() => true, () => false);
  if (exists && !process.argv.includes('--resume')) throw Error('Output exists; inspect before explicitly resuming.');
  if (exists) {
    const receipt = JSON.parse(await readFile(output + '.render.json', 'utf8'));
    if (receipt.filter !== filter || receipt.sha256 !== await hash(output)) throw Error('Cannot resume: render evidence changed.');
  }
  if (!exists) await exec('ffmpeg', ['-v', 'error', '-nostdin', '-filter_complex_threads', '4', '-loop', '1', '-framerate', '24', '-i', role('room'), '-loop', '1', '-framerate', '24', '-i', role('table'), '-loop', '1', '-framerate', '24', '-i', role('shoe'), '-i', role('dealer'), '-framerate', '24', '-i', '.runtime/pamela-card-frames/%04d.png', '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-threads', '4', '-movflags', '+faststart', '-t', '5.125', '-n', output], { windowsHide: true, maxBuffer: 3000 });
  const probe = JSON.parse((await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration', '-of', 'json', output], { windowsHide: true })).stdout).streams[0];
  if (!exists) await writeFile(output + '.render.json', JSON.stringify({ filter, sha256: await hash(output) }, null, 2));
  outputs.push({ path: output, sha256: await hash(output), ...probe, filter, changes: variant.name.endsWith('-dim') ? ['shared layer translation', 'room and table brightness only; dealer unchanged'] : ['shared layer translation only'] });
  if (probe.nb_frames !== '123' || probe.r_frame_rate !== '24/1' || probe.width !== 1920 || probe.height !== 1080) throw Error('Unexpected rendered format.');
  if (!await access(`${run}/qa/${variant.name}-01.png`).then(() => true, () => false)) await exec('ffmpeg', ['-v', 'error', '-nostdin', '-i', output, '-vf', "select='eq(n,66)+eq(n,80)'", '-fps_mode', 'passthrough', '-frames:v', '2', '-threads', '4', '-n', `${run}/qa/${variant.name}-%02d.png`], { windowsHide: true });
}
const result = {
  schemaVersion: 1, sourceRound: 'public-review-20261108205515', createdAt: new Date().toISOString(),
  status: 'geometry-fit-candidate-not-full-contact-approval', sources: parent.sources,
  previousScene: parent.output, outputs, sourceFrames: 63, outputFrames: 123, fps: 24,
  change: { sharedTranslation: { x: 0, y: shiftY }, appliedTo: ['dealer', 'shoe', 'card'], tableUnchanged: true, handCardShoeRelativeGeometryUnchanged: true },
  centralTorsoDiagnostic: { region: { x: 500, y: 640, width: 80, height: 200 }, tableEdgeY, oldCutMin, newCutMin: oldCutMin + shiftY, minimumCentralOverlapPixels: oldCutMin + shiftY - tableEdgeY, frames: cuts, limitation: 'Central strip only. Does not prove full-body coverage, physically correct pose, hand contact or perspective.' },
  reusedCardFrames: { sourceVideoSha256: parent.card.sourceVideoSha256, count: 123, sequenceSha256: createHash('sha256').update(cardFrameHashes.join('\n')).digest('hex') },
  generation: { newPaidJobs: 0, additionalRunwayCredits: 0, additionalOpenAiUsd: 0 },
  remaining: ['Flat missing torso is retained in original; fit relies on this table rear edge.', 'Card perspective, shoe outlet and release are still provisional; relative errors are unchanged.', 'No new full body mask or calibrated hand occlusion.', 'Dim variant is a separate look test, not a geometry improvement.', 'Idle endpoints are held frames, not a breathing loop.'],
};
await writeFile(`${run}/contact-fit.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ shiftY, oldCutMin, tableEdgeY, outputs: outputs.map(({ path, sha256, nb_frames }) => ({ path, sha256, nb_frames })) }));
