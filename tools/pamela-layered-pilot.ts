import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const exec=promisify(execFile),run='runs/20261108-pamela-deal-pilot';
const source=`${run}/original/pamela-pos4-iv-aleph2-rigid-short.mp4`;
const sha=async(p:string)=>createHash('sha256').update(await readFile(p)).digest('hex');
const sourceHash=await sha(source);
if(sourceHash!=='2038742949ab3c5797b8af9a8877953e50059b6cf3051ab4e860e0c00a55aebf')throw Error('Pilot card track belongs to different video bytes.');
const framesDir='.runtime/pamela-card-frames';await mkdir(framesDir,{recursive:true});
// New pilot anchors measured/estimated from this Pamela clip, not copied from Astrid.
// Centre positions are provisional visual fits to fingers; no production acceptance.
const keys=[{f:27,x:812,y:814,a:20},{f:28,x:790,y:823,a:10},{f:30,x:730,y:835,a:-15},{f:32,x:680,y:852,a:-30},{f:34,x:622,y:866,a:-35},{f:36,x:580,y:878,a:-30},{f:38,x:535,y:932,a:-15},{f:40,x:520,y:1020,a:-6},{f:42,x:515,y:1090,a:0},{f:44,x:512,y:1120,a:0},{f:62,x:512,y:1120,a:0}];
const samples=[];
for(let n=0;n<123;n++){
 const f=Math.max(0,Math.min(62,n-30));let card='';let pose=null;
 if(f>=27){const hi=keys.findIndex(k=>k.f>=f),b=keys[hi<0?keys.length-1:hi],a=keys[Math.max(0,(hi<0?keys.length:hi)-1)],t=a.f===b.f?0:(f-a.f)/(b.f-a.f);pose={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:a.a+(b.a-a.a)*t};
  const x=636+.6*pose.x,y=-8+.6*pose.y;
  card=`<g transform="translate(${x} ${y}) rotate(${pose.angle})"><rect x="-23.4" y="-31.8" width="46.8" height="63.6" rx="2" fill="#fbfaf6" stroke="#d4d1c7" stroke-width="1"/></g>`;
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${card}</svg>`;
 await sharp(Buffer.from(svg)).png().toFile(`${framesDir}/${String(n).padStart(4,'0')}.png`);
 samples.push({outputFrame:n,sourceFrame:f,seconds:n/24,card:pose});
}
const scene=JSON.parse(await readFile(`${run}/composite/scene-room-wide.json`,'utf8'));
const role=(r:string)=>scene.sources.find((s:any)=>s.role===r).path;
const filter=[
 '[0:v]v360=input=equirect:output=flat:yaw=0:pitch=0:h_fov=97.1:v_fov=65:w=1920:h=1080,setsar=1[room]',
 '[1:v]scale=1920:870:flags=lanczos,format=rgba[table]',
 '[room][table]overlay=0:285:shortest=1[stage]',
 '[stage][4:v]overlay=0:0:shortest=1[cardstage]',
 '[2:v]scale=288:160:flags=lanczos,format=rgba[shoe]',
 '[cardstage][shoe]overlay=1061:355:shortest=1[furniture]',
 '[3:v]format=rgba,colorkey=0x00cc33:0.29:0.08,scale=648:1152:flags=lanczos,tpad=start_duration=1.25:stop_duration=1.25:start_mode=clone:stop_mode=clone[dealer]',
 '[furniture][dealer]overlay=636:-8:shortest=1,format=yuv420p[out]'
].join(';');
const output=`${run}/composite/pamela-lager-vila-giv-atergang.mp4`;
await exec('ffmpeg',['-v','error','-nostdin','-filter_complex_threads','4','-loop','1','-framerate','24','-i',role('room'),'-loop','1','-framerate','24','-i',role('table'),'-loop','1','-framerate','24','-i',role('shoe'),'-i',source,'-framerate','24','-i',`${framesDir}/%04d.png`,'-filter_complex',filter,'-map','[out]','-an','-c:v','libx264','-crf','18','-preset','slow','-threads','4','-movflags','+faststart','-t','5.125','-n',output],{windowsHide:true,maxBuffer:3000});
const metadata=JSON.parse((await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_frames,duration','-of','json',output],{windowsHide:true})).stdout).streams[0];
await writeFile(`${run}/composite/layered-scene.json`,JSON.stringify({...scene,status:'candidate-new-card-layer-not-calibrated',sources:scene.sources.map((s:any)=>s.role==='dealer'?{role:'dealer',path:source,sha256:sourceHash}:s),output:{path:output,sha256:await sha(output),...metadata},card:{kind:'blank-presentation-test-card-no-game-value',sourceVideoSha256:sourceHash,sourcePixels:{width:1080,height:1920},size:{width:78,height:106},keys,interpolation:'linear',timelineSource:'new Pamela f27–62 visual anchors and skin-component observations; no inherited card tracks',behindShoe:true,behindDealerHands:true,calibrated:false,samples},knownIssues:['New card centre/angle anchors are provisional; inspect pickup, transfer, contact and release at full resolution.','Card perspective remains a flat rectangle with rotation; no measured 3D table homography.','Generated fingers and pose endpoints are candidates; no full-bank or loop acceptance.','Background is low-resolution panorama; table has existing matte/halo defects.','Idle sections hold endpoint frames; Wan3 breathing is evaluated separately.'],ffmpegFilter:filter},null,2));
console.log(JSON.stringify({output,sha256:await sha(output),...metadata}));
