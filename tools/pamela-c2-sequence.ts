/** Two 12-second raw takes, one explicit seam. Source cards remain a reference. */
import{mkdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawn,execFileSync}from'node:child_process';
import{once}from'node:events';
import path from'node:path';
import sharp from'sharp';
import{keyPamelaFrame}from'../src/pamela-key.ts';
sharp.concurrency(1);
const W=1762,H=1174,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),parent='runs/20261109-pamela-c2-sequence',run=parent+'/take-01';
const root='runs/20261109-pamela-seat-bank/c2/seat-1-c2-feasibility-v1',reviewFile=root+'/qa/seat-1/review.json',reviewBytes=await readFile(reviewFile),review=JSON.parse(reviewBytes.toString());
if(review.decision!=='feasibility-passed-motion-candidate'||hash(await readFile(review.source))!==review.sourceSha256)throw Error('C2 source/review mismatch');
const first=JSON.parse(await readFile('runs/20261109-pamela-bank-sequence/take-02/part-0.json','utf8')).output;
if(hash(await readFile(first.path))!==first.sha256)throw Error('First-part hash mismatch');
await mkdir(parent,{recursive:true});await mkdir(run);await mkdir(run+'/qa');await mkdir(run+'/render');
const roomPath='runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png',tablePath='runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png',roomBytes=await readFile(roomPath),tableBytes=await readFile(tablePath);
const room=await sharp(roomBytes).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const stage=await sharp(room).composite([{input:tableBytes}]).removeAlpha().raw().toBuffer();
const part=run+'/render/c2-stage.mp4',encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart',part],{stdio:['pipe','ignore','pipe'],windowsHide:true});
let errors='';encoder.stderr.on('data',b=>errors+=b.toString());const done=once(encoder,'close'),evidence=[];
try{for(let f=0;f<360;f++){
 const sourceFramePath=root+`/qa/seat-1/frames/frame-${String(f).padStart(4,'0')}.png`,sourceBytes=await readFile(sourceFramePath),{data:rgb,info}=await sharp(sourceBytes).removeAlpha().raw().toBuffer({resolveWithObject:true});if(info.width!==W||info.height!==H)throw Error('Frame geometry mismatch');
 const key=keyPamelaFrame(rgb,W,H),output=Buffer.allocUnsafe(rgb.length);for(let p=0;p<W*H;p++){const a=key.alpha[p];for(let c=0;c<3;c++)output[p*3+c]=Math.round(stage[p*3+c]*(1-a)+key.rgb[p*3+c]*a);}
 if(!encoder.stdin.write(output))await once(encoder.stdin,'drain');
 if([0,198,214,270,359].includes(f)){const file=run+`/qa/c2-frame-${f}.png`;await sharp(output,{raw:{width:W,height:H,channels:3}}).png().toFile(file);evidence.push({sourceFrame:f,sourcePngSha256:hash(sourceBytes),output:{path:file,sha256:hash(await readFile(file))}});}
 if(f%90===89)console.log(`C2 stage: ${f+1}/360`);
}encoder.stdin.end();const[code]=await done;if(code!==0)throw Error(errors);}catch(e){encoder.stdin.destroy();if(encoder.exitCode===null)encoder.kill();throw e;}
const concat=run+'/concat.txt';await writeFile(concat,[first.path,part].map(p=>`file '${path.resolve(p).replaceAll('\\','/')}'`).join('\n')+'\n');
const output=run+'/render/two-takes-one-seam.mp4';execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-n','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',output],{windowsHide:true});
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',output],{encoding:'utf8',windowsHide:true}));if(probe.streams[0].nb_read_frames!=='720'||probe.streams[0].avg_frame_rate!=='30/1')throw Error('Sequence frame/rate mismatch');
await writeFile(run+'/evidence.json',JSON.stringify({schemaVersion:1,output:{path:output,sha256:hash(await readFile(output)),probe},sourceParts:[first,{path:part,sha256:hash(await readFile(part)),source:review.source,sourceSha256:review.sourceSha256,review:{path:reviewFile,sha256:hash(reviewBytes)}}],scene:[{path:roomPath,sha256:hash(roomBytes)},{path:tablePath,sha256:hash(tableBytes)}],sourceTiming:'Two complete360-frame takes in original30fps; one hard seam at12s',evidence,productionAccepted:false,limitations:['Motion feasibility reference, not accepted card geometry or material','First segment preserves C1 independently; second source contains both blank paper surfaces','No claim of independently replaceable final card artwork or approved endpoint compatibility'],toolSha256:hash(await readFile('tools/pamela-c2-sequence.ts')),keySha256:hash(await readFile('src/pamela-key.ts'))},null,2));console.log(JSON.stringify({output,frames:720,seconds:24}));
