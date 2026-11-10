/** Native isolated return comparison. prepare precedes optical review; render is explicit. */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { keyPamelaFrame } from '../src/pamela-key.ts';
import { padCanonicalForIdle } from '../src/pamela-idle-source-projection.ts';
import { temporalJoin, mixTemporalComposites, type TemporalFrame, type TemporalJoinFrame } from '../src/pamela-temporal-join.ts';
type Ref = { path: string; sha256: string };
const RUN='runs/20261110-pamela-idle-return-overlap/take-01', W=1764,H=1174,CW=1762;
const SURVEY='runs/20261109-pamela-rest-ready-seam-survey/take-01/evidence.json';
const BANK='runs/20261110-pamela-mask-bank/take-01/evidence.json';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const ref=async(path:string):Promise<Ref>=>({path,sha256:hash(await readFile(path))});
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
async function checked(r:Ref){const b=await readFile(r.path);assert.equal(hash(b),r.sha256,`BOUND_FILE_CHANGED ${r.path}`);return b;}
const frames=(source:string,start:number,end:number):TemporalFrame[]=>Array.from({length:end-start},(_,i)=>({source,frame:start+i}));
const key=(f:TemporalFrame)=>`${f.source}-${f.frame}`;
const rois={face:{left:730,top:70,width:290,height:340},eyes:{left:790,top:184,width:180,height:88},mouth:{left:800,top:280,width:170,height:88},leftHand:{left:630,top:740,width:230,height:160},rightHand:{left:880,top:730,width:260,height:180}};
assert.equal(process.version,'v24.21.0');sharp.concurrency(1);
const action=process.argv[2];assert.ok(action==='prepare'||action==='render');
async function prepare(){
 assert.equal((await ref(SURVEY)).sha256,'c10f57f2894e7dbaa2764dd452db5ef2081f1c3bb1859569ed65b3883a9ac4c6');
 assert.equal((await ref(BANK)).sha256,'ed63d72517802affc241445070c3242c5440d0ab2122d6f55a36b22f372967dc');
 const survey=await json(SURVEY),bank=await json(BANK),plan=JSON.parse((await checked(bank.plan)).toString());
 const old=await json('runs/20261110-pamela-idle-exit-overlap/take-01/evidence.json');
 const sources=survey.sourceBindings.filter((r:any)=>r.id==='B'||r.id==='retreat');for(const r of sources)await checked(r);
 for(const r of plan.scene)await checked(r);
 await mkdir('runs/20261110-pamela-idle-return-overlap',{recursive:true});await mkdir(RUN);
 for(const d of ['sources','native','sheets','snapshot','render'])await mkdir(`${RUN}/${d}`);
 const code=await Promise.all(['tools/pamela-idle-return-overlap.ts','src/pamela-temporal-join.ts','src/pamela-key.ts','src/pamela-idle-source-projection.ts','src/pamela-stage-projection.ts'].map(ref));
 for(const r of code)await copyFile(r.path,`${RUN}/snapshot/${r.path.split('/').at(-1)}`);
 const room=await sharp(plan.scene[0].path).resize(CW,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
 const canonical=await sharp(room).composite([{input:await checked(plan.scene[1])}]).removeAlpha().raw().toBuffer();
 const cardSupport=new Uint8Array(W*H),landed:Ref[]=[];
 for(let seat=1;seat<=7;seat++){
  const r=bank.landed.find((r:any)=>r.id===`C2-P${seat}`);assert.ok(r);landed.push(r);
  assert.ok(old.retained.layers.some((o:Ref)=>o.sha256===r.sha256),'Retained pair changed from previous overlap');
  const rgba=await sharp(await checked(r)).ensureAlpha().raw().toBuffer();assert.equal(rgba.length,CW*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<CW;x++){const p=y*CW+x,a=rgba[p*4+3]/255;if(a){const q=y*W+x+1;assert.equal(cardSupport[q],0);cardSupport[q]=1;for(let c=0;c<3;c++)canonical[p*3+c]=Math.round(canonical[p*3+c]*(1-a)+rgba[p*4+c]*a);}}
 }
 const base=Buffer.from(padCanonicalForIdle(canonical,3));
 const priorBase=await sharp('runs/20261110-pamela-idle-exit-overlap/take-01/native/fourteen-card-base.png').removeAlpha().raw().toBuffer();assert.equal(hash(base),hash(priorBase));
 await sharp(base,{raw:{width:W,height:H,channels:3}}).png().toFile(`${RUN}/native/fourteen-card-base.png`);
 const retreat=frames('retreat',70,90),prefix=frames('B',0,23),phase=frames('B',305,327),loop=frames('B',289,327);
 const unique=[...new Map([...retreat,...prefix,...phase,...loop].map(f=>[key(f),f])).values()];
 const sourceRecords:any[]=[],support=new Map<string,Uint8Array>();
 for(const f of unique){
  const r=survey.frameBindings[f.source].find((r:any)=>r.frame===f.frame);assert.ok(r);
  const original:Ref={path:r.path,sha256:r.pngSha256};const native=await sharp(await checked(original)).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(native.info.height,H);assert.equal(native.info.channels,3);assert.equal(hash(native.data),r.rgbSha256);
  assert.equal(native.info.width,f.source==='B'?W:CW);
  const rgb=native.info.width===CW?Buffer.from(padCanonicalForIdle(native.data,3)):native.data;
  const keyed=keyPamelaFrame(rgb,W,H),composite=Buffer.from(base),foreground=new Uint8Array(W*H);let retainedChanges=0,baseChanges=0;
  for(let p=0;p<W*H;p++){const a=keyed.alpha[p];foreground[p]=a>0?1:0;if(cardSupport[p])assert.equal(a,0,`Dealer intersects retained card ${key(f)} ${p}`);if(a)for(let c=0;c<3;c++)composite[p*3+c]=Math.round(base[p*3+c]*(1-a)+keyed.rgb[p*3+c]*a);for(let c=0;c<3;c++){const changed=composite[p*3+c]!==base[p*3+c];if(changed&&cardSupport[p])retainedChanges++;if(changed&&!a)baseChanges++;}}
  assert.equal(retainedChanges,0);assert.equal(baseChanges,0);support.set(key(f),foreground);
  const path=`${RUN}/sources/${key(f)}.png`;await sharp(composite,{raw:{width:W,height:H,channels:3}}).png().toFile(path);
  sourceRecords.push({...await ref(path),...f,original,sourceRgbSha256:r.rgbSha256,paddedRgbSha256:hash(rgb),compositeRgbSha256:hash(composite),retainedChanges,baseChanges});
  if(sourceRecords.length%20===0)console.log(JSON.stringify({preparedSources:sourceRecords.length,total:unique.length}));
 }
 const get=async(f:TemporalFrame)=>{const r=sourceRecords.find(r=>key(r)===key(f));assert.ok(r);const rgb=await sharp(await checked(r)).removeAlpha().raw().toBuffer();assert.equal(hash(rgb),r.compositeRgbSha256);return rgb;};
 const outputs=[];
 for(const overlap of [0,2,4]){
  const id=overlap?`overlap-${overlap}`:'direct';
  const mapping:TemporalJoinFrame[]=[...retreat.map(a=>({outputFrame:0,a,weightB:0})),...temporalJoin(prefix,phase,overlap),...loop.map(a=>({outputFrame:0,a,weightB:0}))].map((f,outputFrame)=>({...f,outputFrame}));
  const records:any[]=[];
  for(const f of mapping){
   const a=await get(f.a),b=f.b?await get(f.b):undefined,rgb=b?Buffer.from(mixTemporalComposites(a,b,f.weightB)):a;
   const sa=support.get(key(f.a))!,sb=f.b?support.get(key(f.b)):undefined;let retainedChanges=0,baseChanges=0;
   for(let p=0;p<W*H;p++){const isBase=!sa[p]&&!(sb?.[p]);if(!cardSupport[p]&&!isBase)continue;for(let c=0;c<3;c++)if(rgb[p*3+c]!==base[p*3+c]){if(cardSupport[p])retainedChanges++;if(isBase)baseChanges++;}}
   assert.equal(retainedChanges,0);assert.equal(baseChanges,0);const nativeRefs:any[]=[];
   if(f.outputFrame>=36&&f.outputFrame<=49)for(const [name,roi]of Object.entries(rois)){const path=`${RUN}/native/${id}-${name}-${String(f.outputFrame).padStart(3,'0')}.png`;await sharp(rgb,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toFile(path);nativeRefs.push({...await ref(path),name,roi});}
   records.push({...f,rgbSha256:hash(rgb),retainedChanges,baseChanges,nativeRefs});
  }
  const sheets=[];
  for(const [name,roi]of Object.entries(rois)){
   const native=records.filter(r=>r.nativeRefs.length),cols=name==='face'?4:4,layers=[];
   for(const [i,r]of native.entries()){
    const n=r.nativeRefs.find((n:any)=>n.name===name),label=`${r.outputFrame} ${key(r.a)}${r.b?` +${key(r.b)} ${r.weightB.toFixed(3)}`:''}`;const left=i%cols*roi.width,top=Math.floor(i/cols)*(roi.height+24);
    layers.push({input:await checked(n),left,top:top+24},{input:Buffer.from(`<svg width="${roi.width}" height="24"><rect width="100%" height="100%" fill="#18252c"/><text x="3" y="16" font-size="11" fill="white">${label}</text></svg>`),left,top});
   }
   const path=`${RUN}/sheets/${id}-${name}.png`;await sharp({create:{width:roi.width*cols,height:Math.ceil(native.length/cols)*(roi.height+24),channels:3,background:'#18252c'}}).composite(layers).png().toFile(path);sheets.push({...await ref(path),roi,nativePixels:true});
  }
  outputs.push({id,overlap,frames:records.length,durationSeconds:records.length/30,durationConsumedSeconds:overlap/30,transition:{start:43-overlap,endExclusive:43},records,sheets});console.log(JSON.stringify({nativeCandidate:id,frames:records.length}));
 }
 await save(`${RUN}/evidence.json`,{schemaVersion:1,status:'native-candidates-awaiting-optical-decision-before-render',bank:await ref(BANK),survey:await ref(SURVEY),sourceBindings:sources,code,scene:plan.scene,retained:{cards:14,layers:landed,shaMatchesEarlierOverlap:true,base:await ref(`${RUN}/native/fourteen-card-base.png`),baseRgbSha256:hash(base),priorBaseRgbExact:true,changedPixels:0},sourceRecords,outputs,width:W,height:H,fps:30,rois,retimed:false,heldFrames:0,apiCalls:0,productionAccepted:false,rawShoeMaterial:'No paint or shoe substitution. Same keying/composition as source, with authored overlap only at theB-prefix-to-phase seam.',limitations:['Temporal overlap is processed imagery, not a seamless native cut.','Output duration is shortened byoverlap/30 seconds.','Native still ranking precedes video/1x acceptance.','No full14-deal round is rendered by this tool.']});
 console.log(JSON.stringify({evidence:await ref(`${RUN}/evidence.json`),sources:sourceRecords.length}));
}
async function render(){
 const e=await json(`${RUN}/evidence.json`),ids=process.argv.slice(3);assert.ok(ids.length&&ids.every(id=>['direct','overlap-2','overlap-4'].includes(id)));
 for(const r of e.code)await checked(r);for(const r of e.sourceBindings)await checked(r);
 const rendered=[];
 for(const id of ids){
  const o=e.outputs.find((o:any)=>o.id===id);assert.ok(o);const path=`${RUN}/render/${id}.mp4`;
  const child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pix_fmt','rgb24','-s',`${W}x${H}`,'-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);const done=once(child,'close');
  const get=async(f:TemporalFrame)=>{const r=e.sourceRecords.find((r:any)=>key(r)===key(f));assert.ok(r);const rgb=await sharp(await checked(r)).removeAlpha().raw().toBuffer();assert.equal(hash(rgb),r.compositeRgbSha256);return rgb;};
  try{for(const f of o.records){const a=await get(f.a),rgb=f.b?Buffer.from(mixTemporalComposites(a,await get(f.b),f.weightB)):a;assert.equal(hash(rgb),f.rgbSha256);if(!child.stdin.write(rgb))await once(child.stdin,'drain');}child.stdin.end();const[exit]=await done;assert.equal(exit,0,errors);}catch(error){child.stdin.destroy();child.kill();await done;throw error;}
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,time_base,nb_read_frames:format=duration','-of','json',path],{encoding:'utf8',windowsHide:true}));const s=probe.streams[0];assert.equal(s.width,W);assert.equal(s.height,H);assert.equal(s.avg_frame_rate,'30/1');assert.equal(Number(s.nb_read_frames),o.frames);
  rendered.push({id,...await ref(path),frames:o.frames,overlap:o.overlap,durationConsumedSeconds:o.durationConsumedSeconds,allInputRgbHashesMatch:true,probe});console.log(JSON.stringify({rendered:id,frames:o.frames}));
 }
 await save(`${RUN}/render-evidence.json`,{evidence:await ref(`${RUN}/evidence.json`),rendered,normalSpeedVisualReview:false,lossyDisplayEncoding:'H264CRF14yuv420p; RGB invariants proved before encoding.',maximumConcurrentMediaProcesses:1,apiCalls:0});
}
if(action==='prepare')await prepare();else await render();
