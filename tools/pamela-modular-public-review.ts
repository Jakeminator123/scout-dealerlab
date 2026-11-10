/** Prepare a new numbered review only: no API, upload, deployment or pointer update. */
import {readFile, writeFile, mkdir, readdir, copyFile, link, lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readPamelaBankCatalog} from '../src/pamela-bank-catalog.ts';

type Json = Record<string, any>;
type FileRef = {path: string; sha256: string};
type MediaRef = {source: string; publicPath: string; sha256: string; bytes: number};
type BundleStats = {hasErrors(): boolean; toString(options: {all: boolean; errors: boolean}): string};
const root = process.cwd(), previous = 'exports/pamela-loop-review-20261109-r10';
const destination = process.argv.find(v => v.startsWith('--destination='))?.slice('--destination='.length) ?? 'exports/pamela-loop-review-20261109-r12';
assert.match(destination, /^exports\/pamela-loop-review-20261109-r\d{2}$/, 'Only a numbered 20261109 review destination is allowed');
assert.notEqual(destination, previous, 'The frozen R10 baseline cannot be a destination');
const evidencePath = 'runs/20261109-pamela-two-sided-flip/take-03/evidence.json';
const expectedEvidence = process.argv.find(v => v.startsWith('--evidence-sha256='))?.slice('--evidence-sha256='.length);
assert.match(expectedEvidence ?? '', /^[a-f0-9]{64}$/, 'Explicit --evidence-sha256=<finished take-03 evidence SHA256> required');
assert.equal(path.basename(root), 'snyggare-dealer', 'Run from the intended checkout');
assert.ok(/^v24\./.test(process.version) && Number(process.versions.node.split('.')[1]) >= 21, 'Project requires Node >=24.21.0 <25');
const projectId = 'prj_mQwHzspK3GrrJA04eFOorFxth0d5', teamId = 'team_Scxorb9qtZHjNae1YEQnFCaT';
const c1P4Sha = '4e252be2235ce42cec5de9d49b993d0ffed1c029de9890faea6686f46824f87c';
const c2P4Sha = '67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167';
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const read = async(p: string): Promise<Json> => JSON.parse(await readFile(p, 'utf8'));
const ref = async(p: string): Promise<FileRef> => ({path: p, sha256: hash(await readFile(p))});
const publicUrl = (p: string) => '/files/' + p.split('/').map(encodeURIComponent).join('/');
function allowedMedia(p: string) {
  assert.match(p, /^runs\/[A-Za-z0-9_./-]+\.(?:mp4|png|jpg|jpeg|json)$/);
  assert.ok(!p.split('/').some(s => !s || s === '..' || s.startsWith('.')), 'Hidden/traversing media path');
}
async function verifiedBytes(p: string, expected?: string) {
  allowedMedia(p); const bytes = await readFile(p), sha256 = hash(bytes);
  if (expected) assert.equal(sha256, expected, `Source changed: ${p}`);
  return {bytes, sha256};
}
const target = await read('references/public-review.json'), oldReceipt = await read(previous + '/receipt.json');
const project = await read(previous + '/.vercel/project.json');
assert.equal(target.projectId, projectId); assert.equal(target.teamId, teamId);
assert.equal(oldReceipt.projectId, projectId); assert.equal(oldReceipt.teamId, teamId);
assert.equal(oldReceipt.status, 'published-and-verified');
assert.equal(project.projectId, projectId); assert.equal(project.orgId, teamId);
const evidenceBytes = await readFile(evidencePath); assert.equal(hash(evidenceBytes), expectedEvidence);
const e = JSON.parse(evidenceBytes.toString()) as Json;
assert.equal(e.status, 'local-two-sided-candidate'); assert.equal(e.source.sha256, c2P4Sha);
assert.equal(e.selection.id, 'C2-P4'); assert.equal(e.selection.physicalSide, 'UNKNOWN');
assert.equal(e.seatNumber, 4); assert.equal(e.cardOrdinal, 2); assert.equal(e.productionAccepted, false);
assert.deepEqual(e.sourceTiming, {fps: 30, frames: 360}); assert.equal(e.records.length, 360);
const designIds = ['sg-classic', 'blue-ivory', 'sg-ivory', 'blue-classic'];
for (const [frame, record] of e.records.entries()) {
  assert.equal(record.frame, frame, 'Missing or reordered native frame');
  assert.equal(record.side, frame < 98 ? 'BACK' : frame === 98 ? 'EDGE' : 'FRONT');
  assert.deepEqual(record.variants.map((v: Json) => v.design).sort(), [...designIds].sort());
  for (const variant of record.variants) {
    assert.equal(variant.changedOutsideCoverage, 0); assert.equal(variant.changedProtectedPixels, 0);
  }
}
for (const item of e.code as FileRef[]) assert.equal((await ref(item.path)).sha256, item.sha256, `Rendered code changed: ${item.path}`);
await verifiedBytes(e.source.path, c2P4Sha);
const outputByName = new Map<string, Json>();
assert.equal(e.outputs.length, 5, 'Four complete combinations and one comparison required');
for (const item of e.outputs as Json[]) {
  const name = path.posix.basename(item.path, '.mp4');
  assert.ok([...designIds, 'turn-before-after'].includes(name)); assert.ok(!outputByName.has(name));
  assert.equal(item.path, `${path.posix.dirname(evidencePath)}/render/${name}.mp4`);
  await verifiedBytes(item.path, item.sha256);
  const observed = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', item.path], {encoding: 'utf8', windowsHide: true}));
  const stream = observed.streams[0], comparison = name === 'turn-before-after';
  assert.equal(stream.avg_frame_rate, '30/1'); assert.equal(Number(stream.nb_read_frames), comparison ? 81 : 360);
  assert.equal(stream.width, comparison ? 1440 : 1762); assert.equal(stream.height, comparison ? 504 : 1174);
  assert.equal(Number(item.probe.streams[0].nb_read_frames), Number(stream.nb_read_frames));
  outputByName.set(name, {...item, verifiedProbe: observed});
}
const stage = await read('references/pamela-stage-contract.json'), catalog = await readPamelaBankCatalog();
const motion = catalog.motions.find(m => m.sha256 === c1P4Sha);
assert.ok(motion, 'The exact C1-P4 shoe-calibrated stage motion is missing');
assert.equal(catalog.seats.find(s => s.seat === 4)?.sha256, c1P4Sha);
for (const item of catalog.motions) await verifiedBytes(item.file, item.sha256);
for (const item of catalog.landedCards) await verifiedBytes(item.file, item.sha256);
const baselineMutable = ['pamela-loop.html', 'pamela-loop-manifest.json', 'latest.json', 'manifest.json'];
const oldStatic = `${previous}/.vercel/output/static`;
const baselineHashes = await Promise.all(baselineMutable.map(name => ref(`${oldStatic}/${name}`)));

// Everything above is read-only preflight. Never replace a partial/previous packet.
await mkdir(destination); await mkdir(destination + '/.vercel');
let inheritedFiles = 0, hardlinkedMedia = 0;
async function cloneFrozen(from: string, to: string) {
  await mkdir(to);
  for (const entry of await readdir(from, {withFileTypes: true})) {
    assert.ok(!entry.isSymbolicLink(), 'No symlinks in frozen export');
    const source = path.join(from, entry.name), dest = path.join(to, entry.name);
    assert.ok(!(await lstat(source)).isSymbolicLink(), 'Frozen export entry changed to a symlink');
    if (entry.isDirectory()) await cloneFrozen(source, dest);
    else {
      assert.ok(entry.isFile(), 'Only regular frozen export files are supported');
      if (/\.(mp4|webm|png|jpe?g|webp|avif|zip)$/i.test(entry.name)) {await link(source, dest); hardlinkedMedia++;}
      else await copyFile(source, dest, constants.COPYFILE_EXCL);
      inheritedFiles++;
    }
  }
}
await cloneFrozen(previous + '/.vercel/output', destination + '/.vercel/output');
await copyFile(previous + '/.vercel/project.json', destination + '/.vercel/project.json', constants.COPYFILE_EXCL);
const output = `${destination}/.vercel/output/static`;
const loopManifest = await read(output + '/pamela-loop-manifest.json');
const media = loopManifest.media as MediaRef[], newMedia: MediaRef[] = [];
async function addMedia(source: string, expected?: string) {
  const {bytes, sha256} = await verifiedBytes(source, expected), url = publicUrl(source), dest = output + url;
  const existing = media.find(m => m.publicPath === url);
  if (existing) {
    assert.equal(existing.sha256, sha256, `Inherited media is a different version: ${source}`);
    assert.equal(hash(await readFile(dest)), sha256, `Frozen exported bytes changed: ${source}`);
    return url;
  }
  await mkdir(path.dirname(dest), {recursive: true}); await writeFile(dest, bytes, {flag: 'wx'});
  const item = {source, publicPath: url, sha256, bytes: bytes.length}; media.push(item); newMedia.push(item); return url;
}
for (const item of catalog.motions) {await addMedia(item.file, item.sha256); await addMedia(item.provenance);}
for (const item of catalog.landedCards) await addMedia(item.file, item.sha256);
for (const asset of Object.values(stage.assets) as string[]) await addMedia(asset);
for (const item of outputByName.values()) await addMedia(item.path, item.sha256);
const now = new Date().toISOString(), snapshot = 'pamela-loop-review-' + now.replace(/\D/g, '');
const sourcePaths = ['src/pamela-modular-stage-client.tsx', 'src/pamela-stage-projection.ts', 'src/pamela-background-layer.ts', 'src/pamela-table-layer.ts', 'src/pamela-shoe-layer.ts', 'src/pamela-two-sided-review-client.tsx', 'src/pamela-two-sided-card.ts', 'src/pamela-bank-catalog.ts', 'tools/pamela-two-sided-proof.ts', 'tools/pamela-modular-public-review.ts', 'references/pamela-stage-contract.json', 'references/card-materials/vendor/three.module.js', 'runs/20261109-pamela-seat-bank/bank-index.json', 'runs/20261109-pamela-landed-card-layers/manifest.json'];
const code: FileRef[] = [];
await mkdir(destination + '/source-snapshot');
for (const source of sourcePaths) {
  const bytes = await readFile(source); code.push({path: source, sha256: hash(bytes)});
  await writeFile(`${destination}/source-snapshot/${source.replaceAll('/', '__')}`, bytes, {flag: 'wx'});
}
await writeFile(destination + '/source-snapshot/take-03-evidence.json', evidenceBytes, {flag: 'wx'});
const clips = designIds.map(id => {const item = outputByName.get(id)!; return {id, file: item.path, sha256: item.sha256};});
const comparisonItem = outputByName.get('turn-before-after')!;
const comparison = {id: 'turn-before-after', file: comparisonItem.path, sha256: comparisonItem.sha256};
const publicFlipEvidencePath = 'runs/20261109-pamela-two-sided-flip/take-03/public-review-evidence.json';
const flipManifest = {
  schemaVersion: 1, snapshot, preparedAt: now, status: 'review-candidate-not-production-accepted',
  sourceEvidence: {path: evidencePath, sha256: expectedEvidence}, source: {selectionId: 'C2-P4', sha256: c2P4Sha, width: 1762, height: 1174, fps: 30, frames: 360},
  semanticSourceSide: 'UNKNOWN', sidePolicy: e.sidePolicy, limitations: e.limitations,
  clips: clips.map(c => ({...c, file: publicUrl(c.file), frames: 360, fps: 30})), comparison: {...comparison, file: publicUrl(comparison.file), sourceFrames: [60, 140], frames: 81, fps: 30},
  verification: {completeSourceFrames: 360, combinations: 4, changedOutsideCoverage: 0, changedProtectedPixels: 0, outputFileHashesAndFrameCountsVerified: true},
  code: code.filter(c => /two-sided/.test(c.path)), productionAccepted: false,
};
await mkdir(path.dirname(output + publicUrl(publicFlipEvidencePath)), {recursive: true});
const publicFlipBytes = Buffer.from(JSON.stringify(flipManifest, null, 2));
await writeFile(output + publicUrl(publicFlipEvidencePath), publicFlipBytes, {flag: 'wx'});
const generatedEvidence = {source: publicFlipEvidencePath, publicPath: publicUrl(publicFlipEvidencePath), sha256: hash(publicFlipBytes), bytes: publicFlipBytes.length};
media.push(generatedEvidence); newMedia.push(generatedEvidence);
await writeFile(output + '/pamela-flip-manifest.json', publicFlipBytes, {flag: 'wx'});
const modularManifest = {
  schemaVersion: 1, snapshot, preparedAt: now, status: 'review-candidate-not-production-accepted',
  defaultMotion: {selectionId: 'C1-P4', ...motion, file: publicUrl(motion.file), provenance: publicUrl(motion.provenance)},
  sceneMotions: catalog.motions.map(m => ({...m, file: publicUrl(m.file), provenance: publicUrl(m.provenance)})),
  landedCards: catalog.landedCards.map(c => ({...c, file: publicUrl(c.file)})),
  contract: {...stage, assets: Object.fromEntries(Object.entries(stage.assets).map(([key, value]) => [key, publicUrl(value as string)]))},
  code: code.filter(c => !/two-sided/.test(c.path)),
  limitations: ['Authored 2.5D depth and lighting; the dealer retains baked source illumination.', 'Shoe appearance is source-bound to C1-P4, not a separately reconstructed shoe.', 'Live engine integration and final optical alpha are not accepted.'],
  links: {scene: '/pamela-modular.html', cardFlip: '/pamela-flip.html', fullBank: '/pamela-loop.html#fjorton-material'}, productionAccepted: false,
};
await writeFile(output + '/pamela-modular-manifest.json', JSON.stringify(modularManifest, null, 2), {flag: 'wx'});

// Reuse the established static exporter stack bundled with installed Next.
// Only the exported flip module is transformed: local query URLs become real
// static review pages. Workspace components and their local routes stay intact.
const require = createRequire(import.meta.url), buildDir = path.resolve(destination, '.build');
await mkdir(buildDir);
const substitutions = {'/pamela-prov?view=modular-scene': '/pamela-modular.html', '/pamela-prov?view=material-bank': '/pamela-loop.html#fjorton-material', '/pamela-prov?view=material-round': '/pamela-loop.html#fjorton-material'};
const flipSource = await readFile('src/pamela-two-sided-review-client.tsx', 'utf8');
for (const local of Object.keys(substitutions)) assert.ok(flipSource.includes(local), `Expected public link transform absent: ${local}`);
const loader = path.join(buildDir, 'typescript-loader.cjs');
await writeFile(loader, `const swc=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});const replacements=${JSON.stringify(substitutions)};module.exports=function(source){if(this.resourcePath.replace(/\\\\/g,'/').endsWith('/src/pamela-two-sided-review-client.tsx'))for(const[from,to]of Object.entries(replacements))source=source.split(from).join(to);return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code;};`);
const entries = [
  {name: 'pamela-modular', title: 'Pamela · Utbytbara rum, bord och sko', component: 'src/pamela-modular-stage-client.tsx', props: {contract: stage, motion, motionOptions: catalog.motions, landedCards: catalog.landedCards, publicMode: true}},
  {name: 'pamela-flip', title: 'Pamela · Oberoende fram- och baksidor', component: 'src/pamela-two-sided-review-client.tsx', props: {clips, comparison, evidence: publicFlipEvidencePath}},
];
const {webpack} = require('next/dist/compiled/webpack/webpack');
const bundles: FileRef[] = [];
for (const entry of entries) {
  const filename = path.join(buildDir, entry.name + '.tsx');
  await writeFile(filename, `import{createRoot}from'react-dom/client';import Component from${JSON.stringify(path.resolve(entry.component))};createRoot(document.getElementById('root')!).render(<Component {...${JSON.stringify(entry.props)}}/>);`);
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({mode: 'production', context: root, target: 'web', entry: filename, output: {path: path.resolve(output), filename: entry.name + '.js', chunkFilename: entry.name + '-[contenthash].js', publicPath: '/'}, devtool: false, optimization: {minimize: false}, resolve: {extensions: ['.tsx', '.ts', '.js', '.json']}, module: {rules: [{test: /\.tsx?$/, exclude: /node_modules/, use: [{loader}]}]}, performance: {hints: false}});
    compiler.run((error: Error | null, stats: BundleStats) => compiler.close((close: Error | null) => error || close || stats?.hasErrors() ? reject(error ?? close ?? Error(stats.toString({all: false, errors: true}))) : resolve()));
  });
  await writeFile(`${output}/${entry.name}.html`, `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${entry.title}</title><style>body{margin:0;background:#121b18}#review-navigation{padding:12px 26px;color:#d6e9dd;background:#20382c;font:14px system-ui}#review-navigation a{color:inherit;margin-right:22px}</style></head><body><nav id="review-navigation"><a href="/pamela-loop.html">Alla granskningsprov</a><a href="/pamela-modular.html">Rum, bord och sko</a><a href="/pamela-flip.html">Kortets fram- och baksida</a></nav><div id="root"></div><script defer src="/${entry.name}.js"></script></body></html>`, {flag: 'wx'});
}
for (const name of await readdir(output)) if (/^pamela-(?:modular|flip)(?:-[a-f0-9]+)?\.(?:js|html)$/.test(name)) {
  const bytes = await readFile(`${output}/${name}`);
  assert.ok(!bytes.toString().includes(root), 'Absolute checkout path leaked into a public bundle');
  if (name.startsWith('pamela-flip') && name.endsWith('.js')) assert.ok(!bytes.toString().includes('/pamela-prov?view='), 'Unmapped local flip-page link');
  bundles.push({path: '/' + name, sha256: hash(bytes)});
}
const section = `<section id="modulara-lager"><h2>Nytt · utbytbara material och riktig kortvändningsrörelse</h2><p>Två separata granskningsprov: byt rum, bord och skons ytskikt medan Pamela rör sig, eller välj fram- och baksida oberoende i fyra kombinationer på samma 12-sekundersrörelse.</p><div class="links"><a href="/pamela-modular.html"><strong>Byt rum, bord och sko →</strong></a><a href="/pamela-flip.html"><strong>Granska kortets fram- och baksida →</strong></a></div><p class="muted">Kandidater med bevarade källrutor. Rummets djup och ljus är författade. Originalkortet är blankt: fram-/baksidesnamnen är ett presentationsschema, inte bevisad fysisk sididentitet. De äldre proven nedan är bevarade.</p><p><a href="/pamela-modular-manifest.json">Scenens källor och filhashar</a> · <a href="/pamela-flip-manifest.json">Kortvändningens verifiering</a></p></section>`;
let overview = await readFile(output + '/pamela-loop.html', 'utf8');
assert.ok(!overview.includes('id="modulara-lager"')); assert.equal(overview.split('</nav>').length, 2);
overview = overview.replace('</nav>', '</nav>' + section);
const snapshotPattern = /<p\b[^>]*>(?:Snapshot:\s*)?pamela-loop-review-[a-z0-9-]+<\/p>/g;
assert.equal([...overview.matchAll(snapshotPattern)].length, 1);
overview = overview.replace(snapshotPattern, `<p id="review-snapshot" class="muted">Snapshot: ${snapshot}</p>`);
await writeFile(output + '/pamela-loop.html', overview);
loopManifest.snapshot = snapshot;
loopManifest.studies.modularStage = {url: '/pamela-modular.html', manifest: '/pamela-modular-manifest.json', sourceSha256: c1P4Sha};
loopManifest.studies.twoSidedFlip = {url: '/pamela-flip.html', manifest: '/pamela-flip-manifest.json', sourceEvidenceSha256: expectedEvidence, sourceSha256: c2P4Sha, combinations: 4, frames: 360, fps: 30, productionAccepted: false};
await writeFile(output + '/pamela-loop-manifest.json', JSON.stringify(loopManifest, null, 2));
const latest = await read(output + '/latest.json');
delete latest.publishedAt;
Object.assign(latest, {snapshot, preparedAt: now, reviewUrl: '/pamela-loop.html#modulara-lager', reviewManifest: '/pamela-loop-manifest.json', modularSceneUrl: '/pamela-modular.html', modularSceneManifest: '/pamela-modular-manifest.json', cardFlipUrl: '/pamela-flip.html', cardFlipManifest: '/pamela-flip-manifest.json', note: 'Current isolated review adds independently selectable room/table/shoe appearances and four front/back combinations. Earlier pages and media retained; no production acceptance.'});
await writeFile(output + '/latest.json', JSON.stringify(latest, null, 2));
const rootManifest = await read(output + '/manifest.json');
Object.assign(rootManifest, {snapshot, latestReview: {url: '/pamela-loop.html#modulara-lager', manifest: '/pamela-loop-manifest.json', status: 'candidate-not-production-accepted'}});
await writeFile(output + '/manifest.json', JSON.stringify(rootManifest, null, 2));
const routes = await read(destination + '/.vercel/output/config.json');
routes.routes.unshift({src: '/pamela-(?:modular|flip).*', headers: {'Cache-Control': 'no-cache, max-age=0, must-revalidate'}, continue: true});
await writeFile(destination + '/.vercel/output/config.json', JSON.stringify(routes));

for (const item of baselineHashes) assert.equal((await ref(item.path)).sha256, item.sha256, 'Frozen R10 packet was modified');
for (const item of code) assert.equal((await ref(item.path)).sha256, item.sha256, `Source changed during export: ${item.path}`);
assert.equal(hash(await readFile(evidencePath)), expectedEvidence, 'Evidence changed during export');
for (const item of [...clips, comparison]) assert.equal(hash(await readFile(output + publicUrl(item.file))), item.sha256);
const receipt = {
  status: 'prepared-not-uploaded', snapshot, preparedAt: now, destination, previous, sourcePacket: previous,
  projectId, teamId, projectName: project.projectName, baselineDeployment: oldReceipt.deploymentId ?? oldReceipt.baselineDeployment,
  sourceEvidence: {path: evidencePath, sha256: expectedEvidence}, sourceCode: code,
  scene: {url: '/pamela-modular.html', sourceSha256: c1P4Sha, motions: catalog.motions.length, manifest: await ref(output + '/pamela-modular-manifest.json')},
  flip: {url: '/pamela-flip.html', sourceSha256: c2P4Sha, combinations: 4, framesPerCombination: 360, fps: 30, comparisonFrames: 81, manifest: await ref(output + '/pamela-flip-manifest.json')},
  bundles, media, newMedia, inherited: {files: inheritedFiles, hardlinkedMedia, priorMutableFileHashesVerifiedUnchanged: baselineHashes},
  currentPageArtifacts: await Promise.all(['pamela-loop.html', 'pamela-loop-manifest.json', 'latest.json', 'manifest.json', 'pamela-modular-manifest.json', 'pamela-flip-manifest.json'].map(async name => ({path: '/' + name, sha256: hash(await readFile(output + '/' + name))}))),
  sourceTransforms: {component: 'src/pamela-two-sided-review-client.tsx', linkSubstitutions: substitutions, workspaceSourceModified: false},
  checks: {movieHashesAndNativeFrameCounts: true, all360FramesFourCombinationsProtected: true, exactC1P4Source: true, oldPacketUnchanged: true, newSourceSnapshotStable: true},
  apiCalls: 0, uploaded: false, productionAccepted: false, browserReview: 'pending-parent-static-review',
};
await writeFile(destination + '/receipt.json', JSON.stringify(receipt, null, 2), {flag: 'wx'});
await copyFile('tools/pamela-modular-public-review.ts', destination + '/modular-export-source.ts', constants.COPYFILE_EXCL);
console.log(JSON.stringify({destination, snapshot, status: receipt.status, scene: receipt.scene.url, flip: receipt.flip.url, newMedia: newMedia.length, inheritedFiles, hardlinkedMedia}));
