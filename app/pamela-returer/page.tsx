import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { headers } from 'next/headers';
import { safeFile } from '../../src/library.ts';
import { directReturnReviewRefs, pamelaDirectReturnReviewSection, type DirectReturnRef, type DirectReturnReview } from '../../src/pamela-direct-return-review-page.ts';
import { physicalDealReviewRefs, physicalDealReviewSection, type PhysicalDealReview } from '../../src/pamela-physical-deal-review.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pamela P1 · direktreturer till VILA' };
const pointerPath = 'references/pamela-direct-return-review.json';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fileUrl = (p: string) => '/files/' + p.split('/').map(encodeURIComponent).join('/');
const pending = () => <main style={{ padding: 28 }}><h1>P1:s direktreturer förbereds</h1><p>Det valda granskningsmanifestet är ännu inte tillgängligt. Ingen acceptans ändras.</p><a href="/studio">Till studion</a></main>;

function checkReviewJson(bytes: Buffer) {
  const text = bytes.toString('utf8');
  assert.ok(!/\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{28,}|\bgh[pousr]_[A-Za-z0-9]{25,}/.test(text), 'Private value in review data');
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>`]+/g)) {
    const url = new URL(match[0]);
    assert.ok(!url.username && !url.password && ![...url.searchParams.keys()].some(k => /^(?:_jwt|token|signature|X-Amz-Signature)$/i.test(k)), 'Authenticated review URL');
  }
  const value = JSON.parse(text);
  function inspect(v: unknown): void {
    if (!v || typeof v !== 'object') return;
    for (const [key, item] of Object.entries(v)) {
      assert.ok(!/^(?:walletBefore|walletDelta|creditBalance(?:Before|After)?|authorization|api[_-]?key|RUNWAY_API_KEY|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(key), 'Private field in review data');
      inspect(item);
    }
  }
  inspect(value); return value;
}

async function checked(ref: DirectReturnRef) {
  assert.match(ref.sha256, /^[a-f0-9]{64}$/);
  assert.ok(ref.path.startsWith('runs/') && !/(?:^|\/)(?:state|submit-intent)\.json$/i.test(ref.path), 'Only selected review material is served');
  const bytes = await readFile(await safeFile(process.cwd(), ref.path));
  assert.equal(hash(bytes), ref.sha256, 'Selected review file hash changed: ' + ref.path);
  if (ref.path.endsWith('.json')) checkReviewJson(bytes);
  return bytes;
}

export default async function PamelaDirectReturnReviewPage() {
  let pointerBytes: Buffer;
  try { pointerBytes = await readFile(pointerPath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return pending(); throw error; }
  const pointer = checkReviewJson(pointerBytes);
  assert.equal(pointer.schemaVersion, 1); assert.equal(pointer.dealerId, 'pamela-pilot'); assert.equal(pointer.productionAccepted, false);
  let manifestBytes: Buffer;
  try { manifestBytes = await checked(pointer.manifest); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return pending(); throw error; }
  const review = checkReviewJson(manifestBytes) as DirectReturnReview;
  const refs = directReturnReviewRefs(review), urls = new Map<string, string>([[pointer.manifest.path, fileUrl(pointer.manifest.path)]]);
  for (const ref of refs) { await checked(ref); urls.set(ref.path, fileUrl(ref.path)); }

  const contractBytes = await readFile('references/pamela-motion-contract-v2.json');
  const contract = checkReviewJson(contractBytes);
  assert.equal(contract.dealerId, review.dealerId); assert.equal(contract.productionAccepted, false); assert.equal(contract.activeSelection, false);
  const identities = checkReviewJson(await readFile('references/dealers.json'));
  const dealer = identities.dealers.find((d: { id: string }) => d.id === review.dealerId); assert.ok(dealer);
  const code = await readFile('src/dealer-motion-contract.ts');
  const html = pamelaDirectReturnReviewSection(review, urls, { manifest: fileUrl(pointer.manifest.path), contract: '#retur-kontrakt', identity: '#retur-identitet', simulator: '#retur-kod', dealerLabel: dealer.label });
  const physical = checkReviewJson(await readFile('references/pamela-physical-deal-review.json')) as PhysicalDealReview;
  const physicalUrls = new Map<string,string>();
  for (const ref of physicalDealReviewRefs(physical)) { await checked(ref); physicalUrls.set(ref.path,fileUrl(ref.path)); }
  const physicalHtml = physicalDealReviewSection(physical,physicalUrls);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
    <style nonce={nonce}>{`.pamela-returer video{width:100%;max-height:70vh;background:#07100b}.pamela-returer .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}.pamela-returer article{min-width:0}.pamela-returer p,.pamela-returer li{line-height:1.6}.pamela-returer small,pre{overflow-wrap:anywhere;white-space:pre-wrap}.pamela-returer details{margin:20px 0}`}</style>
    <nav><a href="/studio">Studion</a> · <a href="/pamela-sidprov">P1:s kortsidor</a></nav>
    <div className="pamela-returer" dangerouslySetInnerHTML={{ __html: physicalHtml }} />
    <details><summary>Historiska returförsök · tidigare underkännanden</summary><div className="pamela-returer" dangerouslySetInnerHTML={{ __html: html }} /></details>
    <details id="retur-kontrakt"><summary>V2-kontrakt · SHA-256 {hash(contractBytes)}</summary><pre>{JSON.stringify(contract, null, 2)}</pre></details>
    <details id="retur-identitet"><summary>Pamela · Dealerlab: identitet och ankare</summary><pre>{JSON.stringify(dealer, null, 2)}</pre></details>
    <details id="retur-kod"><summary>Kontraktskod · SHA-256 {hash(code)}</summary><pre>{code.toString('utf8')}</pre></details>
  </main>;
}
