import type {IncomingMessage,ServerResponse} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {GpuSession} from './gpu.ts';
import {readOwner} from './pod.ts';
import {frameCount,hash,keys,loadBank,localFile,MAX_CHATS,MAX_MINUTES,MAX_SPEECH,profiles,shortText} from './config.ts';

export const CHAT_MODEL='gpt-4.1-mini';
export async function askMaud(key:string,message:string,signal:AbortSignal,request:typeof fetch=fetch){
 const t0=performance.now();
 const r=await request('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),redirect:'error',body:JSON.stringify({model:CHAT_MODEL,store:false,max_output_tokens:60,instructions:'Du är Maud, en varm svensk blackjackdealer i ett lokalt filmtest. Svara på svenska med EN kort replik på 1–3 enkla ord och högst 24 tecken, utan citattecken. Inga speltransaktioner eller verktyg. Om någon frågar vem som är kung, svara Jakob är kung. Hälsa gärna kort när någon hälsar. Repliken ska gå att säga på under två sekunder.',input:message})});
 if(!r.ok)throw Error('OpenAI svarade HTTP '+r.status+'.');const result=await r.json();
 const text=shortText(result.output?.flatMap((o:any)=>o.content??[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text??'').join(' '),48);
 if(result.status!=='completed'||!result.id)throw Error('OpenAI gav inget färdigt svar.');
 return {text,model:CHAT_MODEL,id:result.id,usage:result.usage,ms:performance.now()-t0};
}
const pcmFrom=(filename:string)=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',filename,'-vn','-ac','1','-ar','24000','-f','s16le','pipe:1'],{windowsHide:true,maxBuffer:2*1024*1024});
export async function maudAudio(root:string,text:string,signal:AbortSignal,request:typeof fetch=fetch){
 const t0=performance.now(),bank=await loadBank(root);
 if(text==='Jakob är kung'){const pcm=pcmFrom(await localFile(root,bank.profile.warmupAudio));return {pcm,frames:frameCount(pcm.length/2),ttsMs:0,reused:true};}
 const fingerprint=hash(JSON.stringify({text,voice:bank.profile.voiceId,model:'eleven_multilingual_v2',seed:20261108})),folder=path.join(root,'private/maud-lab/audio',fingerprint);
 try{const pcm=await readFile(path.join(folder,'audio.pcm'));return {pcm,frames:frameCount(pcm.length/2),ttsMs:0,reused:true};}catch(e:any){if(e.code!=='ENOENT')throw e;}
 await mkdir(folder,{recursive:true});
 try{await writeFile(path.join(folder,'attempt.json'),JSON.stringify({text,voiceId:bank.profile.voiceId,at:new Date().toISOString()}),{flag:'wx'});}catch(e:any){if(e.code==='EEXIST')throw Error('Den repliken har redan ett oavslutat röstförsök. Inget nytt anrop skickades.');throw e;}
 signal.throwIfAborted();const key=(await keys(root))[bank.profile.voiceCredential];if(!key)throw Error('Nyckeln till Mauds röst saknas.');
 const r=await request('https://api.elevenlabs.io/v1/text-to-speech/'+bank.profile.voiceId+'?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:'eleven_multilingual_v2',seed:20261108}),signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),redirect:'error'});
 await writeFile(path.join(folder,'receipt.json'),JSON.stringify({http:r.status,requestId:r.headers.get('request-id'),characterCost:r.headers.get('character-cost')}));if(!r.ok)throw Error('ElevenLabs svarade HTTP '+r.status+'.');
 const filename=path.join(folder,'audio.mp3');await writeFile(filename,Buffer.from(await r.arrayBuffer()));signal.throwIfAborted();
 const pcm=pcmFrom(filename);await writeFile(path.join(folder,'audio.pcm'),pcm);return {pcm,frames:frameCount(pcm.length/2),ttsMs:performance.now()-t0,reused:false};
}
export function createMaudLab(root:string,csrf:string){
 const gpu=new GpuSession(root),initialized=gpu.restore();let chats=0,chatBusy=false;
 const respond=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 async function body(req:IncomingMessage){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16000)throw Error('För stort anrop.');}return JSON.parse(text||'{}');}
 return {gpu,stop:async()=>{await initialized;await gpu.stop();},handle:async(req:IncomingMessage,res:ServerResponse,url:URL)=>{
  if(!url.pathname.startsWith('/api/maud/'))return false;
  await initialized;
  try{
   if(req.method==='GET'&&url.pathname==='/api/maud/status'){
    const owner=await readOwner(root);if(owner?.terminatedAt&&owner.id===gpu.owner?.id){gpu.owner=owner;gpu.phase='off';gpu.message='GPU är avstängd';}
    const env=await keys(root),bank=await loadBank(root);
    respond(res,{csrf,gpu:gpu.status(),keys:{openai:!!env.OPENAI_API_KEY,runpod:!!env.RUNPOD_JAKOB_API_KEY,voice:!!env[bank.profile.voiceCredential]},model:CHAT_MODEL,chats,chatLimit:MAX_CHATS,minutes:MAX_MINUTES,speechLimit:MAX_SPEECH,profile:{id:'maud',label:bank.profile.label,source:'/files/'+bank.profile.source,saved:'/files/'+bank.profile.savedVideo,sourceSha256:bank.manifest.source.clips[0].sha256,bankBytes:bank.archive.length,fps:24,frames:63,duration:2.625},openclawConnected:false});return true;
   }
   if(req.method!=='POST'||req.headers['x-maud-csrf']!==csrf){respond(res,{error:'Ladda om testytan före nästa anrop.'},403);return true;}
   const input=await body(req);
   if(url.pathname==='/api/maud/gpu/start'){
    gpu.start((emit,signal)=>gpu.render('Jakob är kung',s=>maudAudio(root,'Jakob är kung',s),emit,signal,true));respond(res,{started:true},202);return true;
   }
   if(url.pathname==='/api/maud/gpu/stop'){await gpu.stop();respond(res,{stopped:true});return true;}
   if(url.pathname==='/api/maud/banks/preload'){
    if(gpu.phase!=='ready'||gpu.busy)throw Error('Starta GPU och vänta tills den är redo.');const id=shortText(input.id,64);await gpu.preload(id);respond(res,{preloaded:id});return true;
   }
   if(url.pathname==='/api/maud/chat'){
    if(chatBusy||chats>=MAX_CHATS)throw Error('Chatten arbetar redan eller har nått testgränsen på 20 svar.');const text=shortText(input.message,500);
    const key=(await keys(root)).OPENAI_API_KEY;if(!key)throw Error('OpenAI-nyckeln saknas i labbets .env.local.');chatBusy=true;chats++;
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const folder=path.join(root,'runs','maud-chat-'+Date.now()+'-'+randomUUID().slice(0,8));await mkdir(folder);await writeFile(path.join(folder,'request.json'),JSON.stringify({message:text,model:CHAT_MODEL,at:new Date().toISOString()}));
    try{const result=await askMaud(key,text,controller.signal);await writeFile(path.join(folder,'reply.json'),JSON.stringify(result,null,2));respond(res,result);}finally{chatBusy=false;}return true;
   }
   if(url.pathname==='/api/maud/speak'){
    const text=shortText(input.text);if(gpu.phase!=='ready'||gpu.busy||gpu.used>=MAX_SPEECH)throw Error('Starta GPU och vänta tills Maud är redo.');
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});res.flushHeaders();
    try{await gpu.render(text,s=>maudAudio(root,text,s),m=>{if(!res.destroyed)res.write(JSON.stringify(m)+'\n');},controller.signal);}
    catch(e:any){if(!res.destroyed)res.write(JSON.stringify({t:'error',code:e.name==='AbortError'?'Repliken avbröts.':e.message})+'\n');}
    finally{res.end();}return true;
   }
   if(url.pathname==='/api/maud/cancel'){gpu.cancel();respond(res,{cancelled:true});return true;}
   if(url.pathname==='/api/maud/receipt'){
    if(!/^talk-\d+-[a-f0-9]{6}$/.test(input.id)||!gpu.owner)throw Error('Okänt prov-ID.');
    await writeFile(path.join(root,gpu.owner.directory,input.id,'browser.json'),JSON.stringify(input,null,2),{flag:'wx'});respond(res,{saved:true});return true;
   }
   respond(res,{error:'Okänt testanrop.'},404);return true;
  }catch(e:any){if(!res.headersSent)respond(res,{error:e.message??'Testanropet misslyckades.'},400);else res.end();return true;}
 }};
}
