'use client';

import { useEffect, useRef, useState } from 'react';

export type ProofKeyFrame = { frame: number; label: string; description: string };
export type ProofComparison = {
  before: string; after: string; source: string; frames: number; fps: number;
  startSourceFrame?: number;
  title?: string;
  description?: string;
  /** Zero-based frame numbers in the source, not offsets within the excerpt. */
  keyFrames?: ProofKeyFrame[];
};

export type PamelaProofReport = {
  title: string;
  status: string;
  limitations: string[];
  contact?: ProofComparison;
  shoe?: ProofComparison;
  sequence?: { native: string; portrait: string; frames: number; fps: number; seams: Array<{ atSeconds: number; label: string }> };
  evidence?: { sheet: string; shoeSheet?: string; shadowSheet?: string };
  seatPilot?: { seats: Array<{ seat: number; status: string; file?: string; review?: string }>; budgetNote: string };
  shadowCandidate?: { image: string; description: string };
};

const RELEASE_FRAMES: ProofKeyFrame[] = [
  { frame: 117, label: 'Övre K och vänster kant', description: 'Titta på övre K och vänster kortkant. Före tappar det övre K-indexet; Efter behåller tryckets placering. Växla till ruta 118 och följ samma detaljer.' },
  { frame: 118, label: 'Konturen vid släppet', description: 'Växla mellan 117 och 118: Före byter kortets kontur och tryckets placering. Efter behåller den rundade papperskonturen när fingrarna lämnar. Greppet på ruta 115–116 är inte därmed godkänt.' },
];
const SHOE_FRAMES: ProofKeyFrame[] = [39, 54, 78, 84].map(frame => ({ frame, label: 'Skons kontakt', description: 'Jämför skons öppning och framkant i de två utsnitten. Kontrollera även kanten där hand och kort passerar framför skon.' }));

// Only local run artifacts can become media URLs, never arbitrary URLs or paths.
function fileUrl(file: string) {
  const parts = file.replaceAll('\\', '/').split('/');
  if (parts[0] !== 'runs' || parts.some(part => !part || part === '.' || part === '..')) return undefined;
  return '/files/' + parts.map(encodeURIComponent).join('/');
}

const CSS = `
.pp{color:#e9edf3;background:#11151c;min-height:100vh;padding:32px clamp(16px,4vw,56px);font:15px/1.5 system-ui,sans-serif}
.pp *{box-sizing:border-box}.pp a{color:#adc7ff}.pp main{max-width:1450px;margin:auto}.pp h1{font-size:clamp(26px,3vw,40px);letter-spacing:-.035em;margin:8px 0}.pp h2{font-size:21px;margin:0}.pp p{color:#bac3d1}.pp .pp-eyebrow{color:#94b4ed;font-size:12px;letter-spacing:.12em;text-transform:uppercase}.pp .pp-status{display:inline-block;border:1px solid #4c5c73;border-radius:20px;padding:3px 12px;margin:8px 0}.pp section{border:1px solid #303a48;border-radius:16px;background:#191f28;margin:24px 0;padding:22px}.pp .pp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.pp .pp-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}.pp figure{margin:0;min-width:0}.pp figcaption{margin-bottom:8px;font-weight:650}.pp video{display:block;width:100%;max-height:65vh;background:#090c11;border:1px solid #384454;border-radius:9px;object-fit:contain}.pp .pp-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pp button{font:inherit;color:#edf2fa;background:#263245;border:1px solid #52617a;border-radius:7px;padding:8px 13px;cursor:pointer}.pp button:hover{background:#36455e}.pp button[aria-pressed=true]{background:#b8d0fa;color:#15233a;border-color:#b8d0fa}.pp button:disabled{opacity:.4;cursor:default}.pp button:focus-visible,.pp a:focus-visible,.pp input:focus-visible{outline:3px solid #b8d0fa;outline-offset:3px}.pp .pp-timeline{display:flex;gap:14px;align-items:center;margin-top:15px}.pp input[type=range]{flex:1;min-width:60px;accent-color:#a9c6fb}.pp output{font-variant-numeric:tabular-nums;min-width:145px}.pp .pp-note{font-size:13px;color:#aab5c6}.pp .pp-error{color:#ffc0aa}.pp .pp-sequence{margin:16px auto;max-width:1150px}.pp .pp-sequence[data-view=portrait]{max-width:430px}.pp .pp-evidence{max-width:100%;height:auto;display:block;margin-top:16px;border-radius:8px}.pp li+li{margin-top:6px}@media(max-width:700px){.pp{padding:20px 12px}.pp section{padding:14px}.pp .pp-pair{grid-template-columns:1fr}.pp output{min-width:110px;font-size:13px}}
`;

function ComparisonProof({ data: contact, id, title, description, defaultKeyFrames, initialSourceFrame }: {
  data: ProofComparison; id: string; title: string; description: string; defaultKeyFrames: ProofKeyFrame[]; initialSourceFrame?: number;
}) {
  const maxFrame = Math.max(0, contact.frames - 1);
  const sourceStart = contact.startSourceFrame ?? 0;
  const keyFrames = (contact.keyFrames ?? defaultKeyFrames).filter(key => key.frame >= sourceStart && key.frame <= sourceStart + maxFrame);
  const initialFrame = initialSourceFrame !== undefined && initialSourceFrame >= sourceStart && initialSourceFrame <= sourceStart + maxFrame
    ? initialSourceFrame - sourceStart : keyFrames.length ? keyFrames[0].frame - sourceStart : 0;
  const before = useRef<HTMLVideoElement>(null);
  const after = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const [loaded, setLoaded] = useState({ before: false, after: false });
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(initialFrame);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  const ready = loaded.before && loaded.after && !error;
  const activeKeyFrame = keyFrames.find(key => key.frame === sourceStart + frame);
  const frameLabel = contact.startSourceFrame === undefined ? `Ruta ${frame}` : `Källruta ${sourceStart + frame}`;
  const pause = () => { before.current?.pause(); after.current?.pause(); setPlaying(false); };
  const seek = (next: number) => {
    pause();
    const target = Math.min(maxFrame, Math.max(0, next));
    for (const video of [before.current, after.current]) if (video) video.currentTime = (target + 0.1) / contact.fps;
    setFrame(target);
  };
  useEffect(() => {
    mounted.current = true;
    const videos = { before: before.current, after: after.current };
    const initialized = new Set<HTMLVideoElement>();
    const observe = () => {
      for (const video of Object.values(videos)) {
        if (video && video.readyState >= 1 && !video.error && !initialized.has(video)) {
          initialized.add(video);
          video.currentTime = (initialFrame + 0.1) / contact.fps;
        }
      }
      setLoaded({ before: !!videos.before && videos.before.readyState >= 2 && !videos.before.error,
        after: !!videos.after && videos.after.readyState >= 2 && !videos.after.error });
      if (videos.before?.error || videos.after?.error) {
        videos.before?.pause(); videos.after?.pause(); setPlaying(false);
        setError('Ett jämförelseutsnitt kunde inte laddas. Kontrollera provets filer.');
      }
    };
    const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked', 'emptied', 'error'];
    for (const video of Object.values(videos)) for (const event of events) video?.addEventListener(event, observe);
    // Cached videos may finish loading before hydration installs event handlers.
    observe();
    return () => {
      mounted.current = false;
      for (const video of Object.values(videos)) {
        for (const event of events) video?.removeEventListener(event, observe);
        video?.pause();
      }
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let animation = 0;
    const update = () => {
      const a = before.current; const b = after.current;
      if (a && b) {
        setFrame(Math.min(maxFrame, Math.floor(a.currentTime * contact.fps + 0.001)));
        if (Math.abs(a.currentTime - b.currentTime) > 1 / contact.fps) b.currentTime = a.currentTime;
      }
      animation = requestAnimationFrame(update);
    };
    animation = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animation);
  }, [playing, contact.fps, maxFrame]);
  const toggle = async () => {
    if (playing) { pause(); return; }
    const videos = [before.current, after.current];
    if (!videos[0] || !videos[1]) return;
    if (frame >= maxFrame) seek(0);
    else videos[1].currentTime = videos[0].currentTime;
    try {
      for (const video of videos) video!.playbackRate = speed;
      await Promise.all(videos.map(video => video!.play()));
      if (mounted.current) setPlaying(true);
      else for (const video of videos) video?.pause();
    } catch {
      for (const video of videos) video?.pause();
      if (mounted.current) { setPlaying(false); setError('Filmerna kunde inte spelas. Ladda om sidan och kontrollera att båda provfilerna är färdiga.'); }
    }
  };
  const changeSpeed = (value: number) => {
    setSpeed(value);
    for (const video of [before.current, after.current]) if (video) video.playbackRate = value;
  };
  return <section aria-labelledby={id}>
    <h2 id={id}>{contact.title ?? title}</h2>
    <p>{contact.description ?? description}</p>
    <div className="pp-controls" aria-label="Nyckelrutor">
      {keyFrames.map(key => <button key={key.frame} disabled={!ready} aria-pressed={sourceStart + frame === key.frame}
        onClick={() => seek(key.frame - sourceStart)}>Källruta {key.frame} · {key.label}</button>)}
    </div>
    <p><strong>{frameLabel}{!ready && !error ? ' · förbereder bilden' : ''}</strong> — {activeKeyFrame?.description ?? 'Mellan nyckelrutorna: följ samma kort-, hand- eller skokant i båda filmerna. Använd knapparna ovan för den utpekade jämförelsen.'}</p>
    <div className="pp-pair">
      {(['before', 'after'] as const).map(kind => <figure key={kind}>
        <figcaption>{kind === 'before' ? 'Före · befintligt prov' : 'Efter · lokal kandidat'} <span className="pp-note">/ {frameLabel}</span></figcaption>
        <video ref={kind === 'before' ? before : after} src={fileUrl(contact[kind])} preload="auto" muted playsInline
          aria-label={`${contact.title ?? title}: ${kind === 'before' ? 'före ändringen' : 'efter ändringen'}`}
          onEnded={() => { pause(); setFrame(maxFrame); }} />
      </figure>)}
    </div>
    <div className="pp-controls">
      <button disabled={!ready} onClick={() => void toggle()}>{playing ? 'Pausa båda' : 'Spela båda'}</button>
      <button disabled={!ready || frame === 0} onClick={() => seek(frame - 1)}>← En ruta</button>
      <button disabled={!ready || frame === maxFrame} onClick={() => seek(frame + 1)}>En ruta →</button>
      {[1, 0.25].map(value => <button key={value} aria-pressed={speed === value} onClick={() => changeSpeed(value)}>{value === 1 ? '1×' : '0,25×'}</button>)}
    </div>
    <div className="pp-timeline">
      <input aria-label={`Ruta i ${contact.title ?? title}`} type="range" min={0} max={maxFrame} step={1} value={frame} disabled={!ready} onChange={event => seek(Number(event.target.value))} />
      <output>{frameLabel} · {contact.fps} fps</output>
    </div>
    <p className="pp-note">Rutnummer börjar på 0. {fileUrl(contact.source) && <a href={fileUrl(contact.source)}>Öppna källfilen</a>}</p>
    {error && <p className="pp-error" role="alert">{error}</p>}
  </section>;
}

function SequenceProof({ sequence }: { sequence: NonNullable<PamelaProofReport['sequence']> }) {
  const [view, setView] = useState<'native' | 'portrait'>('native');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const resumeTime = useRef(0);
  useEffect(() => {
    const current = video.current;
    if (!current) return;
    setReady(false); setPlaying(false);
    const update = () => {
      setTime(current.currentTime);
      setPlaying(!current.paused && !current.ended);
      setReady(current.readyState >= 1 && !current.error);
      if (current.error) setError('Sekvensen kunde inte laddas. Kontrollera att provfilen är färdig.');
    };
    const restore = () => {
      if (current.readyState >= 1) current.currentTime = Math.min(resumeTime.current, Math.max(0, current.duration - 1 / sequence.fps));
      update();
    };
    const events = ['timeupdate', 'seeked', 'play', 'pause', 'ended', 'canplay', 'emptied', 'error'];
    for (const event of events) current.addEventListener(event, update);
    current.addEventListener('loadedmetadata', restore);
    restore();
    return () => {
      for (const event of events) current.removeEventListener(event, update);
      current.removeEventListener('loadedmetadata', restore);
      current.pause();
    };
  }, [view, sequence.fps, sequence.native, sequence.portrait]);
  const toggle = async () => {
    const current = video.current;
    if (!current) return;
    if (!current.paused) { current.pause(); return; }
    try { await current.play(); }
    catch { if (video.current === current) setError('Sekvensen kunde inte startas. Ladda om provet och försök igen.'); }
  };
  return <section aria-labelledby="pp-sequence">
    <div className="pp-head"><h2 id="pp-sequence">Vila → givning → vila</h2><div className="pp-controls">
      {(['native', 'portrait'] as const).map(format => <button key={format} aria-pressed={view === format} onClick={() => {
        resumeTime.current = video.current?.currentTime ?? 0; video.current?.pause(); setError(''); setView(format);
      }}>{format === 'native' ? 'Liggande' : 'Porträtt'}</button>)}
    </div></div>
    <p>Sammanhängande lokalt kandidatprov. Sekvensen är inte en godkänd dealerbank.</p>
    <div className="pp-sequence" data-view={view}><video ref={video} key={view} src={fileUrl(sequence[view])} controls playsInline preload="metadata"
      aria-label="Sammanhängande vila, givning och vila" /></div>
    <div className="pp-controls"><button disabled={!ready || !!error} onClick={() => void toggle()}>{playing ? 'Pausa sekvens' : 'Spela sekvens'}</button>
      <output aria-label="Sekvensens position">Ruta {Math.min(sequence.frames - 1, Math.floor(time * sequence.fps + 0.001))} / {sequence.frames - 1} · {time.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s</output>
    </div>
    <div className="pp-controls">{sequence.seams.map((seam, index) => <button disabled={!ready} key={`${seam.atSeconds}-${index}`} onClick={() => {
      if (video.current) { video.current.pause(); video.current.currentTime = seam.atSeconds; }
    }}>{seam.label} · {seam.atSeconds.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} s</button>)}</div>
    <p className="pp-note">{sequence.frames} rutor · {sequence.fps} fps · {(sequence.frames / sequence.fps).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} sekunder</p>
    {error && <p className="pp-error" role="alert">{error}</p>}
  </section>;
}

export default function PamelaProofClient({ report }: { report: PamelaProofReport | null }) {
  return <div className="pp"><style>{CSS}</style><main>
    <nav><a href="/studio">← Till studion</a> · <a href="/pamela-prov?view=motion">VILA, REDO och sju platser</a> · <a href="/pamela-prov?view=scene">Bord, ljus och panorering</a></nav>
    <header><p className="pp-eyebrow">Pamela / lokalt granskningsprov</p><h1>{report?.title ?? 'Före och efter · Pamela'}</h1>
      <span className="pp-status">{report?.status ?? 'Väntar på provmaterial'}</span>
      <p>Jämför kortets väg ur skon, släppet och den mindre skuggan. Granska sedan hela rörelsekedjan.</p>
      <nav>{report?.shoe && <><a href="#pp-shoe">Skon och vridningen</a> · </>}<a href="#pp-contact">Släpp och skugga</a> · <a href="#pp-sequence">Hela sekvensen</a></nav></header>
    {!report && <section><h2>Provet förbereds</h2><p>Den lokala rapporten är inte färdig ännu. Ladda om sidan när materialet är klart.</p><a href="/pamela-prov">Ladda om provet</a></section>}
    {report?.seatPilot && <section id="pp-seats"><h2>Filmer till sju spelplatser</h2>
      <p>Ytterplatserna 1 och 7 provas som varsin 12-sekunders råtagning: REDO → en givning → REDO. Därefter väljs klippunkter i verkliga bildrutor. VILA → REDO är en separat övergång.</p>
      <div className="pp-controls">{report.seatPilot.seats.map(seat => <span className="pp-status" key={seat.seat}>Plats {seat.seat}: {seat.status}</span>)}</div>
      <p className="pp-note">{report.seatPilot.budgetNote} Råfilmer är kandidater; green screen, kortmaterial och exakta landningspunkter är inte färdiga scener.</p>
      {report.seatPilot.seats.filter(seat=>seat.file).map(seat=><details key={seat.seat} open><summary>Plats {seat.seat} · råfilm</summary><video src={fileUrl(seat.file!)} controls playsInline preload="metadata" style={{width:'100%',maxHeight:'65vh'}} aria-label={`Råfilm plats ${seat.seat}`} />{seat.review&&<p>{seat.review}</p>}<a href={fileUrl(seat.file!)} download>Ladda ned originalet för plats {seat.seat}</a></details>)}
      <p><a href="/pamela-prov#pp-seats">Ladda om filmstatus</a></p>
    </section>}
    {report?.shoe && <ComparisonProof key={`shoe:${report.shoe.before}:${report.shoe.after}:${report.shoe.startSourceFrame}`} data={report.shoe}
      id="pp-shoe" title="Kortsko · före och efter" defaultKeyFrames={SHOE_FRAMES}
      description="Granska skons öppning, framkant och mötet med hand och kort. Nyckelrutorna visar de utpekade delarna av rörelsen; samma transport styr båda utsnitten." />}
    {report?.contact && <ComparisonProof key={`contact:${report.contact.before}:${report.contact.after}:${report.contact.startSourceFrame}`} data={report.contact}
      id="pp-contact" title="Kortsläpp · före och efter" defaultKeyFrames={RELEASE_FRAMES} initialSourceFrame={117}
      description="Titta på övre K och vänster kortkant när du växlar mellan källruta 117 och 118. Efter-provet behåller kortets kontur och tryckplacering vid släppet och har en smalare kontaktskugga. På en tidigare ruta, som 99, är skillnaden liten. Jämför nyckelrutorna först och spela sedan i 0,25×." />}
    {report?.evidence?.shadowSheet && fileUrl(report.evidence.shadowSheet) && <section><h2>Mindre kontaktskugga</h2><p>Vänster: tidigare bred skugga. Mitten: ny smal skugga. Höger: jämförelse helt utan tillagd skugga. Den tunna papperskanten är kvar.</p><img className="pp-evidence" src={fileUrl(report.evidence.shadowSheet)} alt="Tidigare, mindre och ingen tillagd kontaktskugga" /></section>}
    {report?.shadowCandidate && <section><h2>Nytt skuggprov · endast mellan korten</h2><p>{report.shadowCandidate.description}</p><img src={fileUrl(report.shadowCandidate.image)} alt="V6, skugga endast på underkortet, samt ingen tillagd skugga" style={{maxWidth:'100%',height:'auto'}} /></section>}
    {report?.sequence && <SequenceProof sequence={report.sequence} />}
    {!!report?.limitations?.length && <section><h2>Kvarvarande begränsningar</h2><ul>{report.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
    {report?.evidence?.sheet && fileUrl(report.evidence.sheet) && <section><h2>Bildbevis</h2><p className="pp-note">Öppna kontaktarket för att granska det i full storlek.</p><a href={fileUrl(report.evidence.sheet)}><img className="pp-evidence" src={fileUrl(report.evidence.sheet)} alt="Kontaktark för Pamelas lokala före- och efterprov" loading="lazy" /></a></section>}
    <p className="pp-note">Lokal kandidat · granskning av presentation och övergångar.</p>
  </main></div>;
}
