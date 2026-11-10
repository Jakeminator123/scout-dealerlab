import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  validateDealerMotionContract, planDealerSequence, initialDealerMotionState,
  checkDealerMotionTransition, applyDealerMotionTransition, applyDealerReveal,
  presentedDealerCardMaterial, sideAtFrame,
  type DealerMotionContract, type Motion, type MotionVariant, type BoardCard, type Boundary, type Qa, type RevealEvent,
} from '../src/dealer-motion-contract.ts';
import type { MotionContract as V1 } from '../src/pamela-motion-contract.ts';
import { planPamelaFilmRoute } from '../tools/pamela-film-route.ts';

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
  if (m.kind === 'reveal') {
    m.sideTrack = {
      sourceSha256: asset.sha256, markerLegendId: null,
      ranges: (['BACK', 'EDGE', 'FRONT'] as const).map((side, frame) => ({ startFrame: frame, endFrameExclusive: frame + 1, side, method: 'geometry-observation' })),
    };
  }
  m.geometry = m.kind === 'deal' || m.kind === 'reveal' ? { sourceSha256: asset.sha256, spaceId: `source-px/${asset.sha256}`, cardTrack: proof, handMask: proof } : null;
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
  assert.equal(v1.assets.length, 24);
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
  assert.equal(shipped.edgeGates.length, 40);
  assert(shipped.edgeGates.every(g => g.qa.status === 'pending'));
  assert.equal(shipped.cardPlacements.length, 18);
  assert.equal(shipped.motions.filter(m => m.kind === 'deal' && !m.binding).length, 0);
  assert.equal(shipped.motions.filter(m => m.returnMode === 'direct' && !m.binding).length, 0);
  assert.equal(shipped.motions.filter(m => m.returnMode === 'to-redo' && !m.binding).length, 4);
  for (let seat = 1; seat <= 7; seat++) {
    const pair = migrated.filter(m => m.cardPlacementId?.startsWith(`P${seat}.`));
    assert.equal(pair.length, 2); assert.equal(new Set(pair.map(m => m.clipSlotId)).size, 1);
    assert.notEqual(pair[0].cardPlacementId, pair[1].cardPlacementId);
  }
});

test('new raw cuts and fixed two-card witnesses stay below runtime acceptance', () => {
  for (const [id, endFrameExclusive, releaseFrame, edgeFrame, frontFrame] of [
    ['deal.P1.K2.release', 119, 108, 41, 42],
    ['deal.P7.K1.release', 93, 88, 68, 69],
  ] as const) {
    const deal = shipped.motions.find(m => m.id === id)!;
    const source = shipped.assets.find(a => a.id === deal.binding?.assetId)!;
    assert.deepEqual([source.width, source.height, source.fps, source.frames], [1764, 1174, 30, 120]);
    assert.deepEqual([deal.binding?.startFrame, deal.binding?.endFrameExclusive, deal.releaseFrame], [0, endFrameExclusive, releaseFrame]);
    assert.equal(deal.binding?.presentation, 'raw-reference');
    assert.equal(deal.binding?.sourceCards, 'unresolved');
    assert.deepEqual([edgeFrame - 1, edgeFrame, frontFrame].map(frame => sideAtFrame(deal.sideTrack!, source.sha256, frame).side), ['BACK', 'EDGE', 'FRONT']);
    assert.deepEqual(deal.filmPath!.points.find(point => point.frame === releaseFrame)?.pose, { kind: 'ACTION_BOUNDARY', boundaryId: `release-event.${deal.cardPlacementId}` });
    assert.deepEqual(deal.filmPath!.points.at(-1)?.pose, deal.to);
    assert.equal(deal.qa.status, 'pending');
  }
  const corrected = shipped.motions.find(m => m.id === 'deal.P7.K1.release')!;
  assert.match(corrected.note, /1032\.536/);
  assert.match(corrected.filmPath!.qa.evidence!.path, /p7-c1-returns-01\/direct\/review\/measurements\.json$/);
  const bridge = shipped.motions.find(m => m.id === 'return.P1.K1.to-redo')!;
  assert.equal(bridge.binding?.endFrameExclusive, 60);
  assert.equal(bridge.binding?.sourceCards, 'unresolved');
  assert.equal(bridge.releaseFrame, null);
  assert.equal(bridge.to.kind, 'REDO');
  const direct = shipped.motions.find(m => m.id === 'return.P1.K2.direct')!;
  assert.deepEqual([direct.binding?.startFrame, direct.binding?.endFrameExclusive, direct.binding?.sourceCards], [1, 60, 'unresolved']);
  assert.equal(direct.qa.status, 'pending');
  assert.match(direct.qa.evidence!.path, /p1-c2-to-vila-01\/review\/qa\.json$/);
  assert.match(direct.qa.reason, /Both P1 cards stay baked.*fixed take-02 witness stays archived/);
  const standalone = shipped.motions.find(m => m.id === 'return.P1.K2.to-redo')!;
  assert.match(standalone.qa.reason, /both P1 cards baked/);
  assert.match(standalone.qa.evidence!.path, /p1-c2-to-redo-01\/review\/qa\.json$/);
});

test('r10 preserves the reviewed cuts with separate deal, return and reveal paths', () => {
  assert.equal(shipped.revision, 'candidate-20261110-v2-r10');
  assert.equal(shipped.assets.length, 71);
  assert.equal(shipped.motions.length, 83);
  assert.equal(shipped.motions.filter(m => m.binding).length, 79);
  const motion = (id: string) => shipped.motions.find(m => m.id === id)!;
  for (const [id, start, end, release] of [
    ['deal.P2.K1.release', 0, 109, 108],
    ['return.P2.K1.direct', 109, 180, null],
    ['deal.P3.K1.release', 0, 146, 145],
    ['return.P3.K1.direct', 146, 191, null],
    ['deal.P4.K1.release', 0, 93, 78],
    ['return.P4.K1.direct', 0, 60, null],
    ['return.P4.K1.to-redo', 0, 60, null],
    ['deal.P5.K1.release', 0, 90, 83],
    ['return.P5.K1.direct', 1, 60, null],
    ['return.P5.K1.to-redo', 1, 60, null],
    ['deal.P6.K1.release', 0, 93, 90],
    ['return.P6.K1.direct', 93, 126, null],
    ['return.P6.K1.to-redo', 1, 60, null],
    ['deal.D.K1.release', 0, 141, 140],
    ['return.D.K1.direct', 141, 177, null],
    ['deal.D.K2.release', 0, 99, 95],
    ['return.D.K2.direct', 99, 144, null],
    ['reveal.D.K2', 0, 120, null],
    ['return.P7.K1.to-redo', 0, 67, null],
    ['deal.P7.K2.release', 0, 135, 134],
    ['return.P7.K2.direct', 135, 176, null],
    ['deal.P2.K2.release', 0, 143, 133],
    ['return.P2.K2.direct', 143, 162, null],
    ['deal.P3.K2.release', 0, 125, 121],
    ['return.P3.K2.direct', 125, 180, null],
    ['deal.P4.K2.release', 0, 136, 135],
    ['return.P4.K2.direct', 136, 176, null],
    ['deal.P5.K2.release', 0, 123, 113],
    ['return.P5.K2.direct', 123, 180, null],
    ['deal.P6.K2.release', 0, 97, 88],
    ['return.P6.K2.direct', 97, 150, null],
    ['deal.D.K3.release', 0, 93, 89],
    ['return.D.K3.direct', 93, 123, null],
    ['deal.D.K4.release', 0, 112, 103],
    ['return.D.K4.direct', 112, 150, null],
  ] as const) {
    const m = motion(id);
    assert.deepEqual([m.binding?.startFrame, m.binding?.endFrameExclusive, m.releaseFrame], [start, end, release]);
    assert.equal(m.binding!.presentation, 'raw-reference');
    assert.equal(m.binding!.sourceCards, 'unresolved');
    assert.equal(m.qa.status, 'pending');
    assert.match(m.qa.evidence!.path, /\/review\/qa(?:-blank-rgb)?\.json$/);
    assert.equal(m.filmPath!.qa.status, 'pending');
    assert.equal(m.filmPath!.sourceSha256, m.binding!.sha256);
    assert.equal(m.geometry, null);
  }
  for (const slot of ['P2.K1', 'P3.K1', 'P6.K1', 'D.K1', 'D.K2', 'P7.K2', 'P2.K2', 'P3.K2', 'P4.K2', 'P5.K2', 'P6.K2', 'D.K3', 'D.K4']) {
    const deal = motion(`deal.${slot}.release`), ret = motion(`return.${slot}.direct`);
    assert.equal(deal.binding!.assetId, ret.binding!.assetId);
    assert.equal(deal.binding!.endFrameExclusive, ret.binding!.startFrame);
    assert.equal(ret.to.kind, 'VILA');
  }
  const hidden = motion('deal.D.K2.release'), reveal = motion('reveal.D.K2');
  assert.equal(hidden.cardPlacementId, reveal.cardPlacementId);
  assert.equal(sideAtFrame(hidden.sideTrack!, hidden.binding!.sha256, 98).side, 'BACK');
  assert.deepEqual([64, 65, 68].map(frame => sideAtFrame(reveal.sideTrack!, reveal.binding!.sha256, frame).side), ['BACK', 'EDGE', 'FRONT']);
  assert.deepEqual(reveal.filmPath!.points.map(point => point.pose.kind), ['VILA', 'VILA']);
  assert.match(motion('return.P7.K1.to-redo').qa.reason, /blue-patterned to yellow.*joined f65/);
  assert.match(motion('return.P7.K2.direct').qa.reason, /source-bound yellow insert composition/);
  assert.equal(motion('return.D.K1.to-redo').binding, null);
  for (const [slot, back, edge, front] of [
    ['P2.K2', 42, 82, 84], ['P3.K2', 48, 52, 54], ['P4.K2', 57, 61, 63],
    ['P5.K2', 50, 53, 63], ['P6.K2', 34, 37, 38], ['D.K3', 55, 57, 59], ['D.K4', 70, 71, 72],
  ] as const) {
    const deal = motion(`deal.${slot}.release`);
    assert.deepEqual([back,edge,front].map(frame => sideAtFrame(deal.sideTrack!,deal.binding!.sha256,frame).side), ['BACK','EDGE','FRONT']);
  }
  const fifth = motion('deal.P5.K2.release');
  assert.equal(sideAtFrame(fifth.sideTrack!,fifth.binding!.sha256,61).side, 'UNKNOWN');
});

test('the standalone outer direct returns keep the canonical anchors and pending scene gates', () => {
  for (const [slot, anchor, planId] of [['P7.K1', 92, 'P7.after-K1.direct'], ['P1.K2', 118, 'P1.after-K2.direct']] as const) {
    const deal = shipped.motions.find(m => m.id === `deal.${slot}.release`)!;
    const ret = shipped.motions.find(m => m.id === `return.${slot}.direct`)!;
    assert.equal(deal.binding!.endFrameExclusive - 1, anchor);
    assert.deepEqual(ret.from, deal.to);
    assert.deepEqual([ret.binding!.startFrame, ret.binding!.endFrameExclusive, ret.binding!.presentation, ret.binding!.sourceCards], [1, 60, 'raw-reference', 'unresolved']);
    assert.deepEqual([ret.to.kind, ret.releaseFrame, ret.cardPlacementId, ret.qa.status], ['VILA', null, null, 'pending']);
    const gate = shipped.edgeGates.find(g => g.from.nodeId === deal.id && g.to.nodeId === ret.id)!;
    assert.deepEqual([gate.from.frame, gate.to.frame, gate.qa.status], [anchor, 1, 'pending']);
    const plan = planDealerSequence(shipped, shipped.plans.find(p => p.id === planId)!);
    assert(plan.issues.every(i => !['missing-media', 'pose-path-mismatch', 'direct-return-visits-REDO-after-final-deal'].includes(i.reason)));
    assert.equal(plan.runtimeApproved, false);
  }
  assert.match(shipped.motions.find(m => m.id === 'return.P7.K1.direct')!.qa.reason, /blue-patterned seated insert.*yellow-stock composition/);
});

test('the separate short REDO candidates require their own contact prefix and exact released-card boundary', () => {
  for (const [slot, release, end] of [['P3.K1', 149, 191], ['D.K1', 129, 178], ['P2.K1', 116, 167]] as const) {
    const request = shipped.plans.find(p => p.id === `${slot}.short-redo-candidate`)!;
    const valid = planDealerSequence(shipped, request);
    const [deal, tail] = request.motionIds.slice(1).map(id => shipped.motions.find(m => m.id === id)!);
    assert.deepEqual([deal.releaseFrame, deal.binding?.endFrameExclusive, tail.binding?.startFrame, tail.binding?.endFrameExclusive], [release, release + 1, release + 1, end]);
    assert.equal(deal.cardPlacementId, slot);
    assert.equal(tail.cardPlacementId, null);
    assert.deepEqual(deal.to, tail.from);
    assert.equal(valid.steps.at(-1)!.to.kind, 'REDO');
    assert(valid.issues.every(i => !['pose-path-mismatch', 'missing-media'].includes(i.reason)));
    assert.equal(valid.runtimeApproved, false);
    const mixed = planDealerSequence(shipped, { ...request, motionIds: ['bridge.to-redo', `deal.${slot}.release`, tail.id] });
    assert(mixed.issues.some(i => i.motionId === tail.id && i.reason === 'pose-path-mismatch'));
  }
});

test('r9 short returns retain their verified anchors, board state and pending scene gates', () => {
  const motion = (id: string) => shipped.motions.find(m => m.id === id)!;
  for (const [slot, dealSuffix, returnSuffix, anchorFrame, start, end] of [
    ['P1.K2', 'release', 'to-redo', 118, 1, 60],
    ['P2.K2', 'release', 'to-redo', 142, 1, 60],
    ['P3.K2', 'release', 'to-redo', 124, 0, 64],
    ['P4.K2', 'release-redo-candidate', 'to-redo-candidate', 119, 1, 60],
    ['P5.K2', 'release', 'to-redo', 122, 1, 60],
    ['P6.K2', 'release', 'to-redo', 96, 1, 60],
    ['P7.K2', 'release', 'to-redo', 134, 135, 203],
    ['D.K2', 'release', 'to-redo', 98, 1, 60],
    ['D.K3', 'release', 'to-redo', 92, 0, 64],
    ['D.K4', 'release', 'to-redo', 111, 1, 60],
  ] as const) {
    const deal = motion(`deal.${slot}.${dealSuffix}`), ret = motion(`return.${slot}.${returnSuffix}`);
    assert.deepEqual(deal.to, ret.from);
    assert.equal(deal.binding!.endFrameExclusive - 1, anchorFrame);
    assert.deepEqual([ret.binding!.startFrame, ret.binding!.endFrameExclusive, ret.binding!.sourceCards], [start, end, 'unresolved']);
    assert.deepEqual([ret.kind, ret.to.kind, ret.cardPlacementId, ret.releaseFrame, ret.qa.status], ['return', 'REDO', null, null, 'pending']);
    const gate = shipped.edgeGates.find(g => g.from.nodeId === deal.id && g.to.nodeId === ret.id)!;
    assert.deepEqual([gate.from.frame, gate.to.frame, gate.qa.status], [anchorFrame, start, 'pending']);
  }
  assert.notDeepEqual(motion('deal.P4.K2.release').to, motion('return.P4.K2.to-redo-candidate').from);
  assert.match(motion('return.D.K2.to-redo').qa.reason, /D\.C1 stays FRONT and D\.C2 stays BACK, with zero blue/);
  assert.match(motion('return.P7.K2.to-redo').qa.reason, /stays white.*yellow stock composition/);
  assert.match(motion('return.D.K3.to-redo').qa.reason, /outgoing D\.C4 short seam remains blocked/);
  assert.match(motion('return.D.K4.to-redo').qa.reason, /21\.345 px broad and 14\.628 px at the grip/);
});

test('requested direct-return plans have coherent poses and remain blocked by missing media or pending layer QA', () => {
  const snapshot = structuredClone(shipped);
  for (const request of shipped.plans.filter(plan => plan.requiredReturnMode === 'direct')) {
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

test('the Scout opening can omit inactive deal and continuation pairs', () => {
  const opening = shipped.plans.find(p => p.id === 'scout.opening-seven')!;
  const motionIds = opening.motionIds.filter(id => !/\.P[23567]\.K[12]\./.test(id));
  const plan = planDealerSequence(shipped, { ...opening, id: 'scout.opening-P4-P1', motionIds });
  assert.deepEqual(plan.steps.flatMap(step => step.cardPlacementId ? [step.cardPlacementId] : []), [
    'P4.K1', 'P1.K1', 'D.K1', 'P4.K2', 'P1.K2', 'D.K2',
  ]);
  assert(!plan.issues.some(x => x.reason === 'pose-path-mismatch' || x.reason === 'required-return-not-satisfied'));
  assert.equal(plan.steps.at(-1)!.returnMode, 'direct');
  const full = planDealerSequence(shipped, opening);
  assert.equal(full.steps.length, 33);
  assert.equal(full.issues.filter(issue => issue.reason === 'missing-media').length, 4);
  assert(full.issues.filter(issue => issue.reason === 'missing-media').every(issue => issue.motionId.endsWith('.to-redo')));
  const third = planDealerSequence(shipped, shipped.plans.find(p => p.id === 'scout.dealer-three')!);
  assert(third.issues.every(issue => issue.reason !== 'missing-media'));
  assert.equal(third.readyForLocalSimulation, false);
});

test('Scout review can continue through VILA without substituting for unbound short motions', () => {
  const request = shipped.plans.find(p => p.id === 'scout.opening-seven-via-vila')!;
  const fourth = shipped.plans.find(p => p.id === 'scout.dealer-four-via-vila')!;
  const motionIds = [...request.motionIds, 'reveal.D.K2', ...fourth.motionIds];
  const plan = planDealerSequence(shipped, { ...request, motionIds });
  assert(plan.issues.every(i => i.reason !== 'missing-media'));
  assert(!plan.issues.some(i => ['pose-path-mismatch', 'required-return-not-satisfied'].includes(i.reason)));
  assert.deepEqual(motionIds.slice(-8), ['return.D.K2.direct', 'reveal.D.K2', 'bridge.to-redo', 'deal.D.K3.release', 'return.D.K3.direct', 'bridge.to-redo', 'deal.D.K4.release', 'return.D.K4.direct']);
  assert.equal(plan.readyForLocalSimulation, false);
  assert.equal(plan.runtimeApproved, false);
});

test('Scout matched short review keeps the same placements and distinct reveal while leaving seams pending', () => {
  const short = shipped.plans.find(p => p.id === 'scout.opening-seven-short-review')!;
  const viaVila = shipped.plans.find(p => p.id === 'scout.opening-seven-via-vila')!;
  const plan = planDealerSequence(shipped, short), longer = planDealerSequence(shipped, viaVila);
  assert.equal(plan.steps.length, 33);
  assert.equal(longer.steps.length, 44);
  const placements = (steps: typeof plan.steps) => steps.flatMap(step => step.cardPlacementId ? [step.cardPlacementId] : []);
  assert.deepEqual(placements(plan.steps), placements(longer.steps));
  assert.deepEqual(short.motionIds.slice(-2), ['deal.D.K2.release', 'return.D.K2.direct']);
  assert(short.motionIds.includes('return.P1.K2.to-redo'));
  assert(short.motionIds.includes('return.P4.K2.to-redo-candidate'));
  assert([plan, longer].every(p => !p.runtimeApproved && p.issues.every(i => !['missing-media', 'pose-path-mismatch'].includes(i.reason))));
  const optionalShort = planDealerSequence(shipped, shipped.plans.find(p => p.id === 'scout.dealer-four')!);
  assert(optionalShort.issues.every(i => i.reason !== 'missing-media'));
  assert(optionalShort.issues.some(i => i.motionId === 'deal.D.K4.release' && i.reason === 'missing-approved-entry-gate'));
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
    assert.equal(m.qa.status, 'pending');
  }
  assert(second.motionIds.every(id => shipped.motions.find(m => m.id === id)!.binding));
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
  const c = clone();
  c.edgeGates = [];
  const deal = approve(c, 'deal.D.K3.release'), ret = approve(c, 'return.D.K3.direct'), start = anchor(c, 'REDO');
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

test('film routes retain the raw reveal and can end at VILA with no dealer hit', () => {
  const onlyReveal = planPamelaFilmRoute(shipped, 'reveal:D.C2', 'direct');
  assert.deepEqual(onlyReveal.motionIds, ['reveal.D.K2']);
  assert.equal(onlyReveal.readyForLocalAssembly, false);
  assert(onlyReveal.issues.some(issue => issue.motionId === 'reveal.D.K2' && issue.reason === 'source-cards-not-separated'));
  assert(!onlyReveal.issues.some(issue => issue.motionId === 'reveal.D.K2' && ['missing-media', 'missing-observed-reveal-turn'].includes(issue.reason)));
  const dealt = planPamelaFilmRoute(shipped, 'D.C2,reveal:D.C2', 'direct');
  assert.deepEqual(dealt.motionIds, ['bridge.to-redo', 'deal.D.K2.release', 'return.D.K2.direct', 'reveal.D.K2']);
  assert(!dealt.issues.some(issue => issue.reason === 'pose-path-mismatch' || issue.reason === 'required-return-not-satisfied'));
  assert.throws(() => planPamelaFilmRoute(shipped, 'reveal:D.C2,D.C2', 'direct'), /before reveal/);
  assert.throws(() => planPamelaFilmRoute(shipped, 'reveal:D.C3', 'direct'), /D\.C2/);
});

test('a bound physical reveal consumes a matching engine event, preserves the board and allows a later dealer deal', () => {
  const c = clone();
  const targets = 'reveal:D.C2,D.C3';
  const required = ['reveal.D.K2', 'bridge.to-redo', 'deal.D.K3.release', 'return.D.K3.direct'];
  assert.deepEqual(planPamelaFilmRoute(c, targets, 'direct').motionIds, required);
  c.edgeGates = [];
  required.forEach(id => approve(c, id));
  const vila = anchor(c, 'VILA');
  required.forEach((id, i) => gate(c, i ? required[i - 1] : vila, id));
  assert.equal(planPamelaFilmRoute(c, 'reveal:D.C2', 'direct').readyForLocalAssembly, true);
  assert.equal(planPamelaFilmRoute(c, targets, 'direct').readyForLocalAssembly, true);

  const hidden = card('D.K2', 2, { engine: { cardId: null, frontAllowed: false }, materials: { front: null, back: 'back-blue', concealed: 'concealed-neutral' } });
  const state = initialDealerMotionState(c, vila, 'round-1', [card('P7.K1', 1), hidden]);
  const event: RevealEvent = {
    type: 'reveal', to: 'dealer', roundId: state.roundId, eventId: 'engine-reveal',
    instanceId: hidden.instanceId, shoeDraw: hidden.shoeDraw, cardId: 'AC', frontAllowed: true,
    front: { cardId: 'AC', materialId: 'front-AC', qa },
  };
  assert.throws(() => applyDealerMotionTransition(c, state, required[0]), /committed engine reveal/);
  assert.throws(() => applyDealerMotionTransition(c, state, required[0], { eventId: 'extra-deal', card: hidden }), /committed engine reveal/);
  assert.throws(() => applyDealerMotionTransition(c, state, required[0], { ...event, roundId: 'other-round' }), /committed engine reveal/);
  assert.throws(() => applyDealerMotionTransition(c, state, required[0], { ...event, shoeDraw: hidden.shoeDraw + 1 }), /same hidden dealer card/);
  assert.throws(() => applyDealerMotionTransition(c, state, required[0], { ...event, instanceId: state.board[0].instanceId }), /same hidden dealer card/);
  assert.throws(() => applyDealerMotionTransition(c, state, required[0], { ...event, front: undefined }), /Verified front material/);
  assert.throws(() => applyDealerMotionTransition(c, { ...state, consumedEventIds: [event.eventId] }, required[0], event), /consumed reveal event/);
  assert.deepEqual(checkDealerMotionTransition(c, state, required[0], event), []);

  const revealed = applyDealerMotionTransition(c, state, required[0], event);
  assert.equal(revealed.pose.kind, 'VILA');
  assert.deepEqual(revealed.boundary, end(c, required[0]));
  assert.deepEqual(revealed.board, [
    state.board[0],
    { ...hidden, engine: { cardId: 'AC', frontAllowed: true }, materials: { ...hidden.materials, front: 'front-AC' } },
  ]);
  assert.deepEqual(revealed.consumedEventIds, [event.eventId]);
  assert.equal(state.board[1].engine.frontAllowed, false);
  const atShoe = applyDealerMotionTransition(c, revealed, required[1]);
  const nextCard = card('D.K3', 3);
  const next = applyDealerMotionTransition(c, atShoe, required[2], { eventId: 'dealer-hit', card: nextCard });
  const resting = applyDealerMotionTransition(c, next, required[3]);
  assert.deepEqual(resting.board, [...revealed.board, nextCard]);
  assert.equal(resting.pose.kind, 'VILA');
});

test('approved reveal requires observed edge, source-bound geometry and exact continuity', () => {
  const c = clone();
  c.edgeGates = [];
  const reveal = approve(c, 'reveal.D.K2');
  gate(c, anchor(c, 'VILA'), reveal.id);
  assert.equal(planPamelaFilmRoute(c, 'reveal:D.C2', 'direct').readyForLocalAssembly, true);
  c.edgeGates.at(-1)!.qa = { status: 'pending', evidence: null, reason: 'Skarv saknas' };
  assert(planPamelaFilmRoute(c, 'reveal:D.C2', 'direct').issues.some(issue => issue.reason === 'missing-approved-entry-gate'));
  const edge = reveal.sideTrack!.ranges[1];
  edge.method = 'authored';
  assert(validateDealerMotionContract(c).some(error => error.includes('observed BACK→EDGE→FRONT')));
  edge.method = 'geometry-observation';
  edge.side = 'FRONT';
  assert(validateDealerMotionContract(c).some(error => error.includes('observed BACK→EDGE→FRONT')));
  edge.side = 'EDGE';
  reveal.geometry!.sourceSha256 = 'a'.repeat(64);
  assert(validateDealerMotionContract(c).some(error => error.includes('Invalid geometry binding')));
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
