import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { createLabServer } from '../src/server.ts';
import { byteRange, outputDirectory, safeFile } from '../src/library.ts';
import { validateRemoteUrl } from '../src/media.ts';

test('remote imports only reach the verified provider hosts', () => {
  const store = 'store_2JzgrF9f6fNlHVTZ';
  assert.equal(validateRemoteUrl('https://2jzgrf9f6fnlhvtz.private.blob.vercel-storage.com/clip.mp4', 'blob', store).protocol, 'https:');
  for (const url of ['http://127.0.0.1/clip.mp4', 'https://other.private.blob.vercel-storage.com/clip.mp4', 'https://2jzgrf9f6fnlhvtz.private.blob.vercel-storage.com.attacker.test/clip.mp4', 'https://user:pass@2jzgrf9f6fnlhvtz.private.blob.vercel-storage.com/clip.mp4']) assert.throws(() => validateRemoteUrl(url, 'blob', store));
});

test('local lifecycle, private files and file-bound experiment/review', async t => {
  const temporaryBase = os.tmpdir();
  const root = await mkdtemp(path.join(temporaryBase, 'dealerlab-test-'));
  const source = Buffer.from('sample clip bytes for protocol tests');
  await mkdir(path.join(root, 'media/inbox'), { recursive: true });
  await writeFile(path.join(root, 'media/inbox/clip.mp4'), source);
  await writeFile(path.join(root, '.env'), 'SHOULD_NEVER_BE_SERVED=private');
  const lab = createLabServer(root, { shutdownToken: 'test-control' });
  lab.server.listen(0, '127.0.0.1');
  await once(lab.server, 'listening');
  const address = lab.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    lab.server.closeAllConnections();
    if (lab.server.listening) { lab.server.close(); await once(lab.server, 'close'); }
    assert.equal(path.dirname(root), temporaryBase);
    assert.ok(path.basename(root).startsWith('dealerlab-test-'));
    await rm(root, { recursive: true, force: true });
  });
  await t.test('health verifies identity and loopback', async () => {
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.root, root);
    assert.equal(health.instanceId, lab.instanceId);
    assert.equal(address.address, '127.0.0.1');
  });
  await t.test('private files, traversal and junctions are blocked', async () => {
    for (const url of ['/files/.env', '/files/.env.local', '/files/private/runway-assets.json', '/files/media/%2e%2e/.env', '/files/media/inbox/clip.mp4:secret']) assert.equal((await fetch(base + url)).status, 404);
    await assert.rejects(safeFile(root, 'media/../.env'));
    await symlink(root, path.join(root, 'media/redirect'), 'junction');
    await assert.rejects(safeFile(root, 'media/redirect/.env'));
    await mkdir(path.join(root, 'runs'));
    await symlink(path.join(root, 'media'), path.join(root, 'runs/redirect'), 'junction');
    await assert.rejects(outputDirectory(root, 'runs/redirect/new-folder'));
    assert.equal((await readdir(path.join(root, 'media'))).includes('new-folder'), false);
  });
  await t.test('origin validation prevents cross-site reads and writes', async () => {
    assert.equal((await fetch(base)).headers.get('referrer-policy'), 'same-origin');
    assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'null' } })).status, 403);
    const response = await fetch(base + '/api/health', { headers: { Origin: 'https://example.org' } });
    assert.equal(response.status, 403);
    const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base + '/api/health', { headers: { Host: 'attacker.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(hostStatus, 403);
  });
  await t.test('video seeking handles exact, suffix and unsatisfiable ranges', async () => {
    const response = await fetch(base + '/files/media/inbox/clip.mp4', { headers: { Range: 'bytes=0-5' } });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), source.subarray(0, 6).toString());
    const suffix = await fetch(base + '/files/media/inbox/clip.mp4', { headers: { Range: 'bytes=-3' } });
    assert.equal(await suffix.text(), source.subarray(-3).toString());
    assert.equal((await fetch(base + '/files/media/inbox/clip.mp4', { headers: { Range: 'bytes=900-1000' } })).status, 416);
    assert.throws(() => byteRange('bytes=-0', 20));
    assert.throws(() => byteRange('bytes=0-1,3-4', 20));
  });
  let runId = '';
  const home = await (await fetch(base)).text();
  const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(home)![1];
  await t.test('missing CSRF token cannot create experiments', async () => {
    const response = await fetch(base + '/experiments', { method: 'POST', body: new URLSearchParams({ title: 'No token', source: 'media/inbox/clip.mp4' }) });
    assert.equal(response.status, 400);
  });
  await t.test('a local plan preserves source bytes and records SHA-256', async () => {
    const response = await fetch(base + '/experiments', { method: 'POST', headers: { Origin: base }, redirect: 'manual', body: new URLSearchParams({ csrf, title: 'Test plan', source: 'media/inbox/clip.mp4', note: 'One change at a time' }) });
    assert.equal(response.status, 303);
    runId = new URL(response.headers.get('location')!, base).searchParams.get('run')!;
    const job = JSON.parse(await readFile(path.join(root, 'runs', runId, 'job.json'), 'utf8'));
    assert.equal(job.generation.submitted, false);
    assert.equal(job.source.sha256, createHash('sha256').update(source).digest('hex'));
    assert.deepEqual(await readFile(path.join(root, 'media/inbox/clip.mp4')), source);
    assert.ok(job.source.probeError, 'invalid fixture media must be marked unverified');
  });
  await t.test('review is append-only and identifies exact measured file', async () => {
    const response = await fetch(base + '/reviews', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ csrf, runId, asset: 'media/inbox/clip.mp4', decision: 'unreviewed', note: 'Protocol fixture only' }) });
    assert.equal(response.status, 303);
    const directory = path.join(root, 'runs', runId, 'qa');
    const reviews = await readdir(directory);
    assert.equal(reviews.length, 1);
    const review = JSON.parse(await readFile(path.join(directory, reviews[0]), 'utf8'));
    assert.equal(review.asset.sha256, createHash('sha256').update(source).digest('hex'));
  });
  await t.test('shutdown requires control token and releases listener', async () => {
    assert.equal((await fetch(base + '/api/shutdown', { method: 'POST' })).status, 403);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    const closed = once(lab.server, 'close');
    assert.equal((await fetch(base + '/api/shutdown', { method: 'POST', headers: { 'X-Dealer-Control': 'test-control' } })).status, 200);
    await closed;
    assert.equal(lab.server.listening, false);
  });
});
