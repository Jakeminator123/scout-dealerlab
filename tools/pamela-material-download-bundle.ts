/** Local, byte-preserving export of a completed fourteen-clip material bank.
 * Usage: node tools/pamela-material-download-bundle.ts --evidence=runs/.../evidence.json
 *   --evidence-sha256=<sha256> --destination=runs/.../download-bundle
 * The destination must not exist. Failed attempts are preserved without a receipt.
 * No renderer imports, provider calls, source mutations, or new dependencies.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream, constants} from 'node:fs';
import {copyFile, lstat, mkdir, readFile, readdir, realpath, rename, stat, writeFile} from 'node:fs/promises';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

type Ref = {path: string; sha256: string};
type Probe = {streams: Array<{width: number; height: number; avg_frame_rate: string;
  nb_read_frames: string; codec_type?: string; codec_name?: string; pix_fmt?: string}>;
  format: {duration: string}};
type Movie = Ref & {probe: Probe};
type Selection = {id: string; kind: string; evidence: Ref; review: Ref; canonicalUvQuarterTurns?: number};
type Part = {id: string; selection: Selection; source: Ref; output: Movie;
  records: Array<{frame: number; sourceRgbEqual: boolean; changedOutsidePaperPixels: number;
    changedPriorCorePixels: number; sourceRgbSha256: string; outputRgbSha256: string}>};
type Plan = {project: string; dealerId: string; run: string; presentationOnly: boolean;
  productionAccepted: boolean; width: number; height: number; fps: number; selections: Selection[];
  registry: Ref; firstPlan: Ref; secondPlan: Ref};
type Bank = {status: string; plan: Ref; parts: Array<Ref & {id: string; output: Movie}>;
  full: Movie; compact: Movie; verification: Record<string, number>; productionAccepted: boolean; newApiJobs: number};
type Entry = {name: string; sha256: string; bytes: number};
const execute = promisify(execFile);
const ids = [1, 2].flatMap(pass => [1, 2, 3, 4, 5, 6, 7].map(seat => `C${pass}-P${seat}`));
const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const samePath = (a: string, b: string) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

function runPath(input: string): string {
  assert.equal(typeof input, 'string', 'A local runs/ path is required');
  const absolute = path.resolve(root, input), relative = path.relative(root, absolute).replaceAll('\\', '/');
  assert.ok(relative.startsWith('runs/') && !relative.split('/').some(p => p === '..' || p === 'private' || p.startsWith('.env')),
    'All inputs and outputs must stay in this checkout under runs/, outside private/.env paths');
  return absolute;
}

function relative(input: string): string { return path.relative(root, input).replaceAll('\\', '/'); }

async function existing(input: string): Promise<string> {
  const absolute = runPath(input), resolved = await realpath(absolute);
  assert.ok(samePath(absolute, resolved), 'Symlinks or junctions are not accepted for bundle inputs');
  assert.ok((await stat(absolute)).isFile(), 'Expected a regular input file');
  return absolute;
}

async function fileHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function assertRef(ref: Ref): void {
  assert.ok(ref && typeof ref.path === 'string', 'Missing file reference');
  assert.match(ref.sha256, /^[a-f0-9]{64}$/, 'Expected lowercase SHA256');
}

async function checkedFile(ref: Ref): Promise<string> {
  assertRef(ref);
  const file = await existing(ref.path);
  assert.equal(await fileHash(file), ref.sha256, `SHA256 mismatch: ${relative(file)}`);
  return file;
}

async function checkedJson<T>(ref: Ref): Promise<T> {
  assertRef(ref);
  const file = await existing(ref.path), bytes = await readFile(file);
  assert.equal(digest(bytes), ref.sha256, `SHA256 mismatch: ${relative(file)}`);
  return JSON.parse(bytes.toString('utf8')) as T;
}

function checkProbe(probe: Probe, frames: number): void {
  assert.equal(probe.streams.length, 1, 'Expected exactly one video stream');
  const stream = probe.streams[0];
  assert.equal(stream.width, 1762); assert.equal(stream.height, 1174);
  assert.equal(stream.avg_frame_rate, '30/1'); assert.equal(Number(stream.nb_read_frames), frames);
  assert.ok(Math.abs(Number(probe.format.duration) - frames / 30) < 0.01, 'Unexpected duration');
}

async function checkedMovie(movie: Movie, frames: number): Promise<string> {
  checkProbe(movie.probe, frames);
  const file = await checkedFile(movie);
  const {stdout} = await execute('ffprobe', ['-v', 'error', '-threads', '1', '-count_frames',
    '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', file], {windowsHide: true, maxBuffer: 1024 * 1024});
  const probe = JSON.parse(stdout) as Probe;
  checkProbe(probe, frames);
  assert.equal(probe.streams[0].codec_type, 'video');
  assert.equal(probe.streams[0].codec_name, 'h264');
  assert.equal(probe.streams[0].pix_fmt, 'yuv420p');
  return file;
}

// Fixed script, structured JSON on stdin: user-controlled paths are never shell code.
// The ZIP is flat, ordered, uncompressed (MP4 is already compressed), and timestamp-stable.
const zipScript = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$stream = [IO.File]::Open($request.archive, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
$archive = $null
try {
  $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
  foreach ($item in $request.entries) {
    $entry = $archive.CreateEntry($item.name, [IO.Compression.CompressionLevel]::NoCompression)
    $entry.LastWriteTime = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
    $source = [IO.File]::OpenRead([IO.Path]::Combine($request.directory, $item.name))
    $target = $null
    try { $target = $entry.Open(); $source.CopyTo($target) }
    finally { if ($null -ne $target) { $target.Dispose() }; $source.Dispose() }
  }
} finally { if ($null -ne $archive) { $archive.Dispose() }; $stream.Dispose() }
$stream = [IO.File]::OpenRead($request.archive)
$archive = $null
try {
  $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read, $false)
  if ($archive.Entries.Count -ne 16) { throw 'ZIP must contain exactly 16 entries' }
  $results = @()
  for ($i = 0; $i -lt $archive.Entries.Count; $i++) {
    $entry = $archive.Entries[$i]; $expected = $request.entries[$i]
    if ($entry.FullName -cne $expected.name -or $entry.Length -ne $expected.bytes) { throw 'ZIP entry name or length mismatch' }
    $inputStream = $entry.Open(); $hash = [Security.Cryptography.SHA256]::Create()
    try { $actual = ([BitConverter]::ToString($hash.ComputeHash($inputStream))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose(); $inputStream.Dispose() }
    if ($actual -cne $expected.sha256) { throw 'ZIP entry SHA256 mismatch' }
    $results += [PSCustomObject]@{ name = $entry.FullName; sha256 = $actual; bytes = $entry.Length }
  }
  [Console]::Out.Write((ConvertTo-Json -InputObject $results -Depth 4 -Compress))
} finally { if ($null -ne $archive) { $archive.Dispose() }; $stream.Dispose() }
`;

async function createAndVerifyZip(directory: string, archive: string, entries: Entry[]): Promise<Entry[]> {
  assert.equal(entries.length, 16);
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(zipScript, 'utf16le').toString('base64')],
    {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('close', code => {
      if (code !== 0) { reject(new Error(`ZIP creation/verification failed (${code}): ${stderr.slice(0, 3000)}`)); return; }
      try { resolve(JSON.parse(stdout) as Entry[]); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify({directory, archive, entries}));
  });
}

async function main(): Promise<void> {
  const args = new Map<string, string>();
  for (const value of process.argv.slice(2)) {
    const match = /^(--evidence|--evidence-sha256|--destination)=(.+)$/.exec(value);
    assert.ok(match, 'Only --evidence=, --evidence-sha256= and --destination= are accepted');
    assert.ok(!args.has(match[1]), `Duplicate argument: ${match[1]}`); args.set(match[1], match[2]);
  }
  assert.equal(args.size, 3, 'Explicit --evidence, --evidence-sha256 and --destination are required');
  assert.equal(process.platform, 'win32', 'This bundle writer uses Windows .NET ZIP support');
  assert.ok(samePath(await realpath(process.cwd()), root), 'Run this tool from the snyggare-dealer checkout root');
  const evidenceRef = {path: args.get('--evidence')!, sha256: args.get('--evidence-sha256')!};
  const destination = runPath(args.get('--destination')!);
  assert.equal(path.basename(destination), 'download-bundle', 'Use a unique runs/.../download-bundle destination');
  await assert.rejects(lstat(destination), {code: 'ENOENT'}, 'Destination must not already exist');
  const parent = path.dirname(destination);
  assert.ok(samePath(await realpath(parent), parent), 'Destination parent must exist without symlinks/junctions');
  const evidence = await checkedJson<Bank>(evidenceRef);
  assert.equal(evidence.status, 'full-material-integration-awaiting-native-review');
  assert.equal(evidence.productionAccepted, false); assert.equal(evidence.newApiJobs, 0);
  assert.deepEqual(evidence.parts.map(part => part.id), ids, 'Expected all fourteen parts in canonical order');
  for (const [key, value] of Object.entries({sourceRgbEqualFrames: 5040, printedOutsidePaperChanges: 0,
    priorCardCoreChanges: 0, distinctMaterials: 14, fullFrames: 5486, trimmedFrames: 4404})) {
    assert.equal(evidence.verification[key], value, `Bank verification mismatch: ${key}`);
  }
  const plan = await checkedJson<Plan>(evidence.plan), bankDirectory = runPath(plan.run);
  assert.equal(plan.project, 'snyggare-dealer'); assert.equal(plan.dealerId, 'pamela');
  assert.equal(plan.presentationOnly, true); assert.equal(plan.productionAccepted, false);
  assert.equal(plan.width, 1762); assert.equal(plan.height, 1174); assert.equal(plan.fps, 30);
  assert.ok(samePath(path.dirname(runPath(evidenceRef.path)), bankDirectory), 'Evidence must belong to the selected bank');
  await checkedFile({path: path.join(bankDirectory, 'plan.json'), sha256: evidence.plan.sha256});
  assert.deepEqual(plan.selections.map(selection => selection.id), ids);
  const registry = await checkedJson<{project: string; dealerId: string; presentationOnly: boolean;
    entries: Array<Selection & {status: string; limitation?: string; finalAcceptanceBlocked?: boolean}>}>(plan.registry);
  assert.equal(registry.project, plan.project); assert.equal(registry.dealerId, plan.dealerId);
  assert.equal(registry.presentationOnly, true); assert.deepEqual(registry.entries.map(entry => entry.id), ids);
  const first = await checkedJson<{jobs: Array<{seat: number; sourceSha256: string}>}>(plan.firstPlan);
  const second = await checkedJson<{jobs: Array<{seat: number; sourceSha256: string}>}>(plan.secondPlan);
  const clips: Array<Entry & {id: string; sourceSha256: string; partEvidenceSha256: string;
    trackEvidenceSha256: string; reviewSha256: string; additionalLimitationRecorded: boolean;
    finalAcceptanceBlocked: boolean; file: string}> = [];
  // Sequential probes keep resource use below the requested four-worker ceiling.
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index], binding = evidence.parts[index], selection = plan.selections[index], entry = registry.entries[index];
    assert.equal(entry.status, 'integration-candidate');
    assert.deepEqual(selection, {id: entry.id, kind: entry.kind, evidence: entry.evidence, review: entry.review,
      canonicalUvQuarterTurns: entry.canonicalUvQuarterTurns ?? 0});
    assert.ok(samePath(runPath(binding.path), path.join(bankDirectory, `${id}.json`)));
    const part = await checkedJson<Part>(binding);
    assert.equal(part.id, id); assert.deepEqual(part.selection, selection); assert.deepEqual(part.output, binding.output);
    assert.ok(samePath(runPath(part.output.path), path.join(bankDirectory, 'render', `${id}.mp4`)), 'Only rendered scene MP4s may be copied');
    const sourceEvidence = await checkedJson<{source: Ref}>(selection.evidence);
    assert.equal(sourceEvidence.source.sha256, part.source.sha256);
    assert.ok(samePath(runPath(sourceEvidence.source.path), runPath(part.source.path)));
    await checkedFile(selection.review); await checkedFile(part.source);
    const job = (id.startsWith('C1') ? first : second).jobs.find(item => item.seat === Number(id.at(-1)));
    assert.ok(job); assert.equal(job.sourceSha256, part.source.sha256);
    assert.equal(part.records.length, 360);
    part.records.forEach((record, frame) => {
      assert.equal(record.frame, frame); assert.equal(record.sourceRgbEqual, true);
      assert.equal(record.changedOutsidePaperPixels, 0); assert.equal(record.changedPriorCorePixels, 0);
      assert.match(record.sourceRgbSha256, /^[a-f0-9]{64}$/); assert.match(record.outputRgbSha256, /^[a-f0-9]{64}$/);
    });
    const file = await checkedMovie(part.output, 360);
    clips.push({id, name: `${id}.mp4`, file, sha256: part.output.sha256, bytes: (await stat(file)).size,
      sourceSha256: part.source.sha256, partEvidenceSha256: binding.sha256, trackEvidenceSha256: selection.evidence.sha256,
      reviewSha256: selection.review.sha256, additionalLimitationRecorded: Boolean(entry.limitation),
      finalAcceptanceBlocked: entry.finalAcceptanceBlocked === true});
    console.log(JSON.stringify({verified: id, frames: 360, fps: 30}));
  }
  assert.ok(samePath(runPath(evidence.full.path), path.join(bankDirectory, 'render', 'vila-fourteen-materials-vila.mp4')));
  assert.ok(['vila-fourteen-materials-trim.mp4', 'vila-fourteen-materials-trim-exact.mp4'].some(name =>
    samePath(runPath(evidence.compact.path), path.join(bankDirectory, 'render', name))),
    'Only the selected bank compact export or its verified exact-clock copy is allowed');
  await checkedMovie(evidence.full, 5486); await checkedMovie(evidence.compact, 4404);
  // No output directory is created until all provenance and video checks have passed.
  await mkdir(destination);
  const directory = path.join(destination, 'scenklipp'); await mkdir(directory);
  for (const clip of clips) {
    const copy = path.join(directory, clip.name); await copyFile(clip.file, copy, constants.COPYFILE_EXCL);
    assert.equal(await fileHash(copy), clip.sha256, `Copied MP4 mismatch: ${clip.id}`);
    assert.equal((await stat(copy)).size, clip.bytes);
  }
  const readme = Buffer.from([
    'PAMELA – 14 SCENKLIPP FÖR GRANSKNING', '',
    'Granskningskandidater. Inte godkända för produktion eller spelintegration.',
    'C1-P1 till C1-P7: första kortet till spelarplats 1–7.',
    'C2-P1 till C2-P7: andra kortet till spelarplats 1–7.',
    'Varje film är 12 sekunder, 360 rutor, 30 fps, 1762×1174, H.264 utan ljud.',
    'Scenen innehåller Pamela, bord, rum och kvarliggande kort. Trycken är författade provmaterial.',
    'Fysisk fram/baksida är UNKNOWN. Filerna bevisar inte fysisk kortvändning.',
    'Kvarstående restmaskfel och hårda poseskarvar kräver fortsatt visuell granskning.',
    'C2-P1 har kända begränsningar vid grepp/blandkant; se den hashbundna källevidensen.',
    'Sammanfogning av dessa 14 filmer ger inte automatiskt en godkänd posekedja.', '',
    'Den klippta helfilmen med vila/övergångar (4404 rutor, cirka 146,8 s) levereras separat.',
    'Den oklippta helfilmen (5486 rutor, cirka 182,87 s) är också separat.',
    'Ingen helfilm, råoriginal, nyckel, miljöfil eller privat fil ingår i ZIP-arkivet.',
    'MP4-filerna är identiska kopior av den hashverifierade bankens scenexporter; ingen omkodning.',
    'manifest.json anger SHA256, ordning, källbindningar och begränsningar.',
    'Arkivet innehåller exakt 14 MP4-filer, manifest.json och denna LASMIG.txt.', '',
  ].join('\r\n'), 'utf8');
  await writeFile(path.join(directory, 'LASMIG.txt'), readme, {flag: 'wx'});
  const readmeEntry: Entry = {name: 'LASMIG.txt', sha256: digest(readme), bytes: readme.length};
  const manifest = json({schemaVersion: 1, project: 'snyggare-dealer', dealerId: 'pamela',
    status: 'review-candidates', productionAccepted: false, runtimeAccepted: false, physicalCardSide: 'UNKNOWN',
    evidenceSha256: evidenceRef.sha256, planSha256: evidence.plan.sha256, registrySha256: plan.registry.sha256,
    copyMode: 'byte-identical-no-reencoding', width: 1762, height: 1174, fps: 30, framesPerClip: 360, secondsPerClip: 12,
    archiveEntryCount: 16, order: ids,
    limitations: ['Authored diagnostic card faces; physical front/back remains UNKNOWN.',
      'Residual dealer matte errors and hard source pose seams remain.',
      'C2-P1 has a recorded edge/grip limitation; continuous visual and runtime acceptance remain pending.'],
    separateMovies: {included: false, compact: {sha256: evidence.compact.sha256, frames: 4404, fps: 30},
      full: {sha256: evidence.full.sha256, frames: 5486, fps: 30}},
    files: clips.map(({file: _file, ...clip}) => clip), readme: readmeEntry,
    manifestIntegrity: 'This manifest cannot contain its own hash. Its SHA256 and the ZIP SHA256 are in the external receipt.json.'});
  await writeFile(path.join(directory, 'manifest.json'), manifest, {flag: 'wx'});
  const entries: Entry[] = [...clips.map(({name, sha256, bytes}) => ({name, sha256, bytes})),
    {name: 'manifest.json', sha256: digest(manifest), bytes: manifest.length}, readmeEntry];
  assert.deepEqual((await readdir(directory)).sort(), entries.map(entry => entry.name).sort());
  // Bind archive verification to the on-disk manifest, including its external self-hash.
  const manifestOnDisk = await readFile(path.join(directory, 'manifest.json'));
  assert.equal(digest(manifestOnDisk), digest(manifest));
  const parsed = JSON.parse(manifestOnDisk.toString('utf8')) as {files: Entry[]; readme: Entry};
  assert.deepEqual(parsed.files.map(({name, sha256, bytes}) => ({name, sha256, bytes})), entries.slice(0, 14));
  assert.deepEqual(parsed.readme, readmeEntry);
  const partial = path.join(destination, 'pamela-14-scenklipp.zip.partial');
  const verified = await createAndVerifyZip(directory, partial, entries);
  assert.deepEqual(verified, entries, 'ZIP stream verification differs from the manifest');
  await checkedFile(evidenceRef); // Fail if the selected evidence changed during packaging.
  const archive = path.join(destination, 'pamela-14-scenklipp.zip'); await rename(partial, archive);
  const receipt = {schemaVersion: 1, status: 'verified', evidence: {path: relative(runPath(evidenceRef.path)), sha256: evidenceRef.sha256},
    tool: {path: relative(fileURLToPath(import.meta.url)), sha256: await fileHash(fileURLToPath(import.meta.url))},
    archive: {path: relative(archive), sha256: await fileHash(archive), bytes: (await stat(archive)).size},
    manifestSha256: digest(manifest), verifiedEntries: verified, verification: {clips: 14, archiveEntries: 16,
      copiedMp4HashesMatch: true, streamedZipHashesMatch: true, framesPerClip: 360, fps: 30},
    productionAccepted: false, newApiJobs: 0};
  await writeFile(path.join(destination, 'receipt.json'), json(receipt), {flag: 'wx'});
  console.log(JSON.stringify({status: receipt.status, archive: receipt.archive, receipt: relative(path.join(destination, 'receipt.json'))}));
}

await main();
