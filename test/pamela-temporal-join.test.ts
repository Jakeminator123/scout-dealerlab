import { test } from 'node:test';
import assert from 'node:assert/strict';
import { temporalJoin, mixTemporalComposites } from '../src/pamela-temporal-join.ts';
const clip = (source: string, start: number, n: number) => Array.from({ length: n }, (_, i) => ({ source, frame: start + i }));
test('overlap advances both native sequences once and reports consumed duration', () => {
  for (const overlap of [0, 4, 8, 12]) {
    const a = clip('bridge', 6, 84), b = clip('bank', 17, 21), output = temporalJoin(a, b, overlap);
    assert.equal(output.length, 105 - overlap);
    const all = output.flatMap(f => f.b ? [f.a, f.b] : [f.a]);
    assert.deepEqual(all.filter(f => f.source === 'bridge'), a);
    assert.deepEqual(all.filter(f => f.source === 'bank'), b);
    assert.equal(output.filter(f => f.b).length, overlap);
    assert.ok(output.filter(f => f.b).every(f => f.weightB > 0 && f.weightB < 1));
  }
});
test('fixed background and retained card pixels remain byte-identical in a mixture', () => {
  const a = Uint8Array.from([13, 47, 71, 242, 239, 230, 10, 20, 30]);
  const b = Uint8Array.from([13, 47, 71, 242, 239, 230, 150, 90, 70]);
  for (const weight of [0, .1, .5, .9, 1]) assert.deepEqual(mixTemporalComposites(a, b, weight).slice(0, 6), a.slice(0, 6));
});
test('noncontiguous footage and invalid mixtures fail closed', () => {
  assert.throws(() => temporalJoin([{ source: 'a', frame: 1 }, { source: 'a', frame: 3 }], clip('b', 0, 3), 1));
  assert.throws(() => temporalJoin(clip('a', 0, 2), clip('b', 0, 2), 3));
  assert.throws(() => mixTemporalComposites(new Uint8Array(3), new Uint8Array(6), .5));
  assert.throws(() => mixTemporalComposites(new Uint8Array(3), new Uint8Array(3), NaN));
});
