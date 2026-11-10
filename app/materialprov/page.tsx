import MaterialPreview from '../../src/material-preview/MaterialPreview';
import type { StudioData } from '../../src/studio-client';
export const dynamic = 'force-dynamic';
export default async function MaterialPage() {
  const response = await fetch('http://127.0.0.1:4318/api/studio', { cache: 'no-store' });
  if (!response.ok) throw new Error('Materialbiblioteket kunde inte läsas.');
  const data = await response.json() as StudioData;
  return <MaterialPreview assets={data.assets} />;
}
