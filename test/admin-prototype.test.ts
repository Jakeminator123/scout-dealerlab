import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLabServer } from '../src/server.ts';
import { activatePending, changeDraft, initialState, makeScene, parseState, placementFor, recipeDifferences, restorePreservingDraft, restoreVersion, saveVersion, stageVersion } from '../src/admin-prototype/model.ts';

test('a free scene needs no company or operational table', () => {
  const scene = makeScene('new-scene', '  Min scen  ');
  assert.equal(scene.draft.name, 'Min scen');
  assert.deepEqual(scene.versions, []);
  assert.equal('companyId' in scene, false);
  assert.equal('tableId' in scene, false);
});

test('saved recipes and check results remain immutable when a draft changes', () => {
  const scene = makeScene('new-scene', 'Min scen');
  scene.checks = { framing: 'pass', contrast: 'pass' };
  const saved = saveVersion(scene, 'v1', '2026-11-08T20:00:00Z', 'Första');
  const changed = changeDraft(saved, { felt: 'burgundy', name: 'Min nya scen' });
  assert.deepEqual(changed.checks, {});
  assert.equal(changed.versions[0].recipe.felt, 'emerald');
  assert.equal(changed.versions[0].recipe.name, 'Min scen');
  assert.deepEqual(changed.versions[0].checks, { framing: 'pass', contrast: 'pass' });
  const second = saveVersion(changed, 'v2', '2026-11-08T20:01:00Z', 'Andra');
  assert.deepEqual(second.versions.map(v => v.number), [1, 2]);
  const restored = restoreVersion(second, 'v1');
  assert.equal(restored.draft.felt, 'emerald');
  assert.equal(restored.versions.length, 2);
  assert.deepEqual(restored.checks, {});
  assert.notEqual(restored.draft, restored.versions[0].recipe);
});

test('unmodified edits preserve manual checks and blank names cannot be versioned', () => {
  const scene = makeScene('new-scene', 'Min scen');
  scene.checks.framing = 'pass';
  assert.equal(changeDraft(scene, { name: 'Min scen' }), scene);
  assert.throws(() => saveVersion(changeDraft(scene, { name: ' ' }), 'v1', '2026-11-08T20:00:00Z', ''), /namn/);
});

test('restoring a version first preserves an edited draft, even with a blank name', () => {
  const scene = saveVersion(makeScene('s', 'Min scen'), 'v1', '2026-11-08T20:00:00Z', 'Första');
  const edited = changeDraft(scene, { name: '', felt: 'none' });
  const restored = restorePreservingDraft(edited, 'v1', 'backup-v2', '2026-11-08T20:01:00Z');
  assert.equal(restored.versions.length, 2);
  assert.equal(restored.versions[1].recipe.felt, 'none');
  assert.equal(restored.versions[1].recipe.name, 'Namnlöst utkast');
  assert.equal(restored.draft.felt, 'emerald');
  assert.equal(restored.draft.name, 'Min scen');
  assert.equal(edited.versions.length, 1);
  const checked = { ...scene, checks: { framing: 'pass' as const } };
  assert.deepEqual(restorePreservingDraft(checked, 'v1', 'checked-backup', '2026-11-08T20:01:00Z').versions[1].checks, { framing: 'pass' });
});

test('publication pins a saved version and activates only the selected target', () => {
  let state = initialState();
  state.scenes[0] = saveVersion(state.scenes[0], 'saved-v1', '2026-11-08T20:00:00Z', '');
  state = stageVersion(state, state.scenes[0].id, 'saved-v1', ['demo-1', 'demo-2']);
  assert.equal(state.targets[0].active, undefined);
  assert.equal(state.targets[1].active, undefined);
  state.scenes[0] = changeDraft(state.scenes[0], { felt: 'none' });
  assert.equal(state.targets[0].pending?.versionId, 'saved-v1');
  const activated = activatePending(state, 'demo-1');
  assert.equal(activated.targets[0].active?.versionId, 'saved-v1');
  assert.equal(activated.targets[0].pending, undefined);
  assert.equal(activated.targets[1].active, undefined);
  assert.equal(activated.targets[1].pending?.versionId, 'saved-v1');
  assert.equal(state.targets[0].active, undefined);
  assert.throws(() => stageVersion(state, state.scenes[0].id, 'draft', ['demo-1']), /sparad/);
  assert.throws(() => stageVersion(state, state.scenes[0].id, 'saved-v1', []), /exempelbord/);
  assert.throws(() => stageVersion(state, state.scenes[0].id, 'saved-v1', ['production']), /exempelbord/);
});

test('material placements are deeply snapshotted and dealer changes reset their identity', () => {
  let scene = makeScene('materials', 'Min scen');
  scene = changeDraft(scene, { placement: { ...placementFor(scene.draft), foreground: placementFor(scene.draft).background, x: 120, zoom: 75 } });
  scene = saveVersion(scene, 'material-v1', '2026-11-08T20:00:00Z', 'Placering');
  scene.draft.placement!.x = 400;
  assert.equal(scene.versions[0].recipe.placement?.x, 120);
  assert.deepEqual(recipeDifferences(scene.versions[0].recipe, scene.draft), ['placement']);
  const restored = restoreVersion(scene, 'material-v1');
  assert.deepEqual(recipeDifferences(restored.versions[0].recipe, restored.draft), []);
  assert.equal(changeDraft(restored, { dealer: 'goran' }).draft.placement, undefined);
  const state = initialState();
  state.scenes[0] = { ...scene, id: state.selectedId };
  assert.equal(parseState(JSON.stringify(state)).scenes[0].draft.placement?.zoom, 75);
  state.scenes[0].draft.placement!.zoom = 0;
  assert.throws(() => parseState(JSON.stringify(state)));
});

test('local state roundtrips, incompatible and dangling data are rejected', () => {
  const state = initialState();
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  assert.throws(() => parseState('{'));
  assert.throws(() => parseState(JSON.stringify({ ...state, schema: 2 })));
  assert.throws(() => parseState(JSON.stringify({ ...state, selectedId: 'missing' })));
  assert.throws(() => parseState(JSON.stringify({ ...state, scenes: [{ ...state.scenes[0], draft: null }] })));
  state.targets[0].active = { sceneId: state.scenes[0].id, versionId: 'missing' };
  assert.throws(() => parseState(JSON.stringify(state)));
});

test('the new exact Next route works without widening private-file access', async t => {
  const lab = createLabServer(process.cwd(), { nextHandler: async (_req, res) => { res.end('prototype route'); } });
  lab.server.listen(0, '127.0.0.1');
  await once(lab.server, 'listening');
  t.after(async () => { lab.server.closeAllConnections(); const closed = once(lab.server, 'close'); lab.server.close(); await closed; });
  const address = lab.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const page = await fetch(base + '/admin-prototyp');
  assert.equal(page.status, 200);
  assert.equal(await page.text(), 'prototype route');
  assert.ok(page.headers.get('content-security-policy')?.includes("default-src 'none'"));
  for (const url of ['/admin-prototyp/private', '/.env.local', '/private', '/files/.env.local', '/files/private/credentials.json']) {
    assert.equal((await fetch(base + url)).status, 404, url);
  }
  assert.equal((await fetch(base + '/admin-prototyp', { headers: { Origin: 'https://example.org' } })).status, 403);
});
