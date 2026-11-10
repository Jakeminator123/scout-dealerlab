import test from 'node:test';
import assert from 'node:assert/strict';
import { auditClip, nameHint, schemeCoverage, type AuditData } from '../src/terminology/clip-audit.ts';

test('filename suggestions never create a file binding or grant another files calibration', () => {
  const asset = { path: 'media/pos4-iv.mp4', name: 'pos4-iv.mp4', video: true, bytes: 1, sha256: 'a'.repeat(64) };
  const schemes: AuditData['schemes'] = [{ id: 'main', label: 'Main', sourceRef: '', sourcePath: '', summary: '', states: [], transitions: [{ id: '4:iv', label: '', clipKey: '4:iv', from: 'VILA', to: 'VILA', evidence: `klipphash ${'b'.repeat(64)}`, coordinates: { timing: { fps: 30 } } }] }];
  const result = auditClip(asset, schemes);
  assert.equal(result.hint.from, 'VILA');
  assert.equal(result.candidates[0].pathBound, false);
  assert.equal(result.candidates[0].hashStatus, 'mismatch');
  assert.deepEqual(schemeCoverage({ assets: [asset], schemes })[0], { id: 'main', label: 'Main', planned: 1, bound: 0, hashMatched: 0 });
  schemes[0].transitions[0].assetPath = asset.path;
  assert.equal(schemeCoverage({ assets: [asset], schemes })[0].hashMatched, 0);
  schemes[0].transitions[0].evidence = `SHA-256 ${asset.sha256}`;
  assert.equal(schemeCoverage({ assets: [asset], schemes })[0].hashMatched, 1);
});
test('UUIDs, unsupported positions and unrelated suffixes remain unclassified', () => {
  for (const name of ['90924b04-f54e-4486-8bec-11d8b09b47a0.mp4', 'pos8-iv.mp4', 'pos4-i-copy.mp4', 'F73_S303.mp4']) assert.equal(nameHint(name).confidence, 'okänt');
  assert.equal(nameHint('pos2-i.mp4').to, 'REDO');
  assert.equal(nameHint('pos2-v.mp4').to, 'VILA');
});
