import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import PamelaCardSideReview, { type CardSideReviewManifest } from '../../src/pamela-card-side-review-client.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pamela P1 · kortsidor i Three' };
const path = 'runs/20261110-pamela-card-side-review/take-01/manifest.json';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export default async function PamelaCardSideReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const initialConcealUnverifiedTurn = (await searchParams).mode !== 'authored-demo';
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return <main style={{ padding: 28 }}><h1>P1:s sidprov förbereds</h1><p>Ingen GPU-granskning är ännu klar. Original och aktiv bank ändras inte.</p></main>; throw error; }
  const manifest = JSON.parse(bytes.toString()) as CardSideReviewManifest & { productionAccepted: boolean; activeSelectionChanged: boolean; newApiJobs: number };
  assert.equal(manifest.projectId, 'snyggare-dealer'); assert.equal(manifest.dealerId, 'pamela-pilot'); assert.equal(manifest.bankId, 'pamela-workspace-v1');
  assert.equal(manifest.productionAccepted, false); assert.equal(manifest.activeSelectionChanged, false); assert.equal(manifest.newApiJobs, 0);
  assert.deepEqual(manifest.clips.map(c => c.id), ['C1-P1', 'C2-P1']);
  for (const c of manifest.clips) { assert.equal(c.frames.length, 360); assert.equal(c.source.fps, 30); assert.equal(hash(await readFile(c.source.path)), c.source.sha256); }
  const code = [];
  for (const p of ['src/pamela-card-side-review-client.tsx', 'src/pamela-card-atlas.ts', 'app/pamela-sidprov/page.tsx']) code.push({ path: p, sha256: hash(await readFile(p)) });
  const presentation = JSON.parse(await readFile('references/pamela-presentation-review.json', 'utf8'));
  assert.equal(presentation.projectId, manifest.projectId); assert.equal(presentation.dealerId, manifest.dealerId); assert.ok(Array.isArray(presentation.checklist));
  return <PamelaCardSideReview manifest={manifest} manifestRef={{ path, sha256: hash(bytes) }} code={code} checklist={presentation.checklist} initialConcealUnverifiedTurn={initialConcealUnverifiedTurn} />;
}
