/** Static review controls; data is embedded by build-review-hub.ts. */
type ReviewMovie = {url:string;sha256:string;frames?:number;fps?:number;id?:string};
declare const data: {chain:ReviewMovie & {frames:number;fps:number;landmarks:{label:string;frame:number}[]};bank:{compact:ReviewMovie;clips:ReviewMovie[]}};
const video=document.querySelector<HTMLVideoElement>('#video')!;
const counter=document.querySelector<HTMLElement>('#frame')!;
const play=document.querySelector<HTMLButtonElement>('#play')!;
const select=document.querySelector<HTMLSelectElement>('#movie')!;
const marks=document.querySelector<HTMLElement>('#marks')!;
const markButtons=[...marks.querySelectorAll<HTMLButtonElement>('[data-frame]')];
let movieFrameCount=data.chain.frames,fps=data.chain.fps,target:number|null=null,currentMovie='chain';
let frameCallback:number|null=null;

// Equal-frame landmarks remain one navigation point with all labels preserved.
// These authored points do not establish exact clip boundaries or V2 bindings.
const chapterPoints:{frame:number;labels:string[]}[]=[];
for(const landmark of [...data.chain.landmarks].sort((a,b)=>a.frame-b.frame)){
  if(!Number.isInteger(landmark.frame)||landmark.frame<0||landmark.frame>=data.chain.frames)continue;
  const previous=chapterPoints.at(-1);
  if(previous?.frame===landmark.frame)previous.labels.push(landmark.label);
  else chapterPoints.push({frame:landmark.frame,labels:[landmark.label]});
}
const chapterPanel=document.createElement('div');chapterPanel.id='chain-chapters';
const chapterTitle=document.createElement('p');chapterTitle.id='chain-chapter-title';
const chapterTrack=document.createElement('div');chapterTrack.className='chain-chapter-track';
const chapterProgress=document.createElement('input');chapterProgress.type='range';chapterProgress.min='0';chapterProgress.max=String(data.chain.frames-1);chapterProgress.step='1';chapterProgress.value='0';
chapterProgress.setAttribute('aria-label','Sök bildruta i den historiska helrundan');
chapterProgress.setAttribute('aria-describedby','chain-chapter-title chain-chapter-note');
const chapterTicks=document.createElement('div');chapterTicks.className='chain-chapter-ticks';chapterTicks.setAttribute('aria-hidden','true');
for(const point of chapterPoints){const tick=document.createElement('span');tick.style.left=`${point.frame/Math.max(1,data.chain.frames-1)*100}%`;tick.title=`${point.labels.join(' + ')} · ruta ${point.frame}`;chapterTicks.append(tick);}
chapterTrack.append(chapterProgress,chapterTicks);
const chapterNote=document.createElement('p');chapterNote.id='chain-chapter-note';chapterNote.textContent='Kapitlen följer befintliga punktmarkörer, inte verifierade klippgränser. Markörer på samma ruta visas tillsammans.';
chapterPanel.append(chapterTitle,chapterTrack,chapterNote);video.insertAdjacentElement('afterend',chapterPanel);
const chapterStyle=document.createElement('style');chapterStyle.textContent=`
#chain-chapters{margin:10px 0 14px;padding:10px 12px;border:1px solid #496575;border-radius:8px;background:#12242d}
#chain-chapters[hidden]{display:none}#chain-chapter-title{margin:0 0 7px;font-size:14px;color:#e9f4f6}
#chain-chapter-note{margin:8px 0 0;font-size:11px;line-height:1.4;color:#afc3ce}
.chain-chapter-track{position:relative;padding-bottom:7px}.chain-chapter-track input{display:block;position:relative;z-index:1;width:100%;height:16px;margin:0;padding:0;accent-color:#9be2d0;cursor:pointer}
.chain-chapter-ticks{position:absolute;left:8px;right:8px;bottom:0;height:5px;pointer-events:none}.chain-chapter-ticks span{position:absolute;width:2px;height:5px;background:#91afbc;transform:translateX(-1px)}
#marks button[aria-current=true]{outline:2px solid #9be2d0;outline-offset:1px;background:#244b4d;color:#f0faf8}
`;document.head.append(chapterStyle);

function frameAt(time=video.currentTime){return Math.max(0,Math.min(movieFrameCount-1,Math.floor(time*fps+.01)));}
function updateChapter(frame:number){
  const visible=currentMovie==='chain';chapterPanel.hidden=!visible;marks.hidden=!visible;
  const point=visible?chapterPoints.findLast(mark=>mark.frame<=frame):undefined;
  for(const button of markButtons){if(point&&Number(button.dataset.frame)===point.frame)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}
  if(!visible)return;
  chapterProgress.value=String(frame);
  chapterProgress.setAttribute('aria-valuetext',`Ruta ${frame} av ${movieFrameCount-1}${point?': '+point.labels.join(' + '):''}`);
  chapterTitle.textContent=point?`Aktuellt kapitel · ${point.labels.join(' + ')} (senaste markör: ruta ${point.frame})`:'Aktuellt kapitel · före första markören';
}
function updateCounter(time=video.currentTime){const frame=frameAt(time);counter.textContent=`Ruta ${frame} / ${movieFrameCount-1}`;updateChapter(frame);}
function seek(frame:number){video.pause();target=Math.max(0,Math.min(movieFrameCount-1,frame));video.currentTime=(target+.1)/fps;updateCounter();}
function stopFrameUpdates(){if(frameCallback!==null&&typeof video.cancelVideoFrameCallback==='function')video.cancelVideoFrameCallback(frameCallback);frameCallback=null;}
function scheduleFrameUpdate(){
  if(currentMovie!=='chain'||video.paused||frameCallback!==null||typeof video.requestVideoFrameCallback!=='function')return;
  frameCallback=video.requestVideoFrameCallback((_now,metadata)=>{frameCallback=null;updateCounter(metadata.mediaTime);scheduleFrameUpdate();});
}
chapterProgress.oninput=()=>{if(currentMovie==='chain')seek(Number(chapterProgress.value));};
document.querySelector<HTMLButtonElement>('#prev')!.onclick=()=>seek((target??frameAt())-1);
document.querySelector<HTMLButtonElement>('#next')!.onclick=()=>seek((target??frameAt())+1);
document.querySelector<HTMLButtonElement>('#slow')!.onclick=()=>{video.playbackRate=.25;};
document.querySelector<HTMLButtonElement>('#normal')!.onclick=()=>{video.playbackRate=1;};
video.onloadedmetadata=()=>updateCounter();
video.ontimeupdate=()=>updateCounter();
video.onseeked=()=>{target=video.paused?frameAt():null;updateCounter();};
video.onplay=()=>{target=null;play.textContent='Pausa';scheduleFrameUpdate();};
video.onpause=()=>{play.textContent='Spela';stopFrameUpdates();updateCounter();};
video.onended=()=>{stopFrameUpdates();updateCounter();};
video.onerror=()=>{stopFrameUpdates();counter.textContent='Filmen kunde inte laddas.';};
play.onclick=()=>{if(video.paused)void video.play().catch(()=>{counter.textContent='Filmen kunde inte startas.';});else video.pause();};
for(const button of markButtons)button.onclick=()=>{if(currentMovie==='chain')seek(Number(button.dataset.frame));};
select.onchange=()=>{
  video.pause();stopFrameUpdates();target=null;const id=select.value;currentMovie=id;
  const item=id==='chain'?data.chain:id==='bank'?data.bank.compact:data.bank.clips.find(clip=>clip.id===id)!;
  movieFrameCount=item.frames??(id==='bank'?4404:360);fps=item.fps??30;
  counter.textContent=`Ruta 0 / ${movieFrameCount-1}`;updateChapter(0);
  video.src=item.url;video.playbackRate=1;video.load();
  document.querySelector<HTMLAnchorElement>('#download')!.href=item.url;
  document.querySelector<HTMLElement>('#movie-hash')!.textContent='SHA-256: '+item.sha256;
};
document.querySelector<HTMLInputElement>('#filter')!.oninput=event=>{
  const term=(event.target as HTMLInputElement).value.toLowerCase();
  for(const row of document.querySelectorAll<HTMLElement>('[data-file]'))row.hidden=!row.textContent?.toLowerCase().includes(term);
};
updateCounter();
