import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { studioData } from '../src/media.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(root, '../local-studio/blackjack-studio');
const projectId = 'e19d226c-c586-467e-b126-6a9f90e1675e';
const sourceDirectory = path.join(sourceRoot, 'data/typed-preview', projectId);
const project = JSON.parse(await readFile(path.join(sourceDirectory, 'project.json'), 'utf8'));
if (project.id !== projectId || project.keystoneHash !== '54224fb918c5cb839554381e468ddbf4fdae64008c537150335ad21660db14a9') throw Error('Alternative project identity changed.');
const existing = (await studioData(root, '')).assets;
const records: any[] = [];
let copied = 0;
for (const asset of project.assets) {
  if (!/^[a-f0-9-]+\.(png|mp4)$/i.test(asset.file)) throw Error('Unexpected asset filename');
  const source = path.join(sourceDirectory, 'assets', asset.file);
  for (let part = source; part !== path.dirname(part); part = path.dirname(part)) if ((await lstat(part)).isSymbolicLink()) throw Error('Linked source not permitted');
  const bytes = await readFile(source), sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== asset.sha256) throw Error('Source file no longer matches its project manifest: ' + asset.id);
  let localPath = existing.find(item => item.sha256 === sha256)?.path;
  if (!localPath) {
    localPath = `media/alternative-project/${projectId}/${asset.file}`;
    const directory = path.dirname(path.join(root, localPath)); await mkdir(directory, { recursive: true });
    for (let part = directory; part !== root; part = path.dirname(part)) if ((await lstat(part)).isSymbolicLink()) throw Error('Linked destination not permitted');
    await writeFile(path.join(root, localPath), bytes, { flag: 'wx' }); copied++;
  }
  const shots = (project.shots || []).filter((shot: any) => shot.assetId === asset.id).map((shot: any) => ({ id: shot.id, label: shot.label, startPose: shot.startPose, endPose: shot.endPose, eventId: shot.eventId, filename: shot.filename, reviewed: shot.reviewed === true, reviewedSha256: shot.reviewedSha256 || null, hasSourceCalibration: Boolean(shot.cardCalibration) }));
  records.push({ id: asset.id, label: asset.label, role: asset.role, path: localPath, sha256, bytes: bytes.length, sourceFile: asset.file, sourceModel: asset.metadata?.model || null, sourceTaskId: asset.metadata?.taskId || null, shots });
}
const bank = { projectId, projectName: project.name, sourceRevision: project.revision, sourceRoot, sourceManifest: path.join(sourceDirectory, 'project.json'), verifiedAt: new Date().toISOString(), keystoneHash: project.keystoneHash, localRuntimeUrl: `http://127.0.0.1:4323/skapa?project=${projectId}&play=1`, launchFile: path.join(sourceRoot, 'STARTA.cmd'), runtimeStartedHere: false, visualQA: 'Originalfile bytes verified; not a new visual acceptance.', assets: records };
await writeFile(path.join(root, 'references/alternative-bank.json'), JSON.stringify(bank, null, 2));
const registryPath = path.join(root, 'references/dealers.json');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
for (const asset of records.filter(a => /\.mp4$/i.test(a.path))) {
  if (!registry.assetMappings.some((m: any) => m.path === asset.path && m.sha256 === asset.sha256)) registry.assetMappings.push({ path: asset.path, sha256: asset.sha256, dealerId: 'goran-alternativ-helkropp', evidence: `Källprojekt ${projectId}, revision ${project.revision}; exakta filbytes verifierade. Ingen ny visuell QA.` });
}
const dealer = registry.dealers.find((d: any) => d.id === 'goran-alternativ-helkropp');
dealer.notes = ['Projektkopplingen till blackjack-studio är verifierad med projekt-ID och tre identiska filhashar.', '19 källfilmer, genererad dealer på bildplan i en Three.js-scen; inte en riggad 3D-kropp.', 'Grön inspelningsbakgrund är belagd. Vit bakgrund är inte belagd.'];
dealer.sourceProjectId = projectId;
await writeFile(registryPath, JSON.stringify(registry, null, 2));
const schemePath = path.join(root, 'references/alternative-fullbody.json');
const scheme = JSON.parse(await readFile(schemePath, 'utf8'));
scheme.label = 'Göran · levande blackjack · rev 103';
scheme.sourceRef = `blackjack-studio · projekt ${projectId} · revision ${project.revision}`;
scheme.sourcePath = 'references/alternative-bank.json';
scheme.summary = 'Källprojekt med dealerfilmer och Three.js-komposition. Filhashar verifierade; visuell godkänning och kompatibilitet med Main återstår.';
scheme.transitions = records.flatMap(asset => asset.shots.map((shot: any) => ({ id: shot.id, label: shot.label, from: shot.startPose, to: shot.endPose, clipKey: shot.filename || shot.eventId || shot.id, assetPath: asset.path, evidence: `Källprojekt revision ${project.revision}; SHA ${asset.sha256}. Källans reviewed=${shot.reviewed}. Ingen importerad geometri.`, coordinates: null })));
scheme.states = [...new Set(scheme.transitions.flatMap((t: any) => [t.from, t.to]))].map(id => ({id,label:id}));
scheme.notes = ['Samma projektsamband som den äldre 3D-exporten: ankare, panorama och nickfilm matchar exakt.', 'Källans fack och poser återges; det är inte bevis för skarvfrihet eller kompatibilitet med Main.', 'Kompositionen finns i den separata lokala appen på port 4323. Ingen andra server startas av labbet.'];
await writeFile(schemePath, JSON.stringify(scheme, null, 2));
console.log(JSON.stringify({projectId,revision:project.revision,assets:records.length,videoCount:records.filter(a=>/\.mp4$/i.test(a.path)).length,copied,reused:records.length-copied,transitions:scheme.transitions.length}));
