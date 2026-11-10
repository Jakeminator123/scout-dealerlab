type Film={url:string;sha256:string;width:number;height:number;fps:number;frameCount:number;duration:number};
type Item={id:string;label:string;model:string;native:Film;portrait:Film;raw:Film|null;poster:string};
const idleData=JSON.parse(document.querySelector('#idle-data')!.textContent!) as {snapshot:string;items:Item[]};
const video=document.querySelector<HTMLVideoElement>('#idle-video')!,clip=document.querySelector<HTMLSelectElement>('#clip')!,view=document.querySelector<HTMLSelectElement>('#view')!;
const seek=document.querySelector<HTMLInputElement>('#seek')!,loop=document.querySelector<HTMLInputElement>('#loop')!,play=document.querySelector<HTMLButtonElement>('#play')!;
const label=document.querySelector('#frame-label')!,error=document.querySelector('#error')!;
let current=idleData.items[0],film=current.native,pendingFrame=0,resume=false;
function frame(){return Math.max(0,Math.min(film.frameCount-1,Math.floor(video.currentTime*film.fps+.0001)));}
function display(){const at=frame();label.textContent=`${at} / ${film.frameCount-1} · ${(at/film.fps).toFixed(2)} s`;seek.value=String(at);play.textContent=video.paused?'Spela':'Pausa';}
function go(f:number){video.pause();video.currentTime=Math.min(video.duration-.5/film.fps,(Math.max(0,Math.min(film.frameCount-1,f))+.5)/film.fps);display();}
function describe(){
 seek.max=String(film.frameCount-1);video.loop=loop.checked;video.classList.toggle('portrait',view.value==='portrait');
 document.querySelector('#facts')!.textContent=`${current.label} · ${film.width} × ${film.height} · ${film.fps} fps · ${film.frameCount} rutor · ${film.duration.toFixed(2)} s`;
 document.querySelector<HTMLAnchorElement>('#download')!.href=film.url;
 const identity=document.querySelector('#identity')!;identity.textContent='';const code=document.createElement('code');code.textContent=`SHA-256 ${film.sha256}`;identity.append(document.createTextNode(current.model+' · '),code);
 const rawOption=view.querySelector<HTMLOptionElement>('option[value="raw"]')!;rawOption.disabled=!current.raw;
}
function change(keepFrame:boolean){
 pendingFrame=keepFrame?frame():0;resume=!video.paused;video.pause();error.textContent='';current=idleData.items.find(i=>i.id===clip.value)!;
 if(view.value==='raw'&&!current.raw)view.value='native';film=current[view.value as 'native'|'portrait'|'raw']!;
 pendingFrame=Math.min(pendingFrame,film.frameCount-1);video.poster=view.value==='native'?current.poster:'';video.src=film.url;describe();video.load();
}
clip.addEventListener('change',()=>change(false));view.addEventListener('change',()=>change(true));
video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(video.duration-.5/film.fps,(pendingFrame+.5)/film.fps);if(resume)void video.play().catch(e=>{error.textContent=String(e);});display();});
video.addEventListener('error',()=>{error.textContent='Filmen kunde inte laddas. Öppna originalet via länken nedanför.';});
['timeupdate','seeked','play','pause','ended'].forEach(e=>video.addEventListener(e,display));
play.addEventListener('click',()=>{if(video.paused)void video.play().catch(e=>{error.textContent=String(e);});else video.pause();});
document.querySelector('#previous')!.addEventListener('click',()=>go(frame()-1));document.querySelector('#next')!.addEventListener('click',()=>go(frame()+1));
document.querySelector('#start')!.addEventListener('click',()=>go(0));document.querySelector('#end')!.addEventListener('click',()=>go(film.frameCount-1));
seek.addEventListener('input',()=>go(Number(seek.value)));loop.addEventListener('change',()=>{video.loop=loop.checked;});describe();
// Choose the actual available scene width on first load; users may override it.
if(document.querySelector('.stage')!.getBoundingClientRect().width<650){view.value='portrait';change(false);}
