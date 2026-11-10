import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';

// Local, read-only source analysis. All generated files stay in this attempt.
const run='runs/20261109-pamela-local-idle-proof';
const execute=promisify(execFile),hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
sharp.concurrency(1);
await mkdir(`${run}/qa`,{recursive:true});
const old=JSON.parse(await readFile('runs/20261109-pamela-card-contact-v4/composition.json','utf8'));
const sources={...old.sources,idle:{path:'runs/20261109-pamela-continuous-idle/original/pamela-continuous-wan3.mp4',sha256:'213bf02130cf7e02fc9d68b9ddc6f34a08dff9c5cb22c537af82a0c56bffe3d8',frames:360,dir:'runs/20261109-pamela-continuous-idle/qa'}};
for(const s of Object.values(sources) as any[]){
 if(hash(await readFile(s.path))!==s.sha256)throw Error('Source hash mismatch');
 const {stdout}=await execute('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',s.path],{windowsHide:true});
 s.probe=JSON.parse(stdout).streams[0];
 if(s.probe.width!==1762||s.probe.height!==1174||s.probe.avg_frame_rate!=='30/1'||Number(s.probe.nb_frames)!==s.frames)throw Error('Source metadata mismatch');
}
const roi={face:{left:746,top:69,width:298,height:321},hands:{left:619,top:745,width:780,height:172}};
const path=(clip:string,f:number)=>`${sources[clip].dir}/frame-${String(f+1).padStart(3,'0')}.png`;
if(process.argv.includes('--finalize')){
 const analysis=JSON.parse(await readFile(`${run}/analysis.json`,'utf8'));
 const segments=[
  {clip:'idle',startFrameInclusive:0,endFrameExclusive:345,dealOrdinal:0,priorCards:0},
  {clip:'approach',startFrameInclusive:3,endFrameExclusive:90,dealOrdinal:0,priorCards:0},
  {clip:'deal',startFrameInclusive:20,endFrameExclusive:180,dealOrdinal:0,priorCards:0},
  {clip:'deal',startFrameInclusive:15,endFrameExclusive:170,dealOrdinal:1,priorCards:1},
  {clip:'retreat',startFrameInclusive:1,endFrameExclusive:90,dealOrdinal:0,priorCards:2},
  {clip:'idle',startFrameInclusive:1,endFrameExclusive:91,dealOrdinal:0,priorCards:2},
 ];
 const timeline:any[]=[];
 for(const s of segments)for(let f=s.startFrameInclusive;f<s.endFrameExclusive;f++)timeline.push({clip:s.clip,sourceFrame:f,dealOrdinal:s.dealOrdinal,priorCards:s.priorCards,outputFrame:timeline.length,sourceSha256:sources[s.clip].sha256});
 await writeFile(`${run}/timeline.json`,JSON.stringify({schemaVersion:1,status:'trim-candidate-native-stills-reviewed-playback-pending',productionAccepted:false,fps:30,frameCount:timeline.length,durationSeconds:timeline.length/30,segments,sources,timeline,joins:analysis.joins,processing:{freeze:false,crossfade:false,retime:false,faceMorph:false},cardStateContract:'Final retreat and final idle both require priorCards=2. Raw source proof movies are not composited and do not prove card persistence.',seamCounting:'N played segments yield N-1 joins in a linear sequence; replay adds last-to-first. One 12s source has zero internal edits only when played continuously. Extracting or rearranging variants creates a join at every non-consecutive source-frame transition, even from the same file. Two 12s sources played once back-to-back have one join; looping both adds a second transition. This six-segment demonstration has five joins and must not auto-loop because the initial scene has zero cards and the final scene two.'},null,2)+'\n');
 await mkdir(`${run}/render`,{recursive:true});
 const proofs=[];
 for(const j of analysis.joins)for(const variant of ['candidate','baseline']){
  if(variant==='baseline'&&(j.id==='idle-approach'||j.id==='retreat-idle'))continue;
  const a=variant==='candidate'?j.from.sourceFrame:j.search.baseline.a,b=variant==='candidate'?j.to.sourceFrame:j.search.baseline.b;
  const pa=sources[j.from.clip].path,pb=sources[j.to.clip].path,output=`${run}/render/${j.id}-${variant}-raw.mp4`;
  const af=Math.max(0,a-29),be=Math.min(sources[j.to.clip].frames,b+30),frames=a-af+1+be-b;
  const filter=`[0:v]trim=start_frame=${af}:end_frame=${a+1},setpts=PTS-STARTPTS[a];[1:v]trim=start_frame=${b}:end_frame=${be},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]`;
  await execute('ffmpeg',['-v','error','-nostdin','-y','-threads','1','-i',pa,'-threads','1','-i',pb,'-filter_complex_threads','1','-filter_complex',filter,'-map','[v]','-an','-c:v','libx264','-crf','15','-preset','fast','-threads','1','-pix_fmt','yuv420p','-fps_mode','passthrough',output],{windowsHide:true,maxBuffer:5000});
  const probe=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames','-of','json',output],{windowsHide:true})).stdout).streams[0];
  if(Number(probe.nb_read_frames)!==frames||probe.avg_frame_rate!=='30/1'||probe.width!==1762||probe.height!==1174)throw Error('Proof metadata mismatch');
  const native:any={};
  for(const [name,r] of Object.entries(roi)){
   const raw=async(c:string,f:number)=>sharp(path(c,f)).extract(r).removeAlpha().raw().toBuffer();
   const aa=await raw(j.from.clip,a),bb=await raw(j.to.clip,b);
   native[name]={jumpRgbMae:mae(aa,bb),previousStepRgbMae:mae(aa,await raw(j.from.clip,Math.max(0,a-1))),nextStepRgbMae:mae(bb,await raw(j.to.clip,Math.min(sources[j.to.clip].frames-1,b+1)))};
   await sharp({create:{width:r.width*2,height:r.height,channels:3,background:'#111'}}).composite([{input:await sharp(aa,{raw:{width:r.width,height:r.height,channels:3}}).png().toBuffer(),left:0,top:0},{input:await sharp(bb,{raw:{width:r.width,height:r.height,channels:3}}).png().toBuffer(),left:r.width,top:0}]).png().toFile(`${run}/qa/${j.id}-${variant}-${name}.png`);
  }
  proofs.push({id:j.id,variant,path:output,sha256:hash(await readFile(output)),frames,fps:30,joinOutputFrame:a-af+1,sourceFrom:[j.from.clip,a],sourceTo:[j.to.clip,b],native,realTimePlaybackReviewed:false});
 }
 await writeFile(`${run}/proofs.json`,JSON.stringify({proofs,interpretation:'RGB errors measure pixel appearance discontinuity, not anatomical pose, identity, or perceptual quality. Candidate trimming only; no added frames, morph, retime, freeze, or fade.'},null,2)+'\n');
 console.log(JSON.stringify({timelineFrames:timeline.length,proofCount:proofs.length,allMetadataVerified:true}));
 process.exit(0);
}
const smallCache=new Map<string,Buffer[]>();
async function small(clip:string,f:number){const key=`${clip}${f}`;if(!smallCache.has(key))smallCache.set(key,await Promise.all(Object.values(roi).map(r=>sharp(path(clip,f)).extract(r).resize(Math.ceil(r.width/4),Math.ceil(r.height/4)).removeAlpha().raw().toBuffer())));return smallCache.get(key)!;}
function mae(a:Buffer,b:Buffer){let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length;}
const ranges=(a:number,b:number)=>Array.from({length:b-a+1},(_,i)=>a+i);
const specs=[
 {id:'idle-approach',a:'idle',ar:ranges(300,359),b:'approach',br:ranges(0,20),baseline:[359,0]},
 {id:'approach-deal',a:'approach',ar:ranges(75,89),b:'deal',br:ranges(0,24),baseline:[89,3]},
 {id:'deal-deal',a:'deal',ar:ranges(150,179),b:'deal',br:ranges(10,27),baseline:[179,17]},
 {id:'deal-retreat',a:'deal',ar:ranges(150,179),b:'retreat',br:ranges(0,24),baseline:[179,0]},
 {id:'retreat-idle',a:'retreat',ar:ranges(60,89),b:'idle',br:ranges(0,14),baseline:[89,0]},
];
const joins:any[]=[];
for(const s of specs){
 const candidates=[];
 for(const a of s.ar)for(const b of s.br){const aa=await small(s.a,a),bb=await small(s.b,b);const face=mae(aa[0],bb[0]),hands=mae(aa[1],bb[1]);candidates.push({a,b,face,hands,score:face+hands});}
 candidates.sort((a,b)=>a.score-b.score);
 const chosen=candidates[0],baseline=candidates.find(c=>c.a===s.baseline[0]&&c.b===s.baseline[1])!;
 const panels:any[]=[];let col=0;
 const native:any={};
 for(const [name,r] of Object.entries(roi)){
  const a=await sharp(path(s.a,chosen.a)).extract(r).removeAlpha().raw().toBuffer(),b=await sharp(path(s.b,chosen.b)).extract(r).removeAlpha().raw().toBuffer();
  native[name]={rgbMae:mae(a,b),roi:r};
  let j=0;for(const [clip,f] of [[s.a,chosen.a-2],[s.a,chosen.a-1],[s.a,chosen.a],[s.b,chosen.b],[s.b,chosen.b+1],[s.b,chosen.b+2]] as [string,number][]){
   const at=Math.max(0,Math.min(sources[clip].frames-1,f));
   const label=Buffer.from(`<svg width="${r.width}" height="30"><rect width="100%" height="100%" fill="#18222b"/><text x="8" y="21" fill="white" font-family="Arial" font-size="17">${clip} ${at}</text></svg>`);
   panels.push({input:label,left:j*r.width,top:col},{input:await sharp(path(clip,at)).extract(r).png().toBuffer(),left:j*r.width,top:col+30});j++;
  }col+=r.height+30;
 }
 await sharp({create:{width:6*roi.hands.width,height:col,channels:3,background:'#111'}}).composite(panels).png().toFile(`${run}/qa/${s.id}-native.png`);
 joins.push({id:s.id,from:{clip:s.a,sourceFrame:chosen.a},to:{clip:s.b,sourceFrame:chosen.b},native,search:{method:'Quarter-scale RGB MAE face plus hands; ranking aid only. No image registration, blending or deformation.',windows:{from:[s.ar[0],s.ar.at(-1)],to:[s.br[0],s.br.at(-1)]},chosen,baseline,top5:candidates.slice(0,5)},nativeSheet:`${run}/qa/${s.id}-native.png`,accepted:false});
}
await writeFile(`${run}/analysis.json`,JSON.stringify({sources,joins,frameConvention:'Zero-based inclusive; extracted frame-001.png = source0',productionAccepted:false},null,2)+'\n');
console.log(JSON.stringify(joins.map(j=>({id:j.id,from:j.from,to:j.to,native:j.native,chosen:j.search.chosen,baseline:j.search.baseline})),null,2));
