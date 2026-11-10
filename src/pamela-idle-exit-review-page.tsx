import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import PamelaSequenceReview from './pamela-sequence-review-client.tsx';

export default async function PamelaIdleExitReviewPage({ id }: { id?: string }) {
  const evidence = JSON.parse(await readFile('runs/20261110-pamela-idle-exit-overlap/take-01/evidence.json', 'utf8'));
  const selected = id ?? 'overlap-4';
  assert.ok(['direct', 'overlap-4', 'overlap-8', 'overlap-12'].includes(selected));
  const row = evidence.outputs.find((o: { id: string }) => o.id === selected); assert.ok(row);
  assert.equal(createHash('sha256').update(await readFile(row.output.path)).digest('hex'), row.output.sha256);
  assert.equal(evidence.retained.changedPixels, 0); assert.equal(evidence.heldFrames, 0); assert.equal(evidence.fps, 30);
  return <><nav style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: 20, background: '#142019', color: '#e4eee7' }}>
    {[['direct', 'Före · direkt klipp'], ['overlap-4', 'Efter · 4 rutor'], ['overlap-8', 'Jämför · 8 rutor'], ['overlap-12', 'Jämför · 12 rutor']].map(([value, label]) => <a key={value} style={{ color: '#bfd8c7', fontWeight: value === selected ? 700 : 400 }} href={`/pamela-prov?view=idle-exit&id=${value}`}>{label}</a>)}
  </nav><PamelaSequenceReview proof={{
    file: row.output.path, sha256: row.output.sha256, frames: row.frames, fps: 30, hasIdle: true,
    title: row.overlap ? `VILA → REDO · ${row.overlap} rutors överlapp` : 'VILA → REDO · direkt klipp före korrigering',
    intro: row.overlap ? `Två rörliga tagningar överlappar i ${(row.overlap / 30).toFixed(2)} sekunder. Ingen bildruta hålls stilla och båda källorna går i sin ursprungliga hastighet. De 14 korten ligger kvar på samma bord.` : 'Samma VILA, rörelsebrygga och givning med direkt klipp. Detta är jämförelsen före överlapp.',
    landmarks: [{ label: 'VILA', frame: 0 }, { label: 'In i bryggan', frame: 22 }, { label: 'Före utgång', frame: Math.max(0, row.transition.start - 5) }, { label: row.overlap ? 'Överlapp börjar' : 'Direkt klipp', frame: row.transition.start }, ...(row.overlap ? [{ label: 'Överlapp mitten', frame: row.transition.start + Math.floor(row.overlap / 2) }] : []), { label: 'Givningen', frame: row.transition.endExclusive }],
    notes: `Bearbetat granskningsprov. ${row.overlap ? `Överlappet kortar totalen med ${row.overlap} rutor; ` : ''}30 fps och källornas rörelsehastighet är bevarade. Granska särskilt ögon och fingrar för dubbelkonturer. Ingen sömlös originalskarv eller produktionsacceptans påstås. R16 och originalen ligger kvar.`,
  }}/></>;
}
