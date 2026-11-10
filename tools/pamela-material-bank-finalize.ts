/** Recover final metadata after a container-clock failure; preserve all14 rendered clips.
 * A complete caller-selected manifest binds every review, source and mask. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {openFrozenMaterialTrack,checkedMaterialBytes,materialHash as hash,MATERIAL_WIDTH as W,MATERIAL_HEIGHT as H,type FrozenMaterialSelection,type FrozenRef} from '../src/pamela-frozen-material-track.ts';
import {keyPamelaFrameWithPaper} from '../src/pamela-key-paper.ts';
const execute=promisify(execFile),arg=(key:string)=>process.argv.find(a=>a.startsWith(key+'='))?.slice(key.length+1),file=arg('--plan'),expected=arg('--plan-sha256');
if(!file||!expected)throw Error('Explicit --plan and --plan-sha256 required');
const planBytes=await checkedMaterialBytes({path:file,sha256:expected}),plan=JSON.parse(planBytes.toString()),run=plan.run;
assert.match(run,/^runs\/20261109-pamela-material-bank\/take-\d\d$/);
assert.equal(plan.width,W);assert.equal(plan.height,H);assert.equal(plan.fps,30);
assert.deepEqual(plan.selections.map((s:FrozenMaterialSelection)=>s.id),[1,2].flatMap(pass=>[1,2,3,4,5,6,7].map(seat=>`C${pass}-P${seat}`)));
assert.equal(plan.presentationOnly,true);assert.equal(plan.productionAccepted,false);
sharp.concurrency(1);
const firstPlan=JSON.parse((await checkedMaterialBytes(plan.firstPlan)).toString()),secondPlan=JSON.parse((await checkedMaterialBytes(plan.secondPlan)).toString()),surfaces=JSON.parse((await checkedMaterialBytes(plan.surfaces)).toString()),trim=JSON.parse((await checkedMaterialBytes(plan.trim)).toString());
assert.equal(trim.outputFrames,4404);assert.equal(trim.intervals.length,14);
const textures=new Map(surfaces.results.flatMap((s:any)=>s.layers.map((l:any,i:number)=>[`C${i+1}-P${s.seat}`,l.material])));
const selected:FrozenMaterialSelection[]=plan.selections;
const tracks=await Promise.all(selected.map(s=>openFrozenMaterialTrack(s,textures.get(s.id) as FrozenRef)));
for(const track of tracks){const sourceJob=(track.selection.id.startsWith('C1')?firstPlan:secondPlan).jobs.find((j:any)=>j.seat===Number(track.selection.id.at(-1)));assert.equal(track.source.sha256,sourceJob.sourceSha256);}
const registry=JSON.parse((await checkedMaterialBytes(plan.registry)).toString()),selectedLimitations=registry.entries.filter((e:any)=>e.limitation).map((e:any)=>({id:e.id,limitation:e.limitation,finalAcceptanceBlocked:e.finalAcceptanceBlocked}));
const codeFiles=['tools/pamela-material-bank.ts','src/pamela-frozen-material-track.ts','src/pamela-paper-material.ts','src/pamela-edge-card-track.ts','src/pamela-key-paper.ts','src/pamela-key.ts'];
const code=await Promise.all(codeFiles.map(async sourcePath=>{const path=run+'/snapshot/'+sourcePath.replaceAll('/','__'),sha256=hash(await readFile(path));assert.equal(hash(await readFile(sourcePath)),sha256,'Restore frozen code before recovery: '+sourcePath);return{path,sha256,sourcePath};}));
const repair=run+'/finalize-01';await mkdir(repair);await mkdir(repair+'/render');const finalizerPath=repair+'/finalizer-source.ts';await writeFile(finalizerPath,await readFile('tools/pamela-material-bank-finalize.ts'),{flag:'wx'});const finalizer={path:finalizerPath,sha256:hash(await readFile(finalizerPath))};
assert.equal(hash(await readFile(run+'/plan.json')),expected);
function over(base:Buffer,rgba:Buffer){for(let p=0;p<W*H;p++){const a=rgba[p*4+3]/255;if(!a)continue;for(let c=0;c<3;c++)base[p*3+c]=Math.round(base[p*3+c]*(1-a)+rgba[p*4+c]*a);}return base;}
const scene=firstPlan.jobs[0].scene;for(const asset of scene)await checkedMaterialBytes(asset);
const room=await sharp(scene[0].path).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer(),empty=await sharp(room).composite([{input:await readFile(scene[1].path)}]).removeAlpha().raw().toBuffer();
const landed=new Map<string,{rgba:Buffer;ref:FrozenRef}>();
for(const track of tracks){
 const id=track.selection.id,seat=Number(id.at(-1)),blank=(id.startsWith('C1')?firstPlan:secondPlan).jobs.find((j:any)=>j.seat===seat).landed.layer,rgba=await sharp(await checkedMaterialBytes(blank)).ensureAlpha().raw().toBuffer(),f=await track.frame(350);
 // Keep the old despilled antialiased perimeter. Only the independently
 // observed paper can replace it or restore an erroneously keyed paper core.
 const keyed=keyPamelaFrameWithPaper(f.printed,W,H,f.paper,f.original);
 for(let p=0;p<W*H;p++)if(f.paper[p]){rgba[p*4+3]=Math.round(keyed.alpha[p]*255);for(let c=0;c<3;c++)rgba[p*4+c]=keyed.rgb[p*3+c];}
 const path=`${run}/layers/${id}.png`,bytes=await readFile(path),existing=await sharp(bytes).ensureAlpha().raw().toBuffer();assert.deepEqual(existing,rgba,'Frozen landed layer changed');landed.set(id,{rgba,ref:{path,sha256:hash(bytes)}});
}
function encoder(path:string){const child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);child.stdin.on('error',()=>{});const done=once(child,'close');return{async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async finish(){child.stdin.end();const[exit]=await done;assert.equal(exit,0,errors);},abort(){child.stdin.destroy();if(child.exitCode===null)child.kill();}};}
async function inspect(path:string,frames:number){const probe=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{windowsHide:true})).stdout);assert.equal(+probe.streams[0].nb_read_frames,frames);assert.equal(probe.streams[0].avg_frame_rate,'30/1');assert.equal(probe.streams[0].width,W);assert.equal(probe.streams[0].height,H);return{path,sha256:hash(await readFile(path)),probe};}
const parts:any[]=[];for(const track of tracks){const path=run+'/'+track.selection.id+'.json',p=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(p.selection,track.selection);assert.equal(p.source.sha256,track.source.sha256);assert.equal(p.records.length,360);assert.ok(p.records.every((r:any,i:number)=>r.frame===i&&r.sourceRgbEqual&&r.changedOutsidePaperPixels===0&&r.changedPriorCorePixels===0));assert.equal((await inspect(p.output.path,360)).sha256,p.output.sha256);parts.push(p);}
const filled=Buffer.from(empty);for(const seat of[1,2,3,4,5,6,7])over(filled,landed.get(`C2-P${seat}`)!.rgba);
const outerPlan=JSON.parse((await checkedMaterialBytes(plan.outerPlan)).toString()),sourceGate=JSON.parse((await checkedMaterialBytes(plan.outerSourceGate)).toString()),outer=[];
for(const segment of outerPlan.order.filter((s:any)=>s.source!=='frozen-bank')){
 const source=outerPlan.sources.find((s:any)=>s.name===segment.source);await checkedMaterialBytes(source);const movie=`${repair}/render/${segment.id}.mp4`,enc=encoder(movie),stage=segment.cards===14?filled:empty,records=[];
 try{for(let f=segment.start;f<segment.end;f++){const path=`runs/20261109-pamela-fourteen-full-loop/take-01/source/${segment.source}/frame-${String(f).padStart(4,'0')}.png`,b=await readFile(path),raw=await sharp(b).removeAlpha().raw().toBuffer(),witness=sourceGate.records.find((r:any)=>r.source===segment.source&&r.sourceFrame===f);assert.ok(witness);assert.equal(hash(b),witness.sourcePngSha256);assert.equal(hash(raw),witness.rawRgbSha256);const keyed=keyPamelaFrameWithPaper(raw,W,H,Buffer.alloc(W*H)),out=Buffer.allocUnsafe(raw.length);let changedCards=0;for(let p=0;p<W*H;p++){const a=keyed.alpha[p];for(let c=0;c<3;c++){out[p*3+c]=Math.round(stage[p*3+c]*(1-a)+keyed.rgb[p*3+c]*a);if(segment.cards===14&&stage[p*3+c]!==empty[p*3+c]&&out[p*3+c]!==stage[p*3+c])changedCards++;}}assert.equal(changedCards,0,'Outer source obscures retained cards');await enc.write(out);records.push({sourceFrame:f,sourcePngSha256:hash(b),outputRgbSha256:hash(out),changedRetainedCardPixels:changedCards});}await enc.finish();}catch(error){enc.abort();throw error;}
 const replay=await inspect(movie,segment.frames),original=await inspect(`${run}/render/${segment.id}.mp4`,segment.frames);assert.equal(replay.sha256,original.sha256,'Outer replay must be byte-identical to the original render');outer.push({id:segment.id,output:original,replay,records});console.log(JSON.stringify({outerReplayVerified:segment.id}));
}
const full=await inspect(run+'/render/vila-fourteen-materials-vila.mp4',5486),compact=await inspect(run+'/render/vila-fourteen-materials-trim-exact.mp4',4404);
assert.equal(+compact.probe.format.duration,146.8);
const clockRepairPath=run+'/clock-repair/verification.json',clockRepair=JSON.parse(await readFile(clockRepairPath,'utf8'));assert.equal(clockRepair.decodedFramesEqual,4404);assert.equal(clockRepair.corrected.sha256,compact.sha256);assert.equal(clockRepair.correctedPtsExact,true);
for(const c of code)await checkedMaterialBytes(c);await checkedMaterialBytes({path:file,sha256:expected});
await writeFile(run+'/evidence.json',JSON.stringify({status:'full-material-integration-awaiting-native-review',plan:{path:file,sha256:expected},code,finalizer,clockRepair:{path:clockRepairPath,sha256:hash(await readFile(clockRepairPath))},recovery:{reason:'Original compact concatenation accumulated a 45-tick (2.93 ms) container clock drift; exact segment durations repair timestamps without altering video packets or decoded frames. Original compact retained.',unchangedSceneClips:14,byteIdenticalOuterReplays:4},full,compact,parts:await Promise.all(parts.map(async p=>({id:p.id,path:`${run}/${p.id}.json`,sha256:hash(await readFile(`${run}/${p.id}.json`)),output:p.output}))),outer,landed:[...landed].map(([id,l])=>({id,...l.ref})),verification:{sourceRgbEqualFrames:5040,printedOutsidePaperChanges:0,priorCardCoreChanges:0,distinctMaterials:14,fullFrames:5486,trimmedFrames:4404},selectedLimitations,limitations:['Authored front diagnostics; physical front/back flip remains UNKNOWN','Preliminary dealer matte and hard source pose seams remain','The compact display is re-encoded after whole-frame trimming','Candidate selection and numeric pixel checks are not continuous perceptual or runtime acceptance'],productionAccepted:false,newApiJobs:0},null,2),{flag:'wx'});
console.log(JSON.stringify({run,full,compact}));
