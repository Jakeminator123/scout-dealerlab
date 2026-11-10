import Studio from '../src/Studio.tsx';
import type { StudioData } from '../src/studio-client';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const response = await fetch('http://127.0.0.1:4318/api/studio', { cache: 'no-store' });
  if (!response.ok) throw new Error('Den lokala materialöversikten kunde inte läsas.');
  const initialData = await response.json() as StudioData;
  return <Studio initialData={initialData} />;
}
