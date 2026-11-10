'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon, type IconName } from './Icons.tsx';
import { clamp, frameAt, INITIAL_TRANSFORM, playbackSnapshot, seekTime, segmentAt, sourceFor, timecode, transformStyle, viewForWidth, VIEW_LABELS, type PlaybackSnapshot, type ViewTransform, type WorkbenchClip, type WorkbenchProps, type WorkbenchView } from './model.ts';

const views: WorkbenchView[] = ['native', 'portrait', 'raw'];
const viewIcons: Record<WorkbenchView, IconName> = { native: 'desktop', portrait: 'portrait', raw: 'raw' };
const seconds = (value: number) => `${Number(value.toFixed(2)).toLocaleString('sv-SE')} s`;
type Drag = { id: number; startX: number; startY: number; x: number; y: number; width: number; height: number };
function availableWidth(element: HTMLElement | null) {
  if (!element) return 1000;
  const style = window.getComputedStyle(element);
  return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

function Rail() {
  return <nav className="sw-rail" aria-label="Studions arbetsytor">
    <a className="sw-mark" href="/" aria-label="Dealerlab, översikt">d.</a>
    <a href="#workbench-scene" aria-current="page" title="Filmstudion" aria-label="Filmstudion"><Icon name="film" /></a>
    <a href="/scenfinish#lager" title="Scenfinish och lager" aria-label="Scenfinish och lager"><Icon name="layers" /></a>
    <a href="/kortmaterial" title="3D-kortmaterial" aria-label="3D-kortmaterial"><Icon name="card" /></a>
    <a href="/nodkarta" title="Nodkarta" aria-label="Nodkarta"><Icon name="nodes" /></a>
    <span className="sw-rail-tail">DEALER LAB / STUDIO</span>
  </nav>;
}

export default function StudioWorkbench(props: WorkbenchProps) {
  if (!props.clips.length) return <div className="sw-app"><Rail /><main className="sw-empty"><h1>Studion väntar på material</h1><p>Ingen film har kopplats till denna version.</p><a href="/">Till granskningsöversikten →</a></main></div>;
  return <WorkbenchSession {...props} />;
}

function WorkbenchSession({ snapshot, clips }: WorkbenchProps) {
  const [clipId, setClipId] = useState(clips[0].id);
  const clip = clips.find(item => item.id === clipId) ?? clips[0];
  const [view, setView] = useState<WorkbenchView>('native');
  const source = sourceFor(clip, view);
  const sourceKey = `${clip.id}:${view}:${source?.url ?? 'missing'}`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const manualView = useRef<WorkbenchView | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const inspectorButton = useRef<HTMLButtonElement>(null);
  const inspectorClose = useRef<HTMLButtonElement>(null);
  const resume = useRef<PlaybackSnapshot>({ time: 0, playing: false });
  const drag = useRef<Drag | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [inspector, setInspector] = useState(false);
  const [transform, setTransform] = useState<ViewTransform>({ ...INITIAL_TRANSFORM });
  const [dragging, setDragging] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const frame = frameAt(time, clip.fps, source?.frameCount ?? 1);
  const activeSegment = source ? segmentAt(clip, frame, source.frameCount) : undefined;
  const ready = loaded && !!source && !error;

  useEffect(() => { setCanFullscreen(Boolean(document.fullscreenEnabled)); }, []);
  useEffect(() => { if (inspector) inspectorClose.current?.focus(); }, [inspector]);
  useLayoutEffect(() => {
    const screen = screenRef.current; if (!screen) return;
    const fitSource = () => {
      if (manualView.current !== null) return;
      const next = viewForWidth(clip, availableWidth(screen));
      if (next === view) return;
      const video = videoRef.current;
      resume.current = playbackSnapshot(video, resume.current);
      setTime(resume.current.time); setLoaded(false); setBuffering(false); setPlaying(false); setError(''); setView(next);
    };
    fitSource(); const observer = new ResizeObserver(fitSource); observer.observe(screen);
    return () => observer.disconnect();
  }, [clip, view]);

  // The browser clock owns playback. React receives at most ten progress updates per
  // second while playing, and exact updates when paused or seeking.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playing) return;
    let request = 0, lastUpdate = -Infinity, disposed = false;
    const tick = (now: number) => {
      if (disposed) return;
      if (now - lastUpdate >= 100) { setTime(video.currentTime); lastUpdate = now; }
      request = window.requestAnimationFrame(tick);
    };
    request = window.requestAnimationFrame(tick);
    return () => { disposed = true; window.cancelAnimationFrame(request); };
  }, [playing, sourceKey]);

  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) { resume.current.playing = false; videoRef.current?.pause(); } };
    const pauseOnExit = () => videoRef.current?.pause();
    document.addEventListener('visibilitychange', pauseWhenHidden);
    window.addEventListener('pagehide', pauseOnExit);
    return () => { document.removeEventListener('visibilitychange', pauseWhenHidden); window.removeEventListener('pagehide', pauseOnExit); };
  }, []);

  function closeInspector() { setInspector(false); inspectorButton.current?.focus(); }
  function clearPlaybackState(next: PlaybackSnapshot) {
    resume.current = next; setTime(next.time); setLoaded(false); setBuffering(false); setPlaying(false); setError('');
  }
  function chooseView(next: WorkbenchView) {
    if (!sourceFor(clip, next)) return;
    manualView.current = next;
    if (next === view) return;
    const video = videoRef.current;
    clearPlaybackState(playbackSnapshot(video, resume.current));
    setNotice(''); setView(next);
  }
  function chooseClip(next: WorkbenchClip) {
    if (next.id === clip.id || !sourceFor(next, 'native')) return;
    clearPlaybackState({ time: 0, playing: false });
    const preferred = manualView.current ?? viewForWidth(next, availableWidth(screenRef.current));
    if (!sourceFor(next, preferred)) { setView('native'); setNotice(`${VIEW_LABELS[preferred]} saknas för ${next.label}. Visar Desktop.`); }
    else { setView(preferred); setNotice(''); }
    setClipId(next.id);
  }
  function onLoaded(video: HTMLVideoElement) {
    if (!source || video !== videoRef.current) return;
    const next = resume.current;
    const actualDuration = Number.isFinite(video.duration) ? video.duration : source.duration;
    const restored = seekTime(next.time, source, clip.fps, actualDuration);
    video.currentTime = restored; video.playbackRate = speed; setTime(restored); setLoaded(true);
    if (next.time > restored + 1 / clip.fps) setNotice('Tiden har begränsats till den här filens sista bildruta.');
    if (video.videoWidth !== source.width || video.videoHeight !== source.height) setNotice(`Filens mått är ${video.videoWidth} × ${video.videoHeight}; underlaget anger ${source.width} × ${source.height}.`);
    if (next.playing && !document.hidden) void video.play().catch(() => { if (video === videoRef.current) { setPlaying(false); setNotice('Tryck på Spela för att fortsätta i det nya formatet.'); } });
    resume.current = { time: restored, playing: false };
  }
  function togglePlay() {
    const video = videoRef.current; if (!video || !ready || !source) return;
    if (!video.paused) { video.pause(); return; }
    if (video.ended || frameAt(video.currentTime, clip.fps, source.frameCount) >= source.frameCount - 1) video.currentTime = 0;
    setNotice(''); void video.play().catch(() => { if (video === videoRef.current) setNotice('Uppspelningen kunde inte starta. Försök igen.'); });
  }
  function seek(value: number) {
    const video = videoRef.current; if (!video || !ready || !source) return;
    video.pause(); const target = seekTime(value, source, clip.fps, video.duration); video.currentTime = target; setTime(target);
  }
  function step(delta: number) { const video = videoRef.current; if (video && source) seek((frameAt(video.currentTime, clip.fps, source.frameCount) + delta) / clip.fps); }
  function resetView() { setTransform({ ...INITIAL_TRANSFORM }); setNotice('2D-visningen är återställd till 100 %.'); }
  function setZoom(value: number) { setTransform(previous => ({ ...previous, zoom: clamp(value, 1, 1.25) })); }
  function setPan(axis: 'x' | 'y', value: number) { setTransform(previous => ({ ...previous, [axis]: clamp(value, -1, 1) })); }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (transform.zoom <= 1 || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: transform.x, y: transform.y, width: bounds.width, height: bounds.height };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current; if (!active || active.id !== event.pointerId) return;
    const margin = (transform.zoom - 1) / 2; if (margin <= 0) return;
    setTransform(previous => ({ ...previous, x: clamp(active.x + (event.clientX - active.startX) / (active.width * margin), -1, 1), y: clamp(active.y + (event.clientY - active.startY) / (active.height * margin), -1, 1) }));
  }
  function endDrag() { drag.current = null; setDragging(false); }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && inspector) { event.preventDefault(); closeInspector(); return; }
    const target = event.target as HTMLElement;
    if (target.closest('button,input,select,a,textarea,[contenteditable=true]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.shiftKey && transform.zoom > 1 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); const axis = ['ArrowLeft','ArrowRight'].includes(event.key) ? 'x' : 'y'; const delta = ['ArrowLeft','ArrowUp'].includes(event.key) ? -0.1 : 0.1; setPan(axis, transform[axis] + delta); return;
    }
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    else if (event.key === 'Home') { event.preventDefault(); seek(0); }
    else if (event.key === 'End' && source) { event.preventDefault(); seek((source.frameCount - 1) / clip.fps); }
  }
  function fullscreen() { const shell = shellRef.current; if (shell?.requestFullscreen) void shell.requestFullscreen().catch(() => setNotice('Helskärm är inte tillgängligt i den här vyn.')); }
  const progress = source && source.frameCount > 1 ? frame / (source.frameCount - 1) * 100 : 0;

  return <div className="sw-app" onKeyDown={keyboard}>
    <Rail />
    <main className="sw-main">
      <header className="sw-header"><div className="sw-brand"><strong>DEALER / STUDIO</strong><span className="sw-divider" /><span>Pamela · Rörelsestudie</span></div><div className="sw-header-actions"><span className="sw-snapshot" title={snapshot}><span className="sw-status-dot" />{snapshot}</span><a className="sw-overview" href="/">Översikt <Icon name="arrow" width="14" height="14" /></a></div></header>
      <section className="sw-workspace" aria-label="Filmstudion">
        <div className="sw-toolbar"><div><p className="sw-kicker">Aktiv sekvens</p><div className="sw-title"><h1>{clip.label}</h1><span className="sw-badge">KANDIDAT</span></div></div><div className="sw-tool-actions"><div className="sw-segmented" role="group" aria-label="Filmformat">
          {views.map(item => { const available = !!sourceFor(clip, item); return <button key={item} type="button" disabled={!available} aria-pressed={view === item} aria-label={`${VIEW_LABELS[item]}${available ? '' : ' saknas för detta klipp'}`} title={available ? VIEW_LABELS[item] : `${VIEW_LABELS[item]} saknas för detta klipp`} onClick={() => chooseView(item)}><Icon name={viewIcons[item]} width="15" height="15" /><span className="sw-view-text">{VIEW_LABELS[item]}</span></button>; })}
        </div><button ref={inspectorButton} className="sw-icon-button sw-panel-toggle" type="button" aria-label="Visa eller dölj inspektör" aria-expanded={inspector} aria-controls="workbench-inspector" title="Inspektör · 2D-visning och källfil" onClick={() => inspector ? closeInspector() : setInspector(true)}><Icon name="sliders" /></button></div></div>
        <div ref={screenRef} className="sw-screen" id="workbench-scene">
          {source ? <div className="sw-video-shell" ref={shellRef} style={{ '--sw-aspect': source.width / source.height } as CSSProperties} tabIndex={0} role="group" aria-label={`${clip.label}, ${VIEW_LABELS[view]}. Mellanslag spelar eller pausar. Piltangenter stegar bildrutor.`} data-zoomed={transform.zoom > 1} data-dragging={dragging} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
            <video key={sourceKey} ref={videoRef} src={source.url} poster={view === 'native' ? clip.poster : undefined} preload="metadata" playsInline muted loop={loop} aria-label={`${clip.label}, ${VIEW_LABELS[view]}`} style={{ transform: transformStyle(transform) }}
              onLoadedMetadata={event => onLoaded(event.currentTarget)} onPlay={() => setPlaying(true)} onPlaying={() => setBuffering(false)} onWaiting={() => setBuffering(true)} onCanPlay={() => setBuffering(false)}
              onPause={event => { setPlaying(false); setTime(event.currentTarget.currentTime); }} onEnded={event => { setPlaying(false); setTime(event.currentTarget.currentTime); }} onSeeked={event => setTime(event.currentTarget.currentTime)}
              onError={() => { setError('Filmen kunde inte läsas. Välj en annan sekvens eller ett tillgängligt format.'); setLoaded(false); setBuffering(false); setPlaying(false); }} />
            {!loaded && !error ? <div className="sw-loading">Läser filmen…</div> : buffering && playing ? <div className="sw-loading">Buffrar…</div> : null}
            {error ? <div className="sw-loading" role="alert">{error}</div> : null}
          </div> : <div className="sw-error" role="alert">Det här formatet saknar en giltig film. Välj ett tillgängligt format.</div>}
          <div className="sw-screen-caption"><span className="sw-status-dot" />{VIEW_LABELS[view]}{source ? ` · ${source.width} × ${source.height}` : ''}{transform.zoom > 1 ? ` · 2D ${Math.round(transform.zoom * 100)} %` : ''}</div>
          {inspector ? <aside className="sw-inspector" id="workbench-inspector" aria-label="Inspektör"><div className="sw-inspector-head"><h2>Inspektör</h2><button ref={inspectorClose} className="sw-icon-button" type="button" aria-label="Stäng inspektör" onClick={closeInspector}><Icon name="close" width="16" height="16" /></button></div><p className="sw-inspector-label">2D-visning</p>
            <label className="sw-control-row" htmlFor="sw-zoom">Visningszoom <output>{Math.round(transform.zoom * 100)} %</output></label><input id="sw-zoom" type="range" min="1" max="1.25" step="0.01" value={transform.zoom} onChange={event => setZoom(Number(event.target.value))} />
            <label className="sw-control-row" htmlFor="sw-pan-x">Förskjutning X <output>{Math.round(transform.x * 100)} %</output></label><input id="sw-pan-x" type="range" min="-1" max="1" step="0.02" value={transform.x} disabled={transform.zoom <= 1} onChange={event => setPan('x', Number(event.target.value))} />
            <label className="sw-control-row" htmlFor="sw-pan-y">Förskjutning Y <output>{Math.round(transform.y * 100)} %</output></label><input id="sw-pan-y" type="range" min="-1" max="1" step="0.02" value={transform.y} disabled={transform.zoom <= 1} onChange={event => setPan('y', Number(event.target.value))} />
            <p className="sw-help">Gemensam visningsinställning för alla format. Dra i filmen när du zoomat in. Originalfilen ändras inte.</p><button className="sw-reset" type="button" onClick={resetView}><Icon name="reset" width="13" height="13" /> Återställ visning</button>
            <dl><dt>Aktiv källa</dt><dd>{VIEW_LABELS[view]}</dd><dt>Bildfrekvens</dt><dd>{clip.fps} fps</dd><dt>Bildrutor</dt><dd>{source?.frameCount ?? 'Saknas'}</dd><dt>Längd</dt><dd>{source ? seconds(source.duration) : 'Saknas'}</dd><dt>Status</dt><dd>Kandidat</dd></dl><code className="sw-hash">SHA-256<br />{source?.sha256 || 'Hash saknas i underlaget'}</code><a className="sw-link" href="/scenfinish#lager">Öppna scenfinish och lager <Icon name="arrow" width="14" height="14" /></a>
          </aside> : null}
        </div>
        <div className="sw-transport"><div className="sw-timeline" style={{ '--sw-progress': `${progress}%` } as CSSProperties}><div className="sw-ruler" aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map(fraction => <span key={fraction}>{seconds((source?.duration ?? 0) * fraction)}</span>)}</div><input type="range" min="0" max={Math.max(0, (source?.frameCount ?? 1) - 1)} step="1" value={frame} disabled={!ready} aria-label="Tidslinje, bildruta" aria-valuetext={`Bildruta ${frame + 1} av ${source?.frameCount ?? 0}, ${timecode(time, clip.fps)}`} onChange={event => seek(Number(event.target.value) / clip.fps)} /></div>
          {activeSegment ? <div role="status" aria-live="polite"><div className="sw-control-row"><strong>Nu: {activeSegment.label}</strong><span>Ruta {activeSegment.from + 1}–{activeSegment.to + 1}</span></div><p className="sw-control-row">Källruta {activeSegment.sourceFrom + frame - activeSegment.from} (0-baserad) · råskarvar mellan delarna · ingen extra brygga.</p></div> : null}
          <div className="sw-transport-row"><div className="sw-time"><span>{timecode(time, clip.fps)}</span><small>/ {source ? seconds(source.duration) : '—'}</small></div><div className="sw-playback"><button className="sw-icon-button" type="button" disabled={!ready || frame === 0} aria-label="Föregående bildruta" title="Föregående bildruta · vänsterpil" onClick={() => step(-1)}><Icon name="previous" width="16" height="16" /></button><button className="sw-play" type="button" disabled={!ready} aria-label={playing ? 'Pausa' : 'Spela'} title={playing ? 'Pausa · mellanslag' : 'Spela · mellanslag'} onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} /></button><button className="sw-icon-button" type="button" disabled={!ready || frame >= (source?.frameCount ?? 1) - 1} aria-label="Nästa bildruta" title="Nästa bildruta · högerpil" onClick={() => step(1)}><Icon name="next" width="16" height="16" /></button></div><div className="sw-transport-right"><span className="sw-fps">{clip.fps} fps · {frame + 1}/{source?.frameCount ?? '—'}</span><select className="sw-speed" aria-label="Uppspelningshastighet" value={speed} onChange={event => { const value = Number(event.target.value); setSpeed(value); if (videoRef.current) videoRef.current.playbackRate = value; }}><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="1">1×</option></select><button className="sw-icon-button" type="button" aria-label="Upprepa filmen" aria-pressed={loop} title="Upprepa filmen" onClick={() => setLoop(value => !value)}><Icon name="repeat" width="15" height="15" /></button>{canFullscreen ? <button className="sw-icon-button" type="button" disabled={!source} aria-label="Visa filmen i helskärm" title="Helskärm" onClick={fullscreen}><Icon name="expand" width="15" height="15" /></button> : null}</div></div>
        </div>
        <p className="sw-notice" role="status" aria-live="polite">{notice}</p>
        <p className="sw-active-description">{clip.description}</p>
        <div className="sw-shortcuts"><span><kbd>Mellanslag</kbd> spela / pausa</span><span><kbd>← →</kbd> bildruta</span><span><kbd>Skift + pilar</kbd> panorera vid zoom</span></div>
      </section>
      <section className="sw-library" aria-labelledby="sw-library-title"><div className="sw-library-heading"><h2 id="sw-library-title">Sekvenser</h2><span>{clips.length} klipp · välj för att granska</span></div><div className="sw-clips">{clips.map((item, index) => <button className="sw-clip" key={item.id} type="button" disabled={!sourceFor(item, 'native')} aria-pressed={clip.id === item.id} title={item.description} onClick={() => chooseClip(item)}><span className="sw-clip-icon"><Icon name="film" width="16" height="16" /></span><span><span className="sw-clip-title">{item.label}</span><span className="sw-clip-desc">{item.description || `Sekvens ${index + 1}`}</span></span><span className="sw-clip-duration">{seconds(item.native.duration)}</span></button>)}</div></section>
      <footer className="sw-footer"><div className="sw-footer-links"><a href="/pipeline"><Icon name="nodes" width="13" height="13" />Pipeline & dokument</a><a href="/scenfinish#lager"><Icon name="layers" width="13" height="13" />Scenfinish</a><a href="/kortmaterial"><Icon name="card" width="13" height="13" />Kortmaterial</a><a href="/markermaterial"><Icon name="layers" width="13" height="13" />Spelmarker</a><a href="/nodkarta"><Icon name="nodes" width="13" height="13" />Nodkarta</a></div><span className="sw-hash-short" title={`${snapshot}\nSHA-256: ${source?.sha256 ?? 'saknas'}`}>{snapshot} · SHA {source?.sha256 ? source.sha256.slice(0, 12) : 'saknas'}</span></footer>
    </main>
  </div>;
}
