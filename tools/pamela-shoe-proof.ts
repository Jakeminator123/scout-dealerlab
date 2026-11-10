/** Reproducible local C1-P4 shell-material proof. Originals remain untouched. */
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawn,execFile}from'node:child_process';
import{once}from'node:events';
import{promisify}from'node:util';
import assert from'node:assert/strict';
import sharp from'sharp';
import{applyPamelaShoeLayerRgb,createPamelaShoeLayerFrame,PAMELA_SHOE_CALIBRATION as C,PAMELA_SHOE_VARIANTS,isPamelaShoeSource,type PamelaShoeFrameInput}from'../src/pamela-shoe-layer.ts';
const take=process.argv.find(x=>x.startsWith('--take='))?.slice(7);assert.match(take??'',/^\d{2}$/);
const run=`runs/20261109-pamela-shoe-layer/take-${take}`,evidencePath='runs/20261109-pamela-middle-card-track/take-07/p4-stable-integration/evidence.json';
const bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),writeJson=(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const evidenceBytes=await readFile(evidencePath),e=JSON.parse(evidenceBytes.toString());
assert.equal(hash(evidenceBytes),'7cf6d4a8891a613646ed978e575810d0812158174cbc064aa639643b035c0015');
assert.equal(e.source.sha256,C.sourceSha256);assert.equal(hash(await readFile(C.source)),C.sourceSha256);
assert.equal(e.source.frames,360);assert.equal(e.source.fps,30);assert.equal(process.versions.node.split('.')[0],'24');
assert.equal(isPamelaShoeSource(C.sourceSha256,1762,1174),true);assert.equal(isPamelaShoeSource('wrong',1762,1174),false);
await mkdir('runs/20261109-pamela-shoe-layer',{recursive:true});await mkdir(run);await mkdir(`${run}/qa`);await mkdir(`${run}/code`);
const codes=[];for(const path of ['src/pamela-shoe-layer.ts','tools/pamela-shoe-proof.ts']){const bytes=await readFile(path);codes.push({path,sha256:hash(bytes)});await writeFile(`${run}/code/${path.replaceAll('/','__')}`,bytes,{flag:'wx'});}
const W=1762,H=1174,roi={left:1174,top:590,width:540,height:330};
const films=[{path:`${run}/four-materials-360f-30fps.mp4`,width:1080,height:660},{path:`${run}/ivory-native-360f-30fps.mp4`,width:W,height:H}];
function encoder(o:typeof films[number]){
 const child=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${o.width}x${o.height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','15','-preset','fast','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart','-n',o.path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let errors='';child.stderr.on('data',b=>errors+=b);
 const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',c=>c===0?resolve():reject(Error(errors)));});void done.catch(()=>{});
 return{async write(b:Uint8Array){if(!child.stdin.write(b))await once(child.stdin,'drain');},async finish(){child.stdin.end();await done;},abort(){child.stdin.destroy();child.kill();}};
}
const enc=films.map(encoder),records:unknown[]=[],sheets:string[]=[],keys=new Set([0,30,40,45,50,60,75,90,120,225,300,359]);
let tiles:Buffer[]=[],maxFallbackProtectedChanges=0,totalProtectedChanges=0,minShell=Infinity,maxShell=0;
const crop=(b:Uint8Array)=>sharp(b,{raw:{width:W,height:H,channels:3}}).extract(roi).raw().toBuffer();
try{
 for(let f=0;f<360;f++){
  const rec=e.frames[f],name=`frame-${String(f).padStart(4,'0')}.png`,source=await sharp(`${e.source.frameDirectory}/${name}`).removeAlpha().raw().toBuffer();
  assert.equal(hash(source),rec.sourceRgbSha256,`source ${f}`);
  const masks:Uint8Array[]=[];
  for(const kind of ['coverage','hand','shoe']){const ref=rec.masks[kind],bytes=await readFile(ref.path);assert.equal(hash(bytes),ref.sha256,`${kind} ${f}`);const meta=await sharp(bytes).metadata();assert.equal(meta.channels,1);const {data,info}=await sharp(bytes).greyscale().raw().toBuffer({resolveWithObject:true});assert.equal(info.channels,1);assert.equal(data.length,W*H);masks.push(data);}
  const input:PamelaShoeFrameInput={sourceRgb:source,width:W,height:H,sourceSha256:C.sourceSha256,sourceFrame:f,variant:'ivory-bronze',visiblePaperMask:masks[0],handMask:masks[1],shoePaperMask:masks[2]};
  if(f===0){
   assert.throws(()=>createPamelaShoeLayerFrame({...input,sourceSha256:'wrong'}),/mismatch/);
   assert.throws(()=>createPamelaShoeLayerFrame({...input,sourceFrame:360}),/outside/);
   assert.throws(()=>createPamelaShoeLayerFrame({...input,handMask:new Uint8Array(3)}),/one native/);
   assert.deepEqual(applyPamelaShoeLayerRgb({...input,variant:'source'}).rgb,new Uint8Array(source));
  }
  const variants=PAMELA_SHOE_VARIANTS.slice(1).map(v=>({id:v.id,...applyPamelaShoeLayerRgb({...input,variant:v.id})}));
  const fallback=applyPamelaShoeLayerRgb({...input,visiblePaperMask:undefined,handMask:undefined,shoePaperMask:undefined});
  let protectedChanges=0,fallbackProtectedChanges=0,changedPixels=0;
  for(let y=C.roi.top;y<C.roi.top+C.roi.height;y++)for(let x=C.roi.left;x<C.roi.left+C.roi.width;x++){
   const p=y*W+x,i=p*3,guard=masks.some(m=>m[p]>0),changed=variants[1].rgb[i]!==source[i]||variants[1].rgb[i+1]!==source[i+1]||variants[1].rgb[i+2]!==source[i+2];
   if(changed)changedPixels++;
   if(guard){for(const v of variants)if(v.rgb[i]!==source[i]||v.rgb[i+1]!==source[i+1]||v.rgb[i+2]!==source[i+2])protectedChanges++;if(fallback.rgb[i]!==source[i]||fallback.rgb[i+1]!==source[i+1]||fallback.rgb[i+2]!==source[i+2])fallbackProtectedChanges++;}
  }
  assert.equal(protectedChanges,0,`protected ${f}`);assert.equal(hash(source),rec.sourceRgbSha256,`source mutated ${f}`);
  for(const v of variants){assert.equal(hash(v.rgb.subarray(0,C.roi.top*W*3)),hash(source.subarray(0,C.roi.top*W*3)));assert.equal(hash(v.rgb.subarray((C.roi.top+C.roi.height)*W*3)),hash(source.subarray((C.roi.top+C.roi.height)*W*3)));}
  totalProtectedChanges+=protectedChanges;maxFallbackProtectedChanges=Math.max(maxFallbackProtectedChanges,fallbackProtectedChanges);minShell=Math.min(minShell,changedPixels);maxShell=Math.max(maxShell,changedPixels);
  const crops=await Promise.all([source,...variants.map(v=>v.rgb)].map(crop));
  const panel=Buffer.alloc(1080*660*3);for(let q=0;q<4;q++)for(let y=0;y<330;y++)crops[q].copy(panel,((Math.floor(q/2)*330+y)*1080+(q%2)*540)*3,y*540*3,(y+1)*540*3);
  await Promise.all([enc[0].write(panel),enc[1].write(variants[1].rgb)]);
  const label=Buffer.from(`<svg width="540" height="24"><rect width="540" height="24" fill="#101720"/><text x="9" y="17" fill="white" font-size="13">C1-P4 f${f} | source / obsidian / ivory / walnut</text></svg>`);
  tiles.push(await sharp(panel,{raw:{width:1080,height:660,channels:3}}).resize(540,330).composite([{input:label,left:0,top:0}]).png().toBuffer());
  if(tiles.length===24){const path=`${run}/qa/all-${String(sheets.length).padStart(2,'0')}.jpg`;await sharp({create:{width:2160,height:1980,channels:3,background:'#101720'}}).composite(tiles.map((input,i)=>({input,left:(i%4)*540,top:Math.floor(i/4)*330}))).jpeg({quality:90}).toFile(path);sheets.push(path);tiles=[];}
  if(keys.has(f)){
   await sharp(panel,{raw:{width:1080,height:660,channels:3}}).png().toFile(`${run}/qa/materials-${String(f).padStart(4,'0')}.png`);
   await sharp(variants[1].rgb,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/ivory-native-${String(f).padStart(4,'0')}.png`);
  }
  records.push({frame:f,sourceRgbSha256:hash(source),ivoryRgbSha256:hash(variants[1].rgb),changedPixels,protectedChanges,fallbackProtectedChanges,diagnostics:variants[1].diagnostics});
  if(f%60===0)console.log(JSON.stringify({frame:f,changedPixels,protectedChanges,fallbackProtectedChanges}));
 }
 await Promise.all(enc.map(x=>x.finish()));
}catch(error){enc.forEach(x=>x.abort());throw error;}
const execute=promisify(execFile),outputs=[];
for(const file of films){const {stdout}=await execute(`${bin}/ffprobe.exe`,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',file.path],{windowsHide:true,maxBuffer:5000});const probe=JSON.parse(stdout),s=probe.streams[0];assert.equal(Number(s.nb_read_frames),360);assert.equal(s.avg_frame_rate,'30/1');assert.equal(Number(probe.format.duration),12);outputs.push({...file,sha256:hash(await readFile(file.path)),probe});}
await writeJson(`${run}/evidence.json`,{status:'bounded-visible-shell-material-candidate-not-whole-shoe-replacement',calibration:C,input:{path:evidencePath,sha256:hash(evidenceBytes)},code:codes,outputs,sheets,records,checks:{sourceFrames:360,protectedChanges:totalProtectedChanges,maxFallbackProtectedChanges,changedShellPixelRange:[minShell,maxShell],sourceTiming:'360 original integer frames at30fps; no retiming',sourceRgbMatchedFrames:360,semanticMasksHashChecked:1080},processing:{node:process.version,maximumEncoderThreads:4,paidJobs:0},decision:'Source-bound shell materials are reviewable; full silhouette/shape replacement and anatomical matte acceptance remain unsupported.'});
console.log(JSON.stringify({run,frames:360,protectedChanges:totalProtectedChanges,maxFallbackProtectedChanges,outputs:outputs.map(x=>x.path)}));
