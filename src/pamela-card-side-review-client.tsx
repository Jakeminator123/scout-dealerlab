'use client';
import { useEffect, useRef, useState } from 'react';
import { PAMELA_CARD_ATLAS_GLSL } from './pamela-card-atlas.ts';

type Ref = { path: string; sha256: string };
type Rect = { left: number; top: number; width: number; height: number };
type Card = { slotId: string; authoredDisplaySide: 'FRONT' | 'BACK' | 'EDGE'; observedPhysicalSide: 'UNKNOWN'; bounds: Rect; atlas: Rect & { page: number } };
type Clip = {
  id: string; source: Ref & { width: number; height: number; fps: number; frames: number };
  pages: { width: number; height: number; mask: Ref; uv: Ref }[];
  frames: { frame: number; sourceRgbSha256: string; cards: Card[] }[];
  phaseWindows: { label: string; startFrame: number; endFrameExclusive: number; status: string }[];
  outputs: (Ref & { id: string; renderer: string })[];
  sheets: (Ref & { sourceFrames: number[] })[];
};
export type CardSideReviewManifest = {
  projectId: string; dealerId: string; bankId: string;
  styles: { id: string; label: string; back: Ref; front: Record<string, Ref> }[];
  engineFixture: { kind: string; cards: { slotId: string; cardId: string | null; frontAllowed: boolean }[] };
  clips: Clip[]; missing: string[]; verification: { gpuReviewStatus: string };
};
export type PresentationChecklistItem = { id: string; label: string; status: string; detail: string };
/** The current blank-source review has no accepted physical turn evidence. */
export function reviewFrontAllowed(input: {
  authoredSide: 'FRONT' | 'BACK' | 'EDGE'; diagnostic: boolean; concealUnverifiedTurn: boolean;
  revealAllowed: boolean; signal?: { frontAllowed: boolean; cardId: string | null };
}): boolean {
  if (input.authoredSide !== 'FRONT') return false;
  if (input.diagnostic) return true;
  return !input.concealUnverifiedTurn && input.revealAllowed && input.signal?.frontAllowed === true
    && typeof input.signal.cardId === 'string' && input.signal.cardId.length > 0;
}
const fileUrl = (p: string, urls?: Record<string, string>) => {
  if (!p.startsWith('runs/') || p.split('/').some(x => x === '..' || x.startsWith('.'))) throw Error('Unexpected review file');
  const mapped = urls?.[p];
  if (mapped) {
    const url = new URL(mapped, location.origin);
    if (url.username || url.password || url.search || url.hash || !(url.origin === location.origin || (url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com')))) throw Error('Unexpected static review URL');
    return mapped;
  }
  return '/files/' + p.split('/').map(encodeURIComponent).join('/');
};
const sha = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');

/** Separate native-film review route. Source/guard data and the existing printCard
 * GLSL are reused; blue/yellow is deliberately NOT called an observed source side.
 */
export default function PamelaCardSideReview({ manifest, manifestRef, code, fileUrls, checklist = [], initialConcealUnverifiedTurn = true }: { manifest: CardSideReviewManifest; manifestRef: Ref; code: Ref[]; fileUrls?: Record<string, string>; checklist?: PresentationChecklistItem[]; initialConcealUnverifiedTurn?: boolean }) {
  const browserMode = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('mode');
  const initialConceal = browserMode === null ? initialConcealUnverifiedTurn : browserMode !== 'authored-demo';
  const [clipIndex, setClipIndex] = useState(0), [frame, setFrame] = useState(0), [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('Laddar hashbundna texturer…'), [ready, setReady] = useState(false), [revealed, setRevealed] = useState(true);
  const [concealUnverifiedTurn, setConcealUnverifiedTurn] = useState(initialConceal);
  const [stats, setStats] = useState({ textureHashes: 0, presentedFrames: 0, gpuDraws: 0, webglError: 0 });
  const revealAllowed = useRef(true);
  const concealUnverified = useRef(initialConceal);
  const canvas = useRef<HTMLCanvasElement>(null), control = useRef<{ play(): Promise<void>; pause(): void; seek(f: number): void; reveal(value: boolean): void; repaint(): void } | null>(null);
  const clip = manifest.clips[clipIndex];
  useEffect(() => {
    let disposed = false, release = () => {}, textureHashes = 0, presentedFrames = 0, gpuDraws = 0;
    setReady(false); setPlaying(false); setFrame(0); setStatus('Laddar hashbundna kortspår och handskydd…');
    const abort = new AbortController();
    async function mount() {
      const T: any = await import('../references/card-materials/vendor/three.module.js');
      if (disposed || !canvas.current) return;
      const renderer = new T.WebGLRenderer({ canvas: canvas.current, alpha: false, antialias: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(1); renderer.setSize(1762, 1174, false); renderer.outputColorSpace = T.LinearSRGBColorSpace;
      let shaderError = false;
      renderer.debug.onShaderError = (gl: WebGLRenderingContext, program: WebGLProgram) => {
        shaderError = true; setReady(false); setStatus(`Shaderfel ${clip.id}: ${(gl.getProgramInfoLog(program) ?? 'okänd länkning').slice(0, 300)}`);
      };
      const scene = new T.Scene(), camera = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10); camera.position.z = 1;
      const geometry = new T.PlaneGeometry(2, 2), mesh = new T.Mesh(geometry); scene.add(mesh);
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
      const videoTexture = new T.VideoTexture(video); videoTexture.colorSpace = T.NoColorSpace;
      const textures: any[] = [videoTexture], shaderMaterials: any[] = [], cache = new Map<string, Promise<any>>();
      const listeners: [string, () => void][] = []; let callback: number | undefined, currentFrame = 0, released = false;
      release = () => {
        if (released) return; released = true;
        abort.abort(); if (callback !== undefined) video.cancelVideoFrameCallback(callback);
        listeners.forEach(([name, fn]) => video.removeEventListener(name, fn));
        video.pause(); video.removeAttribute('src'); video.load(); control.current = null;
        shaderMaterials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); geometry.dispose(); renderer.dispose();
      };
      async function texture(r: Ref, nearest: boolean) {
        const key = `${r.sha256}/${nearest}`; const old = cache.get(key); if (old) return old;
        const loading = (async () => {
          const response = await fetch(fileUrl(r.path, fileUrls), { signal: abort.signal }); if (!response.ok) throw Error(`HTTP ${response.status}: ${r.path}`);
          const bytes = await response.arrayBuffer(); if (await sha(bytes) !== r.sha256) throw Error(`Texturhash skiljer sig: ${r.path}`); textureHashes++;
          try {
            // The studio CSP permits hash-checked data images, but deliberately not blob: image URLs.
            const url = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(Error('Ingen PNG-data'));
              reader.onerror = () => reject(Error(reader.error?.message ?? 'PNG-läsning misslyckades'));
              reader.readAsDataURL(new Blob([bytes], { type: 'image/png' }));
            });
            const t = await new T.TextureLoader().loadAsync(url);
            if (disposed) { t.dispose(); throw Error('disposed'); }
            t.flipY = false; t.colorSpace = T.NoColorSpace; t.generateMipmaps = false;
            t.minFilter = t.magFilter = nearest ? T.NearestFilter : T.LinearFilter; textures.push(t); return t;
          } catch (error) { throw Error(`PNG-textur kunde inte laddas: ${r.path} (${error instanceof Error ? error.message : 'bildavkodning/CSP'})`); }
        })(); cache.set(key, loading); return loading;
      }
      const masks = await Promise.all(clip.pages.map(p => texture(p.mask, true))), uvMaps = await Promise.all(clip.pages.map(p => texture(p.uv, true)));
      const artwork = await Promise.all(manifest.styles.map(async s => ({ back: await texture(s.back, false), front: new Map(await Promise.all(Object.entries(s.front).map(async ([id, r]) => [id, await texture(r, false)] as const))) })));
      if (disposed) return;
      clip.pages.forEach((p, i) => { for (const t of [masks[i], uvMaps[i]]) if (t.image.width !== p.width || t.image.height !== p.height) throw Error('Atlasmått skiljer sig från manifest'); });
      const fragment = `varying vec2 sourceUv;uniform sampler2D frameTexture;uniform float paintOn;
${PAMELA_CARD_ATLAS_GLSL}
uniform sampler2D cardUvMap0;uniform sampler2D cardUvMap1;
vec3 overlayCard(vec3 source,vec3 current,vec2 pixel,sampler2D maskTex,sampler2D uvTex,sampler2D ink,vec4 bounds,vec4 rect,vec2 size,float edge){
 vec2 local=pixel-bounds.xy;if(any(lessThan(local,vec2(0.0)))||any(greaterThanEqual(local,bounds.zw)))return current;
 vec2 at=(rect.xy+floor(local)+vec2(.5))/size;float amount=texture2D(maskTex,at).r;if(amount<=0.0)return current;
 vec3 encoded=floor(texture2D(uvTex,at).rgb*255.0+.5);
 vec2 uv=vec2(encoded.r*16.0+floor(encoded.g/16.0),mod(encoded.g,16.0)*256.0+encoded.b)/4095.0;
 return mix(current,printCard(source,uv,mat3(1.0),ink,edge),amount);
}
void main(){vec3 source=texture2D(frameTexture,sourceUv).rgb;vec3 outColor=source;
 if(paintOn>.5){vec2 pixel=vec2(sourceUv.x*1762.0,(1.0-sourceUv.y)*1174.0);
 outColor=overlayCard(source,outColor,pixel,cardMask0,cardUvMap0,cardInk0,cardBounds0,cardAtlas0,cardPageSize0,cardEdge0);
 outColor=overlayCard(source,outColor,pixel,cardMask1,cardUvMap1,cardInk1,cardBounds1,cardAtlas1,cardPageSize1,cardEdge1);}
 gl_FragColor=vec4(outColor,1.0);}`;
      for (let variant = -1; variant < manifest.styles.length; variant++) {
        const uniforms: Record<string, { value: any }> = { frameTexture: { value: videoTexture }, paintOn: { value: variant < 0 ? 0 : 1 }, cardInkSize: { value: new T.Vector2(252, 352) } };
        for (let i = 0; i < 2; i++) {
          uniforms['cardMask' + i] = { value: masks[0] }; uniforms['cardUvMap' + i] = { value: uvMaps[0] };
          uniforms['cardInk' + i] = { value: artwork[Math.max(0, variant)].back }; uniforms['cardBounds' + i] = { value: new T.Vector4() };
          uniforms['cardAtlas' + i] = { value: new T.Vector4() }; uniforms['cardPageSize' + i] = { value: new T.Vector2() }; uniforms['cardEdge' + i] = { value: 0 };
        }
        shaderMaterials.push(new T.ShaderMaterial({ uniforms, toneMapped: false, depthTest: false, depthWrite: false, vertexShader: 'varying vec2 sourceUv;void main(){sourceUv=uv;gl_Position=vec4(position,1.0);}', fragmentShader: fragment }));
      }
      const draw = (f: number) => {
        if (disposed || video.readyState < 2 || shaderError) return;
        if (video.videoWidth !== 1762 || video.videoHeight !== 1174) throw Error('Videomått skiljer sig från kortspåret');
        currentFrame = Math.max(0, Math.min(359, f)); const record = clip.frames[currentFrame];
        if (!record || record.frame !== currentFrame) throw Error('Saknad källruta');
        videoTexture.needsUpdate = true; renderer.setScissorTest(true);
        let webglError = renderer.getContext().getError(), failedView = webglError ? 'före ritning' : '';
        for (let variant = 0; variant < shaderMaterials.length; variant++) {
          const material = shaderMaterials[variant], u = material.uniforms;
          for (let i = 0; i < 2; i++) {
            const card = record.cards[i];
            if (!card) { u['cardBounds' + i].value.set(0, 0, 0, 0); continue; }
            const a = card.atlas, b = card.bounds, page = clip.pages[a.page];
            u['cardMask' + i].value = masks[a.page]; u['cardUvMap' + i].value = uvMaps[a.page];
            u['cardBounds' + i].value.set(b.left, b.top, b.width, b.height); u['cardAtlas' + i].value.set(a.left, a.top, a.width, a.height); u['cardPageSize' + i].value.set(page.width, page.height);
            u['cardEdge' + i].value = card.authoredDisplaySide === 'EDGE' ? 1 : 0;
            const art = artwork[Math.max(0, variant - 1)], signal = manifest.engineFixture.cards.find(s => s.slotId === card.slotId);
            // The diagnostic marker describes authored side, independently of engine reveal.
            const diagnostic = variant === 1, frontId = diagnostic ? 'AC' : signal?.cardId;
            const showFront = reviewFrontAllowed({ authoredSide: card.authoredDisplaySide, diagnostic, concealUnverifiedTurn: concealUnverified.current, revealAllowed: revealAllowed.current, signal });
            u['cardInk' + i].value = showFront && frontId ? art.front.get(frontId) ?? art.back : art.back;
          }
          mesh.material = material; const left = variant % 2 * 881, bottom = variant < 2 ? 587 : 0;
          renderer.setViewport(left, bottom, 881, 587); renderer.setScissor(left, bottom, 881, 587); renderer.render(scene, camera); gpuDraws++;
          const drawError = renderer.getContext().getError(); if (drawError && !webglError) { webglError = drawError; failedView = ['original', ...manifest.styles.map(s => s.id)][variant]; }
        }
        presentedFrames++;
        setFrame(currentFrame); setStats({ textureHashes, presentedFrames, gpuDraws, webglError });
        if (webglError) { video.pause(); setStatus(`WebGL-fel ${webglError} (${clip.id} f${currentFrame}, ${failedView}); inget GPU-godkännande.`); setReady(false); }
        else { setStatus('Three-rendering aktiv · sidpolicy författad · fysisk sida UNKNOWN'); setReady(true); }
      };
      const on = (name: string, fn: () => void) => { video.addEventListener(name, fn); listeners.push([name, fn]); };
      const decoded = (_: number, metadata: VideoFrameCallbackMetadata) => { draw(Math.floor(metadata.mediaTime * 30 + .01)); if (!disposed && !video.paused) callback = video.requestVideoFrameCallback(decoded); };
      on('loadeddata', () => draw(0)); on('seeked', () => draw(Math.floor(video.currentTime * 30 + .01)));
      on('play', () => { setPlaying(true); if (callback !== undefined) video.cancelVideoFrameCallback(callback); callback = video.requestVideoFrameCallback(decoded); });
      on('pause', () => { setPlaying(false); if (callback !== undefined) video.cancelVideoFrameCallback(callback); callback = undefined; });
      on('ended', () => { setPlaying(false); draw(359); }); on('error', () => { setReady(false); setStatus('Källfilmen kunde inte avkodas.'); });
      control.current = { play: () => video.play(), pause: () => video.pause(), seek: f => { video.pause(); video.currentTime = (Math.max(0, Math.min(359, f)) + .25) / 30; }, reveal: value => { revealAllowed.current = value; draw(currentFrame); }, repaint: () => draw(currentFrame) };
      video.src = fileUrl(clip.source.path, fileUrls); video.load();
    }
    void mount().catch(error => { if (!disposed) { setStatus(String(error)); setReady(false); } release(); });
    return () => { disposed = true; release(); };
    // Each clip owns one renderer/video; changing the reveal checkbox only updates uniforms.
  }, [clip, manifest, fileUrls]);
  const seek = (f: number) => control.current?.seek(f);
  const requestedMaterialFrontCards = clip.frames[frame]?.cards.filter(card => reviewFrontAllowed({ authoredSide: card.authoredDisplaySide, diagnostic: false, concealUnverifiedTurn, revealAllowed: revealed, signal: manifest.engineFixture.cards.find(s => s.slotId === card.slotId) })).map(card => card.slotId) ?? [];
  return <main style={{ maxWidth: 1500, margin: '0 auto', padding: 20, color: '#e8eef4', fontFamily: 'system-ui' }}>
    <h1>P1 · kortsidor i Three</h1>
    <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}><a href={fileUrls ? '/granskning.html#direktreturer' : '/pamela-returer'}>Direktreturer till VILA</a><a href={fileUrls ? '/pamela-combined.html' : '/pamela-prov?view=combined-scene&id=C2-P1'}>Rum och bord · separat scenprov</a></nav>
    <p>{manifest.projectId} / {manifest.dealerId} / {manifest.bankId}. Blå FRONT och gul BACK är författad diagnostik på blank källa. Observerad fysisk sida: <strong>UNKNOWN</strong>.</p>
    <p>Detta prov byter korttryck på befintlig rörelse. Det skapar ingen fysisk kortvändning. Givning, eventuell vändning och tom hands återgång till VILA behöver egna rörelsebevis. Handen får täcka kortkanten under greppet.</p>
    <p><a href="?mode=conceal-unverified">Öppna skyddad P1-visning</a> · {concealUnverifiedTurn ? <strong>Valörer dolda: fysisk vändning är inte verifierad. Båda slutdesignerna visar baksida genom hela provet. Detta är en visningsspärr, ingen godkänd givning.</strong> : 'Författat materialprov: visad valör är en demonstration och bevisar ingen fysisk vändning.'}</p>
    {checklist.length > 0 && <details><summary>Gemensam checklista · vad som är klart och återstår</summary><ol>{checklist.map(item => <li key={item.id}><strong>{item.label} — {item.status}.</strong> {item.detail}</li>)}</ol></details>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
      <label>Givning <select value={clipIndex} onChange={e => setClipIndex(Number(e.target.value))}>{manifest.clips.map((c, i) => <option key={c.id} value={i}>{c.id}</option>)}</select></label>
      <button disabled={!ready} onClick={() => playing ? control.current?.pause() : void control.current?.play().catch(e => setStatus(String(e)))}>{playing ? 'Pausa' : 'Spela 12 sekunder'}</button>
      <button disabled={!ready} onClick={() => seek(frame - 1)}>−1 ruta</button><button disabled={!ready} onClick={() => seek(frame + 1)}>+1 ruta</button>
      <label><input type="checkbox" checked={!concealUnverifiedTurn} onChange={e => { const conceal = !e.target.checked; concealUnverified.current = conceal; setConcealUnverifiedTurn(conceal); control.current?.repaint(); }} /> Historiskt materialprov: visa författade framsidor utan fysisk givningsacceptans</label>
      <label><input type="checkbox" checked={revealed} disabled={concealUnverifiedTurn} onChange={e => { revealAllowed.current = e.target.checked; setRevealed(e.target.checked); control.current?.reveal(e.target.checked); }} /> Demo-reveal: tillåt framsida i materialprovet</label>
    </div>
    <div style={{ position: 'relative', background: '#10151b', border: '1px solid #425063' }}>
      <canvas key={clip.id} ref={canvas} aria-label="Fyra synkrona Three-vyer: original, blå/gul, SG/classic och blue/ivory" style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '1762 / 1174' }} />
      {['Original · fysisk sida UNKNOWN', 'Blå FRONT / gul BACK · enbart författad diagnostik', `SG / classic · ${concealUnverifiedTurn ? 'valör dold' : 'författat materialprov'}`, `Blue / ivory · ${concealUnverifiedTurn ? 'valör dold' : 'författat materialprov'}`].map((label, i) => <span key={label} style={{ position: 'absolute', left: `${i % 2 * 50}%`, top: `${i < 2 ? 0 : 50}%`, padding: '5px 10px', background: '#101820dd', fontSize: 14, pointerEvents: 'none' }}>{label}</span>)}
    </div>
    <label style={{ display: 'block', margin: '14px 0' }}>Källruta {frame}/359 · {(frame / 30).toFixed(3)} s <input aria-label="Källruta" type="range" min={0} max={359} step={1} value={frame} disabled={!ready} onChange={e => seek(Number(e.target.value))} style={{ width: '100%' }} /></label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{clip.phaseWindows.map(p => <button key={p.label} disabled={!ready} onClick={() => seek(p.startFrame)}>{p.label}: {p.startFrame}–{p.endFrameExclusive - 1}</button>)}{(clip.id === 'C2-P1' ? [82, 83, 103, 104, 113, 114, 118, 119] : [170, 185, 195, 210]).map(f => <button key={f} disabled={!ready} onClick={() => seek(f)}>f{f}</button>)}</div>
    <p role="status">{status}</p>
    <pre id="gpu-review-state" style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{JSON.stringify({ renderer: 'Three.WebGLRenderer', clipId: clip.id, sourceSha256: clip.source.sha256, frame, authoredSide: clip.frames[frame]?.cards.at(-1)?.authoredDisplaySide, observedPhysicalSide: 'UNKNOWN', displayMode: concealUnverifiedTurn ? 'conceal-unverified-turn' : 'authored-material-demo', requestedMaterialFrontCards, physicalTurnQaAccepted: false, ready, ...stats, runtimeAccepted: false, videoDecoderGpuParityVerified: false }, null, 2)}</pre>
    <p>Fasgränserna är granskningsfönster, inte godkända händelsecues. Hand-/skoskydd ingår i varje kortmask. C1:s CPU-referens har dessutom befintlig 0,65 px tryckmjukning; GPU-vyn är en separat granskning.</p>
    <details><summary>Källor, CPU-referenser och begränsningar</summary>
      <p>Manifest: <a href={fileUrl(manifestRef.path, fileUrls)}>{manifestRef.sha256}</a></p>
      <ul>{clip.outputs.map(o => <li key={o.id}><a href={fileUrl(o.path, fileUrls)}>{o.id} · CPU-referensfilm</a></li>)}{clip.sheets.map(s => <li key={s.path}><a href={fileUrl(s.path, fileUrls)}>Kontaktark · rutor {s.sourceFrames.join(', ')}</a></li>)}</ul>
      <ul>{manifest.missing.map(m => <li key={m}>{m}</li>)}</ul><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(code, null, 2)}</pre>
    </details>
  </main>;
}
