import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { maintainPreviewFrames } from '../src/preview-cache.ts';
import { catalog } from '../src/library.ts';

const hash = 'a'.repeat(64);
async function fixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const base = os.tmpdir(), root = await mkdtemp(path.join(base, 'dealer-preview-cache-'));
  t.after(async () => {
    assert.equal(path.dirname(root), base);
    assert.ok(path.basename(root).startsWith('dealer-preview-cache-'));
    await rm(root, { recursive: true, force: true });
  });
  const relative = `media/preview-cache/${hash}`, folder = path.join(root, relative);
  for (const dir of [folder, path.join(root, 'references'), path.join(root, 'docs'), path.join(root, 'runs'), path.join(root, 'media/analysis')]) await mkdir(dir, { recursive: true });
  const frames = [];
  for (let frame = 0; frame < 5; frame++) {
    const bytes = Buffer.from(`owned-preview-${frame}`);
    await writeFile(path.join(folder, `frame-${frame}.png`), bytes);
    frames.push({ frame, sha256: createHash('sha256').update(bytes).digest('hex'), lastUsed: Date.now() - 7200000 + frame });
  }
  await writeFile(path.join(folder, 'index.json'), JSON.stringify({ schemaVersion: 1, sourceSha256: hash, frames }));
  await writeFile(path.join(root, 'media/original.mp4'), 'original');
  await writeFile(path.join(root, 'media/analysis/frame-0.png'), 'existing evidence');
  const policy = async (enabled: boolean, pins: string[] = []) => writeFile(path.join(root, 'references/media-retention.json'), JSON.stringify({ enabled, maxFramesPerSource: 2, minimumAgeMinutes: 60, pinnedFrames: pins }));
  return { root, folder, relative, policy };
}

test('dry run reports excess frames without deleting any bytes', async t => {
  const f = await fixture(t); await f.policy(false);
  const result = await maintainPreviewFrames(f.root, hash, 4);
  assert.equal(result.candidates.length, 3); assert.equal(result.deleted.length, 0);
  assert.equal((await readdir(f.folder)).filter(x => x.endsWith('.png')).length, 5);
});

test('active retention only removes verified old preview bytes', async t => {
  const f = await fixture(t); await f.policy(true);
  const result = await maintainPreviewFrames(f.root, hash, 4);
  assert.equal(result.deleted.length, 3);
  assert.deepEqual((await readdir(f.folder)).filter(x => x.endsWith('.png')).sort(), ['frame-3.png', 'frame-4.png']);
  assert.equal(await readFile(path.join(f.root, 'media/original.mp4'), 'utf8'), 'original');
  assert.equal(await readFile(path.join(f.root, 'media/analysis/frame-0.png'), 'utf8'), 'existing evidence');
  assert.ok((await catalog(f.root)).every(asset => !asset.path.includes('preview-cache') && !asset.path.includes('analysis')));
});

test('pins, cited evidence and modified bytes survive rotation', async t => {
  const f = await fixture(t); await f.policy(true, [`${f.relative}/frame-0.png`]);
  await writeFile(path.join(f.root, 'docs/report.md'), `[Bevis](${f.relative}/frame-1.png)`);
  await writeFile(path.join(f.folder, 'frame-2.png'), 'edited by user');
  assert.equal((await maintainPreviewFrames(f.root, hash, 4)).deleted.length, 0);
  assert.equal((await readdir(f.folder)).filter(x => x.endsWith('.png')).length, 5);
});

test('young previews and untracked files survive rotation', async t => {
  const f = await fixture(t); await f.policy(true);
  const index = JSON.parse(await readFile(path.join(f.folder, 'index.json'), 'utf8'));
  index.frames[0].lastUsed = Date.now() - 1000;
  await writeFile(path.join(f.folder, 'index.json'), JSON.stringify(index));
  await writeFile(path.join(f.folder, 'frame-99.png'), 'untracked');
  await maintainPreviewFrames(f.root, hash, 4);
  assert.equal(await readFile(path.join(f.folder, 'frame-0.png'), 'utf8'), 'owned-preview-0');
  assert.equal(await readFile(path.join(f.folder, 'frame-99.png'), 'utf8'), 'untracked');
});

test('invalid identities and linked cache manifests cannot target other files', async t => {
  const f = await fixture(t); await f.policy(true);
  await assert.rejects(maintainPreviewFrames(f.root, '../original.mp4', 4));
  await assert.rejects(maintainPreviewFrames(f.root, hash, -1));
  const outside = path.join(f.root, 'outside'); await mkdir(outside);
  await writeFile(path.join(outside, 'frame-4.png'), 'outside');
  const linkedHash = 'b'.repeat(64);
  await symlink(outside, path.join(f.root, 'media/preview-cache', linkedHash), 'junction');
  await assert.rejects(maintainPreviewFrames(f.root, linkedHash, 4));
  assert.equal(await readFile(path.join(outside, 'frame-4.png'), 'utf8'), 'outside');
});
