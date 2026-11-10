import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { safeFile } from './library.ts';

type Ref = { path: string; sha256: string };
/** Only the selected, verified Pamela archive may use the ZIP download route. */
export async function checkedPamelaBundle(root: string, relative: string): Promise<string> {
  assert.match(relative, /^runs\/\d{8}-pamela-[a-z0-9-]+\/take-\d{2}\/download-bundle\/pamela-14-scenklipp\.zip$/);
  const selected = JSON.parse(await readFile(path.join(root, 'references/pamela-two-sided-bank.json'), 'utf8'));
  assert.equal(selected.bundle?.path, relative); assert.match(selected.bundle?.sha256 ?? '', /^[a-f0-9]{64}$/);
  const receiptRef: Ref = selected.bundleReceipt;
  assert.ok(receiptRef); assert.match(receiptRef.sha256, /^[a-f0-9]{64}$/);
  const receiptBytes = await readFile(await safeFile(root, receiptRef.path));
  assert.equal(createHash('sha256').update(receiptBytes).digest('hex'), receiptRef.sha256);
  const receipt = JSON.parse(receiptBytes.toString());
  assert.equal(receipt.status, 'verified'); assert.deepEqual(receipt.evidence, selected.evidence);
  assert.deepEqual(receipt.archive, selected.bundle);
  assert.equal(receipt.verification?.clips, 14); assert.equal(receipt.verification?.archiveEntries, 16);
  assert.equal(receipt.verification?.copiedMp4HashesMatch, true); assert.equal(receipt.verification?.streamedZipHashesMatch, true);
  const filename = await safeFile(root, relative), before = await stat(filename), digest = createHash('sha256');
  assert.equal(before.size, selected.bundle.bytes);
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  assert.equal(digest.digest('hex'), selected.bundle.sha256);
  const after = await stat(filename); assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs);
  return filename;
}
