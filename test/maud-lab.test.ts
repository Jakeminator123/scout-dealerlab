import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {once} from 'node:events';
import {IMAGE,hash,frameCount,shortText,loadBank,localFile} from '../src/maud-lab/config.ts';
import {askMaud} from '../src/maud-lab/service.ts';import {GpuSession} from '../src/maud-lab/gpu.ts';import {splitUnits} from '../src/maud-lab/decoder.ts';import {createLabServer} from '../src/server.ts';
import {saveOwner,readOwner} from '../src/maud-lab/pod.ts';

async function fixture(t:any){
 const base=os.tmpdir(),root=await mkdtemp(path.join(base,'maud-lab-test-'));
 t.after(async()=>{assert.equal(path.dirname(root),base);assert.ok(path.basename(root).startsWith('maud-lab-test-'));await rm(root,{recursive:true,force:true});});
 await mkdir(path.join(root,'references'));await mkdir(path.join(root,'runs/bank'),{recursive:true});
 const archive=Buffer.from('bank fixture'),receipt=Buffer.from('{}'),source=Buffer.from('source fixture');
 const profile={id:'maud',label:'Maud',manifest:'runs/bank/manifest.json',archive:'runs/bank/bank.tar',receipt:'runs/bank/receipt.json',source:'runs/bank/source.mp4',savedVideo:'runs/bank/source.mp4',warmupAudio:'runs/bank/audio.wav',voiceId:'test-voice',voiceCredential:'ELEVENLABS_SCOUT_API_KEY'};
 const manifest={image:IMAGE,binding:{dealerId:'maud',workerAvatar:'maud',avatarSha256:hash(archive),bankReceiptSha256:hash(receipt)},source:{clips:[{sha256:hash(source),take:'clip-fixture',frameCount:63}]}};
 await Promise.all([writeFile(path.join(root,'references/lipsync-banks.json'),JSON.stringify({schemaVersion:1,profiles:[profile]})),writeFile(path.join(root,profile.manifest),JSON.stringify(manifest)),writeFile(path.join(root,profile.archive),archive),writeFile(path.join(root,profile.receipt),receipt),writeFile(path.join(root,profile.source),source),writeFile(path.join(root,'.env.local'),'OPENAI_API_KEY=fixture-not-a-key\n')]);return root;
}
test('audio must fit the exact 63-frame source; input cannot silently truncate',()=>{
 assert.equal(frameCount(34551),52);assert.equal(frameCount(45999),63);assert.throws(()=>frameCount(46000));assert.throws(()=>frameCount(0));assert.throws(()=>shortText('a'.repeat(49)));assert.equal(shortText(' Jakob  är kung '),'Jakob är kung');
});
test('bank identity fails on changed bytes and paths outside material roots',async t=>{
 const root=await fixture(t);assert.equal((await loadBank(root)).archive.length,12);await assert.rejects(localFile(root,'../.env.local'));
 await writeFile(path.join(root,'runs/bank/source.mp4'),'changed');await assert.rejects(loadBank(root),/filhash/);
});
test('OpenAI call stays server-side, bounded, and rejects incomplete replies',async()=>{
 let body:any;
 const request:typeof fetch=async(_url,options)=>{body=JSON.parse(options?.body as string);return Response.json({id:'resp-fixture',status:'completed',usage:{total_tokens:20},output:[{content:[{type:'output_text',text:'Hej Jakob'}]}]});};
 const result=await askMaud('fixture-key','Hej',new AbortController().signal,request);assert.equal(result.text,'Hej Jakob');assert.equal(body.store,false);assert.equal(body.max_output_tokens,60);assert.ok(!JSON.stringify(body).includes('fixture-key'));
 await assert.rejects(askMaud('fixture','Hej',new AbortController().signal,async()=>Response.json({id:'r',status:'incomplete',output:[{content:[{type:'output_text',text:'Hej'}]}]})),/färdigt/);
});
test('rejected GPU admission does not create audio and releases the job lock',async t=>{
 const root=await fixture(t),gpu=new GpuSession(root);gpu.phase='ready';gpu.owner={id:'fixture',name:'snyggare-maudlab-fixture',image:IMAGE,token:'fixture',createdAt:0,expiresAt:Date.now()+60000,hourlyRate:0,directory:'runs/bank'};
 gpu.remote=async()=>new Response(null,{status:503});let audioCalls=0;
 await assert.rejects(gpu.render('Hej',async()=>{audioCalls++;return{pcm:Buffer.alloc(2000),frames:19,ttsMs:0,reused:false};},()=>{},new AbortController().signal),/503/);assert.equal(audioCalls,0);assert.equal(gpu.busy,false);
});
test('cancelling an admitted GPU job aborts an in-flight audio request',async t=>{
 const root=await fixture(t),gpu=new GpuSession(root);gpu.phase='ready';gpu.owner={id:'fixture',name:'snyggare-maudlab-fixture',image:IMAGE,token:'fixture',createdAt:0,expiresAt:Date.now()+60000,hourlyRate:0,directory:'runs/bank'};
 gpu.remote=async(_route,_body,signal)=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"t":"accepted","jobId":"fixture"}\n'));signal!.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});}}));
 let aborted=false;const controller=new AbortController();
 const running=gpu.render('Hej',signal=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true});controller.abort();}),()=>{},controller.signal);
 await assert.rejects(running);assert.equal(aborted,true);assert.equal(gpu.busy,false);
});
test('Annex-B decoder rejects a chunk without its independent keyframe',()=>{
 const valid=Uint8Array.from([0,0,0,1,9,0xf0,0,0,0,1,0x65,0x80]);assert.equal(splitUnits(valid).length,1);assert.throws(()=>splitUnits(valid.subarray(6)));assert.throws(()=>splitUnits(Uint8Array.from([0,0,0,1,9,0xf0,0,0,0,1,0x41,0x80])));
});
test('late cleanup cannot replace a newer pod ownership journal',async t=>{
 const root=await fixture(t);await mkdir(path.join(root,'runs/new'));
 const common={image:IMAGE,token:'fixture',expiresAt:9999999999999,hourlyRate:0};
 await saveOwner(root,{...common,id:'new',name:'snyggare-maudlab-new',createdAt:2,directory:'runs/new'});
 await saveOwner(root,{...common,id:'old',name:'snyggare-maudlab-old',createdAt:1,directory:'runs/bank',terminatedAt:new Date().toISOString()});
 assert.equal((await readOwner(root))?.id,'new');
});
test('opening the lab does not start GPU; writes require local session token',async t=>{
 const root=await fixture(t),lab=createLabServer(root);lab.server.listen(0,'127.0.0.1');await once(lab.server,'listening');
 t.after(()=>{lab.server.closeAllConnections();lab.server.close();});const address=lab.server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
 const status=await fetch(base+'/api/maud/status').then(r=>r.json());assert.equal(status.gpu.phase,'off');assert.equal(status.gpu.podId,null);assert.ok(status.csrf);assert.equal(status.keys.openai,true);assert.ok(!JSON.stringify(status).includes('fixture-not-a-key'));
 assert.equal((await fetch(base+'/api/maud/gpu/start',{method:'POST',body:'{}'})).status,403);
 const rejected=await fetch(base+'/api/maud/speak',{method:'POST',headers:{'X-Maud-Csrf':status.csrf,'Content-Type':'application/json'},body:'{"text":"Hej"}'});assert.equal(rejected.status,400);assert.match(await rejected.text(),/Starta GPU/);
 assert.equal((await fetch(base+'/api/maud/status',{headers:{Origin:'https://elsewhere.example'}})).status,403);
});
