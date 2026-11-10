import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PAMELA_MOTION_CONTRACT_SCHEMA, PAMELA_MOTION_SCHEMA_ID, applyMotionTransition, checkMotionTransition, initialMotionState, listMissingClips, validateMotionContract, type MotionContract, type MotionState, type MotionClip } from '../src/pamela-motion-contract.ts';

const shipped = JSON.parse(await readFile(new URL('../references/pamela-motion-contract.json', import.meta.url), 'utf8')) as MotionContract;
// Synthetic approvals test the API; they do not change or approve the real JSON/media.
const proof = { path: 'runs/test-fixture/compatibility.json', sha256: 'f'.repeat(64) };
function approve(c: MotionContract, id: string): MotionClip {
  const clip = c.clips.find(item => item.id === id)!;
  assert(clip.binding);
  clip.binding.presentation = 'separable-layers';
  clip.qa = { status: 'approved', evidence: proof, reason: 'Synthetic test fixture only' };
  return clip;
}
function gate(c: MotionContract, state: MotionState, clip: MotionClip) {
  assert(clip.binding);
  c.edgeGates.push({ from: { ...state.boundary }, to: { nodeId: clip.id, sha256: clip.binding.sha256, frame: clip.binding.startFrame }, qa: { status: 'approved', evidence: proof, reason: 'Synthetic endpoint check' } });
}

test('shipped contract distinguishes 14 action slots, real references and missing media', () => {
  assert.deepEqual(validateMotionContract(shipped), []);
  assert.equal(PAMELA_MOTION_CONTRACT_SCHEMA.$id, PAMELA_MOTION_SCHEMA_ID);
  assert.equal(shipped.cardSlots.length, 14);
  assert.equal(new Set(shipped.cardSlots.map(slot => slot.presentationTemplateId)).size, 14);
  assert.equal(shipped.clips.filter(clip => clip.kind === 'deal').length, 14);
  assert.equal(shipped.clips.filter(clip => clip.kind === 'idle').length, 3);
  const missing = listMissingClips(shipped);
  assert.equal(missing.length, 19);
  assert.deepEqual(missing.filter(item => item.reasons.includes('missing-media')), []);
  assert(missing.find(item => item.clipId === 'deal.seat-1.first')!.reasons.includes('qa-pending'));
  const firstCardHashes = [
    '8402ddfcaabf1356b25b28fc8e7e3ca59121260eee6b188b7bfed431b2af9307',
    'dc9e35760fd708a6b7c004e3bc255e9c5e8207aa6ddd5bc274c0e3c62dd3f001',
    '312f8d9b612cf58cf7cf21a26c77b169bb930d00e3348ffe9fa1cdf0dc574eb9',
    '4e252be2235ce42cec5de9d49b993d0ffed1c029de9890faea6686f46824f87c',
    'edd74e2620327c41080d0f1610e2865d0ddfc44bd2b9e7bf56f114a408e26acf',
    'dee43b673dbd3014efdcdccd4b5dbea9a4256a1bc33bf760b554d1fbcfe633bb',
    'b37dbc6cafa99378786eff51ac1e8cb69c3bb01824b2107d390ddd7032a4620e',
  ];
  for (let seat = 1; seat <= 7; seat++) {
    const clip = shipped.clips.find(item => item.id === `deal.seat-${seat}.first`)!;
    assert(clip.binding);
    assert.equal(clip.binding.sha256, firstCardHashes[seat - 1]);
    assert.equal(clip.binding.startFrame, 0);
    assert.equal(clip.binding.endFrameExclusive, 360);
    assert.equal(clip.binding.presentation, 'raw-reference');
    assert.equal(clip.qa.status, 'pending');
    assert(clip.qa.evidence);
    assert(clip.qa.evidence.path.startsWith('runs/20261109-pamela-seat-bank/'));
    assert.match(clip.qa.evidence.sha256, /^[a-f0-9]{64}$/);
    assert.equal(shipped.assets.find(asset => asset.id === clip.binding!.assetId)!.frames, 360);
  }
  assert.deepEqual(shipped.clips.filter(clip => clip.kind === 'idle').map(clip => [clip.binding!.startFrame, clip.binding!.endFrameExclusive]), [[22, 157], [279, 357], [175, 282]]);
  const secondCardHashes = [
    '98ff074a7815cf5ecb2e58a85748e9da79b8acd04a9a97048222ddb104bb6813',
    'ba257d6f88f95536521fe3170f5c5517f53bb447ced7de908cea94683795d77c',
    'bce1003fedde8573cfd85470367a16e439d40c230e3f526c5a51a105d151794b',
    '67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167',
    '9a73beb62ccaa93325c7f3d0a65feb3c767ad873d1d3678f9ad494e53a8b0a58',
    'daf180780c20f398f123c30e966c1ab03e1698556ffd5dbfd2221da35f0538f5',
    'd1ecb53516f3b5a4c7fd173a5129775845dbdfca4c35f495e0ac6d2378dd5dbf',
  ];
  for (let seat=1;seat<=7;seat++) {
    const clip=shipped.clips.find(c=>c.id===`deal.seat-${seat}.second`)!;
    assert.deepEqual(clip.binding,{assetId:`seat${seat}-c2-bank-v2-raw`,sha256:secondCardHashes[seat-1],startFrame:0,endFrameExclusive:360,presentation:'raw-reference'});
    assert.equal(clip.qa.status,'pending');
    assert.match(clip.qa.evidence!.path,new RegExp(`/bank-v2-stage-[12]/qa/seat-${seat}/review.json$`));
    assert.equal(shipped.assets.find(a=>a.id===clip.binding!.assetId)!.frames,360);
  }
  assert.equal(shipped.clips.filter(clip => clip.qa.status === 'approved').length, 0);
  assert.equal(shipped.assets.find(asset => asset.id === 'v6-native')!.sha256, '412a2fa01f9e852e8894002076b5771181bd6afd4ddeef1be76c0640d5853a2d');
  assert.equal(shipped.assets.find(asset => asset.id === 'seat1-raw')!.frames, 360);
  assert.equal(shipped.assets.find(asset => asset.id === 'seat1-first-last-raw')!.sha256, '5abd5dd1107d7433c8efc0d95164c2c7af3b2b9703f1123c87f8f02da378bc0b');
  assert.equal(shipped.clips.find(clip => clip.id === 'deal.seat-1.first')!.binding!.assetId, 'seat1-symmetric-v2-raw');
  assert.deepEqual(shipped.clips.filter(clip => clip.kind === 'bridge').map(clip => [clip.binding!.assetId, clip.binding!.startFrame, clip.binding!.endFrameExclusive]), [['approach-raw', 3, 90], ['retreat-raw', 1, 90]]);
});

test('the REDO label cannot bypass pending, rejected, baked or missing endpoint QA', () => {
  const state = initialMotionState(shipped, 'REDO');
  assert.throws(() => applyMotionTransition(shipped, state, 'deal.seat-1.first', { id: 'new', appearanceId: 'external-art' }), /QA pending/);
  const rejected=structuredClone(shipped);rejected.clips.find(item=>item.id==='deal.seat-1.first')!.qa.status='rejected';
  assert.throws(() => applyMotionTransition(rejected, state, 'deal.seat-1.first', { id: 'new', appearanceId: 'external-art' }), /QA rejected/);
  const c = structuredClone(shipped), clip = c.clips.find(item => item.id === 'deal.seat-4.first')!;
  clip.qa = { status: 'approved', evidence: proof, reason: 'Synthetic only' };
  assert.throws(() => applyMotionTransition(c, state, clip.id, { id: 'new', appearanceId: 'external-art' }), /Baked\/raw reference/);
  approve(c, clip.id);
  assert.throws(() => applyMotionTransition(c, state, clip.id, { id: 'new', appearanceId: 'external-art' }), /compatibility gate not approved/);
});

test('idle preserves a populated table and cannot silently auto-loop or add cards', () => {
  const c = structuredClone(shipped), clip = approve(c, 'idle.blink');
  const cards = [{ id: 'existing', appearanceId: 'caller-art-A', slotId: 'seat-6.card-2' }];
  const state = initialMotionState(c, 'VILA', cards), snapshot = structuredClone(state);
  gate(c, state, clip);
  const next = applyMotionTransition(c, state, clip.id);
  assert.deepEqual(next.alreadyDealtCards, cards);
  assert.deepEqual(state, snapshot);
  assert.notEqual(next.alreadyDealtCards[0], state.alreadyDealtCards[0]);
  assert.throws(() => applyMotionTransition(c, next, clip.id), /compatibility gate not approved/);
  assert.throws(() => applyMotionTransition(c, state, clip.id, { id: 'extra', appearanceId: 'art' }), /Only a deal/);
});

test('two ordinal actions append separate instances without replacing an existing card', () => {
  const c = structuredClone(shipped), first = approve(c, 'deal.seat-4.first'), second = approve(c, 'deal.seat-4.second');
  const prior = [{ id: 'earlier', appearanceId: 'same-external-art', slotId: 'seat-1.card-1' }];
  const state = initialMotionState(c, 'REDO', prior); gate(c, state, first);
  const afterFirst = applyMotionTransition(c, state, first.id, { id: 'central-1', appearanceId: 'same-external-art' });
  gate(c, afterFirst, second);
  const afterSecond = applyMotionTransition(c, afterFirst, second.id, { id: 'central-2', appearanceId: 'different-art' });
  assert.deepEqual(afterSecond.alreadyDealtCards.map(card => [card.id, card.slotId]), [['earlier', 'seat-1.card-1'], ['central-1', 'seat-4.card-1'], ['central-2', 'seat-4.card-2']]);
  assert.deepEqual(state.alreadyDealtCards, prior);
  assert.equal(afterFirst.alreadyDealtCards.length, 2);
  assert.throws(() => applyMotionTransition(c, state, first.id, { id: 'earlier', appearanceId: 'other-art' }), /must be unique/);
  gate(c, afterSecond, first);
  assert.throws(() => applyMotionTransition(c, afterSecond, first.id, { id: 'overwrite', appearanceId: 'other-art' }), /overwrite an already dealt card/);
});

test('ordinal is a presentation slot, not a local game-order rule', () => {
  const c = structuredClone(shipped), second = approve(c, 'deal.seat-4.second');
  const state = initialMotionState(c, 'REDO'); gate(c, state, second);
  const next = applyMotionTransition(c, state, second.id, { id: 'engine-requested-instance', appearanceId: 'engine-selected-art' });
  assert.equal(next.alreadyDealtCards[0].slotId, 'seat-4.card-2');
});

test('changed media, changed endpoints and contract revisions invalidate compatibility', () => {
  const c = structuredClone(shipped), clip = approve(c, 'idle.blink');
  const state = initialMotionState(c, 'VILA'); gate(c, state, clip);
  clip.binding!.startFrame++;
  assert(validateMotionContract(c).some(error => error.includes('Stale/incompatible endpoint gate')));
  assert.throws(() => applyMotionTransition(c, state, clip.id), /Stale/);
  clip.binding!.startFrame--;
  c.revision = 'new-revision';
  assert(checkMotionTransition(c, state, clip.id).some(error => error.includes('different motion contract')));
  c.assets.find(asset => asset.id === clip.binding!.assetId)!.sha256 = 'e'.repeat(64);
  assert(validateMotionContract(c).some(error => error.includes('Invalid hash/frame binding')));
});

test('cuts cannot extend beyond actual source frames or collapse into an empty interval', () => {
  const c = structuredClone(shipped), clip = c.clips.find(item => item.id === 'deal.seat-1.first')!;
  clip.binding!.endFrameExclusive = 361;
  assert(validateMotionContract(c).some(error => error.includes('Invalid hash/frame binding')));
  clip.binding!.endFrameExclusive = clip.binding!.startFrame;
  assert(validateMotionContract(c).some(error => error.includes('Invalid hash/frame binding')));
  assert(validateMotionContract(null).includes('Malformed motion contract'));
});

test('pose mismatch and invalid existing card state fail without mutating the input', () => {
  const c = structuredClone(shipped), clip = approve(c, 'deal.seat-4.first');
  const state = initialMotionState(c, 'VILA'), snapshot = structuredClone(state);
  assert.throws(() => applyMotionTransition(c, state, clip.id, { id: 'new', appearanceId: 'art' }), /Pose mismatch/);
  assert.deepEqual(state, snapshot);
  assert.throws(() => initialMotionState(c, 'REDO', [{ id: 'same', appearanceId: 'a', slotId: 'seat-1.card-1' }, { id: 'same', appearanceId: 'b', slotId: 'seat-2.card-1' }]), /Duplicate card/);
});
