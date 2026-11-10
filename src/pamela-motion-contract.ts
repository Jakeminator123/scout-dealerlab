/** Presentation-only contracts. No game rules, random selection, card values or shoe logic.
 * applyMotionTransition commits presentation state AFTER the caller finishes a validated clip.
 * This module performs no IO. File bytes must be verified by the loader against the declared hashes.
 */
export const PAMELA_MOTION_VERSION = '1.0.0' as const;
export const PAMELA_MOTION_SCHEMA_ID = 'urn:dealerlab:pamela-motion-contract:1.0.0' as const;
export type Pose = 'VILA' | 'REDO';
export type Seat = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Ordinal = 1 | 2;
export type HashRef = { path: string; sha256: string };
export type Qa = { status: 'pending' | 'rejected' | 'approved'; evidence: HashRef | null; reason: string };
export type MotionAsset = HashRef & { id: string; kind: 'image' | 'video'; width: number; height: number; fps: number; frames: number; role: string };
export type ClipBinding = { assetId: string; sha256: string; startFrame: number; endFrameExclusive: number; presentation: 'raw-reference' | 'baked-reference' | 'separable-layers' };
export type MotionClip = { id: string; label: string; kind: 'idle' | 'bridge' | 'deal'; from: Pose; to: Pose; seat: Seat | null; ordinal: Ordinal | null; slotId: string | null; binding: ClipBinding | null; qa: Qa; note: string };
export type CardSlot = { id: string; seat: Seat; ordinal: Ordinal; presentationTemplateId: string };
export type Anchor = { id: string; pose: Pose; assetId: string; sha256: string };
export type Boundary = { nodeId: string; sha256: string; frame: number };
export type EdgeGate = { from: Boundary; to: Boundary; qa: Qa };
export type MotionContract = {
  $schema: typeof PAMELA_MOTION_SCHEMA_ID;
  contractVersion: typeof PAMELA_MOTION_VERSION;
  dealerId: 'pamela-pilot'; bankId: 'pamela-workspace-v1'; revision: string;
  presentationPolicy: { preserveAlreadyDealtCards: true; automaticEmptyTableReset: false; automaticIdleLoop: false; appearanceOwnedByCaller: true; gameLogicIncluded: false };
  assets: MotionAsset[]; anchors: Anchor[]; clips: MotionClip[]; cardSlots: CardSlot[]; edgeGates: EdgeGate[];
  generationPlan: { status: 'planning-only'; newPaidJobsAuthorizedByContract: false; preferredRawSeconds: number; cutRule: 'original-integer-frames-only'; note: string };
};
export type PresentedCard = Readonly<{ id: string; appearanceId: string; slotId: string }>;
export type MotionState = Readonly<{ contractVersion: string; contractRevision: string; dealerId: string; bankId: string; pose: Pose; boundary: Boundary; alreadyDealtCards: readonly PresentedCard[] }>;
export type MissingClip = { clipId: string; reasons: string[] };

const hashPattern = '^[a-f0-9]{64}$';
const hashRefSchema = { type: 'object', required: ['path', 'sha256'], properties: { path: { type: 'string', minLength: 1 }, sha256: { type: 'string', pattern: hashPattern } }, additionalProperties: false };
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
/** Standard JSON Schema for consumers; validateMotionContract adds cross-reference semantics. */
export const PAMELA_MOTION_CONTRACT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: PAMELA_MOTION_SCHEMA_ID, type: 'object', additionalProperties: false,
  required: ['$schema', 'contractVersion', 'dealerId', 'bankId', 'revision', 'presentationPolicy', 'assets', 'anchors', 'clips', 'cardSlots', 'edgeGates', 'generationPlan'],
  properties: {
    $schema: { const: PAMELA_MOTION_SCHEMA_ID }, contractVersion: { const: PAMELA_MOTION_VERSION }, dealerId: { const: 'pamela-pilot' }, bankId: { const: 'pamela-workspace-v1' }, revision: { type: 'string', minLength: 1 },
    presentationPolicy: { type: 'object', additionalProperties: false, required: ['preserveAlreadyDealtCards', 'automaticEmptyTableReset', 'automaticIdleLoop', 'appearanceOwnedByCaller', 'gameLogicIncluded'], properties: { preserveAlreadyDealtCards: { const: true }, automaticEmptyTableReset: { const: false }, automaticIdleLoop: { const: false }, appearanceOwnedByCaller: { const: true }, gameLogicIncluded: { const: false } } },
    assets: { type: 'array', items: { $ref: '#/$defs/asset' } }, anchors: { type: 'array', minItems: 2, maxItems: 2, items: { $ref: '#/$defs/anchor' } },
    clips: { type: 'array', minItems: 18, items: { $ref: '#/$defs/clip' } }, cardSlots: { type: 'array', minItems: 14, maxItems: 14, items: { $ref: '#/$defs/slot' } }, edgeGates: { type: 'array', items: { $ref: '#/$defs/edge' } },
    generationPlan: { type: 'object', additionalProperties: false, required: ['status', 'newPaidJobsAuthorizedByContract', 'preferredRawSeconds', 'cutRule', 'note'], properties: { status: { const: 'planning-only' }, newPaidJobsAuthorizedByContract: { const: false }, preferredRawSeconds: { type: 'number', minimum: 1 }, cutRule: { const: 'original-integer-frames-only' }, note: { type: 'string' } } },
  },
  $defs: {
    hashRef: hashRefSchema,
    qa: { type: 'object', additionalProperties: false, required: ['status', 'evidence', 'reason'], properties: { status: { enum: ['pending', 'rejected', 'approved'] }, evidence: nullable({ $ref: '#/$defs/hashRef' }), reason: { type: 'string' } } },
    asset: { type: 'object', additionalProperties: false, required: ['id', 'path', 'sha256', 'kind', 'width', 'height', 'fps', 'frames', 'role'], properties: { id: { type: 'string', minLength: 1 }, path: { type: 'string', pattern: '^runs/' }, sha256: { type: 'string', pattern: hashPattern }, kind: { enum: ['image', 'video'] }, width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, fps: { type: 'number', minimum: 0 }, frames: { type: 'integer', minimum: 1 }, role: { type: 'string' } } },
    anchor: { type: 'object', additionalProperties: false, required: ['id', 'pose', 'assetId', 'sha256'], properties: { id: { type: 'string' }, pose: { enum: ['VILA', 'REDO'] }, assetId: { type: 'string' }, sha256: { type: 'string', pattern: hashPattern } } },
    binding: { type: 'object', additionalProperties: false, required: ['assetId', 'sha256', 'startFrame', 'endFrameExclusive', 'presentation'], properties: { assetId: { type: 'string' }, sha256: { type: 'string', pattern: hashPattern }, startFrame: { type: 'integer', minimum: 0 }, endFrameExclusive: { type: 'integer', minimum: 1 }, presentation: { enum: ['raw-reference', 'baked-reference', 'separable-layers'] } } },
    clip: { type: 'object', additionalProperties: false, required: ['id', 'label', 'kind', 'from', 'to', 'seat', 'ordinal', 'slotId', 'binding', 'qa', 'note'], properties: { id: { type: 'string', minLength: 1 }, label: { type: 'string' }, kind: { enum: ['idle', 'bridge', 'deal'] }, from: { enum: ['VILA', 'REDO'] }, to: { enum: ['VILA', 'REDO'] }, seat: nullable({ type: 'integer', minimum: 1, maximum: 7 }), ordinal: nullable({ enum: [1, 2] }), slotId: nullable({ type: 'string' }), binding: nullable({ $ref: '#/$defs/binding' }), qa: { $ref: '#/$defs/qa' }, note: { type: 'string' } } },
    slot: { type: 'object', additionalProperties: false, required: ['id', 'seat', 'ordinal', 'presentationTemplateId'], properties: { id: { type: 'string' }, seat: { type: 'integer', minimum: 1, maximum: 7 }, ordinal: { enum: [1, 2] }, presentationTemplateId: { type: 'string', minLength: 1 } } },
    boundary: { type: 'object', additionalProperties: false, required: ['nodeId', 'sha256', 'frame'], properties: { nodeId: { type: 'string' }, sha256: { type: 'string', pattern: hashPattern }, frame: { type: 'integer', minimum: 0 } } },
    edge: { type: 'object', additionalProperties: false, required: ['from', 'to', 'qa'], properties: { from: { $ref: '#/$defs/boundary' }, to: { $ref: '#/$defs/boundary' }, qa: { $ref: '#/$defs/qa' } } },
  },
} as const;

const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isPose = (value: unknown): value is Pose => value === 'VILA' || value === 'REDO';
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const safePath = (value: unknown): value is string => typeof value === 'string' && value.startsWith('runs/') && !value.split('/').some(part => !part || part === '..' || part === '.') && !value.includes('\\');
const sameBoundary = (a: Boundary, b: Boundary) => a.nodeId === b.nodeId && a.sha256 === b.sha256 && a.frame === b.frame;
function boundary(contract: MotionContract, id: string, side: 'start' | 'end'): { value: Boundary; pose: Pose } | null {
  const anchor = contract.anchors.find(item => item.id === id);
  if (anchor) return { value: { nodeId: id, sha256: anchor.sha256, frame: 0 }, pose: anchor.pose };
  const clip = contract.clips.find(item => item.id === id);
  if (!clip?.binding) return null;
  return { value: { nodeId: id, sha256: clip.binding.sha256, frame: side === 'start' ? clip.binding.startFrame : clip.binding.endFrameExclusive - 1 }, pose: side === 'start' ? clip.from : clip.to };
}
/** Runtime cross-reference validation, deliberately independent of filesystem or external libraries. */
export function validateMotionContract(value: unknown): string[] {
  const errors: string[] = [];
  try {
    const c = value as MotionContract;
    if (c.$schema !== PAMELA_MOTION_SCHEMA_ID || c.contractVersion !== PAMELA_MOTION_VERSION || c.dealerId !== 'pamela-pilot' || c.bankId !== 'pamela-workspace-v1' || !nonempty(c.revision)) errors.push('Unsupported contract identity/version');
    const p = c.presentationPolicy;
    if (p.preserveAlreadyDealtCards !== true || p.automaticEmptyTableReset !== false || p.automaticIdleLoop !== false || p.appearanceOwnedByCaller !== true || p.gameLogicIncluded !== false) errors.push('Unsafe presentation policy');
    for (const [name, items] of [['asset', c.assets], ['anchor', c.anchors], ['clip', c.clips], ['slot', c.cardSlots]] as const) {
      if (!Array.isArray(items) || items.some(item => !nonempty(item.id)) || new Set(items.map(item => item.id)).size !== items.length) errors.push(`Invalid or duplicate ${name} identity`);
    }
    if (new Set([...c.anchors, ...c.clips].map(item => item.id)).size !== c.anchors.length + c.clips.length) errors.push('Ambiguous anchor/clip identity');
    for (const asset of c.assets) if (!safePath(asset.path) || !validHash(asset.sha256) || !Number.isInteger(asset.width) || asset.width < 1 || !Number.isInteger(asset.height) || asset.height < 1 || !Number.isInteger(asset.frames) || asset.frames < 1 || !['image', 'video'].includes(asset.kind) || (asset.kind === 'video' ? !(asset.fps > 0 && Number.isFinite(asset.fps)) : asset.frames !== 1 || asset.fps !== 0)) errors.push(`Invalid asset: ${asset.id}`);
    for (const anchor of c.anchors) if (!isPose(anchor.pose) || !c.assets.some(asset => asset.id === anchor.assetId && asset.sha256 === anchor.sha256 && asset.kind === 'image')) errors.push(`Invalid anchor: ${anchor.id}`);
    if (c.anchors.length !== 2 || new Set(c.anchors.map(item => item.pose)).size !== 2) errors.push('Both distinct pose anchors are required');
    const qa = (item: Qa, name: string) => {
      if (!['pending', 'rejected', 'approved'].includes(item.status) || typeof item.reason !== 'string' || (item.evidence !== null && (!safePath(item.evidence.path) || !validHash(item.evidence.sha256))) || (item.status === 'approved' && !item.evidence)) errors.push(`Invalid QA evidence: ${name}`);
    };
    for (const clip of c.clips) {
      if (!isPose(clip.from) || !isPose(clip.to) || !['idle', 'bridge', 'deal'].includes(clip.kind)) errors.push(`Invalid clip pose/kind: ${clip.id}`);
      qa(clip.qa, clip.id);
      if (clip.kind === 'idle' && (clip.from !== 'VILA' || clip.to !== 'VILA')) errors.push(`Idle must return to VILA: ${clip.id}`);
      if (clip.kind === 'bridge' && clip.from === clip.to) errors.push(`Bridge must connect distinct poses: ${clip.id}`);
      if (clip.kind === 'deal') {
        if (clip.from !== 'REDO' || clip.to !== 'REDO' || !c.cardSlots.some(slot => slot.id === clip.slotId && slot.seat === clip.seat && slot.ordinal === clip.ordinal)) errors.push(`Invalid REDO deal slot: ${clip.id}`);
      } else if (clip.seat !== null || clip.ordinal !== null || clip.slotId !== null) errors.push(`Non-deal cannot change a card slot: ${clip.id}`);
      if (clip.binding) {
        const b = clip.binding, asset = c.assets.find(item => item.id === b.assetId);
        if (!asset || asset.kind !== 'video' || asset.sha256 !== b.sha256 || !Number.isInteger(b.startFrame) || !Number.isInteger(b.endFrameExclusive) || b.startFrame < 0 || b.endFrameExclusive <= b.startFrame || b.endFrameExclusive > asset.frames || !['raw-reference', 'baked-reference', 'separable-layers'].includes(b.presentation)) errors.push(`Invalid hash/frame binding: ${clip.id}`);
      } else if (clip.qa.status === 'approved') errors.push(`Approved clip has no media: ${clip.id}`);
    }
    if (c.cardSlots.length !== 14 || new Set(c.cardSlots.map(slot => slot.presentationTemplateId)).size !== 14) errors.push('Fourteen unique presentation slots/templates required');
    for (let seat = 1; seat <= 7; seat++) for (const ordinal of [1, 2]) {
      const slots = c.cardSlots.filter(slot => slot.seat === seat && slot.ordinal === ordinal);
      if (slots.length !== 1 || !nonempty(slots[0].presentationTemplateId) || c.clips.filter(clip => clip.kind === 'deal' && clip.seat === seat && clip.ordinal === ordinal && clip.slotId === slots[0]?.id).length !== 1) errors.push(`Missing/duplicate seat ${seat}, ordinal ${ordinal}`);
    }
    if (c.clips.filter(clip => clip.kind === 'idle').length < 2 || !c.clips.some(clip => clip.kind === 'bridge' && clip.from === 'VILA' && clip.to === 'REDO') || !c.clips.some(clip => clip.kind === 'bridge' && clip.from === 'REDO' && clip.to === 'VILA')) errors.push('Missing VILA variants or REDO bridges');
    const gateIds = new Set<string>();
    for (const gate of c.edgeGates) {
      qa(gate.qa, 'edge');
      const from = boundary(c, gate.from.nodeId, 'end'), to = boundary(c, gate.to.nodeId, 'start');
      const id = `${gate.from.nodeId}>${gate.to.nodeId}`;
      if (gateIds.has(id)) errors.push(`Duplicate edge gate: ${id}`); gateIds.add(id);
      if (!from || !to || !c.clips.some(clip => clip.id === gate.to.nodeId) || !sameBoundary(from.value, gate.from) || !sameBoundary(to.value, gate.to) || from.pose !== to.pose) errors.push(`Stale/incompatible endpoint gate: ${id}`);
    }
    if (c.generationPlan.status !== 'planning-only' || c.generationPlan.newPaidJobsAuthorizedByContract !== false || c.generationPlan.cutRule !== 'original-integer-frames-only' || !(c.generationPlan.preferredRawSeconds > 0)) errors.push('Unsafe generator plan');
  } catch { errors.push('Malformed motion contract'); }
  return errors;
}
function assertContract(c: MotionContract) { const errors = validateMotionContract(c); if (errors.length) throw Error(errors.join('; ')); }
/** Lists unavailable production actions, including existing but rejected/pending reference cuts. */
export function listMissingClips(c: MotionContract): MissingClip[] {
  assertContract(c);
  return c.clips.flatMap(clip => {
    const reasons: string[] = [];
    if (!clip.binding) reasons.push('missing-media');
    else if (clip.binding.presentation !== 'separable-layers') reasons.push('presentation-not-separated');
    if (clip.qa.status !== 'approved') reasons.push(`qa-${clip.qa.status}`);
    if (!c.edgeGates.some(gate => gate.to.nodeId === clip.id && gate.qa.status === 'approved')) reasons.push('missing-approved-entry-gate');
    return reasons.length ? [{ clipId: clip.id, reasons }] : [];
  });
}
function cardStateErrors(c: MotionContract, cards: readonly PresentedCard[]) {
  if (!Array.isArray(cards)) return ['Invalid card presentation state'];
  if (cards.some(card => !nonempty(card.id) || !nonempty(card.appearanceId) || !c.cardSlots.some(slot => slot.id === card.slotId))) return ['Invalid card instance/appearance/slot'];
  if (new Set(cards.map(card => card.id)).size !== cards.length || new Set(cards.map(card => card.slotId)).size !== cards.length) return ['Duplicate card instance or occupied slot'];
  return [];
}
export function initialMotionState(c: MotionContract, pose: Pose, alreadyDealtCards: readonly PresentedCard[] = []): MotionState {
  assertContract(c); const errors = cardStateErrors(c, alreadyDealtCards); if (errors.length) throw Error(errors.join('; '));
  const anchor = c.anchors.find(item => item.pose === pose); if (!anchor) throw Error('Unknown initial pose');
  return { contractVersion: c.contractVersion, contractRevision: c.revision, dealerId: c.dealerId, bankId: c.bankId, pose, boundary: { nodeId: anchor.id, sha256: anchor.sha256, frame: 0 }, alreadyDealtCards: alreadyDealtCards.map(card => ({ ...card })) };
}
/** Exact endpoint hash/frame proof is required even if both endpoint labels say REDO. */
export function checkMotionTransition(c: MotionContract, state: MotionState, clipId: string, newCard?: Readonly<{ id: string; appearanceId: string }>): string[] {
  const errors = validateMotionContract(c); if (errors.length) return errors;
  if (state.contractVersion !== c.contractVersion || state.contractRevision !== c.revision || state.dealerId !== c.dealerId || state.bankId !== c.bankId) errors.push('State belongs to a different motion contract');
  errors.push(...cardStateErrors(c, state.alreadyDealtCards));
  const current = boundary(c, state.boundary.nodeId, 'end'), next = c.clips.find(clip => clip.id === clipId);
  if (!current || !sameBoundary(current.value, state.boundary) || current.pose !== state.pose) errors.push('Stale state endpoint/pose');
  const previousClip = c.clips.find(clip => clip.id === state.boundary.nodeId);
  if (previousClip && (previousClip.qa.status !== 'approved' || previousClip.binding?.presentation !== 'separable-layers')) errors.push('Previous clip is no longer approved for presentation');
  if (!next) return [...errors, 'Unknown action clip'];
  if (next.from !== state.pose) errors.push('Pose mismatch');
  if (!next.binding) errors.push('Clip media missing');
  else if (next.binding.presentation !== 'separable-layers') errors.push('Baked/raw reference cannot preserve independent presentation cards');
  if (next.qa.status !== 'approved') errors.push(`Clip QA ${next.qa.status}`);
  const nextBoundary = boundary(c, next.id, 'start');
  if (!nextBoundary || !c.edgeGates.some(gate => gate.qa.status === 'approved' && sameBoundary(gate.from, state.boundary) && sameBoundary(gate.to, nextBoundary.value))) errors.push('Endpoint compatibility gate not approved');
  if (next.kind === 'deal') {
    if (!newCard || !nonempty(newCard.id) || !nonempty(newCard.appearanceId)) errors.push('A separate caller-owned presentation card is required');
    else if (state.alreadyDealtCards.some(card => card.id === newCard.id)) errors.push('Presentation card ID must be unique');
    if (state.alreadyDealtCards.some(card => card.slotId === next.slotId)) errors.push('Refusing to overwrite an already dealt card slot');
  } else if (newCard) errors.push('Only a deal action may add a presentation card');
  return errors;
}
export function applyMotionTransition(c: MotionContract, state: MotionState, clipId: string, newCard?: Readonly<{ id: string; appearanceId: string }>): MotionState {
  const errors = checkMotionTransition(c, state, clipId, newCard); if (errors.length) throw Error(`Transition refused: ${errors.join('; ')}`);
  const clip = c.clips.find(item => item.id === clipId)!;
  const cards = state.alreadyDealtCards.map(card => ({ ...card }));
  if (clip.kind === 'deal') cards.push({ ...newCard!, slotId: clip.slotId! });
  return { contractVersion: c.contractVersion, contractRevision: c.revision, dealerId: c.dealerId, bankId: c.bankId, pose: clip.to, boundary: boundary(c, clipId, 'end')!.value, alreadyDealtCards: cards };
}
