import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { actorRect, backdropRect, DEFAULT_BACKDROP, DEFAULT_PLACEMENT, previewPlacement, reviewMatches, seekTime } from '../src/material-preview/model.ts';
import { createLabServer } from '../src/server.ts';

test('portrait placement preserves Pamela proportions and offsets do not change scale', () => {
  const base = actorRect(916, 1717, DEFAULT_PLACEMENT);
  const moved = actorRect(916, 1717, { ...DEFAULT_PLACEMENT, x: 85, y: -30 });
  assert.equal(base[3], 1080);
  assert.ok(Math.abs(base[2] / base[3] - 916 / 1717) < 1e-12);
  assert.deepEqual(moved, [base[0] + 85, base[1] - 30, base[2], base[3]]);
  assert.throws(() => actorRect(0, 1717, DEFAULT_PLACEMENT));
});
test('time offset cannot seek outside the second clip', () => {
  assert.equal(seekTime(1, 5, -2), 0);
  assert.equal(seekTime(4.5, 5, 2), 5);
  assert.equal(seekTime(1, 5, .25), 1.25);
});
test('a tighter source does not enlarge the subject and unknown bytes inherit no fit', () => {
  const a={path:'a',name:'v3',video:false,sha256:'b13225f0b71cb6cd20d6a596c30b1502d9c0ed7ce2d0e6c8651bd3150ae1033e'};
  const b={path:'b',name:'v4',video:false,sha256:'4445634a5698da4121ad40bd7fcef76c8b8b8707c6fc24a87d095ad98348e5a7'};
  const ar=actorRect(916,1717,previewPlacement(a,true)),br=actorRect(1536,1024,previewPlacement(b,true));
  assert.ok(Math.abs(ar[1]+250*ar[3]/1717-(br[1]+213*br[3]/1024))<1e-8);
  assert.ok(Math.abs(ar[1]+752*ar[3]/1717-(br[1]+952*br[3]/1024))<1e-8);
  assert.deepEqual(previewPlacement({...b,sha256:'changed'},true),{...DEFAULT_PLACEMENT,key:true});
});
test('background panning never exposes a blank edge at minimum or enlarged zoom', () => {
  for (const zoom of [.5, 1, 1.8]) for (const x of [-3, 0, 3]) for (const y of [-3, 0, 3]) {
    const [left, top, width, height] = backdropRect(2560, 1440, { ...DEFAULT_BACKDROP, zoom, x, y });
    assert.ok(left <= 0 && top <= 0 && left + width >= 1920 && top + height >= 1080);
    assert.ok(Math.abs(width / height - 2560 / 1440) < 1e-12);
  }
});
test('an AI comparison becomes stale when one input disappears, changes hash or swaps side', () => {
  const a = { path: 'media/a.png', sha256: 'aaa' }, b = { path: 'media/b.png', sha256: 'bbb' };
  assert.equal(reviewMatches([a,b], [a,b]), true);
  assert.equal(reviewMatches([a,a], [a]), true);
  assert.equal(reviewMatches([a,a], [a,b]), false);
  assert.equal(reviewMatches([b,a], [a,b]), false);
  assert.equal(reviewMatches([a,{...b,sha256:'changed'}], [a,b]), false);
});
test('material page and image/PDF types preserve the private-file boundary', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dealerlab-material-test-'));
  await mkdir(path.join(root, 'media'));
  await mkdir(path.join(root, 'private'));
  await mkdir(path.join(root, 'builds'));
  await writeFile(path.join(root, 'builds/build-plan.json'), '{"status":"candidate"}');
  await writeFile(path.join(root, 'media/room.avif'), 'image-protocol-fixture');
  await writeFile(path.join(root, 'media/review.pdf'), '%PDF-protocol-fixture');
  await writeFile(path.join(root, 'private/review.pdf'), 'private');
  await writeFile(path.join(root, 'media/reference.mjs'), 'throw Error("Must not run");');
  const lab = createLabServer(root, { nextHandler: async (_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('next-page'); } });
  lab.server.listen(0, '127.0.0.1'); await once(lab.server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => { lab.server.close(() => resolve()); lab.server.closeAllConnections(); }); assert.ok(root.startsWith(path.join(os.tmpdir(), 'dealerlab-material-test-'))); await rm(root, { recursive: true, force: true }); });
  const address = lab.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(base + '/materialprov')).status, 200);
  assert.equal((await fetch(base + '/materialprov-extra')).status, 404);
  assert.equal((await fetch(base + '/files/builds/build-plan.json')).status, 200);
  assert.equal((await fetch(base + '/api/material-review', { method: 'POST', body: 'a=media/frame.png' })).status, 400);
  assert.equal((await fetch(base + '/files/media/room.avif')).headers.get('content-type'), 'image/avif');
  assert.equal((await fetch(base + '/files/media/review.pdf')).headers.get('content-type'), 'application/pdf');
  for (const file of ['private/review.pdf', 'media/reference.mjs', '../.env.local']) assert.equal((await fetch(base + '/files/' + file)).status, 404);
});
