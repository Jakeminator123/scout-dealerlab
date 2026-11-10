// Compiled to a standalone browser module for the static, read-only review site.
export {};
type Asset = { id: string; path: string; name: string; displayName?: string; publicPreview?: boolean; publicFormat?: {width:number;height:number}; dealerLabel: string; track: string; trackLabel: string; publicUrl: string; video: boolean; width?: number; height?: number; fps?: number; sha256: string };
type Step = { id: string; label: string; from: string; to: string; clipKey: string; assetPath: string | null; hasGeometry: boolean };
type Context = { contentId: string; generatedAt: string; snapshot: string; currentReview?: { comparisons: { a: string; b: string }[] }; assets: Asset[]; terms: { id: string; label: string; aliases: string[]; description: string; status: string }[]; schemes: { id: string; label: string; workflow?: string; transitions: Step[] }[]; status: { complete: string[]; simulated: string[]; remaining: string[]; limitations: string[] } };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const select = (id: string) => $<HTMLSelectElement>(id);
const players = { a: $<HTMLVideoElement>('review-video-a'), b: $<HTMLVideoElement>('review-video-b') };
const stills = { a: $<HTMLImageElement>('review-image-a'), b: $<HTMLImageElement>('review-image-b') };
const params = new URLSearchParams(location.search);
let track = ['main','kevin','alternative'].includes(params.get('track') || '') ? params.get('track')! : 'main';
const selected: Record<'a' | 'b', Asset | undefined> = { a: undefined, b: undefined };
const response = await fetch('/agent-context.json' + (params.get('v') ? '?v=' + encodeURIComponent(params.get('v')!) : ''), { cache: 'no-store' });
if (!response.ok) throw new Error('Granskningsunderlaget kunde inte hämtas');
const context = await response.json() as Context;
function options(node: HTMLSelectElement, items: {value: string; label: string}[]) { node.replaceChildren(...items.map(item => new Option(item.label, item.value))); }
function recordSelection() {
  const url = new URL(location.href); url.searchParams.set('track', track);
  const local = new URL('http://127.0.0.1:4318/'); local.searchParams.set('track', track);
  for (const side of ['a','b'] as const) {
    if (selected[side]) { url.searchParams.set(side, selected[side].id); local.searchParams.set(side, selected[side].path); }
    else { url.searchParams.delete(side); local.searchParams.set(side, ''); }
  }
  history.replaceState(null, '', url);
  $('review-local').setAttribute('href', local.href);
  $('studio-context').textContent = JSON.stringify({ page: 'studio', mode: 'public-snapshot', contentId: context.contentId, snapshot: context.snapshot,
    selection: { track, a: selected.a?.id || null, b: selected.b?.id || null }, details: '/agent-context.json' });
}
function choose(side: 'a' | 'b', id: string) {
  const asset = context.assets.find(item => item.id === id);
  selected[side] = asset;
  players[side].pause();
  players[side].hidden = !asset?.video;
  stills[side].hidden = !asset || asset.video;
  if (asset?.video) players[side].src = asset.publicUrl; else players[side].removeAttribute('src');
  if (asset && !asset.video) { stills[side].src = asset.publicUrl; stills[side].alt = asset.displayName || asset.name; }
  else stills[side].removeAttribute('src');
  players[side].load(); select('review-' + side).value = asset?.id || '';
  $('review-info-' + side).textContent = asset ? `${asset.dealerLabel} · ${asset.trackLabel} · original ${asset.width ?? '?'} × ${asset.height ?? '?'} · ${asset.video ? (asset.fps ?? '?') + ' fps' : 'stillbild'} · SHA ${asset.id.slice(0, 12)}${asset.publicPreview ? ' · visningskopia ' + asset.publicFormat?.width + '×' + asset.publicFormat?.height : ''}` : 'Inget publicerat material valt.';
  const hasVideo = Boolean(selected.a?.video || selected.b?.video);
  $<HTMLButtonElement>('review-play').disabled = !hasVideo;
  $<HTMLButtonElement>('review-pause').disabled = !hasVideo;
  recordSelection();
}
function showStep() {
  const step = context.schemes.find(item => item.id === select('review-scheme').value)?.transitions.find(item => item.id === select('review-step').value);
  $('review-chain').textContent = step ? `${step.from} → ${step.to}` : 'Inga verifierade övergångar';
  $('review-slot').textContent = step ? `Källans klippnyckel: ${step.clipKey}. ${step.assetPath ? 'Källkoppling finns angiven; kontrollera filhash.' : 'Ingen verifierad filmkoppling.'} ${step.hasGeometry ? 'Geometri finns i källschemat.' : ''}` : '';
}
function showScheme() { options(select('review-step'), (context.schemes.find(item => item.id === select('review-scheme').value)?.transitions || []).map(step => ({ value: step.id, label: step.label }))); showStep(); }
function setTrack(next: string, requestedA?: string | null) {
  track = next;
  document.querySelectorAll<HTMLButtonElement>('[data-review-track]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reviewTrack === track)));
  const pool = context.assets.filter(asset => asset.track === track);
  options(select('review-a'), [{value:'',label:'Välj material…'}, ...pool.map(asset => ({value:asset.id,label:asset.dealerLabel + ' · ' + (asset.displayName || asset.name)}))]);
  const current = pool.find(asset => asset.id === requestedA) || (!requestedA ? pool.find(asset => asset.id === selected.a?.id) || pool[0] : undefined);
  choose('a', current?.id || '');
  document.querySelectorAll<HTMLDetailsElement>('[data-material-path]').forEach(row => { const asset = context.assets.find(item => item.path === row.dataset.materialPath); row.hidden = Boolean(asset && asset.track !== track); });
  options(select('review-scheme'), context.schemes.filter(item => item.workflow === track || (!item.workflow && (item.id.startsWith('kevin') ? 'kevin' : item.id.startsWith('alternative') ? 'alternative' : 'main') === track)).map(item => ({value:item.id,label:item.label})));
  showScheme();
  if (requestedA && !current) $('review-message').textContent = 'Det länkade klippet finns inte i denna publicerade version eller hör till ett annat spår. Välj en publicerad film eller uppdatera kopian.';
}
options(select('review-b'), [{value:'',label:'Ingen referens'}, ...context.assets.map(asset => ({value:asset.id,label:asset.trackLabel + ' · ' + asset.dealerLabel + ' · ' + (asset.displayName || asset.name)}))]);
$('review-version').textContent = `Publicerad läskopia · ${context.snapshot} · innehåll ${context.contentId.slice(0, 8)} · ${context.assets.length} material`;
if (params.get('content') && params.get('content') !== context.contentId) $('review-message').textContent = 'Den lokala länken gäller ett annat innehålls-ID. Denna sida visar den senast publicerade kopian; lokala ändringar behöver publiceras.';
const currentPair = context.currentReview?.comparisons[0];
setTrack(track, params.get('a') ?? (track === 'main' ? context.assets.find(asset => asset.path === currentPair?.a)?.id : undefined));
choose('b', params.has('b') ? params.get('b')! : (context.assets.find(asset => asset.path === currentPair?.b) || context.assets.find(asset => asset.video && asset.path.endsWith('/pamela-v4-wan3-padded-idle.mp4')) || context.assets.find(asset => asset.video && asset.track === track && asset.id !== selected.a?.id))?.id || '');
if (params.get('v') && params.get('v') !== context.snapshot) $('review-message').textContent = `Länken skapades för ${params.get('v')}. Nu visas ${context.snapshot}; jämförelsens filer väljs fortfarande med exakta hashvärden.`;
document.querySelectorAll<HTMLButtonElement>('[data-review-track]').forEach(button => button.addEventListener('click', () => setTrack(button.dataset.reviewTrack!)));
for (const side of ['a','b'] as const) select('review-' + side).addEventListener('change', () => choose(side, select('review-' + side).value));
$('review-play').addEventListener('click', () => { for (const side of ['a','b'] as const) if (selected[side]?.video) { players[side].currentTime = 0; void players[side].play().catch(() => { $('review-message').textContent = 'Webbläsaren stoppade uppspelning. Använd filmens egen spelknapp.'; }); } });
$('review-pause').addEventListener('click', () => { players.a.pause(); players.b.pause(); });
select('review-scheme').addEventListener('change', showScheme); select('review-step').addEventListener('change', showStep);
options(select('review-term'), context.terms.map(term => ({value:term.id,label:[term.label, ...term.aliases].join(' · ')})));
function showTerm() { const term = context.terms.find(item => item.id === select('review-term').value); $('review-definition').textContent = term ? `${term.description} (${term.status})` : ''; }
select('review-term').addEventListener('change', showTerm); showTerm();
for (const [key, label] of [['complete','Klart lokalt'],['simulated','Simulerat'],['remaining','Återstår'],['limitations','Begränsningar']] as const) {
  const title = document.createElement('h3'); title.textContent = label;
  const list = document.createElement('ul'); for (const text of context.status[key]) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
  $('review-status').append(title,list);
}
document.querySelectorAll<HTMLButtonElement>('[data-review-assign]').forEach(button => button.addEventListener('click', () => {
  const asset = context.assets.find(item => item.path === button.dataset.reviewAssign); if (!asset) return;
  if (button.dataset.side === 'a') setTrack(asset.track, asset.id); else choose('b',asset.id);
  $('review-studio').scrollIntoView({behavior:'smooth'});
}));


