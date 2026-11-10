import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createSeat1MatteStudy,SEAT1_MATTE_SOURCE,SEAT1_MATTE_CONTRACT,SEAT1_MATTE_SIZE} from '../src/pamela-seat1-matte-study.ts';
sharp.concurrency(1);
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7)??'01';if(!/^\d{2}$/.test(take))throw Error('Unique two-digit take required');
const full=process.argv.includes('--full'),root='runs/20261109-pamela-seat1-matte-study',run=`${root}/take-${take}`,base='runs/20261109-pamela-seat-pilot-plan';
const source=`${base}/original/pamela-seat-1-wan3.mp4`,W=SEAT1_MATTE_SIZE.width,H=SEAT1_MATTE_SIZE.height,bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),execute=promisify(execFile),sourcePath=(f:number)=>`${base}/qa/seat-1/frames/frame-${String(f+1).padStart(4,'0')}.png`;
if(sha(await readFile(source))!==SEAT1_MATTE_SOURCE)throw Error('Seat1 source hash changed');
await mkdir(root,{recursive:true});await mkdir(run);for(const sub of ['qa','native','layers','masks','render','snapshot'])await mkdir(`${run}/${sub}`);
const snapshotPaths=['src/pamela-seat1-matte-study.ts','tools/pamela-seat1-matte-study.ts','src/pamela-key.ts','src/pamela-scene-renderer.ts','runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png','runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png'];
const snapshots=[];for(const path of snapshotPaths){const bytes=await readFile(path);snapshots.push({path,sha256:sha(bytes)});await writeFile(`${run}/snapshot/${path.replaceAll('/','__')}`,bytes);}
const references=[];for(const f of [...SEAT1_MATTE_CONTRACT.backgroundReferenceFrames,SEAT1_MATTE_CONTRACT.cardReferenceFrame]){const bytes=await readFile(sourcePath(f));references.push({frame:f,path:sourcePath(f),sha256:sha(bytes),raw:await sharp(bytes).removeAlpha().raw().toBuffer()});}
const {plate,stage,render}=await createSeat1MatteStudy(references.slice(0,-1).map(r=>r.raw),references.at(-1)!.raw);
const png=(data:Buffer,channels:1|3|4=3)=>sharp(data,{raw:{width:W,height:H,channels}}).png().toBuffer();
await writeFile(`${run}/qa/temporal-table-reference.png`,await png(plate));await writeFile(`${run}/qa/target-stage.png`,await png(stage));
await writeFile(`${run}/mask-contract.json`,JSON.stringify({...SEAT1_MATTE_CONTRACT,references:references.map(({raw,...r})=>r)},null,2)+'\n');
function encoder(path:string,width:number,height:number){
 const child=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','14','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let errors='';child.stderr.on('data',b=>errors+=b);const done=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(errors)));});void done.catch(()=>{});
 return {path,async write(data:Buffer){if(!child.stdin.write(data))await once(child.stdin,'drain');},async finish(){child.stdin.end();await done;},abort(){child.stdin.destroy();child.kill();}};
}
const enc=full?[encoder(`${run}/render/source-dealer-composite.mp4`,1536,370),encoder(`${run}/render/contact-source-dealer-composite.mp4`,2160,328),encoder(`${run}/render/before-after.mp4`,1280,454),encoder(`${run}/render/composite-native.mp4`,W,H)]:[];
async function row(data:Buffer[],labels:string[],width:number,height:number,roi?:{left:number;top:number;width:number;height:number}){
 const tiles=[];for(let i=0;i<data.length;i++){let s=sharp(data[i],{raw:{width:W,height:H,channels:3}});if(roi)s=s.extract(roi);tiles.push({input:await s.resize(width,height).png().toBuffer(),left:i*width,top:28});}
 const label=Buffer.from(`<svg width="${width*data.length}" height="28"><rect width="100%" height="100%" fill="#17202a"/>${labels.map((s,i)=>`<text x="${i*width+9}" y="20" fill="white" font-size="17" font-family="Arial">${s}</text>`).join('')}</svg>`);
 return sharp({create:{width:width*data.length,height:height+28,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},...tiles]).removeAlpha().raw().toBuffer();
}
const frames=full?Array.from({length:36},(_,i)=>190+i):[190,205,209,215,225],records:any[]=[],sheet:Buffer[]=[],maskSheet:Buffer[]=[];
const roi={left:40,top:740,width:720,height:300};
try{
 for(const f of frames){
  const bytes=await readFile(sourcePath(f)),raw=await sharp(bytes).removeAlpha().raw().toBuffer(),r=await render(raw,f);
  const triptych=await row([raw,r.checker,r.native],[`SOURCE ${f}`,`DEALER / HAND ${f}`,`COMPOSITE ${f}`],512,342);
  const contact=await row([raw,r.checker,r.native],[`SOURCE ${f}`,`DEALER / HAND ${f}`,`COMPOSITE ${f}`],720,300,roi);
  const comparison=await row([r.before,r.native],[`BEFORE: chroma only ${f}`,`AFTER: separated layers ${f}`],640,426);
  if(full)await Promise.all([enc[0].write(triptych),enc[1].write(contact),enc[2].write(comparison),enc[3].write(r.native)]);
  const outputs=[];for(const [name,data,channels]of [['composite',r.native,3],['dealer',r.rgba,4],['card',r.cardRgba,4],['shoe',r.shoeRgba,4]] as const){
   const path=`${run}/${name==='composite'?'native':'layers'}/${name}-${f}.png`,image=await png(data,channels);await writeFile(path,image);outputs.push({path,sha256:sha(image)});
  }
  for(const [name,data]of Object.entries(r.masks))await writeFile(`${run}/masks/${name}-${f}.png`,await png(data,1));
  await sharp(contact,{raw:{width:2160,height:328,channels:3}}).png().toFile(`${run}/qa/contact-${f}.png`);
  if(!full||[190,205,209,215,225].includes(f))await sharp(triptych,{raw:{width:1536,height:370,channels:3}}).png().toFile(`${run}/qa/full-${f}.png`);
  const crop=await sharp(r.native,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(360,150).png().toBuffer();
  const label=Buffer.from(`<svg width="360" height="24"><text x="8" y="18" fill="white" font-size="16">Source ${f} / ${(f/30).toFixed(3)} s</text></svg>`);
  sheet.push(await sharp({create:{width:360,height:174,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},{input:crop,left:0,top:24}]).png().toBuffer());
  const mask=Buffer.alloc(W*H*3);for(let p=0;p<W*H;p++){mask[p*3]=r.masks.hand[p];mask[p*3+1]=r.masks.card[p];mask[p*3+2]=r.masks.dealer[p];}
  maskSheet.push(await sharp({create:{width:360,height:174,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},{input:await sharp(mask,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(360,150).png().toBuffer(),left:0,top:24}]).png().toBuffer());
  records.push({sourceFrame:f,sourcePath:sourcePath(f),sourceFrameSha256:sha(bytes),outputs,...r.diagnostics});
  console.log(`seat1 ${f}: handCore=${r.diagnostics.safeHandPixels} handChanged=${r.diagnostics.safeHandChanged} faceChanged=${r.diagnostics.faceCoreChanged} visibleCard=${r.diagnostics.cardVisiblePixels}`);
 }
 await Promise.all(enc.map(e=>e.finish()));
}catch(error){enc.forEach(e=>e.abort());throw error;}
for(const [name,tiles]of [['composite-contact-all',sheet],['mask-contact-all',maskSheet]] as const)await sharp({create:{width:2160,height:Math.ceil(tiles.length/6)*174,channels:3,background:'#17202a'}}).composite(tiles.map((input,i)=>({input,left:i%6*360,top:Math.floor(i/6)*174}))).png().toFile(`${run}/qa/${name}.png`);
const videos=[];for(const e of enc){const {stdout}=await execute(`${bin}/ffprobe.exe`,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',e.path],{windowsHide:true,maxBuffer:6000});const probe=JSON.parse(stdout),s=probe.streams[0];if(s.avg_frame_rate!=='30/1'||Number(s.nb_read_frames)!==36)throw Error('Seat1 output timing mismatch');videos.push({path:e.path,sha256:sha(await readFile(e.path)),...s,duration:probe.format.duration});}
await writeFile(`${run}/evidence.json`,JSON.stringify({status:'local-matte-candidate-awaiting-review',createdAt:new Date().toISOString(),source:{path:source,sha256:SEAT1_MATTE_SOURCE,taskId:'8701dcbb-239d-4e60-a887-bd431e90f3d1',model:'wan3'},processing:{newPaidJobs:0,frames:frames.length,fps:30,sourceStart:frames[0],sourceEndInclusive:frames.at(-1),noRetiming:true,noSynthesizedMotion:true,coreRgbPreserved:true},snapshots,references:references.map(({raw,...r})=>r),videos,records,limits:['Bounded local study only; landing calibration and full-bank/REDO seams are not accepted.','Manual sleeve/shoe support and soft-edge colour recovery require visual motion review.','Generated source card artwork is preserved, not approved SG artwork.','Only hidden card pixels use source215 projected into the observed card support; visible post-release core uses each original source frame.','Temporal background is a median of clean-table references, not a subtracted REDO hand image.']},null,2)+'\n');
console.log(`Seat1 matte study ready: ${run}`);
