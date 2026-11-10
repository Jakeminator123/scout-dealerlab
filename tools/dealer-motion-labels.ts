/** Opt-in, offline review projection. Never renames media or changes a runtime contract. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEALER_MOTION_SCHEMA_ID, validateDealerMotionContract, type DealerMotionContract, type HashRef, type Motion } from '../src/dealer-motion-contract.ts';

export const OUTPUT = 'references/pamela-motion-labels-review.json';
const CONTRACT = 'references/pamela-motion-contract-v2.json';
const NORM = 'docs/studio/NAMN-OCH-RORELSESTRANGAR.md';
const GENERATOR = 'tools/dealer-motion-labels.ts';
const SCOUT_SOURCE = {
  repository: 'Jakeminator123/scoutgaming',
  revision: '37165b57a3076a0ea3d16626c7e4f2e06a793dd7',
  rules: 'services/game/games/blackjack/round.mjs',
  presentation: 'services/game/presentation/partner-presentation.mjs',
};
const SCOUT_OPENING_PLAN = 'scout.opening-seven';
const SCOUT_VILA_PLANS = ['scout.opening-seven-via-vila', 'scout.dealer-four-via-vila'];
const SCOUT_DRAW_CASES = [
  { extraDealerCards: 0, planId: null },
  { extraDealerCards: 1, planId: 'scout.dealer-three' },
  { extraDealerCards: 2, planId: 'scout.dealer-four' },
];
const KEYS = ['action', 'target', 'hand', 'from', 'to', 'pickupSide', 'landingSide', 'pickupVisibility', 'landingVisibility', 'ref'] as const;
export type Projection = Record<typeof KEYS[number], string>;
type Provenance = { contract: HashRef; norm: HashRef; generator: HashRef };
const targetPattern = /^(?:P[1-9][0-9]*|D)\.C[1-9][0-9]*$/;
const target = (s: string) => targetPattern.test(s);
const node = (s: string) => ['SHOE', 'REDO', 'VILA', 'UNKNOWN'].includes(s) || target(s) || s.endsWith('.RELEASE') && target(s.slice(0, -8));
const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');

/** Sorted object keys; array order preserved. Hashes refer to this UTF-8 JSON encoding. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}';
  }
  throw Error('Unsupported canonical JSON value');
}

export function parseDL1(value: string): Projection {
  if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value) || /[\\%]/.test(value)) throw Error('DL1 must be unescaped ASCII without whitespace');
  const fields = value.split('|');
  if (fields.shift() !== 'DL1' || fields.length !== KEYS.length) throw Error('DL1 version or field count');
  const result = {} as Projection;
  KEYS.forEach((key, i) => {
    const pair = fields[i].split('=');
    if (pair.length !== 2 || pair[0] !== key || !pair[1]) throw Error('DL1 field order, key or empty value');
    result[key] = pair[1];
  });
  if (!['DEAL', 'RETURN', 'REVEAL'].includes(result.action)) throw Error('Unsupported DL1 action');
  if (!target(result.target) && !['NONE', 'UNKNOWN'].includes(result.target)) throw Error('Invalid DL1 target');
  if (!['L', 'R', 'BOTH', 'UNKNOWN'].includes(result.hand) || !node(result.from) || !node(result.to)) throw Error('Invalid hand or node');
  if (!/^[a-z][a-z0-9.-]{0,63}$/.test(result.ref)) throw Error('Invalid DL1 ref');
  for (const key of ['pickupSide', 'landingSide'] as const) if (!['FRONT', 'BACK', 'EDGE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(result[key])) throw Error('Invalid physical side');
  for (const key of ['pickupVisibility', 'landingVisibility'] as const) if (!['VISIBLE', 'PARTIAL', 'OCCLUDED', 'OUT_OF_FRAME', 'UNKNOWN', 'NOT_APPLICABLE'].includes(result[key])) throw Error('Invalid visibility');
  const cardFields = ['pickupSide', 'landingSide', 'pickupVisibility', 'landingVisibility'] as const;
  if (result.action === 'RETURN') {
    if (cardFields.some(k => result[k] !== 'NOT_APPLICABLE')) throw Error('Empty-hand RETURN requires NOT_APPLICABLE card fields');
    if (result.from.endsWith('.RELEASE') && result.target !== result.from.slice(0, -8)) throw Error('RETURN release context mismatch');
  } else {
    if (!target(result.target) || result.to !== result.target || cardFields.some(k => result[k] === 'NOT_APPLICABLE')) throw Error('DEAL/REVEAL target or card fields');
    if (result.action === 'REVEAL' && result.from !== result.target) throw Error('REVEAL must manipulate the same target');
  }
  return result;
}

export function serializeDL1(projection: Projection): string {
  if (Object.keys(projection).length !== KEYS.length || Object.keys(projection).some(k => !KEYS.includes(k as typeof KEYS[number]))) throw Error('Unexpected projection fields');
  const value = 'DL1|' + KEYS.map(k => `${k}=${projection[k]}`).join('|');
  parseDL1(value);
  return value;
}

function provenanceRef(ref: HashRef): void {
  if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256) || !/^(references|docs|tools)\//.test(ref.path) || /[\\:%?#]/.test(ref.path) || ref.path.split('/').some(p => !p || p.startsWith('.'))) throw Error('Invalid provenance ref');
}

/** Only the identified V2 card-placement schema supplies K aliases. No global replacement. */
export function canonicalPlacement(c: DealerMotionContract, id: string): string {
  if (c.$schema !== DEALER_MOTION_SCHEMA_ID || c.contractVersion !== '2.0.0') throw Error('Unsupported alias source schema');
  const placement = c.cardPlacements.find(p => p.id === id);
  if (!placement || id !== `${placement.recipientId}.K${placement.cardOrdinal}`) throw Error('Not an identified V2 card placement');
  const value = `${placement.recipientId}.C${placement.cardOrdinal}`;
  if (!target(value)) throw Error('Invalid canonical placement');
  return value;
}

export function buildReview(c: DealerMotionContract, provenance: Provenance) {
  const errors = validateDealerMotionContract(c);
  if (errors.length) throw Error(errors.join('; '));
  Object.values(provenance).forEach(provenanceRef);
  if (c.projectId !== 'snyggare-dealer' || c.dealerId !== 'pamela-pilot' || c.bankId !== 'pamela-workspace-v1') throw Error('Unexpected project/dealer/bank');
  const openingPlan = c.plans.find(p => p.id === SCOUT_OPENING_PLAN);
  if (!openingPlan || SCOUT_DRAW_CASES.some(d => d.planId && !c.plans.some(p => p.id === d.planId))) throw Error('Missing Scout review pose plan');
  const hole = c.cardPlacements.find(p => p.id === 'D.K2');
  if (!hole || canonicalPlacement(c, hole.id) !== 'D.C2') throw Error('Missing Scout hole-card placement');
  const revealMotions = c.motions.filter(m => m.kind === 'reveal' && m.cardPlacementId === hole.id);
  const revealPlan = c.plans.find(p => p.id === 'scout.reveal');
  if (!revealPlan || revealPlan.requiredReturnMode !== 'none' || revealPlan.motionIds.length !== 1 || !revealMotions.some(m => m.id === revealPlan.motionIds[0])) throw Error('Missing Scout reveal pose plan');
  const identity = { projectId: c.projectId, dealerId: c.dealerId, bankId: c.bankId, sourceSchema: c.$schema, sourceRevision: c.revision };
  const sourceMotion = (m: Motion) => ({
    motionId: m.id, clipSlotId: m.clipSlotId, cardPlacementId: m.cardPlacementId,
    from: m.from, to: m.to, declaredReturnMode: m.returnMode, releaseFrame: m.releaseFrame,
    binding: m.binding ? { ...m.binding, asset: c.assets.find(a => a.id === m.binding!.assetId)! } : null,
    qa: m.qa, filmPath: m.filmPath, sideTrack: m.sideTrack,
  });
  const anchors = c.anchors.map(a => ({ ...a, asset: c.assets.find(asset => asset.id === a.assetId)! }));
  const describe = (id: string, kind: 'DEAL' | 'RETURN' | 'REVEAL', canonical: string, originalId: string | null, to: string, candidates: Motion[]) => {
    const isDeal = kind === 'DEAL', isReveal = kind === 'REVEAL', isReturn = kind === 'RETURN';
    const placement = c.cardPlacements.find(p => p.id === originalId);
    const physicalSidePath = isReturn ? [] : isDeal && canonical === 'D.C2' ? ['BACK', 'BACK'] : ['BACK', 'EDGE', 'FRONT'];
    const visibility = isReturn ? 'NOT_APPLICABLE' : 'UNKNOWN';
    const projection: Projection = {
      action: kind, target: canonical, hand: 'UNKNOWN',
      from: isDeal ? 'SHOE' : isReveal ? canonical : canonical === 'NONE' ? 'REDO' : `${canonical}.RELEASE`, to,
      pickupSide: physicalSidePath[0] ?? 'NOT_APPLICABLE', landingSide: physicalSidePath.at(-1) ?? 'NOT_APPLICABLE',
      pickupVisibility: visibility, landingVisibility: visibility, ref: id,
    };
    const bindingStatus = candidates.some(m => m.binding) ? 'SOURCE_DECLARED' : 'UNBOUND';
    return {
      id, identity, provenance, intent: 'REQUESTED' as const, projection,
      displayLabel: `Dpamela-${projection.from}-${kind}-${projection.to}-hand-UNKNOWN`,
      handSummaryReason: 'UNOBSERVED', handTrack: null, observedPhysicalSide: 'UNKNOWN', observedVisibility: 'UNKNOWN', cameraMirrored: null,
      cardPlacementId: isDeal ? originalId : null, contextCardPlacementId: isDeal ? null : originalId,
      layoutContext: placement ? { recipientId: placement.recipientId, layoutHandId: placement.layoutHandId, cardOrdinal: placement.cardOrdinal, engineHandId: null, cardInstanceId: null, shoeDraw: null } : null,
      boardState: { preserveExistingCards: true, engineSuppliesCardIdentity: true, engineSuppliesHandIdAndShoeDraw: true, grantsReveal: false, effect: isDeal ? 'REQUIRES_ENGINE_DEAL_EVENT' : isReveal ? 'REQUIRES_ENGINE_REVEAL_EVENT' : 'PRESERVE_ALL_CARDS' },
      requirements: {
        startPose: isDeal ? 'REDO' : isReveal ? 'VILA' : projection.from,
        endPose: isDeal ? `${canonical}.RELEASE` : isReveal ? 'VILA' : to,
        requiredReturnMode: !isReturn ? 'none' : canonical === 'NONE' ? 'via-redo' : to === 'VILA' ? 'direct' : 'to-redo',
        noRecontactAfterRelease: isReturn && canonical !== 'NONE', physicalSidePath,
      },
      observation: { returnMode: 'UNKNOWN', releaseBoundary: null, accepted: false, productionAccepted: false },
      anchors, sourceCandidates: candidates.map(sourceMotion), bindingStatus,
      blockers: ['Review request only. Playback requires a verified motion.', 'Hand, physical sides and visibility remain unobserved in this projection.', isReveal ? 'Reveal requires a committed engine event for the already placed D.C2 and a source-verified physical turn.' : 'Exact release boundary and complete contact/path/edge QA must be bound before use.', bindingStatus === 'UNBOUND' ? 'No bound source film for this requested motion.' : 'V2 declares candidate media. Byte verification and motion acceptance require separate evidence.'],
    };
  };
  type Descriptor = ReturnType<typeof describe>;
  const objects: Record<string, Descriptor> = {};
  for (const placement of c.cardPlacements) {
    const t = canonicalPlacement(c, placement.id), prefix = t.toLowerCase();
    const deals = c.motions.filter(m => m.kind === 'deal' && m.cardPlacementId === placement.id);
    const releaseBoundaries = new Set([`release.${placement.id}`, ...deals.flatMap(m => m.to.kind === 'ACTION_BOUNDARY' ? [m.to.boundaryId] : [])]);
    const returns = c.motions.filter(m => m.kind === 'return' && m.from.kind === 'ACTION_BOUNDARY' && releaseBoundaries.has(m.from.boundaryId));
    const direct = returns.filter(m => m.to.kind === 'VILA' && m.returnMode === 'direct');
    const toRedo = returns.filter(m => m.to.kind === 'REDO' && m.returnMode === 'to-redo');
    for (const obj of [describe(`${prefix}.deal`, 'DEAL', t, placement.id, t, deals), describe(`${prefix}.return-vila`, 'RETURN', t, placement.id, 'VILA', direct), describe(`${prefix}.return-redo`, 'RETURN', t, placement.id, 'REDO', toRedo)]) objects[obj.id] = obj;
  }
  const reveal = describe('d.c2.reveal', 'REVEAL', 'D.C2', hole.id, 'D.C2', revealMotions);
  objects[reveal.id] = reveal;
  const retreat = c.motions.filter(m => m.kind === 'return' && m.from.kind === 'REDO' && m.to.kind === 'VILA');
  const bridge = describe('bridge.return-vila', 'RETURN', 'NONE', null, 'VILA', retreat);
  objects[bridge.id] = bridge;
  const descriptors = Object.values(objects);
  const labels = descriptors.map(obj => ({ value: serializeDL1(obj.projection), ref: { id: obj.id, document: OUTPUT, pointer: `/objects/${obj.id}`, sha256: sha(canonicalJson(obj)), hashEncoding: 'sorted-key-json-utf8' } }));
  const viaVila = c.plans.filter(p => SCOUT_VILA_PLANS.includes(p.id)).map(p => {
    const motions = p.motionIds.map(id => c.motions.find(m => m.id === id)!);
    const continuations = motions.flatMap((approach, i) => {
      if (approach.id !== 'bridge.to-redo' || i === 0) return [];
      const direct = motions[i - 1], deal = motions[i - 2];
      if (!deal?.cardPlacementId || !deal.binding || !direct.binding || !approach.binding || direct.kind !== 'return' || direct.returnMode !== 'direct' || direct.to.kind !== 'VILA' || approach.from.kind !== 'VILA' || deal.to.kind !== 'ACTION_BOUNDARY' || direct.from.kind !== 'ACTION_BOUNDARY' || direct.from.boundaryId !== deal.to.boundaryId) throw Error(`Invalid VILA bridge route: ${p.id}`);
      return [{ cardPlacementId: deal.cardPlacementId, motionIds: [deal.id, direct.id, approach.id] }];
    });
    return { planId: p.id, continuations, omitInactivePlayerDealAndContinuationGroups: p.id === 'scout.opening-seven-via-vila', seamAndMaterialQa: 'PENDING', runtimeApproved: false };
  });
  return {
    schemaVersion: 1, kind: 'dealer-motion-labels-review', mode: 'review-only', identity, provenance,
    activeSelection: false, productionAccepted: false, paidJobsAuthorized: false,
    counts: {
      dealTargets: c.cardPlacements.length,
      requestedDirectReturns: descriptors.filter(d => d.requirements.requiredReturnMode === 'direct').length,
      requestedReadyReturns: descriptors.filter(d => d.requirements.requiredReturnMode === 'to-redo').length,
      existingShoeReturnRequests: descriptors.filter(d => d.requirements.requiredReturnMode === 'via-redo').length,
      requestedReveals: descriptors.filter(d => d.projection.action === 'REVEAL').length,
      unboundRequirements: descriptors.filter(d => d.bindingStatus === 'UNBOUND').length,
      dl1Labels: labels.length,
    },
    aliases: c.cardPlacements.map(p => ({ ...identity, sourceSchema: `${c.$schema}#cardPlacements`, originalId: p.id, canonicalId: canonicalPlacement(c, p.id), aliasVersion: 1 })),
    labels, objects,
    scoutReview: {
      source: SCOUT_SOURCE,
      opening: { planId: openingPlan.id, omitInactivePlayerDealAndReturnPairs: true },
      reveal: {
        requestId: reveal.id, planId: revealPlan.id, cardPlacementId: hole.id, engineEvent: 'reveal.dealer',
        order: 'AFTER_TRIGGERING_DEAL_BEFORE_EXTRA_DRAWS', keepSameShoeDraw: true, stateTransition: 'applyDealerReveal',
      },
      dealerDraws: { committedEngineEventsOnly: true, demoCases: SCOUT_DRAW_CASES },
      viaVila,
    },
    nonDL1Requirements: [{ id: 'bridge.approach-redo', identity, provenance, intent: 'REQUESTED', kind: 'APPROACH', from: 'VILA', to: 'REDO', hand: 'UNKNOWN', handSummaryReason: 'UNOBSERVED', dl1: null, accepted: false, reason: 'DL1 has no APPROACH action; do not mislabel this as empty-hand RETURN.', anchors, sourceCandidates: c.motions.filter(m => m.kind === 'approach' && m.from.kind === 'VILA' && m.to.kind === 'REDO').map(sourceMotion) }],
    limitations: ['Labels are requests. A request carries no film approval or job authorization.', 'The contract hash is verified. Source media hashes are declarations that require separate byte verification.', 'Raw reveal media remains a candidate until its separated layers and scene seams pass QA. A committed engine reveal applies to the existing hole card.', 'Scout demo plans cover this pilot. The naming grammar supports additional ordinals.'],
  };
}

export type LabelsReview = ReturnType<typeof buildReview>;

/** Verify exact review ref/hash binding. This does not authorize playback or reveal. */
export function resolveReviewLabel(review: LabelsReview, value: string) {
  const projection = parseDL1(value);
  if (review.kind !== 'dealer-motion-labels-review' || review.mode !== 'review-only' || review.activeSelection !== false || review.productionAccepted !== false || review.paidJobsAuthorized !== false) throw Error('Invalid review policy');
  const found = review.labels.filter(label => label.ref.id === projection.ref);
  if (found.length !== 1 || found[0].value !== value) throw Error('Missing, duplicate or mismatched ref');
  const ref = found[0].ref, obj = Object.hasOwn(review.objects, ref.id) ? review.objects[ref.id] : undefined;
  if (!obj || ref.document !== OUTPUT || ref.pointer !== `/objects/${ref.id}` || ref.hashEncoding !== 'sorted-key-json-utf8' || sha(canonicalJson(obj)) !== ref.sha256) throw Error('Object reference/hash mismatch');
  if (obj.id !== ref.id || obj.intent !== 'REQUESTED' || canonicalJson(obj.identity) !== canonicalJson(review.identity) || canonicalJson(obj.provenance) !== canonicalJson(review.provenance) || serializeDL1(obj.projection) !== value || obj.observation.accepted !== false || obj.observation.productionAccepted !== false || obj.boardState.grantsReveal !== false) throw Error('Invalid bound review descriptor');
  return obj;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && args[0] !== '--write') throw Error('Usage: node tools/dealer-motion-labels.ts [--write]');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const [contract, norm, generator] = await Promise.all([CONTRACT, NORM, GENERATOR].map(p => readFile(path.join(root, p))));
  const provenance = { contract: { path: CONTRACT, sha256: sha(contract) }, norm: { path: NORM, sha256: sha(norm) }, generator: { path: GENERATOR, sha256: sha(generator) } };
  const review = buildReview(JSON.parse(contract.toString()), provenance);
  review.labels.forEach(label => resolveReviewLabel(review, label.value));
  if (args[0] === '--write') await writeFile(path.join(root, OUTPUT), JSON.stringify(review, null, 2) + '\n');
  console.log(JSON.stringify({ written: args[0] === '--write', output: OUTPUT, ...review.counts, productionAccepted: false }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
