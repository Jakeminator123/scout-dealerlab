/** Presentation rehearsal only: original timing, keyed dealer, independent persistent blank cards. */
import {mkdir,readFile,writeFile}from'node:fs/promises';
import {createHash}from'node:crypto';
import {spawn,execFileSync}from'node:child_process';
import {once}from'node:events';
import {fileURLToPath}from'node:url';
import sharp from'sharp';
import {keyPamelaFrame}from'../src/pamela-key.ts';
import {readPamelaBankCatalog}from'../src/pamela-bank-catalog.ts';
sharp.concurrency(1);
const W=1762,H=1174,FPS=30,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),script=fileURLToPath(import.meta.url),args=process.argv.slice(2);
type Layer={seat:number;source:string;sourceSha256:string;sourceFrame:number;layer:{path:string;sha256:string}};
type SceneAsset={path:string;sha256:string};
type Job={index:number;seat:number;source:string;sourceSha256:string;sourceFrames:string;contactFrame:number;output:string;prior:Layer[];landed:Layer;run:string;scene:SceneAsset[]};
const scenePaths=['runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png','runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png'];
function overlay(base:Buffer,rgba:Buffer){const out=Buffer.from(base);for(let p=0;p<W*H;p++){const a=rgba[p*4+3]/255;if(!a)continue;for(let c=0;c<3;c++)out[p*3+c]=Math.round(out[p*3+c]*(1-a)+rgba[p*4+c]*a);}return out;}
async function checkedLayer(l:Layer){const b=await readFile(l.layer.path);if(hash(b)!==l.layer.sha256)throw Error('Layer hash changed');const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});if(info.width!==W||info.height!==H||info.channels!==4)throw Error('Layer geometry mismatch');return data;}
if(args[0]==='--worker'){
 const job=JSON.parse(await readFile(args[1],'utf8'))as Job;
 if(hash(await readFile(job.source))!==job.sourceSha256)throw Error('Source changed');
 const originalFrameMd5=execFileSync('ffmpeg',['-v','error','-nostdin','-threads','1','-i',job.source,'-pix_fmt','rgb24','-threads','1','-f','framemd5','-'],{encoding:'utf8',windowsHide:true,maxBuffer:200000}).split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').at(-1)!.trim());
 if(originalFrameMd5.length!==360)throw Error('Original decoded frame count mismatch');
 for(const asset of job.scene)if(hash(await readFile(asset.path))!==asset.sha256)throw Error('Scene asset changed');
 const [roomPath,tablePath]=job.scene.map(a=>a.path);
 const room=await sharp(roomPath).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
 let stage=await sharp(room).composite([{input:await readFile(tablePath)}]).removeAlpha().raw().toBuffer();
 const priorCores:{seat:number;pixels:number[];checked:number;changed:number;maximumDealerAlpha:number}[]=[];
 for(const layer of job.prior){const rgba=await checkedLayer(layer),pixels:number[]=[];for(let p=0;p<W*H;p++)if(rgba[p*4+3]===255)pixels.push(p);priorCores.push({seat:layer.seat,pixels,checked:0,changed:0,maximumDealerAlpha:0});stage=overlay(stage,rgba);}
 const withCurrent=overlay(stage,await checkedLayer(job.landed));
 const encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart',job.output],{stdio:['pipe','ignore','pipe'],windowsHide:true});
 let errors='';encoder.stderr.on('data',b=>{errors+=b.toString();});const completed=once(encoder,'close');
 const evidence=[];
 try{for(let f=0;f<360;f++){
  const sourcePng=`${job.sourceFrames}/frame-${String(f).padStart(4,'0')}.png`,b=await readFile(sourcePng),{data:raw,info}=await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true});if(info.width!==W||info.height!==H)throw Error('Source frame geometry');
  if(createHash('md5').update(raw).digest('hex')!==originalFrameMd5[f])throw Error(`Cached PNG differs from original RGB at seat${job.seat} frame${f}`);
  const keyed=keyPamelaFrame(raw,W,H),background=f>=job.landed.sourceFrame?withCurrent:stage,out=Buffer.allocUnsafe(raw.length);
  for(let p=0;p<W*H;p++){const a=keyed.alpha[p];for(let c=0;c<3;c++)out[p*3+c]=Math.round(background[p*3+c]*(1-a)+keyed.rgb[p*3+c]*a);}
  for(const core of priorCores)for(const p of core.pixels){core.checked++;core.maximumDealerAlpha=Math.max(core.maximumDealerAlpha,keyed.alpha[p]);if([0,1,2].some(c=>out[p*3+c]!==stage[p*3+c]))core.changed++;}
  if(!encoder.stdin.write(out))await once(encoder.stdin,'drain');
  if([0,1,2,150,188,job.contactFrame,240,350,357,358,359].includes(f)){
   const proofPath=`${job.run}/qa/seat-${job.seat}-frame-${String(f).padStart(4,'0')}.png`;await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(proofPath);evidence.push({frame:f,sourcePngSha256:hash(b),compositePng:{path:proofPath,sha256:hash(await readFile(proofPath))}});
  }
  if(f%60===59)console.log(`seat${job.seat}: ${f+1}/360`);
 }encoder.stdin.end();const[code]=await completed;if(code!==0)throw Error('Encoder failed '+errors);}
 catch(e){encoder.stdin.destroy();if(encoder.exitCode===null)encoder.kill();throw e;}
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',job.output],{encoding:'utf8',windowsHide:true}));
 if(probe.streams[0].nb_read_frames!=='360'||probe.streams[0].avg_frame_rate!=='30/1')throw Error('Encoded timing mismatch');
 const priorCardChecks=priorCores.map(({pixels,...record})=>({...record,opaqueCorePixels:pixels.length}));
 await writeFile(`${job.run}/part-${job.index}.json`,JSON.stringify({job,output:{path:job.output,sha256:hash(await readFile(job.output)),probe},evidence,verification:{sourceRgbEqualFrames:360,sourceFrameMd5:originalFrameMd5,priorCardChecks,priorCardCoreChanged:priorCardChecks.reduce((s,r)=>s+r.changed,0),priorCheckMeaning:'Exact native RGB against the independent prior-card stage before encoding; any changed core is reported for occlusion review, never hidden by the metric.'},limitations:['Preliminary green matte','Blank source cards, not approved artwork','Hard source seam; no blending or retiming','Static landed layer inferred from source350; current moving paper remains in dealer source']},null,2),{flag:'wx'});
 console.log(`seat${job.seat}: verified360`);
}else{
 const take=args.find(a=>a.startsWith('--take='))?.slice(7),seatList=args.find(a=>a.startsWith('--seats='))?.slice(8).split(',').map(Number);
 if(!take||!/^\d\d$/.test(take)||!seatList?.length||new Set(seatList).size!==seatList.length||seatList.some(n=>!Number.isInteger(n)||n<1||n>7))throw Error('Explicit --take=NN --seats=1,7 (or seven distinct seats) required');
 const indexPath='runs/20261109-pamela-seat-bank/bank-index.json',indexBytes=await readFile(indexPath),expectedIndex=args.find(a=>a.startsWith('--bank-index-sha256='))?.slice('--bank-index-sha256='.length);
 if(expectedIndex&&(!/^[a-f0-9]{64}$/.test(expectedIndex)||hash(indexBytes)!==expectedIndex))throw Error('Explicit bank index source hash mismatch');
 const bank=await readPamelaBankCatalog(),layerManifest=JSON.parse(await readFile('runs/20261109-pamela-landed-card-layers/manifest.json','utf8'))as{records:Layer[]};
 const parent='runs/20261109-pamela-bank-sequence';await mkdir(parent,{recursive:true});const run=`${parent}/take-${take}`;await mkdir(run);await mkdir(run+'/qa');await mkdir(run+'/render');
 const scene:SceneAsset[]=[];for(const p of scenePaths)scene.push({path:p,sha256:hash(await readFile(p))});
 const jobs:Job[]=[],prior:Layer[]=[];
 for(let index=0;index<seatList.length;index++){
  const seat=seatList[index],entry=bank.seats.find(s=>s.seat===seat),motion=bank.motions.find(m=>m.file===entry?.file),landed=layerManifest.records.find(l=>l.seat===seat&&l.sourceSha256===entry?.sha256);
  if(!entry?.file||!motion||!landed||!entry.reviewPath)throw Error(`Missing motion-reviewed source/layer for seat${seat}`);
  const sourceFrames=entry.reviewPath.slice(0,-'review.json'.length)+'frames';
  const job={index,seat,source:entry.file,sourceSha256:motion.sha256,sourceFrames,contactFrame:motion.contactFrame,output:`${run}/render/part-${index}.mp4`,prior:[...prior],landed,run,scene};jobs.push(job);prior.push(landed);
 }
 const codeFiles=['tools/pamela-bank-sequence.ts','src/pamela-key.ts','src/pamela-bank-catalog.ts'];const code=[];for(const file of codeFiles){const b=await readFile(file);code.push({file,sha256:hash(b)});await writeFile(run+'/'+file.split('/').at(-1),b,{flag:'wx'});}
 if(hash(await readFile(indexPath))!==hash(indexBytes))throw Error('Bank index changed during preparation');
 const inputs=[];for(const file of[indexPath,'runs/20261109-pamela-landed-card-layers/manifest.json']){const b=await readFile(file);inputs.push({file,sha256:hash(b)});await writeFile(run+'/'+file.split('/').at(-1),b,{flag:'wx'});}
 await writeFile(run+'/plan.json',JSON.stringify({schemaVersion:1,jobs,fps:FPS,frames:jobs.length*360,sourceTiming:'All360 original integer frames per take, hard seam, no retiming',productionAccepted:false,code,inputs,maximumWorkers:4},null,2),{flag:'wx'});
 let next=0;await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{for(;;){const i=next++;if(i>=jobs.length)return;const job=jobs[i],file=`${run}/job-${i}.json`;await writeFile(file,JSON.stringify(job),{flag:'wx'});const worker=spawn(process.execPath,[script,'--worker',file],{cwd:process.cwd(),stdio:'inherit',windowsHide:true});const[code]=await once(worker,'close');if(code!==0)throw Error('Worker failed '+i);}}));
 const concat=run+'/concat.txt';await writeFile(concat,jobs.map(j=>`file 'render/part-${j.index}.mp4'`).join('\n')+'\n',{flag:'wx'});
 const output=run+'/render/deal-sequence.mp4';execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-n','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',output],{windowsHide:true,stdio:'pipe'});
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',output],{encoding:'utf8',windowsHide:true}));
 if(Number(probe.streams[0].nb_read_frames)!==jobs.length*360||probe.streams[0].avg_frame_rate!=='30/1')throw Error('Sequence timing mismatch');
 const partRecords=await Promise.all(jobs.map(j=>readFile(`${run}/part-${j.index}.json`,'utf8').then(JSON.parse))),seams=[];
 for(let j=1;j<jobs.length;j++){
  const before=[357,358,359].map(f=>`${run}/qa/seat-${jobs[j-1].seat}-frame-${String(f).padStart(4,'0')}.png`),after=[0,1,2].map(f=>`${run}/qa/seat-${jobs[j].seat}-frame-${String(f).padStart(4,'0')}.png`),files=[...before,...after],outputs=[];
  for(const[kind,roi]of[['full',null],['face',{left:720,top:90,width:300,height:330}]]as const){const w=roi?.width??588,h=roi?.height??392,items=[];for(let i=0;i<files.length;i++){let pipe=sharp(files[i]);pipe=roi?pipe.extract(roi):pipe.resize(w,h);items.push({input:await pipe.png().toBuffer(),left:(i%3)*w,top:Math.floor(i/3)*(h+24)+24},{input:Buffer.from(`<svg width="${w}" height="24"><rect width="100%" height="100%" fill="#17202a"/><text x="5" y="17" fill="white" font-size="14">${i<3?'BEFORE':'AFTER'} source ${i<3?357+i:i-3} / seam ${j*360}</text></svg>`),left:(i%3)*w,top:Math.floor(i/3)*(h+24)});}const file=`${run}/qa/seam-${jobs[j-1].seat}-to-${jobs[j].seat}-${kind}.png`;await sharp({create:{width:w*3,height:(h+24)*2,channels:3,background:'#17202a'}}).composite(items).png().toFile(file);outputs.push({path:file,sha256:hash(await readFile(file))});}
  seams.push({fromSeat:jobs[j-1].seat,toSeat:jobs[j].seat,outputFrame:j*360,outputs,scope:'Consecutive lossless compositor PNGs before video encoding; no seam approval or timing edit.'});
 }
 await writeFile(run+'/evidence.json',JSON.stringify({schemaVersion:1,seats:seatList,output:{path:output,sha256:hash(await readFile(output)),probe},parts:jobs.map(j=>`part-${j.index}.json`),seams,verification:{sourceRgbEqualFrames:partRecords.reduce((s,p)=>s+p.verification.sourceRgbEqualFrames,0),priorCardCoreChanged:partRecords.reduce((s,p)=>s+p.verification.priorCardCoreChanged,0),priorCards:partRecords.map(p=>({seat:p.job.seat,checks:p.verification.priorCardChecks}))},productionAccepted:false,limitations:['Presentation rehearsal, not an approved runtime bank','All original holds retained; not final gameplay tempo','Preliminary matte and hard REDO seams remain','Cards persist independently but still use blank source paper']},null,2),{flag:'wx'});
 console.log(JSON.stringify({output,frames:jobs.length*360,seats:seatList,seconds:jobs.length*12}));
}
