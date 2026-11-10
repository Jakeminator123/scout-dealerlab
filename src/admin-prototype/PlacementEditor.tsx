'use client';

import { useEffect, useRef, useState } from 'react';
import { placementFor } from './model';
import type { Placement, Recipe } from './model';

type Asset = { path: string; name: string; video: boolean; dealerId?: string; dealerLabel?: string };
const fileUrl = (path: string) => '/files/' + path.split('/').map(encodeURIComponent).join('/');
const videoPath = (path: string) => /\.(mp4|webm|mov)$/i.test(path);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function PlacementEditor({ recipe, onChange }: { recipe: Recipe; onChange: (placement: Placement) => void }) {
  const placement = placementFor(recipe);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [guides, setGuides] = useState(true);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const dragging = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const identity = recipe.dealer === 'pamela' ? 'pamela-pilot' : 'goran-scout';
  const known = assets.filter(asset => asset.dealerId === identity);
  const backgrounds = assets.filter(asset => asset.dealerId === identity || !asset.dealerId || asset.dealerId === 'unclassified');
  const hasVideo = videoPath(placement.background) || videoPath(placement.foreground);
  const primaryIndex = videoPath(placement.foreground) ? 1 : 0;
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/studio', { signal: controller.signal }).then(response => { if (!response.ok) throw new Error('Materiallistan kunde inte läsas.'); return response.json(); }).then(data => {
      if (!Array.isArray(data.assets)) throw new Error('Materiallistan har okänt format.');
      setAssets(data.assets.filter((asset: Asset) => typeof asset.path === 'string' && /\.(png|jpe?g|webp|mp4|webm|mov)$/i.test(asset.path)).map((asset: Asset) => ({ path: asset.path, name: asset.name, video: asset.video, dealerId: asset.dealerId, dealerLabel: asset.dealerLabel })));
      setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'Materiallistan kunde inte läsas.'); setLoading(false); } });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    videos.current.forEach(video => video?.pause());
    const primary = videos.current[primaryIndex];
    setPlaying(false); setTime(primary?.currentTime || 0);
    setDuration(primary && Number.isFinite(primary.duration) ? primary.duration : 0);
    setError('');
  }, [placement.background, placement.foreground, primaryIndex]);
  function update(patch: Partial<Placement>) { onChange({ ...placement, ...patch }); }
  function options(list: Asset[], current: string) {
    const resolved = current && !list.some(asset => asset.path === current) ? [{ path: current, name: current.split('/').at(-1) || current, video: videoPath(current), dealerLabel: 'Sparad referens' }, ...list] : list;
    return resolved.map(asset => <option key={asset.path} value={asset.path}>{asset.name} · {asset.video ? 'video' : 'bild'} · {asset.dealerLabel || 'okänd identitet'}</option>);
  }
  function media(path: string, index: number) {
    if (!path) return null;
    return videoPath(path) ? <video key={path} ref={element => { videos.current[index] = element; }} src={fileUrl(path)} muted playsInline loop preload="metadata" onLoadedMetadata={event => { if (index === primaryIndex) setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); }} onTimeUpdate={event => { if (index === primaryIndex) setTime(event.currentTarget.currentTime); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(videos.current.some(video => !!video && !video.paused))} onError={() => setError('Videon kan inte spelas i WebView. Välj en annan lokal fil.')} aria-label={index === 0 ? 'Bakgrundsvideo' : 'Referensvideo'}/> : <img src={fileUrl(path)} alt={index === 0 ? 'Vald bakgrund i placeringsvyn' : 'Flyttbart referenslager'} draggable={false} onError={() => setError('Bilden kunde inte läsas. Välj en annan lokal fil.')}/>;
  }
  async function togglePlay() {
    if (playing) { videos.current.forEach(video => video?.pause()); return; }
    try { await Promise.all(videos.current.filter((video): video is HTMLVideoElement => !!video).map(video => video.play())); }
    catch { setError('Uppspelningen kunde inte starta. Välj en annan lokal video.'); }
  }
  return <div className="ap-placement">
    <div className="ap-placement-heading"><div><h3>Passa in materialet</h3><p>Byt bakgrund, flytta ett referenslager och prova lokal video.</p></div><span className="ap-small-tag">VISUELLT TEST</span></div>
    <div className="ap-material-selects"><label className="ap-field">Bakgrund / bordsgrafik – bild eller video<select aria-label="Bakgrundsmaterial" disabled={loading} value={placement.background} onChange={e => update({ background: e.target.value })}><option value="">Tom bakgrund</option>{options(backgrounds, placement.background)}</select></label><label className="ap-field">Flyttbart lager – samma dealeridentitet<select aria-label="Flyttbart material" disabled={loading} value={placement.foreground} onChange={e => update({ foreground: e.target.value, x: 0, y: 0, zoom: 100 })}><option value="">Inget extra lager</option>{options(known, placement.foreground)}</select></label></div>
    <div className="ap-placement-canvas" role="group" aria-label="Placeringsyta 1920 gånger 1080" onPointerDown={event => {
      if (!placement.foreground) return;
      event.currentTarget.setPointerCapture(event.pointerId); dragging.current = { startX: event.clientX, startY: event.clientY, x: placement.x, y: placement.y };
    }} onPointerMove={event => {
      const drag = dragging.current; if (!drag) return;
      const rect = event.currentTarget.getBoundingClientRect();
      update({ x: clamp(Math.round(drag.x + (event.clientX - drag.startX) / rect.width * 1920), -4000, 4000), y: clamp(Math.round(drag.y + (event.clientY - drag.startY) / rect.height * 1080), -4000, 4000) });
    }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      <div className="ap-placement-background">{media(placement.background, 0)}</div>
      {placement.foreground && <div className="ap-placement-foreground" style={{ left: `${50 + placement.x / 1920 * 100}%`, top: `${50 + placement.y / 1080 * 100}%`, transform: `translate(-50%, -50%) scale(${placement.zoom / 100})`, opacity: placement.opacity / 100 }}>{media(placement.foreground, 1)}</div>}
      {guides && <><div className="ap-placement-grid"/><span className="ap-placement-origin">0, 0</span><div className="ap-placement-anchor" style={{ left: `${50 + placement.x / 1920 * 100}%`, top: `${50 + placement.y / 1080 * 100}%` }}/></>}
      <span className="ap-placement-badge">1920 × 1080 · VISUELL REFERENS</span>
    </div>
    <div className="ap-placement-transport"><button className="ap-secondary" disabled={!hasVideo} onClick={() => void togglePlay()}>{playing ? 'Pausa video' : 'Spela video'}</button><label className="ap-video-seek">Tid<input type="range" aria-label="Videoposition" min="0" max={duration || 1} step="0.01" value={Math.min(time, duration || 1)} disabled={!duration} onChange={e => { const value = Number(e.target.value); videos.current.forEach(video => { if (video && Number.isFinite(video.duration)) video.currentTime = Math.min(value, video.duration); }); setTime(value); }}/><span>{time.toFixed(1)} / {duration.toFixed(1)} s</span></label><label className="ap-toggle"><input type="checkbox" checked={guides} onChange={e => setGuides(e.target.checked)}/>Koordinatnät</label></div>
    <div className="ap-placement-values">{([['x', 'X-förskjutning', -4000, 4000], ['y', 'Y-förskjutning', -4000, 4000], ['zoom', 'Zoom %', 10, 300], ['opacity', 'Opacitet %', 0, 100]] as const).map(([key, label, min, max]) => <label className="ap-field" key={key}>{label}<input type="number" aria-label={label} min={min} max={max} step={1} disabled={!placement.foreground} value={placement[key]} onChange={e => update({ [key]: clamp(Number(e.target.value), min, max) })}/></label>)}</div>
    <div className="ap-placement-actions"><button className="ap-secondary" disabled={!placement.foreground} onClick={() => update({ x: 0, y: 0, zoom: 100, opacity: 100 })}>Centrera & passa in</button><span>Lagercentrum: {960 + placement.x}, {540 + placement.y} px</span></div>
    <p className="ap-placement-explainer">Dra lagret eller ange X/Y i referensytans pixlar. Nollförskjutning placerar centrum vid 960, 540. Inpassning bevarar proportioner. En fil med hel bakgrund blir inte automatiskt frilagd; sänk opaciteten för att jämföra.</p>
    <details className="ap-material-details"><summary>Material, identitet & begränsningar</summary><p>Flyttbara lager filtreras på {identity}. Bakgrundslistan innehåller också oklassificerat material; kontrollera att bilden passar innan den används. Ingen annan känd dealeridentitet blandas in automatiskt.</p><p>Bakgrund: {placement.background || 'Ingen'}<br/>Lager: {placement.foreground || 'Inget'}</p><p>Filsökvägar och placering sparas i scenversionen. Materialhashar är ännu inte låsta. Detta är inte verifierad bordskalibrering, kortspårning eller en exporterad video.</p></details>
    {loading && <p className="ap-muted">Läser den lokala materiallistan…</p>}{error && <p className="ap-alert" role="alert">{error}</p>}
  </div>;
}
