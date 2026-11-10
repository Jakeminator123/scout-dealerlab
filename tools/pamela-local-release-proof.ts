import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import sharp from 'sharp';
import {createPamelaCardContactV4Renderer,type PamelaCardContactV4Frame} from '../src/pamela-card-contact-v4.ts';
import {createPamelaCardContactV5Renderer} from '../src/pamela-card-contact-v5.ts';

const rootRun='runs/20261109-pamela-local-release-proof';
const take=process.argv.find(x=>x.startsWith('--take='))?.slice(7)??'01';
if(!/^\d{2}$/.test(take))throw Error('Use a unique two-digit take');
const run=`${rootRun}/take-${take}`,W=1762,H=1174;
const bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const ffmpeg=`${bin}/ffmpeg.exe`,ffprobe=`${bin}/ffprobe.exe`,execute=promisify(execFile);
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=(p:string,data:unknown)=>writeFile(p,JSON.stringify(data,null,2)+'\n');
sharp.concurrency(1);
await mkdir(`${run}/qa`,{recursive:true});await mkdir(`${run}/render`,{recursive:true});
const plan=await read('runs/20261109-pamela-local-idle-proof/timeline.json');
let boundary=0;
const joins=plan.segments.slice(0,-1).map((s:any,i:number)=>{
 boundary+=s.endFrameExclusive-s.startFrameInclusive;
 const j=plan.joins[i];
 return {...j,outputFrame:boundary,outputSeconds:boundary/30,label:`${j.from.clip} ${j.from.sourceFrame} → ${j.to.clip} ${j.to.sourceFrame}`};
});
const trackPath='runs/20261109-pamela-central-composite/tracking/card-tracks.json';
const tracks=await read(trackPath),base='runs/20261109-pamela-central-composite/tracking';
for(const s of Object.values(plan.sources) as {path:string;sha256:string}[])if(hash(await readFile(s.path))!==s.sha256)throw Error('Source hash changed: '+s.path);
const newRender=await createPamelaCardContactV5Renderer();
async function input(clip:string,index:number,dealOrdinal=0,priorCards=0):Promise<PamelaCardContactV4Frame>{
 const s=plan.sources[clip],file=`frame-${String(index+1).padStart(3,'0')}.png`;
 const bytes=await readFile(`${s.dir}/${file}`),raw=await sharp(bytes).removeAlpha().raw().toBuffer();
 if(clip==='deal'){
  if(hash(bytes)!==tracks.frames[index].frameSha256)throw Error('Source frame hash changed');
  const m=tracks.frames[index].moving;
  return {raw,clip:'deal',sourceFrame:index,dealOrdinal,priorCards,mask:await sharp(`${base}/moving-mask/${file}`).greyscale().raw().toBuffer(),shoeMask:await sharp(`${base}/shoe-mask/${file}`).greyscale().raw().toBuffer(),contour:m.contourNative,quad:m.quadNative};
 }
 return {raw,clip:clip as 'idle'|'approach'|'retreat',sourceFrame:index,dealOrdinal,priorCards};
}
function encoder(path:string,width:number,height:number){
 const child=spawn(ffmpeg,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','15','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);
 const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',c=>c===0?resolve():reject(Error(stderr)));});void done.catch(()=>{});
 return {async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async finish(){child.stdin.end();await done;},abort(){child.stdin.destroy();child.kill();}};
}
async function info(path:string,frames:number,width:number,height:number){
 const {stdout}=await execute(ffprobe,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{windowsHide:true,maxBuffer:5000});
 const p=JSON.parse(stdout),s=p.streams[0];
 if(s.width!==width||s.height!==height||s.avg_frame_rate!=='30/1'||Number(s.nb_read_frames)!==frames)throw Error('Output format mismatch '+path);
 return {path,sha256:hash(await readFile(path)),width,height,fps:30,frameCount:frames,duration:Number(p.format.duration)};
}
const code=await Promise.all(['src/pamela-card-contact-v5.ts','tools/pamela-local-release-proof.ts','runs/20261109-pamela-release-forensics/hand-occlusion.json',trackPath].map(async path=>({path,sha256:hash(await readFile(path))})));
await mkdir(`${run}/code`,{recursive:true});
for(const item of code){const bytes=await readFile(item.path);if(hash(bytes)!==item.sha256)throw Error('Code changed while snapshotting');await writeFile(`${run}/code/${item.path.replaceAll('/','__')}`,bytes);}
const limitations=['Lokalt kandidatprov: manuell fingermask, särskilt ruta115–116, behöver rörelsegranskas.','Ansikts-/hudskillnader kvarstår mellan separata källtagningar. Ingen ansiktsmorfning eller toning används.','Tidigare fel under utdragning och kortvändning före landning ingår inte i släppfixens godkännande.','Slutvilan behåller två kort. Hela sekvensen loopas inte tillbaka till ett tomt bord.'];
if(!process.argv.includes('--sequence')){
 const oldRender=await createPamelaCardContactV4Renderer();
 const start=96,end=133,roi={left:700,top:900,width:420,height:260};
 const files={before:`${run}/render/contact-before.mp4`,after:`${run}/render/contact-after.mp4`,source:`${run}/render/contact-source.mp4`};
 const enc=[encoder(files.before,840,520),encoder(files.after,840,520),encoder(files.source,840,520)];
 const crop=(raw:Buffer)=>sharp(raw,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(840,520,{kernel:'nearest'}).raw().toBuffer();
 const sheets:Buffer[]=[];const records:unknown[]=[];
 const keyFrames=[98,104,107,108,110,114,115,116,117,118,119,124,126,132];
 try{
  for(let f=start;f<end;f++){
   const data=await input('deal',f,1,1),before=await oldRender(data),after=await newRender(data);
   const crops=await Promise.all([crop(before.native),crop(after.native),crop(data.raw)]);
   await Promise.all(enc.map((e,i)=>e.write(crops[i])));
   let changedFace=0;for(let p=0;p<W*680*3;p++)if(before.native[p]!==after.native[p])changedFace++;
   if(changedFace)throw Error('Card experiment changed face/upper body pixels');
   records.push({sourceFrame:f,changedFaceBytes:changedFace,diagnostics:after.diagnostics});
   if(keyFrames.includes(f)){
    await sharp(after.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/after-${f}.png`);
    await sharp(before.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/before-${f}.png`);
    const label=Buffer.from(`<svg width="1260" height="28"><rect width="100%" height="100%" fill="#151c1d"/><text x="12" y="20" fill="white" font-size="16">Källruta ${f}: ORIGINAL / FÖRE V4 / EFTER V5 (samma native ROI)</text></svg>`);
    const row=await sharp({create:{width:1260,height:288,channels:3,background:'#151c1d'}}).composite([{input:label,left:0,top:0},...await Promise.all([data.raw,before.native,after.native].map(async(raw,i)=>({input:await sharp(raw,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:i*420,top:28}))) ]).png().toBuffer();
    await writeFile(`${run}/qa/comparison-${f}.png`,row);if(f>=114&&f<=119)sheets.push(row);
   }
   console.log(`contact ${f}/${end-1}`);
  }
  await Promise.all(enc.map(e=>e.finish()));
 }catch(error){enc.forEach(e=>e.abort());throw error;}
 const sheet=`${run}/qa/release-contact-sheet.png`;
 await sharp({create:{width:1260,height:288*sheets.length,channels:3,background:'#151c1d'}}).composite(sheets.map((input,i)=>({input,left:0,top:i*288}))).png().toFile(sheet);
 const outputs=await Promise.all(Object.values(files).map(p=>info(p,end-start,840,520)));
 await save(`${run}/contact-evidence.json`,{status:'candidate-awaiting-independent-review',productionAccepted:false,createdAt:new Date().toISOString(),sources:plan.sources,code,outputs,records,roi,processing:{fps:30,freeze:false,crossfade:false,interpolation:false,newPaidJobs:0}});
 await save(`${rootRun}/report.json`,{title:'Pamela · lokalt släpp- och sekvensprov',status:'Släppkandidat klar för granskning; sekvensen förbereds.',limitations,contact:{...files,frames:end-start,fps:30,startSourceFrame:start},evidence:{sheet}});
}else{
 const gate=await read(`${run}/review-gate.json`);if(!gate.renderSequence)throw Error('Review the contact candidate before the full sequence');
 const files={native:`${run}/render/idle-deal-idle-native.mp4`,portrait:`${run}/render/idle-deal-idle-portrait.mp4`};
 const enc=[encoder(files.native,W,H),encoder(files.portrait,1080,1920)];
 const checkFrames=new Set<number>([0,plan.timeline.length-1,...joins.flatMap((j:any)=>[j.outputFrame-1,j.outputFrame])]);
 let frame=0;
 try{for(const entry of plan.timeline){
  const result=await newRender(await input(entry.clip,entry.sourceFrame,entry.dealOrdinal,entry.priorCards));
  await Promise.all([enc[0].write(result.native),enc[1].write(result.portrait)]);
  if(checkFrames.has(frame))await sharp(result.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/sequence-${String(frame).padStart(4,'0')}.png`);
  if(frame%30===0)console.log(`sequence ${frame}/${plan.timeline.length}`);frame++;
 }await Promise.all(enc.map(e=>e.finish()));}catch(error){enc.forEach(e=>e.abort());throw error;}
 const outputs=await Promise.all([info(files.native,frame,W,H),info(files.portrait,frame,1080,1920)]);
 await save(`${run}/sequence-evidence.json`,{status:'local-sequence-candidate',productionAccepted:false,createdAt:new Date().toISOString(),sources:plan.sources,code,outputs,plan,processing:{fps:30,freeze:false,retime:false,crossfade:false,faceInterpolation:false,newPaidJobs:0},limits:limitations});
 const report=await read(`${rootRun}/report.json`);
 report.status='Lokalt före/efter och sammanhängande sekvens klara för granskning. Kvarvarande skarvar är markerade.';
 report.sequence={...files,frames:frame,fps:30,seams:joins.map((j:any)=>({atSeconds:j.outputSeconds,label:j.label}))};
 await save(`${rootRun}/report.json`,report);
}
