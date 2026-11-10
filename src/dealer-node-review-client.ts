import type { DealerNodeReview, DealerNodeMotion, DealerNodeRequirement, DealerNodeIdleCandidate } from './dealer-node-review.ts';

const payload = JSON.parse(document.getElementById('dealer-node-review-data')!.textContent!) as { review: DealerNodeReview; urls: Record<string, string> };
const { review, urls } = payload;
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const video = byId<HTMLVideoElement>('candidate-video');
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node;
};
const write = (id: string, text: string) => { byId(id).textContent = text; };
const kindLabel = (kind: string) => ({ idle: 'Vila', approach: 'Till REDO', deal: 'Givning', return: 'Retur' }[kind] ?? kind);
const qaLabel = (status: string) => ({ pending: 'Väntar på QA', rejected: 'Underkänd QA', approved: 'Rörelse-QA godkänd' }[status] ?? status);
const sideLabel = (side: string) => ({ FRONT: 'Framsida', BACK: 'Baksida', EDGE: 'Kant', UNKNOWN: 'Okänd', NOT_APPLICABLE: 'Ej tillämpligt' }[side] ?? side);
const methodLabel = (method: string) => ({ unknown: 'okänd metod', authored: 'författad policy', 'marker-observation': 'markörobservation', 'geometry-observation': 'geometriobservation' }[method] ?? method);
const shortPose = (value: string) => value.replace(/\.RELEASE$/, ' · släpp');
const pretty = (value: unknown): string => value === null || value === undefined ? 'Okänt' : typeof value === 'string' ? value : typeof value === 'boolean' ? value ? 'Ja' : 'Nej' : JSON.stringify(value);
let scope = '', activeMotion: DealerNodeMotion | null = null, activeRequirement: DealerNodeRequirement | null = null;
let selectedRequirement = '';
let activeRange: { start: number; end: number; fps: number } | null = null;
let activeIdle: DealerNodeIdleCandidate | null = null;

function facts(entries: [string, unknown][]) {
  const list = make('dl', '', 'kv');
  for (const [label, value] of entries) list.append(make('dt', label), make('dd', pretty(value)));
  return list;
}
function textList(values: string[]) { const ul = make('ul'); for (const value of values) ul.append(make('li', value)); return ul; }
function fileRef(file: { path: string; sha256: string } | null, label = 'Källa') {
  const node = make('div', '', 'ref');
  if (!file) { node.textContent = `${label}: saknas`; return node; }
  const url = urls[file.path];
  if (url) { const a = make('a', label); a.href = url; a.target = '_blank'; a.rel = 'noopener'; node.append(a); }
  else node.append(make('span', `${label} · ej separat publicerad`));
  node.append(make('p', file.path), make('code', `SHA-256 ${file.sha256}`)); return node;
}
function scopedMotions() { return review.motions.filter(m => review.targets.some(t => t.id === scope) ? m.target === scope : !m.target && (m.from === scope || m.to === scope)); }
function scopedRequirements() { return review.requirements.filter(r => review.targets.some(t => t.id === scope) ? r.target === scope : !r.target && (r.from === scope || r.to === scope)); }
function setLocation() {
  const url = new URL(location.href); for (const key of ['motion', 'target', 'state', 'requirement', 'idle']) url.searchParams.delete(key);
  url.searchParams.set(review.targets.some(t => t.id === scope) ? 'target' : 'state', scope);
  if (activeMotion) url.searchParams.set('motion', activeMotion.id);
  if (selectedRequirement) url.searchParams.set('requirement', selectedRequirement);
  if (activeIdle) url.searchParams.set('idle', activeIdle.id);
  history.replaceState(null, '', url);
}
function renderTree() {
  const entryStates = review.states.filter(state => !review.targets.some(t => t.id === state.id) && review.motions.some(m => !m.target && (m.from === state.id || m.to === state.id)));
  byId('states').replaceChildren(...entryStates.map(state => {
    const button = make('button', '', 'state-node'); button.dataset.scope = state.id;
    button.setAttribute('aria-pressed', String(scope === state.id));
    const motions = review.motions.filter(m => !m.target && (m.from === state.id || m.to === state.id));
    button.append(make('strong', state.label), make('small', `${motions.length} poser och övergångar`)); button.onclick = () => selectScope(state.id); return button;
  }));
  const recipients = [...new Set(review.targets.map(t => t.recipientId))];
  byId('targets').replaceChildren(...recipients.map(recipient => {
    const group = make('section', '', 'target-group'); group.append(make('h3', recipient === 'D' ? 'D · Dealer' : `${recipient} · Spelare`));
    for (const target of review.targets.filter(t => t.recipientId === recipient)) {
      const motions = review.motions.filter(m => m.target === target.id), bound = motions.filter(m => m.candidate);
      const button = make('button', '', 'target-node'); button.dataset.scope = target.id; button.setAttribute('aria-pressed', String(scope === target.id));
      button.setAttribute('aria-label', `${target.id} · ${bound.length} bundna filmkandidater av ${motions.length} rörelser`);
      button.append(make('strong', `C${target.cardOrdinal}`), make('small', bound.length ? `${bound.length} filmkandidater` : 'Film saknas'));
      button.onclick = () => selectScope(target.id); group.append(button);
    }
    return group;
  }));
}
function chooseInitial(motions: DealerNodeMotion[]) { return motions.find(m => m.candidate && m.kind === 'deal' && m.observation.localMotionReview.accepted === true) ?? motions.find(m => m.candidate && m.kind === 'deal') ?? motions.find(m => m.candidate) ?? motions[0] ?? null; }
function selectScope(id: string, initialMotion?: DealerNodeMotion | null, initialRequirement = '') {
  scope = id; selectedRequirement = initialRequirement; byId<HTMLInputElement>('motion-search').value = '';
  const requirements = scopedRequirements(), filter = byId<HTMLSelectElement>('requirement-filter');
  filter.replaceChildren(new Option('Alla rörelser för valt mål / pose', ''), ...requirements.map(r => new Option(r.label, r.id)));
  filter.value = initialRequirement; filter.disabled = !requirements.length;
  const target = review.targets.find(t => t.id === scope);
  write('catalog-title', target ? `Rörelser · ${target.id}` : `Rörelser · ${scope}`);
  write('scope-note', target ? `${target.recipientId === 'D' ? 'Dealern' : `Spelarplats ${target.recipientId.slice(1)}`} · kort ${target.cardOrdinal}. Välj beställning eller rörelse.` : 'Vilor och övergångar utan eget kortmål. Målspecifika returer finns under respektive kort.');
  renderTree();
  const requirement = requirements.find(r => r.id === initialRequirement);
  const motions = scopedMotions().filter(m => !requirement || requirement.sourceMotionIds.includes(m.id));
  selectMotion(initialMotion ?? chooseInitial(motions), requirement ?? null);
}
function renderCatalog() {
  const query = byId<HTMLInputElement>('motion-search').value.trim().toLocaleLowerCase('sv-SE');
  const requirement = scopedRequirements().find(r => r.id === selectedRequirement);
  const motions = scopedMotions().filter(m => (!requirement || requirement.sourceMotionIds.includes(m.id)) && `${m.label} ${m.id} ${m.from} ${m.to} ${m.returnMode} ${m.dl1 ?? ''}`.toLocaleLowerCase('sv-SE').includes(query));
  write('catalog-count', `${motions.length} rörelser · ${motions.filter(m => m.candidate).length} med bundet filmurval`);
  byId('motions').replaceChildren(...motions.map(motion => {
    const button = make('button', '', 'motion'); button.dataset.motion = motion.id;
    button.setAttribute('aria-pressed', String(activeMotion?.id === motion.id));
    button.append(make('strong', motion.label), make('small', `${shortPose(motion.from)} → ${shortPose(motion.to)}`, 'route'), make('small', `${motion.candidate ? 'Film finns' : 'Film saknas'} · ${qaLabel(motion.qa.status)}`, 'motion-status'));
    button.onclick = () => selectMotion(motion, requirement ?? null); return button;
  }));
  if (!motions.length) byId('motions').append(make('p', query ? 'Inga rörelser matchar sökningen.' : 'Beställningen finns, men ingen rörelse är kopplad till den.', 'empty-list'));
  const extras = byId('idle-extras'); extras.replaceChildren();
  if (scope === 'VILA' && review.additionalIdleCandidates.length) {
    extras.append(make('h3', 'Ytterligare VILA-prov'), make('p', 'Befintliga provfönster, separat från V2-bindningarna.', 'muted'));
    for (const idle of review.additionalIdleCandidates) {
      const button = make('button', '', 'motion'); button.style.width = '100%'; button.style.marginBottom = '8px';
      button.setAttribute('aria-pressed', String(activeIdle?.id === idle.id)); button.append(make('strong', idle.title), make('small', `${idle.windowFrames} rutor · ${idle.blinksPerCycle} blinkning(ar) per varv`));
      button.onclick = () => selectIdle(idle); extras.append(button);
    }
  }
}
function renderFlow(motion: DealerNodeMotion | null, requirement: DealerNodeRequirement | null, extraTitle?: string) {
  const svg = document.getElementById('motion-flow')!; svg.replaceChildren();
  const create = (tag: string, attrs: Record<string, string | number>, text = '') => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); el.textContent = text; return el; };
  const from = motion?.from ?? requirement?.from ?? scope, to = motion?.to ?? requirement?.to ?? scope;
  const title = extraTitle ?? (motion ? kindLabel(motion.kind) : 'DL1-beställning');
  const defs = create('defs', {}), marker = create('marker', { id: 'motion-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' });
  marker.append(create('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: '#9be2d0' })); defs.append(marker); svg.append(defs);
  svg.append(create('path', { d: 'M 201 72 H 290 M 470 72 H 559', fill: 'none', stroke: '#9be2d0', 'stroke-width': 2, 'marker-end': 'url(#motion-arrow)' }));
  const nodes = [{ x: 25, w: 176, label: shortPose(from), detail: 'Start' }, { x: 290, w: 180, label: title, detail: motion?.returnMode === 'direct' ? 'Direktretur · kontraktskrav' : motion?.returnMode === 'to-redo' ? 'Fortsättning efter släpp' : motion ? 'Vald rörelse' : 'Önskad handling' }, { x: 559, w: 176, label: shortPose(to), detail: 'Slut' }];
  for (const [i, node] of nodes.entries()) {
    svg.append(create('rect', { x: node.x, y: 32, width: node.w, height: 80, rx: 12, fill: i === 1 ? '#244b4d' : '#1a3444', stroke: i === 1 ? '#9be2d0' : '#58788c' }));
    svg.append(create('text', { x: node.x + node.w / 2, y: 65, 'text-anchor': 'middle', fill: '#eaf3f7', 'font-size': 16, 'font-weight': 650 }, node.label));
    svg.append(create('text', { x: node.x + node.w / 2, y: 89, 'text-anchor': 'middle', fill: '#b7ced9', 'font-size': 10 }, node.detail));
  }
  svg.setAttribute('aria-label', `${motion ? 'Kontrakt' : 'Beställning'}: ${from} → ${title} → ${to}`);
  write('flow-explainer', motion ? `Kontraktets riktning: ${from} → ${to}.${motion.returnMode === 'direct' ? ' Direktretur betyder släpp → VILA; filmväg och QA måste belägga att REDO inte passeras.' : ''} Pilarna visar inga godkända skarvar eller automatisk spelordning.` : 'Detta är den önskade DL1-riktningen. Ingen källrörelse är vald.');
}
function renderRequest(motion: DealerNodeMotion | null, requirement: DealerNodeRequirement | null) {
  const dl1 = motion?.dl1 ?? requirement?.dl1 ?? null, projection = motion?.requested ?? requirement?.projection;
  write('dl1-title', dl1 ? 'Full DL1-sträng · REQUESTED' : 'Motion-ID · ingen DL1-handling');
  byId<HTMLTextAreaElement>('dl1-string').value = dl1 ?? motion?.id ?? '';
  byId<HTMLButtonElement>('copy-dl1').disabled = !dl1 && !motion;
  write('copy-result', '');
  write('request-note', dl1 ? `Beställningens riktning: ${projection?.from} → ${projection?.to}. Önskade fält beskriver kravet; de är inte uppmätta egenskaper i filmen.` : motion?.dl1UnavailableReason ?? 'Ingen DL1-beställning för den här ingången.');
  const fields = byId('request-fields'); fields.replaceChildren();
  if (projection) fields.append(facts(Object.entries(projection).map(([key, value]) => [key, value])));
  const ref = motion?.dl1Ref ?? requirement?.ref;
  if (ref) fields.append(make('p', `Beskrivningsobjekt ${ref.id} · ${ref.document}${ref.pointer}`, 'ref'), make('code', `Objektets SHA-256 (${ref.hashEncoding}): ${ref.sha256}`));
}
function clearMedia() { activeRange = null; video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true; byId('media-empty').hidden = false; byId('open-media').hidden = true; byId<HTMLButtonElement>('replay-candidate').disabled = true; }
function loadMedia(url: string) { video.src = url; video.hidden = false; byId('media-empty').hidden = true; const link = byId<HTMLAnchorElement>('open-media'); link.href = url; link.hidden = false; byId<HTMLButtonElement>('replay-candidate').disabled = false; }
function renderMedia(motion: DealerNodeMotion | null, mode: 'raw' | 'proof' = 'raw') {
  clearMedia(); const candidate = motion?.candidate;
  const choice = byId('media-choice'); choice.replaceChildren();
  if (motion?.reuse) {
    for (const [key, label] of [['raw', 'Rå källa · V2-urval'], ['proof', 'Bearbetat scenprov']] as const) {
      const button = make('button', label); button.setAttribute('aria-pressed', String(mode === key)); button.onclick = () => renderMedia(motion, key); choice.append(button);
    }
  }
  write('replay-candidate', mode === 'raw' ? 'Spela urvalet' : 'Spela provet');
  const entries: [string, string][] = [];
  if (!candidate) { write('media-empty', 'Ingen film är bunden till den här rörelsen. Beställningen och kontraktskraven kan ändå granskas.'); write('playback', 'Film saknas.'); }
  else {
    const proof = mode === 'proof' ? motion?.reuse?.assets.selectedMovie : null;
    const url = proof ? urls[proof.path] : candidate.file.bytesVerified ? urls[candidate.file.path] : null;
    if (url) { loadMedia(url); if (!proof) activeRange = { start: candidate.startFrame, end: candidate.endFrameExclusive, fps: candidate.fps }; }
    else write('media-empty', candidate.file.bytesVerified ? 'Kandidaten är hashverifierad men filmen saknas i den här publicerade snapshoten.' : 'Källfilens bytes är inte verifierade. Ingen film laddas.');
    write('playback', proof ? 'Bearbetat scenprov visas i sin helhet. Provets lager och tidslinje ersätter inte V2-kontraktets råbindning.' : `Kontraktsurval: källruta ${candidate.startFrame}–${candidate.endFrameExclusive - 1} · ${((candidate.endFrameExclusive - candidate.startFrame) / candidate.fps).toFixed(2)} s. Hela originalet finns via länken när det är publicerat.`);
    entries.push(['Material', proof ? 'Bearbetat prov · separat från V2-bindningen' : candidate.presentation === 'raw-reference' ? 'Råreferens · ej separerade lager' : 'Separata lager enligt bindning'], ['V2-urval och format', `${candidate.endFrameExclusive - candidate.startFrame} rutor · ${candidate.fps} fps · ${candidate.width} × ${candidate.height}`], ['Källans kort i V2', candidate.sourceCards === 'unresolved' ? 'Ej separerade / olösta' : 'Separerade'], ['Filidentitet', candidate.file.bytesVerified ? 'SHA-256 verifierad vid snapshotbygget' : 'Bytes ej verifierade']);
  }
  entries.push(['Filmstatus', motion ? `${qaLabel(motion.qa.status)} · ${motion.runtimeAccepted ? 'runtime accepterad' : 'ej runtimeaccepterad'}` : 'Ingen bunden rörelse']);
  byId('media-facts').replaceChildren(...entries.map(([label, value]) => { const fact = make('div', '', 'fact'); fact.append(make('small', label), make('strong', value)); return fact; }));
}
function renderSides(motion: DealerNodeMotion | null) {
  const node = byId('side-detail'); node.replaceChildren();
  if (!motion) { node.append(make('p', 'Fysiska kortsidor är okända utan en källrörelse.')); return; }
  const observation = motion.observation, status = { SOURCE_OBSERVED: 'Källobserverad sida', AUTHORED_ONLY: 'Enbart författad sidpolicy', UNKNOWN: 'Fysisk sida okänd', NOT_APPLICABLE: 'Ej tillämpligt för denna rörelse' }[observation.physicalSideStatus];
  node.append(make('p', status, 'note'));
  if (motion.requested) node.append(facts([['Önskat uttag', sideLabel(motion.requested.pickupSide)], ['Önskad landning', sideLabel(motion.requested.landingSide)], ['Önskad hand', motion.requested.hand], ['Observerad hand', observation.hand]]));
  const track = observation.physicalSideTrack;
  if (track) {
    const details = make('details'), table = make('table'), head = make('tr'); for (const label of ['Källrutor', 'Sida', 'Metod']) head.append(make('th', label)); table.append(head);
    for (const range of track.ranges) { const row = make('tr'); row.append(make('td', `${range.startFrame}–${range.endFrameExclusive - 1}`), make('td', sideLabel(range.side)), make('td', methodLabel(range.method))); table.append(row); }
    details.append(make('summary', `Sidspår · ${track.ranges.length} intervall`), table); node.append(details);
  }
  if (motion.reuse) {
    const policy = motion.reuse.authoredSidePolicy;
    const details = make('details'); details.append(make('summary', `Scenprovets författade sidpolicy · ${policy.segments.length} intervall`));
    details.append(textList(policy.segments.map(segment => `Källrutor ${segment.start}–${segment.end}: ${sideLabel(segment.side)}`)), make('p', `UV-kvartsvarv: ${policy.canonicalUvQuarterTurns}. Fysisk sida: ${sideLabel(policy.physicalSide)}.`), fileRef(policy.basis, 'Författat sidunderlag')); node.append(details);
  }
  node.append(make('p', 'Blå/gul markering eller utbytt korttryck är författad policy tills fysisk sida har belagts i källan. Motorn styr tillståndet att visa valören.', 'muted'));
  if (observation.physicalSideEvidence) node.append(fileRef(observation.physicalSideEvidence, 'Sidbevis'));
}
function renderGeometry(motion: DealerNodeMotion | null) {
  const node = byId('geometry-detail'); node.replaceChildren();
  const geometry = motion?.observation.geometry;
  node.append(facts([['V2-geometri', geometry?.status === 'SOURCE_BOUND' ? 'Källbunden' : 'Okänd / saknas'], ['Koordinatplan', geometry?.spaceId ?? 'Ej bundet i V2'], ['Landningsposition i V2', geometry?.landingPosition ?? 'Okänd'], ['Landningsvinkel i V2', geometry?.landingAngle ?? 'Okänd'], ['Riktig 3D-vinkel', 'Okänd · kan inte utläsas som kalibrerad 3D ur en filmvinkel']]));
  node.append(make('p', 'Bildkoordinater anges i källans pixelplan. En vinkel på skärmen är en 2D-projektion, inte bordets eller kortets riktiga 3D-vinkel.', 'muted'));
  if (geometry?.cardTrack) node.append(fileRef(geometry.cardTrack, 'Kortspår i V2'));
  if (motion?.reuse) {
    const sample = motion.reuse.geometry;
    node.prepend(make('p', `${sample.sampleLabel} · författat 2D-prov, separat från V2`, 'note'), facts([['Provets källruta', sample.sourceFrame], ['Kortets mittpunkt', `x ${sample.centerPx.x.toFixed(1)}, y ${sample.centerPx.y.toFixed(1)} px`], ['Vinkel i bildplanet', sample.orientationDeg === null ? 'Okänd' : `${sample.orientationDeg.toFixed(2)}°`], ['Kortets hörn (x, y)', sample.quad.map(([x, y]) => `(${x.toFixed(1)}, ${y.toFixed(1)})`).join(' · ')], ['Riktning', 'x åt höger, y nedåt'], ['Vinkel vid släpp', sample.releaseAngleDeg ?? 'Okänd · detta är ett slutprov']]));
    const width = motion.reuse.source.width, height = motion.reuse.source.height;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${sample.sampleLabel}: kortets plats i hela källbilden. Statisk skiss, inget rörelsespår.`);
    svg.style.cssText = 'display:block;width:100%;max-height:210px;background:#09151d;border:1px solid #3e5a6a;border-radius:8px;margin:14px 0 8px';
    const draw = (tag: string, attrs: Record<string, string | number>, text = '') => { const part = document.createElementNS(svg.namespaceURI, tag); for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, String(value)); part.textContent = text; svg.append(part); };
    for (const fraction of [.25, .5, .75]) {
      draw('path', { d: `M ${width * fraction} 0 V ${height} M 0 ${height * fraction} H ${width}`, stroke: '#294352', 'stroke-width': 3, 'stroke-dasharray': '12 10', fill: 'none' });
    }
    draw('polygon', { points: sample.quad.map(point => point.join(',')).join(' '), fill: '#f1cf8f', 'fill-opacity': .7, stroke: '#fff2cf', 'stroke-width': 8 });
    draw('circle', { cx: sample.centerPx.x, cy: sample.centerPx.y, r: 10, fill: '#fff' });
    draw('text', { x: 35, y: 65, fill: '#b4d5e2', 'font-size': 42 }, `0,0  ·  ${width} × ${height} px`);
    draw('text', { x: width - 35, y: height - 35, 'text-anchor': 'end', fill: '#f1cf8f', 'font-size': 42 }, `f${sample.sourceFrame} · statiskt slutprov`);
    node.append(svg, make('p', 'Skissen visar hela källbildens plan. Gult = kortets hörn, vitt = mittpunkt. Den följer inte filmen under uppspelning.', 'muted'));
    const details = make('details'); details.append(make('summary', 'Mätmetod för slutprovet'), make('p', sample.method), fileRef(sample.evidence, 'Provgeometri'), make('p', sample.evidencePointer, 'ref')); node.append(details);
  }
}
function renderLayers(motion: DealerNodeMotion | null) {
  const node = byId('layer-detail'); node.replaceChildren();
  if (!motion) { node.append(make('p', 'Ingen källrörelse vald.')); return; }
  const variant = motion.variant.contract;
  node.append(facts([['Släppruta', motion.observation.releaseFrame ?? 'Okänd'], ['Rörlig handmask i V2', motion.observation.geometry.handMask ? 'Källbunden referens' : 'Saknas'], ['Kroppsgeometri i V2', motion.observation.geometry.bodyGeometry ?? 'Okänd'], ['Ankare för variant', variant ? `${variant.anchors.start.nodeId} → ${variant.anchors.end.nodeId}` : 'Ej deklarerade'], ['Kort före / efter', variant ? `${variant.cardsBefore.join(', ') || 'Inga'} → ${variant.cardsAfter.join(', ') || 'Inga'}` : 'Ej variantdeklarerat']]));
  if (motion.observation.geometry.handMask) node.append(fileRef(motion.observation.geometry.handMask, 'Handmask i V2'));
  if (motion.reuse) {
    const assets = motion.reuse.assets, details = make('details'); details.append(make('summary', `Befintliga provlager · ${assets.masks.length} masker`), make('p', `Maskprov vid källruta ${assets.maskSampleFrame}. ${assets.maskScope}`), make('p', `UV: ${assets.uvRepresentation}`));
    details.append(fileRef(assets.landedLayer, 'Liggande kortlager'), ...assets.masks.map(mask => fileRef(mask, mask.type)), fileRef(assets.uv, 'UV-underlag'));
    if (assets.patchEvidence) details.append(fileRef(assets.patchEvidence, 'Maskkorrigering')); node.append(details);
    node.append(make('p', 'Provlager finns separat. Deras existens innebär inte att de är bundna eller accepterade i V2.', 'muted'));
  }
  const anchors = review.anchors.filter(a => [motion.from, motion.to].includes(a.pose));
  if (anchors.length) {
    const details = make('details'); details.append(make('summary', `Referensankare · ${anchors.length}`)); const list = make('div', '', 'anchor-list');
    for (const anchor of anchors) { const item = make('div', '', 'anchor'); const url = anchor.file.bytesVerified ? urls[anchor.file.path] : null; if (url) { const img = make('img'); img.src = url; img.alt = `${anchor.pose} · hashbundet referensankare`; img.loading = 'lazy'; item.append(img); } item.append(fileRef(anchor.file, anchor.pose)); list.append(item); }
    details.append(list); node.append(details);
  }
}
function renderQa(motion: DealerNodeMotion | null) {
  const node = byId('qa-detail'); node.replaceChildren();
  if (!motion) { node.append(make('p', 'Ingen film eller rörelse-QA är kopplad till beställningen.')); return; }
  node.append(make('p', qaLabel(motion.qa.status), 'note'), make('p', motion.qa.reason), facts([['Runtimeacceptans', motion.runtimeAccepted], ['Utbytbar variant', motion.variant.interchangeable], ['Variantdeklaration', motion.variant.status === 'NOT_DECLARED' ? 'Saknas' : 'Deklarerad · kräver QA'], ['Variantgrupp', motion.variant.groupId ?? 'Ingen']]));
  if (motion.observation.filmPath) { const path = motion.observation.filmPath; node.append(make('p', `Filmväg: ${path.points.map(point => `${point.frame}: ${point.pose.kind === 'ACTION_BOUNDARY' ? point.pose.boundaryId : point.pose.kind}`).join(' → ')}`), make('p', `Filmvägens QA: ${qaLabel(path.qa.status)}. ${path.qa.reason}`)); }
  else node.append(make('p', 'Källbunden filmväg saknas. Ändpunkternas namn räcker inte som skarvbevis.', 'muted'));
  if (motion.qa.evidence) node.append(fileRef(motion.qa.evidence, 'QA-underlag'));
  const local = motion.observation.localMotionReview;
  if (local.accepted !== null || local.evidence) node.append(make('p', `Lokal delgranskning: ${local.accepted === null ? 'okänd' : local.accepted ? 'accepterad' : 'inte accepterad'}. ${local.scope}`), fileRef(local.evidence, 'Lokal delgranskning'));
}
function selectMotion(motion: DealerNodeMotion | null, requirement: DealerNodeRequirement | null = null) {
  activeMotion = motion; activeRequirement = requirement; activeIdle = null;
  write('selected-kind', motion ? `${kindLabel(motion.kind)} · ${motion.target ?? 'pose'}` : 'DL1-beställning');
  write('selected-title', motion?.label ?? requirement?.label ?? scope);
  write('selected-id', motion ? `motionId: ${motion.id}` : requirement ? `ref: ${requirement.ref.id}` : 'Ingen rörelse');
  write('selected-status', motion ? `${motion.candidate ? 'Kandidatfilm' : 'Film saknas'} · ${qaLabel(motion.qa.status)}` : 'Ingen kopplad film');
  renderFlow(motion, requirement); renderRequest(motion, requirement); renderMedia(motion); renderSides(motion); renderGeometry(motion); renderLayers(motion); renderQa(motion);
  const missing = [...new Set([...(motion?.missing ?? requirement?.missing ?? []), ...(motion?.variant.missing ?? []), ...(motion?.reuse?.limitations ?? [])])];
  byId('missing').replaceChildren(...(missing.length ? missing : ['Inga ytterligare punkter redovisade för detta val.']).map(value => make('li', value)));
  const evidence = byId('evidence'); evidence.replaceChildren(); if (motion?.candidate) evidence.append(fileRef(motion.candidate.file, 'Rå källa för motion-bindningen'));
  if (motion?.note) evidence.append(make('p', motion.note)); evidence.append(fileRef(review.provenance.contract, 'Rörelsekontrakt'), fileRef(review.provenance.labels, 'DL1-projektion'));
  if (motion?.reuse) evidence.append(fileRef(motion.reuse.assets.selectedMovie, 'Bearbetat scenprov'), fileRef(motion.reuse.evidence, 'Återbruksunderlag'));
  renderCatalog(); setLocation();
}

function selectIdle(idle: DealerNodeIdleCandidate) {
  activeIdle = idle; activeMotion = null; activeRequirement = null; selectedRequirement = '';
  byId<HTMLSelectElement>('requirement-filter').value = '';
  write('selected-kind', 'VILA · separat återbrukskandidat'); write('selected-title', idle.title); write('selected-id', `Kandidat-ID: ${idle.id}`); write('selected-status', 'Prov · ej godkänd variant');
  renderFlow(null, null, 'VILA-prov'); write('flow-explainer', 'Befintligt VILA → VILA-prov. Det är separat från V2-kontraktets motion-bindningar och visar ingen godkänd skarv.');
  renderRequest(null, null); write('dl1-title', 'Kandidat-ID · ingen DL1-handling'); byId<HTMLTextAreaElement>('dl1-string').value = idle.id; byId<HTMLButtonElement>('copy-dl1').disabled = false;
  write('request-note', 'DL1 har ingen IDLE-handling. Detta är provets eget ID, inte ett fabricerat DL1- eller V2-motion-ID.');
  clearMedia(); byId('media-choice').replaceChildren(); write('replay-candidate', 'Spela provet');
  const url = urls[idle.movie.path]; if (url) loadMedia(url); else write('media-empty', 'VILA-provet finns i inventeringen men filmen är inte publicerad i den här snapshoten.');
  write('playback', `Provfilm med upprepade varv. Källfönster ${idle.sourceStart}–${idle.sourceEndExclusive - 1}, ${idle.windowFrames} rutor vid ${idle.fps} fps.`);
  byId('media-facts').replaceChildren(facts([['Kandidat', 'Separat från V2'], ['Blinkningar per varv', idle.blinksPerCycle], ['Godkänd variant', idle.approvedVariant], ['Produktionsacceptans', idle.productionAccepted]]));
  byId('side-detail').replaceChildren(make('p', 'Ingen kortgivning i det här VILA-provet. Kort på bordet måste bevaras vid integration.'));
  byId('geometry-detail').replaceChildren(make('p', 'Inga kortkoordinater eller kalibrerade 3D-vinklar är kopplade till detta prov.'));
  byId('layer-detail').replaceChildren(make('p', 'VILA-källfönster. Separata produktionslager och V2-ankarkoppling är inte verifierade av denna inventering.'));
  byId('qa-detail').replaceChildren(make('p', idle.limitation), fileRef(idle.review, 'VILA-granskning'));
  byId('missing').replaceChildren(make('li', idle.limitation));
  byId('evidence').replaceChildren(fileRef(idle.source, 'Rå källa'), fileRef(idle.movie, 'VILA-provfilm'), fileRef(idle.evidence, 'Bevisunderlag'));
  renderCatalog(); setLocation();
}

byId<HTMLSelectElement>('requirement-filter').onchange = event => {
  selectedRequirement = (event.target as HTMLSelectElement).value;
  const requirement = scopedRequirements().find(r => r.id === selectedRequirement) ?? null;
  selectMotion(chooseInitial(scopedMotions().filter(m => !requirement || requirement.sourceMotionIds.includes(m.id))), requirement);
};
byId<HTMLInputElement>('motion-search').oninput = renderCatalog;
byId('copy-dl1').onclick = async () => {
  const field = byId<HTMLTextAreaElement>('dl1-string');
  try { await navigator.clipboard.writeText(field.value); write('copy-result', activeMotion?.dl1 || activeRequirement?.dl1 ? 'Hela DL1-strängen kopierad.' : activeIdle ? 'Kandidat-ID kopierat.' : 'Motion-ID kopierat.'); }
  catch { field.focus(); field.select(); write('copy-result', 'Texten är markerad. Kopiera med Ctrl+C.'); }
};
video.addEventListener('loadedmetadata', () => { if (activeRange) video.currentTime = activeRange.start / activeRange.fps; });
video.addEventListener('timeupdate', () => {
  const range = activeRange; if (!range) return;
  const end = range.end / range.fps;
  if (video.currentTime >= end && !video.paused) { video.pause(); video.currentTime = (range.end - 1) / range.fps; }
});
video.addEventListener('seeking', () => { const range = activeRange; if (!range) return; const min = range.start / range.fps, max = (range.end - 1) / range.fps; if (video.currentTime < min || video.currentTime > max + .001) video.currentTime = Math.min(max, Math.max(min, video.currentTime)); });
video.addEventListener('error', () => { if (video.getAttribute('src')) write('playback', 'Filmen kunde inte laddas eller avkodas. Prova länken till hela källfilen.'); });
byId('replay-candidate').onclick = () => { if (!video.getAttribute('src')) return; video.currentTime = activeRange ? activeRange.start / activeRange.fps : 0; void video.play().catch(() => write('playback', 'Uppspelningen kunde inte starta. Använd filmens spelknapp.')); };

write('identity', `${review.identity.dealerId} · ${review.identity.bankId}`);
write('review-state', review.policy.productionAccepted ? 'Produktionsaccepterad' : 'Granskning · ej produktionsaccepterad');
write('target-count', `${review.targets.length} kortmål`);
const targetsWithFilms = review.targets.filter(t => review.motions.some(m => m.target === t.id && m.kind === 'deal' && m.candidate)).length;
const metrics: [string, string][] = [[`${targetsWithFilms} / ${review.targets.length}`, 'kortmål med givkandidat'], [String(review.counts.boundCandidates), 'bundna rörelser · en källa kan återanvändas'], [String(review.counts.dl1Requirements), 'DL1-beställningar'], [String(review.counts.runtimeAccepted), 'runtimeaccepterade rörelser']];
byId('metrics').replaceChildren(...metrics.map(([value, label]) => { const item = make('div', '', 'metric'); item.append(make('strong', value), make('span', label)); return item; }));
byId('limitations').replaceChildren(...review.limitations.map(value => make('li', value)));
write('footer', `Snapshot ${review.snapshot} · ${review.identity.projectId} · kontraktsrevision ${review.revision}. Filmer och underlag är hashbundna; ändrade bytes kräver ny QA.`);
const query = new URLSearchParams(location.search), initialMotion = review.motions.find(m => m.id === query.get('motion'));
const requestedScope = initialMotion?.target ?? query.get('target') ?? query.get('state');
const fallbackTarget = review.targets.find(t => review.motions.some(m => m.target === t.id && m.kind === 'deal' && m.candidate))?.id;
const initialScope = requestedScope && [...review.targets, ...review.states].some(item => item.id === requestedScope) ? requestedScope : initialMotion?.from && review.states.some(s => s.id === initialMotion.from) ? initialMotion.from : fallbackTarget ?? review.states[0]?.id ?? '';
selectScope(initialScope, initialMotion, query.get('requirement') ?? '');
const initialIdle = review.additionalIdleCandidates.find(idle => idle.id === query.get('idle'));
if (initialIdle) { selectScope('VILA'); selectIdle(initialIdle); }
