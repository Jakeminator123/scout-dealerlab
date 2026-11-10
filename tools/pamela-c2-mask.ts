import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const run='runs/20261109-pamela-central-composite';
const outDir=`${run}/tracking/c2-pilot`;
const sourceDir='runs/20261109-pamela-sequence/qa/central-base';
const sourceMovie='runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4';
const expectedHash='2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a';
const W=1762,H=1174,FPS=30;
type Point=[number,number];type Quad=[Point,Point,Point,Point];
const landed:Quad=[[820,1026],[943,1026],[963,1093],[802,1093]];
const region={left:550,top:700,width:600,height:425};
const proofIndices=[77,84,98,114,118];
const sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const clamp=(v:number,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
const move=(q:Quad,dx:number):Quad=>q.map(([x,y])=>[x+dx,y]) as Quad;
const frozenPath=`${run}/tracking/card-tracks.json`,frozenBytes=await fs.readFile(frozenPath),frozenHash=sha(frozenBytes);
const tracks=JSON.parse(frozenBytes.toString('utf8'));
if(sha(await fs.readFile(sourceMovie))!==expectedHash||tracks.source.sha256!==expectedHash)throw Error('Source identity mismatch');
for(const d of ['foreground-mask','proofs'])await fs.mkdir(`${outDir}/${d}`,{recursive:true});

function greenAlpha(r:number,g:number,b:number) {const d=g-Math.max(r,b);return d>8?clamp((52-d)/44):1;}
function contains(x:number,y:number,q:Quad) {
  let hit=false;for(let i=0,j=3;i<4;j=i++)if((q[i][1]>y)!==(q[j][1]>y)&&x<(q[j][0]-q[i][0])*(y-q[i][1])/(q[j][1]-q[i][1])+q[i][0])hit=!hit;return hit;
}
function homography(quad:Quad) {
  const uv=[[0,0],[1,0],[1,1],[0,1]],rows:number[][]=[];
  for(let i=0;i<4;i++){const[x,y]=quad[i],[u,v]=uv[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
  for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[p][c]))p=r;[rows[c],rows[p]]=[rows[p],rows[c]];const d=rows[c][c];if(Math.abs(d)<1e-8)return null;for(let k=c;k<9;k++)rows[c][k]/=d;for(let r=0;r<8;r++)if(r!==c){const f=rows[r][c];for(let k=c;k<9;k++)rows[r][k]-=f*rows[c][k];}}
  return rows.map(r=>r[8]);
}
function observedEnvelope(contour:Point[]):Quad|null {
  if(contour.length<4)return null;const score=[(p:Point)=>p[0]+p[1],(p:Point)=>-p[0]+p[1],(p:Point)=>-p[0]-p[1],(p:Point)=>p[0]-p[1]];
  const q=score.map(fn=>contour.reduce((a,b)=>fn(a)<fn(b)?a:b)) as Quad;return new Set(q.map(p=>p.join(','))).size===4?q:null;
}
async function texture(rank:string,suit:string,color:string) {
  return sharp(Buffer.from(`<svg width="210" height="294"><rect width="210" height="294" rx="9" fill="#f7f4e9"/><g fill="${color}" font-family="Arial" text-anchor="middle"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text><text x="105" y="185" font-size="105">${suit}</text><g transform="translate(210 294) rotate(180)"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text></g></g></svg>`)).removeAlpha().raw().toBuffer();
}
const tex1=await texture('A','♠','#182027'),tex2=await texture('K','♥','#a52d32');
function drawCard(out:Buffer,tex:Buffer,q:Quad,mask?:Buffer) {
  const h=homography(q);if(!h)return;
  const xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);
  for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(H-1,Math.ceil(Math.max(...ys)));y++)for(let x=Math.max(0,Math.floor(Math.min(...xs)));x<=Math.min(W-1,Math.ceil(Math.max(...xs)));x++) {
    const den=h[6]*x+h[7]*y+1,u=(h[0]*x+h[1]*y+h[2])/den,v=(h[3]*x+h[4]*y+h[5])/den;
    if(u<0||u>1||v<0||v>1)continue;const p=y*W+x,i=p*3,a=mask?mask[p]/255:1,t=(Math.min(293,Math.floor(v*294))*210+Math.min(209,Math.floor(u*210)))*3;
    for(let c=0;c<3;c++)out[i+c]=Math.round(clamp(out[i+c]*(1-a)+tex[t+c]*a,0,255));
  }
}
function makeForeground(source:Buffer,moving:Buffer) {
  const mask=Buffer.alloc(W*H);
  for(let y=region.top;y<region.top+region.height;y++)for(let x=region.left;x<region.left+region.width;x++) {
    const p=y*W+x,i=p*3,r=source[i],g=source[i+1],b=source[i+2];
    let card=0;
    // Two-pixel conservative exclusion catches the warm paper rim. Clear skin is retained.
    const clearSkin=r-g>34&&r-b>65;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)card=Math.max(card,moving[(y+dy)*W+x+dx]);
    const exclusion=clearSkin?moving[p]/255:card/255;
    mask[p]=Math.round(255*greenAlpha(r,g,b)*(1-exclusion));
  }
  return mask;
}
function sourceOnTable(source:Buffer) {
  const output=Buffer.alloc(W*H*3);
  for(let p=0;p<W*H;p++){const i=p*3,r=source[i],g=source[i+1],b=source[i+2],a=greenAlpha(r,g,b),neutral=[30,42,42];for(let c=0;c<3;c++)output[i+c]=Math.round(source[i+c]*a+neutral[c]*(1-a));}
  return output;
}
function restore(out:Buffer,source:Buffer,mask:Buffer) {
  for(let p=0;p<W*H;p++){const a=mask[p]/255;if(!a)continue;for(let c=0;c<3;c++)out[p*3+c]=Math.round(out[p*3+c]*(1-a)+source[p*3+c]*a);}
}
async function labelTile(rgb:Buffer,label:string) {
  const crop={left:620,top:720,width:450,height:400};
  const pic=await sharp(rgb,{raw:{width:W,height:H,channels:3}}).extract(crop).png().toBuffer();
  const header=Buffer.from(`<svg width="450" height="32"><rect width="450" height="32" fill="#10191c"/><text x="9" y="22" fill="white" font-family="Arial" font-size="16">${label}</text></svg>`);
  return sharp({create:{width:450,height:432,channels:3,background:'#10191c'}}).composite([{input:pic,left:0,top:32},{input:header,left:0,top:0}]).png().toBuffer();
}
const records:any[]=[];
for(let index=77;index<=118;index++) {
  const n=index+1,name=`frame-${String(n).padStart(3,'0')}.png`,sourceBytes=await fs.readFile(`${sourceDir}/${name}`);
  const source=await sharp(sourceBytes).removeAlpha().raw().toBuffer();
  if(sha(sourceBytes)!==tracks.frames[index].frameSha256)throw Error(`Native frame hash mismatch ${n}`);
  const moving=await sharp(`${run}/tracking/moving-mask/${name}`).greyscale().raw().toBuffer();
  const mask=makeForeground(source,moving),maskBytes=await sharp(mask,{raw:{width:W,height:H,channels:1}}).png().toBuffer();
  await fs.writeFile(`${outDir}/foreground-mask/${name}`,maskBytes);
  let overlapPx=0,confidentOverlapPx=0,cardIntersection=0;
  const prior=move(landed,-100);
  for(let y=1020;y<1100;y++)for(let x=690;x<970;x++){const p=y*W+x;if(contains(x,y,prior)&&mask[p]>=128)overlapPx++;if(contains(x,y,prior)&&mask[p]>=250)confidentOverlapPx++;if(moving[p]>=250&&mask[p]>=128)cardIntersection++;}
  const record:any={frameIndex:index,fileFrame:n,timeSeconds:index/FPS,sourceFrameSha256:sha(sourceBytes),maskPath:`tracking/c2-pilot/foreground-mask/${name}`,maskSha256:sha(maskBytes),maskMeaning:'Observed chroma foreground inside explicit local support ROI, minus visible card and conservative 2px paper rim. Includes hands and sleeve/support foreground; not a complete semantic or amodal arm reconstruction.',priorCardOffsetNative:[-100,0],priorCardOccludedPixels:overlapPx,priorCardConfidentOccludedPixels:confidentOverlapPx,opaqueCardForegroundIntersectionPixels:cardIntersection};
  if(proofIndices.includes(index)) {
    const measurement=tracks.frames[index].moving,q=index>=118?landed:observedEnvelope(measurement.contourNative);
    const without=sourceOnTable(source);drawCard(without,tex1,prior);
    // Keep card2 above card1 in both variants; the only comparison variable is foreground occlusion.
    restore(without,source,moving);if(q)drawCard(without,tex2,q,moving);
    const withMask=Buffer.from(without);restore(withMask,source,mask);
    let errorBefore=0,errorAfter=0,pixelCount=0;
    for(let y=1020;y<1100;y++)for(let x=690;x<970;x++){const p=y*W+x,i=p*3;if(!contains(x,y,prior)||mask[p]<250)continue;pixelCount++;for(let c=0;c<3;c++){errorBefore+=Math.abs(without[i+c]-source[i+c]);errorAfter+=Math.abs(withMask[i+c]-source[i+c]);}}
    record.reapplicationCheck={comparedNativePixels:pixelCount,meanAbsoluteChannelErrorWithout:pixelCount?errorBefore/(pixelCount*3):0,meanAbsoluteChannelErrorWith:pixelCount?errorAfter/(pixelCount*3):0,meaning:'Implementation consistency against original foreground pixels; not semantic mask accuracy.'};
    const overlay=Buffer.from(source);for(let p=0;p<W*H;p++){const a=mask[p]/255*.55;overlay[p*3]=Math.round(overlay[p*3]*(1-a)+255*a);overlay[p*3+1]=Math.round(overlay[p*3+1]*(1-a));overlay[p*3+2]=Math.round(overlay[p*3+2]*(1-a)+255*a);}
    const tiles=await Promise.all([labelTile(without,`Zero ${index}: without arm/hand protection`),labelTile(withMask,`Zero ${index}: observed foreground protected`),labelTile(overlay,`Zero ${index}: foreground support mask`)]);
    const proof=await sharp({create:{width:1350,height:432,channels:3,background:'#10191c'}}).composite(tiles.map((input,i)=>({input,left:i*450,top:0}))).png().toBuffer();
    const proofPath=`${outDir}/proofs/c2-proof-${String(index).padStart(3,'0')}.png`;await fs.writeFile(proofPath,proof);record.proof={path:proofPath,sha256:sha(proof),card2Artwork:'Illustrative homography to observed envelope only; source bend is retained by visibility mask. No hidden-corner measurement.'};
  }
  records.push(record);
}
const placements=[{id:'root-offset',previousDx:-100},{id:'half-overlap',previousDx:-71},{id:'beside',previousDx:-180}].map(p=>{
  let area=0,overlap=0;const q1=move(landed,p.previousDx);
  for(let y=1020;y<1100;y++)for(let x=600;x<980;x++){if(contains(x,y,landed))area++;if(contains(x,y,landed)&&contains(x,y,q1))overlap++;}
  return {...p,ordinal1QuadNative:q1,ordinal2QuadNative:landed,overlapOfSecondCardPercent:100*overlap/area,placementMeaning:'Presentation placement of the already dealt first card. Current second-card landing and filmed hand remain unchanged.'};
});
const releasedSource=await sharp(`${sourceDir}/frame-119.png`).removeAlpha().raw().toBuffer();
const releasedMoving=await sharp(`${run}/tracking/moving-mask/frame-119.png`).greyscale().raw().toBuffer();
const releasedForeground=makeForeground(releasedSource,releasedMoving);
const layoutTiles=await Promise.all(placements.map(async p=>{
  const pixels=sourceOnTable(releasedSource);drawCard(pixels,tex1,p.ordinal1QuadNative);restore(pixels,releasedSource,releasedMoving);drawCard(pixels,tex2,landed,releasedMoving);restore(pixels,releasedSource,releasedForeground);
  return labelTile(pixels,`${p.id}: dx ${p.previousDx}, overlap ${p.overlapOfSecondCardPercent.toFixed(1)}%`);
}));
await sharp({create:{width:1350,height:432,channels:3,background:'#10191c'}}).composite(layoutTiles.map((input,i)=>({input,left:i*450,top:0}))).png().toFile(`${outDir}/proofs/placement-variants.png`);
const updatedQa=[];
for(const index of [185,348]){const p=`${run}/qa/composite-${index}.png`,bytes=await fs.readFile(p),pixels=await sharp(bytes).removeAlpha().raw().toBuffer();let cyan=0;for(let y=1010;y<1098;y++)for(let x=780;x<950;x++){const i=(y*W+x)*3;if(pixels[i]<40&&pixels[i+1]>=180&&pixels[i+2]>=180)cyan++;}updatedQa.push({outputFrame:index,sha256:sha(bytes),cyanPixels:cyan});}
if(sha(await fs.readFile(frozenPath))!==frozenHash)throw Error('Frozen tracking bundle changed during pilot');
let verifiedDimensions=0;
for(const r of records){const info=await sharp(`${run}/${r.maskPath}`).metadata();if(info.width!==W||info.height!==H)throw Error('Mask plane mismatch');verifiedDimensions++;}
const manifest={schemaVersion:1,status:'local-c2-mask-pilot-not-production-accepted',createdAt:new Date().toISOString(),source:{path:sourceMovie,sha256:expectedHash,width:W,height:H,fps:FPS,frameCount:180,poseBefore:'REDO',poseAfter:'REDO',verifiedMotionTarget:'central native landing only'},frozenTracking:{path:frozenPath,sha256:frozenHash,modified:false},mask:{type:'observed-local-foreground-support',roiNative:region,frameIndexRange:[77,118],frameIndexBase:0,fileFrameRange:[78,119],cardExclusion:'Existing frozen visible-card mask plus 2px conservative dilation except clear warm skin.',limitations:['Where black sleeve overlaps black torso, arm/body separation is not observed. The ROI intentionally retains support foreground.', 'No amodal hand/arm recovery; boundary mixes, nails and warm paper rim remain conservative.', 'A mask controls z-order only. It does not move the physical hand, grip, landing point or source pose.']},minimalContract:{target:{id:'central',kind:'local-demo',bindingStatus:'source-verified'},ordinal:2,placement:{coordinateSpace:'source native pixels',currentCardLandingQuadNative:landed,previousCardOffsetsNative:placements.map(p=>[p.previousDx,0]),appliedBeforeStroke:true},mask:{pathPattern:'tracking/c2-pilot/foreground-mask/frame-%03d.png',fileFrameEqualsSourceFrameIndexPlus:1},sourcePose:{before:'REDO',after:'REDO',sourceSha256:expectedHash},layerOrder:['table','prior card presentation layer','current visible card layer','observed foreground arm/hand pixels']},targetContractExamples:[{eventId:'box-2-c2',target:{kind:'player',id:'box-2'},ordinal:2,sourceBinding:'not-verified-for-this-motion',requires:'Own target pose/landing calibration or explicitly reviewed reprojection before reuse.'},{eventId:'dealer-c2',target:{kind:'dealer',id:'dealer'},ordinal:2,sourceBinding:'not-verified-for-this-motion',requires:'Own target pose/landing calibration or explicitly reviewed reprojection before reuse.'}],placements,placementProof:`${outDir}/proofs/placement-variants.png`,updatedRootStillQa:updatedQa,frames:records,qa:{dimensionsChecked:verifiedDimensions,proofFrameIndices:proofIndices,previousCardTouchFrames:records.filter(r=>r.priorCardOccludedPixels>0).map(r=>r.frameIndex),opaqueCardForegroundIntersectionPixels:records.reduce((s,r)=>s+r.opaqueCardForegroundIntersectionPixels,0),note:'Pixel reapplication errors quantify implementation behavior only. Five proofs were visually reviewed during the pilot: source hand pixels are retained, and skin is not extended into card2. The support ROI includes black torso where sleeve/body boundary is unobserved.'}};
await fs.writeFile(`${outDir}/c2-mask-manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output:outDir,frames:records.length,proofs:proofIndices,overlap:placements.map(p=>({id:p.id,percent:p.overlapOfSecondCardPercent})),touchFrames:manifest.qa.previousCardTouchFrames,rootCyan:updatedQa.map(q=>({frame:q.outputFrame,cyan:q.cyanPixels})),frozenTrackingUnchanged:true}));
