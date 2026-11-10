import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkedPamelaBundle } from '../src/pamela-bundle-download.ts';
const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

test('ZIP downloads require the selected archive, verified receipt, size and actual bytes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pamela-bundle-test-'));
  try {
    const relative = 'runs/20261110-pamela-mask-bank/take-01/download-bundle/pamela-14-scenklipp.zip';
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await mkdir(path.join(root, 'references'));
    const bytes = Buffer.from('test archive bytes'), bundle = { path: relative, sha256: hash(bytes), bytes: bytes.length };
    const evidence = { path: 'runs/20261110-pamela-mask-bank/take-01/evidence.json', sha256: hash('fixture evidence') };
    await writeFile(path.join(root, relative), bytes);
    const receiptPath = relative.replace('pamela-14-scenklipp.zip', 'receipt.json');
    const receipt = JSON.stringify({ status: 'verified', evidence, archive: bundle, verification: { clips: 14, archiveEntries: 16, copiedMp4HashesMatch: true, streamedZipHashesMatch: true } });
    await writeFile(path.join(root, receiptPath), receipt);
    const selected = { bundle, evidence, bundleReceipt: { path: receiptPath, sha256: hash(receipt) } };
    const selectionPath = path.join(root, 'references/pamela-two-sided-bank.json'); await writeFile(selectionPath, JSON.stringify(selected));
    assert.equal(await checkedPamelaBundle(root, relative), path.join(root, ...relative.split('/')));
    await assert.rejects(checkedPamelaBundle(root, relative.replace('take-01', 'take-02')));
    await assert.rejects(checkedPamelaBundle(root, 'private/archive.zip'));
    await assert.rejects(checkedPamelaBundle(root, 'runs/../private/archive.zip'));
    const tampered = Buffer.from(bytes); tampered[0] ^= 1; await writeFile(path.join(root, relative), tampered);
    await assert.rejects(checkedPamelaBundle(root, relative), 'Same-length archive tampering must fail');
    await writeFile(path.join(root, relative), bytes);
    await writeFile(path.join(root, receiptPath), receipt + ' ');
    await assert.rejects(checkedPamelaBundle(root, relative), 'Changed receipt must fail');
    await writeFile(path.join(root, receiptPath), receipt);
    await writeFile(selectionPath, JSON.stringify({ ...selected, evidence: { ...evidence, sha256: hash('another evidence') } }));
    await assert.rejects(checkedPamelaBundle(root, relative), 'Receipt for another bank must fail');
    assert.equal(hash(await readFile(path.join(root, relative))), bundle.sha256);
  } finally { await rm(root, { recursive: true, force: true }); }
});
