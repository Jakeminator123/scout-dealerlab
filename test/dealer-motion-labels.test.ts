import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildReview, canonicalJson, canonicalPlacement, parseDL1, resolveReviewLabel, serializeDL1, type Projection } from '../tools/dealer-motion-labels.ts';
import type { DealerMotionContract } from '../src/dealer-motion-contract.ts';

const bytes = await readFile(new URL('../references/pamela-motion-contract-v2.json', import.meta.url));
const contract = JSON.parse(bytes.toString()) as DealerMotionContract;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const provenance = {
  contract: { path: 'references/pamela-motion-contract-v2.json', sha256: hash(bytes) },
  norm: { path: 'docs/studio/NAMN-OCH-RORELSESTRANGAR.md', sha256: 'a'.repeat(64) },
  generator: { path: 'tools/dealer-motion-labels.ts', sha256: 'b'.repeat(64) },
};
const make = () => buildReview(structuredClone(contract), structuredClone(provenance));

test('actual V2 projects to 18 targets, with distinct contextual returns and no runtime mutation', () => {
  const before = canonicalJson(contract), review = buildReview(contract, provenance);
  assert.equal(canonicalJson(contract), before);
  assert.deepEqual(review.counts, { dealTargets: 18, requestedDirectReturns: 18, requestedReadyReturns: 18, existingShoeReturnRequests: 1, requestedReveals: 1, unboundRequirements: 0, dl1Labels: 56 });
  assert.equal(review.activeSelection, false);
  assert.equal(review.productionAccepted, false);
  assert.equal(review.paidJobsAuthorized, false);
  const deals = Object.values(review.objects).filter(o => o.projection.action === 'DEAL');
  assert.equal(deals.filter(o => o.sourceCandidates.some(s => s.binding)).length, 18);
  assert.equal(deals.filter(o => o.bindingStatus === 'UNBOUND').length, 0);
  assert(Object.values(review.objects).every(o => o.bindingStatus === 'SOURCE_DECLARED'));
  assert.match(review.objects['p7.c1.return-redo'].sourceCandidates[0].qa.reason, /blue-patterned to yellow/);
  assert(review.objects['p7.c2.deal'].sourceCandidates.some(source => /yellow to white/.test(source.qa.reason)));
  for (const obj of Object.values(review.objects)) {
    assert.equal(obj.intent, 'REQUESTED');
    assert.equal(obj.projection.hand, 'UNKNOWN');
    assert.equal(obj.handSummaryReason, 'UNOBSERVED');
    assert.equal(obj.observedPhysicalSide, 'UNKNOWN');
    assert.equal(obj.observedVisibility, 'UNKNOWN');
    assert.equal(obj.observation.accepted, false);
    assert.equal(obj.observation.releaseBoundary, null);
    assert.equal(obj.boardState.grantsReveal, false);
    if (obj.projection.action === 'RETURN') {
      assert.equal(obj.cardPlacementId, null);
      assert.equal(obj.projection.pickupSide, 'NOT_APPLICABLE');
      if (obj.projection.target !== 'NONE') assert.ok(obj.contextCardPlacementId);
    } else assert.equal(obj.projection.pickupSide, 'BACK');
  }
  assert.equal(review.nonDL1Requirements[0].kind, 'APPROACH');
  assert.equal(review.nonDL1Requirements[0].dl1, null);
  assert.equal(review.nonDL1Requirements[0].sourceCandidates[0].binding?.startFrame, 3);
  assert.equal(review.nonDL1Requirements[0].sourceCandidates[0].binding?.endFrameExclusive, 90);
});

test('Scout demos keep the hidden placement, same-card reveal and conditional dealer draws separate', () => {
  const review = make();
  const { opening, reveal, dealerDraws } = review.scoutReview;
  const slotIds = (planId: string) => contract.plans.find(p => p.id === planId)!.motionIds
    .map(id => contract.motions.find(m => m.id === id)!.cardPlacementId).filter(Boolean);
  const seats = ['P7', 'P6', 'P5', 'P4', 'P3', 'P2', 'P1'];
  assert.equal(opening.omitInactivePlayerDealAndReturnPairs, true);
  assert.deepEqual(slotIds(opening.planId), [...seats.map(seat => `${seat}.K1`), 'D.K1', ...seats.map(seat => `${seat}.K2`), 'D.K2']);
  assert.deepEqual(review.objects['d.c2.deal'].requirements.physicalSidePath, ['BACK', 'BACK']);
  assert.equal(review.objects['d.c2.deal'].projection.landingSide, 'BACK');
  assert.equal(reveal.cardPlacementId, review.objects['d.c2.deal'].cardPlacementId);
  assert.equal(reveal.order, 'AFTER_TRIGGERING_DEAL_BEFORE_EXTRA_DRAWS');
  assert.equal(reveal.keepSameShoeDraw, true);
  assert.equal(reveal.stateTransition, 'applyDealerReveal');
  assert.deepEqual(contract.plans.find(plan => plan.id === reveal.planId)?.motionIds, ['reveal.D.K2']);
  const turn = review.objects[reveal.requestId];
  assert.equal(turn.projection.action, 'REVEAL');
  assert.equal(turn.projection.from, 'D.C2');
  assert.equal(turn.projection.to, 'D.C2');
  assert.equal(turn.cardPlacementId, null);
  assert.equal(turn.contextCardPlacementId, 'D.K2');
  assert.equal(turn.boardState.effect, 'REQUIRES_ENGINE_REVEAL_EVENT');
  assert.equal(turn.boardState.grantsReveal, false);
  assert.equal(turn.bindingStatus, 'SOURCE_DECLARED');
  assert.deepEqual(turn.sourceCandidates.map(c => [c.motionId, c.binding?.presentation, c.binding?.sourceCards, c.qa.status]),
    [['reveal.D.K2', 'raw-reference', 'unresolved', 'pending']]);
  assert.deepEqual(turn.requirements.physicalSidePath, ['BACK', 'EDGE', 'FRONT']);
  assert.equal(dealerDraws.committedEngineEventsOnly, true);
  assert.deepEqual(dealerDraws.demoCases.map(d => d.planId ? slotIds(d.planId) : []), [[], ['D.K3'], ['D.K3', 'D.K4']]);
  const fourth = review.objects['d.c4.deal'];
  assert.equal(fourth.sourceCandidates[0].clipSlotId, 'deal.dealer/dealer-up');
  assert.equal(fourth.layoutContext?.cardOrdinal, 4);
  assert.deepEqual(fourth.requirements.physicalSidePath, ['BACK', 'EDGE', 'FRONT']);
  assert.equal(review.objects['d.c4.return-vila'].requirements.requiredReturnMode, 'direct');
  assert.equal(review.objects['d.c4.return-vila'].bindingStatus, 'SOURCE_DECLARED');
  assert.equal(review.objects['d.c4.return-redo'].requirements.requiredReturnMode, 'to-redo');
});

test('DL1 preserves separate short candidates and lists bound VILA bridge groups as review-only', () => {
  const review = make();
  const short = review.objects['d.c1.return-redo'];
  assert.deepEqual(short.sourceCandidates.map(m => [m.motionId, m.binding?.startFrame, m.binding?.endFrameExclusive]), [
    ['return.D.K1.to-redo', undefined, undefined], ['return.D.K1.to-redo-candidate', 130, 178],
  ]);
  assert.deepEqual(short.sourceCandidates[1].from, { kind: 'ACTION_BOUNDARY', boundaryId: 'release.D.K1.redo-candidate' });
  const p4Short = review.objects['p4.c2.return-redo'];
  assert.equal(p4Short.bindingStatus, 'SOURCE_DECLARED');
  assert.deepEqual(p4Short.sourceCandidates.map(m => [m.motionId, m.binding?.startFrame, m.binding?.endFrameExclusive]), [
    ['return.P4.K2.to-redo', undefined, undefined], ['return.P4.K2.to-redo-candidate', 1, 60],
  ]);
  const [opening, fourth] = review.scoutReview.viaVila;
  assert.equal(opening.omitInactivePlayerDealAndContinuationGroups, true);
  assert.equal(opening.continuations.length, 11);
  assert.deepEqual(opening.continuations.find(row => row.cardPlacementId === 'P4.K2')?.motionIds, ['deal.P4.K2.release', 'return.P4.K2.direct', 'bridge.to-redo']);
  assert.deepEqual(fourth.continuations, [{ cardPlacementId: 'D.K3', motionIds: ['deal.D.K3.release', 'return.D.K3.direct', 'bridge.to-redo'] }]);
  assert([opening, fourth].every(p => p.seamAndMaterialQa === 'PENDING' && !p.runtimeApproved));
});

test('aliases use V2 card placement identity, never filename replacement or a global three-card limit', () => {
  assert.equal(canonicalPlacement(contract, 'P2.K2'), 'P2.C2');
  assert.throws(() => canonicalPlacement(contract, 'C2-P2'));
  assert.throws(() => canonicalPlacement(contract, 'P2-K2'));
  assert.throws(() => canonicalPlacement(contract, 'P2.K3'));
  const altered = structuredClone(contract);
  altered.cardPlacements[0].id = 'catalogue.K1';
  assert.throws(() => canonicalPlacement(altered, 'catalogue.K1'));
  const review = make(), p = { ...review.objects['p2.c2.deal'].projection, target: 'P2.C37', to: 'P2.C37' };
  assert.equal(parseDL1(serializeDL1(p)).target, 'P2.C37');
  assert.equal(review.aliases[0].sourceSchema, `${contract.$schema}#cardPlacements`);
});

test('all generated strings round-trip and resolve hash-bound descriptors deterministically', () => {
  const a = make(), b = make();
  assert.equal(canonicalJson(a), canonicalJson(b));
  for (const label of a.labels) {
    assert.equal(serializeDL1(parseDL1(label.value)), label.value);
    assert.equal(resolveReviewLabel(a, label.value).id, label.ref.id);
    assert.equal(label.ref.sha256, hash(canonicalJson(a.objects[label.ref.id])));
  }
  assert.equal(canonicalJson({ z: [3, 2], a: 1 }), canonicalJson({ a: 1, z: [3, 2] }));
});

test('parser rejects ambiguous, incomplete and semantically inconsistent motion strings', () => {
  const r = make(), valid = r.labels[0].value;
  for (const bad of [
    valid.replace('DL1', 'DL2'), valid + '|hand=L', valid.replace('|hand=UNKNOWN', ''),
    valid.replace('hand=UNKNOWN', 'hand='), valid + '\n', valid.replace('action=DEAL', 'action=R'),
    valid.replace('from=SHOE', 'from=V'), valid.replace('target=P1.C1', 'target=P1.K1'),
    valid.replace('target=P1.C1', 'target=P01.C1'), valid.replace('to=P1.C1', 'to=P2.C1'),
    valid.replace('pickupSide=BACK', 'pickupSide=NOT_APPLICABLE'), valid.replace('ref=p1.c1.deal', 'ref=../secret'),
    valid.replace('ref=p1.c1.deal', 'ref=p1%2Ec1'), valid.replace('action=DEAL|target=P1.C1', 'target=P1.C1|action=DEAL'),
  ]) assert.throws(() => parseDL1(bad), bad);
  const returnValue = serializeDL1(r.objects['p1.c1.return-vila'].projection);
  assert.throws(() => parseDL1(returnValue.replace('target=P1.C1', 'target=P2.C1')));
  assert.throws(() => parseDL1(returnValue.replace('pickupSide=NOT_APPLICABLE', 'pickupSide=UNKNOWN')));
  const reveal: Projection = { ...r.objects['d.c1.deal'].projection, action: 'REVEAL', from: 'D.C1' };
  assert.equal(parseDL1(serializeDL1(reveal)).action, 'REVEAL');
  assert.throws(() => serializeDL1({ ...reveal, from: 'D.C2' }));
  assert.throws(() => serializeDL1({ ...reveal, extra: 'silent-loss' } as Projection));
});

test('reference resolution rejects tampering, missing and duplicate refs, wrong pointers and activation', () => {
  const review = make(), value = review.labels[0].value, id = review.labels[0].ref.id;
  const changed = structuredClone(review);
  changed.objects[id].projection.hand = 'L';
  assert.throws(() => resolveReviewLabel(changed, value), /hash/);
  const missing = structuredClone(review); missing.labels.shift();
  assert.throws(() => resolveReviewLabel(missing, value), /Missing/);
  const duplicate = structuredClone(review); duplicate.labels.push(duplicate.labels[0]);
  assert.throws(() => resolveReviewLabel(duplicate, value), /duplicate/);
  const pointer = structuredClone(review); pointer.labels[0].ref.pointer = '/objects/other';
  assert.throws(() => resolveReviewLabel(pointer, value), /reference/);
  const activated = structuredClone(review); activated.activeSelection = true;
  assert.throws(() => resolveReviewLabel(activated, value), /policy/);
});

test('source intervals and missing motion evidence survive the projection without fabricated measurements', () => {
  const review = make(), deal = review.objects['p1.c1.deal'];
  assert.equal(deal.sourceCandidates[0].binding?.startFrame, 0);
  assert.equal(deal.sourceCandidates[0].binding?.endFrameExclusive, 360);
  assert.equal(deal.sourceCandidates[0].releaseFrame, null);
  assert.deepEqual(deal.layoutContext, { recipientId: 'P1', layoutHandId: 'H1', cardOrdinal: 1, engineHandId: null, cardInstanceId: null, shoeDraw: null });
  const c1Return = review.objects['p1.c1.return-vila'].sourceCandidates.find(c => c.motionId === 'return.P1.K1.direct');
  assert.equal(c1Return?.binding?.startFrame, 0);
  assert.equal(c1Return?.binding?.endFrameExclusive, 60);
  for (const slot of ['p1.c2', 'p7.c1']) {
    const [direct] = review.objects[`${slot}.return-vila`].sourceCandidates;
    assert.deepEqual([direct.binding?.startFrame, direct.binding?.endFrameExclusive, direct.binding?.sourceCards, direct.qa.status], [1, 60, 'unresolved', 'pending']);
  }
  const p4Tail = review.objects['p4.c2.return-vila'].sourceCandidates[0];
  assert.deepEqual([p4Tail.binding?.startFrame, p4Tail.binding?.endFrameExclusive, p4Tail.binding?.sourceCards], [136,176,'unresolved']);
  const d3Tail = review.objects['d.c3.return-vila'].sourceCandidates.find(c => c.motionId === 'return.D.K3.direct')!;
  assert.deepEqual([d3Tail.binding?.startFrame, d3Tail.binding?.endFrameExclusive, d3Tail.binding?.sourceCards, d3Tail.qa.status], [93,123,'unresolved','pending']);
  assert.equal(review.objects['p1.c1.return-vila'].requirements.requiredReturnMode, 'direct');
  assert.equal(review.objects['p1.c1.return-vila'].observation.returnMode, 'UNKNOWN');
  const continuation = review.objects['p1.c1.return-redo'];
  assert.deepEqual(continuation.sourceCandidates.map(c => [c.motionId, c.binding?.startFrame, c.binding?.endFrameExclusive]), [['return.P1.K1.to-redo', 0, 60]]);
  assert.equal(continuation.requirements.requiredReturnMode, 'to-redo');
  assert.equal(continuation.bindingStatus, 'SOURCE_DECLARED');
  assert.equal(review.objects['bridge.return-vila'].sourceCandidates[0].binding?.startFrame, 1);
  assert.throws(() => buildReview(contract, { ...provenance, contract: { path: '../outside', sha256: provenance.contract.sha256 } }));
});

test('checked-in review is reproducible from the exact contract, norm and generator bytes', async () => {
  const realProvenance = structuredClone(provenance);
  for (const ref of Object.values(realProvenance)) ref.sha256 = hash(await readFile(new URL(`../${ref.path}`, import.meta.url)));
  const generated = buildReview(contract, realProvenance);
  const stored = JSON.parse(await readFile(new URL('../references/pamela-motion-labels-review.json', import.meta.url), 'utf8'));
  assert.equal(canonicalJson(stored), canonicalJson(generated));
  for (const label of stored.labels) assert.ok(resolveReviewLabel(stored, label.value));
});
