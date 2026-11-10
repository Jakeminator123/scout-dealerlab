/** Local source-bound authored side-policy probe. Never changes frozen coverage. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {openFrozenMaterialTrack,checkedMaterialBytes,type FrozenMaterialSelection,type FrozenRef} from '../src/pamela-frozen-material-track.ts';
import {PAMELA_SG_BACK_SVG} from '../src/pamela-card-surfaces.ts';
const run='runs/20261109-pamela-authored-flip-probe/take-01',W=1762,H=1174;
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),ref=async(path:string)=>({path,sha256:hash(await readFile(path))}),read=async(path:string)=>JSON.parse(await readFile(path,'utf8')),json=(x:unknown)=>JSON.stringify(x,null,2)+'\n';
sharp.concurrency(1);
const label=(s:string,w:number)=>Buffer.from(`<svg width="${w}" height="24"><rect width="100%" height="100%" fill="#15202a"/><text x="6" y="17" font-family="Arial" font-size="13" fill="white">${s}</text></svg>`);
function roi(q:number[][],size=220){const x=q.reduce((s,p)=>s+p[0],0)/4,y=q.reduce((s,p)=>s+p[1],0)/4;return{left:Math.max(0,Math.min(W-size,Math.round(x-size/2))),top:Math.max(0,Math.min(H-size,Math.round(y-size/2))),width:size,height:size};}
if(process.argv[2]==='--survey'){
 await mkdir('runs/20261109-pamela-authored-flip-probe',{recursive:true});await mkdir(run);await mkdir(run+'/survey');await mkdir(run+'/snapshot');
 const registry=await ref('references/pamela-material-selections.json'),surfaces=await ref('runs/20261109-pamela-c2-card-surfaces/take-01/surfaces.json'),r=await read(registry.path),s=await read(surfaces.path),jobs=[];
 const backPath=run+'/SG-back.png';await sharp(Buffer.from(PAMELA_SG_BACK_SVG)).removeAlpha().png().toFile(backPath);
 for(const seat of[1,7]){
  const selection=r.entries.find((x:any)=>x.id===`C1-P${seat}`) as FrozenMaterialSelection;assert.equal(selection.kind,'edge');
  const e=JSON.parse((await checkedMaterialBytes(selection.evidence)).toString());await checkedMaterialBytes(selection.review);await checkedMaterialBytes(e.source);assert.equal(e.records.length,360);
  const front=s.results.find((x:any)=>x.seat===seat).layers[0].material as FrozenRef;await checkedMaterialBytes(front);
  const nums=seat===1?Array.from({length:29},(_,i)=>50+i*5):Array.from({length:21},(_,i)=>60+i*3),tiles=[],sources=[];
  for(let i=0;i<nums.length;i++){
   const f=nums[i],record=e.records[f],path=`${e.source.frameDirectory}/frame-${String(f).padStart(4,'0')}.png`,bytes=await readFile(path);assert.equal(hash(bytes),record.sourcePngSha256);const crop=roi(record.quad),p={left:i%5*220,top:Math.floor(i/5)*244};
   tiles.push({input:label(`P${seat} f${f} / original`,220),...p},{input:await sharp(bytes).extract(crop).png().toBuffer(),left:p.left,top:p.top+24});sources.push({frame:f,path,sha256:hash(bytes),roi:crop});
  }
  const path=`${run}/survey/P${seat}-original-native.png`;await sharp({create:{width:1100,height:Math.ceil(nums.length/5)*244,channels:3,background:'#15202a'}}).composite(tiles).png().toFile(path);
  jobs.push({seat,selection,source:e.source,front,back:await ref(backPath),sourceSurvey:sources,sheet:await ref(path),coverageTimeline:e.records.map((v:any)=>({frame:v.sourceFrame,visiblePixels:v.coverageOpaquePixels+v.coverageEdgePixels,quad:v.quad})),physicalObservedSide:'UNKNOWN',authoredSidePolicy:'NOT_SELECTED_PENDING_NATIVE_VISUAL_REVIEW'});
 }
 const code=[];for(const path of['tools/pamela-authored-flip-probe.ts','src/pamela-frozen-material-track.ts','src/pamela-paper-material.ts','src/pamela-edge-card-track.ts','src/pamela-card-surfaces.ts']){code.push(await ref(path));await copyFile(path,run+'/snapshot/'+path.replaceAll('/','-'));}
 await writeFile(run+'/survey.json',json({registry,surfaces,code,jobs,apiCalls:0,coverageModified:false,physicalObservedSide:'UNKNOWN',runtimeAccepted:false}),{flag:'wx'});console.log(json({survey:await ref(run+'/survey.json')}));
}else if(process.argv[2]==='--compare'){
 const survey=await read(run+'/survey.json');await checkedMaterialBytes(survey.registry);await checkedMaterialBytes(survey.surfaces);await mkdir(run+'/comparison');
 const code=[];for(const path of['tools/pamela-authored-flip-probe.ts','src/pamela-frozen-material-track.ts','src/pamela-paper-material.ts','src/pamela-edge-card-track.ts','src/pamela-card-surfaces.ts']){code.push(await ref(path));await copyFile(path,run+'/snapshot/compare-'+path.replaceAll('/','-'));}
 const results=[];
 for(const job of survey.jobs){
  const e=JSON.parse((await checkedMaterialBytes(job.selection.evidence)).toString()),front=await openFrozenMaterialTrack(job.selection,job.front),back=await openFrozenMaterialTrack(job.selection,job.back),nums=job.seat===1?[70,90,110,130,150]:Array.from({length:27},(_,i)=>84+i),records=[],sheets=[],tiles=[];
  const movie=job.seat===7?`${run}/comparison/P7-material-selection-no-flip.mp4`:null;
  const encoder=movie?spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pix_fmt','rgb24','-s','1440x444','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',movie],{windowsHide:true,stdio:['pipe','ignore','pipe']}):null;
  let stderr='';encoder?.stderr.on('data',b=>stderr+=b);encoder?.stdin.on('error',()=>{});const done=encoder?once(encoder,'close'):null;
  try{for(let i=0;i<nums.length;i++){
   const f=nums[i],a=await front.frame(f),b=await back.frame(f),r=e.records[f];assert.deepEqual(a.original,b.original);assert.deepEqual(a.paper,b.paper);
   const guardRef=r.masks.find((m:any)=>m.type==='hand-guards'),coverageRef=r.masks.find((m:any)=>m.type==='coverage');
   const guard=await sharp(await checkedMaterialBytes(guardRef)).greyscale().raw().toBuffer(),coverage=await sharp(await checkedMaterialBytes(coverageRef)).greyscale().raw().toBuffer();assert.deepEqual(a.paper,coverage);
   const mask=Buffer.alloc(W*H*3);let outside=0,protectedChanges=0,sideDifference=0,visible=0;
   for(let p=0;p<W*H;p++){const k=p*3;mask[k+1]=coverage[p];mask[k+2]=guard[p];if(coverage[p])visible++;let changed=false,difference=false;for(let c=0;c<3;c++){changed ||=a.printed[k+c]!==a.original[k+c]||b.printed[k+c]!==a.original[k+c];difference ||=a.printed[k+c]!==b.printed[k+c];}if(changed&&!coverage[p])outside++;if(changed&&guard[p])protectedChanges++;if(difference)sideDifference++;}
   assert.equal(outside,0);assert.equal(protectedChanges,0);const crop=roi(r.quad),row=i%6;tiles.push({input:label(`P${job.seat} f${f} ORIGINAL | SG BACK | CANONICAL FRONT | COVERAGE/GUARD`,880),left:0,top:row*244});
   for(const[j,data]of[a.original,b.printed,a.printed,mask].entries())tiles.push({input:await sharp(data,{raw:{width:W,height:H,channels:3}}).extract(crop).png().toBuffer(),left:j*220,top:row*244+24});
   if(row===5||i===nums.length-1){const path=`${run}/comparison/P${job.seat}-native-${nums[i-row]}.png`;await sharp({create:{width:880,height:(row+1)*244,channels:3,background:'#15202a'}}).composite(tiles).png().toFile(path);sheets.push(await ref(path));tiles.length=0;}
   if(encoder){const region={left:1210,top:620,width:480,height:420},parts=[{input:label(`P7 source f${f}: ORIGINAL | SG BACK | CANONICAL FRONT / SELECTION ONLY, NO SIDE SWITCH`,1440),left:0,top:0}];for(const[j,data]of[a.original,b.printed,a.printed].entries())parts.push({input:await sharp(data,{raw:{width:W,height:H,channels:3}}).extract(region).png().toBuffer(),left:j*480,top:24});const frame=await sharp({create:{width:1440,height:444,channels:3,background:'#15202a'}}).composite(parts).removeAlpha().raw().toBuffer();if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');}
   records.push({frame:f,sourcePngSha256:r.sourcePngSha256,sourceRgbSha256:hash(a.original),sgRgbSha256:hash(b.printed),frontRgbSha256:hash(a.printed),coverage:coverageRef,guard:guardRef,visibleCoveragePixels:visible,backVersusFrontChangedPixels:sideDifference,changedOutsidePixels:outside,changedProtectedPixels:protectedChanges,coverageByteIdentical:true,canonicalUvQuarterTurns:job.selection.canonicalUvQuarterTurns??0,physicalObservedSide:'UNKNOWN',authoredSidePolicy:'NO_SWITCH_MATERIAL_SELECTION_DIAGNOSTIC'});
  }if(encoder){encoder.stdin.end();const[exit]=await done!;assert.equal(exit,0,stderr);}}
  catch(error){encoder?.stdin.destroy();if(encoder&&encoder.exitCode===null)encoder.kill();throw error;}
  let output=null;if(movie){const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',movie],{encoding:'utf8',windowsHide:true}));assert.equal(+probe.streams[0].nb_read_frames,27);output={...await ref(movie),probe};}
  results.push({seat:job.seat,selection:job.selection,source:job.source,front:job.front,back:job.back,records,sheets,output,physicalObservedSide:'UNKNOWN',authoredSidePolicy:'NO_SWITCH_MATERIAL_SELECTION_DIAGNOSTIC'});
 }
 for(const c of code)await checkedMaterialBytes(c);
 await writeFile(run+'/comparison.json',json({survey:await ref(run+'/survey.json'),code,results,apiCalls:0,coverageModified:false,automaticAcceptance:false,physicalObservedSide:'UNKNOWN'}),{flag:'wx'});console.log(json({comparison:await ref(run+'/comparison.json')}));
}else throw Error('Use --survey or --compare');
