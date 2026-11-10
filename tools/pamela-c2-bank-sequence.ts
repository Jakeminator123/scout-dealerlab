/** Second presentation pass. Active C1 comes only from its C2 source, avoiding duplicate paper. */
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawn,execFileSync}from'node:child_process';
import{once}from'node:events';
import sharp from'sharp';
import{keyPamelaFrame}from'../src/pamela-key.ts';
import{readPamelaC2Catalog}from'../src/pamela-c2-bank-catalog.ts';
const W=1762,H=1174,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),take=process.argv.find(a=>a.startsWith('--take='))?.slice(7);
if(!take||!/^\d{2}$/.test(take))throw Error('Unique --take=NN required');
sharp.concurrency(1);
const firstRun='runs/20261109-pamela-bank-sequence/take-03',first=JSON.parse(await readFile(firstRun+'/evidence.json','utf8')),firstPlan=JSON.parse(await readFile(firstRun+'/plan.json','utf8'));
if(first.output.sha256!=='d2cffa713d37546088950f07a2cc4e0ef9c44f396bac8b12eec235020b307b16'||hash(await readFile(first.output.path))!==first.output.sha256)throw Error('First bank identity changed');
const candidates=await readPamelaC2Catalog();if(candidates.some(c=>c.status!=='raw-candidate'))throw Error('All seven C2 motion reviews required before rendering');
const approvedPlanPath='runs/20261109-pamela-seat-bank/c2/bank-v2-plan/plan.json',approvedPlanBytes=await readFile(approvedPlanPath),approved=JSON.parse(approvedPlanBytes.toString());
if(hash(approvedPlanBytes)!=='3a69e30d0287cb4b70230d4f2f309d9be0c84c68796080ef13393c7c3adbd63b')throw Error('C2 anchor plan changed');
const run=`runs/20261109-pamela-c2-bank-sequence/take-${take}`;await mkdir('runs/20261109-pamela-c2-bank-sequence',{recursive:true});await mkdir(run);for(const p of ['qa','render','layers','snapshot'])await mkdir(run+'/'+p);
const codeFiles=['tools/pamela-c2-bank-sequence.ts','tools/pamela-bank-sequence.ts','src/pamela-c2-bank-catalog.ts','src/pamela-key.ts'];
const code=[];for(const file of codeFiles){const b=await readFile(file);code.push({file,sha256:hash(b)});await writeFile(run+'/snapshot/'+file.split('/').at(-1),b,{flag:'wx'});}
const prior=firstPlan.jobs.map((j:any)=>j.landed),jobs:any[]=[],layers:any[]=[];
for(const c of candidates){
 if(!c.source||!c.reviewPath||!Number.isInteger(c.clearHandFrame))throw Error('Missing source or release witness');
 if(hash(await readFile(c.source.path))!==c.source.sha256)throw Error('C2 source hash changed');
 const anchor=approved.jobs.find((j:any)=>j.seat===c.seat),firstJob=firstPlan.jobs.find((j:any)=>j.seat===c.seat);
 if(anchor.provenance.sourceSha256!==firstJob.sourceSha256)throw Error('C1 provenance mismatch');
 const frames=c.reviewPath.replace(/\/review\.json$/,'/frames'),sourceFrame=350,sourcePng=frames+'/frame-0350.png',bytes=await readFile(sourcePng);
 const bounds=[anchor.geometry.c1Native.bounds,anchor.geometry.c2Native.bounds],left=Math.max(0,Math.min(...bounds.map((b:any)=>b.left))-15),top=Math.max(0,Math.min(...bounds.map((b:any)=>b.top))-15),right=Math.min(W,Math.max(...bounds.map((b:any)=>b.left+b.width))+15),bottom=Math.min(H,Math.max(...bounds.map((b:any)=>b.top+b.height))+15),roi={left,top,width:right-left,height:bottom-top};
 const raw=await sharp(bytes).extract(roi).removeAlpha().raw().toBuffer(),n=roi.width*roi.height,core=new Uint8Array(n),seen=new Uint8Array(n);let largest:number[]=[];
 for(let p=0;p<n;p++){const j=p*3,r=raw[j],g=raw[j+1],b=raw[j+2];core[p]=Number(r>=155&&g>=155&&b>=145&&Math.max(r,g,b)-Math.min(r,g,b)<=65&&g-Math.max(r,b)<35);}
 for(let start=0;start<n;start++){if(!core[start]||seen[start])continue;const q=[start];seen[start]=1;for(let i=0;i<q.length;i++){const p=q[i],x=p%roi.width,y=Math.floor(p/roi.width);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=roi.width||yy<0||yy>=roi.height)continue;const v=yy*roi.width+xx;if(core[v]&&!seen[v]){seen[v]=1;q.push(v);}}}if(q.length>largest.length)largest=q;}
 if(largest.length<5000||largest.length>20000)throw Error('Unreliable pair silhouette at seat '+c.seat+': '+largest.length);
 const support=new Uint8Array(n);for(const p of largest){const x=p%roi.width,y=Math.floor(p/roi.width);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<roi.width&&yy>=0&&yy<roi.height)support[yy*roi.width+xx]=1;}}
 const keyed=keyPamelaFrame(raw,roi.width,roi.height),rgba=Buffer.alloc(W*H*4);let area=0;
 for(let p=0;p<n;p++){if(!support[p]||keyed.alpha[p]<.012)continue;const x=p%roi.width+left,y=Math.floor(p/roi.width)+top,q=(y*W+x)*4;for(let channel=0;channel<3;channel++)rgba[q+channel]=keyed.rgb[p*3+channel];rgba[q+3]=Math.round(255*keyed.alpha[p]);area+=rgba[q+3]/255;}
 const layerPath=`${run}/layers/seat-${c.seat}-pair.png`;await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toFile(layerPath);
 const landed={seat:c.seat,source:c.source.path,sourceSha256:c.source.sha256,sourceFrame,sourceFramePng:{path:sourcePng,sha256:hash(bytes)},layer:{path:layerPath,sha256:hash(await readFile(layerPath))},meaning:'Observed combined C1/C2 silhouette; two independent texture surfaces still required',roi,area};layers.push(landed);
 const job={index:jobs.length,seat:c.seat,source:c.source.path,sourceSha256:c.source.sha256,sourceFrames:frames,contactFrame:c.clearHandFrame,output:`${run}/render/part-${jobs.length}.mp4`,prior:prior.filter((l:any)=>l.seat!==c.seat),landed,run,scene:firstJob.scene};jobs.push(job);prior[prior.findIndex((l:any)=>l.seat===c.seat)]=landed;
}
await writeFile(run+'/plan.json',JSON.stringify({createdAt:new Date().toISOString(),code,jobs,layers,firstBank:{path:firstRun+'/evidence.json',sha256:hash(await readFile(firstRun+'/evidence.json'))},candidates,activeSeatPolicy:'Current C1 and moving C2 are owned by source video. No separate current C1 overlay. Other six seats use frozen first-card or completed-pair layers.',productionAccepted:false},null,2));
let next=0,failed=false;
const workers=await Promise.allSettled(Array.from({length:2},async()=>{for(;;){if(failed)return;const i=next++;if(i>=jobs.length)return;const p=`${run}/job-${i}.json`;await writeFile(p,JSON.stringify(jobs[i]));const child=spawn(process.execPath,['tools/pamela-bank-sequence.ts','--worker',p],{stdio:['ignore','pipe','pipe'],windowsHide:true});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);try{const[exit]=await once(child,'close');if(exit!==0)throw Error('C2 worker '+i+' failed: see saved log');console.log(JSON.stringify({completedC2Seat:jobs[i].seat}));}catch(e){failed=true;throw e;}finally{await writeFile(`${run}/worker-${i}.log`,log);}}}));
for(const result of workers)if(result.status==='rejected')throw result.reason;
for(const c of code)if(hash(await readFile(c.file))!==c.sha256)throw Error('Pipeline code changed during render');
const parts=await Promise.all(jobs.map(j=>readFile(`${run}/part-${j.index}.json`,'utf8').then(JSON.parse)));
const concat=async(name:string,files:string[],frames:number)=>{const list=`${run}/render/${name}.txt`,output=`${run}/render/${name}.mp4`;await writeFile(list,files.map(f=>`file '${f.replaceAll('\\','/')}'`).join('\n'));execFileSync('ffmpeg',['-v','error','-nostdin','-n','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',output],{windowsHide:true});const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',output],{encoding:'utf8',windowsHide:true}));if(+probe.streams[0].nb_read_frames!==frames||probe.streams[0].avg_frame_rate!=='30/1')throw Error('Output timing mismatch');return{path:output,sha256:hash(await readFile(output)),probe};};
const cwd=process.cwd().replaceAll('\\','/'),pass=await concat('second-card-pass',jobs.map(j=>cwd+'/'+j.output),2520),both=await concat('fourteen-deals',[cwd+'/'+first.output.path,cwd+'/'+pass.path],5040);
await writeFile(run+'/evidence.json',JSON.stringify({createdAt:new Date().toISOString(),status:'motion-rehearsal-awaiting-visual-review',output:both,secondPass:pass,firstPass:first.output,layers,seats:[1,2,3,4,5,6,7],verification:{sourceRgbEqualFrames:parts.reduce((s,p)=>s+p.verification.sourceRgbEqualFrames,0),priorCardCoreChanged:parts.reduce((s,p)=>s+p.verification.priorCardCoreChanged,0)},productionAccepted:false,limitations:['Hard REDO seams and original holds retained','Combined pair silhouettes are presentation references, not two independent artwork layers','Current-source C1 can differ slightly from the previous frozen C1','Preliminary green matte and physical projection remain unapproved']},null,2));
console.log(JSON.stringify({run,secondPassFrames:2520,combinedFrames:5040,seconds:168}));
