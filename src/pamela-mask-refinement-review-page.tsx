import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import PamelaSequenceReview from './pamela-sequence-review-client.tsx';

export default async function PamelaMaskRefinementReviewPage({ id = 'C1-P7', side }: { id?: string; side?: string }) {
  assert.ok(id === 'C1-P7' || id === 'C2-P6');
  const e = JSON.parse(await readFile('runs/20261110-pamela-bank-mask-integration/take-03/evidence.json', 'utf8'));
  const part = e.parts.find((p: { id: string }) => p.id === id); assert.ok(part);
  const before = side === 'before', movie = before ? part.previousMovie : part.output;
  assert.equal(createHash('sha256').update(await readFile(movie.path)).digest('hex'), movie.sha256);
  const nav = { display: 'flex', gap: 20, padding: 20, flexWrap: 'wrap' as const, color: '#c4dfcc', background: '#142019' };
  const range = id === 'C1-P7' ? [74, 77, 78, 86, 88, 102, 107, 108, 112] : [102, 105, 106, 117, 118, 127, 128, 129, 132];
  return <><nav style={nav}>
    <a href={`/pamela-prov?view=mask-correction&id=${id}&side=before`}>Före · R16</a>
    <a href={`/pamela-prov?view=mask-correction&id=${id}`}>Efter · lokal kortmask</a>
    <a href="/pamela-prov?view=mask-correction&id=C1-P7">Första kortet · plats 7</a>
    <a href="/pamela-prov?view=mask-correction&id=C2-P6">Andra kortet · plats 6</a>
  </nav><PamelaSequenceReview proof={{ file: movie.path, sha256: movie.sha256, frames: 360, fps: 30, hasIdle: false,
    title: `${before ? 'Före' : 'Efter'} · kortmask ${id === 'C1-P7' ? 'plats 7' : 'plats 6'}`,
    intro: id === 'C1-P7' ? 'Samma tolvsekunderstagning. Korrigeringen tar bort korttryck som tidigare hamnade på den grå skokanten när kortet lyftes.' : 'Samma tolvsekunderstagning. Korrigeringen täcker den vita kortspets som tidigare låg utanför tryckmasken. Handen och första kortet behåller sina skydd.',
    landmarks: [{ label: 'Start', frame: 0 }, ...range.map(frame => ({ label: `Ruta ${frame}`, frame })), { label: 'Slut', frame: 359 }],
    notes: 'Avgränsad lokal korrigering av pappersytan. Kortidentitet, visningstillstånd, kortsida och originalrörelse är oförändrade. Äldre R16 med helrunda och ZIP är sparad som återställningspunkt. Andra maskkanter kan fortfarande behöva förfinas.',
  }}/></>;
}
