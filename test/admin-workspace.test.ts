import test from 'node:test';
import assert from 'node:assert/strict';
import { changeDraft, initialState, makeScene, nameConflict, parseState, saveVersion } from '../src/admin-prototype/model.ts';
import { addCompany, addMember, companiesFor, createPartnerTable, setCompanyScenes } from '../src/admin-prototype/workspace-model.ts';

test('automatic names follow dealer and room while saved versions retain their identity', () => {
  const scene = saveVersion(makeScene('auto', ''), 'v1', '2026-11-08T19:00:00Z', '');
  const changed = changeDraft(scene, { dealer: 'goran', room: 'midnight' });
  assert.equal(changed.draft.name, 'Göran / Midnight Studio');
  assert.equal(changed.versions[0].recipe.name, 'Pamela / Grand Lounge');
  assert.equal(changed.versions[0].recipe.dealer, 'pamela');
});

test('manual names are preserved and mismatched dealer names are flagged', () => {
  const manual = changeDraft(makeScene('s', ''), { name: 'Pamela kväll' });
  assert.equal(manual.draft.nameMode, 'custom');
  const switched = changeDraft(manual, { dealer: 'goran' });
  assert.equal(switched.draft.name, 'Pamela kväll');
  assert.equal(nameConflict(switched.draft), true);
  assert.equal(nameConflict(changeDraft(switched, { nameMode: 'automatic' }).draft), false);
  assert.equal(changeDraft(makeScene('neutral', 'Kvällsscen'), { dealer: 'goran' }).draft.name, 'Kvällsscen');
});

test('known old seed names are repaired on load without changing saved versions or custom names', () => {
  const state = initialState();
  state.scenes[0] = saveVersion(state.scenes[0], 'v1', '2026-11-08T19:00:00Z', '');
  delete state.scenes[0].draft.nameMode;
  state.scenes[0].draft.dealer = 'goran';
  const loaded = parseState(JSON.stringify(state));
  assert.equal(loaded.scenes[0].draft.name, 'Göran / Grand Lounge');
  assert.equal(loaded.scenes[0].versions[0].recipe.name, 'Pamela / Grand Lounge');
  state.scenes[0].draft.name = 'Mitt namn';
  assert.equal(parseState(JSON.stringify(state)).scenes[0].draft.name, 'Mitt namn');
});

test('companies retain their separate scene access, members and table assignments', () => {
  let state = initialState();
  state.scenes[0] = saveVersion(state.scenes[0], 'v1', '2026-11-08T19:00:00Z', '');
  state = addCompany(state, 'norden', 'Demo Norden');
  state = addCompany(state, 'syd', 'Demo Syd');
  assert.throws(() => addCompany(state, 'dup', ' demo norden '), /finns redan/);
  state = setCompanyScenes(state, 'norden', [state.scenes[0].id]);
  state = addMember(state, 'norden', 'm1', 'Testperson', 'editor');
  const assignment = { sceneId: state.scenes[0].id, versionId: 'v1' };
  assert.throws(() => createPartnerTable(state, 'syd', 'admin', 'table', 'Natt', assignment), /tillgång/);
  assert.throws(() => createPartnerTable(state, 'norden', 'viewer', 'table', 'Natt', assignment), /Läsar/);
  assert.throws(() => createPartnerTable(state, 'norden', 'editor', 'table', 'Natt', { ...assignment, versionId: 'draft' }), /sparad/);
  state = createPartnerTable(state, 'norden', 'editor', 'table', 'Natt', assignment);
  assert.equal(state.targets.at(-1)?.company, 'Demo Norden');
  assert.deepEqual(state.targets.at(-1)?.pending, assignment);
  assert.equal(state.targets.at(-1)?.active, undefined);
  assert.throws(() => createPartnerTable(state, 'norden', 'editor', 'dup', 'natt', assignment), /redan/);
  assert.equal(companiesFor(state).find(c => c.id === 'syd')?.members.length, 0);
  assert.deepEqual(parseState(JSON.stringify(state)), state);
});
