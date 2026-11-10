import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createPamelaSceneRenderer} from '../src/pamela-scene-renderer.ts';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {PAMELA_CARD_SOURCE_SHA256,pamelaCardSide,preparePamelaCardSurface} from '../src/pamela-card-surfaces.ts';

const execute=promisify(execFile),run='runs/20261109-pamela-card-side-proof',base='runs/20261109-pamela-central-composite',W=1762,H=1174;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const trackBytes=await readFile(`${base}/tracking/card-tracks.json`),tracks=JSON.parse(trackBytes.toString());
const composition=JSON.parse(await readFile(`${base}/composition.json`,'utf8'));
const movie=composition.sources.deal.path;
if(hash(await readFile(movie))!==PAMELA_CARD_SOURCE_SHA256||hash(trackBytes)!==composition.cardRendering.trackSha256||hash(await readFile(composition.output.path))!==composition.output.sha256)throw Error('Frozen source/V2/track hash mismatch');
for(const folder of ['qa','frames','render'])await mkdir(`${run}/${folder}`,{recursive:true});
const renderer=await createPamelaSceneRenderer({contact:true,retargetSecond:false,cardSurfaceFix:{sourceSha256:PAMELA_CARD_SOURCE_SHA256}});
const control=await createPamelaSceneRenderer({contact:true,retargetSecond:false});
const records:any[]=[];
const critical=[48,64,74,76,77,78,80,84,98];
async function inputFrame(index:number){
 const name=`frame-${String(index+1).padStart(3,'0')}.png`,path=`runs/20261109-pamela-sequence/qa/central-base/${name}`,bytes=await readFile(path);
 if(hash(bytes)!==tracks.frames[index].frameSha256)throw Error(`Native source changed: ${index}`);
 const raw=await sharp(bytes).removeAlpha().raw().toBuffer(),mask=await sharp(`${base}/tracking/moving-mask/${name}`).greyscale().raw().toBuffer(),measurement=tracks.frames[index].moving;
 return {raw,mask,clip:'deal' as const,sourceFrame:index,dealOrdinal:0,priorCards:0,contour:measurement.contourNative,quad:measurement.quadNative,sourceFrameSha256:hash(bytes)};
}
if(!process.argv.includes('--render')){
for(const index of critical){
 const input=await inputFrame(index),result=await renderer(input),file=String(index).padStart(3,'0');
 const legacyFrame=index+87,legacy=await execute('ffmpeg',['-v','error','-nostdin','-i',composition.output.path,'-vf',`select=eq(n\\,${legacyFrame})`,'-frames:v','1','-threads','4','-f','image2pipe','-vcodec','png','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024*1024});
 await writeFile(`${run}/frames/v2-${file}.png`,legacy.stdout);
 await sharp(input.raw,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/frames/original-${file}.png`);
 await sharp(result.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/frames/candidate-${file}.png`);
 await sharp(result.portrait,{raw:{width:1080,height:1920,channels:3}}).png().toFile(`${run}/frames/portrait-${file}.png`);
 const surface=preparePamelaCardSurface({sourceRGB:input.raw,visibleMask:input.mask,width:W,height:H,sourceFrameIndex:index,sourceSha256:PAMELA_CARD_SOURCE_SHA256}),keyed=keyPamelaFrame(input.raw,W,H);
 let erasedCoreBefore=0,erasedCoreAfter=0,legacyRailOverlap=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x;if(surface.coverage[p]===1){if(keyed.alpha[p]<.5)erasedCoreBefore++;if(Math.max(keyed.alpha[p],surface.coverage[p])<.5)erasedCoreAfter++;}if(input.mask[p]&&x>=840&&x<1066&&y>=817&&y<838)legacyRailOverlap++;}
 let outsideMaskChanged:number|null=null;
 if([48,76,84].includes(index)){const unchanged=await control(input);outsideMaskChanged=0;for(let p=0;p<W*H;p++)if(!input.mask[p]&&(unchanged.native[p*3]!==result.native[p*3]||unchanged.native[p*3+1]!==result.native[p*3+1]||unchanged.native[p*3+2]!==result.native[p*3+2]))outsideMaskChanged++;if(outsideMaskChanged)throw Error('Opt-in changed pixels outside observed card mask');}
 const box=tracks.frames[index].moving.bbox,crop={left:Math.max(0,Math.min(W-430,box.left-100)),top:Math.max(0,Math.min(H-330,box.top-105)),width:430,height:330};
 const panels=[];
 for(const [pixels,label] of [[input.raw,`SOURCE ${index} | unprinted`],[await sharp(legacy.stdout).removeAlpha().raw().toBuffer(),`V2 output ${legacyFrame}`],[result.native,`CANDIDATE ${index} | ${surface.side.side}`]] as [Buffer,string][]){
  const picture=await sharp(pixels,{raw:{width:W,height:H,channels:3}}).extract(crop).png().toBuffer();
  const labelSvg=Buffer.from(`<svg width="430" height="28"><rect width="430" height="28" fill="#10191c"/><text x="8" y="20" fill="white" font-family="Arial" font-size="16">${label}</text></svg>`);
  panels.push(await sharp({create:{width:430,height:358,channels:3,background:'#10191c'}}).composite([{input:labelSvg,left:0,top:0},{input:picture,left:0,top:28}]).png().toBuffer());
 }
 await sharp({create:{width:1290,height:358,channels:3,background:'#10191c'}}).composite(panels.map((input,i)=>({input,left:i*430,top:0}))).png().toFile(`${run}/qa/proof-${file}.png`);
 records.push({sourceFrameIndex:index,sourceFrameSha256:input.sourceFrameSha256,sourceMaskSha256:tracks.frames[index].moving.maskSha256,legacyOutputFrame:legacyFrame,legacyOutputSeconds:legacyFrame/30,sourceSeconds:index/30,side:surface.side,alpha:{erasedCoreBefore,erasedCoreAfter,supportExpansionPixels:0},legacyRailOverlap,outsideMaskChanged,diagnostics:result.diagnostics,proof:`${run}/qa/proof-${file}.png`});
 console.log(JSON.stringify({index,side:surface.side.side,erasedCoreBefore,erasedCoreAfter,legacyRailOverlap,outsideMaskChanged}));
}
for(const [i,indices] of [[1,[48,74,76]],[2,[77,80,84]],[3,[64,78,98]]] as [number,number[]][]){
 await sharp({create:{width:1290,height:1074,channels:3,background:'#10191c'}}).composite(indices.map((index,row)=>({input:`${run}/qa/proof-${String(index).padStart(3,'0')}.png`,left:0,top:row*358}))).png().toFile(`${run}/qa/contact-${i}.png`);
}
const perFrame=tracks.frames.map((f:any)=>({...pamelaCardSide(f.sourceFrameIndex??f.frameIndex,Boolean(f.moving.areaPx)),maskPath:f.moving.maskPath,maskSha256:f.moving.maskSha256}));
await writeFile(`${run}/side-contract.json`,JSON.stringify({schemaVersion:1,status:'authored-side-candidate-not-physical-side-measurement',source:{path:movie,sha256:PAMELA_CARD_SOURCE_SHA256,width:W,height:H,fps:30,frameCount:180},frames:perFrame,limits:['Blank prop has no printed front/back identifier. Labels combine observed handling and requested face-down extraction.','UNKNOWN is retained through edge-on/occluded handoff and the uncertain turn; no front is selected merely because a polygon exists.','No hidden corners, opaque rectangle or hand reconstruction. Masks contain only previously observed support.']},null,2)+'\n');
await writeFile(`${run}/proof-report.json`,JSON.stringify({schemaVersion:1,status:'critical-proofs-awaiting-visual-review',sourceSha256:PAMELA_CARD_SOURCE_SHA256,trackSha256:hash(trackBytes),baseline:composition.output,code:await Promise.all(['src/pamela-card-surfaces.ts','src/pamela-scene-renderer.ts','tools/pamela-card-side-proof.ts'].map(async path=>({path,sha256:hash(await readFile(path))}))),defaultBehavior:'Opt-in absent preserves previous renderer behavior. The frozen V2 uses an older fixed-rail pass; candidate uses existing contact:true scene path.',observations:records,unresolved:['Airborne printed UVs are inferred support mapping, not measured hidden corners or 3D rigidity.','Source green-reflection confidence is not optical transparency. Only observed eroded support becomes opaque; uncertain boundary remains conservative.','Full timeline and side timing require review before publication.']},null,2)+'\n');
console.log(JSON.stringify({run,proofs:critical.length,sideFrames:perFrame.length}));
}else{
 const proofReport=JSON.parse(await readFile(`${run}/proof-report.json`,'utf8'));
 if(proofReport.sourceSha256!==PAMELA_CARD_SOURCE_SHA256||proofReport.observations.length!==9)throw Error('Critical proofs missing or for another source');
 const code=await Promise.all(['src/pamela-card-surfaces.ts','src/pamela-scene-renderer.ts','src/pamela-key.ts','src/pamela-contact-shadow.ts','tools/pamela-card-side-proof.ts'].map(async path=>({path,sha256:hash(await readFile(path))})));
 for(const source of Object.values(composition.sources) as any[])if(hash(await readFile(source.path))!==source.sha256)throw Error('Source movie changed');
 const timeline=composition.timeline;
 if(timeline.length!==520)throw Error('Expected exact frozen 520-frame V2 timeline');
 const nativePath=`${run}/render/pamela-two-deals-native-v3-card-sides.mp4`,portraitPath=`${run}/render/pamela-two-deals-portrait-v3-card-sides.mp4`;
 function encoder(path:string,width:number,height:number){
  const ff=spawn('ffmpeg',['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','15','-preset','fast','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart','-n',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let errors='';ff.stderr.on('data',d=>errors+=d.toString());
  const done=new Promise<void>((resolve,reject)=>{ff.once('error',reject);ff.once('close',exit=>exit===0?resolve():reject(Error(errors||`ffmpeg exit ${exit}`)));});void done.catch(()=>{});
  return {async write(pixels:Buffer){if(!ff.stdin.write(pixels))await once(ff.stdin,'drain');},async finish(){ff.stdin.end();await done;}};
 }
 const native=encoder(nativePath,W,H),portrait=encoder(portraitPath,1080,1920),frameRecords=[];
 const qaOutputs=[0,89,90,123,135,151,161,163,164,165,166,167,171,185,204,205,206,266,267,284,298,314,324,326,327,328,329,330,334,348,367,368,369,429,430,519];
 const frameArtifacts:string[]=[];
 try{
  for(let outputFrame=0;outputFrame<timeline.length;outputFrame++){
   const entry=timeline[outputFrame],source=composition.sources[entry.clip];
   const input=entry.clip==='deal'?await inputFrame(entry.sourceFrame):{raw:await sharp(`${source.dir}/frame-${String(entry.sourceFrame+1).padStart(3,'0')}.png`).removeAlpha().raw().toBuffer(),clip:entry.clip,sourceFrame:entry.sourceFrame};
   const result=await renderer({...input,dealOrdinal:entry.dealNumber,priorCards:entry.priorCards});
   await Promise.all([native.write(result.native),portrait.write(result.portrait)]);
   if(qaOutputs.includes(outputFrame)){
    const label=String(outputFrame).padStart(3,'0');
    for(const [path,pixels,width,height] of [[`${run}/qa/sequence-${label}.png`,result.native,W,H],[`${run}/qa/portrait-sequence-${label}.png`,result.portrait,1080,1920]] as [string,Buffer,number,number][]){await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile(path);frameArtifacts.push(path);}
   }
   frameRecords.push({...entry,outputFrame,outputSeconds:outputFrame/30,sourceSeconds:entry.sourceFrame/30,sourceSha256:source.sha256,cardSide:result.diagnostics.cardSurface,extendedMaskPixels:result.diagnostics.extendedMaskPixels,contactDiagnostics:result.diagnostics.contact?{skinChanged:result.diagnostics.contact.skinChanged,protectedSleeveChanged:result.diagnostics.contact.protectedSleeveChanged,shadowOnForeground:result.diagnostics.contact.shadowOnForeground,occludedPixels:result.diagnostics.contact.occludedPixels}:null});
   if(outputFrame%40===0)console.log(`central-v3 ${outputFrame}/520`);
  }
 }finally{await Promise.all([native.finish(),portrait.finish()]);}
 async function inspect(path:string,expectedFrames:number,expectedWidth:number,expectedHeight:number){
  const {stdout}=await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,r_frame_rate,nb_read_frames:format=duration','-of','json',path],{windowsHide:true,maxBuffer:5000});
  const p=JSON.parse(stdout),s=p.streams[0];
  if(Number(s.nb_read_frames)!==expectedFrames||s.avg_frame_rate!=='30/1'||s.width!==expectedWidth||s.height!==expectedHeight||Math.abs(Number(p.format.duration)-expectedFrames/30)>.001)throw Error(`Output timing/plane mismatch: ${path}`);
  const bytes=await readFile(path);return {path,sha256:hash(bytes),bytes:bytes.length,width:s.width,height:s.height,fps:30,frameCount:expectedFrames,duration:Number(p.format.duration)};
 }
 const outputs=[{role:'full-native',...await inspect(nativePath,520,W,H)},{role:'full-portrait',...await inspect(portraitPath,520,1080,1920)}];
 const excerptPath=`${run}/render/pamela-card-turn-native-30fps.mp4`;
 await execute('ffmpeg',['-v','error','-nostdin','-i',nativePath,'-vf','trim=start_frame=123:end_frame=189,setpts=PTS-STARTPTS','-an','-c:v','libx264','-crf','0','-preset','fast','-pix_fmt','yuv420p','-threads','4','-fps_mode','passthrough','-movflags','+faststart','-n',excerptPath],{windowsHide:true,maxBuffer:5000});
 outputs.push({role:'card-turn-excerpt',...await inspect(excerptPath,66,W,H)});
 for(const item of code)if(hash(await readFile(item.path))!==item.sha256)throw Error(`Renderer code changed during export: ${item.path}`);
 for(const source of Object.values(composition.sources) as any[])if(hash(await readFile(source.path))!==source.sha256)throw Error('Source changed during export');
 const artifacts=[`${run}/side-contract.json`,`${run}/proof-report.json`,...critical.map(index=>`${run}/qa/proof-${String(index).padStart(3,'0')}.png`),...[1,2,3].map(n=>`${run}/qa/contact-${n}.png`),...frameArtifacts,...outputs.map(o=>o.path)];
 const report={schemaVersion:1,status:'central-v3-card-side-candidate-pending-full-motion-review',productionAccepted:false,activated:false,createdAt:new Date().toISOString(),sourceVersion:composition.output,sourceHashes:composition.sources,track:{path:`${base}/tracking/card-tracks.json`,sha256:hash(trackBytes)},outputs,artifacts,code,timeline:frameRecords,joins:composition.joins,processing:{canvas:{width:W,height:H,fps:30},frameCount:520,freeze:false,crossfade:false,retime:false,cardSurfaceFix:true,contact:true,retargetSecond:false,landedOffsets:[0,0],sameLandingQuad:composition.cardRendering.landedQuad,excerptMapping:{outputFrames:[0,65],fullSequenceFrames:[123,188],sourceClip:'deal',sourceFrames:[36,101]}},verified:{criticalFrames:critical,changedPixelsOutsideOriginalMask:{measuredFrames:[48,76,84],count:0,comparison:'Opt-in enabled versus disabled in the same modern renderer with contact:true. Not a comparison against frozen V2.'},oldV2RailChange:'Separately replaces old fixed post-composite rail with the existing contact:true scene path; no claim that missing original torso pixels were recovered.'},limitations:['Frames 76–78 retain conservative green boundary and compressed artwork mapping.','UNKNOWN side during 54–73 and79; preserve observed surface without inventing a front.','Source paper is unprinted: authored side labels are not physical printed-side measurements.','Only measured mask support is protected; hidden corners, missing underside boundaries and full hand masks are not fabricated.','Original torso pixels are missing below its source cutoff. Contact:true is an occlusion candidate, not reconstruction.','Persistent C1 and C2 stay at the same previously established landing quad. No C2 offset or hand retargeting.','Airborne homography remains inferred artwork support on a bent source card; no rigid 3D tracking claimed.','Full motion, skin edges and lighting are candidates for root/user review.']};
 await writeFile(`${run}/composition.json`,JSON.stringify(report,null,2)+'\n');
 await writeFile(`${run}/report.json`,JSON.stringify({...report,timeline:{path:`${run}/composition.json`,frameCount:520}},null,2)+'\n');
 console.log(JSON.stringify({outputs,report:`${run}/report.json`}));
}
