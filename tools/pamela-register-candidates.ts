import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { listMissingClips, validateMotionContract, type MotionAsset, type MotionContract } from '../src/pamela-motion-contract.ts';

// Register the reviewed first-card bank; preserve idle, bridges and second-card references.
// No provider calls or runtime approvals are made by this tool.
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const file = 'references/pamela-motion-contract.json';
const before = await readFile(file, 'utf8');
const contract = JSON.parse(before) as MotionContract;
const initialErrors = validateMotionContract(contract);
if (initialErrors.length) throw Error(initialErrors.join('; '));
const missingBefore = listMissingClips(contract).filter(item => item.reasons.includes('missing-media')).length;
const bankRoot = 'runs/20261109-pamela-seat-bank';
type BankRow = {
  seat: number; state: string; attempt: string; taskId: string;
  output: { path: string; sha256: string; probe: { streams: { width: number; height: number; avg_frame_rate: string; nb_read_frames: string }[]; format: { duration: string } } };
  reviewPath: string; decision: string; productionAccepted: boolean;
};
const indexBytes = await readFile(bankRoot + '/bank-index.json');
const index = JSON.parse(indexBytes.toString()) as { dealerId: string; seats: BankRow[] };
const expectedHashes = [
  '8402ddfcaabf1356b25b28fc8e7e3ca59121260eee6b188b7bfed431b2af9307',
  'dc9e35760fd708a6b7c004e3bc255e9c5e8207aa6ddd5bc274c0e3c62dd3f001',
  '312f8d9b612cf58cf7cf21a26c77b169bb930d00e3348ffe9fa1cdf0dc574eb9',
  '4e252be2235ce42cec5de9d49b993d0ffed1c029de9890faea6686f46824f87c',
  'edd74e2620327c41080d0f1610e2865d0ddfc44bd2b9e7bf56f114a408e26acf',
  'dee43b673dbd3014efdcdccd4b5dbea9a4256a1bc33bf760b554d1fbcfe633bb',
  'b37dbc6cafa99378786eff51ac1e8cb69c3bb01824b2107d390ddd7032a4620e',
];
if (index.dealerId !== contract.dealerId || index.seats.length !== 7 || new Set(index.seats.map(row => row.seat)).size !== 7) throw Error('Bank identity/seat count mismatch');
const changedEndpoints = new Set<string>();
const registered: string[] = [];
for (let seat = 1; seat <= 7; seat++) {
  const row = index.seats.find(item => item.seat === seat);
  const expected = expectedHashes[seat - 1];
  const expectedAttempt = seat === 1 ? 'seat-1-symmetric-v2' : seat === 7 ? 'seat-7-end-card-v3' : `seat-${seat}-end-card-v1`;
  if (!row || row.attempt !== expectedAttempt || row.state !== 'SUCCEEDED' || row.productionAccepted !== false || row.output.sha256 !== expected) throw Error(`Seat${seat} source selection mismatch`);
  if (hash(await readFile(row.output.path)) !== expected) throw Error(`Seat${seat} source bytes changed`);
  const stream = row.output.probe.streams[0];
  if (!stream || stream.width !== 1762 || stream.height !== 1174 || stream.avg_frame_rate !== '30/1' || Number(stream.nb_read_frames) !== 360 || Number(row.output.probe.format.duration) !== 12) throw Error(`Seat${seat} source metadata mismatch`);
  const qaBytes = await readFile(row.reviewPath), qa = JSON.parse(qaBytes.toString());
  if (qa.sourceSha256 !== expected || qa.source !== row.output.path || qa.taskId !== row.taskId || qa.decision !== row.decision || qa.productionAccepted !== false || (qa.rawFullSceneAccepted !== false && !(seat === 1 && qa.rawFullSceneAccepted === undefined))) throw Error(`Seat${seat} review/source mismatch`);
  if (seat === 1 && (qa.decision !== 'usable-symmetric-single-card-motion-candidate' || qa.observations?.release?.conservativeFullyClearFrame !== 194)) throw Error('Symmetric seat1 review mismatch');
  const asset: MotionAsset = {
    id: seat === 1 ? 'seat1-symmetric-v2-raw' : `seat${seat}-end-card-${seat === 7 ? 'v3' : 'v1'}-raw`,
    path: row.output.path, sha256: expected, kind: 'video', width: stream.width, height: stream.height, fps: 30, frames: 360,
    role: seat === 1
      ? 'Green-table symmetric seat1 raw candidate. Clear hand at source194; card persists through359. Authored endpoint geometry, not calibrated physical scale. No runtime approval.'
      : 'Green-table first+authored-card-last raw candidate. Neutral card persists after release; authored geometry is uncalibrated. No runtime approval.',
  };
  const existing = contract.assets.find(item => item.id === asset.id);
  if (existing && (existing.sha256 !== asset.sha256 || existing.path !== asset.path)) throw Error(`Asset identity collision: ${asset.id}`);
  if (!existing) contract.assets.push(asset);
  const clip = contract.clips.find(item => item.id === `deal.seat-${seat}.first`);
  if (!clip) throw Error(`Missing action slot for seat${seat}`);
  const binding = { assetId: asset.id, sha256: expected, startFrame: 0, endFrameExclusive: 360, presentation: 'raw-reference' as const };
  if (JSON.stringify(clip.binding) !== JSON.stringify(binding)) changedEndpoints.add(clip.id);
  clip.binding = binding;
  clip.qa = {
    status: 'pending', evidence: { path: row.reviewPath, sha256: hash(qaBytes) },
    reason: seat === 1
      ? 'Symmetrisk P1-råkandidat. Kontakt kvar190, liten lucka192 och tydligt fri hand194; kortet ligger kvar till359. Författad geometri är inte fysisk skaleacceptans. Kortlager, handmatte och exakta skarvar återstår; ingen runtimeacceptans.'
      : 'Råfilms-QA visar låst kamera, grön yta, release, tom återgång och vitt kort kvar sista60rutorna. Separata lager, kalibrerad geometri och exakt REDO-skarv återstår.' + (seat === 5 ? ' Öppen hand överlappar kortets projektion efter release; handocklusion krävs.' : ''),
  };
  clip.note = seat === 1
    ? '12 s symmetrisk råkandidat med hela0–359 utan tempoklippning. Tidigare P1-assets bevaras som historiska referenser. Anroparen äger kortutseende och redan lagda kort; detta är ingen färdig spelhandling.'
    : '12 s råfilm, kandidatfönster0–359. Författat slutankare behåller ett separat vitt kort; inga produktionsgodkända utbytbara lager. Anroparen äger kortutseende och redan lagda kort.';
  registered.push(clip.id);
}
contract.revision = 'local-candidates-20261109-r4';
const gatesBefore = contract.edgeGates.length;
contract.edgeGates = contract.edgeGates.filter(gate => !changedEndpoints.has(gate.from.nodeId) && !changedEndpoints.has(gate.to.nodeId));
contract.generationPlan.note = 'Första kortet har sju granskade råkandidater med bundna källhashar och heltalsrutor0–359. Plats1 använder den symmetriska v2-kandidaten med fri hand194; äldre P1-assets bevaras. V6:s andra centrala kort behålls som äldre helscenreferens; övriga sex andrakortsbindningar saknas. Lagerseparering och exakta skarvar återstår. Kontraktet startar inga jobb och utökar ingen budget. PresentationTemplateId anger instanser/positioner, inte kortvärden eller spellogik.';
const errors = validateMotionContract(contract);
if (errors.length) throw Error(errors.join('; '));
const missing = listMissingClips(contract), missingMedia = missing.filter(item => item.reasons.includes('missing-media'));
const after = JSON.stringify(contract, null, 2) + '\n';
const receipt = {
  beforeSha256: hash(before), afterSha256: hash(after), bankIndexSha256: hash(indexBytes), registered,
  changedEndpoints: [...changedEndpoints], removedEndpointGates: gatesBefore - contract.edgeGates.length,
  missingMediaBefore: missingBefore, missingMediaAfter: missingMedia.length, missingMediaClipIds: missingMedia.map(item => item.clipId),
  unavailableRuntimeActions: missing.length, runtimeApproved: contract.clips.filter(clip => clip.qa.status === 'approved').length,
};
const dryRun = process.argv.includes('--dry-run');
if (!dryRun && before !== after) {
  const out = 'runs/20261109-pamela-candidate-registration';
  await mkdir(out, { recursive: true });
  const checkpoint = `${out}/contract-${hash(before)}.json`;
  try { await writeFile(checkpoint, before, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (hash(await readFile(checkpoint)) !== hash(before)) throw Error('Checkpoint contents differ');
  }
  if (await readFile(file, 'utf8') !== before) throw Error('Contract changed concurrently; no overwrite');
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, after, { flag: 'wx' });
  await rename(temporary, file);
  await writeFile(out + '/latest.json', JSON.stringify({ ...receipt, checkpoint }, null, 2) + '\n');
}
console.log(JSON.stringify({ dryRun, changed: before !== after, ...receipt }, null, 2));
