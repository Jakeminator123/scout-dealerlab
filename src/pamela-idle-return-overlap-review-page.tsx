import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import PamelaSequenceReview from './pamela-sequence-review-client.tsx';
const checked = async (r: { path: string; sha256: string }) => { const b = await readFile(r.path); assert.equal(createHash('sha256').update(b).digest('hex'), r.sha256); return b; };
export default async function PamelaIdleReturnOverlapReviewPage({ id = 'overlap-4' }: { id?: string }) {
  assert.ok(['direct', 'overlap-2', 'overlap-4'].includes(id));
  const review = JSON.parse((await checked({ path: 'runs/20261110-pamela-idle-return-overlap/take-01/review.json', sha256: '305f2af93f70912b515b921fd8997c3aacecac406ae8aaffcbbb0d4762892aaf' })).toString());
  const proof = JSON.parse((await checked(review.evidence)).toString()), rendered = JSON.parse((await checked(review.renderEvidence)).toString());
  const row = rendered.rendered.find((r: { id: string }) => r.id === id), source = proof.outputs.find((r: { id: string }) => r.id === id); assert.ok(row && source);
  await checked(row); assert.equal(row.frames, source.frames); assert.equal(proof.retained.changedPixels, 0); assert.equal(proof.heldFrames, 0); assert.equal(proof.retimed, false);
  return <><nav style={{ padding: 20, display: 'flex', gap: 18, background: '#142019', color: '#bfd8c7', flexWrap: 'wrap' }}>
    <a href="/pamela-prov?view=two-sided-bank">Avstämningsrundan</a>
    {[['direct', 'Före · direkt klipp'], ['overlap-2', 'Efter · 2 rutor'], ['overlap-4', 'Efter · 4 rutor']].map(([value, label]) => <a key={value} style={{ fontWeight: id === value ? 700 : 400 }} href={`/pamela-prov?view=idle-return-overlap&id=${value}`}>{label}</a>)}
  </nav><PamelaSequenceReview proof={{ file: row.path, sha256: row.sha256, frames: row.frames, fps: 30, hasIdle: true,
    title: row.overlap ? `Tillbaka till VILA · ${row.overlap} rutors överlapp` : 'Tillbaka till VILA · direkt klipp',
    intro: 'Återgång, viloinledning och den nya viloloopen i samma scen. Alla fjorton kort ligger kvar. Jämför framför allt ögon, mun och naglar vid den markerade skarven.',
    landmarks: [{ label: 'Start', frame: 0 }, { label: 'Vila börjar', frame: 20 }, { label: 'Före skarven', frame: source.transition.start - 2 }, { label: 'Skarven', frame: source.transition.start }, { label: 'Efter skarven', frame: 43 }, { label: 'Nästa vilovarv', frame: 65 - row.overlap }],
    notes: `Bearbetad kandidat med båda källorna i 30 fps. ${row.overlap ? `Överlappet kortar filmen med ${row.overlap}/30 sekund. Kort hud- och nagelmjukning återstår.` : 'Direktklippet behåller ett synligt byte av ansiktstextur.'} Originalrörelsen och kvarliggande kort är bevarade före videokodning. Ingen sömlös originalskarv eller produktionsacceptans påstås.`,
  }}/></>;
}
