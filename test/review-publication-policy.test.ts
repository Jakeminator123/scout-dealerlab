import test from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { privateReviewJsonField, privateReviewPath, publicReviewSource, purgePrivateReviewCopies, reviewHashMatches, reviewReferences } from '../scripts/review-publication-policy.ts';

const shaA = 'a'.repeat(64), shaB = 'b'.repeat(64);

test('private operational filenames are blocked in source and inherited export paths', () => {
  for (const name of ['state.json', 'state-v2.json', 'submit-intent.json', 'submit_intent-02.json', 'budget.json', 'budget-epoch.json', 'budget-epoch.json.gz']) {
    assert.equal(publicReviewSource('runs/pilot/jobs/' + name), false, name);
    assert.equal(privateReviewPath('granskning/kallor/runs/pilot/jobs/' + name), true, name);
  }
  for (const name of ['.env.local', 'private/task.json', 'wallet.json']) assert.equal(privateReviewPath(name), true);
  for (const name of ['runs/pilot/plan.json', 'runs/pilot/evidence.json', 'references/pamela-table-review.json']) assert.equal(publicReviewSource(name), true, name);
  assert.equal(publicReviewSource('runs/../private.json'), false);
});

test('nested private field names are rejected without rejecting review cost or task provenance', () => {
  for (const key of ['openingBalance', 'creditBalance', 'available_balance', 'saldo', 'wallet', 'credentialSource', 'submitIntent', 'remainingCredits']) {
    assert.equal(privateReviewJsonField(JSON.stringify({ generated: [{ [key]: 'not-a-real-secret' }] })), key);
  }
  assert.equal(privateReviewJsonField(JSON.stringify({ taskId: 'review-task', costCredits: 60, model: 'wan3', boardState: { cards: [] }, jobPlanSha256: shaA })), undefined);
  assert.equal(privateReviewJsonField('plain text, not JSON'), undefined);
});

test('explicit reference hashes survive plain path strings and nested reference traversal', () => {
  const source = 'runs/pilot/evidence.json';
  const refs = reviewReferences({ before: source, selected: { path: source, sha256: shaA }, after: [source], child: { path: 'references/a.json', sha256: shaB } });
  assert.deepEqual(refs, [{ path: source, sha256: shaA }, { path: 'references/a.json', sha256: shaB }]);
  assert.deepEqual(reviewReferences([{ path: source, sha256: shaA }, { path: source, sha256: shaB }]), [{ path: source, sha256: shaA }, { path: source, sha256: shaB }]);
  assert.deepEqual(reviewReferences({ privateRef: 'runs/pilot/state.json' }), [{ path: 'runs/pilot/state.json' }]);
  for (const extension of ['svg', 'css', 'js']) assert.deepEqual(reviewReferences({ path: `runs/pilot/asset.${extension}`, sha256: shaA }), [{ path: `runs/pilot/asset.${extension}`, sha256: shaA }]);
});

test('historical hash mismatches are omittable but required inputs fail closed', () => {
  assert.equal(reviewHashMatches(shaA, shaA, true, 'selected'), true);
  assert.equal(reviewHashMatches(shaA, shaB, false, 'historical'), false);
  assert.equal(reviewHashMatches(shaA, 'invalid', false, 'historical'), false);
  assert.throws(() => reviewHashMatches(shaA, shaB, true, 'selected'), /Changed selected input selected/);
  assert.throws(() => reviewHashMatches(shaA, 'invalid', true, 'selected'), /Changed selected input/);
});

test('clone and refresh cleanup remove only private copies, preserving baseline, original and cost evidence', async t => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'dealer-review-policy-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(workspace)), path.resolve(os.tmpdir())); assert.ok(path.basename(workspace).startsWith('dealer-review-policy-')); await rm(workspace, { recursive: true, force: true }); });
  const owned = 'exports/review-new', baseline = 'exports/review-baseline';
  const staticRoot = path.join(workspace, owned, '.vercel/output/static');
  const baselineFile = path.join(workspace, baseline, '.vercel/output/static/budget-epoch.json');
  const original = path.join(workspace, 'runs/pilot/budget-epoch.json');
  async function put(file: string, body: string) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, body); }
  const privateBody = JSON.stringify({ openingBalance: 123 });
  await put(original, privateBody); await put(baselineFile, privateBody);
  const hardlinkCopy = path.join(staticRoot, 'granskning/kallor/runs/pilot/budget-epoch.json');
  await mkdir(path.dirname(hardlinkCopy), { recursive: true }); await link(original, hardlinkCopy);
  await put(path.join(staticRoot, 'files/runs/pilot/state.json'), '{}');
  await put(path.join(staticRoot, 'files/runs/pilot/submit-intent.json'), '{}');
  await put(path.join(staticRoot, 'review.json'), JSON.stringify({ nested: { creditBalance: 456 } }));
  const publicEvidence = path.join(staticRoot, 'public-evidence.json');
  const publicBody = JSON.stringify({ taskId: 'review-task', costCredits: 60 }); await put(publicEvidence, publicBody);
  const removed = await purgePrivateReviewCopies(workspace, owned, baseline);
  assert.equal(removed.length, 4);
  await assert.rejects(stat(hardlinkCopy), { code: 'ENOENT' });
  assert.equal(await readFile(original, 'utf8'), privateBody);
  assert.equal(await readFile(baselineFile, 'utf8'), privateBody);
  assert.equal(await readFile(publicEvidence, 'utf8'), publicBody);
  assert.deepEqual(await purgePrivateReviewCopies(workspace, owned, baseline), []);
  await assert.rejects(purgePrivateReviewCopies(workspace, baseline, baseline), /Never clean the baseline/);
  await assert.rejects(purgePrivateReviewCopies(workspace, 'runs/pilot', baseline), /one owned export/);
});
