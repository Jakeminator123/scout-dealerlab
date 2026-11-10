import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
import sharp from 'sharp';
import { keyPamelaFrame } from '../src/pamela-key.ts';

const execute=promisify(execFile),run='runs/20261109-pamela-central-composite',W=1762,H=1174,FPS=30;
const improved=process.argv.includes('--v2'),revision=improved?'v2':'v1';
const qaDir=improved?`${run}/qa/v2`:`${run}/qa`;
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const tracks=JSON.parse(await readFile(`${run}/tracking/card-tracks.json`,'utf8'));
const sources={
  approach:{path:'runs/20261109-pamela-reference-kit/original/pamela-vila-till-redo-wan3.mp4',sha256:'00efe62636916b79052b4cf9d5fa88ba1ad52c17d531f1dcc86875f94c91084c',frames:90,dir:`${run}/work/approach`},
  deal:{path:'runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4',sha256:'2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a',frames:180,dir:'runs/20261109-pamela-sequence/qa/central-base'},
  retreat:{path:'runs/20261109-pamela-sequence/original/pamela-from-shoe-wan3.mp4',sha256:'81a63227a56531103bd9d86b364442869b72eef0ddd3be65e718f3494ee2147b',frames:90,dir:'runs/20261109-pamela-sequence/qa/from-shoe'},
};
if(tracks.source.sha256!==sources.deal.sha256||tracks.source.fps!==FPS||tracks.frames.length!==180)throw Error('Track/source identity mismatch');
for(const s of Object.values(sources))if(sha(await readFile(s.path))!==s.sha256)throw Error('Source changed: '+s.path);
for(const dir of ['work/approach','render','qa','scene-assets'])await mkdir(`${run}/${dir}`,{recursive:true});
await mkdir(qaDir,{recursive:true});
if(!await stat(`${sources.approach.dir}/frame-090.png`).catch(()=>null))await execute('ffmpeg',['-v','error','-nostdin','-i',sources.approach.path,'-fps_mode','passthrough','-threads','4','-n',`${sources.approach.dir}/frame-%03d.png`],{windowsHide:true,maxBuffer:2000});
const roomPath=`${run}/scene-assets/pamela-clean-room-v1.png`;
let roomTransform=sharp(roomPath).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha();
if(improved)roomTransform=roomTransform.blur(8).modulate({brightness:.58,saturation:.65});
const room=await roomTransform.toBuffer();
const railDef='<linearGradient id="rail" x2="0" y2="1"><stop stop-color="#3d3930"/><stop offset=".25" stop-color="#171c1d"/><stop offset="1" stop-color="#101516"/></linearGradient>';
const railShape=`<rect y="817" width="${W}" height="21" fill="url(#rail)"/><path d="M0 818H1762" stroke="#6c6250" stroke-width="1" opacity=".5"/>`;
const tableSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="felt" x2="0" y2="1"><stop stop-color="#252d2d"/><stop offset="1" stop-color="#121c1e"/></linearGradient>${railDef}<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="17"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".055"/></feComponentTransfer></filter></defs><rect y="817" width="${W}" height="357" fill="url(#felt)"/><rect y="817" width="${W}" height="357" filter="url(#grain)" opacity=".4"/>${railShape}</svg>`;
await writeFile(`${run}/scene-assets/dark-table-v1.svg`,tableSvg);
const table=improved?await readFile(`${run}/scene-assets-v2/dark-felt-table-native-1762x1174.png`):await sharp(Buffer.from(tableSvg)).png().toBuffer();
if(!improved)await writeFile(`${run}/scene-assets/dark-table-v1.png`,table);
const stage=await sharp(room).composite([{input:table}]).removeAlpha().raw().toBuffer();
const portraitRoom=improved?await sharp(roomPath).resize(1080,1920,{fit:'cover'}).blur(8).modulate({brightness:.58,saturation:.65}).toBuffer():null;
const portraitFelt=improved?await sharp(table).extract({left:278,top:838,width:1200,height:336}).resize(1080,1086).toBuffer():null;
const portraitRail=improved?await sharp(table).extract({left:278,top:817,width:1200,height:21}).resize(1080,19).toBuffer():null;
const portraitStage=improved?await sharp(portraitRoom!).composite([{input:portraitFelt!,left:0,top:834},{input:portraitRail!,left:0,top:815}]).removeAlpha().toBuffer():null;
const railSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${railDef}<clipPath id="core"><rect x="840" y="817" width="226" height="21"/></clipPath></defs><g clip-path="url(#core)">${railShape}</g></svg>`;
await writeFile(`${run}/scene-assets/torso-occluder-v1.svg`,railSvg);
const rail=improved?await sharp(table).ensureAlpha().raw().toBuffer():await sharp(Buffer.from(railSvg)).ensureAlpha().raw().toBuffer();
const texture=async(rank:string,suit:string,color:string)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><rect width="210" height="294" rx="9" fill="#f7f4e9"/><rect x="4" y="4" width="202" height="286" rx="7" fill="none" stroke="#d5d0c4" stroke-width="2"/><g fill="${color}" font-family="Arial, sans-serif" text-anchor="middle"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text><text x="105" y="185" font-size="105">${suit}</text><g transform="translate(210 294) rotate(180)"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text></g></g></svg>`)).removeAlpha().raw().toBuffer();
const textures=[await texture('A','♠','#161b20'),await texture('K','♥','#a52d32')];
type Point=[number,number];type Quad=[Point,Point,Point,Point];
const landed:Quad=[[820,1026],[943,1026],[963,1093],[802,1093]];
const clamp=(n:number,lo=0,hi=1)=>Math.min(hi,Math.max(lo,n));
function homography(quad:Quad){
  const uv=[[0,0],[1,0],[1,1],[0,1]],rows:number[][]=[];
  for(let i=0;i<4;i++){const [x,y]=quad[i],[u,v]=uv[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
  for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[p][c]))p=r;[rows[c],rows[p]]=[rows[p],rows[c]];const d=rows[c][c];if(Math.abs(d)<1e-8)return null;for(let k=c;k<9;k++)rows[c][k]/=d;for(let r=0;r<8;r++)if(r!==c){const f=rows[r][c];for(let k=c;k<9;k++)rows[r][k]-=f*rows[c][k];}}
  return rows.map(r=>r[8]);
}
function inferredQuad(contour:Point[]):Quad|null{
  if(contour.length<4)return null;
  const extremes=[(p:Point)=>p[0]+p[1],(p:Point)=>-p[0]+p[1],(p:Point)=>-p[0]-p[1],(p:Point)=>p[0]-p[1]];
  const q=extremes.map(score=>contour.reduce((a,p)=>score(p)<score(a)?p:a)) as Quad;
  if(new Set(q.map(p=>p.join(','))).size!==4)return null;
  return q;
}
function paintCard(out:Buffer,tex:Buffer,quad:Quad,mask?:Buffer,source?:Buffer,coverage?:Float32Array){
  const h=homography(quad);if(!h)return;
  const minX=Math.max(0,Math.floor(Math.min(...quad.map(p=>p[0])))),maxX=Math.min(W-1,Math.ceil(Math.max(...quad.map(p=>p[0]))));
  const minY=Math.max(0,Math.floor(Math.min(...quad.map(p=>p[1])))),maxY=Math.min(H-1,Math.ceil(Math.max(...quad.map(p=>p[1]))));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const p=y*W+x,i=p*3,den=h[6]*x+h[7]*y+1,u=(h[0]*x+h[1]*y+h[2])/den,v=(h[3]*x+h[4]*y+h[5])/den;
    if(u<0||u>1||v<0||v>1)continue;const a=mask?mask[p]/255:1;if(!a)continue;
    const t=(Math.min(293,Math.floor(v*294))*210+Math.min(209,Math.floor(u*210)))*3;
    const light=source?clamp((source[i]+source[i+1]+source[i+2])/(3*244),.65,1.05):.93;
    for(let c=0;c<3;c++)out[i+c]=Math.round(clamp(out[i+c]*(1-a)+tex[t+c]*light*a,0,255));
    if(coverage)coverage[p]=a+coverage[p]*(1-a);
  }
}
function moved(q:Quad,dx:number):Quad{return q.map(([x,y])=>[x+dx,y]) as Quad;}
function cardWithShadow(out:Buffer,index:number,dx:number,coverage?:Float32Array){
  const quad=moved(landed,dx),minX=Math.floor(802+dx),maxX=Math.ceil(963+dx);
  for(let y=1023;y<1103;y++)for(let x=minX-6;x<maxX+9;x++)if(x>=0&&x<W){const edge=Math.min(x-(minX-6),(maxX+9)-x,y-1023,1103-y),alpha=.15*clamp(edge/8);const p=y*W+x,i=p*3;for(let c=0;c<3;c++)out[i+c]*=1-alpha;if(coverage)coverage[p]=alpha+coverage[p]*(1-alpha);}
  paintCard(out,textures[index],quad,undefined,undefined,coverage);
}
type Frame={clip:keyof typeof sources;sourceFrame:number;dealNumber:number;priorCards:number};
const timeline:Frame[]=[];
const add=(clip:Frame['clip'],from:number,to:number,dealNumber:number,priorCards:number)=>{for(let f=from;f<=to;f++)timeline.push({clip,sourceFrame:f,dealNumber,priorCards});};
add('approach',0,89,0,0);add('deal',3,179,0,0);add('deal',17,179,1,1);add('retreat',0,89,0,2);
const inferred:number[]=[];
async function renderFrame(entry:Frame){
  const s=sources[entry.clip],fp=`${s.dir}/frame-${String(entry.sourceFrame+1).padStart(3,'0')}.png`;
  const original=await sharp(fp).removeAlpha().raw().toBuffer();
  const keyed=improved?keyPamelaFrame(original,W,H):null;
  const frame=keyed?keyed.rgb:Buffer.from(original),out=Buffer.from(stage);
  const coverage=improved?new Float32Array(W*H):undefined;
  let movingMask:Buffer|null=null;
  if(entry.clip==='deal'){
    const measurement=tracks.frames[entry.sourceFrame].moving;
    movingMask=await sharp(measurement.maskPath.startsWith('runs/')?measurement.maskPath:`${run}/${measurement.maskPath}`).greyscale().raw().toBuffer();
    if(entry.sourceFrame>=48&&entry.sourceFrame<118&&!(entry.sourceFrame>=54&&entry.sourceFrame<=73)){
      const contour=measurement.contourNative??measurement.contoursNative?.flat()??[];
      const q=measurement.quadNative??inferredQuad(contour);
      if(q){paintCard(frame,textures[entry.dealNumber],q,movingMask,original);if(!measurement.quadNative)inferred.push(entry.sourceFrame);}
    }
  }
  for(let n=0;n<entry.priorCards;n++)cardWithShadow(out,n,improved?0:n===0?-100:90,coverage);
  if(entry.clip==='deal'&&entry.sourceFrame>=118){const shift=improved?0:(entry.dealNumber===0?-100:90)*clamp((entry.sourceFrame-150)/15);cardWithShadow(out,entry.dealNumber,shift,coverage);}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*W+x,i=p*3,r=frame[i],g=frame[i+1],b=frame[i+2],diff=g-Math.max(r,b);
    let alpha=keyed?keyed.alpha[p]:diff>8?clamp((52-diff)/44):1;
    if(entry.clip==='deal'&&entry.sourceFrame>=118&&x>=793&&x<=974&&y>=1018&&y<=1105)alpha=0;
    if(alpha>0){const green=keyed?g:diff>5?Math.min(g,Math.max(r,b)+3):g;out[i]=Math.round(r*alpha+out[i]*(1-alpha));out[i+1]=Math.round(green*alpha+out[i+1]*(1-alpha));out[i+2]=Math.round(b*alpha+out[i+2]*(1-alpha));}
    if(coverage)coverage[p]=alpha+coverage[p]*(1-alpha);
    // A short opaque back rail hides the source torso cutoff. Hands remain in front.
    const ri=p*4,ra=improved?(x>=840&&x<1066&&y>=817&&y<838?rail[ri+3]/255:0):rail[ri+3]/255;
    const skin=original[i]>95&&original[i]>original[i+1]*1.12&&original[i+1]>original[i+2]*1.07;
    if(ra&&!skin)for(let c=0;c<3;c++)out[i+c]=Math.round(rail[ri+c]*ra+out[i+c]*(1-ra));
    if(coverage&&ra&&!skin)coverage[p]*=1-ra;
  }
  let portrait:Buffer|null=null;
  if(coverage){
    const rgba=Buffer.alloc(W*H*4);
    for(let p=0;p<W*H;p++){const a=coverage[p];if(a<.004)continue;for(let c=0;c<3;c++)rgba[p*4+c]=Math.round(clamp((out[p*3+c]-stage[p*3+c]*(1-a))/a,0,255));rgba[p*4+3]=Math.round(a*255);}
    const projected=await sharp(rgba,{raw:{width:W,height:H,channels:4}}).resize(1586,1057).extract({left:250,top:0,width:1080,height:1057}).png().toBuffer();
    portrait=await sharp(portraitStage!).composite([{input:projected,left:0,top:80}]).removeAlpha().raw().toBuffer();
  }
  return {native:out,portrait};
}
const previews=[0,89,90,171,185,205,266,284,348,368,429,430,519];
if(process.argv.includes('--stills')){
  for(const index of previews){const pixels=await renderFrame(timeline[index]);await sharp(pixels.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${qaDir}/composite-${String(index).padStart(3,'0')}.png`);if(pixels.portrait)await sharp(pixels.portrait,{raw:{width:1080,height:1920,channels:3}}).png().toFile(`${qaDir}/portrait-${String(index).padStart(3,'0')}.png`);}
  console.log(JSON.stringify({stills:previews,root:`${run}/qa`}));
}else{
  const path=`${run}/render/pamela-two-deals-native-${revision}.mp4`;
  if(improved&&!await stat(`${run}/composition-v1.json`).catch(()=>null))await writeFile(`${run}/composition-v1.json`,await readFile(`${run}/composition.json`));
  const makeEncoder=(target:string,width:number,height:number)=>spawn('ffmpeg',['-v','error','-nostdin','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-pix_fmt','yuv420p','-crf',improved?'15':'17','-preset','medium','-threads',improved?'2':'4','-movflags','+faststart','-n',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  const encoder=makeEncoder(path,W,H),portraitPath=`${run}/render/pamela-two-deals-portrait-${revision}.mp4`,portraitEncoder=improved?makeEncoder(portraitPath,1080,1920):null;
  const portraitDone=portraitEncoder?once(portraitEncoder,'close'):null;let portraitErrors='';portraitEncoder?.stderr.on('data',b=>portraitErrors+=b.toString());
  let errors='';encoder.stderr.on('data',b=>errors+=b.toString()); const done=once(encoder,'close');
  for(let i=0;i<timeline.length;i++){const pixels=await renderFrame(timeline[i]);if(!encoder.stdin.write(pixels.native))await once(encoder.stdin,'drain');if(portraitEncoder&&pixels.portrait&&!portraitEncoder.stdin.write(pixels.portrait))await once(portraitEncoder.stdin,'drain');if(i%60===0)console.log(`Rendered ${i}/${timeline.length}`);}
  encoder.stdin.end();portraitEncoder?.stdin.end();const [code]=await done;if(code!==0)throw Error(errors);if(portraitDone){const [portraitCode]=await portraitDone;if(portraitCode!==0)throw Error(portraitErrors);}
  const probe=JSON.parse((await execute('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',path],{windowsHide:true})).stdout).streams[0];
  if(Number(probe.nb_frames)!==timeline.length||probe.avg_frame_rate!=='30/1')throw Error('Delivery timing mismatch');
  await writeFile(`${run}/composition.json`,JSON.stringify({schemaVersion:1,status:'composite-candidate-not-production-accepted',canvas:{width:W,height:H,fps:FPS,locked:true,sourceTransform:{scale:1,x:0,y:0}},sources,room:{path:roomPath,sha256:sha(await readFile(roomPath))},table:{path:`${run}/scene-assets/dark-table-v1.svg`,torsoOccluder:`${run}/scene-assets/torso-occluder-v1.svg`,core:[836,817,203,21],status:'proposed-contact-geometry'},shoe:{mode:'single original shoe retained in source film; no duplicate shoe layer',replaceable:false},cardRendering:{trackPath:`${run}/tracking/card-tracks.json`,trackSha256:sha(await readFile(`${run}/tracking/card-tracks.json`)),landedQuad:landed,releaseFrame:118,observedReleaseSeconds:[3.8,3.9],textureQuadInferredFrames:[...new Set(inferred)],edgeOnFramesKeptOriginal:[54,73],body:'Source visible card surface is textured only through observed mask; hidden corners remain unknown in measurement data.',persistentCards:'Own presentation layer after release. Demo A-spades then K-hearts; no RNG/game logic.',layout:'After source frame150 each landed card slides over15frames to a deterministic fan offset (-100/+90px). This is an explicit UI placement animation, not newly filmed hand motion.',handOcclusion:'Original foreground retained over card layers; color-derived card visibility is not a complete semantic hand mask.'},timeline:timeline.map((f,i)=>({...f,outputFrame:i,outputSeconds:i/FPS,sourceSeconds:f.sourceFrame/FPS})),joins:[{outputFrame:90,from:'approach89',to:'deal3'},{outputFrame:267,from:'deal179',to:'deal17'},{outputFrame:430,from:'deal179',to:'retreat0'}],processing:{speed:1,freeze:false,crossfade:false,originalsUnchanged:true,key:'green dominance smooth alpha, limited edge despill',frameConversion:false},output:{path,sha256:sha(await readFile(path)),width:W,height:H,fps:FPS,frameCount:timeline.length,duration:timeline.length/FPS},productionAccepted:false,remaining:['Raw pose and lighting jumps require visual review.','Airborne card artwork uses inferred visible support quads; no claim of measured hidden corners.','Edge-on card surfaces retain source; complete replacement not accepted.','Torso rail and arm separation require full sequence inspection.','Portrait crop and Main integration not accepted.']},null,2)+'\n');
  console.log(JSON.stringify({output:path,...probe}));
}
