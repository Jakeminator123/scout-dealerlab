import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {keyPamelaFrame} from '../src/pamela-key.ts';

// Local endpoint study. No source retiming, interpolation, face warp or paid calls.
sharp.concurrency(1);
const W=1762,H=1174,execute=promisify(execFile);
const source='runs/20261109-pamela-seat-bank/original/pamela-seat-1-wan3-first-last.mp4';
const sourceHash='5abd5dd1107d7433c8efc0d95164c2c7af3b2b9703f1123c87f8f02da378bc0b';
const root='runs/20261109-pamela-redo-endpoints';
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7)??'01';
if(!/^\d{2}$/.test(take))throw Error('Use an unused two-digit take');
const run=`${root}/take-${take}`,bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
const sha=(b:Buffer,algorithm='sha256')=>createHash(algorithm).update(b).digest('hex');
assert.equal(sha(await readFile(source)),sourceHash);
await mkdir(root,{recursive:true});await mkdir(run);
for(const sub of ['source','qa','endpoints','layers','render','snapshot'])await mkdir(`${run}/${sub}`);
const snapPaths=['tools/pamela-redo-endpoints.ts','src/pamela-key.ts','runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png','runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png'];
const snapshots=[];
for(const path of snapPaths){const b=await readFile(path);snapshots.push({path,sha256:sha(b)});await writeFile(`${run}/snapshot/${path.replaceAll('/','__')}`,b);}
const sourcePath=(f:number)=>`${run}/source/frame-${String(f).padStart(4,'0')}.png`;
await Promise.all([[0,29],[300,359]].map(async([first,last])=>execute(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-i',source,'-vf',`select=between(n\\,${first}\\,${last})`,'-fps_mode','passthrough','-start_number',String(first),'-threads','2',`${run}/source/frame-%04d.png`],{windowsHide:true})));
const timeline=[...Array.from({length:60},(_,i)=>300+i),...Array.from({length:30},(_,i)=>i)],critical=[0,356,357,358,359];
const frame=async(f:number)=>sharp(sourcePath(f)).removeAlpha().raw().toBuffer();
const png=(b:Buffer,c:1|3|4=3)=>sharp(b,{raw:{width:W,height:H,channels:c}}).png().toBuffer();
type ROI={left:number;top:number;width:number;height:number};
const rois:Record<string,ROI>={
  dealer_pose:{left:530,top:70,width:840,height:820},
  face:{left:755,top:150,width:220,height:230},
  resting_hand:{left:620,top:740,width:250,height:150},
  shoe_hand:{left:1225,top:620,width:150,height:180},
  shoe_body:{left:1375,top:630,width:330,height:270},
  dealt_card:{left:110,top:875,width:280,height:120}
};
const green=(b:Buffer,p:number)=>{const i=p*3;return b[i+1]>50&&b[i+1]>b[i]*1.18&&b[i+1]>b[i+2]*1.18;};
function difference(a:Buffer,b:Buffer,roi:ROI){
 let count=0,sum=0,squared=0,changed=0,max=0;
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
  const p=y*W+x;if(green(a,p)&&green(b,p))continue;let pixelMax=0;
  for(let c=0;c<3;c++){const d=Math.abs(a[p*3+c]-b[p*3+c]);sum+=d;squared+=d*d;max=Math.max(max,d);pixelMax=Math.max(pixelMax,d);}count++;if(pixelMax>12)changed++;
 }
 return {foregroundUnionPixels:count,maeRgb:count?sum/(count*3):0,rmseRgb:count?Math.sqrt(squared/(count*3)):0,maxChannelDifference:max,changedOver12Percent:count?100*changed/count:0};
}
function centroid(raw:Buffer,roi:ROI,kind:'skin'|'paper'){
 let n=0,sx=0,sy=0;for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
 const i=(y*W+x)*3,r=raw[i],g=raw[i+1],b=raw[i+2];const ok=kind==='skin'?r>145&&g>65&&b>40&&r-g>20&&r-b>35:r>200&&g>200&&b>190&&Math.max(r,g,b)-Math.min(r,g,b)<40;
 if(ok){n++;sx+=x;sy+=y;}}
 return {pixels:n,x:n?sx/n:null,y:n?sy/n:null};
}
function translationDiagnostic(a:Buffer,b:Buffer,roi:ROI){
 let best={dx:0,dy:0,sampledMae:Infinity};
 for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
  let sum=0,n=0;for(let y=roi.top+8;y<roi.top+roi.height-8;y+=4)for(let x=roi.left+8;x<roi.left+roi.width-8;x+=4){const p=y*W+x,q=(y+dy)*W+x+dx;if(green(a,p)&&green(b,q))continue;for(let c=0;c<3;c++){sum+=Math.abs(a[p*3+c]-b[q*3+c]);n++;}}
  const sampledMae=sum/Math.max(1,n);if(sampledMae<best.sampledMae)best={dx,dy,sampledMae};
 }return best;
}
const start=await frame(0),reference=await frame(356),records=[];
let previous:Buffer|undefined;
for(const f of timeline){
 const raw=await frame(f),bytes=await readFile(sourcePath(f));
 const bankPath=`runs/20261109-pamela-seat-bank/qa/seat-1/frames/frame-${String(f).padStart(4,'0')}.png`;
 assert.equal(sha(raw,'md5'),sha(await sharp(bankPath).removeAlpha().raw().toBuffer(),'md5'));
 const deltaToStart=Object.fromEntries(Object.entries(rois).map(([name,roi])=>[name,difference(start,raw,roi)]));
 const deltaFromPrevious=previous?Object.fromEntries(Object.entries(rois).map(([name,roi])=>[name,difference(previous!,raw,roi)])):null;
 const translation=critical.includes(f)?Object.fromEntries(Object.entries(rois).filter(([name])=>name!=='dealt_card').map(([name,roi])=>[name,translationDiagnostic(start,raw,roi)])):null;
 records.push({sourceFrame:f,sourcePath:sourcePath(f),sourceFrameSha256:sha(bytes),sourceRgbMd5:sha(raw,'md5'),matchesExistingBankFrame:true,deltaToStart,deltaFromPrevious,translationDiagnosticOnly:translation,restingHandSkin:centroid(raw,rois.resting_hand,'skin'),shoeHandSkin:centroid(raw,rois.shoe_hand,'skin'),cardPaper:centroid(raw,rois.dealt_card,'paper')});previous=raw;
}
// A source-bound landed card is stable in its own layer. The broad paper ROI is
// cleared only in the extracted presentation layer, never in original frames.
const card=Buffer.alloc(W*H*4),keyedReference=keyPamelaFrame(reference,W,H),cardRoi=rois.dealt_card;
let cardPixels=0;for(let y=cardRoi.top;y<cardRoi.top+cardRoi.height;y++)for(let x=cardRoi.left;x<cardRoi.left+cardRoi.width;x++){
 const p=y*W+x,a=keyedReference.alpha[p];if(a<=0)continue;for(let c=0;c<3;c++)card[p*4+c]=keyedReference.rgb[p*3+c];card[p*4+3]=Math.round(a*255);cardPixels++;
}
const cardPath=`${run}/layers/dealt-card-source-0356.png`;await writeFile(cardPath,await png(card,4));
const room=await sharp(snapPaths[2]).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const stage=await sharp(room).composite([{input:await readFile(snapPaths[3])}]).removeAlpha().raw().toBuffer();
await writeFile(`${run}/qa/target-stage.png`,await png(stage));
function composite(raw:Buffer){
 const keyed=keyPamelaFrame(raw,W,H),out=Buffer.from(stage),layer=Buffer.alloc(W*H*4);let opaqueChanged=0,opaqueChecked=0;
 for(let p=0;p<W*H;p++){
  const x=p%W,y=Math.floor(p/W),inCard=x>=cardRoi.left&&x<cardRoi.left+cardRoi.width&&y>=cardRoi.top&&y<cardRoi.top+cardRoi.height;
  const a=inCard?0:keyed.alpha[p],ca=card[p*4+3]/255;
  for(let c=0;c<3;c++){out[p*3+c]=Math.round(out[p*3+c]*(1-ca)+card[p*4+c]*ca);out[p*3+c]=Math.round(out[p*3+c]*(1-a)+keyed.rgb[p*3+c]*a);layer[p*4+c]=keyed.rgb[p*3+c];}
  layer[p*4+3]=Math.round(a*255);
  if(a===1&&raw[p*3+1]-Math.max(raw[p*3],raw[p*3+2])<8){opaqueChecked++;if([0,1,2].some(c=>out[p*3+c]!==raw[p*3+c]))opaqueChanged++;}
 }
 assert.equal(opaqueChanged,0);return {out,layer,opaqueChecked,opaqueChanged};
}
function encoder(path:string,width:number,height:number){
 const child=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','14','-preset','fast','-pix_fmt','yuv420p','-threads','1',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b.toString());const done=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(stderr)));});
 return {async write(data:Buffer){if(!child.stdin.write(data))await once(child.stdin,'drain');},async finish(){child.stdin.end();await done;},abort(){child.stdin.destroy();child.kill();}};
}
const videos=[{name:'raw-end-to-start',width:W,height:H},{name:'persistent-card-end-to-start',width:W,height:H},{name:'raw-vs-persistent-card',width:1280,height:454}];
const enc=videos.map(v=>encoder(`${run}/render/${v.name}.mp4`,v.width,v.height));
const preservation=[],endpointOutputs=[];
try{
 for(const [index,f] of timeline.entries()){
  const raw=await frame(f),result=composite(raw);preservation.push({sourceFrame:f,opaqueSourcePixelsChecked:result.opaqueChecked,opaqueSourcePixelsChanged:result.opaqueChanged});
  const small=await Promise.all([raw,result.out].map(b=>sharp(b,{raw:{width:W,height:H,channels:3}}).resize(640,426).raw().toBuffer()));
  const label=Buffer.from(`<svg width="1280" height="28"><rect width="1280" height="28" fill="#17202a"/><text x="10" y="20" fill="white" font-size="17">RAW source ${f}; seam at output 60</text><text x="650" y="20" fill="white" font-size="17">Separate card persists; source ${f}</text></svg>`);
  const preview=await sharp({create:{width:1280,height:454,channels:3,background:'#17202a'}}).composite([{input:small[0],raw:{width:640,height:426,channels:3},left:0,top:28},{input:small[1],raw:{width:640,height:426,channels:3},left:640,top:28},{input:label,left:0,top:0}]).removeAlpha().raw().toBuffer();
  await Promise.all([enc[0].write(raw),enc[1].write(result.out),enc[2].write(preview)]);
  if(critical.includes(f)){
   for(const [kind,data,c] of [['source',raw,3],['composite',result.out,3],['dealer-and-shoe',result.layer,4]] as const){const path=`${run}/endpoints/${kind}-${String(f).padStart(4,'0')}.png`;const b=await png(data,c);await writeFile(path,b);endpointOutputs.push({path,sha256:sha(b)});}
  }
  if(index%15===0)console.log(`Rendered ${index+1}/90; source ${f}`);
 }
 await Promise.all(enc.map(e=>e.finish()));
}catch(error){enc.forEach(e=>e.abort());throw error;}
async function sheet(name:string,frames:number[],roi:ROI,cols:number){
 const cellH=roi.height+24,rows=Math.ceil(frames.length/cols),items=[];
 for(const [i,f] of frames.entries()){
  const image=await sharp(sourcePath(f)).extract(roi).png().toBuffer(),left=(i%cols)*roi.width,top=Math.floor(i/cols)*cellH;
  items.push({input:image,left,top:top+24},{input:Buffer.from(`<svg width="${roi.width}" height="24"><rect width="100%" height="100%" fill="#17202a"/><text x="5" y="18" fill="white" font-size="16">source ${f} / ${(f/30).toFixed(3)}s</text></svg>`),left,top});
 }
 const path=`${run}/qa/${name}.png`;await sharp({create:{width:cols*roi.width,height:rows*cellH,channels:3,background:'#17202a'}}).composite(items).png().toFile(path);return {path,sha256:sha(await readFile(path)),nativeCropScale:1};
}
const sheets=[];
for(const [name,roi] of Object.entries(rois))sheets.push(await sheet(`endpoints-${name}`,critical,roi,5));
for(const name of ['face','resting_hand','shoe_hand','shoe_body','dealt_card'])for(let part=0;part<3;part++)sheets.push(await sheet(`all90-${name}-${part+1}`,timeline.slice(part*30,part*30+30),rois[name],6));
const outputVideos=[];for(const v of videos){
 const path=`${run}/render/${v.name}.mp4`,probe=JSON.parse((await execute(`${bin}/ffprobe.exe`,['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames,duration','-of','json',path],{windowsHide:true})).stdout).streams[0];
 assert.equal(probe.nb_read_frames,'90');assert.equal(probe.avg_frame_rate,'30/1');assert.equal(probe.duration,'3.000000');outputVideos.push({path,sha256:sha(await readFile(path)),...probe});
}
const metrics={createdAt:new Date().toISOString(),source,sourceSha256:sourceHash,taskId:'5b3500be-1c19-4211-be95-9f423f95ef4f',model:'wan3',fps:30,nativeSize:[W,H],sourceIndexing:'zero-based',timeline,cutAfterOutputIndex:59,cutFromSource:359,cutToSource:0,rois,metricDefinition:'RGB8 absolute differences on union of non-green pixels. changedOver12Percent counts pixels with at least one channel delta >12. Translation search is diagnostic only, ±6px; no image is transformed.',records,preservation,cardLayer:{path:cardPath,sourceFrame:356,sourceFrameSha256:records.find(r=>r.sourceFrame===356)!.sourceFrameSha256,sha256:sha(await readFile(cardPath)),supportPixels:cardPixels,roi:cardRoi,method:'Existing keyPamelaFrame restricted to isolated paper ROI; unchanged layer composited over all90 frames. The source card region is excluded from dealer/shoe extraction. No hand enters this ROI in this endpoint window.'},snapshots,endpointOutputs,sheets,videos:outputVideos,newPaidJobs:0,faceWarp:false,interpolation:false,retiming:false,status:'awaiting-native-contact-review'};
await writeFile(`${run}/evidence.json`,JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({run,endpointMetrics:records.filter(r=>critical.includes(r.sourceFrame)).map(r=>({frame:r.sourceFrame,face:r.deltaToStart.face,restingHand:r.deltaToStart.resting_hand,shoeHand:r.deltaToStart.shoe_hand,shoe:r.deltaToStart.shoe_body,card:r.cardPaper})),videos:outputVideos}));
