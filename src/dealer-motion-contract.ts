/** Offline presentation contract and local simulator, never production acceptance.
 * No IO, game rules, random choices or generation. Loaders must verify referenced
 * bytes; this validator checks declared hashes and cross-references only.
 * A transition commits only after the caller finishes the verified motion.
 */
export const DEALER_MOTION_SCHEMA_ID = 'urn:dealerlab:dealer-motion-contract:2.0.0' as const;
export type HashRef = { path: string; sha256: string };
export type Qa = { status: 'pending' | 'rejected' | 'approved'; evidence: HashRef | null; reason: string };
export type Pose = { kind: 'VILA' | 'REDO' } | { kind: 'ACTION_BOUNDARY'; boundaryId: string };
/** to-redo is a card-preserving continuation after release, not a new deal. */
export type ReturnMode = 'none' | 'direct' | 'via-redo' | 'to-redo';
export type PhysicalSide = 'FRONT' | 'BACK' | 'EDGE' | 'UNKNOWN';
export type SideMethod = 'unknown' | 'authored' | 'marker-observation' | 'geometry-observation';
export type Asset = HashRef & { id: string; kind: 'image' | 'video'; width: number; height: number; fps: number; frames: number };
export type Boundary = { nodeId: string; sha256: string; frame: number };
export type Slot = { id: string; recipientId: string; layoutHandId: string; cardOrdinal: number };
export type Binding = { assetId: string; sha256: string; startFrame: number; endFrameExclusive: number; presentation: 'raw-reference' | 'separable-layers'; sourceCards: 'unresolved' | 'separated' };
/** Lossless run-length encoding: every source frame has one explicit side/method. */
export type SideTrack = { sourceSha256: string; markerLegendId: string | null; ranges: { startFrame: number; endFrameExclusive: number; side: PhysicalSide; method: SideMethod }[] };
/** Opt-in interchangeability requirements, never approval or automatic selection.
 * Before/after list required occupied slots; all other board cards are preserved.
 * Contact ranges annotate the source film, never emit another deal or release.
 */
export type MotionVariant = {
  groupId: string;
  hand: 'L' | 'R' | 'BOTH' | 'NONE' | 'UNKNOWN';
  anchors: { start: Boundary; end: Boundary };
  cardsBefore: string[]; cardsAfter: string[];
  contact: { kind: 'no-recontact' } | {
    kind: 'intentional-adjustment'; cardPlacementIds: string[];
    ranges: { startFrame: number; endFrameExclusive: number }[];
  };
};
export type Motion = {
  id: string; label: string; kind: 'idle' | 'approach' | 'deal' | 'return'; from: Pose; to: Pose;
  clipSlotId: string;
  legacyV1: { clipId: string; slotId: string | null } | null;
  cardPlacementId: string | null; returnMode: ReturnMode; binding: Binding | null; qa: Qa;
  releaseFrame: number | null;
  filmPath: { sourceSha256: string; points: { frame: number; pose: Pose }[]; qa: Qa } | null;
  sideTrack: SideTrack | null;
  geometry: { sourceSha256: string; spaceId: string; cardTrack: HashRef; handMask: HashRef } | null;
  variant?: MotionVariant;
  note: string;
};
export type DealerMotionContract = {
  $schema: typeof DEALER_MOTION_SCHEMA_ID; contractVersion: '2.0.0';
  projectId: string; dealerId: string; bankId: string; revision: string;
  status: 'candidate'; activeSelection: false; productionAccepted: false;
  supersedes: HashRef & { contractVersion: string; revision: string };
  scope: { note: string; outOfScope: string[] };
  policy: { preserveBoard: true; automaticReset: false; engineOwnsCardsAndReveal: true; paidJobsAuthorized: false };
  markerLegend: { id: string; front: 'blue'; back: 'yellow'; status: 'proposed' | 'source-verified'; sourceHashes: string[]; qa: Qa };
  assets: Asset[];
  anchors: { id: string; pose: Pose; assetId: string; sha256: string }[];
  cardPlacements: Slot[]; motions: Motion[];
  edgeGates: { from: Boundary; to: Boundary; qa: Qa }[];
  plans: { id: string; anchorId: string; motionIds: string[]; requiredReturnMode: ReturnMode }[];
};
export type BoardCard = {
  instanceId: string; cardPlacementId: string; recipientId: string; layoutHandId: string;
  handId: string; cardOrdinal: number; shoeDraw: number;
  engine: { cardId: string | null; frontAllowed: boolean };
  materials: { front: string | null; back: string; concealed: string };
};
export type DealerMotionState = Readonly<{
  projectId: string; dealerId: string; bankId: string; contractRevision: string;
  roundId: string; pose: Pose; boundary: Boundary;
  board: readonly BoardCard[]; consumedEventIds: readonly string[];
}>;
export type DealEvent = { eventId: string; card: BoardCard };
/** The caller verifies this material mapping and its hash-bound QA evidence.
 * Resolving a front never grants permission to reveal it; only the engine does.
 */
export type CardFrontResolution = { cardId: string; materialId: string; qa: Qa };

const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const ref = (v: HashRef | null | undefined) => !!v && hash(v.sha256) && typeof v.path === 'string' && /^(runs|references|media)\//.test(v.path) && !v.path.includes('\\') && !v.path.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.'));
const pose = (p: Pose) => !!p && (p.kind === 'VILA' || p.kind === 'REDO' || p.kind === 'ACTION_BOUNDARY' && text(p.boundaryId));
const samePose = (a: Pose, b: Pose) => a.kind === b.kind && (a.kind !== 'ACTION_BOUNDARY' || b.kind === 'ACTION_BOUNDARY' && a.boundaryId === b.boundaryId);
const sameBoundary = (a: Boundary, b: Boundary) => a.nodeId === b.nodeId && a.sha256 === b.sha256 && a.frame === b.frame;
const validQa = (q: Qa) => !!q && ['pending', 'rejected', 'approved'].includes(q.status) && text(q.reason) && (q.evidence === null || ref(q.evidence)) && (q.status !== 'approved' || ref(q.evidence));
const unique = (items: { id: string }[]) => Array.isArray(items) && items.every(x => text(x.id)) && new Set(items.map(x => x.id)).size === items.length;
const target = (s: string) => s === 'D' || /^P[1-9]\d*$/.test(s);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function endpoint(c: DealerMotionContract, id: string, side: 'start' | 'end'): { boundary: Boundary; pose: Pose } | null {
  const a = c.anchors.find(a => a.id === id);
  if (a) return { boundary: { nodeId: id, sha256: a.sha256, frame: 0 }, pose: a.pose };
  const m = c.motions.find(m => m.id === id);
  if (!m?.binding) return null;
  return { boundary: { nodeId: id, sha256: m.binding.sha256, frame: side === 'start' ? m.binding.startFrame : m.binding.endFrameExclusive - 1 }, pose: side === 'start' ? m.from : m.to };
}

/** A direct return needs a hash-bound, reviewed path after release, not a name. */
function pathErrors(m: Motion): string[] {
  const e: string[] = [], b = m.binding, p = m.filmPath;
  if (m.returnMode === 'direct' && (m.to.kind !== 'VILA' || m.kind === 'return' && m.from.kind !== 'ACTION_BOUNDARY' || !['deal', 'return'].includes(m.kind))) e.push('Direct return must connect a release action to VILA');
  if (m.returnMode === 'via-redo' && (m.to.kind !== 'VILA' || !['deal', 'return'].includes(m.kind))) e.push('Via-REDO return must end at VILA');
  if (m.returnMode === 'to-redo' && (m.kind !== 'return' || m.from.kind !== 'ACTION_BOUNDARY' || m.to.kind !== 'REDO')) e.push('To-REDO return must connect an action boundary to REDO without dealing');
  if (m.kind === 'return' && m.returnMode === 'none') e.push('Return motion needs an explicit returnMode');
  if (m.kind === 'deal' && m.to.kind === 'VILA' && m.returnMode === 'none') e.push('Deal ending at VILA needs a returnMode');
  if (!p) { if (m.qa.status === 'approved') e.push('Approved motion needs verified film path'); return e; }
  if (!b || p.sourceSha256 !== b.sha256 || !validQa(p.qa) || p.points.length < 2) return [...e, 'Invalid film path binding'];
  if (p.points.some((x, i) => !integer(x.frame) || x.frame < b.startFrame || x.frame >= b.endFrameExclusive || !pose(x.pose) || i > 0 && x.frame <= p.points[i - 1].frame)) e.push('Invalid film path frames');
  const first = p.points[0], last = p.points.at(-1)!;
  if (first.frame !== b.startFrame || last.frame !== b.endFrameExclusive - 1 || !samePose(first.pose, m.from) || !samePose(last.pose, m.to)) e.push('Film path endpoints differ from motion');
  if (m.kind === 'deal' && m.releaseFrame !== null && !p.points.some(x => x.frame === m.releaseFrame && x.pose.kind === 'ACTION_BOUNDARY')) e.push('Release requires an explicit action boundary');
  const after = p.points.filter(x => x.frame >= (m.kind === 'deal' ? m.releaseFrame ?? Infinity : b.startFrame));
  if (m.returnMode === 'direct' && (!after.length || after.some(x => x.pose.kind === 'REDO'))) e.push('Direct return contains REDO or lacks release path');
  if (m.returnMode === 'via-redo' && !after.some(x => x.pose.kind === 'REDO')) e.push('Via-REDO return lacks REDO evidence');
  if (m.qa.status === 'approved' && p.qa.status !== 'approved') e.push('Film path QA not approved');
  return e;
}

const sameSlots = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function variantErrors(c: DealerMotionContract, m: Motion): string[] {
  const v = m.variant, e: string[] = [];
  if (v === undefined) return e;
  if (!v || !text(v.groupId) || !['L', 'R', 'BOTH', 'NONE', 'UNKNOWN'].includes(v.hand)) return ['Invalid variant identity/hand'];
  for (const side of ['start', 'end'] as const) {
    const b = v.anchors?.[side], a = b && c.anchors.find(a => a.id === b.nodeId);
    if (!a || !sameBoundary(b, { nodeId: a.id, sha256: a.sha256, frame: 0 }) || !samePose(a.pose, side === 'start' ? m.from : m.to)) e.push('Invalid variant canonical anchor');
  }
  const slots = (ids: string[]) => Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id => c.cardPlacements.some(s => s.id === id));
  if (!slots(v.cardsBefore) || !slots(v.cardsAfter)) return [...e, 'Invalid variant card state'];
  const expectedAfter = m.kind === 'deal' ? [...v.cardsBefore, m.cardPlacementId!] : v.cardsBefore;
  if (!sameSlots(v.cardsAfter, expectedAfter)) e.push('Variant card effect must match the single engine deal or preserve the board');
  const contact = v.contact;
  if (contact?.kind === 'no-recontact') {
    if ('ranges' in contact || 'cardPlacementIds' in contact) e.push('No-recontact variant cannot contain adjustment metadata');
  } else if (contact?.kind === 'intentional-adjustment') {
    if (!slots(contact.cardPlacementIds) || !contact.cardPlacementIds.length || contact.cardPlacementIds.some(id => !v.cardsAfter.includes(id))) e.push('Invalid variant adjustment targets');
    if (!m.binding || !Array.isArray(contact.ranges) || !contact.ranges.length || contact.ranges.some((r, i) => !integer(r.startFrame) || !integer(r.endFrameExclusive) || r.startFrame < m.binding!.startFrame || r.endFrameExclusive > m.binding!.endFrameExclusive || r.startFrame >= r.endFrameExclusive || i > 0 && r.startFrame < contact.ranges[i - 1].endFrameExclusive)) e.push('Invalid variant adjustment source ranges');
    if (m.kind === 'deal' && contact.cardPlacementIds.includes(m.cardPlacementId!) && (m.releaseFrame === null || contact.ranges.some(r => r.startFrame <= m.releaseFrame!))) e.push('Adjustment of a newly dealt card must follow its original release');
  } else e.push('Invalid variant contact policy');
  return e;
}
function sameVariantAction(a: Motion, b: Motion): boolean {
  const x = a.variant!, y = b.variant!;
  return a.kind === b.kind && a.clipSlotId === b.clipSlotId && a.cardPlacementId === b.cardPlacementId && a.returnMode === b.returnMode
    && samePose(a.from, b.from) && samePose(a.to, b.to)
    && sameBoundary(x.anchors.start, y.anchors.start) && sameBoundary(x.anchors.end, y.anchors.end)
    && sameSlots(x.cardsBefore, y.cardsBefore) && sameSlots(x.cardsAfter, y.cardsAfter)
    && x.contact.kind === y.contact.kind
    && (x.contact.kind !== 'intentional-adjustment' || y.contact.kind === 'intentional-adjustment' && sameSlots(x.contact.cardPlacementIds, y.contact.cardPlacementIds));
}

export function validateDealerMotionContract(value: unknown): string[] {
  const errors: string[] = [];
  try {
    const c = value as DealerMotionContract;
    if (c.$schema !== DEALER_MOTION_SCHEMA_ID || c.contractVersion !== '2.0.0' || ![c.projectId, c.dealerId, c.bankId, c.revision].every(text)) errors.push('Invalid contract identity/version');
    if (c.status !== 'candidate' || c.activeSelection !== false || c.productionAccepted !== false) errors.push('V2 candidate cannot activate or accept production');
    if (!ref(c.supersedes) || !text(c.supersedes.contractVersion) || !text(c.supersedes.revision)) errors.push('Missing hash-bound predecessor');
    if (!text(c.scope.note) || !Array.isArray(c.scope.outOfScope) || !c.scope.outOfScope.every(text)) errors.push('Invalid pilot scope');
    if (c.policy.preserveBoard !== true || c.policy.automaticReset !== false || c.policy.engineOwnsCardsAndReveal !== true || c.policy.paidJobsAuthorized !== false) errors.push('Unsafe presentation policy');
    for (const [name, items] of [['assets', c.assets], ['anchors', c.anchors], ['cardPlacements', c.cardPlacements], ['motions', c.motions], ['plans', c.plans]] as const) if (!unique(items)) errors.push(`Invalid/duplicate ${name}`);
    if (new Set([...c.anchors, ...c.motions].map(x => x.id)).size !== c.anchors.length + c.motions.length) errors.push('Ambiguous node identity');
    for (const a of c.assets) if (!ref(a) || !integer(a.width) || a.width < 1 || !integer(a.height) || a.height < 1 || !integer(a.frames) || a.frames < 1 || (a.kind === 'video' ? !(Number.isFinite(a.fps) && a.fps > 0) : a.kind !== 'image' || a.fps !== 0 || a.frames !== 1)) errors.push(`Invalid asset: ${a.id}`);
    for (const a of c.anchors) if (!pose(a.pose) || !c.assets.some(x => x.id === a.assetId && x.kind === 'image' && x.sha256 === a.sha256)) errors.push(`Invalid anchor: ${a.id}`);
    if (!c.anchors.some(a => a.pose.kind === 'VILA') || !c.anchors.some(a => a.pose.kind === 'REDO')) errors.push('VILA and REDO anchors required');
    for (const s of c.cardPlacements) if (!target(s.recipientId) || !text(s.layoutHandId) || !integer(s.cardOrdinal) || s.cardOrdinal < 1) errors.push(`Invalid slot: ${s.id}`);
    if (new Set(c.cardPlacements.map(s => `${s.recipientId}/${s.layoutHandId}/${s.cardOrdinal}`)).size !== c.cardPlacements.length) errors.push('Duplicate recipient/hand/ordinal slot');
    const legend = c.markerLegend;
    if (!text(legend.id) || legend.front !== 'blue' || legend.back !== 'yellow' || !['proposed', 'source-verified'].includes(legend.status) || !validQa(legend.qa) || !Array.isArray(legend.sourceHashes) || legend.sourceHashes.some(x => !hash(x) || !c.assets.some(a => a.sha256 === x)) || legend.status === 'source-verified' && (!legend.sourceHashes.length || legend.qa.status !== 'approved')) errors.push('Invalid marker legend/source evidence');
    for (const m of c.motions) {
      if (!text(m.label) || !text(m.clipSlotId) || !pose(m.from) || !pose(m.to) || !['idle', 'approach', 'deal', 'return'].includes(m.kind) || !['none', 'direct', 'via-redo', 'to-redo'].includes(m.returnMode) || !validQa(m.qa)) errors.push(`Invalid motion: ${m.id}`);
      if (m.legacyV1 !== null && (!text(m.legacyV1.clipId) || m.legacyV1.slotId !== null && !text(m.legacyV1.slotId))) errors.push(`Invalid v1 crosswalk: ${m.id}`);
      if (m.kind === 'deal' ? !c.cardPlacements.some(s => s.id === m.cardPlacementId) : m.cardPlacementId !== null) errors.push(`Invalid motion slot: ${m.id}`);
      if (m.kind === 'idle' && (!samePose(m.from, m.to) || m.from.kind !== 'VILA') || m.kind === 'approach' && (m.from.kind !== 'VILA' || m.to.kind !== 'REDO') || !['deal', 'return'].includes(m.kind) && m.returnMode !== 'none') errors.push(`Invalid motion route: ${m.id}`);
      const b = m.binding, a = b && c.assets.find(a => a.id === b.assetId);
      if (b && (!a || a.kind !== 'video' || a.sha256 !== b.sha256 || !integer(b.startFrame) || !integer(b.endFrameExclusive) || b.endFrameExclusive <= b.startFrame || b.endFrameExclusive > a.frames || !['raw-reference', 'separable-layers'].includes(b.presentation) || !['unresolved', 'separated'].includes(b.sourceCards))) errors.push(`Invalid hash/frame binding: ${m.id}`);
      if (m.releaseFrame !== null && (!b || m.kind !== 'deal' || !integer(m.releaseFrame) || m.releaseFrame < b.startFrame || m.releaseFrame >= b.endFrameExclusive)) errors.push(`Invalid release cue: ${m.id}`);
      if (m.qa.status === 'approved' && (!b || b.presentation !== 'separable-layers' || b.sourceCards !== 'separated' || m.kind === 'deal' && m.releaseFrame === null)) errors.push(`Unsafe approved motion: ${m.id}`);
      const g = m.geometry;
      if (g && (!b || g.sourceSha256 !== b.sha256 || !text(g.spaceId) || !ref(g.cardTrack) || !ref(g.handMask))) errors.push(`Invalid geometry binding: ${m.id}`);
      if (m.qa.status === 'approved' && m.kind === 'deal' && !g) errors.push(`Missing approved geometry: ${m.id}`);
      const t = m.sideTrack;
      if (t) {
        if (!b || t.sourceSha256 !== b.sha256 || t.markerLegendId !== null && t.markerLegendId !== legend.id) errors.push(`Invalid side-track hash/legend: ${m.id}`);
        let frame = b?.startFrame;
        for (const r of t.ranges) {
          if (r.startFrame !== frame || !integer(r.endFrameExclusive) || r.endFrameExclusive <= r.startFrame || !['FRONT', 'BACK', 'EDGE', 'UNKNOWN'].includes(r.side) || !['unknown', 'authored', 'marker-observation', 'geometry-observation'].includes(r.method) || r.method === 'unknown' && r.side !== 'UNKNOWN') errors.push(`Invalid side-track coverage/method: ${m.id}`);
          if (r.method === 'marker-observation' && (t.markerLegendId !== legend.id || legend.status !== 'source-verified' || !legend.sourceHashes.includes(t.sourceSha256))) errors.push(`Unverified marker observation: ${m.id}`);
          frame = r.endFrameExclusive;
        }
        if (!t.ranges.length || frame !== b?.endFrameExclusive) errors.push(`Incomplete side-track: ${m.id}`);
      }
      if (b && m.kind === 'deal' && !t) errors.push(`Missing side-track: ${m.id}`);
      errors.push(...pathErrors(m).map(e => `${e}: ${m.id}`));
      errors.push(...variantErrors(c, m).map(e => `${e}: ${m.id}`));
    }
    const variantGroups = new Map<string, Motion>();
    for (const m of c.motions) if (m.variant && !variantErrors(c, m).length) {
      const first = variantGroups.get(m.variant.groupId);
      if (first && !sameVariantAction(first, m)) errors.push(`Incompatible variant group: ${m.variant.groupId}`);
      else if (!first) variantGroups.set(m.variant.groupId, m);
    }
    const pairs = new Set<string>();
    for (const g of c.edgeGates) {
      const from = endpoint(c, g.from.nodeId, 'end'), to = endpoint(c, g.to.nodeId, 'start');
      const id = `${g.from.nodeId}>${g.to.nodeId}`;
      if (!validQa(g.qa) || pairs.has(id) || !from || !to || !c.motions.some(m => m.id === g.to.nodeId) || !sameBoundary(from.boundary, g.from) || !sameBoundary(to.boundary, g.to) || !samePose(from.pose, to.pose)) errors.push(`Stale/incompatible endpoint gate: ${id}`);
      pairs.add(id);
    }
    for (const p of c.plans) if (!c.anchors.some(a => a.id === p.anchorId) || !p.motionIds.length || p.motionIds.some(id => !c.motions.some(m => m.id === id)) || !['none', 'direct', 'via-redo', 'to-redo'].includes(p.requiredReturnMode)) errors.push(`Invalid plan references: ${p.id}`);
  } catch { errors.push('Malformed dealer motion contract'); }
  return errors;
}

function assertContract(c: DealerMotionContract) { const e = validateDealerMotionContract(c); if (e.length) throw Error(e.join('; ')); }
function blockers(m: Motion): string[] {
  const e = [];
  if (!m.binding) e.push('missing-media');
  else if (m.binding.presentation !== 'separable-layers' || m.binding.sourceCards !== 'separated') e.push('source-cards-not-separated');
  if (m.qa.status !== 'approved') e.push(`qa-${m.qa.status}`);
  if (m.filmPath?.qa.status !== 'approved') e.push('film-path-not-approved');
  if (m.kind === 'deal' && !m.geometry) e.push('missing-geometry');
  return e;
}

/** Plans symbolic paths even when media is missing. Never edits approvals. */
export function planDealerSequence(c: DealerMotionContract, request: DealerMotionContract['plans'][number]) {
  assertContract(c);
  const a = c.anchors.find(a => a.id === request.anchorId);
  if (!a || !request.motionIds.length || !['none', 'direct', 'via-redo', 'to-redo'].includes(request.requiredReturnMode)) throw Error('Invalid planning request');
  let currentPose = a.pose, previous = a.id;
  const issues: { motionId: string; reason: string }[] = [];
  const steps = request.motionIds.map(id => {
    const m = c.motions.find(m => m.id === id);
    if (!m) throw Error(`Unknown planned motion: ${id}`);
    const reasons = blockers(m);
    if (!samePose(currentPose, m.from)) reasons.push('pose-path-mismatch');
    const from = endpoint(c, previous, 'end'), to = endpoint(c, id, 'start');
    if (!from || !to || !c.edgeGates.some(g => g.qa.status === 'approved' && sameBoundary(g.from, from.boundary) && sameBoundary(g.to, to.boundary))) reasons.push('missing-approved-entry-gate');
    reasons.forEach(reason => issues.push({ motionId: id, reason }));
    currentPose = m.to; previous = id;
    return { motionId: id, from: m.from, to: m.to, returnMode: m.returnMode, cardPlacementId: m.cardPlacementId, binding: m.binding };
  });
  if (request.requiredReturnMode !== 'none') {
    const lastDeal = steps.findLastIndex(s => c.motions.find(m => m.id === s.motionId)!.kind === 'deal');
    const ending = steps.slice(lastDeal < 0 ? 0 : lastDeal);
    const requiredEndPose = request.requiredReturnMode === 'to-redo' ? 'REDO' : 'VILA';
    if (currentPose.kind !== requiredEndPose || steps.at(-1)?.returnMode !== request.requiredReturnMode) issues.push({ motionId: previous, reason: 'required-return-not-satisfied' });
    if (request.requiredReturnMode === 'direct' && ending.some((s, i) => s.to.kind === 'REDO' || i > 0 && s.from.kind === 'REDO' || s.returnMode === 'via-redo')) issues.push({ motionId: previous, reason: 'direct-return-visits-REDO-after-final-deal' });
  }
  return freeze({ planId: request.id, steps: structuredClone(steps), issues, readyForLocalSimulation: issues.length === 0, runtimeApproved: false as const, productionAccepted: false as const });
}

function boardErrors(c: DealerMotionContract, board: readonly BoardCard[]): string[] {
  const e: string[] = [];
  if (!Array.isArray(board)) return ['Invalid board'];
  for (const card of board) {
    const s = c.cardPlacements.find(s => s.id === card.cardPlacementId);
    if (!s || !text(card.instanceId) || !text(card.handId) || !integer(card.shoeDraw) || s.recipientId !== card.recipientId || s.layoutHandId !== card.layoutHandId || s.cardOrdinal !== card.cardOrdinal || !card.engine || typeof card.engine.frontAllowed !== 'boolean' || card.engine.cardId !== null && !text(card.engine.cardId) || card.engine.frontAllowed && !text(card.engine.cardId) || !card.materials || !text(card.materials.back) || !text(card.materials.concealed) || card.materials.front !== null && !text(card.materials.front)) e.push('Invalid card/hand/reveal/material state');
  }
  for (const values of [board.map(x => x.instanceId), board.map(x => x.cardPlacementId), board.map(x => x.shoeDraw), board.map(x => `${x.recipientId}/${x.handId}/${x.cardOrdinal}`)]) if (new Set(values).size !== values.length) e.push('Duplicate card instance, shoe draw or occupied slot');
  const hands = new Map<string, string>();
  for (const card of board) { const key = `${card.recipientId}/${card.layoutHandId}`, hand = hands.get(key); if (hand && hand !== card.handId) e.push('One layout hand cannot contain different engine hands'); hands.set(key, card.handId); }
  return e;
}
function stateErrors(c: DealerMotionContract, s: DealerMotionState): string[] {
  try {
    const e = boardErrors(c, s.board), end = endpoint(c, s.boundary.nodeId, 'end');
    if (s.projectId !== c.projectId || s.dealerId !== c.dealerId || s.bankId !== c.bankId || s.contractRevision !== c.revision || !text(s.roundId)) e.push('State belongs to another contract/round');
    if (!end || !sameBoundary(end.boundary, s.boundary) || !samePose(end.pose, s.pose)) e.push('Stale state endpoint/pose');
    const prior = c.motions.find(m => m.id === s.boundary.nodeId);
    if (prior && blockers(prior).length) e.push('Previous motion is not approved');
    if (!Array.isArray(s.consumedEventIds) || !s.consumedEventIds.every(text) || new Set(s.consumedEventIds).size !== s.consumedEventIds.length) e.push('Invalid event journal');
    return e;
  } catch { return ['Malformed presentation state']; }
}
export function initialDealerMotionState(c: DealerMotionContract, anchorId: string, roundId: string, board: readonly BoardCard[] = []): DealerMotionState {
  assertContract(c); const a = c.anchors.find(a => a.id === anchorId), end = endpoint(c, anchorId, 'end'), e = boardErrors(c, board);
  if (!a || !end || !text(roundId) || e.length) throw Error(['Invalid initial state', ...e].join('; '));
  return freeze({ projectId: c.projectId, dealerId: c.dealerId, bankId: c.bankId, contractRevision: c.revision, roundId, pose: structuredClone(a.pose), boundary: end.boundary, board: structuredClone(board), consumedEventIds: [] });
}
export function checkDealerMotionTransition(c: DealerMotionContract, s: DealerMotionState, motionId: string, event?: DealEvent): string[] {
  const e = validateDealerMotionContract(c); if (e.length) return e;
  e.push(...stateErrors(c, s)); if (e.length) return e;
  const m = c.motions.find(m => m.id === motionId);
  if (!m) return [...e, 'Unknown motion'];
  e.push(...blockers(m)); if (!samePose(s.pose, m.from)) e.push('Pose mismatch');
  if (m.variant?.cardsBefore.some(id => !s.board.some(card => card.cardPlacementId === id))) e.push('Variant card precondition not satisfied');
  const next = endpoint(c, motionId, 'start');
  if (!next || !c.edgeGates.some(g => g.qa.status === 'approved' && sameBoundary(g.from, s.boundary) && sameBoundary(g.to, next.boundary))) e.push('Endpoint compatibility gate not approved');
  if (m.kind === 'deal') {
    if (!event || !text(event.eventId) || !event.card || event.card.cardPlacementId !== m.cardPlacementId) e.push('Matching engine deal event required');
    else {
      if (s.consumedEventIds.includes(event.eventId)) e.push('Engine event already consumed');
      e.push(...boardErrors(c, [...s.board, event.card]));
    }
  } else if (event) e.push('Only a deal motion may add a card');
  return e;
}
export function applyDealerMotionTransition(c: DealerMotionContract, s: DealerMotionState, motionId: string, event?: DealEvent): DealerMotionState {
  const e = checkDealerMotionTransition(c, s, motionId, event); if (e.length) throw Error(e.join('; '));
  const m = c.motions.find(m => m.id === motionId)!, next = endpoint(c, motionId, 'end')!;
  return freeze({ ...structuredClone(s), pose: structuredClone(m.to), boundary: next.boundary, board: structuredClone(event ? [...s.board, event.card] : [...s.board]), consumedEventIds: event ? [...s.consumedEventIds, event.eventId] : [...s.consumedEventIds] });
}

/** Engine visibility changes are separate from the film's physical side. */
export function applyDealerReveal(c: DealerMotionContract, s: DealerMotionState, signal: { eventId: string; instanceId: string; cardId: string | null; frontAllowed: boolean }, front?: CardFrontResolution): DealerMotionState {
  assertContract(c); const e = stateErrors(c, s), card = s.board.find(x => x.instanceId === signal.instanceId);
  if (!text(signal.eventId) || s.consumedEventIds.includes(signal.eventId) || !card) e.push('Unknown card or consumed reveal event');
  if (card?.engine.cardId && signal.cardId !== card.engine.cardId) e.push('Reveal cannot replace card identity');
  if (front && (!text(front.cardId) || front.cardId !== signal.cardId || !text(front.materialId) || !validQa(front.qa) || front.qa.status !== 'approved')) e.push('Invalid verified front material resolution');
  if (signal.frontAllowed === true && (!text(card?.materials.front) || card?.engine.cardId !== signal.cardId) && !front) e.push('Verified front material resolution required for reveal');
  const board = s.board.map(x => x.instanceId === signal.instanceId ? {
    ...structuredClone(x),
    engine: { cardId: signal.cardId, frontAllowed: signal.frontAllowed },
    materials: { ...x.materials, front: front?.materialId ?? (x.engine.cardId === signal.cardId ? x.materials.front : null) },
  } : structuredClone(x));
  e.push(...boardErrors(c, board)); if (e.length) throw Error(e.join('; '));
  return freeze({ ...structuredClone(s), board, consumedEventIds: [...s.consumedEventIds, signal.eventId] });
}
export function sideAtFrame(track: SideTrack, sourceSha256: string, frame: number) {
  if (!hash(sourceSha256) || track.sourceSha256 !== sourceSha256 || !integer(frame)) throw Error('Side-track source/frame mismatch');
  const matches = track.ranges.filter(r => frame >= r.startFrame && frame < r.endFrameExclusive);
  if (matches.length !== 1) throw Error('Missing/ambiguous frame side');
  return freeze({ side: matches[0].side, method: matches[0].method });
}
export function presentedDealerCardMaterial(card: BoardCard, side: PhysicalSide): { surface: PhysicalSide | 'CONCEALED'; materialId: string | null } {
  if (!['FRONT', 'BACK', 'EDGE', 'UNKNOWN'].includes(side)) throw Error('Unknown physical side');
  if (side === 'EDGE') return { surface: 'EDGE', materialId: null };
  if (side === 'BACK') return { surface: 'BACK', materialId: card.materials.back };
  if (side === 'FRONT' && card.engine.frontAllowed === true && text(card.engine.cardId) && text(card.materials.front)) return { surface: 'FRONT', materialId: card.materials.front };
  return { surface: 'CONCEALED', materialId: card.materials.concealed };
}
