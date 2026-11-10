export type SourceTrack = 'main' | 'kevin' | 'alternative' | 'unclassified';
export const trackLabels: Record<SourceTrack, string> = {
  main: 'Scoutgaming', kevin: 'Kevin / Emil', alternative: 'Alternativa', unclassified: 'Ej placerat',
};

/** Source grouping is separate from the hash-verified dealer identity. */
export function sourceTrack(asset: { path: string; dealerId?: string }): SourceTrack {
  if (asset.dealerId === 'goran-alternativ-helkropp') return 'alternative';
  if (['goran-scout', 'blankurius-scout', 'pamela-pilot'].includes(asset.dealerId || '')) return 'main';
  if (asset.path.startsWith('gpt-underlag/uppackad-zip-underlag/05_referens_Emil/')) return 'kevin';
  if (asset.path.startsWith('extra/insperationsmall-alternativ/')) return 'alternative';
  if (asset.path.startsWith('media/alternative-project/e19d226c-c586-467e-b126-6a9f90e1675e/')) return 'alternative';
  if (asset.path.startsWith('gpt-underlag/uppackad-zip-underlag/01_original/') ||
      asset.path.startsWith('gpt-underlag/uppackad-zip-underlag/04_bildbevis/') ||
      asset.path.startsWith('media/admin-reference-20261108/') ||
      asset.path.startsWith('media/blob/9b9c19fd003b3302/')) return 'main';
  return 'unclassified';
}
