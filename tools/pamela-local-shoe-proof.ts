import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createPamelaCardContactV5Renderer} from '../src/pamela-card-contact-v5.ts';
import {createPamelaCardContactV6Renderer} from '../src/pamela-card-contact-v6.ts';
import {loadPamelaMesh} from '../src/pamela-card-mesh.ts';

const take=process.argv.find(x=>x.startsWith('--take='))?.slice(7)??'01';
if(!/^\d{2}$/.test(take))throw Error('Expected unique two-digit take');
const run=`runs/20261109-pamela-local-shoe-proof/take-${take}`,W=1762,H=1174,FPS=30;
const meshPath=process.argv.find(x=>x.startsWith('--mesh='))?.slice(7)??'runs/20261109-pamela-shoe-v6-audit/card-mesh.json';
const stillsOnly=process.argv.includes('--stills');
const trackPath='runs/20261109-pamela-central-composite/tracking/card-tracks.json',base='runs/20261109-pamela-central-composite/tracking';
const source='runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4';
const bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const execute=promisify(execFile);
const tracks=await read(trackPath),mesh=await loadPamelaMesh(meshPath);
if(sha(await readFile(source))!==tracks.source.sha256)throw Error('Source changed');
await mkdir(run);await mkdir(`${run}/qa`);await mkdir(`${run}/render`);await mkdir(`${run}/code`);
const code=[];
for(const path of ['src/pamela-card-contact-v5.ts','src/pamela-card-contact-v6.ts','src/pamela-card-mesh.ts','src/pamela-card-shadow.ts','tools/pamela-local-shoe-proof.ts',meshPath,'runs/20261109-pamela-shoe-v6-audit/nail-guards.json',trackPath]){
  const bytes=await readFile(path);code.push({path,sha256:sha(bytes)});await writeFile(`${run}/code/${path.replaceAll('/','__')}`,bytes);
}
const beforeRender=await createPamelaCardContactV5Renderer(),afterRender=await createPamelaCardContactV6Renderer(meshPath);
function encoder(path:string,width:number,height:number){
  const child=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-crf','14','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let errors='';child.stderr.on('data',v=>errors+=v);
  const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',c=>c===0?resolve():reject(Error(errors)));});void done.catch(()=>{});
  return {async write(bytes:Buffer){if(!child.stdin.write(bytes))await once(child.stdin,'drain');},async finish(){child.stdin.end();await done;},abort(){child.stdin.destroy();child.kill();}};
}
const start=32,end=101,keyFrames=[35,36,39,43,46,53,54,60,73,74,78,79,80,84,90,97,98,100];
const files={before:`${run}/render/shoe-before.mp4`,after:`${run}/render/shoe-after.mp4`,source:`${run}/render/shoe-source.mp4`};
const nativeAfter=`${run}/render/shoe-after-native.mp4`;
const enc=stillsOnly?[]:[...Object.values(files).map(p=>encoder(p,680,600)),encoder(nativeAfter,W,H)];
const records:unknown[]=[],sheet:Buffer[]=[];
try{
 for(let f=start;f<end;f++){
  if(stillsOnly&&!keyFrames.includes(f))continue;
  const filename=`frame-${String(f+1).padStart(3,'0')}.png`,bytes=await readFile(`runs/20261109-pamela-sequence/qa/central-base/${filename}`);
  if(sha(bytes)!==tracks.frames[f].frameSha256)throw Error(`Source frame ${f} changed`);
  const raw=await sharp(bytes).removeAlpha().raw().toBuffer(),m=tracks.frames[f].moving;
  const masks=await Promise.all(['moving','shoe'].map(async kind=>{
   const bytes=await readFile(`${base}/${kind}-mask/${filename}`);
   if(sha(bytes)!==tracks.frames[f][kind].maskSha256)throw Error(`Mask ${kind} ${f} changed`);
   return sharp(bytes).greyscale().raw().toBuffer();
  }));
  const input={raw,clip:'deal' as const,sourceFrame:f,dealOrdinal:0,priorCards:0,mask:masks[0],shoeMask:masks[1],contour:m.contourNative,quad:m.quadNative};
  const before=await beforeRender(input),after=await afterRender(input);
  const bounds=mesh(f)?.sections.flatMap(s=>[s.left,s.right])??(m.contourNative?.length?m.contourNative:[[1240,756],[1340,857]]);
  const xs=bounds.map((p:number[])=>p[0]),ys=bounds.map((p:number[])=>p[1]);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const roi={left:Math.max(0,Math.min(W-340,Math.round(cx-170))),top:Math.max(0,Math.min(H-300,Math.round(cy-150))),width:340,height:300};
  const crop=(data:Buffer)=>sharp(data,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(680,600,{kernel:'lanczos3'}).raw().toBuffer();
  const crops=await Promise.all([crop(before.native),crop(after.native),crop(raw)]);
  await Promise.all(enc.map((e,i)=>e.write(i===3?after.native:crops[i])));
  let changedHead=0;for(let p=0;p<W*480*3;p++)if(before.native[p]!==after.native[p])changedHead++;
  if(changedHead)throw Error('Shoe correction changed head/upper pixels');
  records.push({sourceFrame:f,sourceSha256:sha(bytes),roi,headChangedBytes:changedHead,diagnostics:after.diagnostics});
  if(keyFrames.includes(f)){
   await sharp(after.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/after-${f}.png`);
   await sharp(before.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/before-${f}.png`);
   const label=Buffer.from(`<svg width="1360" height="38"><rect width="100%" height="100%" fill="#17202a"/><text x="12" y="25" font-size="20" fill="white">Källruta ${f} — FÖRE V5 (vänster) / EFTER V6 (höger)</text></svg>`);
   const row=await sharp({create:{width:1360,height:638,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},...await Promise.all(crops.slice(0,2).map(async(c,i)=>({input:await sharp(c,{raw:{width:680,height:600,channels:3}}).png().toBuffer(),left:i*680,top:38}))) ]).png().toBuffer();
   await writeFile(`${run}/qa/comparison-${f}.png`,row);if([39,54,78,84].includes(f))sheet.push(await sharp(row).resize(1020).toBuffer());
  }
  console.log(`shoe ${f}/${end-1}`);
 }
 await Promise.all(enc.map(e=>e.finish()));
}catch(e){enc.forEach(c=>c.abort());throw e;}
const outputs=[];
for(const path of stillsOnly?[]:[...Object.values(files),nativeAfter]){
 const {stdout}=await execute(`${bin}/ffprobe.exe`,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{windowsHide:true,maxBuffer:5000});
 const parsed=JSON.parse(stdout),s=parsed.streams[0];if(Number(s.nb_read_frames)!==end-start||s.avg_frame_rate!=='30/1')throw Error('Video frame mismatch');
 outputs.push({path,sha256:sha(await readFile(path)),...s,duration:parsed.format.duration});
}
const sheetPath=`${run}/qa/shoe-contact-sheet.png`;
await sharp({create:{width:1020,height:479*sheet.length,channels:3,background:'#17202a'}}).composite(sheet.map((input,i)=>({input,left:0,top:i*479}))).png().toFile(sheetPath);
await save(`${run}/evidence.json`,{status:'candidate-awaiting-independent-review',source:{path:source,sha256:tracks.source.sha256},code,outputs,records,processing:{fps:30,frames:end-start,sourceStart:start,sourceEndInclusive:end-1,view:'same moving crop for before/after/source; scale 2; no retiming or frame synthesis',newPaidJobs:0}});
console.log(`Candidate ready: ${run}. Review before updating the live local report.`);
