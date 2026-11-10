/** Explicit video edit. Both inputs advance by one native frame at 30 fps.
 * Overlap consumes N frames of duration; it never freezes or retimes a source.
 * This is a processed transition candidate, not proof of a native seamless cut.
 */
export type TemporalFrame = { source: string; frame: number };
export type TemporalJoinFrame = {
  outputFrame: number;
  a: TemporalFrame;
  b?: TemporalFrame;
  weightB: number;
};
export function temporalJoin(a: readonly TemporalFrame[], b: readonly TemporalFrame[], overlap: number): TemporalJoinFrame[] {
  if (!Number.isInteger(overlap) || overlap < 0 || overlap > Math.min(a.length, b.length)) throw Error('Invalid overlap length');
  for (const clip of [a, b]) for (let i = 0; i < clip.length; i++) {
    if (!clip[i].source || !Number.isInteger(clip[i].frame) || clip[i].frame < 0) throw Error('Invalid source frame');
    if (i && (clip[i].source !== clip[i - 1].source || clip[i].frame !== clip[i - 1].frame + 1)) throw Error('Native contiguous inputs required');
  }
  const output: TemporalJoinFrame[] = a.slice(0, a.length - overlap).map(f => ({ outputFrame: 0, a: f, weightB: 0 }));
  for (let i = 0; i < overlap; i++) {
    const t = (i + 1) / (overlap + 1);
    output.push({ outputFrame: 0, a: a[a.length - overlap + i], b: b[i], weightB: t * t * (3 - 2 * t) });
  }
  output.push(...b.slice(overlap).map(f => ({ outputFrame: 0, a: f, weightB: 0 })));
  return output.map((f, outputFrame) => ({ ...f, outputFrame }));
}

/** Mixing two composites over the same fixed base also preserves that base.
 * Encoded RGB mixing is explicit. No color correction or spatial warp occurs.
 */
export function mixTemporalComposites(a: Uint8Array, b: Uint8Array, weightB: number): Uint8Array {
  if (a.length !== b.length || a.length % 3 || !Number.isFinite(weightB) || weightB < 0 || weightB > 1) throw Error('Invalid RGB composite mixture');
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.round(a[i] * (1 - weightB) + b[i] * weightB);
  return out;
}
