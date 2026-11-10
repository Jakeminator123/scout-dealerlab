import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PAMELA_CONTACT_CALIBRATION as C,getPamelaContactFrame,samplePamelaContactShadow,projectPamelaSourceContact} from '../src/pamela-contact-calibration.ts';
import {projectDealerPixel,sourcePlanePixel,type StageProjection} from '../src/pamela-stage-projection.ts';
import {tablePointToSource} from '../src/pamela-table-layer.ts';

sharp.concurrency(1);
const suffix=process.argv.find(a=>a.startsWith('--suffix='))?.slice(9)??'take-01';
if(!/^[a-z0-9-]+$/.test(suffix))throw Error('Invalid proof suffix');
const out=`runs/20261109-pamela-contact-calibration/${suffix}`;await mkdir(out,{recursive:true});
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const readBound=async(path:string,expected:string)=>{const bytes=await readFile(path);assert.equal(hash(bytes),expected,`Hash mismatch: ${path}`);return bytes;};
type RecordFrame={frame:number;quad:[number,number][];stats:{visiblePixels:[number,number]};mask:{path:string;sha256:string};source:{path:string;sha256:string}};
const track=JSON.parse((await readBound(C.trackPath,C.trackSha256)).toString()) as {frames:RecordFrame[];source:{sha256:string}};
const inputs=JSON.parse((await readBound(C.inputsPath,C.inputsSha256)).toString());
await readBound(C.sourcePath,C.sourceSha256);assert.equal(track.source.sha256,C.sourceSha256);assert.equal(track.frames.length,360);
const job=inputs.jobs.find((j:{seat:number})=>j.seat===4);assert.deepEqual(job.static.quads.c1,C.c1Quad);
const stage=JSON.parse(await readFile('references/pamela-stage-contract.json','utf8'));
const p:StageProjection={width:stage.dealerPlacement.width,sourceWidth:1762,sourceHeight:1174,contactSourceY:stage.dealerPlacement.contactSourceY,depth:stage.dealerPlacement.depth,tableHeight:stage.table.feltHeight+.004,camera:stage.camera.position,cameraTarget:stage.camera.target};
const state=(frame:number)=>getPamelaContactFrame({sourceSha256:C.sourceSha256,frame,projection:p,feltHeight:stage.table.feltHeight});
assert.throws(()=>getPamelaContactFrame({sourceSha256:'unbound',frame:180,projection:p,feltHeight:stage.table.feltHeight}));
assert.throws(()=>state(180.5));assert.throws(()=>state(360));
assert.throws(()=>getPamelaContactFrame({sourceSha256:C.sourceSha256,frame:180,projection:{...p,contactSourceY:875},feltHeight:stage.table.feltHeight}));
const intervalStates=[];
for(let frame=0;frame<360;frame++){
  const s=state(frame);assert.equal(s.cards[1].status,frame>=180?'visually-supported':'unknown');assert.equal(s.hand.shadow,null);
  assert.ok(track.frames[frame].stats.visiblePixels[0]>0,'Bound track lost C1 support');
  if(frame>=180)assert.deepEqual(track.frames[frame].quad,C.c2LandedQuad);
  if(frame>=218)assert.equal(s.hand.status,'separated');
  if(frame>=212&&frame<218)assert.equal(s.hand.status,'unknown');
  intervalStates.push({frame,c2:s.cards[1].status,hand:s.hand.status,receiver:s.hand.receiver});
}
// y>876 by itself must NOT turn a moving, tilted card into physical contact.
assert.ok(track.frames[120].quad.every(([,y])=>y>876));assert.equal(state(120).cards[1].status,'unknown');
const pans:[[number,number],...[number,number][]]=[[0,0],[-.16,-.07],[-.16,.07],[.16,-.07],[.16,.07]];
function screen(world:readonly number[],pan:readonly number[]){
  const dy=p.camera[1]-p.cameraTarget[1],dz=p.camera[2]-p.cameraTarget[2],length=Math.hypot(dy,dz),upY=dz/length,upZ=-dy/length;
  const x=world[0]-p.camera[0]-pan[0],y=world[1]-p.camera[1]-pan[1],z=world[2]-p.camera[2],depth=-(y*dy+z*dz)/length;
  const focal=1174/(2*Math.tan(stage.camera.fieldOfViewDegrees*Math.PI/360));
  return [881+x*focal/depth,587-(y*upY+z*upZ)*focal/depth];
}
const projectionChecks=[];let maxPanContactGapPx=0,maxNativeGapPx=0,minFeltEdgeMarginWorld=Infinity;
for(const [card,quad] of [['c1',C.c1Quad],['c2',C.c2LandedQuad]] as const)for(const [x,y] of quad){
  const contact=projectPamelaSourceContact(x,y,p,stage.table.feltHeight),native=tablePointToSource(contact.shadowWorld,p),nativeGap=Math.hypot(native[0]-x,native[1]-y);maxNativeGapPx=Math.max(maxNativeGapPx,nativeGap);
  assert.equal(contact.dealerWorld[1],p.tableHeight);
  const edgeMargin=Math.min(stage.table.width/2-stage.table.rimWidth-Math.abs(contact.dealerWorld[0]),stage.table.depth/2-stage.table.rimWidth-Math.abs(contact.dealerWorld[2]));
  minFeltEdgeMarginWorld=Math.min(minFeltEdgeMarginWorld,edgeMargin);assert.ok(edgeMargin>stage.table.cornerRadius,'Card anchor leaves the central unrounded felt area');
  for(const pan of pans){const cardPx=screen(contact.dealerWorld,pan),shadowPx=screen(contact.shadowWorld,pan),gap=Math.hypot(cardPx[0]-shadowPx[0],cardPx[1]-shadowPx[1]);maxPanContactGapPx=Math.max(maxPanContactGapPx,gap);projectionChecks.push({card,source:[x,y],pan,gapPx:gap});}
}
assert.ok(maxNativeGapPx<1e-9);assert.ok(maxPanContactGapPx<.1,'Contact separation too visible under permitted pan');
const foldChecks=[0,735,881,1435,1762].map(x=>{const folded=projectDealerPixel(x,876,p),plane=sourcePlanePixel(x,876,p),difference=Math.hypot(...folded.map((v,i)=>v-plane[i]));assert.ok(difference<1e-12);return {x,y:876,differenceWorld:difference};});
// A fixed viewport sample at the shadow edge is forbidden after source mismatch,
// over hand/card coverage, and in default preserve-source mode.
const protectedSample=samplePamelaContactShadow(state(180),[841.5,1076.5],{c1:0,c2:0,guard:1},'replace-lost-card-shadow');assert.deepEqual(protectedSample,{tableAlpha:0,interCardAlpha:0});
assert.deepEqual(samplePamelaContactShadow(state(180),[841.5,1076.5],{c1:0,c2:0,guard:0}),{tableAlpha:0,interCardAlpha:0});
const roi={left:820,top:950,width:160,height:145},frames=[0,...Array.from({length:65},(_,i)=>159+i),350,359],maskChecks=[],artifacts=[];
for(const frame of frames){
  const entry=track.frames[frame],maskBytes=await readBound(entry.mask.path,entry.mask.sha256),decoded=await sharp(maskBytes).extract(roi).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.channels,3);
  const s=state(frame),diagnostic=Buffer.alloc(roi.width*roi.height*3);let tablePixels=0,interCardPixels=0,maxAlpha=0,protectedShadowPixels=0,handBottom=-1,c2Top=Infinity;
  for(let y=0;y<roi.height;y++)for(let x=0;x<roi.width;x++){
    const i=(y*roi.width+x)*3,c1=decoded.data[i]/255,c2=decoded.data[i+1]/255,guard=decoded.data[i+2]/255,nx=x+roi.left,ny=y+roi.top;
    if(nx>=915&&nx<=945){if(guard)handBottom=Math.max(handBottom,ny);if(c2)c2Top=Math.min(c2Top,ny);}
    const a=samplePamelaContactShadow(s,[nx+.5,ny+.5],{c1,c2,guard},'replace-lost-card-shadow');
    if(a.tableAlpha>0)tablePixels++;if(a.interCardAlpha>0)interCardPixels++;if(guard&&(a.tableAlpha>0||a.interCardAlpha>0))protectedShadowPixels++;
    assert.ok(a.tableAlpha<=.06&&a.interCardAlpha<=.05);assert.ok(!a.interCardAlpha||c1>0);assert.ok(!a.tableAlpha||c1===0);assert.ok(!c2||(!a.tableAlpha&&!a.interCardAlpha));
    maxAlpha=Math.max(maxAlpha,a.tableAlpha,a.interCardAlpha);diagnostic[i]=Math.round(a.tableAlpha/.06*255);diagnostic[i+1]=Math.round(a.interCardAlpha/.05*255);
  }
  assert.equal(protectedShadowPixels,0);
  if(frame<180)assert.equal(interCardPixels,0);
  maskChecks.push({frame,maskSha256:entry.mask.sha256,tablePixels,interCardPixels,maxAlpha,protectedShadowPixels,fingerColumnMaskGapPx:handBottom<0||c2Top===Infinity?null:Math.max(0,c2Top-handBottom-1),gapIsContactProof:false});
  if([180,211,218,350].includes(frame)){const file=`shadow-support-f${frame}.png`,png=await sharp(diagnostic,{raw:{width:roi.width,height:roi.height,channels:3}}).png().toBuffer();await writeFile(`${out}/${file}`,png,{flag:'wx'});artifacts.push({file,sha256:hash(png),encoding:'R=table shadow / .06, G=intercard shadow / .05; diagnostic gain, not final opacity'});}
}
const inspectedFrames=[180,211,213,218],nativeEvidence=[];
for(const frame of inspectedFrames){const e=track.frames[frame];await readBound(e.source.path,e.source.sha256);nativeEvidence.push({frame,...e.source});}
const receipt={status:'conservative-contact-gates-and-projection-pass',createdAt:new Date().toISOString(),node:process.version,calibration:C,moduleSha256:hash(await readFile('src/pamela-contact-calibration.ts')),proofSha256:hash(await readFile('tools/pamela-contact-calibration-proof.ts')),stageContractSha256:hash(await readFile('references/pamela-stage-contract.json')),review:{nativeFrames: nativeEvidence,existingSheets:['audit/native-0160.png','audit/native-0192.png','audit/native-0320.png'].map(s=>`${C.trackPath.slice(0,-11)}/${s}`),interpretation:'C2 conservatively supported from180, finger on C2 through211, release212..217 unknown, hand lifted218+. Earlier touch not established.',fullContinuousPlaybackReviewed:false},geometry:{maxNativeGapPx,maxPanContactGapPx,minFeltEdgeMarginWorld,viewport:[1762,1174],pans,foldChecks,projectionChecks,physicalScale:'unknown',displayPlaneSeparation:p.tableHeight-stage.table.feltHeight},intervalStates,maskChecks,artifacts,apiCalls:0,sourceModified:false,limitations:['Full source was hash verified, but current visual review covers listed frames/sheets only.','Frame180 is a conservative contact gate, not the measured first-touch frame.','The RGB mask blue channel combines hand and shoe-paper protection; ROI diagnostics are not anatomical ground truth.','Source y>876 is folded even while a card is airborne. No physical depth is recovered.','Preserve-source mode is default; synthetic shadow requires deliberate replacement of lost source shadow.','Browser compositing and ongoing full-shoe integration are outside this proof.']};
await writeFile(`${out}/proof.json`,JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify({proof:`${out}/proof.json`,framesChecked:maskChecks.length,maxNativeGapPx,maxPanContactGapPx,protectedShadowPixels:0,handShadowEverAdded:false}));
