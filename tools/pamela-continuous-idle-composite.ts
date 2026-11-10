import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createPamelaSceneRenderer} from '../src/pamela-scene-renderer.ts';

const execute=promisify(execFile),run='runs/20261109-pamela-continuous-idle';
const W=1762,H=1174,FPS=30;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const readJson=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
async function videoInfo(path:string){
 const {stdout}=await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,codec_name:format=duration','-of','json',path],{windowsHide:true,maxBuffer:5000});
 const parsed=JSON.parse(stdout),s=parsed.streams[0],rate=s.r_frame_rate.split('/').map(Number),avg=s.avg_frame_rate.split('/').map(Number),bytes=await readFile(path);
 return {path,sha256:hash(bytes),bytes:bytes.length,width:s.width,height:s.height,fps:rate[0]/rate[1],averageFps:avg[0]/avg[1],frameCount:Number(s.nb_read_frames),duration:Number(parsed.format.duration),codec:s.codec_name};
}
function encoder(file:string,width:number,height:number){
 const child=spawn('ffmpeg',['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',file],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let errors='';child.stderr.on('data',b=>{errors+=b.toString();});
 const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(errors||`ffmpeg exited ${code}`)));});
 void done.catch(()=>{});
 return {async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async end(){child.stdin.end();await done;}};
}
await mkdir(`${run}/render`,{recursive:true});
const job=await readJson(`${run}/continuous.json`),source=await videoInfo(job.output.path);
if(source.sha256!==job.output.sha256||source.width!==W||source.height!==H||source.fps!==FPS||source.averageFps!==FPS||source.frameCount!==360)throw Error('Unexpected source identity or timebase; inspect before composing');
const extraction=await readJson(`${run}/qa/extraction.json`);
if(extraction.status!=='complete'||extraction.sourceSha256!==source.sha256||extraction.frameCount!==source.frameCount)throw Error('Complete source-bound extraction required');
const renderer=await createPamelaSceneRenderer({contact:true,retargetSecond:false});
const helperPaths=['src/pamela-scene-renderer.ts','src/pamela-key.ts','src/pamela-contact-shadow.ts'];
const helpers=await Promise.all(helperPaths.map(async path=>({path,sha256:hash(await readFile(path))})));
const nativePath=`${run}/render/pamela-continuous-native-v1.mp4`,portraitPath=`${run}/render/pamela-continuous-portrait-v1.mp4`;
const native=encoder(nativePath,W,H),portrait=encoder(portraitPath,1080,1920);
const proofs:{frame:number;path:string;portrait:string}[]=[],indices=new Set([0,59,119,179,239,314,359]);
const diagnostics={skinChanged:0,protectedSleeveChanged:0,shadowOnForeground:0,shadowPixelsMin:Infinity,shadowPixelsMax:0};
for(let frame=0;frame<source.frameCount;frame++){
 const raw=await sharp(`${run}/qa/frame-${String(frame+1).padStart(3,'0')}.png`).removeAlpha().raw().toBuffer();
 if(raw.length!==W*H*3)throw Error('Decoded native source geometry mismatch');
 const result=await renderer({raw,clip:'idle',sourceFrame:frame}),d=result.diagnostics.contact!;
 diagnostics.skinChanged+=d.skinChanged;diagnostics.protectedSleeveChanged+=d.protectedSleeveChanged;diagnostics.shadowOnForeground+=d.shadowOnForeground;
 diagnostics.shadowPixelsMin=Math.min(diagnostics.shadowPixelsMin,d.shadowPixels);diagnostics.shadowPixelsMax=Math.max(diagnostics.shadowPixelsMax,d.shadowPixels);
 if(indices.has(frame)){
  const path=`${run}/render/scene-${String(frame).padStart(3,'0')}.png`,portraitProof=path.replace('.png','-portrait.png');
  await sharp(result.native,{raw:{width:W,height:H,channels:3}}).png().toFile(path);
  await sharp(result.portrait,{raw:{width:1080,height:1920,channels:3}}).png().toFile(portraitProof);
  proofs.push({frame,path,portrait:portraitProof});
 }
 await Promise.all([native.write(result.native),portrait.write(result.portrait)]);
 if(frame%60===0)console.log(`continuous: ${frame}/${source.frameCount}`);
}
await Promise.all([native.end(),portrait.end()]);
if(diagnostics.skinChanged||diagnostics.protectedSleeveChanged||diagnostics.shadowOnForeground)throw Error('Contact invariants failed');
for(const helper of helpers)if(hash(await readFile(helper.path))!==helper.sha256)throw Error('Renderer changed during generation');
const output=await videoInfo(nativePath),portraitMedia=await videoInfo(portraitPath);
async function repeat(path:string){
 const loopPath=path.replace('-v1.mp4','-3loops-v1.mp4');
 await execute('ffmpeg',['-v','error','-nostdin','-stream_loop','2','-i',path,'-map','0:v:0','-c','copy','-movflags','+faststart','-n',loopPath],{windowsHide:true,maxBuffer:5000});
 const info=await videoInfo(loopPath);
 if(info.frameCount!==source.frameCount*3||info.fps!==FPS||info.averageFps!==FPS)throw Error('Direct repeat altered timebase');
 return info;
}
const loopNative=await repeat(nativePath),loopPortrait=await repeat(portraitPath);
if(output.frameCount!==source.frameCount||portraitMedia.frameCount!==source.frameCount)throw Error('Composition lost frames');
const report={schemaVersion:1,createdAt:new Date().toISOString(),dealerId:'pamela-pilot',model:job.model,taskId:job.taskId,costCredits:240,input:job.input,status:'candidate-awaiting-visual-return-review',productionAccepted:false,activated:false,output,portrait:portraitMedia,raw:source,loopNative,loopPortrait,poster:proofs[0].path,proofs,helpers,diagnostics,qa:{reportPath:`${run}/qa/inspection.json`,summary:'Fem återbesök önskades i prompten. Uppmätta rutor och visuell bedömning avgör vilka som går att klippa; ingen variant är produktionsgodkänd.',usableVariants:null},composition:{sameSourceGeometry:true,frameMapping:'one source frame to one scene frame; no internal edit cuts or temporal repairs',loopMapping:'exact encoded stream repeated three times; raw joins at 12 and 24 seconds',portraitMapping:'same shared scene projection as existing idle: resize 1586x1057, x=-250, y=80; 1080x1920 output',room:'runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png',table:'runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png',contact:'same source-derived contact shadow and torso occlusion candidate'},limitations:['First/last input anchors do not enforce intermediate timed anchor poses.','The complete continuous take has no internal editing joins; selecting/reordering extracts creates new joins.','No freeze, crossfade, reverse playback, optical flow or face retouching is applied.','This idle experiment does not validate central dealing or the seven-seat reach.']};
await writeFile(`${run}/composition.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({run,output,loopNative,diagnostics,extractionComplete:true}));
