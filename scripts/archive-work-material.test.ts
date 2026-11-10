import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, symlink, readdir, utimes, rename, rmdir, link } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArchiver, validatePlan, validateRelativeFile, PRODUCTION_ROOTS, type ArchivePlan } from './archive-work-material.ts';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const tempParent = path.resolve(os.tmpdir()), root = await mkdtemp(path.join(tempParent, 'dealerlab-archive-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), tempParent);
    assert(path.basename(root).startsWith('dealerlab-archive-test-'));
    await rm(root, { recursive: true, force: true });
  });
  const roots = { sourceRoot: path.join(root, 'source'), archiveRoot: path.join(root, 'archive') };
  await mkdir(path.join(roots.sourceRoot, 'runs', 'sample'), { recursive: true });
  await mkdir(path.join(roots.sourceRoot, 'exports'), { recursive: true });
  const files = [{ path: 'runs/sample/a.bin', reason: 'reproducible intermediate' }, { path: 'exports/b.bin', reason: 'superseded export' }];
  await writeFile(path.join(roots.sourceRoot, files[0].path), 'alpha');
  await writeFile(path.join(roots.sourceRoot, files[1].path), 'bravo!');
  const plan: ArchivePlan = { schemaVersion: 1, project: 'snyggare-dealer', ...roots, batchId: 'batch-01', files };
  const planPath = path.join(roots.sourceRoot, 'plan.json');
  await writeFile(planPath, JSON.stringify(plan));
  const archive = createArchiver(roots), batch = path.join(roots.archiveRoot, plan.batchId), manifestPath = path.join(batch, 'manifest.json');
  const source = (relative: string) => path.join(roots.sourceRoot, relative);
  const archived = (relative: string) => path.join(batch, 'files', relative);
  return { root, roots, plan, planPath, archive, batch, manifestPath, source, archived };
}
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const absent = async (file: string) => assert.rejects(stat(file), { code: 'ENOENT' });

test('relative path, private/environment and exact production-root guards', () => {
  for (const value of ['../runs/a', 'runs/../a', '/runs/a', 'runs\\a', 'exports//a', 'runs/.env', 'runs/.ENV.local', 'runs/private/a', 'exports/PRIVATE/a', 'runs/a:stream', 'runs/a.', 'runs/CON.txt', 'runs/a/../../x', 'media/original.mp4']) assert.throws(() => validateRelativeFile(value));
  validateRelativeFile('runs/correct/subfolder/åäö.png');
  const plan = { schemaVersion: 1, project: 'snyggare-dealer', ...PRODUCTION_ROOTS, batchId: 'test', files: [{ path: 'runs/a', reason: 'test' }] };
  if (process.platform === 'win32') {
    validatePlan(plan);
    assert.throws(() => validatePlan({ ...plan, sourceRoot: 'C:/Users/jakem/dev/scoutgaming' }), /Unexpected sourceRoot/);
    assert.throws(() => validatePlan({ ...plan, archiveRoot: 'D:/other' }), /Unexpected archiveRoot/);
    assert.throws(() => validatePlan({ ...plan, files: [...plan.files, { path: 'runs/A', reason: 'alias' }] }), /Duplicate/);
  }
});

test('copy seals full manifest before separate prune; selective and repeated restore preserve D copies', async t => {
  const f = await fixture(t), receipt = await f.archive.copy(f.planPath);
  assert.equal(receipt.logicalBytes, 11);
  const manifest = await json(f.manifestPath);
  assert.equal(manifest.copyStatus, 'complete'); assert.equal(manifest.files.length, 2);
  assert(manifest.files.every((file: { sha256: string; copyStatus: string }) => /^[a-f0-9]{64}$/.test(file.sha256) && file.copyStatus === 'verified'));
  assert.equal(await readFile(f.source(f.plan.files[0].path), 'utf8'), 'alpha');
  const pruned = await f.archive.prune(f.manifestPath);
  assert.equal(pruned.deleted, 2); assert.equal(pruned.deletedBytes, 11);
  for (const file of f.plan.files) { await absent(f.source(file.path)); await stat(f.archived(file.path)); }
  const again = await f.archive.prune(f.manifestPath);
  assert.equal(again.deletedBytes, 0); assert.equal(again.alreadyAbsent, 2);
  const restored = await f.archive.restore(f.manifestPath, f.plan.files[0].path);
  assert.equal(restored.restored, 1); await absent(f.source(f.plan.files[1].path));
  const remainder = await f.archive.restore(f.manifestPath);
  assert.equal(remainder.alreadyPresent, 1); assert.equal(remainder.restored, 1);
  for (const file of f.plan.files) assert.deepEqual(await readFile(f.source(file.path)), await readFile(f.archived(file.path)));
  const status = await json(path.join(f.batch, 'status.json'));
  assert.equal(status.copy.state, 'complete'); assert.equal(status.restore.state, 'complete');
  assert.equal((await readdir(f.batch)).includes('.operation.lock'), false);
});

test('changed source anywhere prevents all prune deletions, including equal-size modification', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath);
  const file = f.source(f.plan.files[1].path), before = await stat(file);
  await writeFile(file, 'BROKEN'); await utimes(file, before.atime, before.mtime);
  await assert.rejects(f.archive.prune(f.manifestPath), /changed|does not match/);
  assert.equal(await readFile(f.source(f.plan.files[0].path), 'utf8'), 'alpha');
  assert.equal(await readFile(file, 'utf8'), 'BROKEN');
  const status = await json(path.join(f.batch, 'status.json'));
  assert.equal(status.prune.state, 'failed'); assert.equal(status.prune.deleted, 0);
});

test('Windows hardlinked source paths both copy/prune/restore while an unplanned hardlink survives', async t => {
  const f = await fixture(t), first = f.source(f.plan.files[0].path), second = f.source(f.plan.files[1].path);
  await rm(second); await link(first, second);
  const unplanned = path.join(f.root, 'unplanned-hardlink.bin'); await link(first, unplanned);
  assert.equal((await stat(first, { bigint: true })).ino, (await stat(second, { bigint: true })).ino);
  const copied = await f.archive.copy(f.planPath);
  assert.equal(copied.logicalBytes, 10);
  const pruned = await f.archive.prune(f.manifestPath);
  assert.equal(pruned.deleted, 2); assert.equal(pruned.deletedBytes, 10);
  await absent(first); await absent(second);
  assert.equal(await readFile(unplanned, 'utf8'), 'alpha');
  const restored = await f.archive.restore(f.manifestPath);
  assert.equal(restored.restored, 2); assert.equal(restored.restoredBytes, 10);
  assert.equal(await readFile(first, 'utf8'), 'alpha'); assert.equal(await readFile(second, 'utf8'), 'alpha');
  for (const file of f.plan.files) assert.equal(await readFile(f.archived(file.path), 'utf8'), 'alpha');
});

test('changed archive anywhere prevents all prune deletions', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath);
  await writeFile(f.archived(f.plan.files[1].path), 'BROKEN');
  await assert.rejects(f.archive.prune(f.manifestPath), /Archive does not match/);
  for (const file of f.plan.files) await stat(f.source(file.path));
  assert.equal((await json(path.join(f.batch, 'status.json'))).prune.deleted, 0);
});

test('source mutation during copying fails the batch without a completed manifest or deletion', async t => {
  const f = await fixture(t); let mutated = false;
  const archive = createArchiver(f.roots, { afterCopyForTest: async source => {
    if (!mutated) { mutated = true; const before = await stat(source); await writeFile(source, 'ALPHA'); await utimes(source, before.atime, before.mtime); }
  } });
  await assert.rejects(archive.copy(f.planPath), /changed|verification failed/);
  await absent(f.manifestPath);
  assert.equal((await json(path.join(f.batch, 'status.json'))).copy.state, 'failed');
  for (const file of f.plan.files) await stat(f.source(file.path));
});

test('restore refuses differing existing files before creating any other source', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath); await f.archive.prune(f.manifestPath);
  await writeFile(f.source(f.plan.files[1].path), 'new user work');
  await assert.rejects(f.archive.restore(f.manifestPath), /refusing overwrite/);
  await absent(f.source(f.plan.files[0].path));
  assert.equal(await readFile(f.source(f.plan.files[1].path), 'utf8'), 'new user work');
  for (const file of f.plan.files) await stat(f.archived(file.path));
});

test('corrupt archive prevents restoration before any source is created', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath); await f.archive.prune(f.manifestPath);
  await writeFile(f.archived(f.plan.files[1].path), 'corrupt');
  await assert.rejects(f.archive.restore(f.manifestPath), /Archive does not match/);
  for (const file of f.plan.files) await absent(f.source(file.path));
});

test('junction/symlink in a source parent is rejected without copying the referenced file', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside');
  await mkdir(outside); await writeFile(path.join(outside, 'secret.bin'), 'outside');
  await symlink(outside, f.source('runs/redirect'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(f.planPath, JSON.stringify({ ...f.plan, files: [{ path: 'runs/redirect/secret.bin', reason: 'must fail' }] }));
  await assert.rejects(f.archive.copy(f.planPath), /Symlink\/junction|Redirected/);
  await absent(f.manifestPath); assert.equal(await readFile(path.join(outside, 'secret.bin'), 'utf8'), 'outside');
});

test('junction/symlink archive root is rejected', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside'); await mkdir(outside);
  await symlink(outside, f.roots.archiveRoot, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.archive.copy(f.planPath), /Symlink\/junction|Redirected/);
  assert.deepEqual(await readdir(outside), []);
});

test('archive junction introduced after copying prevents source deletion', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath);
  const directory = path.join(f.batch, 'files', 'runs'), moved = path.join(f.root, 'moved-archive-runs');
  await rename(directory, moved);
  await symlink(moved, directory, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.archive.prune(f.manifestPath), /Symlink\/junction|Redirected/);
  for (const file of f.plan.files) await stat(f.source(file.path));
});

test('restore rejects a new junction in source parents without writing through it', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath); await f.archive.prune(f.manifestPath);
  const outside = path.join(f.root, 'outside'); await mkdir(outside);
  await rmdir(f.source('runs/sample'));
  await symlink(outside, f.source('runs/sample'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.archive.restore(f.manifestPath), /Symlink\/junction|Redirected/);
  assert.deepEqual(await readdir(outside), []);
});

test('restore publication cannot overwrite a file created after preflight; owned temporary file is removed', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath); await f.archive.prune(f.manifestPath);
  const archive = createArchiver(f.roots, { afterCopyForTest: async (_source, destination) => {
    if (path.basename(destination).startsWith('.archive-restore-')) await writeFile(f.source(f.plan.files[0].path), 'new work during restore');
  } });
  await assert.rejects(archive.restore(f.manifestPath, f.plan.files[0].path), { code: 'EEXIST' });
  assert.equal(await readFile(f.source(f.plan.files[0].path), 'utf8'), 'new work during restore');
  assert.deepEqual(await readdir(f.source('runs/sample')), ['a.bin']);
  assert.equal(await readFile(f.archived(f.plan.files[0].path), 'utf8'), 'alpha');
});

test('independent receiver hash check catches a destination modified during copy', async t => {
  const f = await fixture(t);
  const archive = createArchiver(f.roots, { afterCopyForTest: async (_source, destination) => { await writeFile(destination, 'wrong'); } });
  await assert.rejects(archive.copy(f.planPath), /Copy SHA256 verification failed/);
  await absent(f.manifestPath);
  for (const file of f.plan.files) await stat(f.source(file.path));
});

test('prune rechecks fingerprints after whole-batch hashing and before the first unlink', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath);
  const archive = createArchiver(f.roots, { onProgress: progress => {
    if (progress.operation === 'prune-preflight' && progress.processed === progress.totalFiles) writeFileSync(f.archived(f.plan.files[0].path), 'RACED');
  } });
  await assert.rejects(archive.prune(f.manifestPath), /File changed/);
  for (const file of f.plan.files) await stat(f.source(file.path));
  assert.equal((await json(path.join(f.batch, 'status.json'))).prune.deleted, 0);
});

test('changed mtime is refused even with identical source content', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath);
  const source = f.source(f.plan.files[1].path); await utimes(source, new Date(), new Date(Date.now() + 5000));
  await assert.rejects(f.archive.prune(f.manifestPath), /File changed/);
  for (const file of f.plan.files) await stat(f.source(file.path));
});

test('tampered manifest path and batch reuse are refused', async t => {
  const f = await fixture(t); await f.archive.copy(f.planPath);
  await assert.rejects(f.archive.copy(f.planPath), { code: 'EEXIST' });
  const manifest = await json(f.manifestPath); manifest.files[0].path = 'runs/../outside';
  await writeFile(f.manifestPath, JSON.stringify(manifest));
  await assert.rejects(f.archive.prune(f.manifestPath), /unsafe relative file path/i);
  for (const file of f.plan.files) await stat(f.source(file.path));
});
