import { readFile } from 'node:fs/promises';
import path from 'node:path';
import PamelaCompositionReview, { createPamelaCompositionProps, type PamelaCompositionReport } from '../../src/components/pamela-composition';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pamela · Kompositionsgranskning' };

export default async function CompositionPage() {
  const report = JSON.parse(await readFile(path.join(process.cwd(), 'runs/20261109-pamela-central-composite/composition.json'), 'utf8')) as PamelaCompositionReport;
  const assetUrl = (file: string) => `/files/${file.split('/').map(encodeURIComponent).join('/')}`;
  const props = createPamelaCompositionProps(report, assetUrl, 'Lokal komposition');
  return <PamelaCompositionReview {...props} backHref="/" evidence={[{ label: 'Tidsmappning och proveniens', href: assetUrl('runs/20261109-pamela-central-composite/composition.json') }, { label: 'Kortspår per ruta', href: assetUrl('runs/20261109-pamela-central-composite/tracking/card-tracks.json') }]} />;
}
