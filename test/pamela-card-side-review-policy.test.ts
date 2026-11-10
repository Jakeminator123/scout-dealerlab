import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sourceUrl = new URL('../src/pamela-card-side-review-client.tsx', import.meta.url);
const sourceRequire = createRequire(sourceUrl), swc = sourceRequire('next/dist/build/swc');
await swc.loadBindings();
const compiled = swc.transformSync(await readFile(sourceUrl, 'utf8'), {
  filename: sourceUrl.pathname, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
}).code;
type Input = { authoredSide: 'FRONT' | 'BACK' | 'EDGE'; diagnostic: boolean; concealUnverifiedTurn: boolean; revealAllowed: boolean; signal?: { frontAllowed: boolean; cardId: string | null } };
function load(search?: string) {
  const module = { exports: {} as { reviewFrontAllowed(input: Input): boolean; default: (props: any) => any } };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: sourceRequire, URLSearchParams, ...(search === undefined ? {} : { window: { location: { search } } }) }, { filename: sourceUrl.pathname });
  return module.exports;
}
const { reviewFrontAllowed } = load();
const signal = { frontAllowed: true, cardId: 'AC' };
const input: Input = { authoredSide: 'FRONT', diagnostic: false, concealUnverifiedTurn: true, revealAllowed: true, signal };
const manifest = JSON.parse(await readFile(new URL('../runs/20261110-pamela-card-side-review/take-01/manifest.json', import.meta.url), 'utf8'));

test('the protected view cannot reveal values through an authored front or demo-reveal', () => {
  for (const authoredSide of ['FRONT', 'BACK', 'EDGE'] as const) for (const revealAllowed of [false, true]) {
    assert.equal(reviewFrontAllowed({ ...input, authoredSide, revealAllowed }), false);
  }
  assert.equal(reviewFrontAllowed({ ...input, diagnostic: true }), true, 'blue authored diagnostic stays separate');
  assert.equal(reviewFrontAllowed({ ...input, diagnostic: true, revealAllowed: false }), true);
  assert.equal(reviewFrontAllowed({ ...input, diagnostic: true, authoredSide: 'BACK' }), false);
});

test('explicit historical mode still requires demo-reveal, a permitted identity and FRONT', () => {
  const historical = { ...input, concealUnverifiedTurn: false };
  assert.equal(reviewFrontAllowed(historical), true);
  assert.equal(reviewFrontAllowed({ ...historical, revealAllowed: false }), false);
  assert.equal(reviewFrontAllowed({ ...historical, signal: { ...signal, frontAllowed: false } }), false);
  assert.equal(reviewFrontAllowed({ ...historical, signal: { ...signal, cardId: null } }), false);
  assert.equal(reviewFrontAllowed({ ...historical, signal: undefined }), false);
  assert.equal(reviewFrontAllowed({ ...historical, authoredSide: 'EDGE' }), false);
});

test('all 720 selected source frames conceal both moving and already landed cards', () => {
  let frames = 0, cards = 0;
  for (const clip of manifest.clips) for (const frame of clip.frames) {
    frames++;
    for (const card of frame.cards) {
      cards++;
      assert.equal(card.observedPhysicalSide, 'UNKNOWN');
      const selectedSignal = manifest.engineFixture.cards.find((s: { slotId: string }) => s.slotId === card.slotId);
      assert.equal(reviewFrontAllowed({ ...input, authoredSide: card.authoredDisplaySide, signal: selectedSignal }), false, `${clip.id}:${frame.frame}:${card.slotId}`);
    }
  }
  assert.equal(frames, 720); assert.ok(cards > 720);
});

test('both local and static entry defaults are protected; only explicit historical mode opts out', () => {
  const props = { manifest, manifestRef: { path: 'runs/review/manifest.json', sha256: 'a'.repeat(64) }, code: [] };
  for (const search of [undefined, '', '?mode=conceal-unverified', '?mode=unknown']) {
    const html = renderToStaticMarkup(createElement(load(search).default, props));
    assert.match(html, /conceal-unverified-turn/); assert.match(html, /Valörer dolda/);
    assert.doesNotMatch(html, /authored-material-demo/);
  }
  const historical = renderToStaticMarkup(createElement(load('?mode=authored-demo').default, props));
  assert.match(historical, /authored-material-demo/);
  assert.match(historical, /Författat materialprov/);
});
