import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildDealerNodeReview, projectDealerNodeMotions } from '../src/dealer-node-review.ts';
import { canonicalJson, type LabelsReview } from '../tools/dealer-motion-labels.ts';
import type { DealerMotionContract } from '../src/dealer-motion-contract.ts';

const contract: DealerMotionContract = JSON.parse(await readFile(new URL('../references/pamela-motion-contract-v2.json', import.meta.url), 'utf8'));
const labels: LabelsReview = JSON.parse(await readFile(new URL('../references/pamela-motion-labels-review.json', import.meta.url), 'utf8'));
const result = buildDealerNodeReview('node-review-test');
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

test('published node data retains every v2 motion and every requested target without accepting playback', async () => {
  const review = await result;
  assert.deepEqual(review.motions.map(m => m.id), contract.motions.map(m => m.id));
  assert.equal(review.revision, contract.revision);
  assert.equal(review.targets.length, 17);
  assert.equal(review.requirements.length, labels.labels.length);
  assert.ok(review.motions.some(m => m.id === 'return.P1.K1.to-redo' && m.target === 'P1.C1' && m.to === 'REDO'));
  assert.ok(review.motions.some(m => m.target === 'D.C3' && m.candidate === null));
  assert.ok(review.motions.every(m => m.runtimeAccepted === false && m.variant.interchangeable === false));
  assert.equal(review.counts.runtimeAccepted, 0);
  assert.equal(review.policy.productionAccepted, false);
  assert.equal(review.policy.paidJobsAuthorized, false);
  assert.ok(review.motions.filter(m => m.candidate).every(m => m.candidate!.file.bytesVerified));
  assert.equal(review.provenance.contract.sha256, sha(await readFile(new URL('../references/pamela-motion-contract-v2.json', import.meta.url))));
  assert.ok(review.requirements.every(r => !('path' in r.ref) && r.ref.document === 'references/pamela-motion-labels-review.json'));
});

test('DL1 association follows sourceCandidates motion IDs even after both lists are reordered', () => {
  const reversedContract = structuredClone(contract);
  reversedContract.motions.reverse();
  const reversedLabels = structuredClone(labels);
  reversedLabels.labels.reverse();
  reversedLabels.objects = Object.fromEntries(Object.entries(reversedLabels.objects).reverse());
  const projected = projectDealerNodeMotions(reversedContract, reversedLabels, new Set());
  for (const motion of projected) {
    const linked = reversedLabels.labels.find(l => reversedLabels.objects[l.ref.id].sourceCandidates.some(c => c.motionId === motion.id));
    assert.equal(motion.dl1, linked?.value ?? null, motion.id);
  }
  const physical = projected.find(m => m.id === 'deal.P1.K1.release')!;
  const legacy = projected.find(m => m.id === 'deal.seat-1.first')!;
  assert.equal(physical.dl1, legacy.dl1);
  assert.notEqual(physical.to, legacy.to);
  assert.equal(physical.from, 'REDO');
  assert.equal(physical.requested?.from, 'SHOE');
  assert.equal(physical.dl1Intent, 'REQUESTED');
});

test('unsupported and currently unmapped motions retain IDs instead of fabricated DL1 strings', async () => {
  const review = await result;
  for (const motion of review.motions.filter(m => ['idle', 'approach'].includes(m.kind))) {
    assert.equal(motion.dl1, null);
    assert.equal(motion.dl1Intent, null);
    assert.ok(motion.dl1UnavailableReason?.includes('motion-ID'));
  }
  const continuation = review.motions.find(m => m.id === 'return.P1.K1.to-redo')!;
  assert.equal(continuation.dl1, null);
  assert.equal(continuation.candidate, null);
  assert.equal(continuation.from, 'P1.C1.RELEASE');
  assert.ok(review.requirements.find(r => r.id === 'p1.c1.return-redo')?.sourceMotionIds.length === 0);
});

test('physical observation preserves unknown intervals and remains distinct from requested sides and acceptance', async () => {
  const motion = (await result).motions.find(m => m.id === 'deal.P1.K1.release')!;
  assert.equal(motion.requested?.pickupSide, 'UNKNOWN');
  assert.equal(motion.requested?.landingSide, 'UNKNOWN');
  assert.equal(motion.observation.physicalSideStatus, 'SOURCE_OBSERVED');
  assert.deepEqual(motion.observation.physicalSideTrack?.ranges.map(r => [r.startFrame, r.endFrameExclusive, r.side]), [
    [0, 40, 'UNKNOWN'], [40, 47, 'BACK'], [47, 49, 'EDGE'], [49, 100, 'FRONT'], [100, 103, 'UNKNOWN'],
  ]);
  assert.equal(motion.observation.localMotionReview.accepted, true);
  assert.equal(motion.observation.releaseFrame, 95);
  assert.equal(motion.qa.status, 'pending');
  assert.equal(motion.runtimeAccepted, false);
  assert.equal(motion.observation.hand, 'UNKNOWN');
  assert.equal(motion.observation.geometry.bodyGeometry, null);
  const unverified = projectDealerNodeMotions(contract, labels, new Set()).find(m => m.id === motion.id)!;
  assert.equal(unverified.observation.physicalSideStatus, 'UNKNOWN');
});

test('legacy 2D samples and masks bind to source bytes without upgrading physical geometry or variant QA', async () => {
  const review = await result;
  const reused = review.motions.filter(m => m.reuse);
  assert.equal(reused.length, 14);
  for (const motion of reused) {
    const reuse = motion.reuse!;
    assert.equal(reuse.source.sha256, motion.candidate!.file.sha256);
    assert.equal(reuse.source.path, motion.candidate!.file.path);
    assert.ok(reuse.geometry.sourceFrame >= motion.candidate!.startFrame && reuse.geometry.sourceFrame < motion.candidate!.endFrameExclusive);
    assert.equal(reuse.geometry.sourceFrame, 359);
    assert.equal(reuse.geometry.releaseAngleDeg, null);
    assert.equal(reuse.geometry.physical3dYawDeg, null);
    assert.equal(reuse.physicalSide, 'UNKNOWN');
    assert.equal(motion.observation.geometry.status, 'UNKNOWN');
    assert.equal(motion.observation.geometry.landingAngle, null);
    assert.ok(reuse.assets.masks.length > 0);
    assert.equal(motion.variant.status, 'NOT_DECLARED');
    assert.equal(reuse.approvedVariant, false);
  }
  assert.equal(review.motions.find(m => m.id === 'deal.P1.K1.release')!.reuse, null);
  assert.equal(review.additionalIdleCandidates.length, 2);
  assert.ok(review.additionalIdleCandidates.every(c => c.approvedVariant === false && c.geometry === null));
});

test('stale identity and tampered object bindings fail closed', () => {
  const stale = structuredClone(labels);
  stale.identity.sourceRevision = 'old-revision';
  assert.throws(() => projectDealerNodeMotions(contract, stale, new Set()), /revision mismatch/);
  const tampered = structuredClone(labels);
  tampered.objects['p1.c1.deal'].sourceCandidates[0].binding!.startFrame += 1;
  assert.throws(() => projectDealerNodeMotions(contract, tampered, new Set()), /hash mismatch/);
  const mismatched = structuredClone(labels);
  const descriptor = mismatched.objects['p1.c1.deal'];
  descriptor.sourceCandidates[0].binding!.startFrame += 1;
  mismatched.labels.find(l => l.ref.id === descriptor.id)!.ref.sha256 = sha(canonicalJson(descriptor));
  assert.throws(() => projectDealerNodeMotions(contract, mismatched, new Set()), /source candidate mismatch/);
});
