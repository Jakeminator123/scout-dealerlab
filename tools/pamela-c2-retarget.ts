import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import sharp from 'sharp';
import {retargetPamelaC2Frame,PAMELA_C2_SOURCE_SHA256} from '../src/pamela-c2-retarget.ts';
import {keyPamelaFrame} from '../src/pamela-key.ts';
const base='runs/20261109-pamela-central-composite',run='runs/20261109-pamela-c2-retarget',sourceDir='runs/20261109-pamela-sequence/qa/central-base',W=1762,H=1174,FPS=30;
const sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const trackBytes=await fs.readFile(`${base}/tracking/card-tracks.json`),tracks=JSON.parse(trackBytes.toString());
const sourceMovie='runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4';
if(sha(await fs.readFile(sourceMovie))!==PAMELA_C2_SOURCE_SHA256)throw Error('Original movie hash mismatch');
for(const d of ['critical','frames','masks','qa','render'])await fs.mkdir(`${run}/${d}`,{recursive:true});
const stage=await sharp(`${base}/scene-assets/pamela-clean-room-v1.png`).resize(W,H).blur(8).modulate({brightness:.58,saturation:.65}).composite([{input:`${base}/scene-assets-v2/dark-felt-table-native-1762x1174.png`}]).removeAlpha().raw().toBuffer();
type Point=[number,number];type Quad=[Point,Point,Point,Point];
const q1:Quad=[[820,1026],[943,1026],[963,1093],[802,1093]],q2=q1.map(([x,y])=>[x+46,y]) as Quad;
async function texture(rank:string,suit:string,color:string,inkOnly=false){return sharp(Buffer.from(`<svg width="210" height="294">${inkOnly?'':'<rect width="210" height="294" rx="8" fill="#f7f4e9"/>'}<g fill="${color}" font-family="Arial" text-anchor="middle"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text><text x="105" y="185" font-size="105">${suit}</text><g transform="translate(210 294) rotate(180)"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text></g></g></svg>`)).ensureAlpha().raw().toBuffer();}
const ace=await texture('A','♠','#161b20'),king=await texture('K','♥','#a52d32'),ink=await texture('K','♥','#a52d32',true);
function homography(q:Quad){const uv=[[0,0],[1,0],[1,1],[0,1]],r:number[][]=[];for(let i=0;i<4;i++){const[x,y]=q[i],[u,v]=uv[i];r.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}for(let c=0;c<8;c++){let p=c;for(let j=c+1;j<8;j++)if(Math.abs(r[j][c])>Math.abs(r[p][c]))p=j;[r[c],r[p]]=[r[p],r[c]];const d=r[c][c];if(Math.abs(d)<1e-9)return null;for(let k=c;k<9;k++)r[c][k]/=d;for(let j=0;j<8;j++)if(j!==c){const f=r[j][c];for(let k=c;k<9;k++)r[j][k]-=f*r[c][k];}}return r.map(v=>v[8]);}
function envelope(p:Point[]):Quad|null{if(p.length<4)return null;const s=[(v:Point)=>v[0]+v[1],(v:Point)=>-v[0]+v[1],(v:Point)=>-v[0]-v[1],(v:Point)=>v[0]-v[1]];const q=s.map(fn=>p.reduce((a,b)=>fn(a)<fn(b)?a:b)) as Quad;return new Set(q.map(v=>v.join(','))).size===4?q:null;}
function paint(out:Buffer,tex:Buffer,q:Quad,mask?:Buffer){const h=homography(q);if(!h)return;for(let y=Math.max(0,Math.floor(Math.min(...q.map(v=>v[1]))));y<=Math.min(H-1,Math.ceil(Math.max(...q.map(v=>v[1]))));y++)for(let x=Math.max(0,Math.floor(Math.min(...q.map(v=>v[0]))));x<=Math.min(W-1,Math.ceil(Math.max(...q.map(v=>v[0]))));x++){const den=h[6]*x+h[7]*y+1,u=(h[0]*x+h[1]*y+h[2])/den,v=(h[3]*x+h[4]*y+h[5])/den;if(u<0||u>1||v<0||v>1)continue;const p=y*W+x,t=(Math.min(293,Math.floor(v*294))*210+Math.min(209,Math.floor(u*210)))*4,a=tex[t+3]/255*(mask?mask[p]/255:1);for(let c=0;c<3;c++)out[p*3+c]=Math.round(out[p*3+c]*(1-a)+tex[t+c]*a);}}
const records:any[]=[];
async function frame(index:number,save:boolean){
  const fileFrame=index+1,name=`frame-${String(fileFrame).padStart(3,'0')}.png`,bytes=await fs.readFile(`${sourceDir}/${name}`),source=await sharp(bytes).removeAlpha().raw().toBuffer();
  if(sha(bytes)!==tracks.frames[index].frameSha256)throw Error(`Native source ${index} changed`);
  const mask=await sharp(`${base}/tracking/moving-mask/${name}`).greyscale().raw().toBuffer();
  const warped=retargetPamelaC2Frame({sourceRGB:source,visibleCardMask:mask,width:W,height:H,sourceFrameIndex:index,sourceSha256:PAMELA_C2_SOURCE_SHA256,contourNative:tracks.frames[index].moving.contourNative});
  const keyed=keyPamelaFrame(warped.rgb,W,H),output=Buffer.from(stage);paint(output,ace,q1);
  if(index>=118)paint(output,king,q2);else if(index>=48&&!(index>=54&&index<=73)){const q=envelope(warped.geometry.movingContourNative);if(q)paint(keyed.rgb,ink,q,warped.visibleCardMask);}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=y*W+x,i=p*3;let a=keyed.alpha[p];const r=warped.geometry.postReleasePropRemovalRect;if(r&&x>=r.left&&x<r.left+r.width&&y>=r.top&&y<r.top+r.height)a=0;for(let c=0;c<3;c++)output[i+c]=Math.round(keyed.rgb[i+c]*a+output[i+c]*(1-a));}
  let upperChanges=0;for(let i=0;i<680*W*3;i++)if(source[i]!==warped.rgb[i])upperChanges++;
  const record={sourceFrameIndex:index,fileFrame,timeSeconds:index/FPS,sourceFrameSha256:sha(bytes),...warped.diagnostics,unchangedUpperRegionByteDifferences:upperChanges,geometry:warped.geometry};records.push(record);
  if(save){
    await sharp(warped.rgb,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/critical/warped-${String(index).padStart(3,'0')}.png`);
    await sharp(output,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/critical/composite-${String(index).padStart(3,'0')}.png`);
    const overlay=Buffer.from(warped.rgb);for(let p=0;p<W*H;p++){const a=warped.warpSupportMask[p]/255*.4;overlay[p*3]=Math.round(overlay[p*3]*(1-a));overlay[p*3+1]=Math.round(overlay[p*3+1]*(1-a)+220*a);overlay[p*3+2]=Math.round(overlay[p*3+2]*(1-a)+255*a);if(warped.visibleCardMask[p]>128){overlay[p*3]=255;overlay[p*3+1]=80;overlay[p*3+2]=200;}}
    const crop={left:520,top:610,width:650,height:510},panels=[];
    for(const [pixels,label] of [[source,`SOURCE ${index} | observed`],[overlay,`WARP/MASK ${index} | shift ${warped.diagnostics.handShiftPixels.toFixed(1)} px`],[output,`COMPOSITE ${index} | C1 fixed, C2 +46`]] as [Buffer,string][]){const image=await sharp(pixels,{raw:{width:W,height:H,channels:3}}).extract(crop).png().toBuffer(),text=Buffer.from(`<svg width="650" height="28"><rect width="650" height="28" fill="#10191c"/><text x="8" y="20" font-size="16" font-family="Arial" fill="white">${label}</text></svg>`);panels.push(await sharp({create:{width:650,height:538,channels:3,background:'#10191c'}}).composite([{input:image,left:0,top:28},{input:text,left:0,top:0}]).png().toBuffer());}
    await sharp({create:{width:1950,height:538,channels:3,background:'#10191c'}}).composite(panels.map((input,i)=>({input,left:i*650,top:0}))).png().toFile(`${run}/qa/critical-${String(index).padStart(3,'0')}.png`);
  }
  return {output,warped,record};
}
if(process.argv.includes('--critical')){
  for(const index of [40,64,84,98,114,118]){await frame(index,true);console.log(`critical ${index}`);}
  await fs.writeFile(`${run}/critical-diagnostics.json`,JSON.stringify({status:'awaiting-visual-gate',sourceSha256:PAMELA_C2_SOURCE_SHA256,trackSha256:sha(trackBytes),node:process.version,attempt:1,frames:records},null,2)+'\n');
}else if(process.argv.includes('--render')||process.argv.includes('--recover-rejected-partial')){
  const rejectedPartial=process.argv.includes('--recover-rejected-partial');
  const gate=JSON.parse(await fs.readFile(`${run}/critical-gate.json`,'utf8'));if(gate.verdict!==(rejectedPartial?'rejected-at-source-frame-119':'continue-one-attempt'))throw Error('Visual gate forbids this render');
  const frameCount=rejectedPartial?119:180;
  const video=`${run}/render/pamela-c2-retarget-${rejectedPartial?'partial-rejected':'pilot'}.mp4`;
  const ff=spawn('ffmpeg',['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-crf','17','-preset','medium','-pix_fmt','yuv420p','-threads','4','-n',video],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';ff.stderr.on('data',d=>errors+=d.toString());const done=once(ff,'close');
  const reviewFrames=new Set([76,78,80,88,92,94,104,110,115,116,117,119,120,122,126,132,138,145,150]);
  for(let index=0;index<frameCount;index++){const result=await frame(index,reviewFrames.has(index));if(!ff.stdin.write(result.output))await once(ff.stdin,'drain');if(index>=70&&index<=150)await sharp(result.warped.visibleCardMask,{raw:{width:W,height:H,channels:1}}).png().toFile(`${run}/masks/frame-${String(index+1).padStart(3,'0')}.png`);if(index%30===0)console.log(`render ${index}/${frameCount}`);}
  ff.stdin.end();const [exitCode]=await done;if(exitCode!==0)throw Error(errors);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',video],{encoding:'utf8',windowsHide:true}));
  if(probe.streams[0].nb_frames!==String(frameCount)||probe.streams[0].avg_frame_rate!=='30/1')throw Error('Timing check failed');
  for(const [sheet,indices] of [['release',[110,114,115,116,117,118,119,120]],['return',[122,126,132,138,145,150]],['reach',[76,78,80,84,88,92,94,98,104]]] as [string,number[]][]){
    const available=indices.filter(index=>index<frameCount);if(!available.length)continue;
    const rows=await Promise.all(available.map(index=>sharp(`${run}/qa/critical-${String(index).padStart(3,'0')}.png`).resize(975,269).png().toBuffer()));
    await sharp({create:{width:975,height:269*rows.length,channels:3,background:'#10191c'}}).composite(rows.map((input,i)=>({input,left:0,top:269*i}))).png().toFile(`${run}/qa/${sheet}-contact-sheet.png`);
  }
  await fs.writeFile(`${run}/retarget-manifest.json`,JSON.stringify({schemaVersion:1,status:'rejected-incomplete-motion-do-not-integrate',attempt:1,integrationAllowed:false,stop:rejectedPartial?{sourceFrameIndex:119,sourceRowY:850,minimumHorizontalJacobianBound:.08369252654575021,reason:'Conservative compression guard in green background; no observed arm deformation. Return was not rendered. No second retarget attempt.',targetedNextProof:'Separate protected foreground from keyed background in the safety check; keep a global no-fold guard. This is a proposal, not implemented or verified.'}:null,source:{path:sourceMovie,sha256:PAMELA_C2_SOURCE_SHA256,width:W,height:H,fps:FPS,frameCount:180},frozenTracks:{path:`${base}/tracking/card-tracks.json`,sha256:sha(trackBytes)},output:{path:video,sha256:sha(await fs.readFile(video)),partial:rejectedPartial,...probe.streams[0]},card1:{quadNative:q1,motion:'none'},card2:{landingQuadNative:q2,offsetPixels:[46,0],overlapAreaPercent:67.6056338028169,releaseFrameIndex:118,motionAfterRelease:'Intended fixed placement; return not validated.'},method:{helper:'src/pamela-c2-retarget.ts',handAndCard:'shared rigid horizontal translation before release',forearm:'inferred vertically blended deformation above rigid hand region; source y<=680 unchanged',sourceRemoval:'single-valued inverse source sampling, no duplicate layer or invented hole fill',shadow:'Original raw RGB follows identical warp; no separately validated contact-shadow reconstruction',appearance:'Observed source paper preserved before release, only illustrative ink added through source-bound mask'},frames:records},null,2)+'\n');
  console.log(JSON.stringify({video,frames:frameCount,fps:30,rejected:rejectedPartial}));
}else throw Error('Use --critical before --render');
