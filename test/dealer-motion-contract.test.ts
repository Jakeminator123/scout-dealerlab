import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  validateDealerMotionContract, planDealerSequence, initialDealerMotionState,
  checkDealerMotionTransition, applyDealerMotionTransition, applyDealerReveal,
  presentedDealerCardMaterial, sideAtFrame,
  type DealerMotionContract, type Motion, type MotionVariant, type BoardCard, type Boundary, type Qa,
} from '../src/dealer-motion-contract.ts';
import type { MotionContract as V1 } from '../src/pamela-motion-contract.ts';

const v1Bytes = await readFile(new URL('../references/pamela-motion-contract.json', import.meta.url));
const v1 = JSON.parse(v1Bytes.toString()) as V1;
const shipped = JSON.parse(await readFile(new URL('../references/pamela-motion-contract-v2.json', import.meta.url), 'utf8')) as DealerMotionContract;
const proof = { path: 'runs/synthetic-v2/evidence.json', sha256: 'f'.repeat(64) };
const qa: Qa = { status: 'approved', evidence: proof, reason: 'Synthetic fixture only; no real media accepted' };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const clone = () => structuredClone(shipped);
function anchor(c: DealerMotionContract, pose: 'VILA' | 'REDO') { return c.anchors.find(a => a.pose.kind === pose)!.id; }

// Only synthetic fixtures gain separable layers, verified paths and edge gates.
function approve(c: DealerMotionContract, id: string): Motion {
  const m = c.motions.find(m => m.id === id)!;
  assert(m);
  const asset = { id: `synthetic.${id}`, path: `runs/synthetic-v2/${id}.mp4`, sha256: hash(id), kind: 'video' as const, width: 10, height: 10, fps: 30, frames: 3 };
  c.assets.push(asset);
  m.binding = { assetId: asset.id, sha256: asset.sha256, startFrame: 0, endFrameExclusive: 3, presentation: 'separable-layers', sourceCards: 'separated' };
  m.qa = structuredClone(qa);
  m.releaseFrame = m.kind === 'deal' ? 1 : null;
  m.filmPath = { sourceSha256: asset.sha256, qa: structuredClone(qa), points: [
    { frame: 0, pose: structuredClone(m.from) },
    ...(m.kind === 'deal' ? [{ frame: 1, pose: { kind: 'ACTION_BOUNDARY' as const, boundaryId: `release.${m.cardPlacementId}` } }] : []),
    { frame: 2, pose: structuredClone(m.to) },
  ] };
  m.sideTrack = m.kind === 'deal' ? { sourceSha256: asset.sha256, markerLegendId: null, ranges: [{ startFrame: 0, endFrameExclusive: 3, side: 'FRONT', method: 'authored' }] } : null;
  m.geometry = m.kind === 'deal' ? { sourceSha256: asset.sha256, spaceId: `source-px/${asset.sha256}`, cardTrack: proof, handMask: proof } : null;
  return m;
}
function end(c: DealerMotionContract, id: string, start = false): Boundary {
  const a = c.anchors.find(a => a.id === id);
  if (a) return { nodeId: id, sha256: a.sha256, frame: 0 };
  const b = c.motions.find(m => m.id === id)!.binding!;
  return { nodeId: id, sha256: b.sha256, frame: start ? b.startFrame : b.endFrameExclusive - 1 };
}
function gate(c: DealerMotionContract, from: string, to: string) { c.edgeGates.push({ from: end(c, from), to: end(c, to, true), qa: structuredClone(qa) }); }
function sequence(planIndex = 0) {
  const c = clone(), plan = c.plans[planIndex];
  c.edgeGates = []; // Synthetic source hashes need synthetic endpoint gates.
  plan.motionIds.forEach(id => approve(c, id));
  plan.motionIds.forEach((id, i) => gate(c, i ? plan.motionIds[i - 1] : plan.anchorId, id));
  assert.deepEqual(validateDealerMotionContract(c), []);
  return { c, plan };
}
function continuationSequence() {
  const { c, plan: first } = sequence();
  const ret: Motion = { ...structuredClone(c.motions.find(m => m.id === 'return.P1.K1.direct')!), id: 'return.P1.K1.to-redo', to: { kind: 'REDO' }, returnMode: 'to-redo' };
  const existing = c.motions.findIndex(m => m.id === ret.id);
  if (existing < 0) c.motions.push(ret); else c.motions[existing] = ret;
  approve(c, ret.id);
  const second = approve(c, 'deal.P1.K2.release'), finish = approve(c, 'return.P1.K2.direct');
  gate(c, 'deal.P1.K1.release', ret.id); gate(c, ret.id, second.id); gate(c, second.id, finish.id);
  const prefix = { id: 'synthetic.C1.to-redo', anchorId: first.anchorId, motionIds: [...first.motionIds.slice(0, 2), ret.id], requiredReturnMode: 'to-redo' as const };
  const plan = { id: 'synthetic.C2.direct', anchorId: first.anchorId, motionIds: [...prefix.motionIds, second.id, finish.id], requiredReturnMode: 'direct' as const };
  c.plans.push(prefix, plan);
  assert.deepEqual(validateDealerMotionContract(c), []);
  return { c, prefix, plan, ret, second, finish };
}
function card(cardPlacementId: string, index: number, overrides: Partial<BoardCard> = {}): BoardCard {
  const slot = shipped.cardPlacements.find(s => s.id === cardPlacementId)!;
  return { instanceId: `card-${index}`, cardPlacementId, recipientId: slot.recipientId, layoutHandId: slot.layoutHandId, handId: `${slot.recipientId}-engine-hand`, cardOrdinal: slot.cardOrdinal, shoeDraw: 40 + index, engine: { cardId: `external-identity-${index}`, frontAllowed: true }, materials: { front: `front-${index}`, back: 'back-blue', concealed: 'concealed-neutral' }, ...overrides } as BoardCard;
}
function variant(c: DealerMotionContract, m: Motion, groupId: string, cardsBefore: string[]): MotionVariant {
  function canonical(pose: Motion['from']): Boundary {
    if (pose.kind !== 'ACTION_BOUNDARY') return end(c, anchor(c, pose.kind));
    const id = `anchor.synthetic.${pose.boundaryId}`, sha256 = hash(id);
    if (!c.anchors.some(a => a.id === id)) {
      c.assets.push({ id, path: `runs/synthetic-v2/${id}.png`, sha256, kind: 'image', width: 10, height: 10, frames: 1, fps: 0 });
      c.anchors.push({ id, assetId: id, sha256, pose: structuredClone(pose) });
    }
    return end(c, id);
  }
  return { groupId, hand: 'R', anchors: { start: canonical(m.from), end: canonical(m.to) }, cardsBefore: [...cardsBefore], cardsAfter: m.kind === 'deal' ? [...cardsBefore, m.cardPlacementId!] : [...cardsBefore], contact: { kind: 'no-recontact' } };
}
function variantSequence() {
  const { c, plan } = sequence(), first = c.motions.find(m => m.id === 'deal.P1.K1.release')!;
  first.variant = variant(c, first, 'synthetic.C1.no-recontact', ['P7.K1']);
  const alternate = structuredClone(first); alternate.id = 'synthetic.C1.left-hand';
  alternate.variant!.hand = 'L'; alternate.note = 'Synthetic cosmetic gaze and arm gesture alternative';
  c.motions.push(alternate); approve(c, alternate.id);
  assert.deepEqual(validateDealerMotionContract(c), []);
  return { c, plan, first, alternate };
}

test('candidate preserves all 24 assets and 19 v1 actions without changing active selection', () => {
  assert.deepEqual(validateDealerMotionContract(shipped), []);
  assert.equal(shipped.supersedes.sha256, createHash('sha256').update(v1Bytes).digest('hex'));
  assert.equal(shipped.supersedes.revision, v1.revision);
  assert.deepEqual(shipped.assets.filter(a => v1.assets.some(old => old.id === a.id)), v1.assets);
  assert.equal(v1.assets.length, 24); assert.equal(shipped.assets.length, 27);
  const migrated = shipped.motions.filter(m => m.legacyV1);
  assert.equal(migrated.length, 19);
  for (const old of v1.clips) {
    const m = migrated.find(m => m.legacyV1!.clipId === old.id)!;
    assert.equal(m.legacyV1!.slotId, old.slotId);
    assert.equal(m.from.kind, old.from); assert.equal(m.to.kind, old.to);
    assert.deepEqual(m.qa, old.qa);
    const { sourceCards, ...binding } = m.binding!;
    assert.equal(sourceCards, 'unresolved'); assert.deepEqual(binding, old.binding);
    assert.equal(m.qa.status, 'pending');
  }
  assert.equal(shipped.activeSelection, false); assert.equal(shipped.productionAccepted, false);
  assert.equal(shipped.motions.filter(m => m.qa.status === 'approved').length, 0);
  assert.equal(shipped.edgeGates.length, 3);
  assert(shipped.edgeGates.every(g => g.qa.status === 'pending'));
  assert.equal(shipped.cardPlacements.length, 17);
  assert.equal(shipped.motions.filter(m => m.kind === 'deal' && m.cardPlacementId?.startsWith('D.') && m.binding === null).length, 3);
  assert.equal(shipped.motions.filter(m => m.returnMode === 'direct' && m.binding === null).length, 16);
  for (let seat = 1; seat <= 7; seat++) {
    const pair = migrated.filter(m => m.cardPlacementId?.startsWith(`P${seat}.`));
    assert.equal(pair.length, 2); assert.equal(new Set(pair.map(m => m.clipSlotId)).size, 1);
    assert.notEqual(pair[0].cardPlacementId, pair[1].cardPlacementId);
  }
});

test('both requested P1 direct-return plans remain blocked by missing media or pending layer QA', () => {
  const snapshot = structuredClone(shipped);
  for (const request of shipped.plans) {
    const plan = planDealerSequence(shipped, request);
    assert.equal(plan.readyForLocalSimulation, false);
    assert.equal(plan.runtimeApproved, false); assert.equal(plan.productionAccepted, false);
    assert.equal(plan.issues.some(x => x.reason === 'missing-media'), request.motionIds.some(id => !shipped.motions.find(m => m.id === id)!.binding));
    assert(plan.issues.some(x => x.reason === 'qa-pending'));
    assert(!plan.issues.some(x => x.reason === 'pose-path-mismatch' || x.reason === 'direct-return-visits-REDO-after-final-deal'));
    assert.equal(plan.steps.at(-1)!.from.kind, 'ACTION_BOUNDARY');
    assert.equal(plan.steps.at(-1)!.to.kind, 'VILA');
  }
  assert.deepEqual(shipped, snapshot);
  const state = initialDealerMotionState(shipped, anchor(shipped, 'REDO'), 'round-1');
  assert.throws(() => applyDealerMotionTransition(shipped, state, 'deal.seat-1.first', { eventId: 'deal-1', card: card('P1.K1', 1) }), /qa-pending|not-separated/);
});

test('physical C1 path binds 59+103+60 raw frames and observed release/side cues without layer acceptance', () => {
  const first = shipped.plans.find(p => p.id === 'P1.after-K1.direct')!;
  assert.deepEqual(first.motionIds, ['bridge.to-redo', 'deal.P1.K1.release', 'return.P1.K1.direct']);
  const steps = first.motionIds.map(id => shipped.motions.find(m => m.id === id)!);
  const sources = [
    ['cbaf81cd79f53eafcc38891847151a1311e3ee94275abe10463674ae6a6f66f2', 60, 59],
    ['678965c828751b080edd9c1c50d9a73e4bb649226c12ca4a92b5c7cae71c65d9', 120, 103],
    ['b84e92ca14a763adc180474e3fcc4cb7faef2274b1b7028fafb33ff59994743d', 60, 60],
  ] as const;
  for (const [i, m] of steps.entries()) {
    const b = m.binding!, a = shipped.assets.find(a => a.id === b.assetId)!;
    assert.equal(b.sha256, sources[i][0]); assert.equal(a.sha256, b.sha256);
    assert.deepEqual([a.width, a.height, a.fps, a.frames], [1764, 1174, 30, sources[i][1]]);
    assert.deepEqual([b.startFrame, b.endFrameExclusive], [0, sources[i][2]]);
    assert.equal(b.presentation, 'raw-reference'); assert.equal(b.sourceCards, 'unresolved');
    assert.equal(m.geometry, null); assert.equal(m.qa.status, 'pending'); assert(m.qa.evidence);
    assert.equal(m.filmPath!.sourceSha256, b.sha256); assert.equal(m.filmPath!.qa.status, 'pending');
    assert.deepEqual([m.filmPath!.points[0].frame, m.filmPath!.points.at(-1)!.frame], [0, sources[i][2] - 1]);
  }
  assert.equal(steps.reduce((n, m) => n + m.binding!.endFrameExclusive - m.binding!.startFrame, 0), 222);
  const deal = steps[1], track = deal.sideTrack!;
  assert.equal(deal.releaseFrame, 95);
  assert.notDeepEqual(deal.filmPath!.points.find(p => p.frame === 95)!.pose, deal.to);
  assert.deepEqual(shipped.markerLegend.sourceHashes, [deal.binding!.sha256]);
  for (const [frame, side] of [[0, 'UNKNOWN'], [39, 'UNKNOWN'], [40, 'BACK'], [46, 'BACK'], [47, 'EDGE'], [48, 'EDGE'], [49, 'FRONT'], [99, 'FRONT'], [100, 'UNKNOWN'], [102, 'UNKNOWN']] as const) {
    assert.deepEqual(sideAtFrame(track, deal.binding!.sha256, frame), { side, method: side === 'UNKNOWN' ? 'unknown' : 'marker-observation' });
  }
  assert.equal(steps[0].legacyV1, null);
  assert.equal(shipped.motions.find(m => m.id === 'legacy.bridge.to-redo')!.legacyV1!.clipId, 'bridge.to-redo');
  const second = shipped.plans.find(p => p.id === 'P1.after-K2.direct')!;
  assert.deepEqual(second.motionIds, ['bridge.to-redo', 'deal.P1.K1.release', 'return.P1.K1.to-redo', 'deal.P1.K2.release', 'return.P1.K2.direct']);
  for (const id of second.motionIds.slice(2)) {
    const m = shipped.motions.find(m => m.id === id)!;
    assert.equal(m.binding, null); assert.equal(m.qa.status, 'pending');
  }
});

test('synthetic K1 and K2 endings return directly to VILA and preserve the complete board', () => {
  for (const planIndex of [0, 1]) {
    const { c, plan } = sequence(planIndex), existing = card('P7.K1', 9);
    let state = initialDealerMotionState(c, plan.anchorId, 'round-1', [existing]);
    const initial = state, snapshot = structuredClone(state);
    for (const id of plan.motionIds) {
      const m = c.motions.find(m => m.id === id)!;
      const k = m.cardPlacementId === 'P1.K2' ? 2 : 1;
      state = applyDealerMotionTransition(c, state, id, m.kind === 'deal' ? { eventId: `deal-${k}`, card: card(m.cardPlacementId!, k) } : undefined);
    }
    assert.equal(state.pose.kind, 'VILA');
    assert.deepEqual(state.board.map(c => c.cardPlacementId), planIndex ? ['P7.K1', 'P1.K1', 'P1.K2'] : ['P7.K1', 'P1.K1']);
    assert.deepEqual(state.board[0], existing);
    assert.deepEqual(initial, snapshot);
    assert(Object.isFrozen(state)); assert(Object.isFrozen(state.board)); assert(Object.isFrozen(state.board[0].engine));
    assert.equal(planDealerSequence(c, plan).readyForLocalSimulation, true);
    assert.equal(planDealerSequence(c, plan).runtimeApproved, false);
    assert.throws(() => (state.board as BoardCard[]).pop(), TypeError);
  }
});

test('to-redo preserves cards and engine events before a separately authorized C2 deal', () => {
  const { c, prefix, plan, ret, second, finish } = continuationSequence();
  const existing = card('P7.K1', 7, { engine: { cardId: null, frontAllowed: false } });
  let state = initialDealerMotionState(c, prefix.anchorId, 'round-1', [existing]);
  state = applyDealerMotionTransition(c, state, prefix.motionIds[0]);
  state = applyDealerMotionTransition(c, state, prefix.motionIds[1], { eventId: 'engine-C1', card: card('P1.K1', 1) });
  const released = structuredClone(state), nextEvent = { eventId: 'engine-C2', card: card('P1.K2', 2, { shoeDraw: 125 }) };
  assert.throws(() => applyDealerMotionTransition(c, state, ret.id, nextEvent), /Only a deal motion may add a card/);
  assert.deepEqual(state, released);
  state = applyDealerMotionTransition(c, state, ret.id);
  assert.equal(state.pose.kind, 'REDO');
  assert.deepEqual(state.board, released.board);
  assert.deepEqual(state.consumedEventIds, released.consumedEventIds);
  assert.deepEqual(state.boundary, end(c, ret.id));
  assert.throws(() => applyDealerMotionTransition(c, state, second.id), /Matching engine deal event required/);
  state = applyDealerMotionTransition(c, state, second.id, nextEvent);
  state = applyDealerMotionTransition(c, state, finish.id);
  assert.equal(state.pose.kind, 'VILA');
  assert.deepEqual(state.board, [...released.board, nextEvent.card]);
  assert.deepEqual(state.consumedEventIds, ['engine-C1', 'engine-C2']);
  assert(Object.isFrozen(state.board[0].engine));
  for (const request of [prefix, plan]) {
    const report = planDealerSequence(c, request);
    assert.equal(report.readyForLocalSimulation, true);
    assert.equal(report.runtimeApproved, false); assert.equal(report.productionAccepted, false);
  }
});

test('to-redo cannot be a new deal, start at VILA, or satisfy a return-to-VILA requirement', () => {
  for (const change of [
    (m: Motion) => { m.to = { kind: 'VILA' }; },
    (m: Motion) => { m.from = { kind: 'VILA' }; },
    (m: Motion) => { m.kind = 'deal'; m.cardPlacementId = 'P1.K2'; },
  ]) {
    const { c, ret } = continuationSequence(); change(ret);
    assert(validateDealerMotionContract(c).some(x => x.includes('To-REDO return must connect an action boundary to REDO without dealing')));
  }
  for (const mode of ['direct', 'via-redo'] as const) {
    const { c, prefix, ret } = continuationSequence();
    assert(planDealerSequence(c, { ...prefix, requiredReturnMode: mode }).issues.some(x => x.reason === 'required-return-not-satisfied'));
    ret.returnMode = mode;
    assert(validateDealerMotionContract(c).some(x => x.includes(mode === 'direct' ? 'Direct return must connect' : 'Via-REDO return must end at VILA')));
  }
  const { c, plan } = continuationSequence();
  assert(planDealerSequence(c, { ...plan, requiredReturnMode: 'to-redo' }).issues.some(x => x.reason === 'required-return-not-satisfied'));
  const bareDeal = { id: 'bare-deal', anchorId: anchor(c, 'REDO'), motionIds: ['deal.seat-1.first'], requiredReturnMode: 'to-redo' as const };
  assert(planDealerSequence(c, bareDeal).issues.some(x => x.reason === 'required-return-not-satisfied'));
});

test('to-redo retains exact endpoint, separated-media and QA gates', () => {
  const { c, prefix, ret } = continuationSequence();
  c.edgeGates = c.edgeGates.filter(g => g.to.nodeId !== ret.id);
  assert(planDealerSequence(c, prefix).issues.some(x => x.motionId === ret.id && x.reason === 'missing-approved-entry-gate'));
  gate(c, 'deal.P1.K1.release', ret.id);
  ret.qa = { ...qa, status: 'pending' };
  ret.binding!.presentation = 'raw-reference'; ret.binding!.sourceCards = 'unresolved';
  ret.filmPath!.qa = { ...qa, status: 'pending' };
  const reasons = planDealerSequence(c, prefix).issues.filter(x => x.motionId === ret.id).map(x => x.reason);
  for (const expected of ['source-cards-not-separated', 'qa-pending', 'film-path-not-approved']) assert(reasons.includes(expected));
  c.edgeGates.find(g => g.to.nodeId === ret.id)!.to.frame++;
  assert(validateDealerMotionContract(c).some(x => x.includes('Stale/incompatible endpoint gate')));
});

test('cosmetic and hand variants share card effects but retain their own endpoint and approval gates', () => {
  const { c, plan, first, alternate } = variantSequence();
  alternate.variant!.cardsAfter.reverse(); // Slot-set order is not a visual difference.
  assert.deepEqual(validateDealerMotionContract(c), []);
  const initial = initialDealerMotionState(c, plan.anchorId, 'round-1', [card('P7.K1', 7)]);
  const ready = applyDealerMotionTransition(c, initial, plan.motionIds[0]);
  const event = { eventId: 'engine-C1', card: card('P1.K1', 1) };
  assert.throws(() => applyDealerMotionTransition(c, ready, alternate.id, event), /Endpoint compatibility gate not approved/);
  gate(c, plan.motionIds[0], alternate.id);
  const a = applyDealerMotionTransition(c, ready, first.id, event), b = applyDealerMotionTransition(c, ready, alternate.id, event);
  assert.deepEqual(a.board, b.board); assert.deepEqual(a.consumedEventIds, b.consumedEventIds);
  assert.throws(() => applyDealerMotionTransition(c, b, plan.motionIds[2]), /Endpoint compatibility gate not approved/);
  gate(c, alternate.id, plan.motionIds[2]);
  assert.deepEqual(applyDealerMotionTransition(c, a, plan.motionIds[2]).board, applyDealerMotionTransition(c, b, plan.motionIds[2]).board);
  alternate.qa = { ...qa, status: 'rejected', reason: 'Synthetic rejected take remains rejected despite group membership' };
  assert.throws(() => applyDealerMotionTransition(c, ready, alternate.id, event), /qa-rejected/);
  assert.deepEqual(alternate.qa.status, 'rejected');
  assert.equal(applyDealerMotionTransition(c, ready, first.id, event).board.length, 2);
});

test('variant groups reject different actions, targets, canonical anchors and card preconditions', () => {
  const changes: ((c: DealerMotionContract, m: Motion) => void)[] = [
    (_c, m) => { m.clipSlotId = 'different-action'; },
    (_c, m) => { m.cardPlacementId = 'P1.K2'; m.variant!.cardsAfter = ['P7.K1', 'P1.K2']; },
    (_c, m) => { m.variant!.cardsBefore = ['P6.K1']; m.variant!.cardsAfter = ['P6.K1', 'P1.K1']; },
    (c, m) => {
      const prior = c.anchors.find(a => a.id === m.variant!.anchors.start.nodeId)!;
      const changed = { ...structuredClone(prior), id: 'anchor.synthetic.other-start' };
      c.anchors.push(changed); m.variant!.anchors.start.nodeId = changed.id;
    },
    (c, m) => {
      const prior = c.anchors.find(a => a.id === m.variant!.anchors.end.nodeId)!;
      const changed = { ...structuredClone(prior), id: 'anchor.synthetic.other-end' };
      c.anchors.push(changed); m.variant!.anchors.end.nodeId = changed.id;
    },
  ];
  for (const change of changes) {
    const { c, alternate } = variantSequence(); change(c, alternate);
    assert(validateDealerMotionContract(c).some(x => x.includes('Incompatible variant group')));
  }
  const { c, alternate } = variantSequence();
  alternate.variant!.anchors.end.sha256 = '0'.repeat(64);
  assert(validateDealerMotionContract(c).some(x => x.includes('Invalid variant canonical anchor')));
  const invalidEffect = variantSequence(); invalidEffect.alternate.variant!.cardsAfter = ['P7.K1'];
  assert(validateDealerMotionContract(invalidEffect.c).some(x => x.includes('Variant card effect')));
  const missingBefore = variantSequence();
  const empty = initialDealerMotionState(missingBefore.c, missingBefore.plan.anchorId, 'round-1');
  const ready = applyDealerMotionTransition(missingBefore.c, empty, missingBefore.plan.motionIds[0]);
  assert.throws(() => applyDealerMotionTransition(missingBefore.c, ready, missingBefore.first.id, { eventId: 'engine-C1', card: card('P1.K1', 1) }), /Variant card precondition not satisfied/);
});

test('intentional post-release adjustment is explicit, separate from no-recontact and never a second deal', () => {
  const { c, plan, alternate } = variantSequence();
  alternate.variant!.contact = { kind: 'intentional-adjustment', cardPlacementIds: ['P1.K1'], ranges: [{ startFrame: 2, endFrameExclusive: 3 }] };
  assert(validateDealerMotionContract(c).some(x => x.includes('Incompatible variant group')));
  alternate.variant!.groupId = 'synthetic.C1.intentional-adjustment';
  assert.deepEqual(validateDealerMotionContract(c), []);
  gate(c, plan.motionIds[0], alternate.id);
  const initial = initialDealerMotionState(c, plan.anchorId, 'round-1', [card('P7.K1', 7)]);
  const ready = applyDealerMotionTransition(c, initial, plan.motionIds[0]);
  const done = applyDealerMotionTransition(c, ready, alternate.id, { eventId: 'engine-C1', card: card('P1.K1', 1) });
  assert.deepEqual(done.board.map(x => x.shoeDraw), [47, 41]);
  assert.deepEqual(done.consumedEventIds, ['engine-C1']);
  assert.equal(alternate.releaseFrame, 1);
  alternate.variant!.contact.ranges[0].startFrame = 1;
  assert(validateDealerMotionContract(c).some(x => x.includes('must follow its original release')));
  alternate.variant!.contact.ranges[0] = { startFrame: 2, endFrameExclusive: 4 };
  assert(validateDealerMotionContract(c).some(x => x.includes('Invalid variant adjustment source ranges')));
  alternate.variant!.contact = { kind: 'no-recontact', ranges: [{ startFrame: 2, endFrameExclusive: 3 }] } as unknown as MotionVariant['contact'];
  assert(validateDealerMotionContract(c).some(x => x.includes('No-recontact variant cannot contain adjustment metadata')));
});

test('a marked adjustment during a return preserves the whole board and cannot release or draw again', () => {
  const { c, plan } = sequence(), ret = c.motions.find(m => m.id === plan.motionIds[2])!;
  ret.variant = variant(c, ret, 'synthetic.C1.return-adjustment', ['P1.K1', 'P7.K1']);
  ret.variant.contact = { kind: 'intentional-adjustment', cardPlacementIds: ['P1.K1'], ranges: [{ startFrame: 0, endFrameExclusive: 2 }] };
  assert.deepEqual(validateDealerMotionContract(c), []);
  let state = initialDealerMotionState(c, plan.anchorId, 'round-1', [card('P7.K1', 7, { engine: { cardId: null, frontAllowed: false } })]);
  state = applyDealerMotionTransition(c, state, plan.motionIds[0]);
  state = applyDealerMotionTransition(c, state, plan.motionIds[1], { eventId: 'engine-C1', card: card('P1.K1', 1) });
  const prior = structuredClone(state);
  assert.throws(() => applyDealerMotionTransition(c, state, ret.id, { eventId: 'fake-adjustment-deal', card: card('P1.K2', 2) }), /Only a deal motion may add a card/);
  const done = applyDealerMotionTransition(c, state, ret.id);
  assert.deepEqual(done.board, prior.board); assert.deepEqual(done.consumedEventIds, prior.consumedEventIds);
  ret.releaseFrame = 1;
  assert(validateDealerMotionContract(c).some(x => x.includes('Invalid release cue')));
  ret.releaseFrame = null; ret.variant.contact.cardPlacementIds = ['P2.K1'];
  assert(validateDealerMotionContract(c).some(x => x.includes('Invalid variant adjustment targets')));
});

test('dealer K3 and shoeDraw are independent; ordinal does not implement blackjack order', () => {
  const c = clone(), deal = approve(c, 'deal.D.K3.release'), ret = approve(c, 'return.D.K3.direct'), start = anchor(c, 'REDO');
  gate(c, start, deal.id); gate(c, deal.id, ret.id);
  const initial = initialDealerMotionState(c, start, 'round-1', [card('D.K1', 1), card('D.K2', 2)]);
  const engineCard = card('D.K3', 3, { shoeDraw: 125, engine: { cardId: null, frontAllowed: false } });
  const dealt = applyDealerMotionTransition(c, initial, deal.id, { eventId: 'engine-dealer-third', card: engineCard });
  const done = applyDealerMotionTransition(c, dealt, ret.id);
  assert.equal(done.board.length, 3); assert.equal(done.board[2].cardOrdinal, 3); assert.equal(done.board[2].shoeDraw, 125);
  assert.deepEqual(done.board.slice(0, 2), initial.board);
  assert.deepEqual(done.board[2].engine, engineCard.engine);
});

test('direct return rejects a REDO passage even when its labels and end pose claim VILA', () => {
  const { c, plan } = sequence(), ret = c.motions.find(m => m.id === plan.motionIds.at(-1))!;
  ret.filmPath!.points.splice(1, 0, { frame: 1, pose: { kind: 'REDO' } });
  assert(validateDealerMotionContract(c).some(x => x.includes('Direct return contains REDO')));
  assert.throws(() => planDealerSequence(c, plan), /Direct return contains REDO/);
  const pending = clone();
  const badPlan = { id: 'fake-direct', anchorId: anchor(pending, 'VILA'), motionIds: ['bridge.to-redo', 'deal.seat-1.first', 'bridge.to-vila'], requiredReturnMode: 'direct' as const };
  const report = planDealerSequence(pending, badPlan);
  assert(report.issues.some(x => x.reason === 'direct-return-visits-REDO-after-final-deal'));
  assert(report.issues.some(x => x.reason === 'required-return-not-satisfied'));
});

test('a pose name, raw approval or absent film path cannot replace endpoint/media QA', () => {
  const c = clone(); c.motions.find(m => m.id === 'deal.seat-1.first')!.qa = structuredClone(qa);
  assert(validateDealerMotionContract(c).some(x => x.includes('Unsafe approved motion')));
  const { c: good, plan } = sequence(); good.edgeGates = [];
  const s = initialDealerMotionState(good, plan.anchorId, 'round-1');
  assert.throws(() => applyDealerMotionTransition(good, s, plan.motionIds[0]), /Endpoint compatibility gate not approved/);
  const m = good.motions.find(m => m.id === plan.motionIds[0])!; m.filmPath = null;
  assert(validateDealerMotionContract(good).some(x => x.includes('needs verified film path')));
});

test('changed source hashes, side-track hashes, exact endpoints and revisions fail closed', () => {
  const { c, plan } = sequence(), state = initialDealerMotionState(c, plan.anchorId, 'round-1');
  c.revision = 'different-revision';
  assert(checkDealerMotionTransition(c, state, plan.motionIds[0]).some(x => x.includes('another contract')));
  c.revision = state.contractRevision;
  const m = c.motions.find(m => m.id === 'deal.P1.K1.release')!;
  m.binding!.sha256 = 'a'.repeat(64);
  assert(validateDealerMotionContract(c).some(x => x.includes('Invalid hash/frame binding')));
  const other = sequence();
  other.c.motions.find(m => m.id === 'deal.P1.K1.release')!.sideTrack!.sourceSha256 = 'b'.repeat(64);
  assert(validateDealerMotionContract(other.c).some(x => x.includes('side-track hash')));
  const stale = sequence(); stale.c.edgeGates[0].to.frame++;
  assert(validateDealerMotionContract(stale.c).some(x => x.includes('Stale/incompatible endpoint gate')));
  const staleState = structuredClone(state); staleState.boundary.frame++;
  const valid = sequence().c;
  assert(checkDealerMotionTransition(valid, staleState, plan.motionIds[0]).some(x => x.includes('Stale state endpoint')));
});

test('blank source stays UNKNOWN; authored and observed marker semantics cannot be conflated', () => {
  const motion = shipped.motions.find(m => m.id === 'deal.seat-1.first')!, track = motion.sideTrack!;
  for (const frame of [0, 119, 359]) assert.deepEqual(sideAtFrame(track, motion.binding!.sha256, frame), { side: 'UNKNOWN', method: 'unknown' });
  assert.throws(() => sideAtFrame(track, 'a'.repeat(64), 0), /source\/frame mismatch/);
  assert.throws(() => sideAtFrame(track, motion.binding!.sha256, 360), /Missing\/ambiguous/);
  const c = clone(), t = c.motions.find(m => m.id === motion.id)!.sideTrack!;
  t.markerLegendId = c.markerLegend.id; t.ranges[0].method = 'marker-observation'; t.ranges[0].side = 'FRONT';
  assert(validateDealerMotionContract(c).some(x => x.includes('Unverified marker observation')));
  t.ranges[0].method = 'authored';
  assert.deepEqual(validateDealerMotionContract(c), []);
  assert.equal(sideAtFrame(t, t.sourceSha256, 20).method, 'authored');
  t.ranges[0].endFrameExclusive = 359;
  assert(validateDealerMotionContract(c).some(x => x.includes('Incomplete side-track')));
});

test('reveal changes permission separately and never replaces a card or loses the board', () => {
  const { c, plan } = sequence(), hidden = card('P7.K1', 7, { engine: { cardId: null, frontAllowed: false } });
  const state = initialDealerMotionState(c, plan.anchorId, 'round-1', [hidden]);
  assert.deepEqual(presentedDealerCardMaterial(hidden, 'FRONT'), { surface: 'CONCEALED', materialId: 'concealed-neutral' });
  const revealed = applyDealerReveal(c, state, { eventId: 'reveal-7', instanceId: hidden.instanceId, cardId: 'AC', frontAllowed: true }, { cardId: 'AC', materialId: 'front-AC', qa });
  assert.equal(presentedDealerCardMaterial(revealed.board[0], 'FRONT').surface, 'FRONT');
  assert.equal(presentedDealerCardMaterial(revealed.board[0], 'UNKNOWN').surface, 'CONCEALED');
  assert.equal(presentedDealerCardMaterial(revealed.board[0], 'BACK').materialId, hidden.materials.back);
  assert.equal(presentedDealerCardMaterial(revealed.board[0], 'EDGE').materialId, null);
  assert.equal(revealed.board.length, state.board.length); assert.equal(revealed.board[0].instanceId, hidden.instanceId);
  assert.equal(state.board[0].engine.cardId, null);
  assert.throws(() => applyDealerReveal(c, revealed, { eventId: 'different-card', instanceId: hidden.instanceId, cardId: 'KH', frontAllowed: true }), /cannot replace card identity/);
  assert.throws(() => applyDealerReveal(c, revealed, { eventId: 'reveal-7', instanceId: hidden.instanceId, cardId: 'AC', frontAllowed: true }), /consumed reveal event/);
  assert.throws(() => applyDealerReveal(c, state, { eventId: 'unsafe', instanceId: hidden.instanceId, cardId: null, frontAllowed: true }), /reveal/);
});

test('an initially unknown front requires verified material resolution for the engine-revealed card', () => {
  const { c, plan } = sequence();
  const hidden = card('P7.K1', 7, {
    engine: { cardId: null, frontAllowed: false },
    materials: { front: null, back: 'back-blue', concealed: 'concealed-neutral' },
  });
  const state = initialDealerMotionState(c, plan.anchorId, 'round-1', [card('P1.K1', 1), hidden]);
  const snapshot = structuredClone(state);
  const signal = { eventId: 'engine-reveal-7', instanceId: hidden.instanceId, cardId: 'AC', frontAllowed: true };
  const front = { cardId: 'AC', materialId: 'front-AC', qa: structuredClone(qa) };
  assert.deepEqual(presentedDealerCardMaterial(state.board[1], 'FRONT'), { surface: 'CONCEALED', materialId: 'concealed-neutral' });
  assert.throws(() => applyDealerReveal(c, state, signal), /Verified front material resolution required/);
  assert.throws(() => applyDealerReveal(c, state, signal, { ...front, cardId: 'KH' }), /Invalid verified front material resolution/);
  assert.throws(() => applyDealerReveal(c, state, signal, { ...front, qa: { ...qa, status: 'pending' } }), /Invalid verified front material resolution/);
  assert.throws(() => applyDealerReveal(c, state, signal, { ...front, qa: { ...qa, evidence: null } }), /Invalid verified front material resolution/);
  assert.deepEqual(state, snapshot);

  const revealed = applyDealerReveal(c, state, signal, front);
  assert.deepEqual(presentedDealerCardMaterial(revealed.board[1], 'FRONT'), { surface: 'FRONT', materialId: 'front-AC' });
  assert.deepEqual(revealed.board[1].engine, { cardId: 'AC', frontAllowed: true });
  assert.deepEqual(revealed.board[1], { ...snapshot.board[1], engine: { cardId: 'AC', frontAllowed: true }, materials: { ...hidden.materials, front: 'front-AC' } });
  assert.deepEqual(revealed.board[0], snapshot.board[0]);
  assert.deepEqual(revealed.boundary, snapshot.boundary);
  assert.deepEqual(revealed.consumedEventIds, ['engine-reveal-7']);
  assert.deepEqual(state, snapshot);

  const resolvedButHidden = applyDealerReveal(c, state, { ...signal, frontAllowed: false }, front);
  assert.equal(resolvedButHidden.board[1].materials.front, 'front-AC');
  assert.deepEqual(presentedDealerCardMaterial(resolvedButHidden.board[1], 'FRONT'), { surface: 'CONCEALED', materialId: 'concealed-neutral' });
  const laterReveal = applyDealerReveal(c, resolvedButHidden, { ...signal, eventId: 'engine-later-reveal-7' });
  assert.deepEqual(presentedDealerCardMaterial(laterReveal.board[1], 'FRONT'), { surface: 'FRONT', materialId: 'front-AC' });
});

test('revealing a newly identified card cannot reuse an unbound preassigned front', () => {
  const { c, plan } = sequence(), hidden = card('P7.K1', 7, { engine: { cardId: null, frontAllowed: false } });
  const state = initialDealerMotionState(c, plan.anchorId, 'round-1', [hidden]);
  const identified = applyDealerReveal(c, state, { eventId: 'identify-7', instanceId: hidden.instanceId, cardId: 'AC', frontAllowed: false });
  assert.equal(identified.board[0].materials.front, null);
  assert.throws(() => applyDealerReveal(c, identified, { eventId: 'reveal-7', instanceId: hidden.instanceId, cardId: 'AC', frontAllowed: true }), /Verified front material resolution required/);
});

test('duplicates, occupied placements and conflicting hand IDs cannot silently overwrite state', () => {
  const { c, plan } = sequence(), first = card('P1.K1', 1), start = anchor(c, 'REDO');
  gate(c, start, 'deal.P1.K1.release');
  const initial = initialDealerMotionState(c, start, 'round-1', [first]), copy = structuredClone(initial);
  assert.throws(() => applyDealerMotionTransition(c, initial, 'deal.P1.K1.release', { eventId: 'duplicate', card: card('P1.K1', 2) }), /Duplicate/);
  assert.deepEqual(initial, copy);
  assert.throws(() => initialDealerMotionState(c, plan.anchorId, 'round-1', [first, card('P1.K2', 2, { shoeDraw: first.shoeDraw })]), /Duplicate/);
  assert.throws(() => initialDealerMotionState(c, plan.anchorId, 'round-1', [first, card('P1.K2', 2, { handId: 'different-engine-hand' })]), /different engine hands/);
  assert.throws(() => applyDealerMotionTransition(c, initial, 'return.P1.K1.direct', { eventId: 'extra', card: card('P1.K2', 2) }), /Only a deal motion/);
});

test('pilot counts are profile data, not a hardcoded two/three-card game maximum', () => {
  const c = clone();
  c.cardPlacements.push({ id: 'P1.H2.K5', recipientId: 'P1', layoutHandId: 'H2', cardOrdinal: 5 });
  assert.deepEqual(validateDealerMotionContract(c), []);
  const split = card('P1.K1', 3, { cardPlacementId: 'P1.H2.K5', layoutHandId: 'H2', handId: 'engine-split-child', cardOrdinal: 5, shoeDraw: 98 });
  const state = initialDealerMotionState(c, anchor(c, 'VILA'), 'round-1', [card('P1.K1', 1), split]);
  assert.equal(state.board[1].cardOrdinal, 5); assert.equal(state.board[1].shoeDraw, 98);
});

test('malformed input, activation, unsafe policy and impossible cuts are rejected', () => {
  assert(validateDealerMotionContract(null).includes('Malformed dealer motion contract'));
  const c = clone(); (c as unknown as { activeSelection: boolean }).activeSelection = true;
  assert(validateDealerMotionContract(c).some(x => x.includes('cannot activate')));
  const p = clone(); (p.policy as unknown as { automaticReset: boolean }).automaticReset = true;
  assert(validateDealerMotionContract(p).some(x => x.includes('Unsafe presentation policy')));
  const cut = clone(); cut.motions.find(m => m.id === 'deal.seat-1.first')!.binding!.endFrameExclusive = 361;
  assert(validateDealerMotionContract(cut).some(x => x.includes('Invalid hash/frame binding')));
});
