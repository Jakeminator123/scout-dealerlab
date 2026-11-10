'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { clampFrame, frameAtTime, resolveCompositionView, type CompositionFormat, type PamelaCompositionReviewProps } from './model.ts';
import { compositionStyles } from './styles.ts';

const glossary = [
  ['Ankare', 'En bestämd start- eller slutpose, till exempel VILA eller REDO. Två klipp måste mötas i samma pose för att övergången ska hålla.'],
  ['Skarv', 'Rutan där ett källklipp övergår i nästa. Granska ansikte, ljus, kropp och händer precis före och efter.'],
  ['Kortspår', 'Kortets synliga position och form ruta för ruta. Dolda hörn är fortfarande omätta i detta prov.'],
  ['Handmask', 'Beskriver vilka delar av handen som ska ligga framför kortet. Den nuvarande synlighetsmasken är inte en fullständig handmask.'],
  ['Lager', 'Rum, bord, dealer och kort som sätts samman till bilden. I den här granskningsfilmen är de redan sammanrenderade.'],
  ['Kort 2 / placering', 'Ett återanvänt givklipp har samma landningspunkt. Placering bredvid eller med halvöverlapp är en separat maskpilot tills en handrörelse för den placeringen är belagd.'],
] as const;
const defaultPresentationNotes = ['Det centrala givklippet återanvänds. Granska kortets landningspunkt och kontakten med bordet för varje givning.'];

function Icon({ kind }: { kind: 'play' | 'pause' | 'back' | 'forward' | 'restart' | 'lock' }) {
  const paths = {
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="4" /></>,
    back: <><path d="M6 5v14m12-14L8 12l10 7Z" /></>,
    forward: <><path d="M18 5v14M6 5l10 7-10 7Z" /></>,
    restart: <><path d="M4 9a8 8 0 1 1 0 6M4 4v5h5" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function PamelaCompositionReview({ sources, metadata, seams, stages, limitations = [], evidence = [], presentationNotes = defaultPresentationNotes, backHref = '/#aktuellt', nodeMapHref }: PamelaCompositionReviewProps) {
  const uid = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const restoreRef = useRef<{ frame: number; playing: boolean } | null>(null);
  const [sourceId, setSourceId] = useState(sources[0]?.id);
  const [format, setFormat] = useState<CompositionFormat>('native');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  const [presentedFrame, setPresentedFrame] = useState(false);
  const source = sources.find(item => item.id === sourceId) ?? sources[0];
  const view = source ? resolveCompositionView(source, metadata, format) : null;
  const { fps, frameCount } = metadata;
  const width = view?.width ?? metadata.width;
  const height = view?.height ?? metadata.height;
  const validMetadata = width > 0 && height > 0 && fps > 0 && Number.isFinite(fps) && frameCount > 0;
  const duration = validMetadata ? frameCount / fps : 0;
  const activeStage = stages.find(stage => frame >= stage.from && frame <= stage.to);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !validMetadata) return;
    let callback = 0;
    let disposed = false;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const update = (_now: number, data: VideoFrameCallbackMetadata) => {
        if (disposed) return;
        setFrame(frameAtTime(data.mediaTime, fps, frameCount));
        setPresentedFrame(true);
        callback = video.requestVideoFrameCallback(update);
      };
      callback = video.requestVideoFrameCallback(update);
    }
    return () => {
      disposed = true;
      if (callback) video.cancelVideoFrameCallback(callback);
    };
  }, [source?.id, view?.src, fps, frameCount, validMetadata]);

  async function play(video = videoRef.current) {
    if (!video) return;
    try { await video.play(); setError(''); }
    catch { setError('Uppspelningen kunde inte starta. Prova filmens egen spelknapp eller öppna originalfilen nedan.'); }
  }

  function seek(target: number, resume = false) {
    const video = videoRef.current;
    if (!video || !validMetadata) return;
    const nextFrame = clampFrame(target, frameCount);
    video.pause();
    setFrame(nextFrame);
    if (video.readyState < 1) { restoreRef.current = { frame: nextFrame, playing: resume }; return; }
    // Seek inside the requested frame: encoded duration rounding can otherwise
    // select the preceding frame, particularly when restoring the last frame.
    video.currentTime = (nextFrame + 0.5) / fps;
    if (resume) void play(video);
  }

  function prepareVideoChange() {
    const video = videoRef.current;
    if (!restoreRef.current) restoreRef.current = { frame: video ? frameAtTime(video.currentTime, fps, frameCount) : frame, playing: video ? !video.paused : playing };
    video?.pause();
    setReady(false);
    setPresentedFrame(false);
    setError('');
  }

  function changeSource(nextId: string) {
    if (nextId === source.id) return;
    const nextSource = sources.find(item => item.id === nextId);
    if (!nextSource) return;
    prepareVideoChange();
    if (!resolveCompositionView(nextSource, metadata, format).mobileAvailable) setFormat('native');
    setSourceId(nextId);
  }

  function changeFormat(nextFormat: CompositionFormat) {
    if (nextFormat === view?.format || (nextFormat === 'mobile' && !view?.mobileAvailable)) return;
    prepareVideoChange();
    setFormat(nextFormat);
  }

  function onLoaded() {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    const restore = restoreRef.current;
    restoreRef.current = null;
    if (restore) {
      video.currentTime = Math.min((clampFrame(restore.frame, frameCount) + 0.5) / fps, Math.max(0, video.duration - 0.5 / fps));
      setFrame(frameAtTime(video.currentTime, fps, frameCount));
      if (restore.playing) void play(video);
    }
    setReady(true);
  }

  if (!source || !view || !validMetadata) return <main className="pc-review pc-empty"><style>{compositionStyles}</style><h1>Kompositionen saknar underlag</h1><p>En film och giltiga bildmått, fps och bildruteantal behövs för granskningen.</p></main>;

  return <main className="pc-review">
    <style>{compositionStyles}</style>
    <div className="pc-shell">
      <header className="pc-topbar">
        <a className="pc-brand" href={backHref}>DEALERLAB <small>Kompositionsstudion</small></a>
        <nav className="pc-nav" aria-label="Granskningsnavigation"><a href={backHref}>Översikt</a>{nodeMapHref && <a href={nodeMapHref}>Nodkarta ↗</a>}</nav>
      </header>
      <section className="pc-heading" aria-labelledby={`${uid}-title`}>
        <div><span className="pc-eyebrow">Pamela / rörelseprov 01</span><h1 id={`${uid}-title`}>Två givningar. Tillbaka till vila.</h1><p>Följ hela rörelsen, jämför originalkedjan och granska de tre skarvarna.</p></div>
        <span className="pc-status">Kandidat · inte produktionsgodkänd</span>
      </section>

      <div className="pc-layout">
        <div>
          <section className="pc-player" aria-label="Film och granskningskontroller">
            <div className="pc-stage-wrap"><div className="pc-viewport" data-format={view.format} style={{ aspectRatio: `${width} / ${height}` } as CSSProperties}>
              <video key={source.id + view.src} ref={videoRef} src={view.src} poster={view.poster} width={width} height={height} controls playsInline preload="metadata" aria-label={`${source.label}: Pamela, två centrala givningar och återgång`} onLoadedMetadata={onLoaded}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setFrame(frameCount - 1); }}
                onTimeUpdate={event => { if (!presentedFrame) setFrame(frameAtTime(event.currentTarget.currentTime, fps, frameCount)); }}
                onError={() => { setReady(false); setPlaying(false); setError('Filmen kunde inte läsas. Kontrollera att granskningsfilen är tillgänglig via länken i underlaget.'); }} />
            </div></div>
            <div className="pc-video-caption"><strong>{source.description}</strong><span>{width} × {height} · {fps} fps · {frameCount} rutor</span></div>
            <div className="pc-playerbar">
              <div className="pc-switch" role="group" aria-label="Välj granskningsfilm">{sources.map(item => <button type="button" key={item.id} aria-pressed={source.id === item.id} onClick={() => changeSource(item.id)}>{item.label}</button>)}</div>
              <div className="pc-switch" role="group" aria-label="Filmformat"><button type="button" aria-pressed={view.format === 'native'} onClick={() => changeFormat('native')}>Desktop · originalformat</button><button type="button" aria-pressed={view.format === 'mobile'} disabled={!view.mobileAvailable} title={view.mobileAvailable ? 'Visa separat stående film' : 'Separat stående film saknas för denna källa'} onClick={() => changeFormat('mobile')}>Mobil · stående{!view.mobileAvailable ? ' · saknas' : ''}</button></div>
            </div>
            {error && <p role="alert" className="pc-error">{error}</p>}
            <div className="pc-controls">
              <div className="pc-transport">
                <button type="button" className="pc-btn pc-btn-primary" disabled={!ready} onClick={() => playing ? videoRef.current?.pause() : void play()}><Icon kind={playing ? 'pause' : 'play'} />{playing ? 'Pausa' : 'Spela'}</button>
                <button type="button" className="pc-btn" disabled={!ready} onClick={() => seek(0)} aria-label="Till första rutan" title="Till början"><Icon kind="restart" /></button>
                <button type="button" className="pc-btn" disabled={!ready || frame === 0} onClick={() => seek(frame - 1)} aria-label="Föregående bildruta" title="Föregående bildruta"><Icon kind="back" /></button>
                <button type="button" className="pc-btn" disabled={!ready || frame >= frameCount - 1} onClick={() => seek(frame + 1)} aria-label="Nästa bildruta" title="Nästa bildruta"><Icon kind="forward" /></button>
                <output className="pc-time"><strong>{(frame / fps).toFixed(2).replace('.', ',')} s</strong> / {duration.toFixed(2).replace('.', ',')} s</output>
                <label className="pc-speed">Tempo <select value={speed} onChange={event => { const rate = Number(event.target.value); setSpeed(rate); if (videoRef.current) videoRef.current.playbackRate = rate; }}><option value={0.25}>0,25×</option><option value={0.5}>0,5×</option><option value={1}>1×</option></select></label>
              </div>
              <label htmlFor={`${uid}-seek`} className="pc-slider-label"><span>{activeStage?.label ?? 'Rörelsekedjan'}</span><span>{presentedFrame ? 'Ruta' : 'Cirka ruta'} {frame} / {frameCount - 1}</span></label>
              <div className="pc-timeline"><input id={`${uid}-seek`} type="range" min={0} max={frameCount - 1} step={1} value={frame} disabled={!ready} aria-valuetext={`Ruta ${frame}, ${(frame / fps).toFixed(2)} sekunder`} onChange={event => seek(Number(event.target.value))} /><div className="pc-markers" aria-hidden="true">{seams.map(seam => <span className="pc-marker" key={seam.frame} style={{ left: `${seam.frame / Math.max(1, frameCount - 1) * 100}%` }} />)}</div></div>
              <div className="pc-stages" role="group" aria-label="Delar i rörelsekedjan">{stages.map(stage => <button type="button" key={stage.from} className="pc-stage" style={{ flexGrow: stage.to - stage.from + 1 }} aria-current={activeStage === stage ? 'step' : undefined} disabled={!ready} title={`${stage.detail} · ruta ${stage.from}–${stage.to}`} onClick={() => seek(stage.from)}>{stage.label}</button>)}</div>
            </div>
          </section>
          <p className="pc-format-note">{view.format === 'mobile' ? 'Separat stående film i sitt naturliga format.' : 'Desktop visar filmens naturliga format.'} Ingen automatisk zoom eller beskärning i spelaren.{!view.mobileAvailable ? ' Stående film saknas för den valda källan.' : ''}</p>
        </div>

        <section className="pc-below" aria-label="Skarvar och granskningsfrågor">
          <section className="pc-card"><div className="pc-card-heading"><h2>Granska skarvarna</h2><span className="pc-count">{seams.length}</span></div><p className="pc-card-intro">Se övergången i rörelse eller stanna på första rutan efter skarven.</p>
            <div className="pc-seam-grid">{seams.map((seam, index) => <div className="pc-seam" key={seam.frame}><div className="pc-seam-head"><span className="pc-seam-number">{index + 1}</span><strong>{seam.label}</strong></div><p>{seam.description}<br />Ruta {seam.frame} · {(seam.frame / fps).toFixed(2).replace('.', ',')} s</p><div className="pc-seam-actions"><button type="button" className="pc-btn" disabled={!ready} onClick={() => seek(seam.frame - Math.round(fps * 0.5), true)}><Icon kind="play" />Se skarven</button><button type="button" className="pc-btn" disabled={!ready} onClick={() => seek(seam.frame)}>Ruta {seam.frame}</button></div></div>)}</div>
          </section>
          <section className="pc-card"><h2>Tre saker att bedöma</h2><ul className="pc-checklist"><li>Håller händer, kropp och sko kontakten med bordet?</li><li>Följer korttrycket greppet och ligger båda korten kvar?</li><li>Håller ansikte, ljus och pose genom skarvarna?</li></ul></section>
        </section>
      </div>

      <div className="pc-explainer">
        <section className="pc-card"><span className="pc-eyebrow">Förloppet i ord</span><h2>En rörelsekedja, två givningar</h2><div className="pc-flow" aria-label="Vila till redo, givning, redo och tillbaka till vila"><span className="pc-pose">VILA</span><span className="pc-arrow" aria-hidden="true">→</span><span className="pc-pose">REDO</span><span className="pc-arrow" aria-hidden="true">→</span><span className="pc-pose" data-kind="action">GIV × 2</span><span className="pc-arrow" aria-hidden="true">→</span><span className="pc-pose">REDO</span><span className="pc-arrow" aria-hidden="true">→</span><span className="pc-pose">VILA</span></div>{presentationNotes.map(note => <p className="pc-copy" key={note}>{note}</p>)}<p className="pc-copy">A♠ och K♥ är fasta exempel. Kortvärden, slump och spelregler hör till spelmotorn.</p></section>
        <section className="pc-card"><span className="pc-eyebrow">Liten ordlista</span><h2>Vad granskar vi?</h2><div className="pc-glossary">{glossary.map(([term, definition]) => <details key={term}><summary>{term}</summary><p>{definition}</p></details>)}</div></section>
      </div>

      <details className="pc-evidence"><summary>Originalfiler, filhashar och kvarvarande arbete</summary><div className="pc-evidence-grid"><div><h3>Granskningsunderlag</h3>{sources.map(item => <div key={item.id} className="pc-file"><a href={item.src} target="_blank" rel="noreferrer">{item.label} · originalformat ↗</a><code>SHA-256: {item.sha256 ?? 'okänd'}</code>{item.portraitSrc && <><a href={item.portraitSrc} target="_blank" rel="noreferrer">{item.label} · stående film ↗</a><code>SHA-256: {item.portraitSha256 ?? 'okänd'}</code></>}</div>)}{evidence.length > 0 && <ul>{evidence.map(item => <li key={item.href}><a href={item.href} target="_blank" rel="noreferrer">{item.label} ↗</a></li>)}</ul>}</div><div><h3>Återstår före godkännande</h3><ul>{limitations.map(item => <li key={item}>{item}</li>)}</ul><p className="pc-copy">Bildrutorna räknas från 0. Webbläsarens uppspelning ersätter inte granskning av originalrutorna.</p></div></div></details>
      <footer className="pc-foot">{metadata.snapshot ? `${metadata.snapshot} · ` : ''}{metadata.dealerId} · Läskopia för granskning. Inget spelinnehåll publiceras från den här vyn.</footer>
    </div>
  </main>;
}
