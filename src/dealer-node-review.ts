import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDealerMotionContract, type DealerMotionContract, type HashRef, type Motion, type MotionVariant, type Qa } from './dealer-motion-contract.ts';
import { buildReview, canonicalJson, canonicalPlacement, resolveReviewLabel, type LabelsReview, type Projection } from '../tools/dealer-motion-labels.ts';

export type DealerNodeFile = HashRef & { bytesVerified: boolean };
export type DealerNodeReuseFile = HashRef & { verified: true };
/** Authored 2D source samples, never physical side or runtime approval. */
export type DealerNodeReuse = {
  id: string; candidateReuse: true; approvedVariant: false; productionAccepted: false;
  source: DealerNodeReuseFile & { width: number; height: number; fps: number; frames: number };
  evidence: DealerNodeReuseFile; selectionEvidence: DealerNodeReuseFile; selectionReview: DealerNodeReuseFile;
  physicalSide: 'UNKNOWN';
  authoredSidePolicy: { physicalSide: 'UNKNOWN'; segments: { start: number; end: number; side: string }[]; basis: DealerNodeReuseFile; canonicalUvQuarterTurns: number };
  priorObservation: { classification: string; reason: string; evidence: DealerNodeReuseFile };
  geometry: { sourceFrame: number; sampleKind: 'final-frame-sample'; sampleLabel: string; quad: [number, number][];
    centerPx: { x: number; y: number }; orientationDeg: number | null; coordinateSpace: 'source-pixels-x-right-y-down';
    method: string; releaseFrame: null; releaseAngleDeg: null; physical3dYawDeg: null; evidence: DealerNodeReuseFile; evidencePointer: string };
  assets: { landedLayer: DealerNodeReuseFile; masks: (DealerNodeReuseFile & { type: string })[]; uv: DealerNodeReuseFile | null;
    maskSampleFrame: number; maskScope: string; uvRepresentation: string; selectedMovie: DealerNodeReuseFile; patchEvidence: DealerNodeReuseFile | null };
  limitations: string[];
};
export type DealerNodeIdleCandidate = {
  id: string; title: string; candidateReuse: true; approvedVariant: false; productionAccepted: false;
  source: DealerNodeReuseFile; evidence: DealerNodeReuseFile; review: DealerNodeReuseFile; movie: DealerNodeReuseFile;
  sourceStart: number; sourceEndExclusive: number; windowFrames: number; fps: number; blinksPerCycle: number;
  geometry: null; limitation: string;
};
type ReuseInventory = { schemaVersion: 1; project: string; dealerId: string; productionAccepted: false; entries: DealerNodeReuse[]; idleCandidates: DealerNodeIdleCandidate[] };
export type DealerNodeCandidate = {
  assetId: string; file: DealerNodeFile; startFrame: number; endFrameExclusive: number;
  fps: number; width: number; height: number; sourceFrames: number;
  presentation: 'raw-reference' | 'separable-layers'; sourceCards: 'unresolved' | 'separated';
};
export type DealerNodeRequirement = {
  id: string; label: string; target: string | null; from: string; to: string;
  dl1: string; intent: 'REQUESTED'; projection: Projection; sourceMotionIds: string[];
  ref: { document: string; sha256: string; id: string; pointer: string; hashEncoding: 'sorted-key-json-utf8' };
  missing: string[];
};
export type DealerNodeObservation = {
  physicalSideTrack: Motion['sideTrack'];
  physicalSideStatus: 'SOURCE_OBSERVED' | 'AUTHORED_ONLY' | 'UNKNOWN' | 'NOT_APPLICABLE';
  physicalSideEvidence: DealerNodeFile | null;
  localMotionReview: { accepted: boolean | null; scope: string; evidence: DealerNodeFile | null };
  releaseFrame: number | null; filmPath: Motion['filmPath']; hand: 'UNKNOWN';
  geometry: {
    status: 'SOURCE_BOUND' | 'UNKNOWN'; sourceSha256: string | null; spaceId: string | null;
    cardTrack: DealerNodeFile | null; handMask: DealerNodeFile | null;
    bodyGeometry: null; landingPosition: null; landingAngle: null;
  };
};
export type DealerNodeMotion = {
  id: string; label: string; kind: Motion['kind']; target: string | null;
  from: string; to: string; sourceFrom: Motion['from']; sourceTo: Motion['to'];
  dl1: string | null; dl1Intent: 'REQUESTED' | null; dl1Ref: DealerNodeRequirement['ref'] | null;
  requested: Projection | null; dl1UnavailableReason: string | null;
  candidate: DealerNodeCandidate | null; observation: DealerNodeObservation; reuse: DealerNodeReuse | null;
  qa: Qa; note: string; returnMode: Motion['returnMode'];
  variant: {
    status: 'NOT_DECLARED' | 'DECLARED_REQUIRES_QA'; interchangeable: false;
    groupId: string | null; contract: MotionVariant | null; missing: string[];
  };
  runtimeAccepted: false; missing: string[];
};
export type DealerNodeReview = {
  schemaVersion: 1; kind: 'dealer-node-review'; snapshot: string;
  identity: { projectId: string; dealerId: string; bankId: string }; revision: string;
  provenance: { contract: DealerNodeFile; labels: DealerNodeFile; norm: DealerNodeFile; labelGenerator: DealerNodeFile; nodeGenerator: DealerNodeFile; reuseInventory: DealerNodeFile };
  policy: { reviewOnly: true; activeSelection: false; productionAccepted: false; paidJobsAuthorized: false; engineOwnsCardsAndReveal: true };
  states: { id: string; label: string }[];
  targets: { id: string; sourceId: string; recipientId: string; cardOrdinal: number; layoutHandId: string }[];
  anchors: { id: string; pose: string; file: DealerNodeFile }[];
  requirements: DealerNodeRequirement[]; motions: DealerNodeMotion[]; additionalIdleCandidates: DealerNodeIdleCandidate[];
  counts: { motions: number; boundCandidates: number; unboundMotions: number; dl1Requirements: number; dl1LinkedMotions: number; sourceObservedMotions: number; runtimeAccepted: 0 };
  limitations: string[];
};

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CONTRACT = 'references/pamela-motion-contract-v2.json';
const LABELS = 'references/pamela-motion-labels-review.json';
const NORM = 'docs/studio/NAMN-OCH-RORELSESTRANGAR.md';
const LABEL_GENERATOR = 'tools/dealer-motion-labels.ts';
const NODE_GENERATOR = 'src/dealer-node-review.ts';
const REUSE = 'references/pamela-reuse-review.json';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

/** No URLs, traversal, private files or links outside this checkout. */
async function localPath(relative: string): Promise<string> {
  if (!/^(references|runs|media|docs|tools|src)\//.test(relative) || /[\\:%?#]/.test(relative) || relative.split('/').some(part => !part || part.startsWith('.'))) throw Error(`Invalid review path: ${relative}`);
  const resolved = await realpath(path.join(ROOT, relative));
  const within = path.relative(await realpath(ROOT), resolved);
  if (within.startsWith('..') || path.isAbsolute(within)) throw Error(`Review path leaves checkout: ${relative}`);
  return resolved;
}

/** Small metadata is loaded once, while source films are hashed as streams. */
async function metadata<T>(relative: string): Promise<{ value: T; ref: DealerNodeFile }> {
  const bytes = await readFile(await localPath(relative));
  return { value: JSON.parse(bytes.toString()) as T, ref: { path: relative, sha256: hash(bytes), bytesVerified: true } };
}

/** Pure projection for focused tests. Caller supplies verified file references. */
export function projectDealerNodeMotions(contract: DealerMotionContract, labels: LabelsReview, verifiedFiles: ReadonlySet<string>): DealerNodeMotion[] {
  const errors = validateDealerMotionContract(contract);
  if (errors.length) throw Error(errors.join('; '));
  if (labels.identity.projectId !== contract.projectId || labels.identity.dealerId !== contract.dealerId || labels.identity.bankId !== contract.bankId || labels.identity.sourceRevision !== contract.revision) throw Error('Node labels and contract identity/revision mismatch');
  const file = (ref: HashRef): DealerNodeFile => ({ path: ref.path, sha256: ref.sha256, bytesVerified: verifiedFiles.has(`${ref.path}:${ref.sha256}`) });
  const targetOf = (m: Motion): string | null => {
    if (m.cardPlacementId) return canonicalPlacement(contract, m.cardPlacementId);
    const p = contract.cardPlacements.find(p => m.from.kind === 'ACTION_BOUNDARY' && m.from.boundaryId === `release.${p.id}`);
    return p ? canonicalPlacement(contract, p.id) : null;
  };
  const pose = (p: Motion['from']): string => {
    if (p.kind !== 'ACTION_BOUNDARY') return p.kind;
    const placement = contract.cardPlacements.find(t => p.boundaryId === `release.${t.id}`);
    return placement ? `${canonicalPlacement(contract, placement.id)}.RELEASE` : p.boundaryId;
  };
  const byMotion = new Map<string, { value: string; descriptor: ReturnType<typeof resolveReviewLabel>; ref: DealerNodeRequirement['ref'] }>();
  for (const label of labels.labels) {
    const descriptor = resolveReviewLabel(labels, label.value);
    for (const candidate of descriptor.sourceCandidates) {
      const source = contract.motions.find(m => m.id === candidate.motionId);
      if (!source || canonicalJson(candidate.binding) !== canonicalJson(source.binding ? { ...source.binding, asset: contract.assets.find(a => a.id === source.binding!.assetId) } : null)) throw Error(`Label source candidate mismatch: ${candidate.motionId}`);
      if (byMotion.has(candidate.motionId)) throw Error(`Ambiguous DL1 binding: ${candidate.motionId}`);
      byMotion.set(candidate.motionId, { value: label.value, descriptor, ref: { ...label.ref, hashEncoding: 'sorted-key-json-utf8' } });
    }
  }
  return contract.motions.map(m => {
    const asset = m.binding ? contract.assets.find(a => a.id === m.binding!.assetId)! : null;
    const candidate: DealerNodeCandidate | null = m.binding && asset ? {
      assetId: asset.id, file: file(asset), startFrame: m.binding.startFrame, endFrameExclusive: m.binding.endFrameExclusive,
      fps: asset.fps, width: asset.width, height: asset.height, sourceFrames: asset.frames,
      presentation: m.binding.presentation, sourceCards: m.binding.sourceCards,
    } : null;
    const linked = byMotion.get(m.id);
    const physicalEvidence = m.sideTrack?.ranges.some(r => r.method === 'marker-observation') ? file(contract.markerLegend.qa.evidence!) : m.sideTrack?.ranges.some(r => r.method === 'geometry-observation') && m.qa.evidence ? file(m.qa.evidence) : null;
    const observed = !!m.sideTrack?.ranges.some(r => ['marker-observation', 'geometry-observation'].includes(r.method) && r.side !== 'UNKNOWN') && !!physicalEvidence?.bytesVerified && !!candidate?.file.bytesVerified;
    const physicalSideStatus: DealerNodeObservation['physicalSideStatus'] = observed ? 'SOURCE_OBSERVED' : m.sideTrack?.ranges.some(r => r.method === 'authored') ? 'AUTHORED_ONLY' : m.kind === 'deal' ? 'UNKNOWN' : 'NOT_APPLICABLE';
    const variantMissing = [
      ...(!m.variant ? ['Samma start-/slutankare och korttillstånd före/efter är inte deklarerade som utbytbar variant.'] : []),
      ...(m.qa.status !== 'approved' ? ['Rörelsens QA är inte godkänd.'] : []),
      'Ingen runtimeacceptans eller automatisk variantselektion ingår i denna granskning.',
    ];
    const missing = [
      ...(!candidate ? ['Ingen källfilm är bunden till rörelsen.'] : !candidate.file.bytesVerified ? ['Källfilens bytes är inte verifierade.'] : []),
      ...(m.kind === 'deal' && m.releaseFrame === null ? ['Exakt släppruta saknas.'] : []),
      ...(m.kind === 'deal' && physicalSideStatus !== 'SOURCE_OBSERVED' ? ['Fysisk kortsida är inte källobserverad.'] : []),
      ...(!m.geometry ? ['Kalibrerat kortspår och handmask saknas i v2-kontraktet.'] : []),
      'Kroppsgeometri och uppmätt landningsposition/-vinkel saknas i v2-kontraktet.',
      ...(m.binding?.presentation !== 'separable-layers' ? ['Separata produktionslager är inte bundna.'] : []),
      ...(m.qa.status !== 'approved' ? ['Rörelsens QA är inte godkänd.'] : []),
    ];
    return {
      id: m.id, label: m.label, kind: m.kind, target: targetOf(m), from: pose(m.from), to: pose(m.to), sourceFrom: m.from, sourceTo: m.to,
      dl1: linked?.value ?? null, dl1Intent: linked ? 'REQUESTED' : null, dl1Ref: linked?.ref ?? null, requested: linked?.descriptor.projection ?? null,
      dl1UnavailableReason: linked ? null : ['idle', 'approach'].includes(m.kind) ? 'DL1 har ingen stödd handling för denna rörelsetyp. Använd motion-ID.' : 'Ingen DL1-deskriptor pekar på detta motion-ID; ingen sträng har gissats.',
      candidate, reuse: null, observation: {
        physicalSideTrack: m.sideTrack, physicalSideStatus, physicalSideEvidence: physicalEvidence,
        localMotionReview: { accepted: null, scope: 'Ingen separat lokal rörelsebedömning inläst.', evidence: null },
        releaseFrame: m.releaseFrame, filmPath: m.filmPath, hand: 'UNKNOWN',
        geometry: { status: m.geometry ? 'SOURCE_BOUND' : 'UNKNOWN', sourceSha256: m.geometry?.sourceSha256 ?? null, spaceId: m.geometry?.spaceId ?? null,
          cardTrack: m.geometry ? file(m.geometry.cardTrack) : null, handMask: m.geometry ? file(m.geometry.handMask) : null,
          bodyGeometry: null, landingPosition: null, landingAngle: null },
      },
      qa: m.qa, note: m.note, returnMode: m.returnMode,
      variant: { status: m.variant ? 'DECLARED_REQUIRES_QA' : 'NOT_DECLARED', interchangeable: false, groupId: m.variant?.groupId ?? null, contract: m.variant ?? null, missing: variantMissing },
      runtimeAccepted: false, missing,
    };
  });
}

export async function buildDealerNodeReview(snapshot: string): Promise<DealerNodeReview> {
  if (!snapshot.trim()) throw Error('A review snapshot is required');
  const [source, storedLabels, reuse] = await Promise.all([metadata<DealerMotionContract>(CONTRACT), metadata<LabelsReview>(LABELS), metadata<ReuseInventory>(REUSE)]);
  if (reuse.value.schemaVersion !== 1 || reuse.value.project !== source.value.projectId || reuse.value.dealerId !== source.value.dealerId || reuse.value.productionAccepted !== false) throw Error('Reuse inventory identity or review policy mismatch');
  const [normBytes, generatorBytes, nodeBytes] = await Promise.all([NORM, LABEL_GENERATOR, NODE_GENERATOR].map(async p => readFile(await localPath(p))));
  const norm: DealerNodeFile = { path: NORM, sha256: hash(normBytes), bytesVerified: true };
  const labelGenerator: DealerNodeFile = { path: LABEL_GENERATOR, sha256: hash(generatorBytes), bytesVerified: true };
  const nodeGenerator: DealerNodeFile = { path: NODE_GENERATOR, sha256: hash(nodeBytes), bytesVerified: true };
  const currentLabels = buildReview(source.value, { contract: { path: CONTRACT, sha256: source.ref.sha256 }, norm: { path: NORM, sha256: norm.sha256 }, generator: { path: LABEL_GENERATOR, sha256: labelGenerator.sha256 } });
  if (canonicalJson(currentLabels) !== canonicalJson(storedLabels.value)) throw Error('Motion labels are stale: regenerate using tools/dealer-motion-labels.ts --write');
  const refs = new Map<string, HashRef>();
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if ('path' in value && 'sha256' in value && typeof value.path === 'string' && typeof value.sha256 === 'string') refs.set(`${value.path}:${value.sha256}`, { path: value.path, sha256: value.sha256 });
    for (const item of Object.values(value)) collect(item);
  };
  source.value.motions.forEach(m => {
    if (m.binding) collect(source.value.assets.find(a => a.id === m.binding!.assetId));
    collect(m.qa); collect(m.filmPath); collect(m.geometry);
  });
  source.value.anchors.forEach(a => collect(source.value.assets.find(asset => asset.id === a.assetId)));
  collect(source.value.markerLegend.qa);
  collect(reuse.value);
  const verified = new Set<string>();
  const pending = [...refs];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) {
      const [key, ref] = pending.pop()!;
      const digest = createHash('sha256');
      for await (const chunk of createReadStream(await localPath(ref.path))) digest.update(chunk);
      if (digest.digest('hex') !== ref.sha256) throw Error(`Node review file hash mismatch: ${ref.path}`);
      verified.add(key);
    }
  }));
  const motions = projectDealerNodeMotions(source.value, storedLabels.value, verified);
  for (const entry of reuse.value.entries) {
    if (entry.approvedVariant !== false || entry.productionAccepted !== false || entry.physicalSide !== 'UNKNOWN' || entry.geometry.releaseAngleDeg !== null || entry.geometry.physical3dYawDeg !== null) throw Error(`Reuse entry exceeds evidence scope: ${entry.id}`);
    const matches = motions.filter(m => m.candidate?.file.path === entry.source.path && m.candidate.file.sha256 === entry.source.sha256 && entry.geometry.sourceFrame >= m.candidate.startFrame && entry.geometry.sourceFrame < m.candidate.endFrameExclusive);
    if (matches.length !== 1 || matches[0].reuse) throw Error(`Reuse source must identify exactly one v2 motion: ${entry.id}`);
    matches[0].reuse = entry;
  }
  for (const idle of reuse.value.idleCandidates) if (idle.approvedVariant !== false || idle.productionAccepted !== false) throw Error(`Idle candidate exceeds review scope: ${idle.id}`);
  const qaDocs = new Map<string, Record<string, unknown>>();
  for (const m of motions) {
    if (!m.candidate || !m.qa.evidence) continue;
    const ref = m.qa.evidence;
    if (!qaDocs.has(ref.path)) qaDocs.set(ref.path, JSON.parse(await readFile(await localPath(ref.path), 'utf8')));
    const qa = qaDocs.get(ref.path)!;
    const original = qa.original as HashRef | undefined;
    if (typeof qa.localMotionAccepted === 'boolean' && qa.dealerId === source.value.dealerId && original?.path === m.candidate.file.path && original.sha256 === m.candidate.file.sha256) {
      m.observation.localMotionReview = { accepted: qa.localMotionAccepted, scope: typeof qa.acceptanceScope === 'string' ? qa.acceptanceScope : 'Lokal rörelsebedömning, inte lager- eller runtimeacceptans.', evidence: { ...ref, bytesVerified: true } };
    }
  }
  const requirements: DealerNodeRequirement[] = storedLabels.value.labels.map(label => {
    const d = resolveReviewLabel(storedLabels.value, label.value);
    return { id: d.id, label: d.displayLabel, target: d.projection.target === 'NONE' ? null : d.projection.target, from: d.projection.from, to: d.projection.to,
      dl1: label.value, intent: 'REQUESTED', projection: d.projection, sourceMotionIds: d.sourceCandidates.map(m => m.motionId), ref: { ...label.ref, hashEncoding: 'sorted-key-json-utf8' },
      missing: d.blockers };
  });
  const states = new Set(['VILA', 'REDO', 'SHOE', ...motions.flatMap(m => [m.from, m.to]), ...requirements.flatMap(r => [r.from, r.to])]);
  return {
    schemaVersion: 1, kind: 'dealer-node-review', snapshot,
    identity: { projectId: source.value.projectId, dealerId: source.value.dealerId, bankId: source.value.bankId }, revision: source.value.revision,
    provenance: { contract: source.ref, labels: storedLabels.ref, norm, labelGenerator, nodeGenerator, reuseInventory: reuse.ref },
    policy: { reviewOnly: true, activeSelection: false, productionAccepted: false, paidJobsAuthorized: false, engineOwnsCardsAndReveal: true },
    states: [...states].map(id => ({ id, label: id })),
    targets: source.value.cardPlacements.map(p => ({ id: canonicalPlacement(source.value, p.id), sourceId: p.id, recipientId: p.recipientId, cardOrdinal: p.cardOrdinal, layoutHandId: p.layoutHandId })),
    anchors: source.value.anchors.map(a => { const asset = source.value.assets.find(asset => asset.id === a.assetId)!; return { id: a.id, pose: a.pose.kind, file: { path: asset.path, sha256: asset.sha256, bytesVerified: true } }; }),
    requirements, motions, additionalIdleCandidates: reuse.value.idleCandidates,
    counts: { motions: motions.length, boundCandidates: motions.filter(m => m.candidate).length, unboundMotions: motions.filter(m => !m.candidate).length,
      dl1Requirements: requirements.length, dl1LinkedMotions: motions.filter(m => m.dl1).length, sourceObservedMotions: motions.filter(m => m.observation.physicalSideStatus === 'SOURCE_OBSERVED').length, runtimeAccepted: 0 },
    limitations: ['DL1 är REQUESTED metadata; fysisk observation och runtimeacceptans är separata.', 'Samtliga v2-motioner visas även utan film eller DL1. Etikettkoppling sker via sourceCandidates.motionId.', 'Flera filmer för samma mål är kandidater; gemensamma ankare, kort före/efter och godkänd QA krävs för utbytbara varianter.', 'UNKNOWN förblir okänt. Ingen kamerariktning, fysisk 3D-vinkel, geometri eller hand har härletts ur filnamn eller ritad kortsida.'],
  };
}
