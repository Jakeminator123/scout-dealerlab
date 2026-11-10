'use client';
import { useEffect, useRef, useState } from 'react';
import { BACKGROUNDS, DEFAULT_BACKDROP, fileUrl, type BackdropView, type MaterialAsset, type Placement } from './model';
import { createMaterialRenderer } from './renderer';

export default function MaterialStage({ asset, placement, backgroundId, register, onTime, onEnd, label, backdropView = DEFAULT_BACKDROP, onBackdropDrag, detail = false }: {
  asset: MaterialAsset; placement: Placement; backgroundId: string; label: string;
  register: (video: HTMLVideoElement | null) => void; onTime: (time: number) => void; onEnd: () => void;
  backdropView?: BackdropView; onBackdropDrag?: (x: number, y: number) => void; detail?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), video = useRef<HTMLVideoElement>(null), still = useRef<HTMLImageElement>(null);
  const renderer = useRef<ReturnType<typeof createMaterialRenderer> | null>(null), background = useRef<HTMLImageElement | null>(null);
  const state = useRef({ placement, backgroundId, asset, backdropView }); state.current = { placement, backgroundId, asset, backdropView };
  const drag = useRef<{ x: number; y: number } | null>(null);
  const animation = useRef(0), [error, setError] = useState('');
  function paint() {
    try { const s = state.current, bg = BACKGROUNDS.find(item => item.id === s.backgroundId)!; renderer.current?.render(s.asset.video ? video.current : still.current, background.current, bg.id, 'color' in bg ? bg.color : '#101419', s.placement, s.backdropView); }
    catch { setError('Materialet kunde inte ritas. Välj en annan fil eller ladda om.'); }
  }
  function tick() { paint(); if (video.current && !video.current.paused && !video.current.ended) animation.current = requestAnimationFrame(tick); }
  function stopTick() { cancelAnimationFrame(animation.current); animation.current = 0; paint(); }
  useEffect(() => {
    try { renderer.current = createMaterialRenderer(canvas.current!); paint(); } catch (e) { setError((e as Error).message); }
    return () => { cancelAnimationFrame(animation.current); renderer.current?.dispose(); renderer.current = null; };
  }, []);
  useEffect(() => {
    setError(''); register(asset.video ? video.current : null); paint();
    return () => { video.current?.pause(); register(null); cancelAnimationFrame(animation.current); };
  }, [asset.path, asset.video, register]);
  useEffect(() => { paint(); }, [placement, backdropView]);
  useEffect(() => {
    let active = true; background.current = null;
    const choice = BACKGROUNDS.find(bg => bg.id === backgroundId)!;
    if ('path' in choice) { const img = new Image(); img.onload = () => { if (active) { background.current = img; paint(); } }; img.onerror = () => { if (active) setError('Bakgrunden kunde inte läsas.'); }; img.src = fileUrl(choice.path); }
    paint(); return () => { active = false; };
  }, [backgroundId]);
  return <div className={`mp-stage ${detail ? 'mp-detail' : ''} ${onBackdropDrag ? 'mp-draggable' : ''}`} onPointerDown={event => { if (!onBackdropDrag) return; drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (drag.current && onBackdropDrag) { onBackdropDrag(event.clientX - drag.current.x, event.clientY - drag.current.y); drag.current = { x: event.clientX, y: event.clientY }; } }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <canvas ref={canvas} width={1920} height={1080} aria-label={`${label} i 1920 × 1080`} />
    {asset.video ? <video key={asset.path} ref={video} hidden src={fileUrl(asset.path)} muted playsInline preload="auto" onLoadedData={paint} onSeeked={paint} onTimeUpdate={event => onTime(event.currentTarget.currentTime)} onPlay={() => { cancelAnimationFrame(animation.current); tick(); }} onPause={stopTick} onEnded={onEnd} onError={() => setError('Filmen kunde inte avkodas.')} /> : <img key={asset.path} ref={still} hidden src={fileUrl(asset.path)} alt="" onLoad={paint} onError={() => setError('Bilden kunde inte läsas.')} />}
    <span className="mp-canvas-note">{detail ? 'Detaljprov · endast visningszoom' : '1920 × 1080 · proportioner bevarade'}{onBackdropDrag && ' · dra för att se runt'}</span>
    {error && <p className="mp-error" role="alert">{error}</p>}
  </div>;
}
