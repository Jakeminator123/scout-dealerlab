/** Final-seat integration witness: twelve prior cards + independent P7 C1/C2. */
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawn,execFile}from'node:child_process';
import{promisify}from'node:util';
import{once}from'node:events';
import assert from'node:assert/strict';
import sharp from'sharp';
import{keyPamelaFrameWithPaper}from'../src/pamela-key-paper.ts';
const W=1762,H=1174,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),execute=promisify(execFile),expected=process.argv.find(a=>a.startsWith('--track-sha256='))?.slice('--track-sha256='.length);
if(!expected||!/^[a-f0-9]{64}$/.test(expected))throw Error('Explicit frozen --track-sha256 required');
const trackPath='runs/20261109-pamela-c2-motion-track/take-01/seat-7/draft-02/track.json',trackBytes=await readFile(trackPath);assert.equal(hash(trackBytes),expected);const track=JSON.parse(trackBytes.toString());assert.equal(track.seat,7);assert.equal(track.frames.length,360);assert.equal(hash(await readFile(track.source.path)),track.source.sha256);
const surfacesPath='runs/20261109-pamela-c2-card-surfaces/take-01/surfaces.json',surfaceBytes=await readFile(surfacesPath);assert.equal(hash(surfaceBytes),'2a385af1c707539dd85315ee2f02d85a5b44012b51709900442470f608b4e4ff');const surfaces=JSON.parse(surfaceBytes.toString());assert.equal(surfaces.results[6].source.sha256,track.source.sha256);
const planPath='runs/20261109-pamela-c2-bank-sequence/take-01/plan.json',plan=JSON.parse(await readFile(planPath,'utf8')),scene=plan.jobs[0].scene;for(const asset of scene)assert.equal(hash(await readFile(asset.path)),asset.sha256);
sharp.concurrency(1);
const room=await sharp(scene[0].path).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();let stage=await sharp(room).composite([{input:await readFile(scene[1].path)}]).removeAlpha().raw().toBuffer();
const priorCore=new Uint8Array(W*H),staticLayers=[];
for(const seat of surfaces.results.filter((s:any)=>s.seat!==7)){
 const blank=plan.jobs.find((j:any)=>j.seat===seat.seat).landed.layer,bytes=await readFile(blank.path);assert.equal(hash(bytes),blank.sha256);const rgba=await sharp(bytes).ensureAlpha().raw().toBuffer();
 for(let p=0;p<W*H;p++){const a=rgba[p*4+3]/255;if(!a)continue;if(a===1)priorCore[p]=1;for(let c=0;c<3;c++)stage[p*3+c]=Math.round(stage[p*3+c]*(1-a)+rgba[p*4+c]*a);}
 for(const l of seat.layers){const b=await readFile(l.ink.path);assert.equal(hash(b),l.ink.sha256);const ink=await sharp(b).ensureAlpha().raw().toBuffer();for(let p=0;p<W*H;p++){const a=ink[p*4+3]/255;if(!a)continue;assert.ok(rgba[p*4+3]>0);for(let c=0;c<3;c++)stage[p*3+c]=Math.round(stage[p*3+c]*(1-a)+ink[p*4+c]*a);}staticLayers.push({seat:seat.seat,slotId:l.slotId,value:l.diagnosticValue,ink:l.ink,blank});}
}
assert.equal(staticLayers.length,12);
const md5=(await execute('ffmpeg',['-v','error','-nostdin','-threads','1','-i',track.source.path,'-pix_fmt','rgb24','-threads','1','-f','framemd5','-'],{windowsHide:true,maxBuffer:200000})).stdout.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1)!.trim());assert.equal(md5.length,360);
const run='runs/20261109-pamela-textured-c2-scene/take-01';await mkdir('runs/20261109-pamela-textured-c2-scene',{recursive:true});await mkdir(run);for(const dir of['qa','render','snapshot'])await mkdir(run+'/'+dir);
const snapshots=[];for(const file of['tools/pamela-textured-c2-scene.ts','src/pamela-key-paper.ts','src/pamela-key.ts',trackPath,surfacesPath,planPath]){const b=await readFile(file);await writeFile(run+'/snapshot/'+file.replaceAll('/','__'),b);snapshots.push({path:file,sha256:hash(b)});}
const movie=run+'/render/last-deal-fourteen-materials.mp4',child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',movie],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);const done=once(child,'close'),records=[];
try{for(const r of track.frames){
 const sourceBytes=await readFile(r.source.path),printedBytes=await readFile(r.output.path),maskBytes=await readFile(r.mask.path);assert.equal(hash(sourceBytes),r.source.sha256);assert.equal(hash(printedBytes),r.output.sha256);assert.equal(hash(maskBytes),r.mask.sha256);
 const raw=await sharp(sourceBytes).removeAlpha().raw().toBuffer(),printed=await sharp(printedBytes).removeAlpha().raw().toBuffer(),mask=await sharp(maskBytes).removeAlpha().raw().toBuffer();assert.equal(createHash('md5').update(raw).digest('hex'),md5[r.frame]);assert.equal(mask.length,W*H*3);
 const paper=Buffer.alloc(W*H);let outsideChanges=0,guardChanges=0,overlap=0;
 for(let p=0;p<W*H;p++){const j=p*3;paper[p]=Math.max(mask[j],mask[j+1]);if(mask[j]&&mask[j+1])overlap++;const changed=[0,1,2].some(c=>printed[j+c]!==raw[j+c]);if(changed&&!paper[p])outsideChanges++;if(changed&&mask[j+2])guardChanges++;}assert.equal(outsideChanges,0);assert.equal(guardChanges,0);assert.equal(overlap,0);
 const keyed=keyPamelaFrameWithPaper(printed,W,H,paper),out=Buffer.allocUnsafe(raw.length);let priorCardCoreChanged=0;
 for(let p=0;p<W*H;p++){const a=keyed.alpha[p];for(let c=0;c<3;c++){out[p*3+c]=Math.round(stage[p*3+c]*(1-a)+keyed.rgb[p*3+c]*a);if(priorCore[p]&&out[p*3+c]!==stage[p*3+c])priorCardCoreChanged++;}}
 assert.equal(priorCardCoreChanged,0,'Current source overwrites a prior card');if(!child.stdin.write(out))await once(child.stdin,'drain');
 let proof:null|{path:string;sha256:string}=null;if([0,80,90,100,180,206,225,270,350,359].includes(r.frame)){const path=`${run}/qa/frame-${String(r.frame).padStart(4,'0')}.png`;await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(path);proof={path,sha256:hash(await readFile(path))};}
 records.push({frame:r.frame,source:r.source,printed:r.output,mask:r.mask,sourceRgbEqual:true,outsideChanges,guardChanges,overlap,priorCardCoreChanged,restoredOpaquePixels:keyed.verification.restoredOpaquePixels,outputRgbSha256:hash(out),proof});if(r.frame%60===59)console.log(JSON.stringify({frames:r.frame+1}));
 }child.stdin.end();const[code]=await done;assert.equal(code,0,errors);}catch(e){child.stdin.destroy();if(child.exitCode===null)child.kill();throw e;}
const probe=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',movie],{windowsHide:true})).stdout);assert.equal(+probe.streams[0].nb_read_frames,360);for(const s of snapshots)assert.equal(hash(await readFile(s.path)),s.sha256,'Frozen input changed during integration');
await writeFile(run+'/evidence.json',JSON.stringify({status:'final-seat-material-integration-candidate',source:track.source,inputTrack:{path:trackPath,sha256:expected},output:{path:movie,sha256:hash(await readFile(movie)),probe},staticLayers,currentLayers:surfaces.results[6].layers.map((l:any)=>({slotId:l.slotId,value:l.diagnosticValue,material:l.material})),records,snapshots,verification:{frames:360,sourceRgbEqualFrames:360,outsidePrintedPaperChanges:0,protectedChanges:0,priorCardCoreChanged:0,independentMaterials:14},limitations:['Only the last P7 second-card action; other twelve materials are already resting on the table','Authored front-side demonstration; physical flip remains UNKNOWN','Source-specific masks and preliminary actor key remain candidates','This does not claim that all fourteen moving clips are textured'],productionAccepted:false,newApiJobs:0},null,2));console.log(JSON.stringify({run,frames:360,materials:14}));
