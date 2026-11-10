import assert from 'node:assert/strict';

export type PhysicalDealReview = {
  schemaVersion: 1; dealerId: 'pamela-pilot'; productionAccepted: false;
  requirement: string; rawColourMethod: string; nextStep: string;
  completedJobs: number; terminalCostCredits: number;
  sequences?: Array<{id:string;title:string;description:string;frames:number;fps:number;video:{path:string;sha256:string};evidence:Array<{path:string;sha256:string;label:string}>}>;
  transitionCostCredits?: number;
  baseCoverage?: {acceptedMotionTargets:number;totalTargets:number};
  variantPolicy?: string;
  takes: Array<{id: string; label: string; decision: string; reasons: string[];
    taskId: string; model: string; seconds: number; frames: number; fps: number;
    terminalCostCredits: number; qaSha256: string;
    original: {path: string; sha256: string};
    presentation?: {path: string; sha256: string; frames: number; sourceFrames: number[]; note: string};
    evidence: Array<{path: string; sha256: string; label: string}>}>;
};

export function physicalDealReviewRefs(review: PhysicalDealReview) {
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.dealerId, 'pamela-pilot');
  assert.equal(review.productionAccepted, false);
  assert.equal(review.completedJobs, review.takes.length);
  assert.equal(review.terminalCostCredits, review.takes.reduce((n,t)=>n+t.terminalCostCredits,0));
  if(review.baseCoverage) assert.ok(Number.isSafeInteger(review.baseCoverage.acceptedMotionTargets) && review.baseCoverage.acceptedMotionTargets>=0 && Number.isSafeInteger(review.baseCoverage.totalTargets) && review.baseCoverage.acceptedMotionTargets<=review.baseCoverage.totalTargets && review.baseCoverage.totalTargets>0);
  return [...review.takes.flatMap(t=>[t.original,...(t.presentation?[t.presentation]:[]),...t.evidence]),...(review.sequences??[]).flatMap(s=>[s.video,...s.evidence])];
}

export function physicalDealReviewSection(review: PhysicalDealReview, urls: Map<string,string>) {
  const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const url=(p:string)=>{const v=urls.get(p); assert.ok(v,'Missing physical-deal source '+p); return esc(v);};
  return `<section id="fysisk-givning"><h2>Fysisk givning · aktuella råprov</h2>
  <p><strong>${esc(review.requirement)}</strong></p><p>${esc(review.rawColourMethod)}</p>
  ${review.baseCoverage?`<p><strong>${review.baseCoverage.acceptedMotionTargets}/${review.baseCoverage.totalTargets} grundgivningar med lokalt godkänd rörelse</strong> · ${Math.round(100*(1-review.baseCoverage.acceptedMotionTargets/review.baseCoverage.totalTargets))} % återstår att godkänna. Produktionslager och övergångar bedöms separat.</p>`:''}
  ${review.variantPolicy?`<p><strong>Varianter:</strong> ${esc(review.variantPolicy)}</p>`:''}
  ${(review.sequences??[]).map(s=>`<article><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><video controls preload="metadata" playsinline style="width:100%;max-width:1100px" src="${url(s.video.path)}"></video><p>${s.frames} rutor / ${s.fps} fps · ${(s.frames/s.fps).toFixed(3)} s · ${s.evidence.map(e=>`<a href="${url(e.path)}">${esc(e.label)}</a>`).join(' · ')}</p></article>`).join('')}
  <p>${review.completedJobs} avslutade givningsprov · ${review.terminalCostCredits} krediter.${review.transitionCostCredits?` Nya övergångar: ${review.transitionCostCredits} krediter.`:''} Äldre returförsök redovisas separat. Ingen produktionsacceptans.</p>
  <details><summary>Enskilda givningsprov och ursprungliga råfilmer</summary>
  ${review.takes.map(t=>`<article><h3>${esc(t.label)} · ${esc(t.decision)}</h3>
  <p>${esc(t.model)} · ${t.seconds} s · ${t.frames} rutor / ${t.fps} fps · ${t.terminalCostCredits} krediter</p>
  <video controls preload="metadata" playsinline style="width:100%;max-width:1100px" src="${url((t.presentation??t.original).path)}"></video>
  ${t.presentation?`<p>${esc(t.presentation.note)} · ${t.presentation.frames} visade rutor. <a href="${url(t.original.path)}">Orört råoriginal</a></p>`:''}
  <ul>${t.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
  <p>${t.evidence.map(e=>`<a href="${url(e.path)}">${esc(e.label)}</a>`).join(' · ')}</p></article>`).join('')}
  </details><p><strong>Nästa steg:</strong> ${esc(review.nextStep)}</p></section>`;
}
