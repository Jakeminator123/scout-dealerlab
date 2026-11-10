'use client';
import { useEffect, useState } from 'react';

type Context = { contentId: string; publication: { url: string; state: string; snapshot: string | null }; generatedAt: string };
type Selection = { track: string; a: string | null; b: string | null };
export default function ReviewBridge() {
  const [context, setContext] = useState<Context | null>(null);
  const [selection, setSelection] = useState<Selection>({track:'main',a:null,b:null});
  useEffect(() => {
    const controller = new AbortController();
    const update = () => { void fetch('/agent-context.json', { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(value => { if (value) setContext(value); }).catch(() => {}); };
    const select = (event: Event) => setSelection((event as CustomEvent<Selection>).detail);
    window.addEventListener('studio-selection', select);
    window.addEventListener('focus', update);
    const timer = setInterval(update, 60000);
    update();
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('studio-selection', select); };
  }, []);
  const query = new URLSearchParams({ track: selection.track });
  if (context) query.set('content', context.contentId);
  if (selection.a) query.set('a', selection.a);
  if (selection.b) query.set('b', selection.b);
  const url = (context?.publication.url || 'https://scout-dealerlab.vercel.app') + '/?' + query;
  return <div className="review-bridge">
    <a href={url} target="_blank" rel="noreferrer">Samma material på webben ↗</a>
    <span>{context ? (context.publication.state === 'same-content' ? 'Samma underlag publicerat' : 'Lokala ändringar är opublicerade') : 'Läser underlagsversion…'}{context && ` · ${context.contentId.slice(0, 8)}`}</span>
    <a href="/agent-context.json" target="_blank" rel="noreferrer">Agentdata</a>
    <small>Servern stängs 60 s efter sista lokala fliken. Minimering är okej.</small>
    <script id="studio-context" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ ...context, selection, details: '/agent-context.json' }).replace(/</g, '\\u003c') }} />
  </div>;
}
