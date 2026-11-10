import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { openRefinedBankCardSurfaces } from '../src/pamela-refined-bank-card-surfaces.ts';
import { checkedMaterialBytes } from '../src/pamela-frozen-material-track.ts';
import { openBankCardSurfaces, type BankMaterials, type BankEngineSignal } from '../src/pamela-bank-card-surfaces.ts';

test('refinement corrects paper, respects reveal denial and preserves zero-delta frames exactly', async () => {
  const p = JSON.parse(await readFile('runs/20261110-pamela-two-sided-bank/take-02/plan.json', 'utf8'));
  const design = p.designs.find((d: { id: string }) => d.id === 'sg-classic'); assert.ok(design);
  const texture = async (r: { path: string; sha256: string }) => { const { data, info } = await sharp(await checkedMaterialBytes(r)).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { rgb: data, width: info.width, height: info.height, id: r.sha256 }; };
  const front = new Map(await Promise.all(Object.entries(p.artwork.front[design.front] as Record<string, { path: string; sha256: string }>).map(async ([id, r]) => [id, await texture(r)] as const)));
  let faceLookups = 0; const originalGet = front.get.bind(front); front.get = id => { faceLookups++; return originalGet(id); };
  const materials: BankMaterials = { back: await texture(p.artwork.back[design.back]), front };
  const signals = new Map<string, BankEngineSignal>(p.engineFixture.signals.map((s: BankEngineSignal & { slotId: string }) => [s.slotId, { cardId: s.cardId, frontAllowed: true }]));
  for (const row of [{ id: 'C1-P7', frame: 86, x: 1375, y: 755, rgb: [81, 83, 80] }, { id: 'C2-P6', frame: 117, x: 1220, y: 712, rgb: [243, 241, 233] }]) {
    const selection = p.selections.find((s: { id: string }) => s.id === row.id); assert.ok(selection);
    const track = await openRefinedBankCardSurfaces(selection), painted = await track.frame(row.frame, materials, signals), k = (row.y * 1762 + row.x) * 3;
    assert.deepEqual([...painted.printed.subarray(k, k + 3)], row.rgb);
    assert.equal(painted.verification.changedOutsidePaperPixels, 0); assert.equal(painted.verification.changedProtectedPixels, 0);
    const denied = new Map([...signals].map(([id, signal]) => [id, { ...signal, frontAllowed: false }])); faceLookups = 0;
    const concealed = await track.frame(row.frame, materials, denied);
    assert.equal(faceLookups, 0, 'A forbidden card face texture was loaded');
    assert.equal(concealed.verification.changedOutsidePaperPixels, 0); assert.equal(concealed.verification.changedProtectedPixels, 0);
    if (row.id === 'C1-P7') assert.deepEqual([...concealed.printed.subarray(k, k + 3)], row.rgb, 'Shoe pixel must remain original regardless of material');
    else assert.notDeepEqual([...concealed.printed.subarray(k, k + 3)], row.rgb, 'New paper coverage must obey reveal denial');
  }
  const unchangedSelection = p.selections.find((s: { id: string }) => s.id === 'C1-P7');
  const original = await openBankCardSurfaces(unchangedSelection), refined = await openRefinedBankCardSurfaces(unchangedSelection);
  for (const frame of [110, 115, 183]) {
    const before = await original.geometryFrame(frame), after = await refined.geometryFrame(frame);
    assert.equal(after.refinement.addedPixels + after.refinement.removedPixels + after.refinement.adjustedPixels, 0);
    // uvAt is a fresh closure on each read; compare geometry data and then its
    // complete rendered result instead of comparing function identities.
    const geometryData = (layers: typeof before.geometry) => layers.map(({ uvAt: _uvAt, ...data }) => data);
    assert.deepEqual(geometryData(after.geometry), geometryData(before.geometry), `No-op refinement changed geometry at frame ${frame}`);
    const beforePaint = await original.paint(before, materials, signals), afterPaint = await original.paint(after, materials, signals);
    assert.equal(Buffer.compare(beforePaint.printed, afterPaint.printed), 0, `No-op refinement changed printed pixels at frame ${frame}`);
  }
});
