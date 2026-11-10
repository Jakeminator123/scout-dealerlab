import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const execute=promisify(execFile),run='runs/20261109-pamela-idle-composite',file=`${run}/composition.json`;
const report=JSON.parse(await readFile(file,'utf8')),order=['breath','breath','glance','breath'];
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sequence:Record<string,unknown>={method:'lossless stream-copy concat; no freeze, retiming or crossfade',segments:[{clip:'breath',from:0,to:179},{clip:'breath',from:180,to:359},{clip:'glance',from:360,to:449},{clip:'breath',from:450,to:629}]};
for(const kind of ['native','portrait']){
 const sources=order.map(n=>report.clips.find((c:any)=>c.name===n)[kind]);
 for(const s of sources)if(hash(await readFile(s.path))!==s.sha256)throw Error('Source changed');
 const list=`${run}/render/${kind}-sequence.txt`,output=`${run}/render/pamela-idle-andning-blick-${kind}-v1.mp4`;
 await writeFile(list,sources.map(s=>`file '${path.basename(s.path)}'`).join('\n')+'\n');
 await execute('ffmpeg',['-v','error','-nostdin','-f','concat','-safe','0','-i',list,'-map','0:v:0','-c','copy','-movflags','+faststart','-n',output],{windowsHide:true,maxBuffer:3000});
 const {stdout}=await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',output],{windowsHide:true,maxBuffer:4000});
 const p=JSON.parse(stdout),s=p.streams[0],rate=s.avg_frame_rate.split('/').map(Number),bytes=await readFile(output);
 if(Number(s.nb_read_frames)!==630||rate[0]/rate[1]!==30)throw Error('Sequence timeline changed');
 await execute('ffmpeg',['-v','error','-nostdin','-i',output,'-f','null','-'],{windowsHide:true,maxBuffer:3000});
 sequence[kind]={path:output,sha256:hash(bytes),bytes:bytes.length,width:s.width,height:s.height,fps:30,frameCount:630,duration:Number(p.format.duration)};
}
report.sequence=sequence;
await writeFile(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(sequence));
