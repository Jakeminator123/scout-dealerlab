import type { DealerMap, MapAsset, MapNode, Pose, RelationNode } from './dealer-map.ts';
const payload = JSON.parse(document.querySelector('#dealer-map-data')!.textContent!) as { map: DealerMap; urls: Record<string, string>; snapshot: string };
const { map, urls, snapshot } = payload;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const video = el<HTMLVideoElement>('map-video'), image = el<HTMLImageElement>('map-image');
const overlay = document.getElementById('map-overlay')!;
let activeNode: MapNode | null = null, activeAsset: MapAsset | null = null;
let graphMode: 'pilot' | 'focus' = 'pilot', graphMotionId = '';
const text = (id: string, value: string) => { el(id).textContent = value; };
function list(id: string, values: string[]) { el(id).replaceChildren(...values.map(value => { const li = document.createElement('li'); li.textContent = value; return li; })); }
function stopMedia() { video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true; image.hidden = true; image.removeAttribute('src'); overlay.replaceChildren(); activeAsset = null; }
function showMedia(asset: MapAsset | null) {
  stopMedia(); activeAsset = asset; el('map-empty').hidden = !!asset;
  el('overlay-label').hidden = asset?.kind !== 'image';
  if (!asset) { text('map-empty', 'Inget nytt filmprov är kopplat till detta fack.'); text('playback', 'Ingen film spelas.'); text('media-details', 'Fil saknas.'); return; }
  if (!urls[asset.sha256]) throw Error('Published media identity missing');
  if (asset.kind === 'video') { video.src = urls[asset.sha256]; video.hidden = false; text('playback', 'Kandidatfilm, pausad · tryck på spela.'); }
  else { image.src = urls[asset.sha256]; image.hidden = false; text('playback', 'Stillbild · ingen rörelse spelas.'); }
  const link = document.createElement('a'); link.href = urls[asset.sha256]; link.textContent = 'Öppna oförändrat original'; link.target = '_blank'; link.rel = 'noopener';
  const detail = document.createElement('p'); detail.textContent = `${asset.width} × ${asset.height}${asset.kind === 'video' ? ` · ${asset.fps} fps · ${asset.frameCount} rutor` : ''}`;
  const hash = document.createElement('code'); hash.textContent = `SHA-256: ${asset.sha256}`;
  el('media-details').replaceChildren(link, detail, hash);
}
function selectNode(node: MapNode) {
  activeNode = node; text('selected-title', node.label); text('selected-id', node.id); text('selected-type', 'Fack · ' + node.game);
  const variants = Object.keys(node.poseVariants), select = el<HTMLSelectElement>('variant');
  select.replaceChildren(...variants.map(v => new Option(v, v)));
  if (node.assetVariant) select.value = node.assetVariant;
  el('variant-label').hidden = !variants.length;
  text('poses', (variants.length ? node.poseVariants[select.value] : node.poses)?.join(' → ') ?? 'Inte fastställt för detta fack');
  text('acceptance', 'Ej godkänt / obundet'); list('missing', node.missing);
  showMedia(node.asset);
  text('asset-note', node.asset ? 'Lokalt föreslagen filmkoppling. Filen är inte importerad i Main.' : 'Ett katalogfack finns; ett namn skapar ingen film eller spelbindning.');
  text('geometry-note', node.asset ? 'Inga uppmätta rörliga punkter eller handmask finns för denna film. Bildankarnas markeringar läggs därför inte på rörelsen.' : 'Landningar och kontakt ska mätas i den nya filmens eget bildplan.');
  list('point-methods', []);
  document.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.slot === node.id)));
  history.replaceState(null, '', '?slot=' + encodeURIComponent(node.id));
  graphMotionId = map.graph.nodes.find(n => n.type === 'motion' && n.slotId === node.id && n.variant === (select.value || null))?.id ?? '';
  if (!map.pilot.some(step => step.slotId === node.id)) graphMode = 'focus';
  renderRelations();
}
function selectAnchor(id: Pose) {
  activeNode = null; const anchor = map.anchors.find(a => a.id === id)!;
  text('selected-title', `${id} · referensbild`); text('selected-id', `pose/${id.toLowerCase()}`); text('selected-type', 'Ankare · kandidat');
  el('variant-label').hidden = true; text('poses', id); text('acceptance', 'Kandidat / obundet'); showMedia(anchor.asset);
  text('asset-note', 'Grönt är arbetsbakgrunden i originalet. Denna vy bedömer källan, inte en färdig rumskomposition.');
  text('geometry-note', 'Punkter gäller endast denna referensbild i 1536 × 1024. Gula markeringar är uppskattningar; de är inte godkända hand- eller kortspår.');
  list('missing', ['Egna kortlandningar och rörliga handmasker saknas.', 'Stationens nedre bål och bordets skymning är inte godkända för utbytbara bord.']);
  list('point-methods', anchor.points.map(p => `${p.label}: (${p.x}, ${p.y}) source_px. ${p.method}`));
  overlay.setAttribute('viewBox', `0 0 ${anchor.asset.width} ${anchor.asset.height}`);
  for (const p of anchor.points) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(p.x)); circle.setAttribute('cy', String(p.y)); circle.setAttribute('r', '12'); circle.setAttribute('fill', '#ffcf75'); circle.setAttribute('stroke', '#151d22'); circle.setAttribute('stroke-width', '4');
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text'); label.textContent = p.label; label.setAttribute('x', String(p.x - 8)); label.setAttribute('y', String(p.y + 45)); label.setAttribute('font-size', '23'); label.setAttribute('text-anchor', 'middle'); label.setAttribute('fill', '#ffe4ad'); label.setAttribute('stroke', '#10171c'); label.setAttribute('stroke-width', '6'); label.setAttribute('paint-order', 'stroke');
    overlay.append(circle, label);
  }
  (overlay as unknown as HTMLElement).style.visibility = el<HTMLInputElement>('show-overlay').checked ? 'visible' : 'hidden';
  document.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  history.replaceState(null, '', '?anchor=' + id);
  renderRelations();
}
function nodeButton(node: MapNode): HTMLButtonElement {
  const b = document.createElement('button'); b.className = 'slot'; b.dataset.slot = node.id; b.setAttribute('aria-pressed', String(activeNode?.id === node.id));
  const title = document.createElement('span'); title.textContent = node.label;
  const detail = document.createElement('small'); detail.textContent = node.id;
  const status = document.createElement('span'); status.className = 'pill'; status.textContent = node.asset ? '● Filmprov · ej godkänt' : node.game === 'roulette' ? 'Utanför pilot' : 'Film saknas';
  b.append(title, detail, status); b.onclick = () => selectNode(node); return b;
}
function renderCatalog() {
  const query = el<HTMLInputElement>('map-search').value.trim().toLocaleLowerCase('sv-SE');
  const groups = ['Vila, övergångar och scen', 'Givning och vändning', 'Tal och situationer', 'Roulette · separat scope'];
  el('map-groups').replaceChildren(...groups.map((name, col) => {
    const section = document.createElement('div'), h = document.createElement('h3'); h.textContent = name; section.append(h);
    const nodes = map.nodes.filter(n => n.graphLayout.column === col && `${n.label} ${n.id} ${JSON.stringify(n.poseVariants)} ${n.poses}`.toLocaleLowerCase('sv-SE').includes(query));
    if (!nodes.length) { const p = document.createElement('small'); p.textContent = 'Inga matchande fack'; section.append(p); }
    section.append(...nodes.sort((a,b) => a.graphLayout.row-b.graphLayout.row).map(nodeButton)); return section;
  }));
}
const flow = el('pilot-flow');
for (const step of map.pilot) {
  const node = map.nodes.find(n => n.id === step.slotId)!; const b = document.createElement('button'); b.textContent = `${step.order}. ${node.label}${step.variant ? ` · ${step.variant}` : ''}`; b.onclick = () => selectNode(node); flow.append(b);
  if (step.order < map.pilot.length) { const arrow = document.createElement('span'); arrow.textContent = '→'; flow.append(arrow); }
}
text('map-snapshot', `Publicering: ${snapshot} · datakälla ${map.schema}`);
text('candidate-count', `${map.counts.candidateBindings} / 32`); text('accepted-count', `${map.counts.productionAccepted} / 32`);
el('anchor-vila').onclick = () => selectAnchor('VILA'); el('anchor-redo').onclick = () => selectAnchor('REDO');
el<HTMLSelectElement>('variant').onchange = e => {
  if (!activeNode) return;
  const selected=(e.target as HTMLSelectElement).value;
  text('poses', activeNode.poseVariants[selected].join(' → '));
  const matches=selected===activeNode.assetVariant;
  showMedia(matches?activeNode.asset:null);
  text('asset-note', matches?'Filmen hör till denna posevariant; kopplingen är ett lokalt granskningsförslag.':`Ingen film är kopplad till ${selected}. ${activeNode.assetVariant ? `Det befintliga provet hör till ${activeNode.assetVariant}.` : ''}`);
  graphMotionId = map.graph.nodes.find(n => n.type === 'motion' && n.slotId === activeNode!.id && n.variant === selected)?.id ?? '';
  graphMode = 'focus'; renderRelations();
};
el<HTMLInputElement>('show-overlay').onchange = e => { (overlay as unknown as HTMLElement).style.visibility = (e.target as HTMLInputElement).checked ? 'visible' : 'hidden'; };
el<HTMLInputElement>('map-search').oninput = renderCatalog;
const updatePlayback = () => { updateGraphPlayback(); if (!activeAsset || activeAsset.kind !== 'video') return; text('playback', `${video.error ? 'Avkodningsfel' : video.ended ? 'Slut · ingen automatisk loop' : video.paused ? 'Pausad' : 'Spelas här'} · ${video.currentTime.toFixed(3)} s · ungefärlig ruta ${Math.min((activeAsset.frameCount ?? 1)-1,Math.floor(video.currentTime*(activeAsset.fps ?? 0)))} · ${activeNode?.id ?? ''}`); };
for (const name of ['timeupdate','play','pause','ended','error']) video.addEventListener(name, updatePlayback);
el('targets').replaceChildren(...map.targets.map(t => { const s = document.createElement('span'); s.textContent = `Plats ${t.playerSeat} / box${t.box} · omätt`; return s; }));
list('findings', map.findings.map(f => `${f.label}. ${f.detail}`));
el('spaces').replaceChildren(...map.coordinateSpaces.map(space => { const tr = document.createElement('tr'); for (const value of [space.id, space.width && space.height ? `${space.width} × ${space.height}` : 'Ej låst', space.status]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } return tr; }));
text('map-footer', `Main-katalog verifierad vid ${map.mainRevision.slice(0,12)}. Filer, QA, filmkopplingar och koordinater hålls hashbundna. Nya mätningar krävs efter ändrad geometri eller fil.`);
function updateGraphPlayback() {
  const playable = activeAsset?.kind === 'video', playing = playable && !video.paused && !video.ended;
  el<HTMLButtonElement>('graph-play').disabled = !playable;
  text('graph-play', playing ? 'Pausa filmen' : 'Spela vald film');
  text('graph-playing', playable ? `${playing ? 'Spelas här' : video.ended ? 'Slut' : 'Pausad'}: ${activeNode?.label} · ${video.currentTime.toFixed(2)} s. Ingen anslutning till live-spel.` : activeAsset ? 'Referensbild vald · ingen film spelas.' : 'Ingen film kopplad till detta val.');
  document.querySelectorAll<SVGElement>('[data-motion-id]').forEach(g => g.classList.toggle('playing', !!playing && g.dataset.motionId === graphMotionId));
}
function renderRelations() {
  const svg = document.getElementById('relation-graph')!;
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag: string, attrs: Record<string, string | number> = {}, value?: string) => {
    const item = document.createElementNS(ns, tag); for (const [key, v] of Object.entries(attrs)) item.setAttribute(key, String(v)); if (value) item.textContent = value; return item;
  };
  svg.replaceChildren();
  const defs = make('defs'), marker = make('marker', { id:'graph-arrow', viewBox:'0 0 10 10', refX:9, refY:5, markerWidth:7, markerHeight:7, orient:'auto-start-reverse' });
  marker.append(make('path', { d:'M 0 0 L 10 5 L 0 10 z', fill:'#8bbdc7' })); defs.append(marker); svg.append(defs);
  const motion = map.graph.nodes.find(n => n.id === graphMotionId) ?? map.graph.nodes.find(n => n.slotId === 'deal.player.centre/box3' && n.variant === 'base')!;
  graphMotionId = motion.id;
  el('graph-pilot').setAttribute('aria-pressed', String(graphMode === 'pilot')); el('graph-focus').setAttribute('aria-pressed', String(graphMode === 'focus'));
  const edge = (x1: number, y1: number, x2: number, y2: number, label = '', dashed = false) => {
    svg.append(make('path', { d: y1 === y2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1},${y1+65} ${x2},${y2-65} ${x2},${y2}`, fill:'none', stroke:'#8bbdc7', 'stroke-width':2, ...(dashed ? {'stroke-dasharray':'7 6'} : {}), 'marker-end':'url(#graph-arrow)' }));
    if (label) svg.append(make('text', {x:x2,y:y2-14,'text-anchor':'middle',fill:'#b9cdd3','font-size':13}, label));
  };
  const activate = (node: RelationNode) => {
    if (node.type === 'pose' && node.pose) { selectAnchor(node.pose); return; }
    if (node.type === 'motion') {
      selectNode(map.nodes.find(n => n.id === node.slotId)!);
      if (node.variant && el<HTMLSelectElement>('variant').value !== node.variant) { el<HTMLSelectElement>('variant').value = node.variant; el('variant').dispatchEvent(new Event('change')); }
      return;
    }
    if (node.type === 'film' && node.sha256) {
      const owner = map.graph.nodes.find(n => n.id === graphMotionId);
      if (owner) activate(owner);
    }
    const info = node.type === 'film' ? node.sha256 ? `Originalets SHA-256: ${node.sha256}. Originalet visas i spelaren nedanför.` : 'Denna rörelse/posevariant har ännu ingen film.' : node.type === 'target' ? `${node.label}: målplats definierad, landning i Pamelas film ännu omätt.` : node.type === 'track' ? 'Kortspår/kontakt saknas: korthörn och relevanta handkontakter behöver mätas mot exakt filmhash och tid.' : 'Handmask saknas: den ska låta fingrar skymma spelkortet vid rätt tid. Three.js skapar inte denna mask automatiskt.';
    text('graph-detail', info);
  };
  const nodeView = (node: RelationNode, x: number, y: number, subtitle: string, width = 170) => {
    const selected = node.id === motion.id && activeNode !== null;
    const color = node.type === 'pose' ? '#263b52' : node.status === 'candidate' ? '#204a50' : '#493c27';
    const g = make('g', {class:'graph-node',role:'button',tabindex:0,'aria-label':`${node.label}${node.variant ? ` ${node.variant}` : ''} · ${subtitle}`, ...(node.type === 'motion' ? {'data-motion-id':node.id} : {}), transform:`translate(${x},${y})`});
    g.append(make('rect',{x:-width/2,y:-48,width,height:96,rx:14,fill:color,stroke:selected?'#fff':node.status==='candidate'?'#5b8c96':'#c6a269','stroke-width':selected?3:1.5}));
    const words = node.label.split(' '), lines: string[] = ['']; for (const word of words) { const last=lines.length-1; if ((lines[last]+' '+word).trim().length>21 && lines[last]) lines.push(word); else lines[last]=(lines[last]+' '+word).trim(); }
    lines.slice(0,2).forEach((line,i)=>g.append(make('text',{x:0,y:lines.length>1?-12+i*19:-3,'text-anchor':'middle',fill:'#f3f7fa','font-size':15,'font-weight':650},line)));
    g.append(make('text',{x:0,y:30,'text-anchor':'middle',fill:'#d1dce0','font-size':12},subtitle));
    g.addEventListener('click',()=>activate(node)); g.addEventListener('keydown',(event)=>{const e=event as KeyboardEvent;if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(node);}});svg.append(g);
  };
  const pose = (name: Pose) => map.graph.nodes.find(n => n.id === `pose:${name}`)!;
  let originX = 700;
  const views: {node:RelationNode;x:number;subtitle:string}[] = [];
  if (graphMode === 'pilot') {
    const steps = map.pilot.map(step=>map.graph.nodes.find(n=>n.type==='motion'&&n.slotId===step.slotId&&n.variant===step.variant)!);
    views.push({node:pose('VILA'),x:100,subtitle:'Start · tomt bord'}, {node:steps[0],x:300,subtitle:'3 s · filmprov'}, {node:pose('REDO'),x:500,subtitle:'Före givningen'}, {node:steps[1],x:700,subtitle:'6 s · base · filmprov'}, {node:pose('REDO'),x:900,subtitle:'Efter giv · 1 kort kvar'}, {node:steps[2],x:1100,subtitle:'3 s · kortlager återstår'}, {node:pose('VILA'),x:1300,subtitle:'Mål · 1 kort ska ligga kvar'});
    for(let i=0;i<views.length-1;i++)edge(views[i].x+86,115,views[i+1].x-89,115);
    originX = views.find(v=>v.node.id===motion.id)?.x ?? 700;
  } else {
    const start=map.graph.edges.find(e=>e.to===motion.id&&e.relation==='starts'), end=map.graph.edges.find(e=>e.from===motion.id&&e.relation==='ends');
    if(start){views.push({node:map.graph.nodes.find(n=>n.id===start.from)!,x:240,subtitle:'Startpose enligt kontrakt'});edge(326,115,611,115);}
    views.push({node:motion,x:700,subtitle:`${motion.variant??'Övergång'} · ${motion.status==='missing'?'film saknas':'filmprov'}`});
    if(end){views.push({node:map.graph.nodes.find(n=>n.id===end.to)!,x:1160,subtitle:'Slutpose enligt kontrakt'});edge(786,115,1071,115);}
  }
  const dependencies = map.graph.edges.filter(e=>e.from===motion.id&&!['starts','ends'].includes(e.relation));
  const childViews=dependencies.map((e,i)=>({node:map.graph.nodes.find(n=>n.id===e.to)!,x:1400/(dependencies.length+1)*(i+1),edge:e}));
  childViews.forEach(v=>edge(originX,163,v.x,302,v.edge.label,true));
  views.forEach(v=>nodeView(v.node,v.x,115,v.subtitle));
  childViews.forEach(v=>nodeView(v.node,v.x,350,v.node.status==='candidate'?'Finns · ej godkänt':v.node.status==='unmeasured'?'Omätt':'Saknas',225));
  text('graph-detail', `${motion.label}${motion.variant?` · ${motion.variant}`:''}: nedersta raden visar just denna rörelses beroenden. Välj en gul nod för att läsa vad som återstår.`);
  updateGraphPlayback();
}
el('graph-pilot').onclick=()=>{graphMode='pilot';selectNode(map.nodes.find(n=>n.id==='deal.player.centre/box3')!);};
el('graph-focus').onclick=()=>{graphMode='focus';renderRelations();};
el('graph-play').onclick=()=>{if(activeAsset?.kind!=='video')return;if(video.paused){if(video.ended)video.currentTime=0;void video.play().catch(()=>text('graph-playing','Uppspelningen kunde inte starta. Använd videons spelknapp.'));}else video.pause();};
renderCatalog(); const query = new URLSearchParams(location.search); const anchor = query.get('anchor'); const node = map.nodes.find(n => n.id === query.get('slot'));
if (anchor === 'VILA' || anchor === 'REDO') selectAnchor(anchor); else selectNode(node ?? map.nodes.find(n => n.id === 'deal.player.centre/box3')!);
