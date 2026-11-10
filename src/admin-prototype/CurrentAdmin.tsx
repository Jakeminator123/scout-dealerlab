'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import catalog from './dealer-reference.json';
import { DEALERS, sceneLabel } from './model';
import type { PrototypeState } from './model';
import './current-admin.css';

export type AdminView = 'dealers' | 'scenes' | 'studio' | 'admin' | 'partner';
const PAMELA = '/files/runs/20261108175519-74d6c57e/original/pamela-scene-reference-v2.png';
const GORAN = '/files/media/admin-reference-20261108/goran.webp';

function MenuIcon({ name }: { name: string }) {
  const icons: Record<string, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    dealers: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    scenes: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 5l3-3m3 3 3-3"/></>,
    material: <><rect x="6" y="3" width="15" height="15" rx="2"/><path d="M17 21H3V7m3 8 5-5 4 4 3-3 3 3"/></>,
    admin: <><path d="M4 21V5h10v16M14 10h6v11M8 8h2M8 12h2M8 16h2M3 21h18"/></>,
    accounts: <><circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a4 4 0 0 1 0 8m2 3a5 5 0 0 1 4 5v1"/></>,
    system: <><circle cx="12" cy="12" r="4"/><path d="m9 3 1-1h4l1 3 3 1 3 1v4l-2 1-1 4 1 2-3 3-3-1-3 1-3-2v-3l-2-3-2-1V8l3-1 3-1Z"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name] ?? icons.scenes}</svg>;
}

export function AdminNavigation({ view, change }: { view: AdminView; change: (view: AdminView) => void }) {
  const local = (id: AdminView, name: string, icon: string) => <button type="button" aria-current={view === id || (id === 'scenes' && view === 'studio') ? 'page' : undefined} onClick={() => change(id)}><MenuIcon name={icon}/>{name}</button>;
  const online = (path: string, name: string, icon: string) => <a href={`https://www.scoutgaming.tech${path}`} target="_blank" rel="noreferrer" title={`${name} – öppna riktiga Scoutgaming`}><MenuIcon name={icon}/>{name}<span className="ca-external" aria-label="öppnas i Scoutgaming">↗</span></a>;
  return <aside className="ca-sidebar" aria-label="Adminmeny">
    <button className="ca-brand" onClick={() => change('dealers')}><span>S</span><span><strong>Scoutgaming</strong><small>Admin · lokal designvy</small></span></button>
    <nav aria-label="Admin"><div className="ca-nav-group">{online('/admin', 'Översikt', 'overview')}</div><div className="ca-nav-group"><p>STUDIO</p>{local('dealers', 'Dealers', 'dealers')}{local('scenes', 'Scener', 'scenes')}{online('/admin/material', 'Material', 'material')}</div><div className="ca-nav-group"><p>ADMIN</p>{local('admin', 'Bolag', 'admin')}{online('/admin/accounts', 'Konton', 'accounts')}{online('/admin/system', 'System', 'system')}</div></nav>
    <div className="ca-sidebar-bottom"><div className="ca-session"><span>J</span><div><strong>Din lokala arbetsyta</strong><small>Ingen produktionsanslutning</small></div></div><button onClick={() => change('partner')} aria-current={view === 'partner' ? 'page' : undefined}>Partnerportalen <span>lokalt prov</span></button><a href="/">Till dealerlabbet <span>→</span></a></div>
  </aside>;
}

export function DealerCatalog({ createScene, openScenes }: { createScene: () => void; openScenes: () => void }) {
  const [search, setSearch] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const dealers = catalog.dealers.filter(dealer => dealer.name.toLocaleLowerCase('sv').includes(search.trim().toLocaleLowerCase('sv')) && (!onlyUnassigned || dealer.tables === 0));
  const dealer = catalog.dealers.find(item => item.id === selected);
  return <main className="ca-page">
    <div className="ca-page-heading"><div><span className="ca-eyebrow">STUDIO</span><h1>Dealers</h1><p>Personen i bild, med sina klipp och sin röst.</p></div><div className="ca-heading-actions"><button className="ca-secondary" onClick={openScenes}>Mina lokala scener</button><button className="ca-primary" onClick={createScene}>+ Ny fristående scen</button></div></div>
    <div className="ca-reference-note"><span className="ca-reference-dot"/><p><strong>Aktuella sidan som designgrund.</strong> Bilder och uppgifter lästa {new Date(catalog.capturedAt).toLocaleDateString('sv-SE')} från Scoutgaming. En lokal ögonblicksbild, inte löpande driftdata.</p><a href={catalog.source} target="_blank" rel="noreferrer">Öppna riktiga Admin ↗</a></div>
    <div className="ca-toolbar"><label className="ca-search"><span aria-hidden="true">⌕</span><input aria-label="Sök dealer" type="search" placeholder="Sök dealer…" value={search} onChange={event => setSearch(event.target.value)}/></label><div className="ca-filters"><button aria-pressed={!onlyUnassigned} onClick={() => setOnlyUnassigned(false)}>Alla <span>{catalog.dealers.length}</span></button><button aria-pressed={onlyUnassigned} onClick={() => setOnlyUnassigned(true)}>Utan spelbord <span>{catalog.dealers.filter(item => item.tables === 0).length}</span></button></div><span className="ca-result-count">{dealers.length} dealers</span></div>
    {dealer && <section className="ca-selected-dealer" aria-label={`Vald dealer: ${dealer.name}`}><div><strong>{dealer.name}</strong><p>Det här är en läsreferens. Klipp, röst och riktiga spelbord hanteras i Scoutgaming.</p></div><a className="ca-secondary" href={dealer.href} target="_blank" rel="noreferrer">Öppna {dealer.name} i Scoutgaming ↗</a><button className="ca-dismiss" onClick={() => setSelected(null)} aria-label="Stäng dealerinformation">×</button></section>}
    <ul className="ca-dealer-grid" aria-label="Dealers från Scoutgaming">{dealers.map(item => <li key={item.id}><button className="ca-dealer-card" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><div className="ca-dealer-image"><img src={item.image} alt="" loading="lazy"/><span className="ca-card-open" aria-hidden="true">↗</span></div><div className="ca-card-caption"><div><h2>{item.name}</h2><p>{item.tables ? `Vid ${item.tables} spelbord` : 'Inget spelbord'}</p></div><span className="ca-ready">{item.status}</span></div></button></li>)}</ul>
    {dealers.length === 0 && <div className="ca-empty"><h2>Ingen dealer matchar sökningen</h2><p>Prova ett annat namn eller visa alla dealers.</p><button className="ca-secondary" onClick={() => {setSearch('');setOnlyUnassigned(false);}}>Visa alla</button></div>}
    <footer className="ca-page-footer">Fotografier och namn kommer från den verifierade adminsidan. Inga QA-bolag ingår i denna lista.</footer>
  </main>;
}

export function SceneCatalog({ state, open, create }: { state: PrototypeState; open: (id: string) => void; create: () => void }) {
  const [tests, setTests] = useState(false);
  const isTest = (name: string) => /^QA\s*[·–-]/i.test(name);
  const scenes = state.scenes.filter(scene => tests || !isTest(scene.draft.name));
  const testCount = state.scenes.filter(scene => isTest(scene.draft.name)).length;
  return <main className="ca-page"><div className="ca-page-heading"><div><span className="ca-eyebrow">STUDIO / LOKALT</span><h1>Scener</h1><p>Skapa och testa innehåll först. Välj bolag och spelbord när det ska användas.</p></div><button className="ca-primary" onClick={create}>+ Ny scen</button></div><div className="ca-scene-intro"><p>Utkast och sparade versioner finns i den här webbläsaren. De är inte publicerade i Scoutgaming.</p><a href="https://www.scoutgaming.tech/admin/scenes" target="_blank" rel="noreferrer">Öppna publicerade scener ↗</a></div><ul className="ca-dealer-grid ca-scene-grid" aria-label="Lokala scener">{scenes.map(scene => <li key={scene.id}><button className="ca-dealer-card" onClick={() => open(scene.id)}><div className="ca-dealer-image"><img src={scene.draft.dealer === 'goran' ? GORAN : PAMELA} alt=""/><span className="ca-image-label">Referensbild</span></div><div className="ca-card-caption"><div><h2>{sceneLabel(state, scene)}</h2><p>{DEALERS[scene.draft.dealer]}</p></div><span className="ca-draft">{scene.versions.length ? `${scene.versions.length} ${scene.versions.length === 1 ? 'version' : 'versioner'}` : 'Utkast'}</span></div></button></li>)}</ul><div className="ca-test-disclosure"><label><input type="checkbox" checked={tests} onChange={event => setTests(event.target.checked)}/>Visa tidigare QA-scener ({testCount})</label><p>Testmaterialet är bevarat separat från den vanliga översikten.</p></div></main>;
}
