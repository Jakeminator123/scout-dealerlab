import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import sharp from 'sharp';
import {createPamelaCardContactV4Renderer} from '../src/pamela-card-contact-v4.ts';
import {retargetPamelaC2Frame,PAMELA_C2_SOURCE_SHA256} from '../src/pamela-c2-retarget.ts';
const run='runs/20261109-pamela-card-contact-v4',base='runs/20261109-pamela-central-composite',v3Run='runs/20261109-pamela-card-side-proof',W=1762,H=1174;
const bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const ffmpeg=`${bin}/ffmpeg.exe`,ffprobe=`${bin}/ffprobe.exe`,execute=promisify(execFile),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
sharp.concurrency(1);
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const v3=await read(`${v3Run}/composition.json`),trackBytes=await readFile(`${base}/tracking/card-tracks.json`),tracks=JSON.parse(trackBytes.toString());
for(const s of Object.values(v3.sources) as any[])if(hash(await readFile(s.path))!==s.sha256)throw Error('Source movie mismatch');
if(hash(await readFile(v3.output.path))!==v3.output.sha256||hash(trackBytes)!==v3.track.sha256)throw Error('V3 or tracks changed');
const sharedRendererHash=hash(await readFile('src/pamela-scene-renderer.ts'));
for(const dir of ['qa','frames','render'])await mkdir(`${run}/${dir}`,{recursive:true});
const renderer=await createPamelaCardContactV4Renderer();
async function inputFrame(clip:string,index:number,ordinal=0,priorCards=0){
 const source=v3.sources[clip],file=`frame-${String(index+1).padStart(3,'0')}.png`,bytes=await readFile(`${source.dir}/${file}`),raw=await sharp(bytes).removeAlpha().raw().toBuffer();
 if(clip==='deal'){
  if(hash(bytes)!==tracks.frames[index].frameSha256)throw Error(`Source PNG mismatch ${index}`);
  const m=tracks.frames[index].moving,mask=await sharp(`${base}/tracking/moving-mask/${file}`).greyscale().raw().toBuffer(),shoeMask=await sharp(`${base}/tracking/shoe-mask/${file}`).greyscale().raw().toBuffer();
  return {raw,clip:'deal' as const,sourceFrame:index,dealOrdinal:ordinal,priorCards,mask,shoeMask,contour:m.contourNative,quad:m.quadNative};
 }
 return {raw,clip:clip as 'approach'|'retreat',sourceFrame:index,dealOrdinal:ordinal,priorCards};
}
async function info(path:string,expectedFrames:number,width:number,height:number){
 const {stdout}=await execute(ffprobe,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{windowsHide:true,maxBuffer:5000});
 const p=JSON.parse(stdout),s=p.streams[0];if(s.width!==width||s.height!==height||s.avg_frame_rate!=='30/1'||Number(s.nb_read_frames)!==expectedFrames||Math.abs(Number(p.format.duration)-expectedFrames/30)>.001)throw Error('Timing/plane mismatch');
 const bytes=await readFile(path);return {path,sha256:hash(bytes),bytes:bytes.length,width,height,fps:30,frameCount:expectedFrames,duration:Number(p.format.duration)};
}
const code=await Promise.all(['src/pamela-card-contact-v4.ts','src/pamela-c2-retarget.ts','src/pamela-card-surfaces.ts','src/pamela-key.ts','src/pamela-contact-shadow.ts','tools/pamela-card-contact-v4.ts'].map(async path=>({path,sha256:hash(await readFile(path))})));
const save=(p:string,v:any)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
if(!process.argv.includes('--render')){
 // Full local-motion safety preflight is cheap compared with a failed encode.
 const safety=[];
 for(let f=77;f<180;f++){
  const input=await inputFrame('deal',f),warp=retargetPamelaC2Frame({sourceRGB:input.raw,visibleCardMask:input.mask!,width:W,height:H,sourceFrameIndex:f,sourceSha256:PAMELA_C2_SOURCE_SHA256,contourNative:input.contour});
  let changedUpperBytes=0;for(let i=0;i<680*W*3;i++)if(warp.rgb[i]!==input.raw[i])changedUpperBytes++;
  if(changedUpperBytes||warp.diagnostics.maxObservedCardShiftErrorPixels>1e-6)throw Error('Retarget invariants failed');
  safety.push({sourceFrameIndex:f,...warp.diagnostics,changedUpperBytes});
 }
 await save(`${run}/preflight.json`,{status:'103-source-frames-pass-no-fold-and-fixed-card-invariants',sourceSha256:PAMELA_C2_SOURCE_SHA256,returnWindow:[118,124],minimumJacobian:Math.min(...safety.map(r=>r.minimumHorizontalJacobianBound)),frames:safety});
 const indices=[48,76,84,98,114,118,119,120,122,124,126,132,145,179],records=[];
 for(const f of indices){
  const input=await inputFrame('deal',f,1,1),result=await renderer(input),n=String(f).padStart(3,'0'),v3Frame=f+250;
  const old=await execute(ffmpeg,['-v','error','-nostdin','-i',v3.output.path,'-vf',`select=eq(n\\,${v3Frame})`,'-frames:v','1','-threads','1','-f','image2pipe','-vcodec','png','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024*1024});
  await sharp(result.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/frames/v4-${n}.png`);
  await sharp(result.portrait,{raw:{width:1080,height:1920,channels:3}}).png().toFile(`${run}/frames/portrait-${n}.png`);
  await writeFile(`${run}/frames/v3-${n}.png`,old.stdout);
  const crop={left:550,top:640,width:610,height:485},panels=[];
  for(const [pixels,label] of [[input.raw,`SOURCE ${f}`],[await sharp(old.stdout).removeAlpha().raw().toBuffer(),`V3 frame ${v3Frame} | coincident cards`],[result.native,`V4 source ${f} | C2 +46`]] as [Buffer,string][]){
   const photo=await sharp(pixels,{raw:{width:W,height:H,channels:3}}).extract(crop).png().toBuffer(),svg=Buffer.from(`<svg width="610" height="28"><rect width="610" height="28" fill="#10191c"/><text x="8" y="20" font-size="16" fill="white" font-family="Arial">${label}</text></svg>`);
   panels.push(await sharp({create:{width:610,height:513,channels:3,background:'#10191c'}}).composite([{input:photo,left:0,top:28},{input:svg,left:0,top:0}]).png().toBuffer());
  }
  await sharp({create:{width:1830,height:513,channels:3,background:'#10191c'}}).composite(panels.map((input,i)=>({input,left:i*610,top:0}))).png().toFile(`${run}/qa/proof-${n}.png`);
  records.push({sourceFrameIndex:f,v3OutputFrame:v3Frame,diagnostics:result.diagnostics,proof:`${run}/qa/proof-${n}.png`});console.log(`critical ${f}`);
 }
 for(const [name,frames] of [['contact',[84,98,114,118]],['return',[119,120,122,124,126,132]],['landed',[145,179]]] as [string,number[]][]){const rows=await Promise.all(frames.map(f=>sharp(`${run}/qa/proof-${String(f).padStart(3,'0')}.png`).resize(915,257).png().toBuffer()));await sharp({create:{width:915,height:257*rows.length,channels:3,background:'#10191c'}}).composite(rows.map((input,i)=>({input,left:0,top:i*257}))).png().toFile(`${run}/qa/${name}-contact-sheet.png`);}
 await save(`${run}/critical-report.json`,{status:'awaiting-visual-gate',sourceSha256:PAMELA_C2_SOURCE_SHA256,baseline:v3.output,code,records,placement:{card1:[[820,1026],[943,1026],[963,1093],[802,1093]],card2:[[866,1026],[989,1026],[1009,1093],[848,1093]],offsetPixels:[46,0],overlapAreaPercent:67.6056338028169,afterReleaseTranslation:false},limits:['Hand/forearm deformation and6-frame free-hand return are inferred presentation controls, not a newly recorded movement.','Artwork uses bilinear sampling and larger corner indices; physical 3D bend/hidden corners remain unmeasured.','Shoe back uses observed shoe-card pixels, not a white rectangle or full shoe replacement.']});
}else{
 const gate=await read(`${run}/critical-gate.json`);if(gate.verdict!=='continue-v4-candidate')throw Error('Visual gate not passed');
 const nativePath=`${run}/render/pamela-two-deals-native-v4.mp4`,portraitPath=`${run}/render/pamela-two-deals-portrait-v4.mp4`;
 function encoder(path:string,width:number,height:number){const ff=spawn(ffmpeg,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','15','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-n',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';ff.stderr.on('data',d=>errors+=d);const done=new Promise<void>((resolve,reject)=>{ff.once('error',reject);ff.once('close',c=>c===0?resolve():reject(Error(errors)));});void done.catch(()=>{});return {async write(b:Buffer){if(!ff.stdin.write(b))await once(ff.stdin,'drain');},async finish(){ff.stdin.end();await done;}};}
 const native=encoder(nativePath,W,H),portrait=encoder(portraitPath,1080,1920),timeline=[],artifacts:string[]=[];
 const selected=[0,89,90,123,135,161,163,167,171,185,205,266,267,298,326,334,348,364,368,369,370,372,374,376,382,395,429,430,519];
 try{for(let frame=0;frame<v3.timeline.length;frame++){const entry=v3.timeline[frame],input=await inputFrame(entry.clip,entry.sourceFrame,entry.dealNumber,entry.priorCards),result=await renderer(input);await Promise.all([native.write(result.native),portrait.write(result.portrait)]);
  if(selected.includes(frame))for(const [path,pixels,width,height] of [[`${run}/qa/sequence-${String(frame).padStart(3,'0')}.png`,result.native,W,H],[`${run}/qa/portrait-sequence-${String(frame).padStart(3,'0')}.png`,result.portrait,1080,1920]] as [string,Buffer,number,number][]){await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile(path);artifacts.push(path);}
  timeline.push({clip:entry.clip,sourceFrame:entry.sourceFrame,dealNumber:entry.dealNumber,priorCards:entry.priorCards,outputFrame:frame,outputSeconds:frame/30,sourceSeconds:entry.sourceFrame/30,sourceSha256:v3.sources[entry.clip].sha256,side:result.diagnostics.cardSurface,warp:result.diagnostics.warp,shoe:result.diagnostics.shoe});if(frame%40===0)console.log(`v4 ${frame}/520`);
 }}finally{await Promise.all([native.finish(),portrait.finish()]);}
 const output=await info(nativePath,520,W,H),portraitOutput={...await info(portraitPath,520,1080,1920),poster:`${run}/qa/portrait-sequence-000.png`,projection:v3.portrait.projection};
 const excerpt=`${run}/render/c2-contact-and-return-v4.mp4`;
 await execute(ffmpeg,['-v','error','-nostdin','-i',nativePath,'-vf','trim=start_frame=327:end_frame=396,setpts=PTS-STARTPTS','-an','-c:v','libx264','-crf','0','-preset','fast','-pix_fmt','yuv420p','-threads','2','-fps_mode','passthrough','-movflags','+faststart','-n',excerpt],{windowsHide:true,maxBuffer:5000});
 const contactExcerpt=await info(excerpt,69,W,H);
 for(const c of code)if(hash(await readFile(c.path))!==c.sha256)throw Error(`Code changed during export: ${c.path}`);
 if(hash(await readFile('src/pamela-scene-renderer.ts'))!==sharedRendererHash)throw Error('Shared renderer changed externally');
 for(const s of Object.values(v3.sources) as any[])if(hash(await readFile(s.path))!==s.sha256)throw Error('Source changed during export');
 const critical=await read(`${run}/critical-report.json`);artifacts.push(`${run}/preflight.json`,`${run}/critical-report.json`,...critical.records.map((r:any)=>r.proof),...['contact','return','landed'].map(n=>`${run}/qa/${n}-contact-sheet.png`),output.path,portraitOutput.path,excerpt);
 const report={schemaVersion:1,status:'v4-candidate-pending-root-review',productionAccepted:false,activated:false,createdAt:new Date().toISOString(),output,portrait:portraitOutput,raw:v3.raw,poster:`${run}/qa/sequence-000.png`,outputs:[output,portraitOutput,contactExcerpt],artifacts,sources:v3.sources,baseline:v3.output,track:{path:`${base}/tracking/card-tracks.json`,sha256:hash(trackBytes)},code,sharedRendererHash,sharedRendererUnchanged:true,timeline,joins:v3.joins,placement:critical.placement,processing:{fps:30,frameCount:520,freeze:false,retime:false,crossfade:false,cardSideContract:`${v3Run}/side-contract.json`,c2LocalWarp:true,handReturn:[118,124],postReleaseCardMotion:false,shoeBackReplacement:true,workers:{ffmpegPerOutput:1,totalEncoders:2,sharp:1}},visualGate:gate,limits:critical.limits.concat(['Source76–78 still has uncertain green boundary and compressed 2D artwork.','Shoe mask is a visible colour segmentation; grip-occluded pixels remain original.','Rank indices are larger and both geometrically exposed, but full/mobile playback legibility requires review.','Native torso cutoff and general key fringes remain source/composition limitations.'])};
 const compatibleReport={...report,comparisonSheets:['contact','return','landed'].map(n=>`${run}/qa/${n}-contact-sheet.png`),placement:{...report.placement,overlapPercent:report.placement.overlapAreaPercent,rankVisibility:{card1:'A spade upper-left visible',card2:'K heart upper-left and lower-right visible',verified:'Native and 1080x1920 portrait stills at source179; temporal playback remains reviewable candidate'}},limitations:report.limits,rawReference:'Unchanged V2 source concatenation; raw does not contain the inferred V4 hand/card warp.'};
 await save(`${run}/composition.json`,compatibleReport);await save(`${run}/report.json`,{...compatibleReport,timeline:{path:`${run}/composition.json`,frameCount:520}});console.log(JSON.stringify({output,portrait:portraitOutput,contactExcerpt}));
}
