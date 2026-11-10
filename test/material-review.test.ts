import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reviewMaterial } from '../src/material-review.ts';

test('review uploads only selected images, reuses hash-bound results and protects private files', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dealer-review-test-'));
  t.after(async () => { assert.ok(root.startsWith(path.join(os.tmpdir(), 'dealer-review-test-'))); await rm(root, { recursive: true, force: true }); });
  await mkdir(path.join(root, 'media'));
  await writeFile(path.join(root, '.env.local'), 'OPENAI_API_KEY=unit-test-placeholder');
  await writeFile(path.join(root, 'media/frame.png'), Buffer.from([137,80,78,71,13,10,26,10,1]));
  let calls = 0;
  const request = (async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.input[0].content.filter((c: { type: string }) => c.type === 'input_image').length, 1);
    assert.ok(!JSON.stringify(body).includes('unit-test-placeholder'));
    return new Response(JSON.stringify({ id: 'resp-fixture', status: 'completed', output: [{ content: [{ type: 'output_text', text: 'Rörelse kan inte godkännas från en stillbild.' }] }] }), { status: 200 });
  }) as typeof fetch;
  const result = await reviewMaterial(root, ['media/frame.png', 'media/frame.png'], request);
  assert.equal(result.decision, 'advisory-only');
  assert.equal(result.inputs.length, 1);
  assert.deepEqual(await reviewMaterial(root, ['media/frame.png'], request), result);
  assert.equal(calls, 1);
  assert.ok(!(await readFile(path.join(root, result.reportPath), 'utf8')).includes('unit-test-placeholder'));
  await assert.rejects(reviewMaterial(root, ['private/secret.png'], request), /Otillåten/);
  await assert.rejects(reviewMaterial(root, ['media/film.mp4'], request), /stillbilder/);
  await writeFile(path.join(root, 'media/fake.png'), 'not an image');
  await assert.rejects(reviewMaterial(root, ['media/fake.png'], request), /innehåll/);
  assert.equal(calls, 1);
});
test('uncertain API outcomes are not automatically retried or approved', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dealer-review-test-'));
  t.after(async () => { assert.ok(root.startsWith(path.join(os.tmpdir(), 'dealer-review-test-'))); await rm(root, { recursive: true, force: true }); });
  await mkdir(path.join(root, 'media'));
  await writeFile(path.join(root, '.env.local'), 'OPENAI_API_KEY=unit-test-placeholder');
  await writeFile(path.join(root, 'media/frame.jpg'), Buffer.from([255,216,255,1]));
  let calls = 0;
  const request = (async () => { calls++; throw new Error('transport'); }) as typeof fetch;
  await assert.rejects(reviewMaterial(root, ['media/frame.jpg'], request), /inget säkert svar/);
  await assert.rejects(reviewMaterial(root, ['media/frame.jpg'], request), /tidigare anrop/);
  assert.equal(calls, 1);
});
