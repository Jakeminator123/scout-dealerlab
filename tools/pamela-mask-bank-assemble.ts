/** Assemble two reviewed mask corrections into the frozen fourteen-slot bank.
 * Run only after the two corrected clips have passed the caller's native QA.
 * node tools/pamela-mask-bank-assemble.ts --patch=runs/.../evidence.json --patch-sha256=<sha>
 *   --patch-check=runs/.../qa/integration-check.json --patch-check-sha256=<sha>
 * No rendering of the other twelve clips, provider calls, deployment, or source changes.
 * All ffmpeg/ffprobe processes are sequential; failed unique runs remain for diagnosis.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

type Ref = { path: string; sha256: string };
type Probe = { streams: Array<{ width: number; height: number; avg_frame_rate: string; nb_read_frames: string;
  codec_type?: string; codec_name?: string; pix_fmt?: string }>; format: { duration: string } };
type Movie = Ref & { probe: Probe };
type Selection = { id: string; evidence: Ref; review: Ref; [key: string]: unknown };
type Frame = { frame: number; sourceRgbSha256: string; outputRgbSha256: string; sourceRgbEqual?: boolean;
  changedOutsidePaperPixels: number; changedPriorCorePixels?: number; priorCoreChanges?: number;
  unchangedFromR16?: boolean; [key: string]: unknown };
type Part = { id: string; selection: Selection; source: Ref; prior: Array<Ref & { id: string }>;
  output: Movie; records: Frame[]; [key: string]: unknown };
type Binding = Ref & { id: string; output: Movie };
type Plan = { project: string; dealerId: string; run: string; presentationOnly: boolean; productionAccepted: boolean;
  width: number; height: number; fps: number; selections: Selection[]; code: Ref[]; registry: Ref;
  trim: Ref; firstPlan: Ref; secondPlan: Ref; engineFixture: unknown; renderDesign: string; limitations: string[];
  [key: string]: unknown };
type Outer = { id: string; output: Movie; records: unknown[]; [key: string]: unknown };
type Bank = { status: string; plan: Ref; code: Ref[]; parts: Binding[]; outer: Outer[];
  landed: Array<Ref & { id: string }>; full: Movie; compact: Movie; design: unknown; engineFixture: unknown;
  verification: Record<string, number>; limitations: string[]; productionAccepted: boolean; newApiJobs: number;
  [key: string]: unknown };
type PatchPart = { id: string; source: Ref; previousMovie: Ref; output: Ref; probe: Probe; frames: number;
  records: Frame[]; unchangedFrames: number; [key: string]: unknown };
type Patch = { status: string; base: Ref; basePlan: Ref; refinement: Ref; code: Ref[]; design: string;
  engineFixture: unknown; parts: PatchPart[]; width: number; height: number; fps: number; sourceFrames: number;
  priorCardCoreChanges: number; productionAccepted: boolean; publicDeploymentChanged: boolean; newApiJobs: number };
type Interval = { id: string; startInclusive: number; endExclusive: number; sourceSha256: string };
type Segment = { id: string; output: Movie; patched: boolean };
type Span = { id: string; startInclusive: number; endExclusive: number; patched: boolean; movie: Movie };
type Decoded = { movie: Ref; frameMd5: Ref; frames: number; hashes: string[] };
const RUN = 'runs/20261110-pamela-mask-bank/take-01';
const BASE: Ref = { path: 'runs/20261110-pamela-two-sided-bank/take-02/evidence.json',
  sha256: 'fd9cd8078f35d52fbe1932cb484c0ebd60db60cf5e4a0ef1716237598867fd82' };
const PATCH_IDS = ['C1-P7', 'C2-P6'];
const IDS = [1, 2].flatMap(pass => [1, 2, 3, 4, 5, 6, 7].map(seat => `C${pass}-P${seat}`));
const execute = promisify(execFile);
const ROOT = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const digest = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const relative = (value: string) => path.relative(ROOT, value).replaceAll('\\', '/');
const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const checkedRefs = new Map<string, Ref>();

function local(value: string): string {
  const absolute = path.resolve(ROOT, value), rel = relative(absolute);
  assert.ok(rel && !rel.startsWith('../') && !path.isAbsolute(rel), 'Path must remain in this checkout');
  assert.ok(!rel.split('/').some(piece => piece === 'private' || piece.startsWith('.env')), 'Private input forbidden');
  return absolute;
}
async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(local(file))) hash.update(chunk);
  return hash.digest('hex');
}
async function ref(file: string): Promise<Ref> { return { path: relative(local(file)), sha256: await hashFile(file) }; }
async function checked(binding: Ref): Promise<string> {
  assert.match(binding.sha256, /^[a-f0-9]{64}$/); const file = local(binding.path);
  assert.ok(same(file, await realpath(file)), 'Symlinks and junctions are not accepted');
  assert.equal(await hashFile(file), binding.sha256, `Changed input: ${binding.path}`);
  const previous = checkedRefs.get(relative(file));
  assert.ok(!previous || previous.sha256 === binding.sha256, `Conflicting input bindings: ${binding.path}`);
  checkedRefs.set(relative(file), { path: relative(file), sha256: binding.sha256 });
  return file;
}
async function checkedJson<T>(binding: Ref): Promise<T> {
  const bytes = await readFile(await checked(binding));
  assert.equal(digest(bytes), binding.sha256); return JSON.parse(bytes.toString('utf8')) as T;
}
async function save(file: string, value: unknown): Promise<Ref> {
  await writeFile(local(file), json(value), { flag: 'wx' }); return ref(file);
}
async function copy(binding: Ref, output: string): Promise<Ref> {
  await copyFile(await checked(binding), local(output), constants.COPYFILE_EXCL);
  const copied = await ref(output); assert.equal(copied.sha256, binding.sha256); return copied;
}
function checkProbe(probe: Probe, frames: number): void {
  assert.equal(probe.streams.length, 1);
  const stream = probe.streams[0]; assert.equal(stream.width, 1762); assert.equal(stream.height, 1174);
  assert.equal(stream.avg_frame_rate, '30/1'); assert.equal(Number(stream.nb_read_frames), frames);
  assert.ok(Math.abs(Number(probe.format.duration) - frames / 30) < .001, 'Noncanonical duration');
}
async function inspect(file: string, frames: number): Promise<Movie> {
  const { stdout } = await execute('ffprobe', ['-v', 'error', '-threads', '1', '-count_frames',
    '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', local(file)], { windowsHide: true, maxBuffer: 1024 * 1024 });
  const probe = JSON.parse(stdout) as Probe; checkProbe(probe, frames);
  assert.equal(probe.streams[0].codec_type, 'video'); assert.equal(probe.streams[0].codec_name, 'h264');
  assert.equal(probe.streams[0].pix_fmt, 'yuv420p'); return { ...await ref(file), probe };
}
function spans(segments: Segment[], frames: number): Span[] {
  let offset = 0;
  const result = segments.map(segment => {
    const count = Number(segment.output.probe.streams[0].nb_read_frames); checkProbe(segment.output.probe, count);
    assert.ok(Number.isSafeInteger(count) && count > 0);
    const span = { id: segment.id, startInclusive: offset, endExclusive: offset + count,
      patched: segment.patched, movie: segment.output }; offset += count; return span;
  });
  assert.equal(offset, frames); return result;
}
async function concat(name: string, segments: Segment[], count: number): Promise<{ output: Movie; spans: Span[]; list: Ref }> {
  const timeline = spans(segments, count), file = `${RUN}/render/${name}.mp4`, list = `${RUN}/render/${name}.ffconcat`;
  const lines = timeline.map(segment => `file '${local(segment.movie.path).replaceAll('\\', '/').replaceAll("'", "'\\''")}'\nduration ${((segment.endExclusive - segment.startInclusive) / 30).toFixed(9)}`);
  await writeFile(local(list), 'ffconcat version 1.0\n' + lines.join('\n') + '\n', { flag: 'wx' });
  await execute('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-threads', '1', '-f', 'concat', '-safe', '0', '-i', local(list),
    '-c', 'copy', '-movflags', '+faststart', local(file)], { windowsHide: true });
  return { output: await inspect(file, count), spans: timeline, list: await ref(list) };
}
async function decoded(movie: Ref, name: string, frames: number): Promise<Decoded> {
  await checked(movie);
  const { stdout } = await execute('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', local(movie.path),
    '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-threads', '1', '-f', 'framemd5', '-'],
  { windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  const rows = stdout.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  const hashes = rows.map(line => { const hash = line.split(',').at(-1)!.trim(); assert.match(hash, /^[a-f0-9]{32}$/); return hash; });
  assert.equal(hashes.length, frames, `Decoded frame count: ${name}`);
  const file = `${RUN}/qa/${name}.framemd5`; await writeFile(local(file), stdout, { flag: 'wx' });
  console.log(JSON.stringify({ decoded: name, frames }));
  return { movie, frameMd5: await ref(file), frames, hashes };
}
async function compare(name: string, before: Decoded, after: Decoded, timeline: Span[]): Promise<Ref> {
  assert.equal(before.frames, after.frames);
  const records = after.hashes.map((hash, frame) => {
    const segment = timeline.find(item => frame >= item.startInclusive && frame < item.endExclusive); assert.ok(segment);
    const equal = hash === before.hashes[frame];
    if (!segment.patched) assert.equal(equal, true, `${name} changed nonpatch frame ${frame} (${segment.id})`);
    return { frame, id: segment.id, withinReplacementInterval: segment.patched,
      baseDecodedMd5: before.hashes[frame], outputDecodedMd5: hash, equal };
  });
  const insertionChecks = [];
  for (const segment of timeline.filter(item => item.patched)) {
    const source = await decoded(segment.movie, `${name}-${segment.id}-insertion`, segment.endExclusive - segment.startInclusive);
    assert.deepEqual(after.hashes.slice(segment.startInclusive, segment.endExclusive), source.hashes,
      `Decoded replacement insertion changed: ${name}/${segment.id}`);
    insertionChecks.push({ id: segment.id, source: source.movie, sourceFrameMd5: source.frameMd5,
      startInclusive: segment.startInclusive, endExclusive: segment.endExclusive, equalFrames: source.frames });
  }
  return save(`${RUN}/qa/${name}-comparison.json`, { method: 'decoded-yuv420p-framemd5-all-frames',
    baseMovie: before.movie, outputMovie: after.movie, baseFrameMd5: before.frameMd5, outputFrameMd5: after.frameMd5,
    frames: after.frames, comparedOutsideReplacementIntervals: records.filter(record => !record.withinReplacementInterval).length,
    changedOutsideReplacementIntervals: 0, changedWithinReplacementIntervals: records.filter(record => !record.equal).length,
    replacementInsertions: insertionChecks, records });
}

async function main(): Promise<void> {
  assert.equal(process.version, 'v24.21.0'); assert.ok(same(await realpath(process.cwd()), ROOT));
  const args = new Map<string, string>();
  for (const value of process.argv.slice(2)) {
    const match = /^(--patch|--patch-sha256|--patch-check|--patch-check-sha256)=(.+)$/.exec(value);
    assert.ok(match, 'Explicit patch and patch-check paths and SHA256 values are required');
    assert.ok(!args.has(match[1])); args.set(match[1], match[2]);
  }
  assert.equal(args.size, 4);
  const patchRef = { path: args.get('--patch')!, sha256: args.get('--patch-sha256')! };
  const patchCheckRef = { path: args.get('--patch-check')!, sha256: args.get('--patch-check-sha256')! };
  assert.match(patchRef.path, /^runs\/20261110-pamela-bank-mask-integration\/take-\d{2}\/evidence\.json$/);
  assert.equal(patchCheckRef.path, path.posix.join(path.posix.dirname(patchRef.path), 'qa/integration-check.json'));
  await assert.rejects(lstat(local(RUN)), { code: 'ENOENT' }, 'Unique output run already exists');
  const base = await checkedJson<Bank>(BASE), basePlan = await checkedJson<Plan>(base.plan), patch = await checkedJson<Patch>(patchRef);
  const patchCheck = await checkedJson<{ render: Ref; sourceFrames: number; protectedPixelChanges: number;
    priorCardCoreChanges: number; changesOutsideCalibratedIntervals: number; framesWithoutMaskChangeRemainByteIdentical: boolean;
    parts: Array<{ id: string; changedFrames: number[]; unchangedFrames: number }> }>(patchCheckRef);
  assert.deepEqual(patchCheck.render, patchRef); assert.equal(patchCheck.sourceFrames, 720);
  assert.equal(patchCheck.protectedPixelChanges, 0); assert.equal(patchCheck.priorCardCoreChanges, 0);
  assert.equal(patchCheck.changesOutsideCalibratedIntervals, 0); assert.equal(patchCheck.framesWithoutMaskChangeRemainByteIdentical, true);
  assert.deepEqual(patchCheck.parts.map(part => part.id), PATCH_IDS);
  assert.equal(base.status, 'two-sided-fourteen-slot-integration-awaiting-native-review');
  assert.equal(patch.status, 'two-corrected-full-clips-awaiting-native-review');
  assert.deepEqual(patch.base, BASE); assert.deepEqual(patch.basePlan, base.plan);
  assert.deepEqual(patch.parts.map(part => part.id), PATCH_IDS); assert.equal(patch.sourceFrames, 720);
  assert.equal(patch.priorCardCoreChanges, 0); assert.equal(patch.productionAccepted, false);
  assert.equal(patch.publicDeploymentChanged, false); assert.equal(patch.newApiJobs, 0);
  assert.equal(patch.width, 1762); assert.equal(patch.height, 1174); assert.equal(patch.fps, 30);
  assert.equal(basePlan.project, 'snyggare-dealer'); assert.equal(basePlan.dealerId, 'pamela');
  assert.equal(basePlan.presentationOnly, true); assert.equal(basePlan.productionAccepted, false);
  assert.equal(base.productionAccepted, false); assert.equal(base.newApiJobs, 0);
  assert.equal(basePlan.width, 1762); assert.equal(basePlan.height, 1174); assert.equal(basePlan.fps, 30);
  assert.equal(patch.design, basePlan.renderDesign); assert.deepEqual(patch.engineFixture, basePlan.engineFixture);
  assert.deepEqual(base.engineFixture, basePlan.engineFixture);
  assert.deepEqual(base.parts.map(part => part.id), IDS); assert.deepEqual(basePlan.selections.map(selection => selection.id), IDS);
  for (const [key, value] of Object.entries({ sourceRgbEqualFrames: 5040, printedOutsidePaperChanges: 0,
    priorCardCoreChanges: 0, distinctMaterials: 14, fullFrames: 5486, trimmedFrames: 4404 })) assert.equal(base.verification[key], value);
  const refinement = await checkedJson<{ code: Ref[] }>(patch.refinement);
  assert.ok(refinement.code.some(item => item.path === 'src/pamela-bank-mask-refinements.ts'));
  const trim = await checkedJson<{ outputFrames: number; intervals: Interval[] }>(basePlan.trim);
  assert.equal(trim.outputFrames, 4404); assert.deepEqual(trim.intervals.map(interval => interval.id), IDS);
  await checked(base.full); await checked(base.compact); checkProbe(base.full.probe, 5486); checkProbe(base.compact.probe, 4404);
  for (const layer of base.landed) await checked(layer);
  assert.deepEqual(base.landed.map(layer => layer.id), IDS);
  assert.deepEqual(base.outer.map(segment => segment.id), ['opening-vila', 'to-redo', 'to-vila', 'closing-vila']);
  for (const segment of base.outer) { await checked(segment.output); checkProbe(segment.output.probe, segment.records.length); }
  const oldParts: Part[] = [];
  for (let index = 0; index < IDS.length; index++) {
    const old = await checkedJson<Part>(base.parts[index]); assert.equal(old.id, IDS[index]);
    assert.deepEqual(old.output, base.parts[index].output); assert.deepEqual(old.selection, basePlan.selections[index]);
    await checked(old.output); await checked(old.source); checkProbe(old.output.probe, 360);
    for (const prior of old.prior) { const layer = base.landed.find(item => item.id === prior.id); assert.deepEqual(prior, layer); }
    assert.equal(old.records.length, 360);
    old.records.forEach((record, frame) => {
      assert.equal(record.frame, frame); assert.equal(record.sourceRgbEqual, true);
      assert.equal(record.changedOutsidePaperPixels, 0); assert.equal(record.changedPriorCorePixels, 0);
      assert.match(record.sourceRgbSha256, /^[a-f0-9]{64}$/); assert.match(record.outputRgbSha256, /^[a-f0-9]{64}$/);
    });
    oldParts.push(old);
  }
  for (const correction of patch.parts) {
    const old = oldParts.find(part => part.id === correction.id)!;
    assert.deepEqual(correction.source, old.source); assert.equal(correction.previousMovie.path, old.output.path);
    assert.equal(correction.previousMovie.sha256, old.output.sha256); await checked(correction.output);
    checkProbe(correction.probe, 360); assert.equal(correction.frames, 360); assert.equal(correction.records.length, 360);
    correction.records.forEach((record, frame) => {
      assert.equal(record.frame, frame); assert.equal(record.sourceRgbSha256, old.records[frame].sourceRgbSha256);
      assert.equal(record.changedOutsidePaperPixels, 0); assert.equal(record.priorCoreChanges, 0);
      assert.match(record.outputRgbSha256, /^[a-f0-9]{64}$/);
      assert.equal(record.unchangedFromR16, record.outputRgbSha256 === old.records[frame].outputRgbSha256);
      const change = record.refinement as { id: string; addedPixels: number; removedPixels: number; adjustedPixels: number };
      assert.equal(change.id, correction.id);
      for (const count of [change.addedPixels, change.removedPixels, change.adjustedPixels]) assert.ok(Number.isSafeInteger(count) && count >= 0);
      if (change.addedPixels + change.removedPixels + change.adjustedPixels === 0) assert.equal(record.unchangedFromR16, true,
        `Zero mask delta changed scene RGB: ${correction.id}/${frame}`);
    });
    assert.equal(correction.unchangedFrames, correction.records.filter(record => record.unchangedFromR16).length);
    const checkedPart = patchCheck.parts.find(part => part.id === correction.id)!;
    assert.equal(checkedPart.unchangedFrames, correction.unchangedFrames);
    assert.deepEqual(checkedPart.changedFrames, correction.records.filter(record => !record.unchangedFromR16).map(record => record.frame));
    assert.ok(correction.unchangedFrames < 360, 'Replacement must contain the intended change');
    for (const frame of [0, 350, 359]) assert.equal(correction.records[frame].unchangedFromR16, true,
      'Do not change outer poses or the frame350 landed-card basis');
  }
  // Freeze originals and code before any expensive assembly. Snapshots preserve directory names.
  const codes = new Map<string, Ref>();
  for (const binding of [...basePlan.code, ...patch.code, ...refinement.code,
    await ref('tools/pamela-mask-bank-assemble.ts'), await ref('tools/pamela-two-sided-download-bundle.ts')]) {
    const previous = codes.get(binding.path); assert.ok(!previous || previous.sha256 === binding.sha256);
    await checked(binding); codes.set(binding.path, binding);
  }
  await mkdir(local(path.dirname(RUN)), { recursive: true }); await mkdir(local(RUN));
  for (const directory of ['render', 'qa', 'snapshot']) await mkdir(local(`${RUN}/${directory}`));
  const snapshots = [];
  for (const binding of codes.values()) {
    const destination = `${RUN}/snapshot/${binding.path}`; await mkdir(path.dirname(local(destination)), { recursive: true });
    snapshots.push({ original: binding, snapshot: await copy(binding, destination) });
  }
  const derivativeOf = { base: BASE, basePlan: base.plan, patch: patchRef, patchCheck: patchCheckRef, refinement: patch.refinement };
  const maskRefinements = { integration: patchRef, proof: patch.refinement, patchCheck: patchCheckRef, correctedIds: PATCH_IDS,
    sourceRgbEquality: 'All720 corrected source RGB SHA256 values equal their hash-bound base part records; all base records have sourceRgbEqual=true.',
    priorCoreCompatibility: 'changedPriorCorePixels is the verified zero priorCoreChanges field from the corrected scene integration.',
    retainedLandedLayers: 'Exact base landed image references and hashes; corrected frames0,350,359 must retain original output RGB hashes.' };
  const plan = { ...basePlan, schemaVersion: 3, run: RUN, createdAt: new Date().toISOString(),
    derivativeOf, maskRefinements, code: [...codes.values()], snapshots,
    assembly: { mode: 'two-clip-replacement-twelve-byte-identical-reuses', rerenderedHere: 0, replacedClips: PATCH_IDS,
      reusedClips: IDS.filter(id => !PATCH_IDS.includes(id)), trimmedClipsReencoded: PATCH_IDS,
      inheritedOuter: base.outer.map(segment => ({ id: segment.id, output: segment.output })), inheritedLanded: base.landed,
      frameComparison: 'All decoded full/compact frames outside the two replacement intervals must equal the frozen bank; replacement intervals must equal their intended component.',
      concatTiming: 'Explicit segment duration = verified frame count / 30; stream-copy concatenation.' } };
  const planRef = await save(`${RUN}/plan.json`, plan), parts: Binding[] = [];
  for (let index = 0; index < IDS.length; index++) {
    const old = oldParts[index], correction = patch.parts.find(part => part.id === old.id);
    const inputMovie = correction ? { ...correction.output, probe: correction.probe } : old.output;
    const output = { ...await copy(inputMovie, `${RUN}/render/${old.id}.mp4`), probe: inputMovie.probe };
    // Never inherit the old per-frame output proofs for the corrected images.
    const records = correction ? correction.records.map(record => ({ ...record,
      sourceRgbEqual: true, changedPriorCorePixels: record.priorCoreChanges! })) : old.records;
    const part: Part = { ...(correction ? { id: old.id, selection: old.selection, source: old.source, prior: old.prior } : old),
      output, records, derivation: { mode: correction ? 'corrected-full-clip-copy' : 'byte-identical-base-clip-copy',
        basePart: base.parts[index], inputMovie, patchEvidence: correction ? patchRef : null,
        sourceRgbEqualDerivation: correction ? maskRefinements.sourceRgbEquality : 'Inherited exact base records.',
        priorCoreFieldDerivation: correction ? maskRefinements.priorCoreCompatibility : 'Inherited exact base records.' } };
    parts.push({ id: old.id, ...await save(`${RUN}/${old.id}.json`, part), output });
  }
  const outer: Outer[] = [];
  for (const segment of base.outer) outer.push({ ...segment,
    output: { ...await copy(segment.output, `${RUN}/render/${segment.id}.mp4`), probe: segment.output.probe },
    derivation: { mode: 'byte-identical-base-outer-copy', original: segment.output } });
  const outerSegment = (index: number): Segment => ({ id: outer[index].id, output: outer[index].output, patched: false });
  const fullSegments = [outerSegment(0), outerSegment(1), ...parts.map(part => ({ id: part.id, output: part.output,
    patched: PATCH_IDS.includes(part.id) })), outerSegment(2), outerSegment(3)];
  const full = await concat('vila-fourteen-materials-vila', fullSegments, 5486);
  console.log(JSON.stringify({ assembled: 'full', frames: 5486 }));
  const trimmed: Array<Segment & { interval: Interval; original?: Ref; encoding: string }> = [];
  for (const interval of trim.intervals) {
    const index = IDS.indexOf(interval.id), part = parts[index]; assert.equal(interval.sourceSha256, oldParts[index].source.sha256);
    assert.ok(Number.isInteger(interval.startInclusive) && Number.isInteger(interval.endExclusive));
    assert.ok(interval.startInclusive >= 0 && interval.endExclusive <= 360 && interval.endExclusive > interval.startInclusive);
    const file = `${RUN}/render/${interval.id}-trim.mp4`, frames = interval.endExclusive - interval.startInclusive;
    const patched = PATCH_IDS.includes(interval.id);
    let original: Ref | undefined;
    if (patched) await execute('ffmpeg', ['-v', 'error', '-nostdin', '-n', '-threads', '1', '-i', local(part.output.path),
      '-vf', `trim=start_frame=${interval.startInclusive}:end_frame=${interval.endExclusive},setpts=PTS-STARTPTS`,
      '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-threads', '1', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', local(file)], { windowsHide: true });
    else { original = await ref(`${basePlan.run}/render/${interval.id}-trim.mp4`); await copy(original, file); }
    trimmed.push({ id: interval.id, output: await inspect(file, frames), patched, interval, original,
      encoding: patched ? 'same-whole-frame-trim-settings-two-corrected-clips-only' : 'byte-identical-base-trim-copy-accepted-only-after-complete-compact-frame-comparison' });
  }
  const compact = await concat('vila-fourteen-materials-trim', [outerSegment(0), outerSegment(1), ...trimmed,
    outerSegment(2), outerSegment(3)], 4404);
  console.log(JSON.stringify({ assembled: 'compact', frames: 4404 }));
  const beforeFull = await decoded(base.full, 'base-full', 5486), afterFull = await decoded(full.output, 'assembled-full', 5486);
  const fullComparison = await compare('full', beforeFull, afterFull, full.spans);
  const beforeCompact = await decoded(base.compact, 'base-compact', 4404), afterCompact = await decoded(compact.output, 'assembled-compact', 4404);
  const compactComparison = await compare('compact', beforeCompact, afterCompact, compact.spans);
  // Revalidate every bound input and produced copy before publishing the new bank evidence.
  for (const binding of [...checkedRefs.values(), planRef, ...parts, ...parts.map(part => part.output),
    ...outer.map(segment => segment.output), ...trimmed.map(segment => segment.output), full.output, compact.output]) await checked(binding);
  const evidence = { ...base, status: 'two-sided-fourteen-slot-integration-awaiting-native-review', createdAt: new Date().toISOString(),
    plan: planRef, code: [...codes.values()], snapshots, derivativeOf, maskRefinements, parts, outer,
    full: full.output, compact: compact.output, trimmed,
    assembly: { full: { timeline: full.spans, concatList: full.list, comparison: fullComparison },
      compact: { timeline: compact.spans, concatList: compact.list, comparison: compactComparison },
      replacedClips: 2, byteIdenticalReusedClips: 12, byteIdenticalOuterSegments: 4, unchangedLandedLayers: 14,
      reencodedTrims: 2, byteIdenticalReusedTrims: 12, allOtherDecodedFullFramesEqual: true,
      allOtherDecodedCompactFramesEqual: true, rawCorrectedSourceRgbComparisons: 720,
      reusedSourceRgbComparisons: 4320, nativeReview: 'Caller gate before assembly; this tool does not perform visual acceptance.' },
    verification: { ...base.verification, fullNonreplacementFramesCompared: 4766, compactNonreplacementFramesCompared: 3936,
      decodedChangesOutsideReplacementIntervals: 0, replacementFramesInsertedExactly: 1188 },
    limitations: [...base.limitations, 'Two corrected full clips replace C1-P7/C2-P6; twelve original full clips, twelve original trims, all outer clips and landed layers are reused with hashes.',
      'Per-frame exact source/paper/core guarantees derive from frozen base and patch records. Decoded movie equality is checked separately and does not imply optical acceptance.',
      'Only two trim exports are re-encoded; no new source rendering is performed here. Continuous native/full-round acceptance remains a separate review.'],
    productionAccepted: false, publicDeploymentChanged: false, newApiJobs: 0 };
  const evidenceRef = await save(`${RUN}/evidence.json`, evidence);
  console.log(JSON.stringify({ evidence: evidenceRef, full: full.output, compact: compact.output,
    downloadCommand: `node tools/pamela-two-sided-download-bundle.ts --evidence=${evidenceRef.path} --evidence-sha256=${evidenceRef.sha256} --destination=${RUN}/download-bundle` }));
}
await main();
