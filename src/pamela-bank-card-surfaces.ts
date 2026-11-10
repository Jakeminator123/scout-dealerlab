/** Native geometry adapter for the fourteen presentation clips.
 * Always reads the blank original, never a previously printed result. The
 * caller supplies engine decisions and independent front/back materials. */
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {checkedMaterialBytes,materialHash as hash,type FrozenMaterialSelection,type FrozenRef} from './pamela-frozen-material-track.ts';
import {edgeSurfaceUv} from './pamela-edge-card-track.ts';
import {applyPaperMaterials} from './pamela-paper-material.ts';
import {renderTwoSidedCards,presentedCardMaterial,type CardPhysicalSide,type CardQuad,type CardSurface,type CardTexture} from './pamela-two-sided-card.ts';
import {calibrateP1CardFrame} from './pamela-p1-side-calibration.ts';
import {calibrateP2CardFrame} from './pamela-p2-card-calibration.ts';
import {calibrateP3CardFrame} from './pamela-p3-card-calibration.ts';
import {calibrateP4CardFrame} from './pamela-p4-card-calibration.ts';
import {calibrateP5CardFrame} from './pamela-p5-card-calibration.ts';

const W=1762,H=1174,N=W*H;
export type BankSideSegment={start:number;end:number;side:CardPhysicalSide};
export type BankSurfaceSelection=FrozenMaterialSelection&{
 sidePolicy:{sourceSha256:string;physicalSide:'UNKNOWN';segments:BankSideSegment[];basis:FrozenRef};
 calibration?:{evidence:FrozenRef;code:FrozenRef;renderEvidence?:FrozenRef};
 firstQuad?:CardQuad;
};
export type BankEngineSignal={cardId:string|null;frontAllowed:boolean};
export type BankMaterials={back:CardTexture;front:ReadonlyMap<string,CardTexture>;concealed?:CardTexture};
type Geometry=Omit<CardSurface,'presentation'>&{slotId:string;physicalSide:CardPhysicalSide};
type NativeFrame={original:Buffer;geometry:Geometry[];added:number;releasedGuardPixels:number[]};
type Calibration=(input:Parameters<typeof calibrateP2CardFrame>[0])=>{coverage:Uint8Array[];guard:Uint8Array;quads:CardQuad[];bounds:Geometry['bounds'][];side:CardPhysicalSide;added:number;releasedGuardPixels?:number[]};
const calibrationHelpers={1:calibrateP1CardFrame,2:calibrateP2CardFrame,3:calibrateP3CardFrame,4:calibrateP4CardFrame,5:calibrateP5CardFrame};

export function validateBankSidePolicy(policy:BankSurfaceSelection['sidePolicy'],sourceSha256:string){
 assert.equal(policy.sourceSha256,sourceSha256,'Side policy belongs to another original');
 assert.equal(policy.physicalSide,'UNKNOWN','Blank sources cannot establish semantic identity');
 assert.ok(policy.segments.length>0);let cursor=0;
 for(const s of policy.segments){assert.equal(s.start,cursor);assert.ok(Number.isInteger(s.end)&&s.end>s.start&&s.end<=360);assert.ok(['BACK','EDGE','FRONT'].includes(s.side));cursor=s.end;}
 assert.equal(cursor,360,'Side policy must cover every native frame without gaps');
}
export function bankPhysicalSide(policy:BankSurfaceSelection['sidePolicy'],frame:number):CardPhysicalSide{
 assert.ok(Number.isInteger(frame)&&frame>=0&&frame<360);const s=policy.segments.find(s=>frame>=s.start&&frame<s.end);assert.ok(s);return s.side;
}
/** Missing decisions and unknown material identities are concealed, including
 * after an earlier allowed frame. No card value is guessed from a slot name. */
export function bankPresentation(slotId:string,physicalSide:CardPhysicalSide,materials:BankMaterials,signal?:BankEngineSignal){
 const known=!!signal?.cardId&&materials.front.has(signal.cardId);
 return{slotId,physicalSide,engine:{cardId:known?signal!.cardId:null,frontAllowed:known&&signal?.frontAllowed===true},back:materials.back,concealed:materials.concealed,front:(id:string)=>{const t=materials.front.get(id);assert.ok(t,'Unbound engine card identity');return t;}};
}
async function rgb(bytes:Buffer){const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,W);assert.equal(info.height,H);assert.equal(info.channels,3);return data;}
async function mono(ref:FrozenRef){const {data,info}=await sharp(await checkedMaterialBytes(ref)).greyscale().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,W);assert.equal(info.height,H);assert.equal(info.channels,1);return data;}
function bounds(mask:Uint8Array){let l=W,t=H,r=-1,b=-1;for(let p=0;p<N;p++)if(mask[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}return r<0?{left:0,top:0,width:1,height:1}:{left:l,top:t,width:r-l+1,height:b-t+1};}

export async function openBankCardSurfaces(selection:BankSurfaceSelection){
 assert.match(selection.id,/^C[12]-P[1-7]$/);const seat=Number(selection.id.at(-1)),pass=Number(selection.id[1]);assert.equal(selection.kind==='c2',pass===2);
 const turns=selection.canonicalUvQuarterTurns??0;assert.ok(Number.isInteger(turns)&&turns>=0&&turns<=3);if(pass===2)assert.equal(turns,0);
 const evidence=JSON.parse((await checkedMaterialBytes(selection.evidence)).toString()),review=JSON.parse((await checkedMaterialBytes(selection.review)).toString());
 if(review.track)assert.deepEqual(review.track,selection.evidence);if(review.evidence)assert.deepEqual(review.evidence,selection.evidence);
 assert.equal(evidence.seat??evidence.source.seat,seat);const source=evidence.source;await checkedMaterialBytes(source);
 validateBankSidePolicy(selection.sidePolicy,source.sha256);const basis=JSON.parse((await checkedMaterialBytes(selection.sidePolicy.basis)).toString());
 const records=selection.kind==='edge'?evidence.records:evidence.frames;assert.equal(records.length,360);
 let calibrate:Calibration|undefined;const allowedRelease=new Map<number,number[]>();
 if(selection.calibration){
  assert.equal(pass,2);assert.ok(seat>=1&&seat<=5);const {evidence:proofRef,code}=selection.calibration,proof=JSON.parse((await checkedMaterialBytes(proofRef)).toString());
  const expectedPath=seat===1?'src/pamela-p1-side-calibration.ts':`src/pamela-p${seat}-card-calibration.ts`;
  assert.equal(code.path,expectedPath);await checkedMaterialBytes(code);assert.equal(proof.code.find((c:FrozenRef)=>c.path===code.path)?.sha256,code.sha256);assert.equal(proof.source.sha256,source.sha256);
  if(proof.selection)assert.deepEqual(proof.selection.evidence,selection.evidence);
  // P4 predates the combined proof: its atlas binds native geometry, while
  // the separate full-motion two-sided proof binds the material renderer.
  const renderProof=selection.calibration.renderEvidence?JSON.parse((await checkedMaterialBytes(selection.calibration.renderEvidence)).toString()):proof;
  assert.equal(renderProof.source.sha256,source.sha256);
  assert.equal(renderProof.code.find((c:FrozenRef)=>c.path==='src/pamela-two-sided-card.ts')?.sha256,hash(await readFile('src/pamela-two-sided-card.ts')));
  if(proof.guardCorrections){const corrections=JSON.parse((await checkedMaterialBytes(proof.guardCorrections)).toString());for(const c of corrections)allowedRelease.set(c.frame,c.releasedGuardPixels);}
  calibrate=calibrationHelpers[seat as keyof typeof calibrationHelpers];
 }else{
  // A no-turn clip is an explicit single-face demonstration, never a forced
  // swap on a broad exposed face. Its survey must bind this exact original.
  const row=basis.results?.find((r:{id:string})=>r.id===selection.id);assert.equal(row?.source.sha256,source.sha256);assert.equal(row.classification,'NO_CLEAR_TURN');
  assert.deepEqual(selection.sidePolicy.segments,[{start:0,end:360,side:'FRONT'}]);
 }
 if(pass===2)assert.ok(selection.firstQuad,'The stationary first card needs its independent plane');
 const sourceDirectory=source.frameDirectory??source.framesDirectory;
 async function geometryFrame(frame:number):Promise<NativeFrame>{
  const side=bankPhysicalSide(selection.sidePolicy,frame),r=records[frame];assert.equal(r.sourceFrame??r.frame,frame);
  if(pass===2){
   const original=await rgb(await checkedMaterialBytes(r.source)),mask=await rgb(await checkedMaterialBytes(r.mask));
   const cal=calibrate?.({frame,sourceSha256:source.sha256,sourceRgb:original,semanticMaskRgb:mask,movingQuad:r.quad,firstQuad:selection.firstQuad!});
   if(cal){assert.equal(cal.side,side,'Helper disagrees with frozen frame schedule');assert.equal(cal.coverage.length,2);assert.equal(cal.quads.length,2);assert.equal(cal.bounds.length,2);}
   const coverage=cal?.coverage??[new Uint8Array(N),new Uint8Array(N)],guard=cal?.guard??new Uint8Array(N),released=cal?.releasedGuardPixels??[],releaseSet=new Set(released);
   assert.deepEqual([...releaseSet].sort((a,b)=>a-b),[...(allowedRelease.get(frame)??[])].sort((a,b)=>a-b),'Unreviewed foreground release');
   let firstChanges=0,guardErrors=0,overlap=0;for(let p=0;p<N;p++){
    if(!cal){coverage[0][p]=mask[p*3];coverage[1][p]=mask[p*3+1];guard[p]=mask[p*3+2];}
    if(coverage[0][p]!==mask[p*3])firstChanges++;
    if(guard[p]!==mask[p*3+2]&&!(releaseSet.has(p)&&mask[p*3+2]>0&&guard[p]===0&&coverage[1][p]>0))guardErrors++;
    if(!guard[p]&&coverage[0][p]&&coverage[1][p])overlap++;
   }
   assert.equal(firstChanges,0,'First paper changed by moving-card calibration');assert.equal(guardErrors,0,'Unreported foreground change');assert.equal(overlap,0,'Two visible papers overlap');
   const quads=cal?.quads??[selection.firstQuad!,r.quad],boxes=cal?.bounds??coverage.map(bounds);
   return{original,geometry:coverage.map((coverage,i)=>({slotId:`C${i+1}-P${seat}`,physicalSide:i===0?'FRONT':side,coverage,guard,quad:quads[i],bounds:boxes[i]})),added:cal?.added??0,releasedGuardPixels:released};
  }
  assert.ok(sourceDirectory);const bytes=await readFile(`${sourceDirectory}/frame-${String(frame).padStart(4,'0')}.png`);if(r.sourcePngSha256)assert.equal(hash(bytes),r.sourcePngSha256);
  const original=await rgb(bytes);if(r.sourceRgbSha256)assert.equal(hash(original),r.sourceRgbSha256);
  let coverage:Buffer,guard:Buffer,uvAt:(x:number,y:number)=>[number,number];const box=r.record?.bounds??r.bounds;
  if(selection.kind==='edge'){coverage=await mono(r.masks.find((m:{type:string})=>m.type==='coverage'));guard=await mono(r.masks.find((m:{type:string})=>m.type==='hand-guards'));uvAt=(x,y)=>edgeSurfaceUv(x,y,r.quad,r.sections);}
  else{coverage=await mono(r.masks.coverage);const hand=await mono(r.masks.hand),shoe=await mono(r.masks.shoe);guard=Buffer.alloc(N);for(let p=0;p<N;p++)guard[p]=Math.max(hand[p],shoe[p]);
   const uv=gunzipSync(await checkedMaterialBytes(r.uv));assert.equal(hash(uv),r.uv.decodedSha256);assert.deepEqual(r.uv.region,box);assert.equal(uv.length,box.width*box.height*8);
   uvAt=(x,y)=>{const xx=Math.floor(x)-box.left,yy=Math.floor(y)-box.top;if(xx<0||yy<0||xx>=box.width||yy>=box.height)return[-1,-1];const k=(yy*box.width+xx)*8;return[uv.readFloatLE(k),uv.readFloatLE(k+4)];};
  }
  const rawUv=uvAt;uvAt=(x,y)=>{const[u,v]=rawUv(x,y);return turns===1?[1-v,u]:turns===2?[1-u,1-v]:turns===3?[v,1-u]:[u,v];};
  return{original,geometry:[{slotId:selection.id,physicalSide:side,coverage,guard,bounds:box,quad:[[0,0],[1,0],[1,1],[0,1]],uvAt}],added:0,releasedGuardPixels:[]};
 }
 async function paint(data:NativeFrame,materials:BankMaterials,signals:ReadonlyMap<string,BankEngineSignal>){
  const layers=data.geometry.map(g=>({...g,presentation:bankPresentation(g.slotId,g.physicalSide,materials,signals.get(g.slotId))}));
  let printed:Buffer,paper:Buffer,states:unknown[];
  if(pass===1){
   // Keep the reviewed 0.65px source-space ink softness and bending UVs.
   const layer=layers[0],material=presentedCardMaterial(layer.presentation);assert.ok(material.texture);const t=material.texture;
   const result=await applyPaperMaterials(data.original,W,H,[{slotId:layer.slotId,coverage:Buffer.from(layer.coverage),guard:Buffer.from(layer.guard),bounds:layer.bounds,uvAt:layer.uvAt!,texture:{rgb:Buffer.from(t.rgb),width:t.width,height:t.height,sha256:t.id}}]);
   printed=result.after;paper=result.paper;states=[{slotId:layer.slotId,physicalSide:layer.physicalSide,displayedSide:material.side,textureId:t.id}];
  }else{const result=renderTwoSidedCards(data.original,W,H,layers);printed=Buffer.from(result.rgb);paper=Buffer.from(result.paper);states=result.states;}
  let outside=0,protectedChanges=0;const guard=data.geometry[0].guard;for(let p=0;p<N;p++){const k=p*3,changed=printed[k]!==data.original[k]||printed[k+1]!==data.original[k+1]||printed[k+2]!==data.original[k+2];if(changed&&!paper[p])outside++;if(changed&&guard[p])protectedChanges++;}
  assert.equal(outside,0);assert.equal(protectedChanges,0);
  return{original:data.original,printed,paper,states,verification:{sourceRgbSha256:hash(data.original),printedRgbSha256:hash(printed),changedOutsidePaperPixels:outside,changedProtectedPixels:protectedChanges,addedPaperPixels:data.added,releasedGuardPixels:data.releasedGuardPixels}};
 }
 return{selection,source,geometryFrame,paint,frame:async(frame:number,materials:BankMaterials,signals:ReadonlyMap<string,BankEngineSignal>)=>paint(await geometryFrame(frame),materials,signals)};
}
