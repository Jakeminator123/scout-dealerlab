import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),root='runs/20261108-pamela-deal-pilot';
const sha=async(p:string)=>createHash('sha256').update(await readFile(p)).digest('hex');
async function cardObservations(path:string){
 const result=await exec('ffmpeg',['-v','error','-nostdin','-i',path,'-vf','scale=540:960','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer',maxBuffer:110000000,windowsHide:true});
 const bytes=result.stdout as unknown as Buffer,size=540*960*3,frames=[];
 if(bytes.length%size)throw Error('Incomplete decoded frame.');
 for(let frame=0;frame<bytes.length/size;frame++){
  const mask=new Uint8Array(540*270),base=frame*size;
  for(let y=0;y<270;y++)for(let x=100;x<510;x++){const i=base+((y+380)*540+x)*3,r=bytes[i],g=bytes[i+1],b=bytes[i+2];if(r>205&&g>205&&b>200&&Math.max(r,g,b)-Math.min(r,g,b)<42)mask[y*540+x]=1;}
  let best:any=null;
  for(let i=0;i<mask.length;i++){if(!mask[i])continue;const todo=[i];mask[i]=0;let count=0,minX=540,minY=270,maxX=0,maxY=0,sx=0,sy=0;
   while(todo.length){const p=todo.pop()!,x=p%540,y=Math.floor(p/540);count++;sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const q of [x>0?p-1:-1,x<539?p+1:-1,y>0?p-540:-1,y<269?p+540:-1])if(q>=0&&mask[q]){mask[q]=0;todo.push(q);}}
   if(count>30&&(!best||count>best.samplePixels))best={samplePixels:count,bounds:[minX*2,(minY+380)*2,(maxX-minX+1)*2,(maxY-minY+1)*2],centroid:[sx/count*2,(sy/count+380)*2]};
  }
  frames.push({frame,seconds:frame/24,whiteCandidate:best});
 }
 return{path,sha256:await sha(path),decodedFrames:frames.length,method:'Thresholded white connected component in a fixed lower-image region. Approximate QA observations only; not corners, occlusion masks or calibrated card tracks.',frames};
}
const suffix=process.argv[2]==='rigid-short'?'-rigid-short':'';
const source=`${root}/original/pamela-pos4-iv-aleph2${suffix}.mp4`;
const report=await cardObservations(source);
await writeFile(`${root}/qa/card-observations${suffix}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({path:source,decodedFrames:report.decodedFrames,firstDetection:report.frames.find(f=>f.whiteCandidate),land:report.frames[48],last:report.frames.at(-1)}));
if(!suffix){
 const base='runs/20261108210457-pamela-v4-focused/qa';
 const parse=(s:string)=>s.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const p=l.split(',').map(x=>x.trim());return{pts:Number(p[2]),md5:p[5]};});
 const original=parse(await readFile(`${base}/original-frames.md5`,'utf8')),derived=parse(await readFile(`${base}/preview30-frames-before-encoding.md5`,'utf8'));
 const mapping=derived.map(d=>{const candidates=original.filter(o=>o.md5===d.md5).sort((a,b)=>Math.abs(a.pts/24-d.pts/30)-Math.abs(b.pts/24-d.pts/30));if(!candidates.length)throw Error('Derived frame has no matching decoded source frame.');return{outputFrame:d.pts,sourceFrame:candidates[0].pts,outputTime:d.pts/30,sourceTime:candidates[0].pts/24};});
 await writeFile(`${base}/preview30-provenance.json`,JSON.stringify({source:{path:'runs/20261108210457-pamela-v4-focused/original/pamela-v4-vila-gen45-5s.mp4',frames:121,fps:24,duration:121/24},output:{path:`${base}/pamela-v4-vila-preview-30fps.mp4`,sha256:await sha(`${base}/pamela-v4-vila-preview-30fps.mp4`),frames:151,fps:30,duration:151/30},durationDeltaSeconds:151/30-121/24,method:'ffmpeg fps=30:round=near, duplicated/dropped decoded frames before H.264 encoding, no interpolation; no game event tracks remapped.',allDerivedFramesMatched:true,mapping},null,2));
 const seams=[];
 for(const [name,last]of [['gen45',120],['wan3',149]]as const){
  const file=`runs/20261108-pamela-model-comparison/original/pamela-v4-${name}-padded-idle.mp4`;
  const result=await exec('ffmpeg',['-v','error','-nostdin','-i',file,'-vf',`select=eq(n\\,0)+eq(n\\,${last})`,'-fps_mode','vfr','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{encoding:'buffer',maxBuffer:6500000,windowsHide:true});
  const data=result.stdout as unknown as Buffer,size=1104*832*3;if(data.length!==size*2)throw Error('Expected exactly two endpoint frames.');
  const regions=[];
  for(const [label,x,y,w,h]of [['face',400,100,310,320],['hands',310,590,480,180]]as const){let sum=0,count=0;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*1104+xx)*3;const green=(j:number)=>data[j+1]>1.3*Math.max(data[j],data[j+2]);if(green(i)&&green(i+size))continue;for(let k=0;k<3;k++)sum+=Math.abs(data[i+k]-data[i+size+k]);count+=3;}regions.push({label,rgbMeanAbsoluteDifference:sum/count,range:255,componentCount:count});}
  seams.push({name,path:file,sha256:await sha(file),comparedFrames:[0,last],regions});
 }
 await writeFile('runs/20261108-pamela-model-comparison/qa/endpoint-difference.json',JSON.stringify({method:'RGB mean absolute difference of fixed foreground face/hand regions at first/last decoded frame. Measures pixel change, not perceptual quality or motion velocity across a loop.',seams},null,2));
 console.log(JSON.stringify({preview30MappedFrames:mapping.length,seams}));
}
