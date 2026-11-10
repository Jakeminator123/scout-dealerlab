/** Opt-in source-bound paper corrections. The R16 adapter stays unchanged.
 * Neither card identity, physical-side schedule nor reveal permission changes.
 */
import { openBankCardSurfaces, type BankSurfaceSelection, type BankMaterials, type BankEngineSignal } from './pamela-bank-card-surfaces.ts';
import { refinePamelaBankPaperMask, PAMELA_BANK_MASK_REFINEMENT_SOURCES, type PamelaBankMaskRefinementId } from './pamela-bank-mask-refinements.ts';

export async function openRefinedBankCardSurfaces(selection: BankSurfaceSelection) {
  if (!(selection.id in PAMELA_BANK_MASK_REFINEMENT_SOURCES)) throw Error('No reviewed paper refinement for this slot');
  const id = selection.id as PamelaBankMaskRefinementId;
  const base = await openBankCardSurfaces(selection);
  if (base.source.sha256 !== PAMELA_BANK_MASK_REFINEMENT_SOURCES[id]) throw Error('Refinement source differs from bank source');
  async function geometryFrame(frame: number) {
    const data = await base.geometryFrame(frame), index = id.startsWith('C2') ? 1 : 0, target = data.geometry[index];
    if (!target || target.slotId !== id) throw Error('Refinement target geometry missing');
    const refinement = refinePamelaBankPaperMask({ id, sourceSha256: base.source.sha256, frame, sourceRgb: data.original, coverage: target.coverage, guard: target.guard, previousCardCoverage: index ? data.geometry[0].coverage : undefined });
    // Bounds also control the source blur. A no-op mask must preserve every
    // original geometry field, otherwise an unrelated frame can change.
    const changed = refinement.addedPixels + refinement.removedPixels + refinement.adjustedPixels > 0;
    const geometry = changed ? data.geometry.map((g, i) => i === index ? { ...g, coverage: refinement.coverage, bounds: refinement.bounds } : g) : data.geometry;
    return { ...data, geometry, added: data.added + refinement.addedPixels, refinement: { id, addedPixels: refinement.addedPixels, removedPixels: refinement.removedPixels, adjustedPixels: refinement.adjustedPixels } };
  }
  return {
    ...base, geometryFrame,
    async frame(frame: number, materials: BankMaterials, signals: ReadonlyMap<string, BankEngineSignal>) {
      const data = await geometryFrame(frame);
      return { ...await base.paint(data, materials, signals), refinement: data.refinement };
    },
  };
}
