import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {buildBootstrap} from '../../tools/runpod-pilot/bootstrap.ts';
import {IMAGE,MAX_MINUTES,MAX_SPEECH,hash,loadBank} from './config.ts';
import {assertAccount,runpod,readOwner,saveOwner,stopOwnedPod,type PodOwner} from './pod.ts';

type Emit=(value:any)=>void;
export class GpuSession{
 root:string;owner:PodOwner|null=null;phase='off';message='GPU är avstängd';busy=false;used=0;
 private starting:Promise<void>|null=null;private abort=new AbortController();private jobAbort:AbortController|null=null;
 constructor(root:string){this.root=root;}
 async restore(){this.owner=await readOwner(this.root);if(this.owner&&!this.owner.terminatedAt){this.phase='recover';this.message='En tidigare testpod finns kvar. Stoppa den före en ny session.';}else this.owner=null;}
 status(){return {phase:this.phase,message:this.message,busy:this.busy,used:this.used,limit:MAX_SPEECH,expiresAt:this.owner&&!this.owner.terminatedAt?this.owner.expiresAt:null,podId:this.owner?.terminatedAt?null:this.owner?.id??null,hourlyRate:this.owner?.hourlyRate??null};}
 start(warmup:(emit:Emit,signal:AbortSignal)=>Promise<void>){
  if(this.starting||this.phase==='stopping'||this.owner&&!this.owner.terminatedAt)throw Error('En GPU-session finns redan eller håller på att avslutas.');
  this.abort=new AbortController();this.phase='starting';this.message='Hämtar och startar den gemensamma imagen …';this.used=0;
  this.starting=this.createAndWarm(warmup).catch(async(e:Error)=>{this.message=e.name==='AbortError'?'Uppstarten avbröts.':e.message;this.phase='error';if(this.owner)try{await stopOwnedPod(this.root,this.owner);}catch{this.phase='recover';this.message+=' Avstängningen behöver kontrolleras med Stoppa GPU.';}}).finally(()=>{this.starting=null;});
 }
 private async createAndWarm(warmup:(emit:Emit,signal:AbortSignal)=>Promise<void>){
  const root=this.root,signal=this.abort.signal;await assertAccount(root);
  const endpoint=await runpod(root,'/serverless/xdtgzndix4mcyb');if(endpoint?.image!==IMAGE||typeof endpoint.registry!=='string')throw Error('Image eller registry stämmer inte med den verifierade profilen.');
  const catalog=await runpod(root,'/catalog/gpus?include=AVAILABILITY&product=POD'),gpu=catalog.gpus.find((g:any)=>g.id==='NVIDIA GeForce RTX 4090');
  if(!gpu?.secure||gpu.availability==='NONE'||gpu.price.secure>1)throw Error('RTX 4090 saknas inom testets pristak.');
  const dataCenterIds=['EUR-NO-1','EUR-IS-2','EUR-IS-1','EU-RO-1'].filter(id=>gpu.dataCenters?.some((dc:any)=>dc.id===id&&dc.availability!=='NONE'));if(!dataCenterIds.length)throw Error('Ingen vald europeisk GPU är tillgänglig.');
  const {bundle,bootstrap}=await buildBootstrap(root);signal.throwIfAborted();
  const stamp=Date.now(),directory='runs/maud-lab-'+stamp;await mkdir(path.join(root,directory));
  this.owner={id:null,name:'snyggare-maudlab-'+stamp,image:IMAGE,token:randomBytes(32).toString('hex'),createdAt:stamp,expiresAt:stamp+MAX_MINUTES*60000,hourlyRate:gpu.price.secure+0.02,directory};await saveOwner(root,this.owner);
  const pod=await runpod(root,'/pods','POST',{name:this.owner.name,image:IMAGE,registry:endpoint.registry,cloud:'SECURE',gpu:{id:gpu.id,count:1,minCudaVersion:'12.0'},dataCenterIds,disk:40,ports:['8888/http'],startSsh:false,startJupyter:false,entrypoint:['/usr/bin/python3','-c',bootstrap],cmd:[],env:{LAB_TOKEN:this.owner.token,LAB_CODE:bundle}});
  if(!pod?.id)throw Error('RunPod gav inget pod-ID. Kontrollera det sparade försöket.');this.owner.id=pod.id;await saveOwner(root,this.owner);
  const child=spawn(process.execPath,[path.join(root,'tools/maud-gpu-watchdog.ts'),root,pod.id],{detached:true,windowsHide:true,stdio:'ignore'});child.unref();this.owner.watchdogPid=child.pid;await saveOwner(root,this.owner);
  signal.throwIfAborted();let ready=0;
  while(ready<2){
   signal.throwIfAborted();if(Date.now()>this.owner.expiresAt-120000)throw Error('Uppstarten tog för lång tid inom testets tidsram.');
   try{const r=await this.remote('/health',undefined,signal);const h=r.ok?await r.json():null;
    if(h?.sdkReady&&h.podId===pod.id){const logs=await this.remote('/logs',undefined,signal);if(logs.ok&&logs.headers.get('x-lab-relay')==='maud-https-v4'){await logs.text();ready++;}else ready=0;}
   }catch(e){if(signal.aborted)throw e;ready=0;}
   if(ready<2)await new Promise(r=>setTimeout(r,3000));
  }
  this.phase='warming';this.message='Laddar Mauds bank och värmer modellen …';
  await this.preload('maud',signal);await warmup(()=>{},signal);signal.throwIfAborted();
  this.phase='ready';this.message='Maud är varm och redo';
 }
 async remote(route:string,body?:unknown,signal?:AbortSignal){
  if(!this.owner?.id||this.owner.terminatedAt)throw Error('GPU är inte startad.');
  return fetch(`https://${this.owner.id}-8888.proxy.runpod.net${route}`,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+this.owner.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.any([this.abort.signal,...(signal?[signal]:[]),AbortSignal.timeout(route==='/session'?190000:45000)]),redirect:'error'});
 }
 async preload(id:string,signal?:AbortSignal){const bank=await loadBank(this.root,id);const r=await this.remote('/setup',{archive:bank.archive.toString('base64'),receipt:bank.receipt.toString('base64'),archiveSha:hash(bank.archive),receiptSha:hash(bank.receipt)},signal);if(!r.ok)throw Error('Banköverföringen misslyckades: HTTP '+r.status);await r.json();return bank;}
 async render(text:string,audio:(signal:AbortSignal)=>Promise<{pcm:Buffer;frames:number;ttsMs:number;reused:boolean}>,emit:Emit,signal:AbortSignal,warmup=false){
  if(this.busy)throw Error('Maud arbetar redan med en replik.');
  if(!warmup&&(this.phase!=='ready'||this.used>=MAX_SPEECH))throw Error('Starta en ny GPU-session för att fortsätta.');
  const bank=await loadBank(this.root);if(this.busy)throw Error('Maud arbetar redan med en replik.');
  this.busy=true;if(!warmup)this.used++;
  const localAbort=new AbortController();this.jobAbort=localAbort;
  const combined=AbortSignal.any([signal,this.abort.signal,localAbort.signal,AbortSignal.timeout(190000)]);
  const id='talk-'+Date.now()+'-'+randomBytes(3).toString('hex'),directory=path.join(this.root,this.owner!.directory,id);
  const t0=performance.now(),events:any[]=[],binding={...bank.manifest.binding,sessionId:id,attemptId:id,nonce:randomBytes(32).toString('hex')};
  const record=(value:any)=>{const item={...value,elapsedMs:performance.now()-t0,id};events.push({...item,data:undefined,pcm:undefined});emit(item);};
  let audioTask:Promise<void>|undefined,failure:Error|undefined,result:any=null,accepted=false;
  try{
   await mkdir(directory);
   record({t:'text_ready',text});
   const r=await this.remote('/session',{binding},combined);if(!r.ok||!r.body)throw Error('GPU-sessionen avvisades: HTTP '+r.status);
   let pending='';const decoder=new TextDecoder();
   for await(const bytes of r.body){pending+=decoder.decode(bytes,{stream:true});let at:number;
    while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(!line)continue;const m=JSON.parse(line);
     if(m.t==='accepted'&&!accepted){accepted=true;audioTask=(async()=>{
      combined.throwIfAborted();const a=await audio(combined);combined.throwIfAborted();
      const take=bank.manifest.source.clips[0].take,planHash=hash(JSON.stringify({take,frames:a.frames,pcmSha256:hash(a.pcm)}));
      const start={t:'start',id:`${id}#1#${planHash}`,ljud_id:id,rate:24000,karta:[[take,0,a.frames]],fran_ruta:0};
      await writeFile(path.join(directory,'audio.pcm'),a.pcm);await writeFile(path.join(directory,'audio.json'),JSON.stringify({...a,pcm:undefined,pcmSha256:hash(a.pcm),start},null,2));
      record({t:'audio',pcm:a.pcm.toString('base64'),samples:a.pcm.length/2,frames:a.frames,ttsMs:a.ttsMs,reused:a.reused,take});
      const sent=await this.remote('/audio',{start,pcm:a.pcm.toString('base64')},combined);if(!sent.ok)throw Error('Ljudöverföringen misslyckades.');await sent.json();
     })().catch(e=>{failure=e;localAbort.abort();});}
     if(m.t==='chunk'){const n=String(m.meta.del).padStart(3,'0');await writeFile(path.join(directory,'del'+n+'.h264'),Buffer.from(m.data,'base64'));await writeFile(path.join(directory,'del'+n+'.json'),JSON.stringify(m.meta));}
     if(m.t==='error')throw Error('GPU: '+m.code);if(m.t==='result'){result=m.result;if(result?.output?.status!=='complete')throw Error('GPU: '+(result?.output?.code??'ofullständigt svar'));}record(m);
    }
   }
   await audioTask;if(failure)throw failure;if(!result)throw Error('GPU-strömmen slutade utan kvitto.');
  }catch(e:any){failure??=e;throw failure;}
  finally{localAbort.abort();await audioTask;this.busy=false;this.jobAbort=null;await writeFile(path.join(directory,'result.json'),JSON.stringify({id,text,events,result,error:failure?.message??null},null,2));}
 }
 cancel(){this.jobAbort?.abort();}
 async stop(){this.phase='stopping';this.message='Avslutar testets GPU …';this.abort.abort();this.cancel();if(this.starting)await this.starting;const current=await readOwner(this.root);if(current&&!current.terminatedAt)await stopOwnedPod(this.root,current);this.owner=current;this.phase='off';this.message='GPU är avstängd';}
}
