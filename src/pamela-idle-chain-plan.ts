import { temporalJoin, type TemporalFrame, type TemporalJoinFrame } from './pamela-temporal-join.ts';

export type IdleChainSegment = 'opening-blink' | 'opening-still' | 'to-ready' | 'deal-bank' | 'to-idle' | 'idle-prefix' | 'closing-phase' | 'closing-still';
export type IdleChainFrame = TemporalJoinFrame & { segment: IdleChainSegment; table: 'empty' | 'bank-owned' | 'fourteen-retained' };
export type IdleChainBankBounds = { dealStart: number; dealEndExclusive: number; retreatEndExclusive: number };
const frames = (source: string, start: number, end: number): TemporalFrame[] => Array.from({ length: end - start }, (_, i) => ({ source, frame: start + i }));

/** A presentation edit of frozen sources. It never decides card values or
 * starts another round. B's native1764 columns are preserved by the renderer.
 * The blink sequence is75 frames: the known65-frame window plus10 original
 * following frames, not another copy of the shorter one-loop asset.
 */
export function pamelaIdleChainPlan(bank: IdleChainBankBounds, overlap: 0 | 4 = 4, returnOverlap: 0 | 2 | 4 = 0): IdleChainFrame[] {
  const { dealStart, dealEndExclusive, retreatEndExclusive } = bank;
  if (![dealStart, dealEndExclusive, retreatEndExclusive].every(Number.isSafeInteger) || dealStart < 0 || dealEndExclusive <= dealStart + 4 || retreatEndExclusive <= dealEndExclusive || ![0, 4].includes(overlap) || ![0, 2, 4].includes(returnOverlap)) throw Error('Invalid reviewed bank interval');
  const out: IdleChainFrame[] = [];
  const plain = (segment: IdleChainSegment, table: IdleChainFrame['table'], source: string, start: number, end: number) => {
    for (const a of frames(source, start, end)) out.push({ outputFrame: 0, segment, table, a, weightB: 0 });
  };
  plain('opening-blink', 'empty', 'B', 252, 327);
  plain('opening-still', 'empty', 'B', 289, 327);
  for (const row of temporalJoin(frames('bridge', 6, 90), frames('bank', dealStart, dealStart + 4), overlap)) out.push({ ...row, segment: 'to-ready', table: 'empty' });
  plain('deal-bank', 'bank-owned', 'bank', dealStart + 4, dealEndExclusive);
  plain('to-idle', 'fourteen-retained', 'bank', dealEndExclusive, retreatEndExclusive);
  for (const row of temporalJoin(frames('B', 0, 23), frames('B', 305, 327), returnOverlap)) out.push({ ...row, segment: row.a.frame < 23 ? 'idle-prefix' : 'closing-phase', table: 'fourteen-retained' });
  plain('closing-still', 'fourteen-retained', 'B', 289, 327);
  return out.map((row, outputFrame) => ({ ...row, outputFrame }));
}

export function idleChainSegments(plan: readonly IdleChainFrame[]) {
  const result: Array<{ id: IdleChainSegment; startInclusive: number; endExclusive: number; frames: number; table: IdleChainFrame['table'] }> = [];
  for (const row of plan) {
    const current = result.at(-1);
    if (current?.id === row.segment) { current.endExclusive++; current.frames++; }
    else result.push({ id: row.segment, startInclusive: row.outputFrame, endExclusive: row.outputFrame + 1, frames: 1, table: row.table });
  }
  return result;
}
