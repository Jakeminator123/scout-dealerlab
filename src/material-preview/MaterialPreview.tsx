'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import MaterialStage from './MaterialStage';
import TerminologyOverlay from '../terminology/TerminologyOverlay';
import Workbench, { type WorkArea } from './Workbench';
import AIReview from './AIReview';
import { DEFAULT_BACKDROP, DEFAULT_PLACEMENT, fileUrl, previewPlacement, seekTime, type MaterialAsset, type Placement } from './model';
import './material-preview.css';

const PAMELA = 'runs/20261108175519-74d6c57e/original/pamela-vila-candidate-v3.png';
const PAMELA_FOCUSED = 'runs/20261108210457-pamela-v4-focused/original/pamela-vila-focused-v4.png';
const GORAN = 'media/alternative-project/e19d226c-c586-467e-b126-6a9f90e1675e/90924b04-f54e-4486-8bec-11d8b09b47a0.mp4';
const ASTRID = 'gpt-underlag/uppackad-zip-underlag/05_referens_Emil/vila.png';
const OBSERVATIONS = 'dealerlab.material-observations.v1';

export default function MaterialPreview({ assets }: { assets: MaterialAsset[] }) {
  const initial = assets.find(asset => asset.path === PAMELA_FOCUSED) ?? assets.find(asset => asset.path === PAMELA) ?? assets[0];
  const [paths, setPaths] = useState([initial?.path ?? '', initial?.path ?? '']);
  const [placements, setPlacements] = useState<Placement[]>([previewPlacement(initial), previewPlacement(initial, true)]);
  const [background, setBackground] = useState('checker'), [focused, setFocused] = useState<number | null>(null);
  const [area, setArea] = useState<WorkArea>('dealer'), [detail, setDetail] = useState(false), [backdropView, setBackdropView] = useState(DEFAULT_BACKDROP);
  const [playing, setPlaying] = useState(false), [times, setTimes] = useState([0, 0]), [offset, setOffset] = useState(0);
  const [note, setNote] = useState(''), [message, setMessage] = useState('');
  const [observations, setObservations] = useState<{ at: string; note: string }[]>([]);
  const videos = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const playIntent = useRef(0);
  const registerA = useCallback((v: HTMLVideoElement | null) => { videos.current[0] = v; }, []);
  const registerB = useCallback((v: HTMLVideoElement | null) => { videos.current[1] = v; }, []);
  const selected = paths.map(p => assets.find(asset => asset.path === p) ?? initial);
  const hasVideo = selected.some(asset => asset?.video);
  const primary = selected[0]?.video ? 0 : 1;
  const duration = selected[primary]?.duration ?? 0, time = times[primary];
  function stop() { playIntent.current++; videos.current.forEach(v => v?.pause()); setPlaying(false); }
  useEffect(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(OBSERVATIONS) || '[]'); if (Array.isArray(saved)) setObservations(saved.filter(item => typeof item?.at === 'string' && typeof item?.note === 'string')); } catch { setMessage('Tidigare observationer kunde inte läsas.'); } }, []);
  useEffect(() => { const hidden = () => { if (document.hidden) stop(); }; document.addEventListener('visibilitychange', hidden); return () => { document.removeEventListener('visibilitychange', hidden); videos.current.forEach(v => v?.pause()); }; }, []);
  function seek(value: number, shift = offset) { stop(); videos.current.forEach((v, i) => { if (v) v.currentTime = seekTime(value, v.duration, i === 1 && primary === 0 ? shift : 0); }); }
  async function togglePlay() {
    if (playing) return stop();
    setMessage('');
    const intent = ++playIntent.current;
    const results = await Promise.allSettled(videos.current.filter((v): v is HTMLVideoElement => Boolean(v)).map(v => v.play()));
    if (intent !== playIntent.current) return;
    if (results.some(result => result.status === 'rejected')) { stop(); setMessage('Uppspelningen kunde inte starta. Kontrollera att båda filmerna har laddats.'); }
    else setPlaying(true);
  }
  function resetPlayback() { stop(); videos.current.forEach(v => { if (v && v.readyState >= 1) v.currentTime = 0; }); setTimes([0, 0]); }
  function changeFile(side: number, path: string) { resetPlayback(); setPaths(old => old.map((p, i) => i === side ? path : p)); setPlacements(old=>old.map((p,i)=>i===side ? previewPlacement(assets.find(a=>a.path===path),p.key):p)); setOffset(0); setMessage(''); }
  function preset(a: string, b = a) { resetPlayback(); setPaths([a, b]); setOffset(0); setPlacements([previewPlacement(assets.find(item=>item.path===a),a!==b), previewPlacement(assets.find(item=>item.path===b),true)]); setMessage(''); }
  function changePlacement(side: number, patch: Partial<Placement>) { setPlacements(old => old.map((p, i) => i === side ? { ...p, ...patch } : p)); }
  function chooseBackground(id: string) { setBackground(id); setBackdropView({ ...DEFAULT_BACKDROP, projection: ['wood','forest','la','vegas'].includes(id) ? 'panorama' : 'photo' }); }
  function dragBackground(dx: number, dy: number) { setBackdropView(old => old.projection === 'panorama' ? { ...old, yaw: Math.max(-180,Math.min(180,old.yaw-dx*.12)), pitch: Math.max(-55,Math.min(55,old.pitch+dy*.12)) } : { ...old, x: Math.max(-1,Math.min(1,old.x+dx*.004)), y: Math.max(-1,Math.min(1,old.y+dy*.004)) }); }
  function saveObservation() {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(OBSERVATIONS) || '[]'), entries = Array.isArray(stored) ? stored : [];
      const item = { at: new Date().toISOString(), status: 'observation-not-production-approval', note: note.trim(), background, backdropView, offsetSeconds: offset, materials: selected.map((asset, i) => ({ path: asset.path, sha256: asset.sha256 ?? null, dealerId: asset.dealerId ?? 'unclassified', fps: asset.fps ?? null, time: times[i], placement: placements[i] })) };
      localStorage.setItem(OBSERVATIONS, JSON.stringify([...entries, item])); setObservations([...entries, item]); setMessage('Observation sparad i denna webbläsare. Det är inget produktionsgodkännande.'); setNote('');
    } catch { setMessage('Observationen kunde inte sparas i webbläsaren.'); }
  }
  if (!initial) return <main className="mp-shell">Inget lokalt material hittades. <a href="/">Öppna klippstudion</a>.</main>;
  return <main className="mp-shell">
    <header className="mp-header"><a href="/" className="mp-brand">← Dealerstudio</a><nav aria-label="Materialprov"><a href="/admin-prototyp">Scenredigering</a><TerminologyOverlay selectedPath={paths[0]}/><a href="/files/docs/MASTERPLAN.md" target="_blank" rel="noreferrer">Masterplan ↗</a></nav><span className="mp-local">● Lokalt · jakob/test</span></header>
    <div className="mp-intro"><div><span className="mp-eyebrow">KEYSTONE → RÖRELSE → KONTROLL → SCEN</span><h1>Materialprov<span>Jämför A/B</span></h1><p>{paths[0] === paths[1] ? 'Samma fil – jämför grönnyckling av/på.' : 'Två källor – jämför utsnitt, identitet och rörelse.'}</p></div><span className="mp-status">ARBETSMATERIAL<br/><strong>Kalibrering återstår</strong></span></div>
    <Workbench area={area} setArea={setArea} background={background} chooseBackground={chooseBackground} view={backdropView} setView={setBackdropView} assets={assets} chooseAsset={path=>{ changeFile(1,path); const asset=assets.find(a=>a.path===path); changePlacement(1,{...DEFAULT_PLACEMENT,scale:asset?.width && asset?.height ? Math.min(1,1920/(1080*asset.width/asset.height)):1}); setDetail(false); }}/>
    <section className="mp-toolbar" aria-label="Gemensamma inställningar"><div className="mp-presets"><button onClick={() => preset(PAMELA_FOCUSED)}>Pamela v4 · tätare</button><button onClick={() => preset(PAMELA, PAMELA_FOCUSED)}>Pamela v3 / v4</button><button onClick={() => preset('runs/20261108-pamela-model-comparison/original/pamela-v4-gen45-padded-idle.mp4', 'runs/20261108-pamela-model-comparison/original/pamela-v4-wan3-padded-idle.mp4')}>Gen-4.5 / Wan3</button><button onClick={() => preset(GORAN)}>Göran · film</button><button onClick={() => preset(ASTRID, PAMELA_FOCUSED)}>Astrid2 / Pamela</button></div><div className="mp-view-switch"><button aria-pressed={!detail} onClick={()=>setDetail(false)}>Helbild</button><button aria-pressed={detail} onClick={()=>setDetail(true)}>Detaljprov</button></div></section>
    <section className={`mp-comparison ${focused !== null ? 'mp-focused' : ''}`} aria-label="Jämför A och B">{selected.map((asset, side) => <article className="mp-panel" key={side} hidden={focused !== null && focused !== side}>
      <div className="mp-panel-title"><span className="mp-letter">{side === 0 ? 'A' : 'B'}</span><h2>{side === 0 ? 'Referens' : 'Försök'}</h2><button onClick={() => setFocused(focused === side ? null : side)}>{focused === side ? 'Visa båda' : 'Förstora'}</button></div>
      <label className="mp-file-label">Material {side === 0 ? 'A' : 'B'}<select aria-label={`Material ${side === 0 ? 'A' : 'B'}`} value={asset.path} onChange={e => changeFile(side, e.target.value)}>{assets.map(item => <option key={item.path} value={item.path}>{item.video ? '▶ ' : '▧ '}{item.displayName || item.name} · {item.path.startsWith('runs/') ? 'Försök' : item.origin || 'Lokalt'}</option>)}</select></label>
      <MaterialStage asset={asset} placement={placements[side]} backgroundId={background} backdropView={backdropView} onBackdropDrag={area === 'background' ? dragBackground : undefined} detail={detail} label={side === 0 ? 'Referens A' : 'Försök B'} register={side === 0 ? registerA : registerB} onTime={t => setTimes(old => old.map((v, i) => i === side ? t : v))} onEnd={stop}/>
      <div className="mp-treatment"><label><input type="checkbox" checked={placements[side].key} onChange={e => changePlacement(side, { key: e.target.checked })}/> Grönnyckling i förhandsvisningen</label><span>{times[side].toFixed(3)} s</span></div>
      <details className="mp-file-info"><summary>Fil, identitet och mätvärden</summary><dl className="mp-metadata"><div><dt>Identitet</dt><dd>{asset.dealerLabel || 'Oklassificerat'} <small>{asset.dealerId || 'okänd'}</small></dd></div><div><dt>Original</dt><dd>{asset.width ?? '?'} × {asset.height ?? '?'} · {asset.video ? `${asset.fps ?? '?'} fps · ${asset.frameCount ?? '?'} rutor` : 'stillbild'}</dd></div><div><dt>SHA-256</dt><dd title={asset.sha256}>{asset.sha256 ? asset.sha256.slice(0, 16) + '…' : 'okänd'}</dd></div></dl></details>
      <details className="mp-placement"><summary>Utsnitt, placering och källa</summary><div className="mp-sliders"><label>Storlek (%)<input aria-label={`Storlek ${side === 0 ? 'A' : 'B'}`} type="range" min="20" max="200" step="1" value={placements[side].scale * 100} onChange={e => changePlacement(side, { scale: Number(e.target.value) / 100 })}/><output>{Math.round(placements[side].scale * 100)} %</output></label>{(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()} (px)<input type="number" aria-label={`${axis.toUpperCase()} ${side === 0 ? 'A' : 'B'}`} min="-1920" max="1920" value={Math.round(placements[side][axis])} onChange={e => changePlacement(side, { [axis]: Math.max(-1920, Math.min(1920, Number(e.target.value) || 0)) })}/></label>)}</div><button onClick={() => changePlacement(side, previewPlacement(asset, placements[side].key))}>Matcha motivstorlek</button><p>Pamela v3/v4 matchas provisoriskt vid ögon- och handhöjd. Det är visningsinpassning; inga kortspår eller kamerakalibreringar ändras.</p><a href={fileUrl(asset.path)} target="_blank" rel="noreferrer">Öppna original ↗</a><code>{asset.path}</code></details>
    </article>)}</section>
    {hasVideo && <section className="mp-transport" aria-label="Gemensam uppspelning"><div><button className="mp-primary" disabled={!hasVideo} onClick={() => void togglePlay()}>{playing ? 'Pausa båda' : 'Spela båda'}</button><button disabled={!hasVideo} onClick={() => seek(0)}>Till början</button><button disabled={!hasVideo || !selected[primary]?.fps} onClick={() => seek(time - 1 / selected[primary].fps!)}>−1 ruta</button><button disabled={!hasVideo || !selected[primary]?.fps} onClick={() => seek(time + 1 / selected[primary].fps!)}>+1 ruta</button><span>{time.toFixed(2)} / {duration.toFixed(2)} s</span></div><input aria-label="Gemensam videotid" type="range" min="0" max={duration || 1} step="0.001" value={Math.min(time, duration || 1)} disabled={!hasVideo} onChange={e => seek(Number(e.target.value))}/><label>B tidsförskjutning (s)<input aria-label="B tidsförskjutning" type="number" step="0.01" min="-60" max="60" disabled={!selected.every(a => a.video)} value={offset} onChange={e => { const n = Math.max(-60, Math.min(60, Number(e.target.value) || 0)); setOffset(n); seek(time, n); }}/></label><p>Gemensam uppspelning är inte verifierad bildrutesynk. {selected.every(a => a.video) ? `A: ${selected[0].fps ?? '?'} fps · B: ${selected[1].fps ?? '?'} fps · faktisk tidsskillnad ${(times[1] - times[0]).toFixed(3)} s.` : 'Välj två filmer för att jämföra timing.'}</p></section>}
    <AIReview assets={selected}/>
    <details className="mp-notes"><summary>Egna anteckningar</summary><section className="mp-observation"><h2>Spara observation</h2><label htmlFor="mp-note">Vad ser du i kanter, händer, utsnitt eller skarv?</label><textarea id="mp-note" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Exempel: hårkanten flimrar vid 1,4 s mot ljus bakgrund…"/><button className="mp-primary" disabled={!note.trim()} onClick={saveObservation}>Spara med filhash och inställningar</button><p role="status">{message || 'Sparas i denna webbläsare. Originalfilerna ändras inte.'}</p>{observations.length > 0 && <details><summary>Sparade observationer ({observations.length})</summary>{observations.slice(-3).reverse().map((item, i) => <p key={item.at + i}><time>{new Date(item.at).toLocaleString('sv-SE')}</time><br/>{item.note}</p>)}</details>}</section></details>
  </main>;
}
