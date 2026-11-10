/** Static review controls; data is embedded by build-review-hub.ts. */
type ReviewMovie = {url:string;sha256:string;frames?:number;id?:string};
declare const data: {chain:ReviewMovie & {frames:number};bank:{compact:ReviewMovie;clips:ReviewMovie[]}};
const video=document.querySelector<HTMLVideoElement>('#video')!;
const counter=document.querySelector<HTMLElement>('#frame')!;
const play=document.querySelector<HTMLButtonElement>('#play')!;
const select=document.querySelector<HTMLSelectElement>('#movie')!;
const marks=document.querySelector<HTMLElement>('#marks')!;
let frames=data.chain.frames,target:number|null=null;
function updateCounter(){counter.textContent=`Ruta ${Math.max(0,Math.min(frames-1,Math.floor(video.currentTime*30+.01)))} / ${frames-1}`;}
function seek(frame:number){video.pause();target=Math.max(0,Math.min(frames-1,frame));video.currentTime=(target+.1)/30;}
document.querySelector<HTMLButtonElement>('#prev')!.onclick=()=>seek((target??Math.floor(video.currentTime*30+.01))-1);
document.querySelector<HTMLButtonElement>('#next')!.onclick=()=>seek((target??Math.floor(video.currentTime*30+.01))+1);
document.querySelector<HTMLButtonElement>('#slow')!.onclick=()=>{video.playbackRate=.25;};
document.querySelector<HTMLButtonElement>('#normal')!.onclick=()=>{video.playbackRate=1;};
video.onloadedmetadata=updateCounter;
video.ontimeupdate=updateCounter;
video.onseeked=updateCounter;
video.onplay=()=>{target=null;play.textContent='Pausa';};
video.onpause=()=>{play.textContent='Spela';};
video.onerror=()=>{counter.textContent='Filmen kunde inte laddas.';};
play.onclick=()=>{if(video.paused)void video.play().catch(()=>{counter.textContent='Filmen kunde inte startas.';});else video.pause();};
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-frame]'))button.onclick=()=>seek(Number(button.dataset.frame));
select.onchange=()=>{
  video.pause();target=null;const id=select.value;
  const item=id==='chain'?data.chain:id==='bank'?data.bank.compact:data.bank.clips.find(clip=>clip.id===id)!;
  frames=id==='chain'?data.chain.frames:id==='bank'?4404:360;
  counter.textContent=`Ruta 0 / ${frames-1}`;
  video.src=item.url;video.playbackRate=1;video.load();marks.hidden=id!=='chain';
  document.querySelector<HTMLAnchorElement>('#download')!.href=item.url;
  document.querySelector<HTMLElement>('#movie-hash')!.textContent='SHA-256: '+item.sha256;
};
document.querySelector<HTMLInputElement>('#filter')!.oninput=event=>{
  const term=(event.target as HTMLInputElement).value.toLowerCase();
  for(const row of document.querySelectorAll<HTMLElement>('[data-file]'))row.hidden=!row.textContent?.toLowerCase().includes(term);
};
updateCounter();
