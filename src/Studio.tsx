'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { initStudio } from './studio-client';
import type { StudioData } from './studio-client';
import TerminologyOverlay from './terminology/TerminologyOverlay';
import ReviewBridge from './ReviewBridge';

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    film: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
    previous: <path d="M5 5v14m14-14-10 7 10 7Z" />,
    next: <path d="M19 5v14M5 5l10 7-10 7Z" />,
    reset: <path d="M3 10a9 9 0 1 1 1.5 7M3 4v6h6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.film}</svg>;
}

function Player({ side, name }: { side: 'a' | 'b'; name: string }) {
  return <section className="viewer" aria-label={name}>
    <div className="viewer-head"><span className={`slot slot-${side}`}>{side.toUpperCase()}</span><strong>{name}</strong><span className="viewer-kind" id={`kind-${side}`} /></div>
    <label className="visually-hidden" htmlFor={`select-${side}`}>Fil för {name.toLowerCase()}</label><select id={`select-${side}`} className="viewer-select" />
    <div className="video-stage" id={`stage-${side}`}>
      <video id={`video-${side}`} muted playsInline preload="metadata" aria-label={name} />
      {side === 'a' && <canvas id="video-overlay" aria-label="Kalibrerade koordinater över kandidatfilmen" hidden />}
      <div className="video-placeholder" id={`empty-${side}`}><Icon name="film" /><span>Välj ett klipp i biblioteket</span></div>
      <div className="video-corner" id={`dimensions-${side}`}>—</div>
    </div>
    <div className="viewer-foot"><span id={`name-${side}`}>Ingen fil vald</span><span id={`duration-${side}`}>—</span></div>
  </section>;
}

function Timeline() {
  return <section className="timeline" aria-label="Uppspelning och tidslinje">
    <div className="transport"><div className="transport-buttons">
      <button className="icon-button" id="reset-playback" type="button" title="Till början" aria-label="Till början"><Icon name="reset" /></button>
      <button className="icon-button" id="previous-frame" type="button" title="Ett steg bakåt" aria-label="Ett steg bakåt"><Icon name="previous" /></button>
      <button className="play-button" id="play-toggle" type="button" aria-label="Spela båda klippen" aria-pressed="false"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path id="play-icon" d="m9 5 11 7-11 7Z" /></svg></button>
      <button className="icon-button" id="next-frame" type="button" title="Ett steg framåt" aria-label="Ett steg framåt"><Icon name="next" /></button>
    </div><div className="timecode"><span id="current-time">00:00.000</span><span className="time-divider">/</span><span id="total-time">00:00.000</span></div>
    <div className="transport-options"><label className="loop-control"><input id="loop-playback" type="checkbox" defaultChecked />Loop</label><label><span className="visually-hidden">Hastighet</span><select id="playback-speed" defaultValue="1"><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="1">1×</option><option value="1.5">1,5×</option><option value="2">2×</option></select></label></div></div>
    <div className="timeline-body"><div className="ruler"><span>00:00</span><span id="ruler-quarter">—</span><span id="ruler-half">—</span><span id="ruler-threequarter">—</span><span id="ruler-end">—</span></div>
      <label className="visually-hidden" htmlFor="timeline-position">Position i jämförelsen</label><input id="timeline-position" className="timeline-scrubber" type="range" min="0" max="1" step="0.001" defaultValue="0" />
      <div className="tracks">{(['a', 'b'] as const).map(side => <div className="timeline-track" key={side}><span className="track-letter">{side.toUpperCase()}</span><div className="track-lane"><div className={`track-clip clip-${side}`} id={`track-${side}`}><span id={`track-name-${side}`}>Inget klipp valt</span></div></div></div>)}<div className="playhead" id="playhead" /></div>
    </div><div className="timeline-footer"><span id="play-status" role="status">Gemensam tidsposition · inte bildruteexakt synk</span><label>Steglängd<select id="frame-rate" title="Manuell steglängd, inte uppmätt bildfrekvens" defaultValue="24"><option value="24">1/24 s</option><option value="25">1/25 s</option><option value="30">1/30 s</option><option value="60">1/60 s</option></select></label></div>
  </section>;
}

function Library({ count }: { count: number }) {
  return <aside className="library-panel" id="library" role="tabpanel" aria-labelledby="tab-library" aria-label="Materialbibliotek">
    <div className="panel-heading"><h1>Material</h1><div className="library-heading-actions"><span className="count" id="asset-count">{count}</span><button type="button" className="icon-button" id="refresh-data" title="Uppdatera lokalt material" aria-label="Uppdatera lokalt material"><Icon name="reset" /></button></div></div>
    <div className="library-controls"><label className="search-field"><Icon name="search" /><input id="asset-search" type="search" placeholder="Sök klipp och bilder" aria-label="Sök material" /></label><div className="filter-tabs" aria-label="Materialtyp"><button className="selected" type="button" data-kind="all" aria-pressed="true">Alla</button><button type="button" data-kind="video" aria-pressed="false">Klipp</button><button type="button" data-kind="image" aria-pressed="false">Bilder</button></div>
      <label className="visually-hidden" htmlFor="dealer-filter">Dealeridentitet</label><select id="dealer-filter"><option value="all">Alla dealeridentiteter</option><option value="goran-scout">Göran · Scout Main</option><option value="blankurius-scout">Blankurius · Scout Main</option><option value="goran-alternativ-helkropp">Göran · alternativ helkropp</option><option value="unclassified">Oklassificerat</option></select><label className="visually-hidden" htmlFor="origin-filter">Filtrera ursprung eller steg</label><select id="origin-filter"><option value="all">Alla ursprung & steg</option><option value="local">Lokalt underlag</option><option value="runway">Runway</option><option value="blob">Blob</option><option value="processed">Bearbetat</option><option value="original">Original</option></select>
    </div><label className="track-filter-option"><input id="all-tracks" type="checkbox" />Visa även andra spår</label><div className="library-target"><span id="library-scope">Material i valt spår</span><div className="segmented"><button className="selected" type="button" data-target="a" aria-pressed="true">A</button><button type="button" data-target="b" aria-pressed="false">B</button></div></div><div id="asset-list" className="asset-list" />
    <div className="library-footer"><i className="status-dot" /><span>Originalfiler bevaras</span><a href="/files/docs/ARBETSSATT.md" target="_blank" rel="noreferrer" aria-label="Öppna arbetssätt">↗</a></div>
  </aside>;
}

function Inspector({ csrfToken }: { csrfToken: string }) {
  return <aside className="inspector" id="inspector" aria-label="Rörelseschema och granskning">
    <section id="motion-panel" role="tabpanel" aria-labelledby="tab-motion"><div className="inspector-section">
      <div className="section-label"><h2>Rörelseschema</h2><span className="panel-kicker">PLANERING</span></div>
      <label className="field-label" htmlFor="scheme-select">Schema</label><select id="scheme-select" /><details className="scheme-description"><summary>Om källschemat</summary><p className="muted small" id="scheme-summary" /></details>
      <label className="field-label" htmlFor="transition-select">Övergång</label><select id="transition-select" /><div className="state-flow" id="state-flow" />
      <div className="clip-key"><span>Källans klippnyckel</span><code id="transition-key">—</code></div><div className="mapping-status" id="mapping-status" />
      <button className="button secondary full" type="button" id="load-transition">Visa klippet i A <Icon name="arrow" /></button>
      <button className="button secondary full sequence-add" type="button" id="add-sequence"><Icon name="plus" />Lägg till i följd</button><p id="next-state" className="small muted" />
    </div><details className="inspector-section coordinates-section" id="geometry-details"><summary><span>Geometri & kortspår</span><span id="coordinate-size" className="muted small">—</span></summary><div className="coordinate-status" id="coordinate-status">Ingen filkalibrering</div><div className="coordinate-map"><canvas id="source-map" width="240" height="232" aria-label="Källkoordinater, fristående från vald video" tabIndex={0} /><div id="map-empty" className="map-empty">Inga koordinater i denna övergång</div></div><div id="source-scrubber" hidden><label className="small" htmlFor="source-frame">Bildruta i källschemat</label><input id="source-frame" type="range" min="0" max="0" defaultValue="0" step="1" style={{width:"100%"}} /><p id="source-frame-label" className="small muted" /></div><p id="coordinate-detail" className="small muted">Peka på en punkt för att läsa källkoordinater.</p><label className="overlay-control"><input id="overlay-toggle" type="checkbox" disabled />Visa kalibrerad geometri på A</label></details>
      <section className="sequence-panel inspector-section" aria-label="Planerad klippföljd"><div className="panel-heading"><div><h2>Klippföljd</h2><p>Planerade steg</p></div><button id="clear-sequence" className="text-button" type="button">Rensa</button></div><div id="sequence-list" className="sequence-list" /><p id="sequence-status" className="sequence-status" role="status">Välj en övergång och lägg till i följden.</p></section>
      <div className="inspector-section evidence-section"><details><summary>Källbevis & tekniska detaljer <span>↗</span></summary><p id="scheme-evidence" className="small" /><code id="scheme-source" /><p id="scheme-notes" className="muted small" /></details></div>
    </section><section id="review-panel" role="tabpanel" aria-labelledby="tab-review" hidden><div className="inspector-section"><div className="section-label"><h3>Spara granskning</h3><span className="small muted">Lokalt</span></div><p className="muted small">Beslutet knyts till exakt filhash när du sparar.</p>
      <form method="post" action="/reviews" id="review-form"><input type="hidden" name="csrf" value={csrfToken} /><label>Försök<select name="runId" id="review-run" required /></label><label>Granskad fil<select name="asset" id="review-asset" required /></label><label>Beslut<select name="decision"><option value="unreviewed">Behöver mer granskning</option><option value="improved">Förbättrat</option><option value="unchanged">Oförändrat</option><option value="worse">Försämrat</option></select></label><label>Observation<textarea name="note" required rows={5} maxLength={8000} placeholder="Hårkanter, händer, kortkontakt, rörelse och skarvar…" /></label><button className="button primary full" id="save-review">Spara granskning</button><p className="muted small" id="review-hint" /></form>
    </div></section><div className="inspector-bottom"><span className="status-dot" />Ingen generering körs här</div>
  </aside>;
}

function Dialogs({ csrfToken }: { csrfToken: string }) {
  return <>
    <dialog id="import-dialog"><form method="post" action="/imports"><input type="hidden" name="csrf" value={csrfToken} /><div className="dialog-heading"><div><span className="eyebrow">MATERIAL</span><h2>Importera original</h2></div><button className="icon-button" type="button" data-close aria-label="Stäng"><Icon name="close" /></button></div><p className="muted">Hämta en befintlig fil till det lokala biblioteket. Ingen generering startas.</p><label>Ursprung<select name="sourceType" id="import-source"><option value="runway">Runway</option><option value="blob">Blob</option></select></label><button className="button secondary" id="load-remote" type="button">Hämta lista</button><p id="remote-status" className="small muted" role="status" /><div id="remote-list" className="remote-list" /><label>Direktlänk till mediefil<input type="url" name="url" id="import-url" required placeholder="https://…" maxLength={4000} /></label><label>Ursprung och sammanhang<textarea name="note" id="import-note" rows={3} maxLength={8000} placeholder="Task-ID, modell, tidigare bearbetning eller annat du vet." /></label><div className="dialog-actions"><button className="button secondary" type="button" data-close>Avbryt</button><button className="button primary" type="submit">Importera lokalt</button></div></form></dialog>
    <dialog id="experiment-dialog"><form method="post" action="/experiments" id="experiment-form"><input type="hidden" name="csrf" value={csrfToken} /><div className="dialog-heading"><div><span className="eyebrow">NYTT FÖRSÖK</span><h2>Vad vill du pröva?</h2></div><button className="icon-button" type="button" data-close aria-label="Stäng"><Icon name="close" /></button></div><p className="muted">Spara en lokal plan med källfiler och filhashar.</p><label>Namn<input name="title" required maxLength={120} placeholder="Till exempel: Göran – hårkanter och handkontakt" /></label><label>Källfil<select name="source" id="experiment-source" required /></label><label>Referens<select name="reference" id="experiment-reference" /></label><label>Hypotes och ändring<textarea name="note" rows={3} maxLength={8000} placeholder="Vad ändras och hur bedömer vi resultatet?" /></label><div className="dialog-actions"><button className="button secondary" type="button" data-close>Avbryt</button><button className="button primary" type="submit" id="save-experiment">Spara försöksplan</button></div></form></dialog>
    <dialog id="image-dialog" className="image-dialog"><div className="dialog-heading"><h2 id="image-title">Bildmaterial</h2><button className="icon-button" type="button" data-close aria-label="Stäng"><Icon name="close" /></button></div><img id="image-preview" alt="" /><p className="muted small" id="image-path" /></dialog>
  </>;
}

export default function Studio({ initialData }: { initialData: StudioData }) {
  useEffect(() => initStudio(initialData), [initialData]);
  return <div id="dealer-studio" data-dock="library">
    <header className="appbar">
      <a className="brand" href="/" aria-label="Dealerstudio startsida"><span className="brand-mark"><Icon name="film" /></span><span>Dealer<span className="brand-light">studio</span><small>SCOUT GAMING · LOCAL LAB</small></span></a>
      <nav className="main-nav" aria-label="Arbetsyta"><button className="nav-item active" id="nav-workspace" type="button">Klippstudio</button><a className="nav-item" href="/materialprov">Materialprov</a><button className="nav-item" id="nav-runs" type="button">Försök<span className="count" id="run-count">{initialData.runs.length}</span></button></nav>
      <div className="app-actions"><TerminologyOverlay /><span className="local-state"><i />Lokalt</span><button className="button secondary compact" data-open="import-dialog" type="button"><Icon name="upload" />Importera</button><button className="button primary compact" data-open="experiment-dialog" type="button"><Icon name="plus" />Nytt försök</button></div>
    </header>
    <nav className="workflow-bar" aria-label="Arbetsflöde"><span className="workflow-label">KÄLLSPÅR</span><button className="workflow-tab selected" data-workflow="main" aria-pressed="true" type="button"><span className="workflow-number">01</span><span>Scoutgaming<small>Nuvarande kontrakt</small></span></button><button className="workflow-tab" data-workflow="kevin" aria-pressed="false" type="button"><span className="workflow-number">02</span><span>Kevin / Emil<small>Källreferenser</small></span></button><button className="workflow-tab" data-workflow="alternative" aria-pressed="false" type="button"><span className="workflow-number">03</span><span>Alternativa<small>Separata pipelines</small></span></button><span className="workflow-end">Original → jämförelse → beslut</span></nav>
    <ReviewBridge /><div className="notice" id="notice" role="status" hidden />
    <main className="studio-layout">
      <section className="editor" aria-label="Jämförelse">
        <div className="editor-heading"><div><span className="eyebrow" id="workflow-eyebrow">SCOUTGAMING IDAG</span><h1>Jämförelse<span className="comparison-label">A / B</span></h1></div><div className="editor-tools"><button type="button" className="text-button" id="contact-sheet" title="Visa kontaktark för kandidatfilen"><Icon name="grid" />Kontaktark</button><button type="button" className="text-button" id="swap-clips" title="Byt plats på kandidat och referens">⇄ Byt plats</button></div></div>
        <details className="context-details"><summary><span className="context-dot" />Manuellt valda filmer<span>Om spåret</span></summary><p id="workflow-context">Källschema och vald film hålls åtskilda tills filkopplingen är verifierad.</p></details>
        <details className="context-details" id="alternative-composition" hidden><summary>Görans sammansatta scen · var finns den?</summary><p><strong>Göran · levande blackjack</strong> finns i <code>local-studio/blackjack-studio</code>, revision 103. Här kan du granska dess 19 filmer och källfack. Den fulla kompositionen med 3D-bord, sko och panorama körs i den separata appen på port 4323. Ingen extra server startas automatiskt.</p><p><a href="/files/docs/studio/ALTERNATIV-3D.md" target="_blank" rel="noreferrer">Startväg, projektkoppling och begränsningar ↗</a></p></details>
        <div className="viewers"><Player side="a" name="Kandidat" /><Player side="b" name="Referens" /></div>
        <Timeline />
        <details className="source-disclosure"><summary>Kandidatens källa<span className="source-badge" id="source-badge">Lokalt</span></summary><p id="selected-path">Välj ett klipp för att börja.</p><p id="naming-note" className="naming-note" hidden>F73/S303 återges från filnamnet. Betydelsen är inte verifierad.</p></details>
        <section className="runs-panel" id="runs-panel" hidden><div className="panel-heading"><h2>Sparade försök</h2><button type="button" className="text-button" data-open="experiment-dialog">+ Nytt försök</button></div><div id="runs-list" /></section>
      </section>
      <aside className="side-dock" aria-label="Studioverktyg">
        <div className="dock-tabs" role="tablist" aria-label="Studioverktyg"><button id="tab-library" role="tab" aria-selected="true" aria-controls="library" type="button"><Icon name="film" />Material</button><button id="tab-motion" role="tab" tabIndex={-1} aria-selected="false" aria-controls="motion-panel" type="button">Rörelse</button><button id="tab-review" role="tab" tabIndex={-1} aria-selected="false" aria-controls="review-panel" type="button">Granska</button></div>
        <Library count={initialData.assets.length} /><Inspector csrfToken={initialData.csrfToken} />
      </aside>
    </main>
    <footer className="statusbar"><span><i className="status-dot" /><span id="connection-status">Lokal arbetsyta</span></span><span>Källor bevaras · inget publiceras</span><a href="/files/docs/ATKOMST.md" target="_blank" rel="noreferrer">Tjänsteåtkomst ↗</a></footer><Dialogs csrfToken={initialData.csrfToken} />
  </div>;
}
