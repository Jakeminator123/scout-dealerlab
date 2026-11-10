'use client';

import { useId, useRef, useState } from 'react';
import terminology from '../../references/terminology.json';
import ClipAuditView from './ClipAuditView';
import ProductionProgress from './ProductionProgress';
import './terminology.css';

type Step = (typeof terminology.steps)[number];
type Term = (typeof terminology.terms)[number];
type View = 'explore' | 'compare' | 'words' | 'clips' | 'progress';

const terms = new Map(terminology.terms.map(term => [term.id, term]));
const statusLabels: Record<string, string> = {
  verified: 'Belagt i underlaget',
  'lab-proposal': 'Labbförslag',
  ambiguous: 'Kräver precisering',
  unknown: 'Obekräftat',
};
const views: { id: View; label: string }[] = [
  { id: 'explore', label: 'Scen & klipp' },
  { id: 'compare', label: 'Jämför systemen' },
  { id: 'words', label: 'Sök begrepp' },
  { id: 'clips', label: 'Riktiga klipp' },
  { id: 'progress', label: 'Arbetsläge' },
];

function label(id: string) { return terms.get(id)?.label ?? id; }
function exampleText(text: string, name: string) { return text.replace(/\bJohan\b/g, () => name); }

function TermDetail({ term, name }: { term: Term; name: string }) {
  return <aside className="term-definition" aria-label="Valt begrepp" aria-live="polite" aria-atomic="true">
    <span className="term-kicker">DET HÄR BETYDER ORDET</span>
    <h3>{term.label}</h3>
    <span className="term-status" data-status={term.status}>{statusLabels[term.status] ?? term.status}</span>
    <p>{exampleText(term.description, name)}</p>
    {term.aliases.length > 0 && <div className="term-aliases"><span>Kan också stå som</span><ul>{term.aliases.map(alias => <li key={alias}>{alias}</li>)}</ul></div>}
    <small>Ur det gemensamma begreppsunderlaget · {terminology.verifiedAt}</small>
  </aside>;
}

/** A conceptual drawing only; these coordinates must never become media calibration. */
function SceneDrawing({ name, pose, active }: { name: string; pose: string; active: string }) {
  return <svg className="term-scene-drawing" viewBox="0 0 620 290" role="img" aria-label={`Schematisk scen med ${name}, bordsgrafik, kortsko och spelkort. Exempelpose ${pose}; inga kalibrerade positioner.`}>
    <rect width="620" height="290" rx="16" fill="#101923" />
    <path d="M50 247H570M90 36V247M530 36V247" stroke="#273542" strokeDasharray="4 8" fill="none" />
    <ellipse cx="310" cy="74" rx="31" ry="34" fill="#839593" className={active === 'dealer' ? 'term-shape-active' : ''} />
    <path d="M249 176 257 129Q264 105 286 110L310 134 334 110Q356 105 363 129L371 176Z" fill="#3b545a" className={active === 'dealer' ? 'term-shape-active' : ''} />
    <path d="M77 177Q310 129 543 177L565 267Q310 304 55 267Z" fill="#263c35" stroke="#728774" strokeWidth="7" className={active === 'table' ? 'term-shape-active' : ''} />
    <path d="M267 135 243 180 282 204" stroke="#839593" strokeWidth="18" fill="none" strokeLinecap="round" />
    <path d={pose === 'REDO' ? 'M351 135 385 172 444 186' : 'M351 135 377 180 338 204'} stroke="#839593" strokeWidth="18" fill="none" strokeLinecap="round" />
    <path d="M429 176 475 166 498 199 447 214Z" fill="#657887" stroke="#b0c0c8" strokeWidth="2" className={active === 'shoe' ? 'term-shape-active' : ''} />
    <rect x="304" y="227" width="24" height="34" rx="3" fill="#dce4d7" transform="rotate(10 316 244)" className={active === 'card' ? 'term-shape-active' : ''} />
    {[[352, 65, '1'], [121, 213, '2'], [510, 175, '3'], [347, 248, '4']].map(([x, y, number]) => <g key={number}>
      <circle cx={x} cy={y} r="13" fill="#d4e8b4" /><text x={x} y={Number(y) + 4} textAnchor="middle" fill="#1b2a18" fontSize="12" fontWeight="700">{number}</text>
    </g>)}
    <text x="26" y="29" fill="#a6b8c6" fontSize="12">SCHEMATISK BILD</text>
    <text x="593" y="29" fill="#d4e8b4" fontSize="12" textAnchor="end">{pose}</text>
  </svg>;
}

export default function TerminologyOverlay({ selectedPath }: { selectedPath?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [view, setView] = useState<View>('explore');
  const [name, setName] = useState('Johan');
  const [activeTerm, setActiveTerm] = useState('scene');
  const [selectedStep, setSelectedStep] = useState(terminology.steps[1]?.id ?? terminology.steps[0].id);
  const [poseEnd, setPoseEnd] = useState(false);
  const [query, setQuery] = useState('');
  const step = terminology.steps.find(item => item.id === selectedStep) ?? terminology.steps[0];
  const term = terms.get(activeTerm) ?? terminology.terms[0];
  const displayName = name.trim() || 'Johan';
  const fileName = displayName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'exempel';
  const chain = terminology.steps.filter(item => item.id !== 'single');
  const single = terminology.steps.find(item => item.id === 'single');
  // Main's documented naming guide: idle or posN, with no suffix for the base give.
  // This is an example string, never a file lookup, binding, or export name.
  const destination = step.slot.startsWith('idle.') ? '_idle' : `_pos${Number(step.slot.match(/box(\d+)/)?.[1] ?? 0) + 1}`;
  const suffix = ['idle', 'base'].includes(step.suffix) ? '' : `-${step.suffix}`;
  const filteredTerms = terminology.terms.filter(item => [item.label, ...item.aliases, item.description].join(' ').toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')));

  function chooseStep(item: Step) { setSelectedStep(item.id); setPoseEnd(false); setActiveTerm('clip-card'); }
  function wordButton(id: string, number?: number) {
    return <button type="button" className="term-word-button" aria-pressed={activeTerm === id} onClick={() => setActiveTerm(id)} key={id}>{number && <span>{number}</span>}{label(id)}</button>;
  }
  function stepCard(item: Step, index?: number) {
    return <button type="button" className="term-clip" aria-pressed={selectedStep === item.id} onClick={() => chooseStep(item)}>
      <span className="term-clip-top"><span>{index === undefined ? 'ALTERNATIV' : `STEG ${index + 1}`}</span><span>{item.suffix === 'base' ? 'utan suffix' : item.suffix}</span></span>
      <strong>{item.label}</strong>
      <span className="term-pose-chain"><span>{item.start}</span><span aria-hidden="true">→</span><span>{item.end}</span></span>
      <small>Ingen film kopplad</small>
    </button>;
  }

  return <>
    <button type="button" className="term-trigger" aria-haspopup="dialog" onClick={() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 10V6.5H14M6.5 14v3.5H10" /></svg>
      Ord &amp; schema
    </button>
    <dialog className="term-overlay" ref={dialog} aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-intro`}>
      <header className="term-header"><div><span className="term-kicker">STUDIONS BEGREPPSKARTA</span><h2 id={`${uid}-title`}>Ord &amp; schema</h2><p id={`${uid}-intro`}>Klicka på en del och se vad den betyder — från scen till klippfil.</p></div><button type="button" className="term-close" autoFocus onClick={() => dialog.current?.close()} aria-label="Stäng Ord & schema">Stäng <span aria-hidden="true">×</span></button></header>
      <div className="term-body">
        {view !== 'clips' && view !== 'progress' && <div className="term-example"><div><strong><span aria-hidden="true">◌</span> Exempel – ingen film kopplad</strong><p>Utforska med ett namn. Ingen riktig dealer skapas och inget material ändras.</p></div><label htmlFor={`${uid}-name`}>Exempelnamn<input id={`${uid}-name`} value={name} maxLength={40} onChange={event => setName(event.target.value)} placeholder="Johan" autoComplete="off" /></label></div>}
        <nav className="term-views" aria-label="Välj begreppsvy">{views.map(item => <button type="button" key={item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>

        {view === 'explore' && <div className="term-explore">
          <div className="term-explore-main">
            <section className="term-panel"><div className="term-section-heading"><div><span className="term-kicker">01 / SCENENS DELAR</span><h3>{displayName} i en exempelscen</h3></div>{wordButton('scene')}</div>
              <SceneDrawing name={displayName} pose={poseEnd ? step.end : step.start} active={activeTerm} />
              <div className="term-hotspots">{['dealer', 'table', 'shoe', 'card'].map((id, index) => wordButton(id, index + 1))}</div>
              <div className="term-pose-controls" role="group" aria-label="Visa schematisk pose"><span>För valt klipp:</span><button type="button" aria-pressed={!poseEnd} onClick={() => { setPoseEnd(false); setActiveTerm(step.start.toLowerCase()); }}>Start · {step.start}</button><button type="button" aria-pressed={poseEnd} onClick={() => { setPoseEnd(true); setActiveTerm(step.end.toLowerCase()); }}>Slut · {step.end}</button></div>
              <p className="term-caption">Illustrationen visar begrepp. Den visar inte uppmätt geometri, riktig film eller verifierade rörelser.</p>
              <div className="term-related">{['anchor', 'calibration', 'plane'].map(id => wordButton(id))}</div>
            </section>

            <section className="term-panel"><div className="term-section-heading"><div><span className="term-kicker">02 / FRÅN VILA TILL VILA</span><h3>En exempelordning för vanliga giv</h3></div>{wordButton('sequence')}</div><p className="term-caption">Utgår från Mains begrepp. Välj ett klippkort för att undersöka fack, filnamn och anslutningsposer.</p>
              <ol className="term-sequence">{chain.map((item, index) => <li key={item.id}>{stepCard(item, index)}</li>)}</ol>
              {single && <div className="term-single">{stepCard(single)}<p>En enstaka giv kan gå från VILA tillbaka till VILA i ett klipp. Den visas som alternativ till givkedjan ovan.</p></div>}
              <p className="term-caption">Matchande posnamn räcker inte för att klippen ska passa ihop. Filmer, ankare och timing behöver granskas. Dolt kort och vändning har egna kontrakt.</p>
            </section>

            <section className="term-panel term-file-panel"><div className="term-section-heading"><div><span className="term-kicker">03 / UNDERSÖK VALT KLIPP</span><h3>{step.label}</h3></div>{wordButton('clip-card')}</div>
              <div className="term-slot-row"><button type="button" onClick={() => setActiveTerm('slot')}>{label('slot')}</button><code>{step.slot}</code><span>Ingen fil bunden</span></div>
              <div className="term-filename"><span>Exempelfilnamn enligt Main</span><div aria-label={`Exempelfilnamn: ${fileName}${destination}${suffix}.mp4`}><button type="button" aria-label={`Dealer i filnamnet: ${fileName}`} onClick={() => setActiveTerm('dealer')}>{fileName}</button><button type="button" aria-label={`Fack i filnamnet: ${destination}`} onClick={() => setActiveTerm('slot')}>{destination}</button>{suffix && <button type="button" aria-label={`Givsuffix i filnamnet: ${step.suffix}`} onClick={() => setActiveTerm('suffix')}>{suffix}</button>}<button type="button" aria-label="Filändelsen mp4, läs om material" onClick={() => setActiveTerm('material')}>.mp4</button></div></div>
              <p className="term-caption">Ett namnförslag, inte en existerande eller godkänd film. Klicka på filnamnets delar. {step.suffix === 'base' && 'Base skrivs utan suffix i detta filnamn.'}</p>
              <div className="term-related">{['suffix', 'recipe', 'take', 'idle', 'base', 'variant', 'policy'].map(id => wordButton(id))}</div>
            </section>
          </div>
          <TermDetail term={term} name={displayName} />
        </div>}

        {view === 'compare' && <section className="term-comparison"><div className="term-section-heading"><div><span className="term-kicker">TRE SEPARATA SPÅR</span><h3>Samma ord betyder inte samma leverans</h3></div></div><p>Jämförelsen gäller källsystemens underlag. {displayName} har ingen kopplad film i något av exemplen.</p>
          <div className="term-table-scroll" role="region" aria-label="Systemjämförelse, rulla i sidled på liten skärm" tabIndex={0}><table><caption>Format, bildfrekvens och vad som faktiskt är belagt</caption><thead><tr><th scope="col">System</th><th scope="col">Bildplan</th><th scope="col">Bildfrekvens</th><th scope="col">Status och viktiga skillnader</th></tr></thead><tbody>{terminology.systems.map(system => <tr key={system.id}><th scope="row">{system.label}</th><td>{system.plane}</td><td><span className="term-fps">{system.fps}</span> fps</td><td><strong>{exampleText(system.status, displayName)}</strong><p>{system.note}</p></td></tr>)}</tbody></table></div>
          <div className="term-warning"><strong>Ingen automatisk översättning mellan bankerna</strong><p>Liknande anslutningsposer bevisar inte samma timing eller kalibrering. En geometrireferens bevisar inte att en motsvarande film finns.</p></div>
          <div className="term-compare-definitions"><div><h3>Undersök en skillnad</h3><div className="term-related">{['suffix', 'plane', 'fit', 'calibration', 'tier', 'unknown-names'].map(id => wordButton(id))}</div></div><TermDetail term={term} name={displayName} /></div>
        </section>}

        {view === 'words' && <section className="term-words"><div className="term-word-list"><label htmlFor={`${uid}-search`}>Sök ord, äldre namn eller förklaring<input id={`${uid}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Till exempel: keystone, operator, VILA" /></label><p className="term-caption" role="status">{filteredTerms.length} av {terminology.terms.length} begrepp</p><div className="term-search-results">{filteredTerms.map(item => <button type="button" key={item.id} aria-pressed={activeTerm === item.id} onClick={() => setActiveTerm(item.id)}><strong>{item.label}</strong><small>{item.aliases.join(' · ')}</small><span>{statusLabels[item.status] ?? item.status}</span></button>)}{filteredTerms.length === 0 && <p>Inget begrepp matchar. Prova ett kortare ord eller ett äldre namn.</p>}</div></div><TermDetail term={term} name={displayName} /></section>}

        {view === 'clips' && <ClipAuditView selectedPath={selectedPath} />}
        {view === 'progress' && <ProductionProgress />}
        <footer className="term-footer"><span>Gemensamt underlag · kontrollerat {terminology.verifiedAt}</span><details><summary>Källor och revision</summary><code>{terminology.sourceRevision}</code><ul>{terminology.sources.map(source => <li key={source}>{source}</li>)}</ul></details></footer>
      </div>
    </dialog>
  </>;
}
