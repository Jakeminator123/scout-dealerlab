import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {REDO_OVERLAP_SOURCE_SHA256,createRedoOverlapPlan,composeRedoOverlap,type OverlapLength,type RedoLayer} from '../src/pamela-redo-overlap.ts';
sharp.concurrency(1);
const W=1762,H=1174,referenceRun='runs/20261109-pamela-redo-endpoints/take-01',root='runs/20261109-pamela-redo-overlap';
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7)??'01';if(!/^\d{2}$/.test(take))throw Error('Unused two-digit take required');
const run=`${root}/take-${take}`,bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin',execute=promisify(execFile);
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),ref=JSON.parse(await readFile(`${referenceRun}/evidence.json`,'utf8'));
assert.equal(ref.sourceSha256,REDO_OVERLAP_SOURCE_SHA256);assert.equal(sha(await readFile(ref.source)),REDO_OVERLAP_SOURCE_SHA256);
assert.equal(sha(await readFile('src/pamela-key.ts')),ref.snapshots.find((s:any)=>s.path==='src/pamela-key.ts').sha256);
const lengths:OverlapLength[]=[0,4,8],plans=lengths.map(createRedoOverlapPlan);
for(const [v,n] of lengths.entries()){
 assert.equal(plans[v].length,90);assert.equal(plans[v].filter(p=>p.kind==='blended-layer').length,n);
 assert.ok(plans[v].every(p=>p.weightA+p.weightB===1&&p.sourceAFrame>=0&&p.sourceAFrame<=359&&p.sourceBFrame>=0&&p.sourceBFrame<=359));
}
// Analytic checks cover premultiplied mixing and transparent independent base.
assert.deepEqual(composeRedoOverlap(Buffer.from([10,20,30]),{rgb:Buffer.from([100,120,140]),alpha:new Float32Array([1])},{rgb:Buffer.from([200,220,240]),alpha:new Float32Array([1])},.5),Buffer.from([150,170,190]));
assert.deepEqual(composeRedoOverlap(Buffer.from([10,20,30]),{rgb:Buffer.from([100,120,140]),alpha:new Float32Array([0])},{rgb:Buffer.from([200,220,240]),alpha:new Float32Array([0])},.5),Buffer.from([10,20,30]));
await mkdir(root,{recursive:true});await mkdir(run);for(const sub of ['qa','native','layers','render','snapshot'])await mkdir(`${run}/${sub}`);
const snapshotPaths=['src/pamela-redo-overlap.ts','tools/pamela-redo-overlap.ts','src/pamela-key.ts',`${referenceRun}/evidence.json`,`${referenceRun}/redo-anchors.json`];
const snapshots=[];for(const path of snapshotPaths){const b=await readFile(path);snapshots.push({path,sha256:sha(b)});await writeFile(`${run}/snapshot/${path.replaceAll('/','__')}`,b);}
const cardBytes=await readFile(ref.cardLayer.path);assert.equal(sha(cardBytes),ref.cardLayer.sha256);await writeFile(`${run}/layers/dealt-card-unchanged.png`,cardBytes);
const card=await sharp(cardBytes).ensureAlpha().raw().toBuffer(),stage=await sharp(`${referenceRun}/qa/target-stage.png`).removeAlpha().raw().toBuffer(),base=Buffer.from(stage),roi=ref.rois.dealt_card;
for(let p=0;p<W*H;p++){const a=card[p*4+3]/255;for(let c=0;c<3;c++)base[p*3+c]=Math.round(base[p*3+c]*(1-a)+card[p*4+c]*a);}
const sourceRecords=new Map(ref.records.map((r:any)=>[r.sourceFrame,r]));
const cache=new Map<number,RedoLayer>();
async function layer(f:number):Promise<RedoLayer>{
 if(cache.has(f))return cache.get(f)!;
 const r:any=sourceRecords.get(f),bytes=await readFile(r.sourcePath);assert.equal(sha(bytes),r.sourceFrameSha256);
 const keyed=keyPamelaFrame(await sharp(bytes).removeAlpha().raw().toBuffer(),W,H);
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++)keyed.alpha[y*W+x]=0;
 // Only endpoint-neighbour layers are cached; ordinary frames stay streaming.
 if(f<=4||f>=355)cache.set(f,keyed);return keyed;
}
const rois={face:ref.rois.face,eyes:{left:790,top:226,width:155,height:54},resting_hand:ref.rois.resting_hand,shoe_hand:ref.rois.shoe_hand,shoe_body:ref.rois.shoe_body};
type ROI={left:number;top:number;width:number;height:number};
function roiDifference(a:Buffer,b:Buffer,r:ROI){let sum=0,max=0;for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++)for(let c=0;c<3;c++){const d=Math.abs(a[(y*W+x)*3+c]-b[(y*W+x)*3+c]);sum+=d;max=Math.max(max,d);}return {maeRgb:sum/(r.width*r.height*3),maxChannelDifference:max};}
function edgeEnergy(a:Buffer,r:ROI){let sum=0,n=0;for(let y=r.top+1;y<r.top+r.height-1;y++)for(let x=r.left+1;x<r.left+r.width-1;x++){const p=y*W+x;for(let c=0;c<3;c++){const v=4*a[p*3+c]-a[(p-1)*3+c]-a[(p+1)*3+c]-a[(p-W)*3+c]-a[(p+W)*3+c];sum+=Math.abs(v);n++;}}return sum/n;}
function encoder(path:string,width:number,height:number){
 const child=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','14','-preset','fast','-pix_fmt','yuv420p','-threads','1',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let error='';child.stderr.on('data',b=>error+=b.toString());const done=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(error)));});
 return {async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async finish(){child.stdin.end();await done;},abort(){child.stdin.destroy();child.kill();}};
}
const videoSpecs=[...lengths.map(n=>({name:n?`overlap-${n}-native`:'hard-cut-native',width:W,height:H})),{name:'hard-vs-4-vs-8',width:1920,height:454}];
const enc=videoSpecs.map(v=>encoder(`${run}/render/${v.name}.mp4`,v.width,v.height));
const records:any[]=[[],[],[]],previous:Array<Buffer|undefined>=[undefined,undefined,undefined],qaFrames=new Map<string,Buffer>(),baselineMatches=[];
try{
 for(let i=0;i<90;i++){
  const hardPair=plans[0][i],hardLayer=await layer(hardPair.sourceAFrame),hard=composeRedoOverlap(base,hardLayer,hardLayer,0),outputs=[hard];
  if([0,356,357,358,359].includes(hardPair.nominalSourceFrame)){
   const prior=await sharp(`${referenceRun}/endpoints/composite-${String(hardPair.nominalSourceFrame).padStart(4,'0')}.png`).removeAlpha().raw().toBuffer();assert.deepEqual(hard,prior);baselineMatches.push(hardPair.nominalSourceFrame);
  }
  for(let v=1;v<3;v++){const pair=plans[v][i];outputs.push(pair.kind==='blended-layer'?composeRedoOverlap(base,await layer(pair.sourceAFrame),await layer(pair.sourceBFrame),pair.weightB):hard);}
  const small=[];
  for(let v=0;v<3;v++){
   const pair=plans[v][i],out=outputs[v];
   if(pair.kind==='source-layer')assert.deepEqual(out,hard);
   for(let y=roi.top;y<roi.top+roi.height;y++){const offset=(y*W+roi.left)*3;assert.deepEqual(out.subarray(offset,offset+roi.width*3),base.subarray(offset,offset+roi.width*3));}
   const metrics=Object.fromEntries(Object.entries(rois).map(([name,r])=>[name,{stepFromPrevious:previous[v]?roiDifference(previous[v]!,out,r):null,differenceFromHard:roiDifference(hard,out,r),laplacianMeanAbsolute:edgeEnergy(out,r)}]));
   let outputPng:any=null;
   if(i>=54&&i<=65){const path=`${run}/native/${lengths[v]===0?'hard':`blend-${lengths[v]}`}-${String(i).padStart(3,'0')}.png`,b=await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toBuffer();await writeFile(path,b);outputPng={path,sha256:sha(b)};qaFrames.set(`${v}-${i}`,out);}
   records[v].push({...pair,sourceASha256:(sourceRecords.get(pair.sourceAFrame) as any).sourceFrameSha256,sourceBSha256:(sourceRecords.get(pair.sourceBFrame) as any).sourceFrameSha256,sourceVideoSha256:REDO_OVERLAP_SOURCE_SHA256,outputRgbSha256:sha(out),outputPng,metrics});previous[v]=out;
   await enc[v].write(out);small.push(await sharp(out,{raw:{width:W,height:H,channels:3}}).resize(640,426).raw().toBuffer());
  }
  const labels=['HARD CUT', '4 BLENDED OUTPUT FRAMES','8 BLENDED OUTPUT FRAMES'];
  const preview=await sharp({create:{width:1920,height:454,channels:3,background:'#17202a'}}).composite(small.map((b,v)=>({input:b,raw:{width:640,height:426,channels:3 as const},left:v*640,top:28})).concat(labels.map((text,v)=>({input:Buffer.from(`<svg width="640" height="28"><rect width="640" height="28" fill="#17202a"/><text x="10" y="20" fill="white" font-size="17">${text} / out ${i} / ${plans[v][i].kind}</text></svg>`),left:v*640,top:0})) as any)).removeAlpha().raw().toBuffer();
  await enc[3].write(preview);if(i%15===0)console.log(`Rendered ${i+1}/90`);
 }
 await Promise.all(enc.map(e=>e.finish()));
}catch(error){enc.forEach(e=>e.abort());throw error;}
const sheets=[];
for(const [name,r] of Object.entries(rois)){
 const cellH=r.height+36,items=[];
 for(let v=0;v<3;v++)for(let i=54;i<=65;i++){
  const b=qaFrames.get(`${v}-${i}`)!,image=await sharp(b,{raw:{width:W,height:H,channels:3}}).extract(r).png().toBuffer(),left=(i-54)*r.width,top=v*cellH,pair=plans[v][i];
  const text=`${lengths[v]||'hard'} out${i} ${pair.kind==='blended-layer'?pair.weightB.toFixed(3):'source'}`;
  items.push({input:image,left,top:top+36},{input:Buffer.from(`<svg width="${r.width}" height="36"><rect width="100%" height="100%" fill="#17202a"/><text x="3" y="15" fill="white" font-size="12">${text}</text><text x="3" y="30" fill="white" font-size="12">${pair.sourceAFrame}+${pair.sourceBFrame}</text></svg>`),left,top});
 }
 const path=`${run}/qa/${name}-hard-4-8-native.png`;await sharp({create:{width:r.width*12,height:cellH*3,channels:3,background:'#17202a'}}).composite(items).png().toFile(path);sheets.push({path,sha256:sha(await readFile(path)),nativeScale:1});
}
// Critical blend centres enlarged for double-edge and blink inspection only.
for(const name of ['face','eyes','resting_hand','shoe_hand']){
 const r=rois[name as keyof typeof rois],items=[];
 for(let v=0;v<3;v++)for(let k=0;k<2;k++){const i=59+k,b=qaFrames.get(`${v}-${i}`)!;items.push({input:await sharp(b,{raw:{width:W,height:H,channels:3}}).extract(r).resize(r.width*2,r.height*2,{kernel:'nearest'}).png().toBuffer(),left:v*r.width*2,top:k*(r.height*2+24)+24});items.push({input:Buffer.from(`<svg width="${r.width*2}" height="24"><rect width="100%" height="100%" fill="#17202a"/><text x="5" y="17" fill="white" font-size="15">${lengths[v]||'hard'} / out${i} / 2x nearest</text></svg>`),left:v*r.width*2,top:k*(r.height*2+24)});}
 const path=`${run}/qa/${name}-centres-2x.png`;await sharp({create:{width:r.width*6,height:(r.height*2+24)*2,channels:3,background:'#17202a'}}).composite(items).png().toFile(path);sheets.push({path,sha256:sha(await readFile(path)),displayScale:2});
}
const videos=[];for(const spec of videoSpecs){const path=`${run}/render/${spec.name}.mp4`,probe=JSON.parse((await execute(`${bin}/ffprobe.exe`,['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames,duration','-of','json',path],{windowsHide:true})).stdout).streams[0];assert.equal(probe.nb_read_frames,'90');assert.equal(probe.avg_frame_rate,'30/1');assert.equal(probe.duration,'3.000000');videos.push({path,sha256:sha(await readFile(path)),...probe});}
assert.equal(sha(await readFile(ref.source)),REDO_OVERLAP_SOURCE_SHA256);assert.equal(sha(await readFile(`${run}/layers/dealt-card-unchanged.png`)),ref.cardLayer.sha256);
const evidence={createdAt:new Date().toISOString(),source:ref.source,sourceVideoSha256:REDO_OVERLAP_SOURCE_SHA256,referenceRun,referenceCompositeSha256:ref.videos.find((v:any)=>v.path.includes('persistent-card-end-to-start')).sha256,nativeSize:[W,H],fps:30,frames:90,duration:3,cutAtOutput:60,variants:lengths.map((length,v)=>({length,blendedOutputFrames:plans[v].filter(p=>p.kind==='blended-layer').map(p=>p.outputIndex),maximumEndpointHoldFrames:length/2,records:records[v]})),method:'Symmetric short crossfade of premultiplied dealer/shoe layers over fixed stage+card. RGB8 code-value mixing. Outgoing359 held after cut and incoming0 held before cut. These are processed blend frames, not original frames; no optical flow, face warp, spatial transform or AI synthesis.',cardLayer:{sourcePath:ref.cardLayer.path,path:`${run}/layers/dealt-card-unchanged.png`,sha256:ref.cardLayer.sha256,unchangedAll270Composites:true},selfTests:{pairCountAndBounds:true,analyticPremultipliedMix:true,transparentBaseUnchanged:true,outsideBlendWindowsIdenticalToHard:true,hardReferenceNativeEndpointsIdentical:baselineMatches},snapshots,sheets,videos,newPaidJobs:0,status:'awaiting-visual-overlap-review'};
await writeFile(`${run}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');
const brief=lengths.map((length,v)=>({length,metrics:Object.fromEntries(Object.keys(rois).map(name=>[name,{maxStepMae:Math.max(...records[v].filter((r:any)=>r.outputIndex>=54&&r.outputIndex<=65).map((r:any)=>r.metrics[name].stepFromPrevious?.maeRgb??0)),minEdgeEnergy:Math.min(...records[v].filter((r:any)=>r.outputIndex>=54&&r.outputIndex<=65).map((r:any)=>r.metrics[name].laplacianMeanAbsolute))}]))}));
console.log(JSON.stringify({run,brief,videos}));
