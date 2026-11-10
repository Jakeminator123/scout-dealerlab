/** A public viewing page containing only the selected, hash-verified finished films. */
export type GoalFilmReview = {
  schemaVersion: number; projectId: string; dealerId: string; revision: string;
  route: string; productionAccepted: boolean;
  poster: {path: string; sha256: string};
  films: {id: string; label: string; path: string; sha256: string; frames: number; fps: number; width: number; height: number; finalCards: number}[];
  chapters: {label: string; frame: number; filmId?: string}[];
};

const escape = (text: unknown) => String(text).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]!));

export function pamelaGoalFilmPage(review: GoalFilmReview, urls: Map<string, string>, snapshot: string): string {
  const url = (source: string) => {const value = urls.get(source); if (!value) throw Error('Missing reviewed film asset '+source); return value;};
  const films = review.films.map(film => ({...film, url: url(film.path)}));
  const first = films[0];
  const data = JSON.stringify({films, chapters: review.chapters}).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pamela · hela utdelningen</title>
<style>:root{color-scheme:dark;font:16px/1.5 system-ui,sans-serif;background:#0d1713;color:#edf6ef}body{margin:0}main{max-width:1320px;margin:auto;padding:24px}a{color:#afe7be}h1{margin:.2em 0;font-size:clamp(1.7rem,4vw,2.5rem)}p{max-width:80ch}.muted{color:#b3c5ba}nav,.chapters,.tools{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}button{font:inherit;cursor:pointer;color:inherit;background:#203b2d;border:1px solid #4a6b55;border-radius:8px;padding:9px 14px}button[aria-pressed=true]{background:#b5e7bd;color:#102016;border-color:#b5e7bd}button:focus-visible,a:focus-visible{outline:3px solid #f5d577;outline-offset:3px}video{display:block;width:100%;height:min(68vh,820px);background:#060d09;object-fit:contain;border-radius:12px}details{border-top:1px solid #345040;margin-top:28px;padding-top:16px}small{overflow-wrap:anywhere}.error{color:#ffb7a8}footer{margin:28px 0 8px;font-size:.85rem}</style></head>
<body><main><a href="/granskning.html">← Dealerlab</a><h1>Pamela · hela utdelningen</h1><p>Sju spelarpositioner får två kort var. Dealern delar sina egna kort, vänder det dolda kortet och återgår till vila.</p>
<nav aria-label="Välj film">${films.map((film,index)=>`<button data-film="${escape(film.id)}" aria-pressed="${index===0}">${escape(film.label)}</button>`).join('')}</nav>
<video id="film" src="${escape(first.url)}" poster="${escape(url(review.poster.path))}" controls muted playsinline preload="metadata" aria-label="Pamela delar ut kort till sju positioner"></video>
<div class="tools"><button id="play">Spela filmen</button><button id="slow">Långsamt · 0,25×</button><button id="normal">Normal hastighet</button><a id="open-film" href="${escape(first.url)}">Öppna filmfilen</a></div><p id="film-status" class="muted" aria-live="polite">${escape(first.label)} · ${(first.frames/first.fps).toFixed(1).replace('.',',')} sekunder</p><p id="film-error" class="error" role="alert" hidden></p>
<div class="chapters" aria-label="Hoppa till händelse">${review.chapters.map((chapter,index)=>`<button data-chapter="${index}">${escape(chapter.label)}</button>`).join('')}</div>
<p class="muted">Blått visar kortets framsida och gult visar baksidan. Den fjärde dealerdragningen finns i en egen filmvariant.</p>
<details><summary>Om versionen</summary><p>Rörelse- och placeringsprov med diagnostiska kortsidor. Kortgrafik och anslutning till Scoutgamings spelmotor har separata kontroller. Mindre färgkanter finns kvar vid vissa skarvar.</p><ul>${films.map(film=>`<li><a href="${escape(film.url)}">${escape(film.label)}</a> · ${film.frames} rutor · ${film.fps} fps · ${film.width} × ${film.height}<br><small>SHA-256 ${film.sha256}</small></li>`).join('')}</ul></details>
<footer class="muted">${escape(snapshot)} · ${escape(review.revision)}</footer></main>
<script>const data=${data};const video=document.getElementById('film');const status=document.getElementById('film-status');const error=document.getElementById('film-error');let selected=data.films[0];let seekAfterLoad=null;
function showError(message){error.textContent=message;error.hidden=false}
function play(){video.play().catch(()=>showError('Klicka på filmens spelknapp för att starta.'))}
function selectFilm(id,time=0,autoplay=false){const next=data.films.find(f=>f.id===id);if(!next)return;selected=next;error.hidden=true;seekAfterLoad={time:Math.min(time,(next.frames-1)/next.fps),autoplay};video.src=next.url;video.removeAttribute('poster');document.getElementById('open-film').href=next.url;status.textContent=next.label+' · '+(next.frames/next.fps).toFixed(1).replace('.',',')+' sekunder';document.querySelectorAll('[data-film]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.film===id)));video.load()}
video.addEventListener('loadedmetadata',()=>{if(seekAfterLoad){const pending=seekAfterLoad;seekAfterLoad=null;video.currentTime=pending.time;if(pending.autoplay)play()}});
video.addEventListener('error',()=>showError('Filmen kunde inte laddas. Prova länken Öppna filmfilen.'));
document.querySelectorAll('[data-film]').forEach(button=>button.addEventListener('click',()=>selectFilm(button.dataset.film,video.currentTime,!video.paused)));
document.querySelectorAll('[data-chapter]').forEach(button=>button.addEventListener('click',()=>{const chapter=data.chapters[Number(button.dataset.chapter)];const id=chapter.filmId||selected.id;const time=chapter.frame/30;if(id!==selected.id)selectFilm(id,time,true);else{video.currentTime=time;play()}}));
document.getElementById('play').addEventListener('click',()=>{if(video.paused)play();else video.pause()});video.addEventListener('play',()=>document.getElementById('play').textContent='Pausa');video.addEventListener('pause',()=>document.getElementById('play').textContent='Spela filmen');document.getElementById('slow').addEventListener('click',()=>video.playbackRate=.25);document.getElementById('normal').addEventListener('click',()=>video.playbackRate=1);
</script></body></html>`;
}
