import type { StudioData } from '../studio-client';
export type AuditData = Pick<StudioData, 'assets' | 'schemes'>;
export type NameHint = { label: string; confidence: string; position?: string; suffix?: string; from?: string; to?: string };
export function nameHint(name: string): NameHint {
  const base = name.split('/').pop()!.toLowerCase();
  const pos = base.match(/(?:^|_)pos([1-7])(?:-(iv|i|v))?\.mp4$/);
  if (pos) {
    const suffix = pos[2] || 'base';
    const poses: Record<string, [string, string]> = { i: ['VILA', 'REDO'], base: ['REDO', 'REDO'], v: ['REDO', 'VILA'], iv: ['VILA', 'VILA'] };
    return { label: `Spelarplats ${pos[1]} · ${suffix}`, position: pos[1], suffix, from: poses[suffix][0], to: poses[suffix][1], confidence: 'namnförslag' };
  }
  if (/flip|vandning|vändning/.test(base)) return { label: 'Vändning · separat kontrakt', confidence: 'namnförslag' };
  if (/(?:^|[_-])(idle|vila|andas|andning)(?:[_.-]|$)/.test(base)) return { label: 'Vila / möjlig vilovariant', confidence: 'namnförslag' };
  return { label: 'Namnet räcker inte för att bestämma rörelsen', confidence: 'okänt' };
}
export function declaredHash(evidence = '') { return evidence.match(/(?:klipphash|SHA(?:-256)?)\s+([a-f0-9]{64})/i)?.[1].toLowerCase(); }
export function auditClip(asset: AuditData['assets'][number], schemes: AuditData['schemes']) {
  const hint = nameHint(asset.name);
  const candidates = schemes.flatMap(scheme => scheme.transitions.flatMap(transition => {
    const byPath = transition.assetPath === asset.path;
    const byName = hint.position && (transition.clipKey === `${hint.position}:${hint.suffix}` || transition.clipKey === `pos${hint.position}${hint.suffix === 'base' ? '' : '-' + hint.suffix}`);
    if (!byPath && !byName) return [];
    const expected = declaredHash(transition.evidence);
    return [{ scheme: scheme.label, slot: transition.clipKey, from: transition.from, to: transition.to, pathBound: byPath, expectedHash: expected, hashStatus: expected ? expected === asset.sha256?.toLowerCase() ? 'match' : 'mismatch' : 'unknown', hasGeometry: Boolean(transition.coordinates), evidence: transition.evidence || '' }];
  }));
  return { hint, candidates };
}
export function schemeCoverage(data: AuditData) {
  return data.schemes.map(scheme => ({ id: scheme.id, label: scheme.label, planned: scheme.transitions.length,
    bound: scheme.transitions.filter(t => Boolean(t.assetPath)).length,
    hashMatched: scheme.transitions.filter(t => { const asset = data.assets.find(a => a.path === t.assetPath); const expected = declaredHash(t.evidence); return Boolean(asset?.sha256 && expected && asset.sha256.toLowerCase() === expected); }).length,
  }));
}
