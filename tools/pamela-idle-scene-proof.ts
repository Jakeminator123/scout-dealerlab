import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {projectDealerPixel,type StageProjection} from '../src/pamela-stage-projection.ts';
import {PAMELA_IDLE_SOURCE as S,PAMELA_IDLE_WINDOWS as WINDOWS,PAMELA_IDLE_SOURCE_REGIONS as REGIONS,pamelaIdleStageProjection,projectPamelaIdlePixel,idleSourceToCanonicalPixel,padCanonicalForIdle,pamelaIdleSourceFrame} from '../src/pamela-idle-source-projection.ts';

sharp.concurrency(1);
const suffix=process.argv.find(a=>a.startsWith('--suffix='))?.slice(9)??'take-01';if(!/^[a-z0-9-]+$/.test(suffix))throw Error('Invalid run suffix');
const run=`runs/20261109-pamela-idle-scene-proof/${suffix}`,W=1764,H=1174,CW=1762;
await mkdir(run,{recursive:true});for(const d of ['layers','render','qa'])await mkdir(`${run}/${d}`);
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
type Ref={path:string;sha256:string};
async function checked(ref:Ref){const b=await readFile(ref.path);assert.equal(hash(b),ref.sha256,`Changed source: ${ref.path}`);return b;}
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const windowRegistry=JSON.parse(await readFile('references/pamela-idle-window-review.json','utf8'));
const idleEvidence=JSON.parse((await checked(windowRegistry.evidence)).toString());await checked({path:S.path,sha256:S.sha256});
const bankRegistry=JSON.parse(await readFile('references/pamela-material-bank.json','utf8'));
const bank=JSON.parse((await checked(bankRegistry.evidence)).toString()),plan=JSON.parse((await checked(bank.plan)).toString());assert.equal(bank.verification.distinctMaterials,14);
const firstPlan=JSON.parse((await checked(plan.firstPlan)).toString()),sceneRefs:Ref[]=firstPlan.jobs[0].scene;for(const asset of sceneRefs)await checked(asset);
const room=await sharp(sceneRefs[0].path).resize(CW,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const canonicalEmpty=await sharp(room).composite([{input:await readFile(sceneRefs[1].path)}]).removeAlpha().raw().toBuffer();
const empty=Buffer.from(padCanonicalForIdle(canonicalEmpty,3)),filled=Buffer.from(empty),combined=Buffer.alloc(CW*H*4),owner=new Uint8Array(CW*H),pairRecords=[];
for(let seat=1;seat<=7;seat++){
  const id=`C2-P${seat}`,selection=plan.selections.find((s:{id:string})=>s.id===id),track=JSON.parse((await checked(selection.evidence)).toString()),entry=track.frames[350];
  assert.equal(entry.frame,350);const layerRef=bank.landed.find((l:{id:string})=>l.id===id),layer=await sharp(await checked(layerRef)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(layer.info.width,CW);assert.equal(layer.info.height,H);
  const mask=await sharp(await checked(entry.mask)).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(mask.info.channels,3);assert.equal(mask.info.width,CW);assert.equal(mask.info.height,H);
  const printed=await sharp(await checked(entry.output)).removeAlpha().raw().toBuffer();assert.equal(printed.length,CW*H*3);
  const clean=Buffer.from(layer.data);let removedOutsidePaper=0,removedGuard=0,missingPaper=0,nonzero=0;const visiblePerCard=[0,0];
  for(let p=0;p<CW*H;p++){
    const m=p*3,a=p*4+3,paper=Math.max(mask.data[m],mask.data[m+1]),guard=mask.data[m+2];
    if(mask.data[m])visiblePerCard[0]++;if(mask.data[m+1])visiblePerCard[1]++;
    if(clean[a]&&!paper)removedOutsidePaper++;if(clean[a]&&guard)removedGuard++;
    if(paper&&!clean[a]&&!guard){missingPaper++;for(let c=0;c<3;c++)clean[p*4+c]=printed[p*3+c];clean[a]=paper;}
    clean[a]=guard?0:Math.min(clean[a],paper);
    if(clean[a]){assert.equal(owner[p],0,'Two seat pairs overlap');owner[p]=seat;nonzero++;for(let c=0;c<4;c++)combined[p*4+c]=clean[p*4+c];}
  }
  assert.ok(visiblePerCard.every(n=>n>1000),'Both retained cards must remain visible');
  const path=`${run}/layers/retained-pair-P${seat}-paper-only.png`;await sharp(clean,{raw:{width:CW,height:H,channels:4}}).png().toFile(path);
  pairRecords.push({seat,cards:2,source:layerRef,track:selection.evidence,mask:entry.mask,sourceFrame:350,output:await ref(path),visiblePerCard,nonzero,removedOutsidePaper,removedGuard,restoredMissingPaperPixels:missingPaper,restorationSource:entry.output,alphaOutsidePaperAfter:0,alphaOnGuardAfter:0});
}
const canonicalCards=`${run}/layers/retained-14-canonical.png`,nativeCards=`${run}/layers/retained-14-native1764.png`;
await sharp(combined,{raw:{width:CW,height:H,channels:4}}).png().toFile(canonicalCards);
const padded=Buffer.from(padCanonicalForIdle(combined,4));await sharp(padded,{raw:{width:W,height:H,channels:4}}).png().toFile(nativeCards);
const cardPixels:number[]=[];for(let p=0;p<W*H;p++){const a=padded[p*4+3]/255;if(a){cardPixels.push(p);for(let c=0;c<3;c++)filled[p*3+c]=Math.round(filled[p*3+c]*(1-a)+padded[p*4+c]*a);}}
await sharp(filled,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/retained-14-on-table.png`);
// Every canonical layer byte remains at x+1. No source-video column is removed.
for(let y=0;y<H;y++)assert.deepEqual(padded.subarray((y*W+1)*4,(y*W+1763)*4),combined.subarray(y*CW*4,(y+1)*CW*4));
const contract=JSON.parse(await readFile('references/pamela-stage-contract.json','utf8'));
const canonical:StageProjection={width:contract.dealerPlacement.width,sourceWidth:CW,sourceHeight:H,contactSourceY:876,depth:contract.dealerPlacement.depth,tableHeight:contract.table.feltHeight+.004,camera:contract.camera.position,cameraTarget:contract.camera.target};
const adapted=pamelaIdleStageProjection(canonical,S.sha256),anchors=[];let maxWorldAdapterError=0;
assert.equal(adapted.width/adapted.sourceWidth,canonical.width/CW);
for(let x=0;x<=W;x++)for(const y of [0,876,H]){const [cx,cy]=idleSourceToCanonicalPixel(x,y),a=projectDealerPixel(cx,cy,canonical),b=projectPamelaIdlePixel(x,y,canonical,S.sha256),error=Math.hypot(...a.map((n,i)=>n-b[i]));maxWorldAdapterError=Math.max(maxWorldAdapterError,error);}
for(const [name,r] of Object.entries(REGIONS)){const native:[number,number]=[r.left+r.width/2,r.top+r.height/2],point=projectPamelaIdlePixel(...native,canonical,S.sha256);anchors.push({name,native,canonical:idleSourceToCanonicalPixel(...native),world:point,anatomicalAlignmentToOtherSources:'not-inferred'});}
assert.ok(maxWorldAdapterError<1e-12);assert.throws(()=>pamelaIdleStageProjection(canonical,'wrong-source'));
const mediaProbe=(path:string)=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{encoding:'utf8',windowsHide:true}));
async function* decode(path:string,filter?:string){
  const child=spawn('ffmpeg',['-v','error','-nostdin','-threads','1','-i',path,...(filter?['-vf',filter]:[]),'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);const done=once(child,'close');let target=Buffer.allocUnsafe(W*H*3),used=0;
  try{for await(const chunk of child.stdout){const bytes=chunk as Buffer;let offset=0;while(offset<bytes.length){const length=Math.min(target.length-used,bytes.length-offset);bytes.copy(target,used,offset,offset+length);used+=length;offset+=length;if(used===target.length){yield target;target=Buffer.allocUnsafe(W*H*3);used=0;}}}const [code]=await done;assert.equal(code,0,errors);assert.equal(used,0);}finally{if(child.exitCode===null){child.stdout.destroy();child.kill();}}
}
function encoder(path:string){
  const child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r','30','-i','pipe:0','-an','-c:v','ffv1','-level','3','-pix_fmt','bgr0','-threads','1',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.stdin.on('error',()=>{});const done=once(child,'close');return {async write(frame:Buffer){if(!child.stdin.write(frame))await once(child.stdin,'drain');},async finish(){child.stdin.end();const [code]=await done;assert.equal(code,0,errors);},abort(){child.stdin.destroy();if(child.exitCode===null)child.kill();}};
}
const jobs=WINDOWS.map(w=>({...w,single:`${run}/render/${w.id}-single-composed-lossless.mkv`,encoder:encoder(`${run}/render/${w.id}-single-composed-lossless.mkv`),records:[] as {sourceFrame:number;sourceRgbSha256:string;composedRgbSha256:string;actorPixelsOverRetainedCards:number}[]}));
const sourceHashes=new Map<number,string>(),nativeFrames=new Map<string,Buffer>();let sourceFrame=252;
try{
  for await(const raw of decode(S.path,'trim=start_frame=252:end_frame=327,setpts=PTS-STARTPTS')){
    const rawSha=hash(raw);sourceHashes.set(sourceFrame,rawSha);const key=keyPamelaFrame(raw,W,H),out=Buffer.allocUnsafe(raw.length);let actorOnCards=0;
    for(const p of cardPixels)if(key.alpha[p]>0)actorOnCards++;assert.equal(actorOnCards,0,'Idle actor overlaps retained paper; do not erase the actor to hide this');
    for(let p=0;p<W*H;p++){const a=key.alpha[p];for(let c=0;c<3;c++)out[p*3+c]=Math.round(filled[p*3+c]*(1-a)+key.rgb[p*3+c]*a);}
    for(const job of jobs)if(sourceFrame>=job.start&&sourceFrame<job.endExclusive){
      await job.encoder.write(out);job.records.push({sourceFrame,sourceRgbSha256:rawSha,composedRgbSha256:hash(out),actorPixelsOverRetainedCards:actorOnCards});
      if(sourceFrame<job.start+3||sourceFrame>=job.endExclusive-3){const file=`${run}/qa/${job.id}-source-${sourceFrame}.png`;await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(file);nativeFrames.set(`${job.id}-${sourceFrame}`,Buffer.from(out));}
    }
    if(sourceFrame%10===0)console.log(JSON.stringify({sourceFrame,uniqueFramesRendered:sourceFrame-251}));sourceFrame++;
  }
  assert.equal(sourceFrame,327);await Promise.all(jobs.map(j=>j.encoder.finish()));
}catch(error){jobs.forEach(j=>j.encoder.abort());throw error;}
const outputs=[];
for(const job of jobs){
  assert.equal(job.records.length,job.frames);const bound=idleEvidence.outputs.find((o:{id:string})=>o.id===job.id);await checked(bound.single.master);
  let identityCount=0;for await(const raw of decode(bound.single.master.path)){assert.equal(hash(raw),sourceHashes.get(job.start+identityCount),'Raw window differs from original source pixels');identityCount++;}assert.equal(identityCount,job.frames);
  const master=`${run}/render/${job.id}-three-turns-composed-lossless.mkv`,preview=`${run}/render/${job.id}-three-turns-composed.mp4`;
  execFileSync('ffmpeg',['-v','error','-nostdin','-n','-stream_loop','3','-i',job.single,'-frames:v',String(job.threeCyclesWithClosure),'-an','-c:v','ffv1','-level','3','-pix_fmt','bgr0','-threads','1',master],{windowsHide:true});
  let verified=0;for await(const raw of decode(master)){assert.equal(hash(raw),job.records[verified%job.frames].composedRgbSha256,'Loop export altered a composed frame');verified++;}assert.equal(verified,job.threeCyclesWithClosure);
  execFileSync('ffmpeg',['-v','error','-nostdin','-n','-i',master,'-an','-c:v','libx264','-preset','fast','-crf','14','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart',preview],{windowsHide:true});
  const probe=mediaProbe(preview);assert.equal(+probe.streams[0].width,W);assert.equal(+probe.streams[0].height,H);assert.equal(probe.streams[0].avg_frame_rate,'30/1');assert.equal(+probe.streams[0].nb_read_frames,verified);
  const seamFrames=[job.endExclusive-3,job.endExclusive-2,job.endExclusive-1,job.start,job.start+1,job.start+2],strips=[];
  for(const [name,r] of Object.entries(REGIONS)){
    const tiles=[];for(const f of seamFrames)tiles.push(await sharp(nativeFrames.get(`${job.id}-${f}`)!,{raw:{width:W,height:H,channels:3}}).extract(r).png().toBuffer());
    const strip=await sharp({create:{width:r.width*6,height:r.height,channels:3,background:'#171c1c'}}).composite(tiles.map((input,i)=>({input,left:i*r.width,top:0}))).png().toBuffer(),path=`${run}/qa/${job.id}-${name}-seam.png`;await writeFile(path,strip);strips.push({...await ref(path),frames:seamFrames,nativePixels:true});
  }
  const mapping=Array.from({length:verified},(_,outputFrame)=>({outputFrame,sourceFrame:pamelaIdleSourceFrame(job.id,outputFrame)}));
  outputs.push({id:job.id,decision:'PENDING_LOCAL_SCENE_VISUAL_REVIEW',window:{start:job.start,endExclusive:job.endExclusive,frames:job.frames,blinks:job.blinks},rawWindow:bound.single,sceneSingle:await ref(job.single),sceneThreeTurns:{master:await ref(master),preview:await ref(preview),probe},nativeSourceIdentityFrames:identityCount,composedPixelIdentityFrames:verified,visibleWrapOutputFrames:[job.frames,job.frames*2,job.frames*3],extraClosureFrames:1,frameMap:mapping,seamStrips:strips,records:job.records,aConnectionAccepted:false,runtimeAccepted:false});
  console.log(JSON.stringify({finished:job.id,frames:verified,width:W}));
}
const evidence={status:'NATIVE_B_TO_B_SCENE_PROOFS_READY_FOR_VISUAL_REVIEW',createdAt:new Date().toISOString(),node:process.version,source:S,windowEvidence:windowRegistry.evidence,frozenBank:bankRegistry.evidence,bankPlan:bank.plan,sceneRefs,adapter:await ref('src/pamela-idle-source-projection.ts'),renderer:await ref('tools/pamela-idle-scene-proof.ts'),key:await ref('src/pamela-key.ts'),projection:{canonical,adapted,maxWorldAdapterError,sourceColumns:1764,omittedColumns:0,sourcePixelScaleChanged:false,sourceAspect:1764/1174,canonicalPixelOffset:[-1,0],anchors},retained:{cards:14,pairs:7,canonical:await ref(canonicalCards),native:await ref(nativeCards),pairsEvidence:pairRecords,actorOverlapPixelsAllFrames:0,ghostPolicy:'Only R/G paper coverage survives; B hand/shoe guard and all nonpaper alpha are removed. Anatomical correctness remains limited by frozen masks.',discardedOutsidePaperShadow:'Removed with nonpaper alpha; no synthetic hand or card shadows added.'},outputs,maximumConcurrentMediaProcesses:3,sourceMediaChanged:false,apiCalls:0,productionAccepted:false,aConnectionAccepted:false,limitations:['Native flat scene compositor, not a new WebGL viewpoint or a recovered physical scene.','The symmetric one-pixel adapter is an explicit authored alignment, not measured camera registration.','Full1764 source pixels and source fps retained; only background/card layers are padded.','B-to-B windows only. A-to-B, B-to-A and REDO connections remain unaccepted.','Original12second rejection and job02 gate remain unchanged.','Frozen materialbank candidate limitations and the preliminary green matte still apply.','H264 previews are lossy; original-pixel/source and composed-pixel checks use lossless masters.']};
await writeFile(`${run}/evidence.json`,JSON.stringify(evidence,null,2),{flag:'wx'});console.log(JSON.stringify({evidence:`${run}/evidence.json`,cards:14,outputs:outputs.map(o=>({id:o.id,frames:o.composedPixelIdentityFrames})),maxWorldAdapterError}));
