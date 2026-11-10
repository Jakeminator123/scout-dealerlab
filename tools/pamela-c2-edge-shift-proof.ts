import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {retargetPamelaC2Frame,PAMELA_C2_SOURCE_SHA256,pamelaC2HandShift} from '../src/pamela-c2-retarget.ts';
import {retargetPamelaC2FrameV2,pamelaC2EdgeShiftProfile} from '../src/pamela-c2-retarget-v2.ts';
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7)??'01';
if(!/^\d{2}$/.test(take))throw Error('Use a unique two-digit take');
const run=`runs/20261109-pamela-c2-edge-shift/take-${take}`,W=1762,H=1174,FPS=30;
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const tracksPath='runs/20261109-pamela-central-composite/tracking/card-tracks.json',tracks=await read(tracksPath);
const sourcePath='runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4';
assert.equal(sha(await readFile(sourcePath)),PAMELA_C2_SOURCE_SHA256);
sharp.concurrency(1);await mkdir('runs/20261109-pamela-c2-edge-shift',{recursive:true});await mkdir(run);for(const dir of ['qa','render','code'])await mkdir(`${run}/${dir}`);
const code=[];for(const path of ['src/pamela-c2-retarget.ts','src/pamela-c2-retarget-v2.ts','tools/pamela-c2-edge-shift-proof.ts',tracksPath,'runs/20261109-pamela-shoe-v6-audit/card-mesh.json']){const bytes=await readFile(path);code.push({path,sha256:sha(bytes)});await writeFile(`${run}/code/${path.replaceAll('/','__')}`,bytes);}
const roi={left:520,top:530,width:760,height:610};
const video=`${run}/render/c2-before-after-54-100.mp4`;
const ff=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size','1520x640','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','14','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',video],{windowsHide:true,stdio:['pipe','ignore','pipe']});
let errors='';ff.stderr.on('data',v=>errors+=v);const done=new Promise<void>((resolve,reject)=>{ff.once('error',reject);ff.once('close',c=>c===0?resolve():reject(Error(errors)));});void done.catch(()=>{});
const records:any[]=[],sheets:Buffer[]=[],critical=new Set([54,56,60,64,66,69,70,72,76,80,88,93,94,100,108,114,118,124,126]);
try{
 for(const frame of [...Array.from({length:47},(_,i)=>i+54),108,114,118,124,126]){
  const filename=`frame-${String(frame+1).padStart(3,'0')}.png`,path=`runs/20261109-pamela-sequence/qa/central-base/${filename}`,bytes=await readFile(path),maskPath=`runs/20261109-pamela-central-composite/tracking/moving-mask/${filename}`,maskBytes=await readFile(maskPath);
  assert.equal(sha(bytes),tracks.frames[frame].frameSha256);assert.equal(sha(maskBytes),tracks.frames[frame].moving.maskSha256);
  const raw=await sharp(bytes).removeAlpha().raw().toBuffer(),mask=await sharp(maskBytes).greyscale().raw().toBuffer();
  const input={sourceRGB:raw,visibleCardMask:mask,width:W,height:H,sourceFrameIndex:frame,sourceSha256:PAMELA_C2_SOURCE_SHA256,contourNative:tracks.frames[frame].moving.contourNative};
  const before=retargetPamelaC2Frame(input),after=retargetPamelaC2FrameV2(input);
  let upperChanges=0,outsideScopeChanges=0,changedJacketRGBBytes=0,oldVsNewChanges=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++){
   const i=(y*W+x)*3+c;if(raw[i]!==after.rgb[i]){if(y<550)upperChanges++;if(x<400||x>1250||y<550||y>=1125)outsideScopeChanges++;if(x>=780&&x<=980&&y>=550&&y<=640)changedJacketRGBBytes++;}
   if(before.rgb[i]!==after.rgb[i])oldVsNewChanges++;
  }
  assert.equal(upperChanges,0);assert.equal(outsideScopeChanges,0);if(frame>=94)assert.equal(oldVsNewChanges,0);
  assert(after.diagnostics.maxObservedCardShiftErrorPixels<.01,`Card no longer rigid at ${frame}: ${after.diagnostics.maxObservedCardShiftErrorPixels}`);
  const record={sourceFrame:frame,fileFrame:frame+1,timeSeconds:frame/30,sourceFrameSha256:sha(bytes),sourceMaskSha256:sha(maskBytes),sourceMovingArea:tracks.frames[frame].moving.alphaAreaPx,oldShift:pamelaC2HandShift(frame),profile:pamelaC2EdgeShiftProfile(frame),upperChanges,outsideScopeChanges,changedJacketRGBBytes,oldVsNewChanges,diagnostics:after.diagnostics};records.push(record);
  const crops=await Promise.all([before.rgb,after.rgb].map(data=>sharp(data,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer()));
  const labels=Buffer.from(`<svg width="1520" height="30"><rect width="100%" height="100%" fill="#17202a"/><g font-family="Arial" font-size="19" fill="white"><text x="10" y="22">SOURCE ${frame} | BEFORE: ${record.oldShift.toFixed(1)} px</text><text x="770" y="22">SOURCE ${frame} | EDGE SHIFT: ${record.profile.cardShiftPixels.toFixed(1)} px</text></g></svg>`);
  const row=await sharp({create:{width:1520,height:640,channels:3,background:'#17202a'}}).composite([{input:labels,left:0,top:0},...crops.map((input,i)=>({input,left:i*760,top:30}))]).removeAlpha().raw().toBuffer();
  if(frame<=100&&!ff.stdin.write(row))await once(ff.stdin,'drain');
  if(critical.has(frame)){
   await sharp(row,{raw:{width:1520,height:640,channels:3}}).png().toFile(`${run}/qa/comparison-${frame}.png`);
   await sharp(after.rgb,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/after-${frame}.png`);
   const overlay=Buffer.from(after.rgb);for(let p=0;p<W*H;p++)if(after.warpSupportMask[p]){const a=after.warpSupportMask[p]/255*.32;overlay[p*3]=Math.round(overlay[p*3]*(1-a));overlay[p*3+1]=Math.round(overlay[p*3+1]*(1-a)+160*a);overlay[p*3+2]=Math.round(overlay[p*3+2]*(1-a)+255*a);}
   await sharp(overlay,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/support-${frame}.png`);
   if([56,60,66,70,80,94].includes(frame))sheets.push(await sharp(row,{raw:{width:1520,height:640,channels:3}}).resize(1140,480).png().toBuffer());
  }
  if(frame%5===0)console.log(`edge proof ${frame}`);
 }
 ff.stdin.end();await done;
}catch(e){ff.stdin.destroy();ff.kill();throw e;}
await sharp({create:{width:1140,height:480*sheets.length,channels:3,background:'#17202a'}}).composite(sheets.map((input,i)=>({input,left:0,top:i*480}))).png().toFile(`${run}/qa/contact-sheet.png`);
const {stdout}=await promisify(execFile)(`${bin}/ffprobe.exe`,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames','-of','json',video],{windowsHide:true});const stream=JSON.parse(stdout).streams[0];assert.equal(stream.nb_read_frames,'47');assert.equal(stream.avg_frame_rate,'30/1');
const timing=Array.from({length:180},(_,frame)=>({frame,...pamelaC2EdgeShiftProfile(frame)}));
const maxAddedStep=Math.max(...timing.slice(1).map((p,i)=>Math.abs(p.cardShiftPixels-timing[i].cardShiftPixels)));
await save(`${run}/evidence.json`,{status:'diagnostic-2d-candidate-not-integrated',createdAt:new Date().toISOString(),node:process.version,source:{path:sourcePath,sha256:PAMELA_C2_SOURCE_SHA256},code,outputs:[{path:video,sha256:sha(await readFile(video)),...stream}],records,timing,maxAddedShiftPerFrame:maxAddedStep,sourceThinEvidence:'Observed edge-on source56..70; alpha area and source-bound masks recorded per frame',processing:{newPaidJobs:0,retime:false,faceChanges:false,sourceFramesSynthesized:false,dimensions:[W,H],fps:FPS},limits:['Inferred paired-hand warp also moves jacket pixels within x400..1250,y550..1124. No full hand matte or clean plate.','Only local diagnostic raw-source proof. Root owns renderer integration and unique C1/C2 artwork.','C2 is exactly +46 from69 onward. Actual frame-to-frame source motion remains.','Original helper output is reused pixel-identically from94 onward, including hand release/return.']});
console.log(JSON.stringify({run,records:records.length,maxAddedStep,peakJacketChangedBytes:Math.max(...records.map(r=>r.changedJacketRGBBytes)),minJacobian:Math.min(...records.map(r=>r.diagnostics.minimumHorizontalJacobianBound))}));
