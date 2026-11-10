'use client';
import { useEffect, useState } from 'react';
import { auditClip, schemeCoverage, type AuditData } from './clip-audit';

export default function ClipAuditView({ selectedPath }: { selectedPath?: string }) {
  const [data, setData] = useState<AuditData | null>(null), [error, setError] = useState(''), [path, setPath] = useState(selectedPath || '');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/studio', { signal: controller.signal }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(d => { setData({ assets: d.assets, schemes: d.schemes }); setPath(p => d.assets.some((a: { path: string; video: boolean }) => a.path === p && a.video) ? p : d.assets.find((a: { name: string }) => a.name === 'pos4-iv.mp4')?.path || d.assets.find((a: { video: boolean }) => a.video)?.path || ''); }).catch(e => { if (e.name !== 'AbortError') setError('Materialkontrollen kunde inte läsas.'); });
    return () => controller.abort();
  }, []);
  if (!data) return <p role="status">{error || 'Läser lokala filer och källscheman…'}</p>;
  const videos = data.assets.filter(a => a.video), asset = videos.find(a => a.path === path);
  const audit = asset && auditClip(asset, data.schemes);
  return <section className="term-real-clips"><h3>Filnamn → förslag → källschema → verifierad fil</h3><p>Kontrollen gäller metadata och kopplingar. Den säger inte att hela rörelsen eller skarven är godkänd.</p>
    <div className="term-audit-counts"><strong>{videos.length} lokala filmer</strong><span>{videos.filter(a => !a.dealerId || a.dealerId === 'unclassified').length} saknar fastställd dealeridentitet</span><span>{[...new Set(videos.map(a=>a.fps ?? a.metadata?.fps).filter(Boolean))].sort().join(' / ')} fps i materialet</span></div>
    <label>Undersök verkligt klipp<select aria-label="Undersök verkligt klipp" value={path} onChange={e => setPath(e.target.value)}>{videos.map(a => <option key={a.path} value={a.path}>{a.displayName || a.name} · {a.dealerLabel || 'Oklassificerat'}</option>)}</select></label>
    {asset && audit && <div className="term-panel"><h3>{asset.displayName || asset.name}</h3><p><strong>{audit.hint.label}</strong>{audit.hint.from && ` · ${audit.hint.from} → ${audit.hint.to}`} · {audit.hint.confidence}</p><p>{asset.dealerLabel || 'Dealeridentitet okänd'} · {asset.fps ?? asset.metadata?.fps ?? '?'} fps · {asset.frameCount ?? asset.metadata?.frameCount ?? '?'} rutor</p><code className="term-hash">SHA-256 {asset.sha256 || 'okänd'}</code>
      {audit.candidates.length ? audit.candidates.map((c, i) => <article className="term-binding" key={i} data-state={c.hashStatus}><strong>{c.scheme}</strong><p>{c.slot} · {c.from} → {c.to}</p><p>{c.pathBound ? 'Filväg kopplad i källmanifestet.' : 'Endast namnförslag, ingen lokal bindning.'} {c.hashStatus === 'match' ? 'Filhash matchar källbeviset.' : c.hashStatus === 'mismatch' ? 'HASHAVVIKELSE — använd inte denna kalibrering för filen.' : 'Ingen verifierad hashkoppling.'} {c.hasGeometry ? 'Geometri finns i källprofilen.' : 'Ingen importerad geometri.'}</p><details><summary>Källbevis</summary><p>{c.evidence}</p></details></article>) : <p>Inget källschema binder denna fil. Namnet eller utseendet får inte skapa en automatisk koppling.</p>}
    </div>}
    <div className="term-table-scroll"><table><caption>Täckning per källschema — fack är inte samma sak som unika filmer</caption><thead><tr><th>Schema</th><th>Fack</th><th>Filväg</th><th>Hashträff</th></tr></thead><tbody>{schemeCoverage(data).map(s => <tr key={s.id}><th>{s.label}</th><td>{s.planned}</td><td>{s.bound}</td><td>{s.hashMatched}</td></tr>)}</tbody></table></div>
    <p className="term-caption">Astrid2 och PAOW har plan-/profilunderlag. Mauds lokala referensfilm ger inte i sig en full rörelsebank. F73/S303 och UUID-filnamn översätts inte till spelregler. Motorn bestämmer händelserna; filen visar rörelsen.</p>
  </section>;
}
