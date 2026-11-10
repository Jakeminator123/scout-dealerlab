/** Reproducible presentation assembly; no RNG, game-state or provider calls.
 * A complete caller-selected manifest binds every review, source and mask. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {checkedMaterialBytes,materialHash as hash,MATERIAL_WIDTH as W,MATERIAL_HEIGHT as H,type FrozenMaterialSelection,type FrozenRef} from '../src/pamela-frozen-material-track.ts';
import {openBankCardSurfaces,type BankSurfaceSelection,type BankMaterials,type BankEngineSignal} from '../src/pamela-bank-card-surfaces.ts';
import {keyPamelaFrameWithPaper} from '../src/pamela-key-paper.ts';
const execute=promisify(execFile),arg=(key:string)=>process.argv.find(a=>a.startsWith(key+'='))?.slice(key.length+1),file=arg('--plan'),expected=arg('--plan-sha256');
if(!file||!expected)throw Error('Explicit --plan and --plan-sha256 required');
const planBytes=await checkedMaterialBytes({path:file,sha256:expected}),plan=JSON.parse(planBytes.toString()),run=plan.run;
assert.match(run,/^runs\/20261110-pamela-two-sided-bank\/take-\d\d$/);
assert.equal(plan.width,W);assert.equal(plan.height,H);assert.equal(plan.fps,30);
assert.deepEqual(plan.selections.map((s:FrozenMaterialSelection)=>s.id),[1,2].flatMap(pass=>[1,2,3,4,5,6,7].map(seat=>`C${pass}-P${seat}`)));
assert.equal(plan.presentationOnly,true);assert.equal(plan.productionAccepted,false);
sharp.concurrency(1);
const firstPlan=JSON.parse((await checkedMaterialBytes(plan.firstPlan)).toString()),secondPlan=JSON.parse((await checkedMaterialBytes(plan.secondPlan)).toString()),surfaces=JSON.parse((await checkedMaterialBytes(plan.surfaces)).toString()),trim=JSON.parse((await checkedMaterialBytes(plan.trim)).toString());
assert.equal(trim.outputFrames,4404);assert.equal(trim.intervals.length,14);
const selected:BankSurfaceSelection[]=plan.selections,design=plan.designs.find((d:any)=>d.id===plan.renderDesign);assert.ok(design);
assert.equal(plan.engineFixture.kind,'explicit-demonstration-only');assert.equal(plan.engineFixture.realGameValues,false);
const signals=new Map<string,BankEngineSignal>(plan.engineFixture.signals.map((s:any)=>[s.slotId,{cardId:s.cardId,frontAllowed:s.frontAllowed}]));assert.equal(signals.size,14);
async function texture(ref:FrozenRef){const {data,info}=await sharp(await checkedMaterialBytes(ref)).removeAlpha().raw().toBuffer({resolveWithObject:true});return{rgb:data,width:info.width,height:info.height,id:ref.sha256};}
const materials:BankMaterials={back:await texture(plan.artwork.back[design.back]),front:new Map(await Promise.all(Object.entries(plan.artwork.front[design.front] as Record<string,FrozenRef>).map(async([id,ref])=>[id,await texture(ref)] as const)))};
const nativeTracks=await Promise.all(selected.map(s=>openBankCardSurfaces(s))),tracks=nativeTracks.map(t=>({selection:t.selection,source:t.source,frame:(f:number)=>t.frame(f,materials,signals)}));
for(const track of tracks){const sourceJob=(track.selection.id.startsWith('C1')?firstPlan:secondPlan).jobs.find((j:any)=>j.seat===Number(track.selection.id.at(-1)));assert.equal(track.source.sha256,sourceJob.sourceSha256);}
const registry=JSON.parse((await checkedMaterialBytes(plan.registry)).toString()),selectedLimitations=registry.entries.filter((e:any)=>e.limitation).map((e:any)=>({id:e.id,limitation:e.limitation,finalAcceptanceBlocked:e.finalAcceptanceBlocked}));
const code:FrozenRef[]=plan.code;for(const c of code)await checkedMaterialBytes(c);
for(const d of ['render','layers','qa'])await mkdir(run+'/'+d);
function over(base:Buffer,rgba:Buffer){for(let p=0;p<W*H;p++){const a=rgba[p*4+3]/255;if(!a)continue;for(let c=0;c<3;c++)base[p*3+c]=Math.round(base[p*3+c]*(1-a)+rgba[p*4+c]*a);}return base;}
const scene=plan.scene;assert.deepEqual(scene,firstPlan.jobs[0].scene);for(const asset of scene)await checkedMaterialBytes(asset);
const room=await sharp(scene[0].path).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer(),empty=await sharp(room).composite([{input:await readFile(scene[1].path)}]).removeAlpha().raw().toBuffer();
const landed=new Map<string,{rgba:Buffer;ref:FrozenRef}>();
for(const track of tracks){
 const id=track.selection.id,seat=Number(id.at(-1)),blank=(id.startsWith('C1')?firstPlan:secondPlan).jobs.find((j:any)=>j.seat===seat).landed.layer,rgba=await sharp(await checkedMaterialBytes(blank)).ensureAlpha().raw().toBuffer(),f=await track.frame(350);
 // Keep the old despilled antialiased perimeter. Only the independently
 // observed paper can replace it or restore an erroneously keyed paper core.
 const keyed=keyPamelaFrameWithPaper(f.printed,W,H,f.paper,f.original);
 for(let p=0;p<W*H;p++)if(f.paper[p]){rgba[p*4+3]=Math.round(keyed.alpha[p]*255);for(let c=0;c<3;c++)rgba[p*4+c]=keyed.rgb[p*3+c];}
 const path=`${run}/layers/${id}.png`;await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toFile(path);landed.set(id,{rgba,ref:{path,sha256:hash(await readFile(path))}});
}
function encoder(path:string){const child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.stdin.on('error',()=>{});const done=once(child,'close');return{async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async finish(){child.stdin.end();const[exit]=await done;assert.equal(exit,0,errors);},abort(){child.stdin.destroy();if(child.exitCode===null)child.kill();}};}
async function inspect(path:string,frames:number){const probe=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{windowsHide:true})).stdout);assert.equal(+probe.streams[0].nb_read_frames,frames);assert.equal(probe.streams[0].avg_frame_rate,'30/1');assert.equal(probe.streams[0].width,W);assert.equal(probe.streams[0].height,H);return{path,sha256:hash(await readFile(path)),probe};}
const jobs=tracks.map(track=>{const id=track.selection.id,pass=Number(id[1]),seat=Number(id.at(-1)),priorIds=pass===1?[1,2,3,4,5,6,7].filter(s=>s<seat).map(s=>`C1-P${s}`):[1,2,3,4,5,6,7].filter(s=>s!==seat).map(s=>`C${s<seat?2:1}-P${s}`);assert.ok(!priorIds.some(s=>s.endsWith(`P${seat}`)));return{track,id,priorIds};});
let next=0,failed=false;const parts:any[]=[];
const workers=await Promise.allSettled(Array.from({length:2},async()=>{for(;;){if(failed)return;const index=next++;if(index>=jobs.length)return;const job=jobs[index],stage=Buffer.from(empty),priorCore=new Uint8Array(W*H);for(const id of job.priorIds){const l=landed.get(id)!;over(stage,l.rgba);for(let p=0;p<W*H;p++)if(l.rgba[p*4+3]===255)priorCore[p]=1;}
 const sourceMd5=(await execute('ffmpeg',['-v','error','-nostdin','-threads','1','-i',job.track.source.path,'-pix_fmt','rgb24','-threads','1','-f','framemd5','-'],{windowsHide:true,maxBuffer:200000})).stdout.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1)!.trim());assert.equal(sourceMd5.length,360);
 const movie=`${run}/render/${job.id}.mp4`,enc=encoder(movie),records=[];
 try{for(let f=0;f<360;f++){
  const data=await job.track.frame(f);assert.equal(createHash('md5').update(data.original).digest('hex'),sourceMd5[f]);
  const keyed=keyPamelaFrameWithPaper(data.printed,W,H,data.paper,data.original),out=Buffer.allocUnsafe(W*H*3);let changedPrior=0;
  for(let p=0;p<W*H;p++){const a=keyed.alpha[p];for(let c=0;c<3;c++){const j=p*3+c;out[j]=Math.round(stage[j]*(1-a)+keyed.rgb[j]*a);if(priorCore[p]&&out[j]!==stage[j])changedPrior++;}}
  assert.equal(changedPrior,0,`${job.id} overwrites a prior card`);await enc.write(out);
  let proof:FrozenRef|null=null;if([0,60,90,100,150,180,210,270,350,359,...job.track.selection.sidePolicy.segments.flatMap(s=>[s.start-1,s.start,s.start+1,s.end-1])].includes(f)){const path=`${run}/qa/${job.id}-${String(f).padStart(4,'0')}.png`;await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(path);proof={path,sha256:hash(await readFile(path))};}
  records.push({frame:f,states:data.states,...data.verification,sourceRgbEqual:true,changedPriorCorePixels:changedPrior,restoredOpaquePixels:keyed.verification.restoredOpaquePixels,preservedMixedEdgePixels:keyed.verification.preservedMixedEdgePixels,outputRgbSha256:hash(out),proof});if(f%120===119)console.log(JSON.stringify({id:job.id,frames:f+1,total:360}));
 }await enc.finish();const part={id:job.id,selection:job.track.selection,source:job.track.source,prior:job.priorIds.map(id=>({id,...landed.get(id)!.ref})),output:await inspect(movie,360),records};await writeFile(`${run}/${job.id}.json`,JSON.stringify(part,null,2));parts[index]=part;console.log(JSON.stringify({completed:job.id}));
 }catch(error){failed=true;enc.abort();throw error;}
}}));for(const r of workers)if(r.status==='rejected')throw r.reason;
const filled=Buffer.from(empty);for(const seat of[1,2,3,4,5,6,7])over(filled,landed.get(`C2-P${seat}`)!.rgba);
const outerPlan=JSON.parse((await checkedMaterialBytes(plan.outerPlan)).toString()),sourceGate=JSON.parse((await checkedMaterialBytes(plan.outerSourceGate)).toString()),outer=[];
for(const segment of outerPlan.order.filter((s:any)=>s.source!=='frozen-bank')){
 const source=outerPlan.sources.find((s:any)=>s.name===segment.source);await checkedMaterialBytes(source);const movie=`${run}/render/${segment.id}.mp4`,enc=encoder(movie),stage=segment.cards===14?filled:empty,records=[];
 try{for(let f=segment.start;f<segment.end;f++){const path=`runs/20261109-pamela-fourteen-full-loop/take-01/source/${segment.source}/frame-${String(f).padStart(4,'0')}.png`,b=await readFile(path),raw=await sharp(b).removeAlpha().raw().toBuffer(),witness=sourceGate.records.find((r:any)=>r.source===segment.source&&r.sourceFrame===f);assert.ok(witness);assert.equal(hash(b),witness.sourcePngSha256);assert.equal(hash(raw),witness.rawRgbSha256);const keyed=keyPamelaFrameWithPaper(raw,W,H,Buffer.alloc(W*H)),out=Buffer.allocUnsafe(raw.length);let changedCards=0;for(let p=0;p<W*H;p++){const a=keyed.alpha[p];for(let c=0;c<3;c++){out[p*3+c]=Math.round(stage[p*3+c]*(1-a)+keyed.rgb[p*3+c]*a);if(segment.cards===14&&stage[p*3+c]!==empty[p*3+c]&&out[p*3+c]!==stage[p*3+c])changedCards++;}}assert.equal(changedCards,0,'Outer source obscures retained cards');await enc.write(out);records.push({sourceFrame:f,sourcePngSha256:hash(b),outputRgbSha256:hash(out),changedRetainedCardPixels:changedCards});}await enc.finish();}catch(error){enc.abort();throw error;}
 outer.push({id:segment.id,output:await inspect(movie,segment.frames),records});
}
const ordered=[outer[0].output,outer[1].output,...parts.map(p=>p.output),outer[2].output,outer[3].output];
async function concat(name:string,files:Awaited<ReturnType<typeof inspect>>[],frames:number){
 assert.ok(files.length>0,'Concat requires inspected segments');
 const counts=files.map(f=>{const stream=f.probe.streams[0],count=Number(stream.nb_read_frames);assert.equal(stream.avg_frame_rate,'30/1');assert.ok(Number.isSafeInteger(count)&&count>0,'Concat requires verified whole-frame counts');return count;});
 assert.equal(counts.reduce((sum,count)=>sum+count,0),frames,'Concat segment frame total differs from the requested output');
 // MP4 format durations are rounded; using them accumulates timestamp drift.
 // Keep stream-copy while placing each segment at its exact 30 fps boundary.
 const list=`${run}/render/${name}.ffconcat`,movie=`${run}/render/${name}.mp4`;
 await writeFile(list,'ffconcat version 1.0\n'+files.map((f,i)=>`file '${`${process.cwd().replaceAll('\\','/')}/${f.path}`.replaceAll("'","'\\''")}'\nduration ${(counts[i]/30).toFixed(9)}`).join('\n')+'\n');
 await execute('ffmpeg',['-v','error','-nostdin','-n','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',movie],{windowsHide:true});return inspect(movie,frames);
}
const full=await concat('vila-fourteen-materials-vila',ordered,5486),trimmed=[];
for(const interval of trim.intervals){const part=parts.find(p=>p.id===interval.id);assert.ok(part);const movie=`${run}/render/${interval.id}-trim.mp4`;await execute('ffmpeg',['-v','error','-nostdin','-n','-threads','1','-i',part.output.path,'-vf',`trim=start_frame=${interval.startInclusive}:end_frame=${interval.endExclusive},setpts=PTS-STARTPTS`,'-an','-c:v','libx264','-preset','fast','-crf','14','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',movie],{windowsHide:true});trimmed.push(await inspect(movie,interval.endExclusive-interval.startInclusive));}
const compact=await concat('vila-fourteen-materials-trim',[outer[0].output,outer[1].output,...trimmed,outer[2].output,outer[3].output],4404);
for(const c of code)await checkedMaterialBytes(c);await checkedMaterialBytes({path:file,sha256:expected});
await writeFile(run+'/evidence.json',JSON.stringify({status:'two-sided-fourteen-slot-integration-awaiting-native-review',plan:{path:file,sha256:expected},code,design,engineFixture:plan.engineFixture,full,compact,parts:await Promise.all(parts.map(async p=>({id:p.id,path:`${run}/${p.id}.json`,sha256:hash(await readFile(`${run}/${p.id}.json`)),output:p.output}))),outer,landed:[...landed].map(([id,l])=>({id,...l.ref})),verification:{sourceRgbEqualFrames:5040,printedOutsidePaperChanges:0,priorCardCoreChanges:0,distinctMaterials:14,fullFrames:5486,trimmedFrames:4404},selectedLimitations,limitations:[...plan.limitations,'Full round uses one design; the second design is independently checked in the preflight','Preliminary dealer matte and hard source pose seams remain','Compact display is re-encoded after whole-frame trimming','Numeric checks are not continuous perceptual acceptance'],productionAccepted:false,newApiJobs:0},null,2));
console.log(JSON.stringify({run,full,compact}));
