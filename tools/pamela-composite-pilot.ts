import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),run='runs/20261108-pamela-deal-pilot';
await mkdir(`${run}/composite`,{recursive:true});
const sources={room:'extra/insperationsmall-alternativ/trakasino-360-panorama.png',table:'media/blob/0097086f5a546805/9b5cd545387065a3a13559eaf41d90aba30963a805b5bc1b48753b07dd0ac0c8.png',shoe:'media/blob/1c373ae651dad0a4/18fdcf3fdd25658698d6f8b97817fb91adee605d01f4a6a787603a930040742d.png',dealer:`${run}/original/pamela-pos4-iv-aleph2.mp4`};
const variant=process.argv[2]||'first';if(!['first','room-wide'].includes(variant))throw Error('Unknown scene variant.');
const wide=variant==='room-wide',suffix=wide?'-room-wide':'';
const output=`${run}/composite/pamela-vila-giv-atergang-wide${suffix}.mp4`;
// All geometry is a visible pilot fit. It is not imported from a production card track.
const filter=[
 `[0:v]v360=input=equirect:output=flat:yaw=0:pitch=0:h_fov=${wide?97.1:65}:v_fov=${wide?65:39.73}:w=1920:h=1080,setsar=1[room]`,
 '[1:v]scale=1920:870:flags=lanczos,format=rgba[table]',
 '[room][table]overlay=0:285:shortest=1[stage]',
 '[2:v]scale=288:160:flags=lanczos,format=rgba[shoe]',
 '[stage][shoe]overlay=1061:355:shortest=1[furniture]',
 '[3:v]format=rgba,colorkey=0x00cc33:0.29:0.08,scale=648:1152:flags=lanczos,tpad=start_duration=1.25:stop_duration=1.25:start_mode=clone:stop_mode=clone[dealer]',
 '[furniture][dealer]overlay=636:-8:shortest=1,format=yuv420p[out]'
].join(';');
await exec('ffmpeg',['-v','error','-nostdin','-filter_complex_threads','4','-loop','1','-framerate','24','-i',sources.room,'-loop','1','-framerate','24','-i',sources.table,'-loop','1','-framerate','24','-i',sources.shoe,'-i',sources.dealer,'-filter_complex',filter,'-map','[out]','-an','-c:v','libx264','-crf','18','-preset','slow','-threads','4','-movflags','+faststart','-t','5.125','-n',output],{windowsHide:true,maxBuffer:3000});
const sha=async(p:string)=>createHash('sha256').update(await readFile(p)).digest('hex');
const probe=JSON.parse((await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_frames,duration','-of','json',output],{windowsHide:true})).stdout).streams[0];
await writeFile(`${run}/composite/scene${suffix}.json`,JSON.stringify({schemaVersion:1,status:'visual-placement-pilot-not-production',sources:await Promise.all(Object.entries(sources).map(async([role,path])=>({role,path,sha256:await sha(path)}))),canvas:{width:1920,height:1080,fps:24},camera:{locked:true,roomProjection:'equirectangular-to-perspective',yaw:0,pitch:0,horizontalFov:wide?97.1:65},layers:[{role:'table',x:0,y:285,width:1920,height:870},{role:'shoe',x:1061,y:355,width:288,height:160,behindHands:true},{role:'dealer',x:636,y:-8,width:648,height:1152,alpha:'preview-colorkey',originalUnchanged:true}],timeline:{leadHoldFrames:30,motionFrames:63,tailHoldFrames:30,totalFrames:123,loop:false},output:{path:output,sha256:await sha(output),...probe},knownIssues:['Card is model-generated blank reference, bends visibly; no server card values.','Shoe outlet fit is provisional and must be checked through pickup.','Table asset has an existing edge/halo; not a new approved matte.','No calibrated card track or dynamic hand mask; no camera motion acceptance.','Idle sections hold endpoint frames; they are not newly generated breathing loops.'],ffmpegFilter:filter},null,2));
console.log(JSON.stringify({output,sha256:await sha(output),probe}));
