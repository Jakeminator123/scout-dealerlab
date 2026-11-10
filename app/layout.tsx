import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../src/studio.css';
import LocalSession from '../src/LocalSession';

export const metadata: Metadata = {
  title: 'Dealerstudio · Lokal arbetsyta',
  description: 'Lokal granskning av dealerklipp, rörelsescheman och försök.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="sv"><head><link rel="alternate" type="application/json" href="/agent-context.json" title="Aktuellt granskningsunderlag" /></head><body><LocalSession />{children}</body></html>;
}
