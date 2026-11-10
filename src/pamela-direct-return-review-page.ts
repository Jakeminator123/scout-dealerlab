import assert from 'node:assert/strict';

export type DirectReturnRef = { path: string; sha256: string };
type Format = { width: number; height: number; fps: number; frames: number; seconds: number };
type Variant = {
  id: 'P1-K1' | 'P1-K2'; looseCards: number;
  status: 'pending' | 'rejected' | 'candidate'; reasons: string[];
  accepted: boolean; acceptanceEvidence: DirectReturnRef | null;
  original: DirectReturnRef | null; proof: DirectReturnRef | null;
  evidence: DirectReturnRef | null; qa: DirectReturnRef | null;
  format: Format | null; proofFormat: Format | null;
  endpoints: { start: DirectReturnRef; end: DirectReturnRef };
  sheets: DirectReturnRef[];
  routeAudit?: DirectReturnRef;
};
export type DirectReturnReview = {
  schemaVersion: 1; dealerId: 'pamela-pilot'; productionAccepted: false;
  plan: DirectReturnRef; variants: Variant[];
  completedGenerationJobs?: number; totalGenerationCostCredits?: number;
};
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ref = (value: DirectReturnRef) => {
  assert.ok(value && /^(runs|references)\//.test(value.path) && !value.path.includes('\\') && !value.path.split('/').some(p => !p || p === '..' || p.startsWith('.')), 'Invalid direct-return reference');
  assert.match(value.sha256, /^[a-f0-9]{64}$/);
  return value;
};

/** Every selected file is returned for mandatory byte-hash verification by the builder. */
export function directReturnReviewRefs(review: DirectReturnReview): DirectReturnRef[] {
  assert.equal(review.schemaVersion, 1); assert.equal(review.dealerId, 'pamela-pilot'); assert.equal(review.productionAccepted, false);
  assert.equal(review.variants.length, 2);
  assert.deepEqual(review.variants.map(v => v.id).sort(), ['P1-K1', 'P1-K2']);
  const refs = [ref(review.plan)];
  for (const v of review.variants) {
    assert.equal(v.looseCards, v.id === 'P1-K1' ? 1 : 2);
    assert.ok(['pending', 'rejected', 'candidate'].includes(v.status)); assert.equal(typeof v.accepted, 'boolean');
    assert.ok(Array.isArray(v.reasons) && v.reasons.length > 0 && v.reasons.every(r => typeof r === 'string' && r.trim().length > 0));
    if (v.accepted) assert.ok(v.status === 'candidate' && v.acceptanceEvidence && v.original && v.proof && v.evidence && v.qa && v.format && v.proofFormat, 'Accepted return needs explicit visual evidence and both movies');
    for (const f of [v.format, v.proofFormat]) if (f) {
      for (const n of [f.width, f.height, f.frames]) assert.ok(Number.isSafeInteger(n) && n > 0);
      for (const n of [f.fps, f.seconds]) assert.ok(Number.isFinite(n) && n > 0);
    }
    for (const r of [v.original, v.proof, v.evidence, v.qa, v.acceptanceEvidence, v.routeAudit, v.endpoints.start, v.endpoints.end, ...v.sheets]) if (r) refs.push(ref(r));
  }
  const unique = new Map<string, DirectReturnRef>();
  for (const r of refs) { const previous = unique.get(r.path); if (previous) assert.equal(previous.sha256, r.sha256, 'Conflicting selected hashes'); unique.set(r.path, r); }
  return [...unique.values()];
}

export function directReturnReviewSummary(review: DirectReturnReview) {
  directReturnReviewRefs(review);
  const accepted = review.variants.filter(v => v.accepted).length;
  return {
    acceptance: { accepted, total: 2, percent: accepted * 50, scope: 'local-visual-pilot' },
    candidateCoverage: { available: 14, required: 17, percent: 14 / 17 * 100, missing: ['D.K1', 'D.K2', 'D.K3'] },
    variants: review.variants, productionAccepted: false,
  };
}

export function pamelaDirectReturnReviewSection(review: DirectReturnReview, urls: ReadonlyMap<string, string>, links: { manifest: string; contract: string; identity: string; simulator: string; dealerLabel: string }) {
  const summary = directReturnReviewSummary(review);
  const url = (r: DirectReturnRef) => { const value = urls.get(r.path); assert.ok(value, 'Missing selected direct-return file: ' + r.path); return esc(value); };
  const file = (r: DirectReturnRef | null, label: string) => r ? `<p><a href="${url(r)}">${esc(label)}</a><br><small>SHA-256: ${esc(r.sha256)}</small></p>` : '';
  const format = (f: Format | null) => f ? `${f.width} × ${f.height} · ${f.fps} fps · ${f.frames} rutor · ${f.seconds.toLocaleString('sv-SE', { maximumFractionDigits: 3 })} s` : 'Format ännu inte verifierat';
  const items = [...review.variants].sort((a, b) => a.id.localeCompare(b.id)).map(v => {
    const targetName = v.id === 'P1-K1' ? 'P1.C1' : 'P1.C2';
    const status = v.accepted ? 'Accepterad för lokalt visuellt prov' : v.status === 'rejected' ? 'Underkänd' : v.status === 'pending' ? 'Avvaktar' : 'Kandidat · inte accepterad';
    return `<article><h3>${targetName} → VILA</h3><p><strong>${status}</strong> · ${v.looseCards} kort ska ligga kvar. Bevarat källalias: ${esc(v.id)}.</p><ul>${v.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      ${v.original ? `<h4>Tre sekunders returoriginal · se beslut ovan</h4><video controls muted playsinline preload="metadata" src="${url(v.original)}"></video><p>${esc(format(v.format))} · 60 credits för detta API-klipp. Ankaracceptansen bedöms separat.</p>` : ''}
      ${v.proof ? `<h4>Sammanhängande prov med givning och returförsök</h4><video controls muted playsinline preload="metadata" src="${url(v.proof)}"></video><p>${esc(format(v.proofFormat))}</p>${file(v.proof, 'Öppna hela provet')}` : '<p>Det sammanhängande provet saknas ännu.</p>'}
      ${v.routeAudit ? `<details><summary>Faktiska rutor och rörelseväg i hela provet</summary><a href="${url(v.routeAudit)}"><img src="${url(v.routeAudit)}" alt="Tidsatta rutor ur ${esc(v.id)}: start, REDO, kortsläpp och återgång" loading="lazy" style="max-width:100%;height:auto"></a>${file(v.routeAudit,'Öppna rutjämförelsen')}</details>` : ''}
      <details><summary>Råretur, ändpunkter och QA</summary>${file(v.original, 'Öppna bevarat returoriginal')}
      <div class="grid">${[v.endpoints.start, v.endpoints.end].map((r, i) => `<div><a href="${url(r)}"><img src="${url(r)}" alt="${i ? 'VILA-slutbild' : 'Startbild efter kortsläpp'} för ${esc(v.id)}" loading="lazy" style="max-width:100%;height:auto"></a>${file(r, i ? 'VILA-ankare i full upplösning' : 'Startankare i full upplösning')}</div>`).join('')}</div>
      ${file(v.qa, 'QA och beslut')}${file(v.acceptanceEvidence, 'Evidens för lokal acceptans')}${file(v.evidence, 'Mätningar och proveniens')}${v.sheets.map((r, i) => file(r, `Kontaktark ${i + 1}`)).join('')}</details></article>`;
  }).join('');
  return `<section id="direktreturer"><h2>Två P1-prov: direkt tillbaka till VILA</h2><p><strong>${summary.acceptance.accepted}/2 accepterade (${summary.acceptance.percent} %)</strong> för lokalt visuellt prov. Kandidatstatus räknas inte som acceptans. Produktionsacceptans: <strong>0</strong>.</p>
    ${review.completedGenerationJobs !== undefined && review.totalGenerationCostCredits !== undefined ? `<p>Piloten: ${esc(review.completedGenerationJobs)} avslutade API-jobb, ${esc(review.totalGenerationCostCredits)} credits sammanlagt. Avvisade försök ingår. Inga fler jobb körs i denna leverans.</p>` : ''}
    <p>Målet är direkt återgång efter P1:s första respektive andra kort, utan ett nytt REDO-/skobesök efter sista släppet. Vilken rörelse och ankarbindning som faktiskt klarar granskningen anges per prov. Kort som redan ligger på bordet ska bevaras; äldre helrundor är historiska jämförelser.</p>
    <p>Bedömningen gäller tom hands direktretur efter släpp. Den bevisar ingen fysisk kortvändning eller färdig blackjackpresentation. En hand får täcka kortkanten under greppet; ett återbesök efter tydligt släpp är ett annat fall. Kortets synliga sida och motorns reveal är separata tillstånd.</p>
    <p><strong>14/17 = 82,4 % kandidattäckning</strong> i grundserien: två kort vardera till P1–P7. Dealerns tre kort D.C1, D.C2 och D.C3 saknas. C är primär kortnotation; äldre K-ID:n bevaras som alias. Detta är materialtäckning, inte godkänd rörelse- eller spelintegration.</p>
    <p>Identitet: <strong>${esc(links.dealerLabel)}</strong>. Projekt, bank, ankare och fullhashar följer dealerregistret. Motorn äger kortidentitet och reveal.</p>
    <p><a href="${esc(links.manifest)}">Provmanifest</a> · <a href="${esc(links.contract)}">V2-kontrakt</a> · <a href="${esc(links.identity)}">Dealeridentiteter</a> · <a href="${esc(links.simulator)}">Kontraktskod</a></p><div class="grid">${items}</div></section>`;
}
