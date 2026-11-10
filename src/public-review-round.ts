type Media = { path: string; sourcePath: string; sha256: string; sourceSha256: string; publicPreview: boolean; width?: number; height?: number; fps?: number; frameCount?: number; duration?: number };
type Film = { label: string; path: string; sha256: string; model: string; taskId: string; jobPath: string; input: { path: string; sha256: string }; motionSource: { path: string; sha256: string } | null; apiCreditEstimate: number; endpointMode: string };
export type ReviewRound = { title: string; questions: string[]; featuredScene: string; comparisons: { id: string; label: string; a: string; b: string }[]; primaryFilmPaths: string[]; films: Film[]; assessment: string; next: string;
  featuredLabel?: string;
  featuredEvidence?: string;
  featuredPoster?: string;
  poseAnchors?: { label: string; path: string; meaning: string }[];
  publicationNote?: string;
  historicalEndpointFailure?: { finding: string };
  quality?: { kind: string; basis: string; items: { label: string; score: number; scope: string; decision: string }[] };
  lineage?: { summary: string; source: string; derivative: string };
};
const esc = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function currentRoundMarkup(round: ReviewRound, media: Media[], paths: Map<string, string>, snapshot: string) {
  if (round.questions.length !== 3) throw Error('The current review must have exactly three focused questions.');
  const lookup = (source: string) => {
    const asset = media.find(m => m.sourcePath === source);
    if (!asset) throw Error(`Missing selected review material: ${source}`);
    return asset;
  };
  const link = (source: string) => {
    const url = paths.get(source);
    if (!url) throw Error(`Missing published evidence: ${source}`);
    return url;
  };
  const links = round.comparisons.map(pair => ({ id: pair.id, label: pair.label, a: lookup(pair.a).sourceSha256, b: lookup(pair.b).sourceSha256,
    url: `/?v=${encodeURIComponent(snapshot)}&track=main&a=${lookup(pair.a).sourceSha256}&b=${lookup(pair.b).sourceSha256}#review-studio` }));
  const film = (source: string, label?: string) => {
    const meta = round.films.find(f => f.path === source), asset = lookup(source);
    if (!meta || meta.sha256 !== asset.sourceSha256) throw Error('Film receipt and published source disagree.');
    if (asset.publicPreview || asset.sha256 !== meta.sha256) throw Error('Primary Pamela films must be byte-identical originals.');
    const isFeatured = source === round.featuredScene;
    const poster = isFeatured && round.featuredPoster ? ` poster="${esc(link(round.featuredPoster))}"` : '';
    return `<article class="pilot-film"><h3>${esc(label ?? meta.label)}</h3><video controls preload="${isFeatured ? 'metadata' : 'none'}" playsinline${poster} src="${esc(asset.path)}"></video><p><strong>Oförändrat original</strong> · ${asset.width}×${asset.height} · ${asset.fps} fps · ${asset.frameCount} rutor · ${asset.duration} s</p><p>Modell: <code>${esc(meta.model)}</code> · API-kostnadsuppgift: ${meta.apiCreditEstimate} krediter (faktura ej verifierad).</p><p><a href="${esc(link(meta.input.path))}">Faktisk inmatningsbild</a>${meta.motionSource ? ` · <a href="${esc(link(meta.motionSource.path))}">Rörelsekälla</a>` : ''} · <a href="${esc(asset.path)}">Öppna original i full upplösning</a> · <a href="${esc(link(meta.jobPath))}">Prompt och jobb</a></p><details><summary>Full filhash och proveniens</summary><p>Film: <code>${esc(asset.sha256)}</code></p><p>Input: <code>${esc(meta.input.sha256)}</code></p><p>Task-ID: <code>${esc(meta.taskId)}</code></p><p>${esc(meta.endpointMode)}</p></details></article>`;
  };
  const current = lookup(round.featuredScene);
  const featuredFilm = round.films.some(item => item.path === round.featuredScene);
  const primarySources = [...new Set([
    ...(featuredFilm ? [round.featuredScene] : []),
    ...round.primaryFilmPaths,
  ])];
  const allFilmSources = [...new Set(round.films.map(item => item.path))];
  const historicalSources = allFilmSources.filter(source => !primarySources.includes(source));
  const primaryCount = primarySources.length === 1 ? '1 prioriterad film' : `${primarySources.length} prioriterade filmer`;
  const historicalCount = historicalSources.length === 1 ? '1 film' : `${historicalSources.length} filmer`;
  const featured = featuredFilm
    ? film(round.featuredScene, round.featuredLabel)
    : `<article class="pilot-film"><h3>${esc(round.featuredLabel ?? 'Aktuell kandidat')}</h3><video controls preload="metadata" playsinline src="${esc(current.path)}" style="width:100%"></video><p><a href="${esc(current.path)}">Öppna filen i full upplösning</a></p><p>${current.width}×${current.height} · ${current.fps} fps · ${current.frameCount} rutor · ${current.duration} s · SHA-256 <code>${esc(current.sha256)}</code></p></article>`;
  const otherPrimary = primarySources.filter(source => source !== round.featuredScene);
  const anchors = round.poseAnchors?.length ? `<div class="pose-anchors"><h3>Poseankare</h3><div class="pilot-grid" style="display:grid;grid-template-columns:repeat(${round.poseAnchors.length},minmax(0,1fr));gap:16px">${round.poseAnchors.map(anchor => {
    const asset = lookup(anchor.path);
    return `<figure style="margin:0;min-width:0"><a href="${esc(link(anchor.path))}"><img loading="lazy" style="display:block;width:100%;max-height:420px;object-fit:contain" src="${esc(asset.path)}" alt="${esc(anchor.label)}"></a><figcaption><strong>${esc(anchor.label)}</strong><p>${esc(anchor.meaning)}</p><details><summary>Original och filhash</summary><p><a href="${esc(link(anchor.path))}">Öppna ankaret i full upplösning</a></p><p style="overflow-wrap:anywhere"><code>${esc(asset.sourceSha256)}</code></p></details></figcaption></figure>`;
  }).join('')}</div><p><strong>VILA → REDO är en övergång som avsiktligt slutar i REDO.</strong> Ett REDO → giv → REDO-klipp ska däremot ge kortet och återgå till REDO. En separat återgång REDO → VILA slutar i VILA.</p></div>` : '';
  const quality = round.quality ? `<details><summary>Kvalitet 1–10 · subjektiva arbetsbetyg</summary><p>${esc(round.quality.kind)}. ${esc(round.quality.basis)}</p><div class="table-scroll"><table><thead><tr><th>Material</th><th>Betyg</th><th>Användning nu</th></tr></thead><tbody>${round.quality.items.map(item=>`<tr><td>${esc(item.label)}<br><small>${esc(item.scope)}</small></td><td>${item.score}/10</td><td>${esc(item.decision)}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  const lineage = round.lineage ? `<details><summary>Sidoreferens: Liv och alternativa Göran</summary><p>${esc(round.lineage.summary)}</p><p>Denna källkedja gäller den alternativa banken.</p><div class="pilot-grid"><figure><img loading="lazy" style="max-height:280px;object-fit:contain" src="${esc(link(round.lineage.source))}" alt="Livs helkroppsbild, källa till pose och utsnitt"><figcaption>Liv · pose och utsnitt</figcaption></figure><figure><img loading="lazy" style="max-height:280px;object-fit:contain" src="${esc(link(round.lineage.derivative))}" alt="Görans keystone, skapad med hans egen identitetsbild"><figcaption>Alternativa Göran · egen identitet</figcaption></figure></div><a href="/underlag/reviewer-status.json">Källkedja, filhashar och verifieringsgränser</a></details>` : '';
  const history = historicalSources.length || quality || lineage
    ? `<details><summary>Historiska försök (${historicalCount}) · inte godkända fack</summary><p>Tidigare försök bevaras som underlag. De är inte godkända rörelsefack eller den aktuella leveransen.</p><div class="pilot-grid">${historicalSources.map(source => film(source)).join('')}</div>${quality}${lineage}</details>`
    : '';
  return { links, html: `<section id="aktuellt"><h2>${esc(round.title)}</h2>
<p><a href="/underlag/masterplan.txt">Aktuell masterplan</a> · <a href="/underlag/reviewer-status.json">Status till browseragenten</a> · <a href="/underlag/granskningsomgang.json">Filmer, metadata och beslut</a> · <a href="/latest.json">Version och Git-status</a></p>
${round.publicationNote ? `<p><strong>${esc(round.publicationNote)}</strong></p>` : ''}
${featured}
<p><strong>Bedömning:</strong> ${esc(round.assessment)}</p>
${round.historicalEndpointFailure ? `<p><strong>Bekräftat fel i äldre film:</strong> ${esc(round.historicalEndpointFailure.finding)} <a href="/underlag/historiskt-atergangsfel.json">Mätning och bevis</a>.</p>` : ''}
<p><strong>Nästa steg:</strong> ${esc(round.next)}</p>
${round.featuredEvidence ? `<p><a href="${esc(round.featuredEvidence)}">Referenspaket och verifieringsunderlag</a></p>` : ''}
${anchors}
<div class="note"><strong>Tre frågor för denna omgång</strong><ol>${round.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol></div>
<p>${links.map(item => `<a href="${esc(item.url)}">${esc(item.label)}</a>`).join(' · ')}</p>
<p>${primaryCount} av ${allFilmSources.length} genererade original. Filmfilerna är byteoförändrade; metadata och proveniens finns vid respektive film.</p>
${otherPrimary.length ? `<div class="pilot-grid">${otherPrimary.map(source => film(source)).join('')}</div>` : ''}
${history}</section>` };
}
