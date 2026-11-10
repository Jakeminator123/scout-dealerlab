'use client';
import { useState } from 'react';
import type { MaterialReview } from '../material-review';
import { fileUrl, reviewMatches, type MaterialAsset } from './model';
export default function AIReview({ assets }: { assets: MaterialAsset[] }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<MaterialReview | null>(null);
  const canReview = assets.length > 0 && assets.every(a => !a.video && /\.(png|jpe?g|webp)$/i.test(a.path));
  const matches = result && reviewMatches(assets, result.inputs);
  async function run() {
    if (busy || !canReview) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const sessionResponse = await fetch('/api/studio');
      if (!sessionResponse.ok) throw new Error('Kunde inte hämta lokal session.');
      const session = await sessionResponse.json();
      const response = await fetch('/api/material-review', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: session.csrfToken, a: assets[0].path, b: assets[1]?.path || assets[0].path }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Bildgranskningen misslyckades.');
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Bildgranskningen misslyckades.'); }
    finally { setBusy(false); }
  }
  return <section className="mp-ai"><div><h2>AI-bildgranskning</h2><p>Granska de valda originalbilderna inför nästa keystone eller filmprov. Ett klick skickar högst två bilder till OpenAI. Samma filer återanvänder sparat svar.</p></div><button disabled={!canReview || busy} onClick={()=>void run()}>{busy ? 'Granskar bilder…' : 'Granska A/B med OpenAI'}</button><p className="mp-ai-caption">Förhandsvisningens bakgrund och grönnyckling skickas inte. Filmer granskas separat ruta för ruta. Svaret är ett råd; det godkänner inte en dealerbank.</p>{error && <p role="alert">{error}</p>}{result && <div role="status"><strong>{matches ? 'Granskning av de valda filerna' : 'Tidigare granskning — andra filer är nu valda'}</strong><p className="mp-ai-result">{result.text}</p><a href={fileUrl(result.reportPath)} target="_blank" rel="noreferrer">Sparat svar, modell och filhashar ↗</a></div>}</section>;
}
