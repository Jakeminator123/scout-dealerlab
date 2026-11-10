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

test('actual V2 projects to exactly 17 targets, with distinct contextual returns and no runtime mutation', () => {
  const before = canonicalJson(contract), review = buildReview(contract, provenance);
  assert.equal(canonicalJson(contract), before);
  assert.deepEqual(review.counts, { dealTargets: 17, requestedDirectReturns: 17, requestedReadyReturns: 17, existingShoeReturnRequests: 1, dl1Labels: 52 });
  assert.equal(review.activeSelection, false);
  assert.equal(review.productionAccepted, false);
  assert.equal(review.paidJobsAuthorized, false);
  const deals = Object.values(review.objects).filter(o => o.projection.action === 'DEAL');
  assert.equal(deals.filter(o => o.sourceCandidates.some(s => s.binding)).length, 14);
  assert.deepEqual(deals.filter(o => !o.sourceCandidates.some(s => s.binding)).map(o => o.projection.target), ['D.C1', 'D.C2', 'D.C3']);
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
    } else {
      assert.equal(obj.projection.pickupSide, 'UNKNOWN');
      assert.equal(obj.projection.landingSide, 'UNKNOWN');
    }
  }
  assert.equal(review.nonDL1Requirements[0].kind, 'APPROACH');
  assert.equal(review.nonDL1Requirements[0].dl1, null);
  assert.equal(review.nonDL1Requirements[0].sourceCandidates[0].binding?.startFrame, 3);
  assert.equal(review.nonDL1Requirements[0].sourceCandidates[0].binding?.endFrameExclusive, 90);
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
    valid.replace('pickupSide=UNKNOWN', 'pickupSide=NOT_APPLICABLE'), valid.replace('ref=p1.c1.deal', 'ref=../secret'),
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
  assert.equal(review.objects['p1.c2.return-vila'].sourceCandidates[0].binding, null);
  assert.equal(review.objects['p1.c1.return-vila'].requirements.requiredReturnMode, 'direct');
  assert.equal(review.objects['p1.c1.return-vila'].observation.returnMode, 'UNKNOWN');
  assert.equal(review.objects['p1.c1.return-redo'].sourceCandidates.length, 0);
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
