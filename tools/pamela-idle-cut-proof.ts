import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';

const execute=promisify(execFile),run='runs/20261109-pamela-idle-cut-proof';
const parentReport='runs/20261109-pamela-idle-composite/composition.json';
const reportBytes=await readFile(parentReport),report=JSON.parse(reportBytes.toString());
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const runText=async(args:string[])=>execute('ffmpeg',args,{windowsHide:true,maxBuffer:4*1024*1024});
async function probe(path:string){
  const {stdout}=await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,codec_name,pix_fmt:format=duration','-of','json',path],{windowsHide:true,maxBuffer:5000});
  const info=JSON.parse(stdout),s=info.streams[0];
  return {width:s.width,height:s.height,rFrameRate:s.r_frame_rate,avgFrameRate:s.avg_frame_rate,frameCount:Number(s.nb_read_frames),durationSeconds:Number(info.format.duration),codec:s.codec_name,pixelFormat:s.pix_fmt};
}
const inputs:Record<string,any>={};
for(const name of ['breath','glance']){
  const entry=report.clips.find((c:any)=>c.name===name);
  const bytes=await readFile(entry.native.path),metadata=await probe(entry.native.path);
  if(sha(bytes)!==entry.native.sha256||metadata.width!==1762||metadata.height!==1174||metadata.avgFrameRate!=='30/1'||metadata.frameCount!==(name==='breath'?180:90))throw Error(`Unexpected native ${name} composition identity/format`);
  inputs[name]={path:entry.native.path,sha256:sha(bytes),bytes:bytes.length,...metadata,originalSource:entry.source};
}
for(const folder of ['render','qa'])await mkdir(`${run}/${folder}`,{recursive:true});
const cases=[{id:'a-original-cut',glanceStart:0},{id:'b-trimmed-entry-candidate',glanceStart:12}];
const outputRecords:any[]=[];
const frameHashes=(text:string)=>text.split(/\r?\n/).filter(line=>line.trim()&&!line.startsWith('#')).map(line=>line.split(',').at(-1)!.trim());
for(const variant of cases){
  const path=`${run}/render/${variant.id}.mp4`;
  const filter=`[0:v]trim=start_frame=150:end_frame=180,setpts=PTS-STARTPTS[a];[1:v]trim=start_frame=${variant.glanceStart}:end_frame=${variant.glanceStart+30},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]`;
  const sourceArgs=['-v','error','-nostdin','-i',inputs.breath.path,'-i',inputs.glance.path,'-filter_complex_threads','4','-filter_complex',filter,'-map','[v]','-an'];
  // CRF 0 preserves the decoded YUV420 source pixels. The per-frame equality
  // check below independently verifies that the cut adds no image treatment.
  await runText([...sourceArgs,'-c:v','libx264','-crf','0','-preset','fast','-pix_fmt','yuv420p','-threads','4','-fps_mode','passthrough','-movflags','+faststart','-n',path]);
  const metadata=await probe(path);
  if(metadata.width!==1762||metadata.height!==1174||metadata.frameCount!==60||metadata.avgFrameRate!=='30/1'||Math.abs(metadata.durationSeconds-2)>1e-6)throw Error(`Unexpected output timing: ${variant.id}`);
  const expected=frameHashes((await runText([...sourceArgs,'-c:v','rawvideo','-pix_fmt','yuv420p','-threads','4','-f','framemd5','pipe:1'])).stdout);
  const actual=frameHashes((await runText(['-v','error','-nostdin','-i',path,'-map','0:v:0','-an','-c:v','rawvideo','-pix_fmt','yuv420p','-threads','4','-f','framemd5','pipe:1'])).stdout);
  if(expected.length!==60||actual.length!==60||expected.some((hash,i)=>hash!==actual[i]))throw Error(`Source-pixel preservation check failed: ${variant.id}`);
  const frames=Array.from({length:60},(_,outputFrame)=>{
    const sourceClip=outputFrame<30?'breath':'glance';
    const sourceFrame=outputFrame<30?150+outputFrame:variant.glanceStart+outputFrame-30;
    return {outputFrame,outputTimeSeconds:outputFrame/30,sourceClip,sourceFrame,sourceTimeSeconds:sourceFrame/30,decodedYuv420Md5:actual[outputFrame]};
  });
  const bytes=await readFile(path);
  outputRecords.push({id:variant.id,path,sha256:sha(bytes),bytes:bytes.length,...metadata,status:'unpublished-cut-candidate-not-accepted',segments:[{clip:'breath',sourceFramesInclusive:[150,179],outputFramesInclusive:[0,29]},{clip:'glance',sourceFramesInclusive:[variant.glanceStart,variant.glanceStart+29],outputFramesInclusive:[30,59]}],seam:{outputFrame:30,outputTimeSeconds:1},decodedFramesExactlyMatchSourceSelection:true,frames});
  console.log(`${variant.id}: 60 frames, 30 fps, 2 seconds; 60/60 decoded frames equal input selection`);
}
const panels:{input:Buffer,left:number,top:number}[]=[];
for(let row=0;row<2;row++)for(let column=0;column<4;column++){
  const output=outputRecords[row],outFrame=[28,29,30,31][column],frame=output.frames[outFrame];
  const decoded=await execute('ffmpeg',['-v','error','-nostdin','-i',output.path,'-vf',`select=eq(n\\,${outFrame})`,'-frames:v','1','-threads','4','-f','image2pipe','-vcodec','png','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024*1024});
  const face=await sharp(decoded.stdout).extract({left:746,top:69,width:298,height:321}).png().toBuffer();
  const hands=await sharp(decoded.stdout).extract({left:619,top:745,width:482,height:172}).png().toBuffer();
  const label=Buffer.from(`<svg width="512" height="32"><rect width="512" height="32" fill="#10191c"/><text x="10" y="21" fill="white" font-family="Arial" font-size="16">${row===0?'A':'B'} | output ${outFrame} | ${frame.sourceClip} ${frame.sourceFrame}</text></svg>`);
  const panel=await sharp({create:{width:512,height:540,channels:3,background:'#10191c'}}).composite([{input:label,left:0,top:0},{input:face,left:107,top:34},{input:hands,left:15,top:364}]).png().toBuffer();
  panels.push({input:panel,left:column*512,top:row*540});
}
const sheet=`${run}/qa/seam-face-hands.png`;
await sharp({create:{width:2048,height:1080,channels:3,background:'#10191c'}}).composite(panels).png().toFile(sheet);
for(const input of Object.values(inputs))if(sha(await readFile(input.path))!==input.sha256)throw Error('Input changed during proof run');
await writeFile(`${run}/metadata.json`,JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),status:'local-ab-cut-proof-pending-root-review',productionAccepted:false,rootPublicationRequired:true,sourceManifest:{path:parentReport,sha256:sha(reportBytes)},inputs,outputs:outputRecords,contactSheet:{path:sheet,sha256:sha(await readFile(sheet)),width:2048,height:1080,source:'Decoded proof videos; native-resolution face and hand crops, not cropped proof films',outputFrames:[28,29,30,31]},processing:{fps:30,fullScene:true,canvas:[1762,1174],losslessReencodeOfDecodedYuv420:true,freeze:false,crossfade:false,reverse:false,retime:false,newCardLayers:false,newGeneration:false,timestampHandling:'Each selected existing frame segment rebased to zero PTS and concatenated; duration/content equality verified.'},limitations:['B removes the first 12 glance frames; it is a candidate, not accepted seam repair.','The previously measured approximately 21% lower facial RGB delta applies to raw breath179 versus raw glance12 compared with glance0. It is not a physical pose or perceptual acceptance score.','This test preserves the existing composition, including its source appearance and any existing defects.','Eye direction, endpoint velocity, face detail and hand continuity still require playback review.'],runtime:{node:process.version,ffmpegThreads:4},code:{path:'tools/pamela-idle-cut-proof.ts',sha256:sha(await readFile('tools/pamela-idle-cut-proof.ts'))}},null,2)+'\n');
console.log(JSON.stringify({run,contactSheet:sheet,outputs:outputRecords.map(({id,path,sha256})=>({id,path,sha256}))}));
