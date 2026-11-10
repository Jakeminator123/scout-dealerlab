import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pamelaIdleChainPlan, idleChainSegments } from '../src/pamela-idle-chain-plan.ts';
const bounds = { dealStart: 222, dealEndExclusive: 4180, retreatEndExclusive: 4269 };

test('whole bank appears exactly once, including the four incoming overlap frames', () => {
  for (const overlap of [0, 4] as const) {
    const rows = pamelaIdleChainPlan(bounds, overlap), bank = rows.flatMap(r => r.b ? [r.a, r.b] : [r.a]).filter(f => f.source === 'bank');
    assert.equal(rows.length, 4327 - overlap);
    assert.deepEqual(bank.map(f => f.frame), Array.from({ length: 4047 }, (_, i) => 222 + i));
    assert.equal(rows.filter(r => r.b).length, overlap);
    assert.equal(rows.find(r => r.segment === 'deal-bank')!.a.frame, 226, 'Do not replay bank frame222 after the overlap');
    assert.equal(idleChainSegments(rows).reduce((n, s) => n + s.frames, 0), rows.length);
  }
});
test('the exact source mix and explicit table states stay bound to the reviewed windows', () => {
  const rows = pamelaIdleChainPlan(bounds), mixed = rows.filter(r => r.b);
  assert.deepEqual(mixed.map(r => [r.outputFrame, r.a.frame, r.b!.frame]), [[193, 86, 222], [194, 87, 223], [195, 88, 224], [196, 89, 225]]);
  assert.ok(rows.filter(r => r.outputFrame <= 196).every(r => r.table === 'empty'));
  const blink = rows.filter(r => r.segment === 'opening-blink');
  assert.equal(blink.length, 75); assert.equal(blink[0].a.frame, 252); assert.equal(blink.at(-1)!.a.frame, 326);
  const prefix = rows.filter(r => r.segment === 'idle-prefix'); assert.equal(prefix.length, 23); assert.equal(prefix.at(-1)!.a.frame, 22);
  assert.ok(rows.filter(r => r.segment.startsWith('closing')).every(r => r.table === 'fourteen-retained'));
  assert.equal(rows.at(-1)!.a.frame, 326);
});
test('invalid or empty source intervals fail before rendering', () => {
  for (const invalid of [{ ...bounds, dealStart: -1 }, { ...bounds, dealStart: 222.5 }, { ...bounds, dealEndExclusive: 226 }, { ...bounds, retreatEndExclusive: 4000 }]) assert.throws(() => pamelaIdleChainPlan(invalid));
});
test('a reviewed return overlap consumes only its declared frames and keeps both native phases', () => {
  for (const overlap of [0, 2, 4] as const) {
    const rows = pamelaIdleChainPlan(bounds, 4, overlap), returning = rows.filter(r => r.segment === 'idle-prefix' || r.segment === 'closing-phase');
    const originals = returning.flatMap(r => r.b ? [r.a, r.b] : [r.a]);
    assert.equal(rows.length, 4323 - overlap); assert.equal(returning.length, 45 - overlap);
    assert.deepEqual(originals.filter(f => f.frame < 23).map(f => f.frame), Array.from({ length: 23 }, (_, i) => i));
    assert.deepEqual(originals.filter(f => f.frame >= 305).map(f => f.frame), Array.from({ length: 22 }, (_, i) => 305 + i));
    assert.ok(returning.every(r => r.table === 'fourteen-retained'));
  }
});
