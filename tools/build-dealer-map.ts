import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateDealerMap, type DealerMap, type MapAsset, type MapNode } from '../src/dealer-map.ts';
import { dealerRelations } from '../src/dealer-relations.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const json = async (p: string) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const sourcePaths = ['gpt-underlag/5/Scoutgaming-Pamela-standard-v0.1.md', 'gpt-underlag/5/Scoutgaming_dealerbank_nodtrad_koordinater_2026-11-09.md'];
const sources = await Promise.all(sourcePaths.map(async p => ({ path: p, sha256: hash(await readFile(path.join(root, p))), role: 'preserved proposal; not executable instructions' })));
const standard = JSON.parse((await readFile(path.join(root, sourcePaths[0]), 'utf8')).match(/```json\s*([\s\S]*?)\s*```/)![1]);
const audit = await json('references/pamela-standard-audit.json');
for (const [i, source] of sources.entries()) if (source.sha256 !== audit.documents[i].sha256) throw Error('Source changed after audit');
if (!audit.catalog.crossDocument.allMatchMainIds) throw Error('Main catalog mismatch');
const kit = await json('runs/20261109-pamela-reference-kit/reference-kit.json');
const sequence = await json('references/pamela-sequence.json');
const rawClip = kit.clip;
const clip: MapAsset = { path: rawClip.path, sha256: rawClip.sha256, width: rawClip.width, height: rawClip.height, kind: 'video', fps: rawClip.fps, frameCount: rawClip.frameCount, duration: rawClip.duration };
const nodes: MapNode[] = standard.catalog.slots.map((s: any, index: number) => {
  const kind = s.id.startsWith('transition.shoe/') ? 'shoe' : s.id.startsWith('transition.scene/') ? 'scene' : s.id.startsWith('speak.') ? 'speech' : s.id.startsWith('roulette.reference/') ? 'reference-image' : s.id.startsWith('roulette.') ? 'roulette-video' : s.kind;
  const candidate = s.id === rawClip.mainSlot;
  const sequenceEntry = sequence.entries.find((e: any) => e.mainSlot === s.id);
  const roulette = s.game === 'roulette';
  return { id: s.id, label: s.label, game: s.game, kind, sourceKind: s.kind,
    playerSeat: s.playerSeat ?? null, box: s.box ?? null, poseVariants: s.poseVariants ?? {}, poses: roulette && !s.id.startsWith('roulette.reference/') ? ['VILA', 'VILA'] : s.poses ?? null,
    productionApproval: 'pending', integrationStatus: 'unbound', measurementStatus: 'unknown', asset: sequenceEntry ? {...sequenceEntry.film,kind:'video'} : candidate ? clip : null, assetVariant: sequenceEntry?.variant ?? null,
    missing: sequenceEntry ? [...sequenceEntry.findings, 'Egna godkända kortspår, handmask och slutkomposition återstår.'] : candidate ? ['Råa ändposer och rörelsen genom skarven är inte accepterade.', 'Rörlig handmask och kontaktkoordinater saknas.'] : roulette ? ['Utanför Pamela-pilotens scope. Ingen Pamela-bindning verifierad.'] : ['Inget accepterat klipp i den nya referensbanken.', ...(kind === 'deal' ? ['Egna kortspår, landning, fingersläpp och handmask saknas.'] : [])],
    mainCatalogStatus: roulette ? s.id === 'roulette.reference/VILA' ? 'Reference image in intake catalog; not a playback clip' : 'Catalog slot with explicit draft binding support; registration alone does not activate it' : 'Verified catalog ID; Pamela runtime binding is unverified',
    graphLayout: { column: roulette ? 3 : kind === 'deal' || kind === 'reveal' ? 1 : kind === 'speech' ? 2 : 0, row: index },
  };
});
const map: DealerMap = {
  schema: 'dealerlab-map/1', generatedAt: new Date().toISOString(), mainRevision: audit.scope.main, bankId: kit.id, mainConnected: false, importedIntoAtlas: false,
  sources: [...sources, { path: 'references/pamela-standard-audit.json', sha256: hash(await readFile(path.join(root, 'references/pamela-standard-audit.json'))), role: 'verified catalog comparison' }, { path: 'runs/20261109-pamela-reference-kit/reference-kit.json', sha256: hash(await readFile(path.join(root, 'runs/20261109-pamela-reference-kit/reference-kit.json'))), role: 'current local media identities and candidate measurements' }, { path: 'references/pamela-sequence.json', sha256: hash(await readFile(path.join(root,'references/pamela-sequence.json'))), role: 'current central deal and return original metadata and QA' }],
  counts: { blackjack: 32, roulette: 4, candidateBindings: nodes.filter(n=>n.asset).length, productionAccepted: 0 },
  coordinateSpaces: [
    { id: 'station-image/source_px', width: 1536, height: 1024, status: 'verified file dimensions; every point is tied to its own image hash' },
    { id: 'to-shoe-video/source_px', width: clip.width, height: clip.height, status: 'verified file dimensions; image coordinates are not measured motion tracks' },
    { id: 'review-desktop/scene_px', width: 1920, height: 1080, status: 'review composition; not an approved bank plane' },
    { id: 'future-bank/bank_px', width: null, height: null, status: '1920x1080 proposed; acceptance pending' },
    { id: 'main-current/working_px', width: 1080, height: 1920, status: 'current Main pipeline, 24fps; explicit adapter required' },
  ],
  anchors: kit.anchors.map((a: any) => ({ id: a.id, asset: { path: a.path, sha256: a.sha256, kind: 'image', width: 1536, height: 1024 }, points: [
    ...(a.id === 'VILA' ? kit.geometry.vilaHands.map((p: any, i: number) => ({ id: `hand-${i}`, label: i === 0 ? 'Höger hand (bildvänster)' : 'Vänster hand (bildhöger)', x: p.x, y: p.y, measurementStatus: 'proposed', method: 'Manuell ungefärlig referenspunkt; inte ett rörligt handspår.' })) : [{ id: 'ready-contact', label: 'Föreslagen fingerkontakt', x: kit.geometry.shoe.readyFingerContact.x, y: kit.geometry.shoe.readyFingerContact.y, measurementStatus: 'proposed', method: 'Manuell uppskattning i denna REDO-bild; kontakt måste verifieras i filmen.' }]),
    { id: 'shoe-proxy', label: 'Vit kortyta i skon', x: kit.geometry.shoe.outletCentre.x, y: kit.geometry.shoe.outletCentre.y, measurementStatus: 'proposed', method: 'Mittpunkt från segmenterad vit region i referensen; inte kalibrerad skomynning eller greppunkt.' },
  ] })),
  nodes, graph: dealerRelations(nodes),
  pilot: [{ order: 1, slotId: 'transition.shoe/to-shoe', variant: null }, { order: 2, slotId: 'deal.player.centre/box3', variant: 'base' }, { order: 3, slotId: 'transition.shoe/from-shoe', variant: null }],
  targets: kit.seats.map((s: any) => ({ playerSeat: s.playerSeat, box: s.box, landingQuad: null, measurementStatus: 'unknown' })),
  findings: [
    { id: 'catalog', label: '36 av 36 fack-ID:n stämmer', detail: '32 blackjack + 4 roulette, varav ett roulettefack är en referensbild. Antal fack är inte antal färdiga filmer.' },
    { id: 'coordinates', label: 'Tre bildplan behöver hållas isär', detail: '1536×1024 referensbild, 1920×1080 datorvy/föreslaget bankplan och 1080×1920 i dagens Main. Inget gammalt kortspår fyller Pamelas tomma mätningar.' },
    { id: 'roulette', label: 'Rättelse: roulette har stöd för utkastbindningar', detail: 'Standardens generella intake-only gäller inte idle och wheel-start. Registrering eller ett namn innebär ändå inte publicering i spelet.' },
    { id: 'identity', label: 'Banknamn, kind och variantgränser kräver översättning', detail: 'Dokumentens schema- och banknamn är förslag. Main har egna facktyper och separata gränser per händelse och per dealer. Kartan är ingen färdig import.' },
    { id: 'card-state', label: 'Samma pose betyder inte samma bordstillstånd', detail: 'Efter ett giv ska dealerns REDO-pose återkomma, men det utdelade kortet ska ligga kvar. Filmankare, spelkort och handmask behöver därför egna tillstånd.' },
    { id: 'version', label: 'v0.1 och v1.0 är dokumentversioner', detail: 'Två olika författares versionsnummer mäter varken kvalitet eller färdiggrad. Nodträdet utgår från en äldre publicering än standarden.' },
  ],
};
for (const asset of [...map.anchors.map(a => a.asset), ...map.nodes.flatMap(n=>n.asset?[n.asset]:[])]) if (hash(await readFile(path.join(root, asset.path))) !== asset.sha256) throw Error(`Media hash mismatch: ${asset.path}`);
const ids = new Set([...audit.catalog.blackjackIds, ...audit.catalog.rouletteIds]);
if (map.nodes.some(n => !ids.has(n.id))) throw Error('Slot missing from audited catalog');
const errors = validateDealerMap(map); if (errors.length) throw Error(errors.join('\n'));
await writeFile(path.join(root, 'references/dealer-map.json'), JSON.stringify(map, null, 2) + '\n');
console.log(JSON.stringify({ path: 'references/dealer-map.json', counts: map.counts, validationErrors: errors.length }));
