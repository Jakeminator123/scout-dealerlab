import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import PamelaSequenceReview from './pamela-sequence-review-client.tsx';

type Ref = { path: string; sha256: string };
const checked = async (r: Ref) => { const b = await readFile(r.path); assert.equal(createHash('sha256').update(b).digest('hex'), r.sha256, `Changed review input ${r.path}`); return b; };
export default async function PamelaIdleChainReviewPage({ id = 'full' }: { id?: string }) {
  assert.ok(['full', 'opening', 'opening-direct'].includes(id));
  const selection = JSON.parse(await readFile('references/pamela-idle-chain-review.json', 'utf8'));
  assert.match(selection.evidence.path, /^runs\/20261110-pamela-idle-chain\/take-\d{2}\/evidence\.json$/);
  assert.equal(selection.productionAccepted, false);
  const chain = JSON.parse((await checked(selection.evidence)).toString());
  assert.equal(chain.frames, 4319); assert.equal(chain.verification.changedDecodedFramesDuringAssembly, 0);
  assert.equal(chain.verification.contiguousFrameTimestamps, true); assert.equal(chain.loop, false);
  const isOpening = id !== 'full';
  const opening = isOpening ? JSON.parse((await checked(chain.opening)).toString()) : null;
  const part = opening?.outputs.find((r: { id: string }) => r.id === (id === 'opening-direct' ? 'direct' : 'overlap-4'));
  const movie = isOpening ? part.output : chain.output, frames = isOpening ? part.frames : chain.frames;
  await checked(movie);
  return <><nav style={{ padding: 20, display: 'flex', gap: 18, flexWrap: 'wrap', background: '#142019', color: '#bfd8c7' }}>
    <a href="/pamela-prov?view=two-sided-bank">Avstämningsrundan</a>
    <a href="/pamela-prov?view=idle-chain">Ny VILA-kedja · hela rundan</a>
    <a href="/pamela-prov?view=idle-chain&id=opening-direct">Öppning · direkt skarv</a>
    <a href="/pamela-prov?view=idle-chain&id=opening">Öppning · fyra rutors överlapp</a>
    <a href="/pamela-prov?view=idle-return-overlap">Tillbaka till VILA · före/efter</a>
  </nav><PamelaSequenceReview proof={{ file: movie.path, sha256: movie.sha256, frames, fps: 30, hasIdle: true,
    title: isOpening ? `VILA → REDO · ${id === 'opening-direct' ? 'direkt skarv' : 'fyra rutors överlapp'}` : 'Ny VILA-kedja · två kort till alla sju',
    intro: isOpening
      ? 'En blinkning, en lugn vilovariant och rörelsen mot skon. Korttrycket finns även i vilan och följer fingrarna fram till den befintliga givningen.'
      : 'Två vilovarianter, REDO, två givningar till samtliga sju platser och tillbaka till VILA. Bordet börjar tomt och alla fjorton kort ligger kvar i slutet.',
    landmarks: isOpening ? [{ label: 'VILA · blinkning', frame: 0 }, { label: 'VILA · lugn variant', frame: 75 }, { label: 'Mot REDO', frame: 113 }, { label: 'Före skarven', frame: 190 }, { label: 'Skarven', frame: 193 }, { label: 'Sista rutan', frame: frames - 1 }] : chain.landmarks,
    notes: `Separat lokal granskningskandidat. Korta överlapp mjukar upp skarvarna; ansiktstextur, handkanter och vissa posebyten behöver fortsatt granskning. Kortvärdena är uttryckliga demonstrationsvärden. ${isOpening ? 'Jämförelseklippen slutar efter övergången till givning.' : 'Slutvilan behåller korten och startar ingen ny runda automatiskt. Rum, bord och skobyten granskas i den separata interaktiva scenen.'}`,
  }}/></>;
}
