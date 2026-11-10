'use client';
import {useRef,useState} from 'react';
export type IdleCandidate={name:string;startFrameInclusive:number;endFrameInclusive:number;frames:number;fps:number;seconds:number;observedBlinkCount:number;browserTriple:{path:string;sha256:string;frames:number;seconds:number};originalPixelMaster:{path:string;sha256:string}};
const file=(p:string)=>'/files/'+p.split('/').map(encodeURIComponent).join('/');
export default function PamelaIdleCandidates({candidates,publicMode=false}:{candidates:IdleCandidate[];publicMode?:boolean}){
 const [selection,setSelection]=useState(0),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),video=useRef<HTMLVideoElement>(null);
 const item=candidates[selection],names=['Lugn andning','Blinkinstick','Sidblicksinstick'];
 const seek=(f:number)=>{const v=video.current;if(v){v.pause();v.currentTime=(f+.1)/item.fps;setFrame(f);}};
 return <main style={{maxWidth:1400,margin:'auto',padding:28,color:'#edf2ed',background:'#121b18',font:'16px/1.5 system-ui',minHeight:'100vh'}}>
 <style>{`.pi-nav,.pi-controls{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.pi-button{background:#2b4237;color:white;border:1px solid #729781;border-radius:8px;padding:10px 15px;font:inherit;cursor:pointer}.pi-button[aria-pressed=true]{background:#b3d3bd;color:#17231b}a{color:#bbd8c7}.pi-video{width:100%;max-height:68vh;background:#080f0c;display:block}.pi-note{color:#b7c6bd}`}</style>
 <nav className="pi-nav"><a href={publicMode?'/pamela-bank.html':'/pamela-prov?view=motion'}>Rörelsebanken</a><a href={publicMode?'/pamela-givning.html':'/pamela-prov?view=scene-motion'}>Givning i separat scen</a></nav>
 <h1>Tre VILA-kandidater</h1><p>Andningen är tänkt som lugn bas. Blinkning och sidblick är korta instick mellan lugnare perioder.</p>
 <div className="pi-controls">{candidates.map((c,i)=><button className="pi-button" key={c.name} aria-pressed={selection===i} onClick={()=>{video.current?.pause();setSelection(i);setFrame(0);setPlaying(false);}}>{names[i]} · {c.seconds.toFixed(2)} s</button>)}</div>
 <video className="pi-video" key={item.name} ref={video} src={file(item.browserTriple.path)} controls muted playsInline preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onTimeUpdate={e=>setFrame(Math.min(item.browserTriple.frames-1,Math.floor(e.currentTarget.currentTime*item.fps)))}/>
 <div className="pi-controls"><button className="pi-button" onClick={()=>{const v=video.current;if(v)void(playing?v.pause():v.play());}}>{playing?'Pausa':'Spela tre varv'}</button><button className="pi-button" onClick={()=>seek(Math.max(0,item.frames-10))}>Strax före första skarven</button><button className="pi-button" onClick={()=>seek(Math.max(0,frame-1))}>← En ruta</button><button className="pi-button" onClick={()=>seek(Math.min(item.browserTriple.frames-1,frame+1))}>En ruta →</button><span>Provbild {frame} · källruta {item.startFrameInclusive+frame%item.frames}</span></div>
 <p>{item.frames} originalrutor, {item.fps} fps. {item.observedBlinkCount} observerade blinkningar i valt fönster. Provet upprepar fönstret tre gånger utan övertoning.</p>
 <p className="pi-note">Källrutorna i den förlustfria exporten är pixelverifierade. Webbläsarfilmen har enbart komprimerats för uppspelning. Skarvacceptans, anslutning till REDO och separata lager återstår.</p>
 <p><a href={file(item.originalPixelMaster.path)} download>Ladda ned förlustfri klippmaster</a> · <a href={file(item.browserTriple.path)} download>Ladda ned granskningsfilm</a> · <a href={file('runs/20261109-pamela-idle-loop-fit/review.json')}>Källor och granskning</a></p>
 </main>;
}
