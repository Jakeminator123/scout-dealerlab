import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createPamelaSceneRenderer} from '../src/pamela-scene-renderer.ts';

const execute=promisify(execFile),run='runs/20261109-pamela-idle-composite',sourceRun='runs/20261109-pamela-idle-pilot';
const W=1762,H=1174,FPS=30,proofOnly=process.argv.includes('--proofs');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const readJson=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
for(const dir of ['render','qa'])await mkdir(`${run}/${dir}`,{recursive:true});
const renderer=await createPamelaSceneRenderer({contact:true,retargetSecond:false});
const helperPaths=['src/pamela-scene-renderer.ts','src/pamela-key.ts','src/pamela-contact-shadow.ts'];
const helperHashes=await Promise.all(helperPaths.map(async path=>({path,sha256:hash(await readFile(path))})));
function encoder(file:string,width:number,height:number){
 const child=spawn('ffmpeg',['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart','-n',file],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let errors='';child.stderr.on('data',b=>{errors+=b.toString();});
 const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(errors||`ffmpeg exited ${code}`)));});
 // Attach a handler immediately; the awaited result still carries failure.
 void done.catch(()=>{});
 return {async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async end(){child.stdin.end();await done;}};
}
async function videoInfo(path:string){
 const {stdout}=await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_read_frames,codec_name:format=duration','-of','json',path],{windowsHide:true,maxBuffer:5000});
 const p=JSON.parse(stdout),s=p.streams[0],rate=s.r_frame_rate.split('/').map(Number),bytes=await readFile(path);
 return {path,sha256:hash(bytes),bytes:bytes.length,width:s.width,height:s.height,fps:rate[0]/rate[1],frameCount:Number(s.nb_read_frames),duration:Number(p.format.duration),codec:s.codec_name};
}
const clips=[];
for(const name of ['breath','glance']){
 const job=await readJson(`${sourceRun}/${name}.json`),source=await videoInfo(job.output.path),count=name==='breath'?180:90;
 if(source.sha256!==job.output.sha256||source.width!==W||source.height!==H||source.fps!==FPS||source.frameCount!==count)throw Error(`Unexpected ${name} source identity/format`);
 const nativePath=`${run}/render/pamela-${name}-native-v1.mp4`,portraitPath=`${run}/render/pamela-${name}-portrait-v1.mp4`;
 const native=proofOnly?null:encoder(nativePath,W,H),portrait=proofOnly?null:encoder(portraitPath,1080,1920);
 const indices=proofOnly?[0,Math.floor(count/2),count-1]:Array.from({length:count},(_,i)=>i),proofs=[];
 const diagnostics={skinChanged:0,protectedSleeveChanged:0,shadowOnForeground:0,shadowPixelsMin:Infinity,shadowPixelsMax:0};
 for(const frame of indices){
  const raw=await sharp(`${sourceRun}/qa/${name}/frame-${String(frame+1).padStart(3,'0')}.png`).removeAlpha().raw().toBuffer();
  const result=await renderer({raw,clip:'idle',sourceFrame:frame});
  const d=result.diagnostics.contact!;
  diagnostics.skinChanged+=d.skinChanged;diagnostics.protectedSleeveChanged+=d.protectedSleeveChanged;diagnostics.shadowOnForeground+=d.shadowOnForeground;
  diagnostics.shadowPixelsMin=Math.min(diagnostics.shadowPixelsMin,d.shadowPixels);diagnostics.shadowPixelsMax=Math.max(diagnostics.shadowPixelsMax,d.shadowPixels);
  if([0,Math.floor(count/2),count-1].includes(frame)){
   const path=`${run}/qa/${name}-${String(frame).padStart(3,'0')}.png`,portraitProof=path.replace('.png','-portrait.png');
   await sharp(result.native,{raw:{width:W,height:H,channels:3}}).png().toFile(path);
   await sharp(result.portrait,{raw:{width:1080,height:1920,channels:3}}).png().toFile(portraitProof);proofs.push({frame,path,portrait:portraitProof});
  }
  if(native&&portrait)await Promise.all([native.write(result.native),portrait.write(result.portrait)]);
  if(frame%60===0)console.log(`${name}: ${frame}/${count}`);
 }
 if(native&&portrait)await Promise.all([native.end(),portrait.end()]);
 if(diagnostics.skinChanged||diagnostics.protectedSleeveChanged||diagnostics.shadowOnForeground)throw Error('Contact layer invariants failed');
 clips.push({name,label:name==='breath'?'Lugn andning':'Blick ned och tillbaka',role:job.role,source,job:`${sourceRun}/${name}.json`,model:job.model,taskId:job.taskId,estimatedCredits:job.expectedCredits,input:job.input,proofs,diagnostics,...(!proofOnly?{native:await videoInfo(nativePath),portrait:await videoInfo(portraitPath)}:{})});
}
for(const helper of helperHashes)if(hash(await readFile(helper.path))!==helper.sha256)throw Error('Renderer changed during this run');
const report={schemaVersion:1,createdAt:new Date().toISOString(),dealerId:'pamela-pilot',status:'candidate-needs-loop-review',productionAccepted:false,activated:false,fps:FPS,clips,helpers:helperHashes,composition:{sameSourceGeometry:true,frameMapping:'one source frame to one output frame, no crop in native view',portraitMapping:'same V2 shared projection: resize 1586x1057, x=-250, y=80; 1080x1920 output',room:'runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png',table:'runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png',contact:'source-derived separate shadow and torso occlusion candidate; no fixed torso rectangle',c2Retarget:false,noTemporalRepairs:true},limitations:['Identical VILA first/last inputs do not guarantee a seamless generated loop.','No freeze, reverse playback, optical-flow interpolation or crossfade applied.','Contact shadow strength is estimated; source identity, hands and endpoint velocity need visual review.']};
await writeFile(`${run}/${proofOnly?'proofs':'composition'}.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({run,proofOnly,clips:clips.map(c=>({name:c.name,source:c.source,diagnostics:c.diagnostics}))}));
