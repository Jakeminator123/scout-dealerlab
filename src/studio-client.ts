import { trackLabels } from './source-tracks';
import type { SourceTrack } from './source-tracks';
type Metadata = { fps?: number; width?: number; height?: number; duration?: number; frameCount?: number };
type MediaAsset = Metadata & { path: string; name: string; displayName?: string; bytes: number; video: boolean; sha256?: string; track?: SourceTrack; stage?: string; origin?: string; dealerId?: string; dealerLabel?: string; metadata?: Metadata };
type Point = { id: string; label: string; x: number; y: number };
type CardTrack = { positionId: string; firstFrame: number; frames: { q?: number[][]; p?: number[][]; body?: number[][] }[] };
type MotionTransition = { id: string; label: string; from: string; to: string; clipKey: string; assetPath?: string | null; remoteUrl?: string | null; evidence?: string; coordinates?: { points?: Point[]; rects?: unknown[]; track?: CardTrack | null; timing?: { fps?: number; frames?: number; offsetFrames?: number } } | null };
type MotionScheme = { id: string; label: string; workflow?: 'main' | 'kevin' | 'alternative'; sourceRef: string; sourcePath: string; summary: string; states: { id: string; label: string }[]; transitions: MotionTransition[]; notes?: string[]; coordinateSpace?: { width: number; height: number; unit?: string; reference?: string; calibration?: { assetPath?: string; evidence?: string } | null } | null };
type Data = { assets: MediaAsset[]; schemes: MotionScheme[]; runs: { id: string; title: string }[]; connections: Record<string, unknown> };
export type StudioData = Data & { csrfToken: string };
type Side = 'a' | 'b';
type Workflow = 'main' | 'kevin' | 'alternative';
type SequenceEntry = { schemeId: string; transitionId: string; sourceRef: string };

/** Own every listener, observer, request and animation so React StrictMode can remount safely. */
export function initStudio(initialData: StudioData): () => void {
let active = true;
const lifetime = new AbortController();
const animationFrames = new Set<number>();
const observers: ResizeObserver[] = [];
function listen<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, callback: (event: HTMLElementEventMap[K]) => void) {
  target.addEventListener(type, callback as EventListener, { signal: lifetime.signal });
}
function requestFrame(callback: FrameRequestCallback) {
  if (!active) return;
  const id = requestAnimationFrame(time => { animationFrames.delete(id); if (active) callback(time); });
  animationFrames.add(id);
}
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const studioRoot = element('dealer-studio');
const select = (id: string) => element<HTMLSelectElement>(id);
const text = (id: string, value: string) => { if (active) element(id).textContent = value; };
const fileUrl = (path: string) => '/files/' + path.split('/').map(encodeURIComponent).join('/');
const assetMetadata = (asset: MediaAsset | undefined): Metadata => ({ ...asset, ...asset?.metadata });
const bytesLabel = (value: number) => value > 1048576 ? `${(value / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.round(value / 1024)} kB`;
const timeLabel = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const ms = Math.floor(seconds * 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
const shortTime = (seconds: number) => timeLabel(seconds).slice(0, 5);
let data: Data = initialData;
const video = { a: element<HTMLVideoElement>('video-a'), b: element<HTMLVideoElement>('video-b') };
const chosen: Record<Side, string> = { a: '', b: '' };
let target: Side = 'a';
let kind = 'all';
let playing = false;
let playRequest = 0;
let position = 0;
let hoveredPoint: string | null = null;
let selectedPoint: string | null = null;
let imageObjectPath = '';
let workflow: Workflow = 'main';
const sequences: Record<Workflow, SequenceEntry[]> = { main: [], kevin: [], alternative: [] };

function announce(message: string, error = false) {
  if (!active) return;
  const notice = element('notice');
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle('error', error);
}
function populateSelect(id: string, items: { value: string; label: string }[], selected?: string) {
  const targetSelect = select(id);
  targetSelect.replaceChildren(...items.map(item => new Option(item.label, item.value)));
  if (selected && items.some(item => item.value === selected)) targetSelect.value = selected;
}
function originName(asset: MediaAsset) {
  if (asset.origin) return String(asset.origin);
  if (asset.path.startsWith('gpt-underlag/')) return 'GPT-underlag';
  if (asset.path.startsWith('extra/')) return 'Extra underlag';
  return 'Lokalt · ursprung okänt';
}
function stageName(asset: MediaAsset) {
  const stage = String(asset.stage || '');
  if (/processed|bearbet/i.test(stage) || asset.path.includes('/processed/')) return 'Bearbetat';
  if (/original/i.test(stage) || asset.path.includes('/original/')) return 'Original';
  if (/export/i.test(stage) || asset.path.includes('/export/')) return 'Export';
  return stage || 'Källmaterial';
}
function matchesOrigin(asset: MediaAsset, value: string) {
  const origin = originName(asset).toLowerCase();
  if (value === 'all') return true;
  if (value === 'processed') return stageName(asset) === 'Bearbetat';
  if (value === 'original') return stageName(asset) === 'Original';
  if (value === 'local') return !/runway|blob/.test(origin);
  return origin.includes(value);
}
function renderLibrary() {
  const pool = data.assets.filter(asset => target === 'b' || element<HTMLInputElement>('all-tracks').checked || asset.track === workflow);
  const dealerFilter = select('dealer-filter');
  const previousDealer = dealerFilter.value;
  dealerFilter.replaceChildren(new Option('Alla dealeridentiteter', 'all'));
  const knownDealers = new Set(['all']);
  for (const asset of pool) {
    if (!asset.dealerId || knownDealers.has(asset.dealerId)) continue;
    dealerFilter.add(new Option(asset.dealerLabel || asset.dealerId, asset.dealerId));
    knownDealers.add(asset.dealerId);
  }
  if (knownDealers.has(previousDealer)) dealerFilter.value = previousDealer;
  const search = element<HTMLInputElement>('asset-search').value.toLocaleLowerCase('sv');
  const dealer=select('dealer-filter').value;
  const assets = pool.filter(asset => (dealer==='all'||asset.dealerId===dealer) && (kind === 'all' || asset.video === (kind === 'video')) && matchesOrigin(asset, select('origin-filter').value) && `${asset.name} ${asset.path} ${originName(asset)} ${asset.dealerLabel||''}`.toLocaleLowerCase('sv').includes(search));
  const list = element('asset-list');
  list.replaceChildren();
  text('asset-count', String(assets.length));
  text('library-scope', target === 'b' ? 'B · referenser från alla spår' : element<HTMLInputElement>('all-tracks').checked ? 'Alla spår · manuellt val' : `A · ${trackLabels[workflow]}`);
  if (!assets.length) {
    const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = 'Inget material matchar filtret.'; list.append(empty); return;
  }
  for (const asset of assets) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'asset-item'; button.dataset.path = asset.path;
    button.classList.toggle('is-a', chosen.a === asset.path); button.classList.toggle('is-b', chosen.b === asset.path);
    button.title = `${asset.name}\n${asset.path}\n${originName(asset)}`;
    button.setAttribute('aria-label', asset.video ? `Välj ${asset.name} som ${target === 'a' ? 'kandidat A' : 'referens B'}` : `Öppna bilden ${asset.name}`);
    const thumb = document.createElement('span'); thumb.className = 'asset-thumb';
    if (!asset.video) {
      const img = document.createElement('img'); img.src = fileUrl(asset.path); img.loading = 'lazy'; img.alt = ''; thumb.append(img);
    } else {
      const preview = document.createElement('video'); preview.src = fileUrl(asset.path); preview.preload = 'metadata'; preview.muted = true; preview.playsInline = true; preview.setAttribute('aria-hidden', 'true'); preview.tabIndex = -1; thumb.append(preview);
    }
    const copy = document.createElement('span'); copy.className = 'asset-copy';
    const name = document.createElement('span'); name.className = 'asset-name'; name.textContent = asset.displayName || asset.name;
    const meta = document.createElement('span'); meta.className = 'asset-meta'; meta.textContent = `${originName(asset)} · ${bytesLabel(asset.bytes)}`;
    const tags = document.createElement('span'); tags.className = 'asset-tags';
    const stage = document.createElement('span'); stage.textContent = stageName(asset); tags.append(stage);
  const identity = document.createElement('span'); identity.textContent = asset.dealerLabel || 'Oklassificerat'; tags.append(identity);
    for (const side of ['a', 'b'] as const) if (chosen[side] === asset.path) {
      const tag = document.createElement('span'); tag.className = `selection-tag tag-${side}`; tag.textContent = side.toUpperCase(); tags.append(tag);
    }
    copy.append(name, meta, tags); button.append(thumb, copy); list.append(button);
  }
}
function getAsset(side: Side) { return data.assets.find(asset => asset.path === chosen[side]); }
function duration(side: Side) { return Number.isFinite(video[side].duration) ? video[side].duration : assetMetadata(getAsset(side)).duration || 0; }
function maximumDuration() { return Math.max(duration('a'), duration('b'), 0); }
function updateLocation() {
  const url = new URL(location.href);
  url.searchParams.set('track', workflow);
  if (element<HTMLInputElement>('all-tracks').checked) url.searchParams.set('all', '1'); else url.searchParams.delete('all');
  for (const side of ['a', 'b'] as const) chosen[side] ? url.searchParams.set(side, chosen[side]) : url.searchParams.delete(side);
  history.replaceState(null, '', url);
  window.dispatchEvent(new CustomEvent('studio-selection', { detail: { track: workflow, a: getAsset('a')?.sha256 || null, b: getAsset('b')?.sha256 || null } }));
}
function pause() {
  playRequest += 1;
  playing = false; video.a.pause(); video.b.pause(); updatePlayButton();
}
function updatePlayButton() {
  element('play-toggle').setAttribute('aria-label', playing ? 'Pausa båda klippen' : 'Spela båda klippen');
  element('play-toggle').setAttribute('aria-pressed', String(playing));
  element('play-icon').setAttribute('d', playing ? 'M7 5h4v14H7zM15 5h4v14h-4z' : 'm9 5 11 7-11 7Z');
}
function seek(time: number) {
  position = Math.max(0, Math.min(time, maximumDuration()));
  for (const side of ['a', 'b'] as const) {
    if (video[side].readyState > 0 && duration(side) > 0) video[side].currentTime = Math.min(position, duration(side));
  }
  updateTimeline(); drawOverlay();
}
async function play() {
  if (!chosen.a && !chosen.b) return;
  const request = ++playRequest;
  if (position >= maximumDuration() - .025) seek(0);
  const candidates = (['a', 'b'] as const).filter(side => chosen[side] && (position < duration(side) || !duration(side)));
  if (!candidates.length) return;
  const results = await Promise.allSettled(candidates.map(side => video[side].play()));
  if (request !== playRequest) return;
  if (results.some(result => result.status === 'rejected')) {
    pause(); text('play-status', 'Kunde inte spela alla valda klipp. Kontrollera filformatet.'); return;
  }
  playing = true; updatePlayButton(); text('play-status', 'Spelar med gemensam tidsposition · inte bildruteexakt synk'); requestFrame(playbackFrame);
}
function playbackFrame() {
  if (!playing) return;
  position = Math.max(...(['a', 'b'] as const).map(side => Number.isFinite(video[side].currentTime) ? video[side].currentTime : 0));
  updateTimeline(); drawOverlay();
  if (maximumDuration() && position >= maximumDuration() - .025 && video.a.paused && video.b.paused) {
    playing = false;
    if (element<HTMLInputElement>('loop-playback').checked) { seek(0); void play(); }
    else { updatePlayButton(); text('play-status', 'Uppspelningen är klar.'); }
  } else requestFrame(playbackFrame);
}
function updateTimeline() {
  const max = maximumDuration();
  text('current-time', timeLabel(position)); text('total-time', timeLabel(max));
  text('ruler-quarter', shortTime(max / 4)); text('ruler-half', shortTime(max / 2)); text('ruler-threequarter', shortTime(max * .75)); text('ruler-end', shortTime(max));
  const slider = element<HTMLInputElement>('timeline-position'); slider.max = String(max || 1); slider.value = String(position); slider.disabled = !max;
  const progress = max ? position / max : 0;
  element('playhead').style.left = `calc(23px + (100% - 23px) * ${progress})`;
  for (const side of ['a', 'b'] as const) {
    text(`duration-${side}`, duration(side) ? `${duration(side).toFixed(2).replace('.', ',')} s` : '—');
    element(`track-${side}`).style.width = `${max && chosen[side] ? duration(side) / max * 100 : 0}%`;
    element(`track-${side}`).style.visibility = chosen[side] ? 'visible' : 'hidden';
  }
}
function updateStepControl() {
  const fps = assetMetadata(getAsset('a')).fps;
  const rate = select('frame-rate'); const old = rate.value;
  rate.replaceChildren();
  if (fps && fps > 0) rate.add(new Option(`A · ${fps.toFixed(3).replace(/\.?0+$/, '')} fps`, String(fps)));
  for (const value of [24, 25, 30, 60]) rate.add(new Option(`1/${value} s (manuellt)`, String(value)));
  rate.value = fps && fps > 0 ? String(fps) : old || '24';
  rate.title = fps ? 'Uppmätt bildfrekvens för A. Webbläsarsökning är inte bildruteexakt.' : 'Manuell steglängd. Filens bildfrekvens är okänd.';
}
function loadMedia(side: Side, path: string, refresh = true) {
  const asset = data.assets.find(candidate => candidate.path === path && candidate.video);
  pause();
  chosen[side] = asset?.path || '';
  const player = video[side];
  if (asset) player.src = fileUrl(asset.path); else player.removeAttribute('src');
  player.playbackRate = Number(select('playback-speed').value || 1);
  player.load();
  select(`select-${side}`).value = chosen[side];
  element(`empty-${side}`).hidden = Boolean(asset);
  if (!asset) element(`empty-${side}`).textContent = 'Välj ett klipp i biblioteket.';
  text(`name-${side}`, asset?.displayName || asset?.name || 'Ingen fil vald');
  text(`track-name-${side}`, asset?.displayName || asset?.name || `Ingen ${side === 'a' ? 'kandidat' : 'referens'}`);
  text(`kind-${side}`, asset ? `${asset.dealerLabel || 'Oklassificerat'} · ${trackLabels[asset.track || 'unclassified']}` : '');
  text(`dimensions-${side}`, '—');
  seek(0);
  if (side === 'a') {
    text('selected-path', asset?.path || 'Välj ett klipp för att börja.');
    text('source-badge', asset ? originName(asset) : 'Lokalt');
    select('review-asset').value = chosen.a; select('experiment-source').value = chosen.a;
    updateStepControl();
    element('naming-note').hidden = !/(?:^|[_-])(?:f73|s303)(?:[_\-.]|$)/i.test(asset?.name || '');
  } else select('experiment-reference').value = chosen.b;
  element<HTMLButtonElement>('contact-sheet').disabled = !chosen.a;
  updateGeometry();
  if (refresh) { renderLibrary(); updateLocation(); }
}

function schemeWorkflow(scheme: MotionScheme): Workflow {
  if (scheme.workflow) return scheme.workflow;
  if (/^(?:alternative|alt|3d)/i.test(scheme.id)) return 'alternative';
  if (/^(?:kevin|emil)/i.test(scheme.id)) return 'kevin';
  return 'main';
}
function currentWorkflowSchemes() { return data.schemes.filter(scheme => schemeWorkflow(scheme) === workflow); }
function refreshCandidateOptions() {
  const videos = data.assets.filter(asset => asset.video && (element<HTMLInputElement>('all-tracks').checked || asset.track === workflow));
  const selected = videos.some(asset => asset.path === chosen.a) ? chosen.a : videos[0]?.path || '';
  populateSelect('select-a', [{ value: '', label: 'Välj ett klipp…' }, ...videos.map(asset => ({ value: asset.path, label: `${asset.dealerLabel || 'Oklassificerat'} · ${asset.displayName || asset.name}` }))], selected);
  if (selected !== chosen.a) loadMedia('a', selected, false);
}
function setWorkflow(next: Workflow) {
  workflow = next;
  element('alternative-composition').hidden = workflow !== 'alternative';
  element<HTMLInputElement>('asset-search').value = '';
  select('dealer-filter').value = 'all'; select('origin-filter').value = 'all';
  element<HTMLInputElement>('all-tracks').checked = false;
  refreshCandidateOptions();
  document.querySelectorAll<HTMLButtonElement>('[data-workflow]').forEach(button => {
    const selected = button.dataset.workflow === workflow;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  const schemes = currentWorkflowSchemes();
  populateSelect('scheme-select', schemes.length ? schemes.map(scheme => ({ value: scheme.id, label: scheme.label })) : [{ value: '', label: 'Inget verifierat källschema' }]);
  select('scheme-select').disabled = !schemes.length;
  const labels: Record<Workflow, string> = { main: 'SCOUTGAMING IDAG', kevin: 'KEVIN / EMIL', alternative: 'ALTERNATIVA PIPELINES' };
  text('workflow-eyebrow', labels[workflow]);
  text('workflow-context', workflow === 'alternative'
    ? 'Två separata referenser: äldre 3D-scen och Görans helkroppspipeline. Ingen gemensam spelkoppling är verifierad.'
    : workflow === 'kevin' ? 'Separata källreferenser från Kevin/Emil. Visade filmer kopplas inte automatiskt till schemat.'
    : 'Nuvarande Scoutgaming-kontrakt. Källschema och vald film är separata tills filkopplingen är verifierad.');
  renderScheme(); renderSequence(); renderLibrary(); updateLocation();
}
function currentScheme() { return currentWorkflowSchemes().find(scheme => scheme.id === select('scheme-select').value); }
function currentTransition() { return currentScheme()?.transitions.find(transition => transition.id === select('transition-select').value); }
function renderScheme() {
  const scheme = currentScheme();
  populateSelect('transition-select', (scheme?.transitions || []).map(transition => ({ value: transition.id, label: transition.label })));
  select('transition-select').disabled = !scheme?.transitions.length;
  text('scheme-summary', scheme?.summary || 'Inget källschema finns i underlaget.');
  text('scheme-source', scheme ? `${scheme.sourceRef}\n${scheme.sourcePath}` : 'Källa saknas');
  text('scheme-notes', (scheme?.notes || []).join(' '));
  renderTransition();
}
function renderTransition() {
  const scheme = currentScheme(); const transition = currentTransition();
  const flow = element('state-flow'); flow.replaceChildren();
  if (transition) {
    const from = document.createElement('span'); from.className = 'state-node'; from.textContent = scheme?.states.find(state => state.id === transition.from)?.label || transition.from;
    const arrow = document.createElement('i'); arrow.className = 'state-arrow'; arrow.textContent = '→';
    const to = document.createElement('span'); to.className = 'state-node'; to.textContent = scheme?.states.find(state => state.id === transition.to)?.label || transition.to;
    flow.append(from, arrow, to);
  }
  const mapped = transition?.assetPath && data.assets.find(asset => asset.path === transition.assetPath && asset.video);
  text('transition-key', transition?.clipKey || 'Ingen klippnyckel i källan');
  text('mapping-status', mapped ? `Lokalt klipp: ${mapped.name}` : transition?.remoteUrl ? 'Klippet finns i källan men saknas lokalt. Importera det för att jämföra.' : 'Ingen verifierad lokal klippkoppling. Manuell jämförelse är möjlig.');
  element('mapping-status').classList.toggle('available', Boolean(mapped));
  element<HTMLButtonElement>('load-transition').disabled = !mapped;
  text('scheme-evidence', transition?.evidence || scheme?.summary || 'Ingen evidens angiven för vald övergång.');
  element<HTMLButtonElement>('add-sequence').disabled = !transition;
  selectedPoint = null; hoveredPoint = null;
  element<HTMLInputElement>('source-frame').value = '0';
  updateGeometry();
  updateSequenceGuidance();
}
function sequenceEntry(entry: SequenceEntry) {
  const scheme = data.schemes.find(item => item.id === entry.schemeId);
  return { scheme, transition: scheme?.transitions.find(item => item.id === entry.transitionId) };
}
function updateSequenceGuidance() {
  const items = sequences[workflow];
  element('next-state').classList.remove('sequence-warning');
  if (!items.length) { text('next-state', currentTransition() ? 'Lägg först till en övergång. Därefter visas vilket startläge nästa behöver.' : 'Detta referensspår har inga verifierade övergångar.'); return; }
  const last = sequenceEntry(items[items.length - 1]).transition;
  const next = currentTransition();
  if (!last) { text('next-state', 'Den senaste övergångens källa är inte längre tillgänglig.'); return; }
  const mismatch = next && next.from !== last.to;
  text('next-state', `${mismatch ? 'Skarven passar inte. ' : ''}Senaste slutar i ${last.to}; nästa behöver börja i ${last.to}.`);
  element('next-state').classList.toggle('sequence-warning', Boolean(mismatch));
}
function renderSequence() {
  const list = element('sequence-list'); list.replaceChildren();
  const items = sequences[workflow]; let invalidJoins = 0; let mixedSources = 0; let missingFiles = 0; let changedSources = 0;
  for (const [index, entry] of items.entries()) {
    const { scheme, transition } = sequenceEntry(entry);
    const previous = index ? sequenceEntry(items[index - 1]) : null;
    const mismatch = Boolean(previous?.transition && transition && previous.transition.to !== transition.from);
    const mixed = Boolean(index && items[index - 1].schemeId !== entry.schemeId);
    const sourceChanged = !scheme || scheme.sourceRef !== entry.sourceRef;
    if (mismatch) invalidJoins++;
    if (mixed) mixedSources++;
    if (sourceChanged) changedSources++;
    const mapped = transition?.assetPath && data.assets.some(asset => asset.path === transition.assetPath && asset.video);
    if (!mapped) missingFiles++;
    const card = document.createElement('div'); card.className = `sequence-card${mismatch || mixed || sourceChanged ? ' has-warning' : ''}`;
    const open = document.createElement('button'); open.type = 'button'; open.className = 'sequence-open'; open.dataset.sequenceIndex = String(index);
    const number = document.createElement('span'); number.className = 'sequence-number'; number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span'); copy.className = 'sequence-copy';
    const name = document.createElement('strong'); name.textContent = transition?.clipKey || entry.transitionId;
    const states = document.createElement('span'); states.textContent = transition ? `${transition.from} → ${transition.to}` : 'Källan saknas';
    const status = document.createElement('small'); status.textContent = sourceChanged ? 'Källrevision ändrad · lägg till på nytt' : mismatch ? 'Startläget bryter föregående slutläge' : mixed ? 'Annat källschema · skarv ej verifierad' : mapped ? 'Lokalt klipp finns' : 'Planerad · videofil saknas';
    open.title = `${scheme?.label || entry.schemeId}\n${transition?.label || ''}`;
    copy.append(name, states, status); open.append(number, copy);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'sequence-remove'; remove.dataset.removeSequence = String(index); remove.textContent = '×'; remove.setAttribute('aria-label', `Ta bort steg ${index + 1}`);
    card.append(open, remove); list.append(card);
  }
  element<HTMLButtonElement>('clear-sequence').disabled = !items.length;
  text('sequence-status', !items.length ? 'Välj en övergång i Rörelseschema och lägg till i följden.' : changedSources ? `${changedSources} steg har ändrad eller saknad källrevision. Lägg till dessa steg på nytt.` : invalidJoins ? `${invalidJoins} skarv(ar) har olika till/från-lägen. Följden är inte sammanhängande.` : mixedSources ? `${mixedSources} skarv(ar) byter källschema. Gemensamma till/från-namn bevisar inte kompatibilitet.` : `Till/från-lägen passar i schemat. ${missingFiles ? `${missingFiles} steg saknar verifierad lokal filkoppling.` : 'Videoklippen finns lokalt; skarvar återstår att granska.'}`);
  element('sequence-status').classList.toggle('sequence-warning', Boolean(invalidJoins || mixedSources || changedSources));
  updateSequenceGuidance();
}
function hasCalibration() {
  const calibration = currentScheme()?.coordinateSpace?.calibration;
  return Boolean(calibration?.assetPath && calibration.assetPath === chosen.a && calibration.evidence);
}
function points(): Point[] {
  return (currentTransition()?.coordinates?.points || []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}
function updateGeometry() {
  const coordinates = currentTransition()?.coordinates;
  const sourceSlider = element<HTMLInputElement>('source-frame');
  element('source-scrubber').hidden = !coordinates?.track;
  sourceSlider.max = String(Math.max(0, (coordinates?.timing?.frames || 1) - 1));
  const space = currentScheme()?.coordinateSpace;
  const valid = Boolean(space && space.width > 0 && space.height > 0 && points().length);
  const calibrated = valid && hasCalibration();
  text('coordinate-size', space ? `${space.width} × ${space.height}` : 'Ej angivet');
  text('coordinate-status', calibrated ? 'Filbunden kalibrering för kandidat A' : 'Källplan · inte kalibrerad mot vald fil');
  element('coordinate-status').classList.toggle('calibrated', calibrated);
  element('map-empty').hidden = valid;
  element('geometry-details').classList.toggle('has-coordinates', valid);
  const toggle = element<HTMLInputElement>('overlay-toggle'); toggle.disabled = !calibrated;
  if (!calibrated) toggle.checked = false;
  text('coordinate-detail', valid ? 'Peka eller klicka på en punkt. Koordinaterna gäller källans plan.' : 'Källan innehåller inga belagda punkter för denna övergång.');
  renderSourceMap(); drawOverlay();
}
function canvasContext(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
  const context = canvas.getContext('2d');
  if (context) { context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, rect.width, rect.height); }
  return { context, width: rect.width, height: rect.height };
}
function sourceMapTransform(width: number, height: number) {
  const space = currentScheme()?.coordinateSpace;
  if (!space || space.width <= 0 || space.height <= 0) return null;
  const scale = Math.min((width - 34) / space.width, (height - 28) / space.height);
  return { scale, x: (width - space.width * scale) / 2, y: (height - space.height * scale) / 2, space };
}
function renderSourceMap() {
  const { context, width, height } = canvasContext(element<HTMLCanvasElement>('source-map'));
  if (!context) return;
  const transform = sourceMapTransform(width, height); if (!transform) return;
  const { scale, x, y, space } = transform;
  context.fillStyle = '#eef2ef'; context.fillRect(x, y, space.width * scale, space.height * scale);
  context.strokeStyle = '#d7dfd8'; context.lineWidth = 1; context.strokeRect(x, y, space.width * scale, space.height * scale);
  context.save(); context.setLineDash([2, 3]); context.strokeStyle = '#dfe5df';
  for (let n = 1; n < 4; n++) {
    context.beginPath(); context.moveTo(x + space.width * scale * n / 4, y); context.lineTo(x + space.width * scale * n / 4, y + space.height * scale); context.stroke();
    context.beginPath(); context.moveTo(x, y + space.height * scale * n / 4); context.lineTo(x + space.width * scale, y + space.height * scale * n / 4); context.stroke();
  }
  context.restore();
  context.fillStyle = '#a0aba3'; context.font = '8px Segoe UI, sans-serif'; context.fillText('0,0', x, Math.max(y - 5, 9));
  const coordinates = currentTransition()?.coordinates, track = coordinates?.track;
  const sourceFrame = Number(element<HTMLInputElement>('source-frame').value);
  const trackIndex = track ? sourceFrame - track.firstFrame - (coordinates?.timing?.offsetFrames || 0) : -1;
  const frame = track?.frames[trackIndex];
  const centre = points().find(point => point.id === track?.positionId);
  text('source-frame-label', `Källruta ${sourceFrame} · ${frame ? 'uppmätt kortspår' : 'inget kortspår i denna ruta'} · separat från A/B`);
  if (frame && centre) {
    for (const [polygon, fill, stroke] of [[frame.body, '#cbd5c9', '#9caf9c'], [frame.q, '#fff', '#37563f']] as const) {
      if (!polygon?.length) continue;
      context.beginPath();
      polygon.forEach(([dx,dy], index) => { const px=x+(centre.x+dx)*scale, py=y+(centre.y+dy)*scale; if(index===0) context.moveTo(px,py); else context.lineTo(px,py); });
      context.closePath(); context.fillStyle=fill; context.fill(); context.strokeStyle=stroke; context.lineWidth=1; context.stroke();
    }
  }
  const pointItems = points();
  for (const point of pointItems) {
    const px = x + point.x * scale, py = y + point.y * scale;
    const active = point.id === hoveredPoint || point.id === selectedPoint;
    context.beginPath(); context.arc(px, py, active ? 6 : 4, 0, Math.PI * 2); context.fillStyle = active ? '#37563f' : '#6d8e72'; context.fill();
    context.strokeStyle = '#fff'; context.lineWidth = 1.5; context.stroke();
    context.font = `${active ? '600 ' : ''}9px Segoe UI, sans-serif`; context.fillStyle = active ? '#35523c' : '#6f7c73';
    const label = point.label || point.id;
    const textWidth = context.measureText(label).width;
    const labelX = Math.max(3, Math.min(width - textWidth - 3, px - textWidth / 2));
    context.fillText(label, labelX, py + (pointItems.indexOf(point) % 2 ? 17 : -10));
  }
}
function drawOverlay() {
  const canvas = element<HTMLCanvasElement>('video-overlay');
  const visible = hasCalibration() && element<HTMLInputElement>('overlay-toggle').checked && Boolean(video.a.videoWidth);
  canvas.hidden = !visible;
  if (!visible) return;
  const { context, width, height } = canvasContext(canvas);
  const space = currentScheme()?.coordinateSpace;
  if (!context || !space) return;
  // Source pixels are mapped into the video's actual contain rectangle, including letterboxing.
  const contain = Math.min(width / video.a.videoWidth, height / video.a.videoHeight);
  const contentWidth = video.a.videoWidth * contain, contentHeight = video.a.videoHeight * contain;
  const offsetX = (width - contentWidth) / 2, offsetY = (height - contentHeight) / 2;
  for (const point of points()) {
    const x = offsetX + point.x / space.width * contentWidth, y = offsetY + point.y / space.height * contentHeight;
    context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fillStyle = '#d9ef7e'; context.fill(); context.strokeStyle = '#223c21'; context.lineWidth = 1.5; context.stroke();
    context.font = '11px Segoe UI, sans-serif'; context.fillStyle = '#effbd0'; context.fillText(point.label || point.id, x + 8, y - 7);
  }
}
function mapHit(event: PointerEvent) {
  const rect = element('source-map').getBoundingClientRect(); const transform = sourceMapTransform(rect.width, rect.height);
  if (!transform) return null;
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  return points().find(point => Math.hypot(x - (transform.x + point.x * transform.scale), y - (transform.y + point.y * transform.scale)) <= 15) || null;
}
function describePoint(point: Point | undefined | null) {
  text('coordinate-detail', point ? `${point.label || point.id}: x ${point.x} · y ${point.y} px i källans koordinatsystem.` : points().length ? 'Peka eller klicka på en punkt. Koordinaterna gäller källans plan.' : 'Källan innehåller inga belagda punkter för denna övergång.');
}
function setInspector(tab: 'library' | 'motion' | 'review') {
  studioRoot.dataset.dock = tab;
  for (const item of ['library', 'motion', 'review'] as const) {
    element(`tab-${item}`).setAttribute('aria-selected', String(item === tab));
    element(`tab-${item}`).tabIndex = item === tab ? 0 : -1;
  }
  for (const item of ['motion', 'review'] as const) element(`${item}-panel`).hidden = item !== tab;
  if (tab === 'motion') requestFrame(renderSourceMap);
}
function showImage(path: string, title: string, detail = path) {
  pause();
  imageObjectPath = path;
  text('image-title', title); text('image-path', detail);
  const img = element<HTMLImageElement>('image-preview'); img.src = fileUrl(path); img.alt = title;
  element<HTMLDialogElement>('image-dialog').showModal();
}
function setupData() {
  const url = new URL(location.href);
  const requestedTrack = url.searchParams.get('track');
  if (requestedTrack === 'main' || requestedTrack === 'kevin' || requestedTrack === 'alternative') workflow = requestedTrack;
  else {
    const requested = data.assets.find(asset => asset.path === url.searchParams.get('a'))?.track;
    if (requested && requested !== 'unclassified') workflow = requested;
  }
  const videos = data.assets.filter(asset => asset.video);
  const videoOptions = [{ value: '', label: 'Välj ett klipp…' }, ...videos.map(asset => ({ value: asset.path, label: `${trackLabels[asset.track || 'unclassified']} · ${asset.dealerLabel || 'Oklassificerat'} · ${asset.displayName || asset.name}` }))];
  for (const side of ['a', 'b'] as const) populateSelect(`select-${side}`, videoOptions);
  const assets = data.assets.map(asset => ({ value: asset.path, label: asset.name }));
  populateSelect('experiment-source', assets); populateSelect('review-asset', assets);
  populateSelect('experiment-reference', [{ value: '', label: 'Ingen referens' }, ...assets]);
  populateSelect('review-run', data.runs.length ? data.runs.map(run => ({ value: run.id, label: run.title || run.id })) : [{ value: '', label: 'Skapa ett försök först' }], url.searchParams.get('run') || undefined);
  element<HTMLButtonElement>('save-review').disabled = !data.runs.length || !data.assets.length;
  element<HTMLButtonElement>('save-experiment').disabled = !data.assets.length;
  text('review-hint', data.runs.length ? 'Sparas i försökets QA-mapp med SHA-256.' : 'Skapa ett försök med knappen uppe till höger.');
  const workflowSchemes = currentWorkflowSchemes();
  populateSelect('scheme-select', workflowSchemes.length ? workflowSchemes.map(scheme => ({ value: scheme.id, label: scheme.label })) : [{ value: '', label: 'Inget verifierat källschema' }]);
  select('scheme-select').disabled = !workflowSchemes.length;
  const a = videos.find(asset => asset.path === url.searchParams.get('a')) || videos.find(asset => asset.name === 'goran_vila_grundloop.mp4') || videos[0];
  const b = videos.find(asset => asset.path === url.searchParams.get('b')) || videos.find(asset => asset.name === 'idle_breath_f73_s303.mp4') || videos.find(asset => asset.path !== a?.path);
  loadMedia('a', a?.path || '', false); loadMedia('b', b?.path || '', false);
  setWorkflow(workflow);
  if (url.searchParams.get('all') === '1') { element<HTMLInputElement>('all-tracks').checked = true; refreshCandidateOptions(); loadMedia('a', a?.path || '', false); renderLibrary(); updateLocation(); }
  text('run-count', String(data.runs.length));
  const list = element('runs-list'); list.replaceChildren();
  if (!data.runs.length) { const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = 'Inga sparade försök ännu. Börja med en kandidat och en hypotes.'; list.append(empty); }
  for (const run of data.runs) {
    const row = document.createElement('div'); row.className = 'run-item';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = run.title || 'Försöksplan'; const id = document.createElement('small'); id.textContent = run.id; copy.append(title, id);
    const link = document.createElement('a'); link.href = fileUrl(`runs/${run.id}/job.json`); link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Öppna plan ↗'; row.append(copy, link); list.append(row);
  }
  text('connection-status', `127.0.0.1 · ${videos.length} klipp · ${data.assets.length - videos.length} bilder`);
}

document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach(button => listen(button, 'click', () => element<HTMLDialogElement>(button.dataset.open!).showModal()));
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button => listen(button, 'click', () => button.closest('dialog')?.close()));
document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button => listen(button, 'click', () => {
  kind = button.dataset.kind!; document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(tab => { tab.classList.toggle('selected', tab === button); tab.setAttribute('aria-pressed', String(tab === button)); }); renderLibrary();
}));
document.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(button => listen(button, 'click', () => {
  target = button.dataset.target as Side; document.querySelectorAll<HTMLButtonElement>('[data-target]').forEach(tab => { tab.classList.toggle('selected', tab === button); tab.setAttribute('aria-pressed', String(tab === button)); }); renderLibrary();
}));
listen(element('asset-search'), 'input', renderLibrary); listen(element('origin-filter'), 'change', renderLibrary); listen(element('dealer-filter'), 'change', renderLibrary);
listen(element('all-tracks'), 'change', () => { refreshCandidateOptions(); renderLibrary(); updateLocation(); });
listen(element('asset-list'), 'click', event => {
  const path = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-path]')?.dataset.path;
  const asset = data.assets.find(item => item.path === path); if (!asset) return;
  if (asset.video) loadMedia(target, asset.path); else showImage(asset.path, asset.name);
});
for (const side of ['a', 'b'] as const) {
  listen(select(`select-${side}`), 'change', () => loadMedia(side, select(`select-${side}`).value));
  listen(video[side], 'loadedmetadata', () => {
    const metadata = assetMetadata(getAsset(side));
    text(`dimensions-${side}`, `${video[side].videoWidth} × ${video[side].videoHeight}${metadata.fps ? ` · ${metadata.fps.toFixed(3).replace(/\.?0+$/, '')} fps` : ''}`);
    updateTimeline(); drawOverlay();
  });
  listen(video[side], 'error', () => {
    if (!chosen[side]) return;
    element(`empty-${side}`).hidden = false;
    element(`empty-${side}`).textContent = 'Klippet kunde inte läsas i webbläsaren.';
    text('play-status', 'Ett klipp kunde inte läsas. Välj en annan fil eller kontrollera formatet.');
  });
}
listen(element('swap-clips'), 'click', () => { const a = chosen.a, b = chosen.b; if (getAsset('b')?.track !== workflow) { element<HTMLInputElement>('all-tracks').checked = true; refreshCandidateOptions(); } loadMedia('a', b, false); loadMedia('b', a, false); renderLibrary(); updateLocation(); });
listen(element('play-toggle'), 'click', () => { if (playing) { pause(); text('play-status', 'Pausat · gemensam tidsposition, inte bildruteexakt synk'); } else void play(); });
listen(element('reset-playback'), 'click', () => { pause(); seek(0); });
for (const [id, direction] of [['previous-frame', -1], ['next-frame', 1]] as const) listen(element(id), 'click', () => { pause(); seek(position + direction / Number(select('frame-rate').value || 24)); text('play-status', 'Tidssteg i webbläsaren · bildruteexakt avkodning är inte verifierad'); });
listen(element('timeline-position'), 'input', () => { pause(); seek(Number(element<HTMLInputElement>('timeline-position').value)); });
listen(element('playback-speed'), 'change', () => { for (const player of Object.values(video)) player.playbackRate = Number(select('playback-speed').value); });
listen(element('scheme-select'), 'change', renderScheme);
listen(element('transition-select'), 'change', () => {
  renderTransition(); const transition = currentTransition();
  if (transition?.assetPath && data.assets.some(asset => asset.path === transition.assetPath && asset.video)) loadMedia('a', transition.assetPath);
});
listen(element('load-transition'), 'click', () => { const path = currentTransition()?.assetPath; if (path) loadMedia('a', path); });
document.querySelectorAll<HTMLButtonElement>('[data-workflow]').forEach(button => listen(button, 'click', () => setWorkflow(button.dataset.workflow as Workflow)));
listen(element('add-sequence'), 'click', () => {
  const scheme = currentScheme(), transition = currentTransition();
  if (!scheme || !transition) return;
  sequences[workflow].push({ schemeId: scheme.id, transitionId: transition.id, sourceRef: scheme.sourceRef }); renderSequence();
});
listen(element('clear-sequence'), 'click', () => { sequences[workflow] = []; renderSequence(); });
listen(element('sequence-list'), 'click', event => {
  const remove = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-sequence]');
  if (remove) { sequences[workflow].splice(Number(remove.dataset.removeSequence), 1); renderSequence(); return; }
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-sequence-index]');
  if (!button) return;
  const entry = sequences[workflow][Number(button.dataset.sequenceIndex)]; if (!entry) return;
  const { scheme, transition } = sequenceEntry(entry); if (!scheme || !transition) return;
  select('scheme-select').value = scheme.id; renderScheme(); select('transition-select').value = transition.id; renderTransition();
  if (transition.assetPath && data.assets.some(asset => asset.path === transition.assetPath && asset.video)) loadMedia('a', transition.assetPath);
});
listen(element('overlay-toggle'), 'change', drawOverlay);
listen(element('source-frame'), 'input', renderSourceMap);
listen(element('source-map'), 'pointermove', event => { const point = mapHit(event); hoveredPoint = point?.id || null; describePoint(point || points().find(item => item.id === selectedPoint)); renderSourceMap(); });
listen(element('source-map'), 'pointerleave', () => { hoveredPoint = null; describePoint(points().find(item => item.id === selectedPoint)); renderSourceMap(); });
listen(element('source-map'), 'click', event => { const point = mapHit(event as PointerEvent); selectedPoint = point?.id || null; describePoint(point); renderSourceMap(); });
listen(element('source-map'), 'keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault(); const all = points(); if (!all.length) return; const previous = all.findIndex(point => point.id === selectedPoint); const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp'; const point = all[(previous + (backwards ? -1 : 1) + all.length) % all.length]; selectedPoint = point.id; describePoint(point); renderSourceMap();
});
listen(element('tab-library'), 'click', () => setInspector('library'));
listen(element('tab-motion'), 'click', () => setInspector('motion')); listen(element('tab-review'), 'click', () => setInspector('review'));
const dockTabs = ['library', 'motion', 'review'] as const;
dockTabs.forEach((tab, index) => listen(element(`tab-${tab}`), 'keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? dockTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + dockTabs.length) % dockTabs.length;
  setInspector(dockTabs[next]); element(`tab-${dockTabs[next]}`).focus();
}));
listen(element('geometry-details'), 'toggle', () => requestFrame(renderSourceMap));
listen(element('nav-runs'), 'click', () => { element('runs-panel').hidden = false; element('nav-runs').classList.add('active'); element('nav-workspace').classList.remove('active'); element('runs-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); setInspector('review'); });
listen(element('nav-workspace'), 'click', () => { element('runs-panel').hidden = true; element('nav-runs').classList.remove('active'); element('nav-workspace').classList.add('active'); setInspector('motion'); });
listen(document, 'keydown', event => {
  if (event.code !== 'Space' || (event.target as HTMLElement).closest('input,textarea,select,button,dialog,a,[contenteditable]')) return;
  event.preventDefault(); playing ? pause() : void play();
});
const stageObserver = new ResizeObserver(() => { if (active) { renderSourceMap(); drawOverlay(); } });
stageObserver.observe(element('stage-a')); observers.push(stageObserver);
const mapObserver = new ResizeObserver(() => { if (active) renderSourceMap(); });
mapObserver.observe(element('source-map').parentElement!); observers.push(mapObserver);
listen(element('contact-sheet'), 'click', async () => {
  const path = chosen.a; if (!path) return;
  const button = element<HTMLButtonElement>('contact-sheet'); button.disabled = true; button.textContent = 'Skapar kontaktark…';
  try {
    const response = await fetch(`/api/inspect?path=${encodeURIComponent(path)}`, { signal: lifetime.signal });
    const result = await response.json(); if (!active) return; if (!response.ok) throw new Error(result.error || 'Kontaktarket kunde inte skapas.');
    const sheet = result.contactSheetPath || result.posterPath;
    if (!sheet) throw new Error('Inget kontaktark kunde skapas för filen.');
    showImage(sheet, `Kontaktark · ${data.assets.find(asset => asset.path === path)?.name || path}`, `${path}${result.sha256 ? ` · SHA-256 ${result.sha256}` : ''}`);
  } catch (error) { announce(error instanceof Error ? error.message : 'Kontaktarket kunde inte skapas.', true); }
  finally { if (active) { button.disabled = !chosen.a; button.textContent = 'Kontaktark'; } }
});
listen(element('image-preview'), 'error', () => { if (imageObjectPath) text('image-path', `Bilden kunde inte läsas: ${imageObjectPath}`); });
listen(element('load-remote'), 'click', async () => {
  const button = element<HTMLButtonElement>('load-remote'); button.disabled = true;
  const source = select('import-source').value; text('remote-status', 'Hämtar befintliga filer…'); element('remote-list').replaceChildren();
  try {
    const assets: {url: string; name?: string; id?: string}[] = [];
    let cursor = '';
    do {
      const response = await fetch(`/api/remote?source=${encodeURIComponent(source)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: lifetime.signal });
      const result = await response.json(); if (!active || select('import-source').value !== source) return;
      if (!response.ok) throw new Error(result.error || 'Listan kunde inte hämtas.');
      assets.push(...(Array.isArray(result.assets) ? result.assets : []));
      cursor = result.hasMore && result.cursor ? result.cursor : '';
      text('remote-status', `Läser listan… ${assets.length} mediefiler hittills.`);
    } while (cursor);
    text('remote-status', assets.length ? `${assets.length} filer. Välj en för att fylla i direktlänken.` : 'Inga tillgängliga filer i den här källan. Klistra in en direktlänk nedan.');
    for (const asset of assets) {
      if (typeof asset.url !== 'string') continue;
      const row = document.createElement('button'); row.type = 'button'; row.className = 'remote-item'; row.textContent = asset.name || asset.id || 'Namnlös fil';
      listen(row, 'click', () => { element<HTMLInputElement>('import-url').value = asset.url; element<HTMLTextAreaElement>('import-note').value = `${source === 'runway' ? 'Runway' : 'Blob'} · ${asset.name || 'Fil'}${asset.id ? ` · ID ${asset.id}` : ''}`; row.parentElement?.querySelectorAll('.selected').forEach(item => item.classList.remove('selected')); row.classList.add('selected'); });
      element('remote-list').append(row);
    }
  } catch (error) { text('remote-status', error instanceof Error ? error.message : 'Listan kunde inte hämtas.'); }
  finally { if (active) button.disabled = false; }
});
listen(element('import-source'), 'change', () => { element('remote-list').replaceChildren(); text('remote-status', ''); element<HTMLInputElement>('import-url').value = ''; });
for (const form of document.querySelectorAll<HTMLFormElement>('form[method="post"]')) listen(form, 'submit', () => {
  for (const button of form.querySelectorAll<HTMLButtonElement>('button[type="submit"],button:not([type])')) { button.disabled = true; button.textContent = 'Sparar…'; }
});

setupData();
const saved = new URL(location.href).searchParams.get('saved');
if (saved) announce(saved === 'review' ? 'Granskningen är sparad med filhash.' : saved === 'plan' ? 'Försöksplanen är sparad lokalt.' : 'Materialet är importerat till det lokala biblioteket.');
// Refresh is explicit: the initial local snapshot is already in the HTML.
listen(element('refresh-data'), 'click', async () => {
  const button = element<HTMLButtonElement>('refresh-data'); button.disabled = true;
  const schemeId = select('scheme-select').value, transitionId = select('transition-select').value;
  updateLocation();
  try {
    const response = await fetch('/api/studio', { signal: lifetime.signal });
    if (!response.ok) throw new Error('Materialstatus kunde inte uppdateras.');
    const fresh = await response.json();
    if (!active) return;
    if (!Array.isArray(fresh.assets) || !Array.isArray(fresh.schemes) || !Array.isArray(fresh.runs)) throw new Error('Serverns materialsvar kunde inte läsas.');
    data = fresh; setupData();
    if (data.schemes.some(scheme => scheme.id === schemeId)) {
      select('scheme-select').value = schemeId; renderScheme();
      if (currentScheme()?.transitions.some(transition => transition.id === transitionId)) { select('transition-select').value = transitionId; renderTransition(); }
    }
  } catch (error) { announce(error instanceof Error ? error.message : 'Materialstatus kunde inte uppdateras.', true); }
  finally { if (active) button.disabled = false; }
});
studioRoot.dataset.ready = 'true';
return () => {
  active = false;
  lifetime.abort();
  playRequest += 1;
  playing = false;
  video.a.pause(); video.b.pause();
  for (const id of animationFrames) cancelAnimationFrame(id);
  animationFrames.clear();
  for (const observer of observers) observer.disconnect();
  document.querySelectorAll<HTMLDialogElement>('#dealer-studio dialog[open]').forEach(dialog => dialog.close());
  delete studioRoot.dataset.ready;
};
}

