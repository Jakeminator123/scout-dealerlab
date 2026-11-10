import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
sharp.concurrency(1);
const original='runs/20261109-pamela-seat1-two-card/generation-anchors';
const finalCandidate=process.argv.includes('--final'),wide=finalCandidate||process.argv.includes('--wide');
const run=`runs/20261109-pamela-seat1-two-card/generation-anchors-${finalCandidate?'v4':wide?'v3':'v2'}`;
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const manifestBytes=await readFile(`${original}/anchors.json`),anchors=JSON.parse(manifestBytes.toString());
const W=anchors.base.width,H=anchors.base.height,roi={left:80,top:740,width:300,height:160};
assert.deepEqual(anchors.transform.authoredC2OffsetNative,[18,-6]);
const inputs=[
 {name:'base',path:anchors.base.path,sha256:anchors.base.sha256},
 {name:'first',...anchors.outputs.first},
 {name:'last',...anchors.outputs.last},
 {name:'c1',path:`${original}/c1-neutral-layer.png`,sha256:anchors.outputs.c1LayerSha256},
 {name:'c2',path:`${original}/c2-neutral-layer.png`,sha256:anchors.outputs.c2LayerSha256}
];
const comparisonAnchor=wide?JSON.parse(await readFile(`runs/20261109-pamela-seat1-two-card/generation-anchors-${finalCandidate?'v3':'v2'}/anchors.json`,'utf8')):null;
const comparisonPath=wide?comparisonAnchor.last.path:anchors.outputs.last.path;
if(wide)inputs.push({name:'comparison',...comparisonAnchor.last});
const bytes:Record<string,Buffer>={};for(const input of inputs){bytes[input.name]=await readFile(input.path);assert.equal(sha(bytes[input.name]),input.sha256);}
const base=await sharp(bytes.base).removeAlpha().raw().toBuffer(),originalLast=await sharp(bytes.last).removeAlpha().raw().toBuffer();
const c1=await sharp(bytes.c1).ensureAlpha().raw().toBuffer(),originalC2=await sharp(bytes.c2).ensureAlpha().raw().toBuffer();
const nativeOffset=[wide?46:18,finalCandidate?-22:-6],scale=anchors.transform.cardOnlyCanvasMapping,offset=[nativeOffset[0]*scale[0],nativeOffset[1]*scale[1]];
const c2=wide?Buffer.alloc(W*H*4):originalC2;
if(wide)for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
 const sx=x-offset[0],sy=y-offset[1],ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,p=(y*W+x)*4;
 let alpha=0;const rgb=[0,0,0];
 for(const [dx,dy,weight] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){
  const q=((iy+dy)*W+ix+dx)*4,a=c1[q+3]/255*weight;alpha+=a;for(let c=0;c<3;c++)rgb[c]+=c1[q+c]*a;
 }
 if(alpha){for(let c=0;c<3;c++)c2[p+c]=Math.round(rgb[c]/alpha);c2[p+3]=Math.round(alpha*255);}
}
function composite(out:Buffer,rgba:Buffer){
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
  const p=y*W+x,a=rgba[p*4+3]/255;if(!a)continue;
  for(let c=0;c<3;c++)out[p*3+c]=Math.round(rgba[p*4+c]*a+out[p*3+c]*(1-a));
 }
}
const rebuiltFirst=Buffer.from(base);composite(rebuiltFirst,c1);
assert.deepEqual(rebuiltFirst,await sharp(bytes.first).removeAlpha().raw().toBuffer());
const rebuiltLast=Buffer.from(rebuiltFirst);composite(rebuiltLast,originalC2);assert.deepEqual(rebuiltLast,originalLast);
const previousLast=Buffer.from(rebuiltFirst);composite(previousLast,c2);
const comparisonRaw=wide?await sharp(bytes.comparison).removeAlpha().raw().toBuffer():originalLast;
const priorOffset=wide?comparisonAnchor.parameters.nativeOffset:[18,-6];
await mkdir(run);await mkdir(`${run}/qa`);await mkdir(`${run}/layers`);await mkdir(`${run}/snapshot`);
await writeFile(`${run}/snapshot/original-anchors.json`,manifestBytes);
const code=await readFile('tools/pamela-c2-anchor.ts');await writeFile(`${run}/snapshot/pamela-c2-anchor.ts`,code);
const parameters={requestedOpacity:.10,peakAlphaByte:Math.floor(255*.10),effectivePeakOpacity:Math.floor(255*.10)/255,maximumWidthReferencePixels:2,underCardOuterEdgeProtectionRadius:2,underCardCoreAlphaThreshold:250,upperCardBoundaryAlphaThreshold:128,falloff:'full through distance1px; (2.1-distance)/1.1 through distance2px; zero beyond2px',referenceCanvas:[W,H],nativeOffset,upperLayerUnchangedDuringShadow:true};
const disk=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const distance=Math.hypot(dx,dy);if(distance<=2)disk.push({dx,dy,distance});}
const shadow=Buffer.alloc(W*H*4),shadowMask=Buffer.alloc(W*H),c1Shaded=Buffer.from(c1),distances=new Float32Array(W*H).fill(Infinity),protectedUnderEdge=new Uint8Array(W*H);
let shadowSupport=0;
for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
 const p=y*W+x,underAlpha=c1[p*4+3],overAlpha=c2[p*4+3];
 const underCore=underAlpha>=250&&disk.every(({dx,dy})=>c1[((y+dy)*W+x+dx)*4+3]>=250);
 if(underAlpha>0&&!underCore)protectedUnderEdge[p]=1;
 if(!underCore||overAlpha===255)continue;
 let distance=Infinity;for(const d of disk)if(c2[((y+d.dy)*W+x+d.dx)*4+3]>=128)distance=Math.min(distance,d.distance);
 if(distance>2)continue;
 const falloff=distance<=1?1:(2.1-distance)/1.1,alphaByte=Math.floor(parameters.peakAlphaByte*falloff);if(!alphaByte)continue;
 distances[p]=distance;shadow[p*4+3]=alphaByte;shadowMask[p]=alphaByte;shadowSupport++;
 for(let c=0;c<3;c++)c1Shaded[p*4+c]=Math.round(c1[p*4+c]*(1-alphaByte/255));
}
const last=Buffer.from(base);composite(last,c1Shaded);composite(last,c2);
const proof={comparedPixels:W*H,changedPixels:0,outsideCardRoiChanged:0,outsideUnderAlphaChanged:0,underCardProtectedOuterEdgeChanged:0,opaqueUpperCardChanged:0,protectedPamelaAndShoeChanged:0,maxChannelDarkening:0,maxChannelBrightening:0,maxDistanceFromUpperHalfAlpha:0,shadowSupportPixels:shadowSupport,changedBounds:{left:W,top:H,right:-1,bottom:-1},protectedRgbSha256:{before:'',after:''},underAlphaSha256Before:'',underAlphaSha256After:''};
const protectedBefore=Buffer.alloc(W*H*3),protectedAfter=Buffer.alloc(W*H*3),underAlphaBefore=Buffer.alloc(W*H),underAlphaAfter=Buffer.alloc(W*H);
for(let p=0;p<W*H;p++){
 const x=p%W,y=Math.floor(p/W),changed=[0,1,2].some(c=>last[p*3+c]!==previousLast[p*3+c]),inRoi=x>=roi.left&&x<roi.left+roi.width&&y>=roi.top&&y<roi.top+roi.height;
 underAlphaBefore[p]=c1[p*4+3];underAlphaAfter[p]=c1Shaded[p*4+3];
 if(!shadowMask[p])for(let c=0;c<3;c++){protectedBefore[p*3+c]=previousLast[p*3+c];protectedAfter[p*3+c]=last[p*3+c];}
 if(!changed)continue;
 proof.changedPixels++;if(!inRoi)proof.outsideCardRoiChanged++;if(c1[p*4+3]===0)proof.outsideUnderAlphaChanged++;if(protectedUnderEdge[p])proof.underCardProtectedOuterEdgeChanged++;if(c2[p*4+3]===255)proof.opaqueUpperCardChanged++;if(x>=400||y<730)proof.protectedPamelaAndShoeChanged++;
 proof.maxDistanceFromUpperHalfAlpha=Math.max(proof.maxDistanceFromUpperHalfAlpha,distances[p]);proof.changedBounds.left=Math.min(proof.changedBounds.left,x);proof.changedBounds.top=Math.min(proof.changedBounds.top,y);proof.changedBounds.right=Math.max(proof.changedBounds.right,x);proof.changedBounds.bottom=Math.max(proof.changedBounds.bottom,y);
 for(let c=0;c<3;c++){proof.maxChannelDarkening=Math.max(proof.maxChannelDarkening,previousLast[p*3+c]-last[p*3+c]);proof.maxChannelBrightening=Math.max(proof.maxChannelBrightening,last[p*3+c]-previousLast[p*3+c]);}
}
proof.protectedRgbSha256={before:sha(protectedBefore),after:sha(protectedAfter)};proof.underAlphaSha256Before=sha(underAlphaBefore);proof.underAlphaSha256After=sha(underAlphaAfter);
assert.equal(proof.outsideCardRoiChanged,0);assert.equal(proof.outsideUnderAlphaChanged,0);assert.equal(proof.underCardProtectedOuterEdgeChanged,0);assert.equal(proof.opaqueUpperCardChanged,0);assert.equal(proof.protectedPamelaAndShoeChanged,0);assert.equal(proof.maxChannelBrightening,0);assert.ok(proof.maxDistanceFromUpperHalfAlpha<=2);assert.equal(proof.protectedRgbSha256.before,proof.protectedRgbSha256.after);assert.equal(proof.underAlphaSha256Before,proof.underAlphaSha256After);
const outputFirst=`${run}/FIRST-redo-with-neutral-c1.png`,outputLast=`${run}/LAST-redo-with-neutral-c1-c2-contact-shadow.png`;
await writeFile(outputFirst,bytes.first);await sharp(last,{raw:{width:W,height:H,channels:3}}).png().toFile(outputLast);
await sharp(shadow,{raw:{width:W,height:H,channels:4}}).png().toFile(`${run}/layers/contact-shadow-under-c2.png`);
await sharp(shadowMask,{raw:{width:W,height:H,channels:1}}).png().toFile(`${run}/layers/contact-shadow-alpha.png`);
await sharp(c1Shaded,{raw:{width:W,height:H,channels:4}}).png().toFile(`${run}/layers/c1-with-contact-shadow.png`);
await writeFile(`${run}/layers/c2-unchanged.png`,wide?await sharp(c2,{raw:{width:W,height:H,channels:4}}).png().toBuffer():bytes.c2);
await sharp(previousLast,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/LAST-target-without-shadow.png`);
const crop=finalCandidate?{left:90,top:745,width:280,height:125}:{left:90,top:760,width:260,height:105};
for(const scale of [1,4]){
 const panels=[],cellW=crop.width*scale,cellH=crop.height*scale+28;
 for(const [index,path] of [comparisonPath,outputLast].entries()){
  const input=await sharp(path).extract(crop).resize(cellW,crop.height*scale,{kernel:'nearest'}).png().toBuffer();
  panels.push({input,left:index*cellW,top:28},{input:Buffer.from(`<svg width="${cellW}" height="28"><rect width="100%" height="100%" fill="#17202a"/><text x="8" y="20" fill="white" font-size="16">${wide?(index?nativeOffset.join(' / '):priorOffset.join(' / ')):(index?'NEW':'PREVIOUS')} / ${scale===1?'100%':'4x nearest'}</text></svg>`),left:index*cellW,top:0});
 }
 await sharp({create:{width:cellW*2,height:cellH,channels:3,background:'#17202a'}}).composite(panels).png().toFile(`${run}/qa/LAST-before-after-${scale===1?'100-percent':'4x'}.png`);
}
const diff=Buffer.alloc(W*H*3);for(let p=0;p<W*H;p++)if([0,1,2].some(c=>last[p*3+c]!==previousLast[p*3+c])){diff[p*3]=255;diff[p*3+1]=80;}
await sharp(diff,{raw:{width:W,height:H,channels:3}}).extract(crop).resize(crop.width*4,crop.height*4,{kernel:'nearest'}).png().toFile(`${run}/qa/changed-pixels-4x.png`);
const outputFiles=[outputFirst,outputLast,`${run}/layers/contact-shadow-under-c2.png`,`${run}/layers/contact-shadow-alpha.png`,`${run}/layers/c1-with-contact-shadow.png`,`${run}/layers/c2-unchanged.png`,`${run}/qa/LAST-before-after-100-percent.png`,`${run}/qa/LAST-before-after-4x.png`,`${run}/qa/changed-pixels-4x.png`,`${run}/qa/LAST-target-without-shadow.png`];
const priorC2=wide?await sharp(comparisonAnchor.outputs.find((o:any)=>o.path.endsWith('/c2-unchanged.png')).path).ensureAlpha().raw().toBuffer():originalC2;
const geometryProof={comparisonPath,changedPixels:0,outsideCardRoiChanged:0,outsideOldAndNewCardUnionChanged:0,pamelaAndShoeChanged:0,exposedUnderCardOpaquePixelsBefore:0,exposedUnderCardOpaquePixelsAfter:0,changedBounds:{left:W,top:H,right:-1,bottom:-1},protectedRgbSha256:{before:'',after:''}};
const geometryProtectedBefore=Buffer.alloc(W*H*3),geometryProtectedAfter=Buffer.alloc(W*H*3);
for(let p=0;p<W*H;p++){
 const x=p%W,y=Math.floor(p/W),union=Math.max(c1[p*4+3],priorC2[p*4+3],c2[p*4+3]);
 if(c1[p*4+3]>200&&priorC2[p*4+3]<30)geometryProof.exposedUnderCardOpaquePixelsBefore++;
 if(c1[p*4+3]>200&&c2[p*4+3]<30)geometryProof.exposedUnderCardOpaquePixelsAfter++;
 if(!union)for(let c=0;c<3;c++){geometryProtectedBefore[p*3+c]=comparisonRaw[p*3+c];geometryProtectedAfter[p*3+c]=last[p*3+c];}
 if(![0,1,2].some(c=>comparisonRaw[p*3+c]!==last[p*3+c]))continue;
 geometryProof.changedPixels++;if(x<roi.left||x>=roi.left+roi.width||y<roi.top||y>=roi.top+roi.height)geometryProof.outsideCardRoiChanged++;if(!union)geometryProof.outsideOldAndNewCardUnionChanged++;if(x>=400||y<730)geometryProof.pamelaAndShoeChanged++;
 geometryProof.changedBounds.left=Math.min(geometryProof.changedBounds.left,x);geometryProof.changedBounds.top=Math.min(geometryProof.changedBounds.top,y);geometryProof.changedBounds.right=Math.max(geometryProof.changedBounds.right,x);geometryProof.changedBounds.bottom=Math.max(geometryProof.changedBounds.bottom,y);
}
geometryProof.protectedRgbSha256={before:sha(geometryProtectedBefore),after:sha(geometryProtectedAfter)};
assert.equal(geometryProof.outsideCardRoiChanged,0);assert.equal(geometryProof.outsideOldAndNewCardUnionChanged,0);assert.equal(geometryProof.pamelaAndShoeChanged,0);assert.equal(geometryProof.protectedRgbSha256.before,geometryProof.protectedRgbSha256.after);
if(wide){
 const fullPath=`${run}/qa/LAST-before-after-full.png`,panels=[];
 for(const [i,path] of [comparisonPath,outputLast].entries())panels.push({input:await readFile(path),left:i*W,top:28},{input:Buffer.from(`<svg width="${W}" height="28"><rect width="100%" height="100%" fill="#17202a"/><text x="8" y="20" fill="white" font-size="17">${(i?nativeOffset:priorOffset).join(' X / ')} Y native px / authored final target / same 0.098 shadow</text></svg>`),left:i*W,top:0});
 await sharp({create:{width:W*2,height:H+28,channels:3,background:'#17202a'}}).composite(panels).png().toFile(fullPath);outputFiles.push(fullPath);
}
const outputs=[];for(const path of outputFiles)outputs.push({path,sha256:sha(await readFile(path))});
assert.equal(outputs[0].sha256,anchors.outputs.first.sha256);assert.deepEqual(await sharp(outputLast).removeAlpha().raw().toBuffer(),last);
for(const input of inputs)assert.equal(sha(await readFile(input.path)),input.sha256);assert.equal(sha(await readFile(`${original}/anchors.json`)),sha(manifestBytes));
const target={...anchors.target,c2Quad:anchors.target.c1Quad.map(([x,y]:number[])=>[x+offset[0],y+offset[1]]),c2Centre:[anchors.target.c1Centre[0]+offset[0],anchors.target.c1Centre[1]+offset[1]]};
const transform={...anchors.transform,authoredC2OffsetNative:nativeOffset,authoredC2OffsetAnchor:offset};
await writeFile(`${run}/anchors.json`,JSON.stringify({createdAt:new Date().toISOString(),status:'awaiting-native-visual-assessment',localPreparationOnly:true,apiGenerationStarted:false,productionAccepted:false,sourceAnchorManifest:{path:`${original}/anchors.json`,sha256:sha(manifestBytes)},inputs,editRoi:roi,comparisonCrop:crop,geometry:{transform,target,changed:wide,authoredFinalTargetOnly:true,existingMovieOrHandShifted:false},parameters,shadowPixelProof:proof,geometryPixelProof:geometryProof,outputs,first:outputs[0],last:outputs[1],code:{path:'tools/pamela-c2-anchor.ts',sha256:sha(code)},limitations:['Contact shadow and C2 overlap are authored, not observed motion or lighting.','No print added; no change to Pamela or shoe.','This is a final image target for a possible new take, not a shift of any existing video or hand.'],reproduction:`node tools/pamela-c2-anchor.ts${finalCandidate?' --final':wide?' --wide':''} (new empty output directory required)`},null,2)+'\n');
console.log(JSON.stringify({first:outputs[0],last:outputs[1],parameters,geometry:{transform,target},shadowPixelProof:proof,geometryPixelProof:geometryProof}));
