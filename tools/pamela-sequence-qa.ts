import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const run = 'runs/20261109-pamela-sequence', name = process.argv[2];
if (!['from-shoe','central-base'].includes(name)) throw Error('Choose a sequence job');
const execute = promisify(execFile), hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const job = JSON.parse(await readFile(`${run}/${name}.json`, 'utf8'));
if (job.state !== 'SUCCEEDED' || hash(await readFile(job.output.path)) !== job.output.sha256) throw Error('Output identity not verified');
const qa = `${run}/qa/${name}`; await mkdir(qa,{recursive:true});
const probe=JSON.parse((await execute('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,codec_name,pix_fmt:format=duration','-of','json',job.output.path],{windowsHide:true,maxBuffer:10000})).stdout);
const stream=probe.streams[0], [num,den]=stream.avg_frame_rate.split('/').map(Number), frames=Number(stream.nb_frames), fps=num/den;
if (!frames || fps!==30 || frames!==job.duration*30) throw Error('Unexpected native timing; inspect before QA');
await execute('ffmpeg',['-v','error','-nostdin','-y','-i',job.output.path,'-vf','scale=256:-1,tile=10x'+Math.ceil(frames/10),'-frames:v','1','-threads','4',`${qa}/all-frames.jpg`],{windowsHide:true,timeout:120000,maxBuffer:3000});
await execute('ffmpeg',['-v','error','-nostdin','-y','-i',job.output.path,'-fps_mode','passthrough','-threads','4',`${qa}/frame-%03d.png`],{windowsHide:true,timeout:120000,maxBuffer:3000});
const comparison=[];
const regions=[{id:'face',left:620,top:70,width:220,height:250},{id:'hands-and-shoe',left:500,top:520,width:1000,height:290}];
for(const [index,input] of [[0,job.first],[frames-1,job.last]] as const){
  const framePath=`${qa}/frame-${String(index+1).padStart(3,'0')}.png`, frameBytes=await readFile(framePath);
  const anchorBytes=await readFile(input.path);if(hash(anchorBytes)!==input.sha256)throw Error('Input hash mismatch');
  const expected=await sharp(anchorBytes).removeAlpha().raw().toBuffer();
  const actual=await sharp(frameBytes).resize(1536,1024,{fit:'contain',background:{r:0,g:255,b:0}}).removeAlpha().raw().toBuffer();
  const metrics=regions.map(r=>{let sum=0;for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++)for(let c=0;c<3;c++)sum+=Math.abs(expected[(y*1536+x)*3+c]-actual[(y*1536+x)*3+c]);return{...r,meanAbsoluteRgbDifference:sum/(r.width*r.height*3)};});
  comparison.push({frameIndex:index,pts:index/fps,path:framePath,sha256:hash(frameBytes),anchorSha256:input.sha256,metrics});
}
const record={schemaVersion:1,measuredAt:new Date().toISOString(),job:`${run}/${name}.json`,film:{...job.output,width:stream.width,height:stream.height,fps,frameCount:frames,duration:Number(probe.format.duration),codec:stream.codec_name,pixelFormat:stream.pix_fmt},poseBefore:job.poseBefore,poseAfter:job.poseAfter,cardStateBefore:job.cardStateBefore,cardStateAfter:job.cardStateAfter,contactSheet:{path:`${qa}/all-frames.jpg`,frames,meaning:'All frames indexed at reduced resolution; no anatomy or motion acceptance'},nativeFrames:{pattern:`${qa}/frame-%03d.png`,numbering:'Filename 001 = frameIndex 0; time=frameIndex/fps'},endpointMeasurement:{fit:'contain',target:[1536,1024],uniformScale:Math.min(1536/stream.width,1024/stream.height),meaning:'Image difference metric only, not acceptance of identity, pose, velocity or card contact',comparison},productionAccepted:false,visualReview:{status:'pending',nativeFrameIndices:[],findings:[]},cardTrack:null,handMask:null};
await writeFile(`${qa}/inspection.json`,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({film:record.film,contactSheet:record.contactSheet,endpointDifferences:comparison.map(c=>({frame:c.frameIndex,metrics:c.metrics}))}));
