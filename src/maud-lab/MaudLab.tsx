'use client';
import {useEffect,useRef,useState} from 'react';
import {MaudPlayer,type PlaybackReceipt} from './player';
import './maud.css';
type Message={role:'user'|'maud';text:string;ms?:number};
const seconds=(ms:number|null|undefined)=>typeof ms==='number'?(ms/1000).toFixed(2)+' s':'—';
export default function MaudLab(){
 const [status,setStatus]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState('Spela filmen eller prova den sparade repliken.'),[message,setMessage]=useState('Vem är kung?'),[reply,setReply]=useState('Jakob är kung');
 const [messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState<PlaybackReceipt|null>(null),[saved,setSaved]=useState(false),[mode,setMode]=useState('direct'),[speak,setSpeak]=useState(true),[loop,setLoop]=useState(true);
 const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),player=useRef<MaudPlayer|null>(null),request=useRef<AbortController|null>(null),chatRequest=useRef<AbortController|null>(null),activity=useRef(0),token=useRef('');
 const post=async(route:string,data:unknown={},signal?:AbortSignal)=>{
  const r=await fetch('/api/maud/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Maud-Csrf':token.current},body:JSON.stringify(data),signal});const value=await r.json();if(!r.ok)throw Error(value.error||'Anropet misslyckades.');return value;
 };
 async function refresh(){try{const r=await fetch('/api/maud/status');const s=await r.json();if(!r.ok)throw Error(s.error);token.current=s.csrf;setStatus(s);}catch(e:any){setError(e.message);}}
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),2000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  if(!status?.profile||!video.current||!canvas.current)return;
  const p=new MaudPlayer(video.current,canvas.current,setNotice,result=>{setReceipt(result);setBusy(false);if(result.id)void post('receipt',result).catch(e=>setError(e.message));});player.current=p;
  return()=>{request.current?.abort();chatRequest.current?.abort();p.dispose();player.current=null;};
 },[status?.profile?.source]);
 useEffect(()=>{if(player.current)player.current.loop=loop;},[loop,status?.profile?.source]);
 async function gpuAction(action:'start'|'stop'){
  setError('');try{if(action==='stop'){activity.current++;request.current?.abort();chatRequest.current?.abort();player.current?.talk?.cancel();}await post('gpu/'+action);await refresh();}catch(e:any){setError(e.message);}
 }
 async function stream(text:string,prepared?:Awaited<ReturnType<MaudPlayer['prepare']>>){
  const p=player.current;if(!p||prepared?.closed)return;setSaved(false);setBusy(true);setError('');setReceipt(null);
  const talk=prepared??await p.prepare(mode);if(talk.closed){setBusy(false);return;}const controller=new AbortController();request.current=controller;
  try{
   const r=await fetch('/api/maud/speak',{method:'POST',headers:{'Content-Type':'application/json','X-Maud-Csrf':token.current},body:JSON.stringify({text}),signal:controller.signal});
   if(!r.ok)throw Error((await r.json()).error);if(!r.body)throw Error('Ingen videoström kom fram.');
   let pending='';const decoder=new TextDecoder();
   for await(const chunk of r.body as any){pending+=decoder.decode(chunk,{stream:true});let i:number;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);if(line)await talk.on(JSON.parse(line));}}
  }catch(e:any){await talk.finish(e.name==='AbortError'?'Avbruten av användaren.':e.message);setBusy(false);if(e.name!=='AbortError')setError(e.message);}
  finally{if(request.current===controller)request.current=null;void refresh();}
 }
 async function chat(event:React.FormEvent){
  event.preventDefault();if(busy||!message.trim())return;setBusy(true);setError('');setNotice('Maud tänker …');
  const text=message,version=++activity.current,controller=new AbortController();chatRequest.current=controller;setMessages(m=>[...m,{role:'user',text}]);let prepared:Awaited<ReturnType<MaudPlayer['prepare']>>|undefined;
  try{
   if(speak&&status?.gpu.phase==='ready')prepared=await player.current?.prepare(mode);
   const result=await post('chat',{message:text},controller.signal);if(version!==activity.current)return;setMessages(m=>[...m,{role:'maud',text:result.text,ms:result.ms}]);setReply(result.text);
   if(prepared)await stream(result.text,prepared);else{setNotice('Svar klart. Starta GPU för ny läppsynk, eller spela det sparade provet.');setBusy(false);}
  }catch(e:any){prepared?.cancel();setBusy(false);if(e.name!=='AbortError')setError(e.message);}finally{if(chatRequest.current===controller)chatRequest.current=null;}
 }
 function cancel(){activity.current++;request.current?.abort();chatRequest.current?.abort();player.current?.talk?.cancel();void post('cancel').catch(e=>setError(e.message));setBusy(false);setNotice('Avbruten av användaren.');}
 const ready=status?.gpu.phase==='ready',active=status?.gpu.podId||['starting','warming','recover'].includes(status?.gpu.phase);
 return <main className="ml-app">
  <header className="ml-top"><a href="/">← Dealerstudion</a><span>LOKALT LABB / MAUD</span><span className={'ml-badge '+(ready?'ml-ready':'')}>{status?.gpu.message||'Läser testytan …'}</span></header>
  <div className="ml-heading"><div><p className="ml-eyebrow">EN DEALER. EN FILM. DIN KONTROLL.</p><h1>Prata med Maud</h1><p>Se originalet, jämför det sparade provet och testa nya korta repliker.</p></div><a className="ml-doc" href="/files/docs/drift/MAUD-TESTYTA.md" target="_blank" rel="noreferrer">Guide och mätningar ↗</a></div>
  <section className="ml-grid">
   <div className="ml-stage-card">
    <div className="ml-stage-label"><b>{saved?'Sparat lyckat prov':'Maud · delar till box fyra'}</b><span>{saved?'”Jakob är kung” · lokal provfilm':'2,625 s · 24 fps · rörligt original'}</span></div>
    <div className="ml-stage" style={{display:saved?'none':undefined}}><canvas ref={canvas} width="1080" height="1920" aria-label="Mauds film med munlager"/><video ref={video} src={status?.profile.source} muted playsInline preload="auto" style={{display:'none'}}/></div>
    {saved&&<div className="ml-stage"><video src={status?.profile.saved} controls playsInline autoPlay aria-label="Sparad Maud-film med Jakob är kung"/></div>}
    <div className="ml-controls"><button disabled={busy} onClick={()=>{setSaved(false);void player.current?.play();}}>▶ Spela Maud</button><button disabled={busy||saved} onClick={()=>player.current?.pause()}>Pausa</button><button disabled={busy} onClick={()=>{player.current?.pause();setSaved(true);}}>Sparat prov · gratis</button><label><input type="checkbox" checked={loop} onChange={e=>setLoop(e.target.checked)}/> Loopa klippet</label></div>
    <p className="ml-notice" role="status">{notice}</p>
    <div className="ml-metrics"><div><small>TEXT → TALSTART</small><b>{seconds(receipt?.textToAudibleMs)}</b></div><div><small>FÖRSTA MUNPAKET</small><b>{seconds(receipt?.firstPacketMs)}</b></div><div><small>SAKNADE MUNRUTOR</small><b>{receipt?receipt.missingMouthFrames.length:'—'}</b></div><div><small>TAPPADE VIDEORUTOR</small><b>{receipt?.droppedVideoFrames??'—'}</b></div></div>
    {receipt&&<p className="ml-foot">{receipt.success?(receipt.droppedVideoFrames>0||receipt.missingMouthFrames.length>0||(receipt.maxDriftMs??0)>1000/24?'Spelat klart – granska tidsavvikelsen':'Uppspelningen klar'):'Provet avbröts'} · {receipt.frames}/{receipt.expected} munrutor · köväntan {seconds(receipt.queueWaitMs)} · klockavvikelse {receipt.maxDriftMs?.toFixed(1)??'—'} ms. Talstart mäts med ljudklockan.</p>}
   </div>
   <aside className="ml-side">
    <section className="ml-panel ml-gpu"><div><span className="ml-step">01</span><h2>Gör Maud redo</h2></div><p>Sparade filmer fungerar direkt. Nya repliker behöver en varm GPU på ditt RunPod-konto.</p><div className="ml-actions"><button className="ml-primary" disabled={!status||!!active||!status.keys.runpod} onClick={()=>void gpuAction('start')}>Starta GPU · 20 min</button><button disabled={!active} onClick={()=>void gpuAction('stop')}>Stoppa GPU</button></div><small>Automatisk stoppgräns 20 min från start · högst 10 repliker · GPU högst cirka 0,35 USD per session enligt pristaket. Röst och text debiteras separat. Kallstart kan ta flera minuter.</small>{active&&<p className="ml-foot">{status.gpu.used}/{status.gpu.limit} repliker · stopp senast {new Date(status.gpu.expiresAt).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}</p>}</section>
    <section className="ml-panel"><div className="ml-title"><span className="ml-step">02</span><h2>Chatta</h2><span>OpenAI · Maud</span></div><p>En enkel testpersona. OpenClaw är ännu inte anslutet. Svaren hålls till 1–3 ord för det korta klippet.</p><div className="ml-messages" aria-live="polite">{messages.length?messages.map((m,i)=><div key={i} className={'ml-message '+m.role}><small>{m.role==='maud'?'MAUD':'DU'}{m.ms?' · '+seconds(m.ms):''}</small><p>{m.text}</p></div>):<div className="ml-empty">Prova ”Vem är kung?” eller hälsa på Maud.</div>}</div><form onSubmit={chat}><label className="ml-label" htmlFor="maud-chat">Ditt meddelande</label><div className="ml-compose"><input id="maud-chat" value={message} maxLength={500} onChange={e=>setMessage(e.target.value)}/><button className="ml-primary" disabled={busy||!status?.keys.openai}>Skicka</button></div></form><label className="ml-option"><input type="checkbox" checked={speak} onChange={e=>setSpeak(e.target.checked)}/> Läs upp med läppsynk när GPU är redo</label></section>
    <section className="ml-panel"><div><span className="ml-step">03</span><h2>Styr repliken</h2></div><label className="ml-label" htmlFor="maud-reply">Exakt det Maud ska säga</label><input id="maud-reply" value={reply} maxLength={48} onChange={e=>setReply(e.target.value)}/><label className="ml-label" htmlFor="maud-timing">När ska hon börja?</label><select id="maud-timing" value={mode} onChange={e=>setMode(e.target.value)} disabled={busy}><option value="direct">Direkt när munlagret är redo</option><option value="next">Nästa varv av samma klipp</option></select><div className="ml-actions"><button className="ml-primary" disabled={!ready||busy||status.gpu.used>=status.gpu.limit} onClick={()=>void stream(reply)}>Säg repliken</button><button disabled={!busy} onClick={cancel}>Avbryt tal</button></div><small>”Jakob är kung” återanvänder sparat ljud. Nya texter skapar Mauds röst med ElevenLabs. Nästa varv testar en enkel klippkö, inte spelets fullständiga kö.</small></section>
   </aside>
  </section>
  {error&&<div className="ml-error" role="alert">{error}</div>}
  <details className="ml-explain"><summary>Vad laddas egentligen? Image, dealerbank och worker</summary><div><p><b>Image:</b> ett gemensamt programpaket med modell och GPU-bibliotek. Cirka 20 GB i nuvarande version. Det är ingen film och ingen ny språkmodell.</p><p><b>Dealerbank:</b> filmens förberäknade ansikten, masker och metadata. Den här banken är {status?(status.profile.bankBytes/1e6).toFixed(2):'4,75'} MB för ett Maud-klipp. Fler filmer tar mer plats.</p><p><b>Worker/pod:</b> datorn som kör paketet. Bankerna laddas separat. Fler workers hjälper samtidiga repliker, inte automatiskt samma repliks hastighet.</p><p><b>Förladdning:</b> testets startknapp hämtar samma image, laddar banken och värmer modellen. Ingen ny image byggs per dealer. Modellbyte mellan olika banker behöver fortfarande optimeras.</p></div></details>
 </main>;
}
