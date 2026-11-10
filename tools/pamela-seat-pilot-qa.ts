import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
const seat=Number(process.argv.find(a=>a.startsWith('--seat='))?.slice(7));
if(![1,7].includes(seat))throw Error('Expected --seat=1|7');
sharp.concurrency(1);
const run='runs/20261109-pamela-seat-pilot-plan',dir=`${run}/qa/seat-${seat}`;
const receipt=JSON.parse(await readFile(`${run}/seat-${seat}.json`,'utf8'));
if(receipt.state!=='SUCCEEDED'||!receipt.output?.path)throw Error('Download completed source first');
const bytes=await readFile(receipt.output.path),hash=createHash('sha256').update(bytes).digest('hex');
if(hash!==receipt.output.sha256)throw Error('Original has changed');
const probe=receipt.output.probe,stream=probe.streams[0];
const [a,b]=stream.avg_frame_rate.split('/').map(Number),fps=a/b,count=Number(stream.nb_read_frames),W=Number(stream.width),H=Number(stream.height);
if(!Number.isFinite(fps)||!Number.isInteger(count)||count<1)throw Error('Missing frame evidence');
await mkdir(`${run}/qa`,{recursive:true});await mkdir(dir);await mkdir(`${dir}/frames`);
const execute=promisify(execFile),ffmpeg='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe';
await execute(ffmpeg,['-v','error','-nostdin','-threads','1','-i',receipt.output.path,'-map','0:v:0','-fps_mode','passthrough','-threads','1','-n',`${dir}/frames/frame-%04d.png`],{windowsHide:true,maxBuffer:100000});
const file=(f:number)=>`${dir}/frames/frame-${String(f+1).padStart(4,'0')}.png`;
await stat(file(count-1));
const columns=6,thumbW=352,thumbH=Math.round(H/W*thumbW),rowH=thumbH+28;
const sample=Array.from({length:Math.ceil(count/5)},(_,i)=>i*5);if(sample.at(-1)!==count-1)sample.push(count-1);
for(let start=0;start<sample.length;start+=36){
 const chunk=sample.slice(start,start+36),composites=[];
 for(let i=0;i<chunk.length;i++){
  const f=chunk[i],x=i%columns*thumbW,y=Math.floor(i/columns)*rowH;
  composites.push({input:await sharp(file(f)).resize(thumbW,thumbH).png().toBuffer(),left:x,top:y+28});
  composites.push({input:Buffer.from(`<svg width="${thumbW}" height="28"><text x="8" y="20" fill="white" font-size="17">${f} · ${(f/fps).toFixed(2)} s</text></svg>`),left:x,top:y});
 }
 await sharp({create:{width:columns*thumbW,height:Math.ceil(chunk.length/columns)*rowH,channels:3,background:'#17202a'}}).composite(composites).png().toFile(`${dir}/contact-${String(start/36+1).padStart(2,'0')}.png`);
}
await writeFile(`${dir}/metadata.json`,JSON.stringify({source:receipt.output.path,sourceSha256:hash,taskId:receipt.taskId,seat,width:W,height:H,fps,frames:count,duration:Number(probe.format.duration),extractedFrames:count,contactSampleStride:5,originalPreserved:true,frameNumbering:'0-based source; PNG filename is sourceFrame+1',productionAccepted:false,qa:'awaiting visual motion and endpoint inspection'},null,2));
console.log(JSON.stringify({seat,width:W,height:H,fps,frames:count,qaDirectory:dir}));
