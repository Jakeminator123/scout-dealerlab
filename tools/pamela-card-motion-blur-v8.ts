import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createPamelaCardMotionBlurV8Renderer,PAMELA_V8_PARAMETERS} from '../src/pamela-card-motion-blur-v8.ts';
import {loadPamelaMesh} from '../src/pamela-card-mesh.ts';
const take=process.argv.find(x=>x.startsWith('--take='))?.slice(7)??'01';
if(!/^\d{2}$/.test(take))throw Error('Use a unique two-digit take');
const full=process.argv.includes('--full'),run=`runs/20261109-pamela-card-blur-v8/take-${take}`;
const {width:W,height:H}=PAMELA_V8_PARAMETERS,FPS=30;
const source='runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4',base='runs/20261109-pamela-central-composite/tracking';
const bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),execute=promisify(execFile);
const tracks=JSON.parse(await readFile(`${base}/card-tracks.json`,'utf8'));
if(sha(await readFile(source))!=='2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a')throw Error('Source identity changed');
await mkdir('runs/20261109-pamela-card-blur-v8',{recursive:true});await mkdir(run);
for(const folder of ['qa','native','masks','render','snapshot'])await mkdir(`${run}/${folder}`);
const dependencies=['src/pamela-card-motion-blur-v8.ts','tools/pamela-card-motion-blur-v8.ts','src/pamela-card-contact-v6.ts','src/pamela-card-mesh.ts','src/pamela-key.ts','src/pamela-contact-shadow.ts','src/pamela-card-surfaces.ts',`${base}/card-tracks.json`,'runs/20261109-pamela-shoe-v6-audit/card-mesh.json','runs/20261109-pamela-shoe-v6-audit/nail-guards.json','runs/20261109-pamela-v7-edge-audit/paper-edge-contract.json'];
const snapshots=[];for(const path of dependencies){const bytes=await readFile(path);snapshots.push({path,sha256:sha(bytes)});await writeFile(`${run}/snapshot/${path.replaceAll('/','__')}`,bytes);}
const mode=process.argv.includes('--coverage')?'convex-coverage':'print-only';
const render=await createPamelaCardMotionBlurV8Renderer(mode),mesh=await loadPamelaMesh('runs/20261109-pamela-shoe-v6-audit/card-mesh.json');
function encoder(path:string,width:number,height:number){
 const child=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','14','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let errors='';child.stderr.on('data',v=>errors+=v);const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(errors)));});void done.catch(()=>{});
 return {path,async write(data:Buffer){if(!child.stdin.write(data))await once(child.stdin,'drain');},async finish(){child.stdin.end();await done;},abort(){child.stdin.destroy();child.kill();}};
}
const enc=full?[encoder(`${run}/render/source-v6-v8.mp4`,1536,474),encoder(`${run}/render/v8-native.mp4`,W,H)]:[];
const frames=full?Array.from({length:37},(_,i)=>i+48):[54,60,73,78],records:any[]=[],keyFrames=[48,54,56,60,65,70,73,74,75,76,77,78,79,80,81,84];
const png=(raw:Buffer,width=W,height=H)=>sharp(raw,{raw:{width,height,channels:3}}).png().toBuffer();
try{
 for(const f of frames){
  const name=`frame-${String(f+1).padStart(3,'0')}.png`,sourcePath=`runs/20261109-pamela-sequence/qa/central-base/${name}`,bytes=await readFile(sourcePath),track=tracks.frames[f];
  if(sha(bytes)!==track.frameSha256)throw Error(`Source frame ${f} changed`);
  const raw=await sharp(bytes).removeAlpha().raw().toBuffer();const maskHashes:any={};
  const masks=await Promise.all(['moving','shoe'].map(async kind=>{const b=await readFile(`${base}/${kind}-mask/${name}`);maskHashes[kind]=sha(b);if(sha(b)!==track[kind].maskSha256)throw Error(`Mask changed ${kind}/${f}`);return sharp(b).greyscale().raw().toBuffer();}));
  const result=await render({raw,clip:'deal',sourceFrame:f,dealOrdinal:0,priorCards:0,mask:masks[0],shoeMask:masks[1],contour:track.moving.contourNative,quad:track.moving.quadNative});
  const bounds=mesh(f)!.sections.flatMap(s=>[s.left,s.right]),xs=bounds.map(p=>p[0]),ys=bounds.map(p=>p[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const roi={left:Math.max(0,Math.min(W-340,Math.round(cx-170))),top:Math.max(0,Math.min(H-300,Math.round(cy-150))),width:340,height:300};
  const crops=await Promise.all([raw,result.before,result.native].map(data=>sharp(data,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(680,600).png().toBuffer()));
  const label=Buffer.from(`<svg width="2040" height="30"><rect width="100%" height="100%" fill="#17202a"/><g font-size="19" fill="white" font-family="Arial"><text x="12" y="22">SOURCE ${f}</text><text x="692" y="22">V6 reference</text><text x="1372" y="22">V8 local candidate / not accepted</text></g></svg>`);
  const comparison=await sharp({create:{width:2040,height:630,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},...crops.map((input,i)=>({input,left:i*680,top:30}))]).png().toBuffer();
  if(full){await enc[0].write(await sharp(comparison).resize(1536,474).removeAlpha().raw().toBuffer());await enc[1].write(result.native);}
  const nativePath=`${run}/native/v8-${f}.png`,nativeBytes=await png(result.native);await writeFile(nativePath,nativeBytes);
  if(!full||keyFrames.includes(f)){
   await writeFile(`${run}/qa/comparison-${f}.png`,comparison);
   for(const [name,mask] of Object.entries(result.masks))await sharp(mask,{raw:{width:W,height:H,channels:1}}).png().toFile(`${run}/masks/${name}-${f}.png`);
   const maskRgb=Buffer.alloc(W*H*3);for(let p=0;p<W*H;p++){maskRgb[p*3]=result.masks.skin[p];maskRgb[p*3+1]=result.masks.paper[p];maskRgb[p*3+2]=result.masks.nail[p];}
   await sharp(maskRgb,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(680,600).png().toFile(`${run}/qa/masks-${f}.png`);
  }
  records.push({sourceFrame:f,sourcePath,sourceSha256:sha(bytes),maskHashes,nativePath,nativeSha256:sha(nativeBytes),roi,...result.diagnostics});
  console.log(`V8 frame ${f}: paper=${result.diagnostics.paperPixels} protected=${result.diagnostics.safeSkinPixels} changedSafe=${result.diagnostics.safeSkinChangedSource} blur=${result.diagnostics.meanPrintBlurPixels.toFixed(2)}`);
 }
 await Promise.all(enc.map(e=>e.finish()));
}catch(error){enc.forEach(e=>e.abort());throw error;}
const outputs=[];for(const encoder of enc){
 const {stdout}=await execute(`${bin}/ffprobe.exe`,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',encoder.path],{windowsHide:true,maxBuffer:5000});
 const probe=JSON.parse(stdout),s=probe.streams[0];if(s.avg_frame_rate!=='30/1'||Number(s.nb_read_frames)!==37)throw Error('V8 timing contract failed');outputs.push({path:encoder.path,sha256:sha(await readFile(encoder.path)),...s,duration:probe.format.duration});
}
await writeFile(`${run}/evidence.json`,JSON.stringify({status:'diagnostic-awaiting-visual-review',createdAt:new Date().toISOString(),source:{path:source,sha256:tracks.source.sha256},mode,parameters:PAMELA_V8_PARAMETERS,processing:{newPaidJobs:0,modelTaskId:null,prompt:null,deterministicLocalOnly:true,sourceStart:frames[0],sourceEndInclusive:frames.at(-1),frameCount:frames.length,fps:FPS,frameSynthesis:false,retiming:false},snapshots,outputs,records,limits:['Semantic hand mask is incomplete; only separately measured safe skin is claimed byte-identical.','Motion blur shutter length is an authored estimate derived from measured mesh speed, not recovered camera metadata.','Convex coverage trials produced brown or dark fringes and are rejected; final print-only mode retains V6 paper support.','V6 remains the reference; no UI selection, integration or publication.']},null,2)+'\n');
console.log(`V8 ready: ${run}`);
