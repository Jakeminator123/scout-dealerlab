import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp,{type OverlayOptions} from 'sharp';
import {calibrateP5CardFrame,P5_NATIVE,P5_SIDE_POLICY,pamelaP5FlipSide} from '../src/pamela-p5-card-calibration.ts';
import {renderTwoSidedCards,cardProjectiveUv,type CardTexture,type CardSurface,type CardQuad} from '../src/pamela-two-sided-card.ts';
import {proofCardFrontSvg} from '../src/pamela-proof-card-designs.ts';

type Ref={path:string;sha256:string};
type Frame={frame:number;source:Ref;mask:Ref;quad:CardQuad};
type Track={source:Ref;inputs:Ref;frames:Frame[]};
type Selection={id:string;evidence:Ref;physicalSide:string};
type Job={seat:number;source:Ref;static:{quads:{c1:CardQuad};layers:{card:string;diagnosticValue:string;slotId:string}[]}};
const take=process.argv.find(v=>v.startsWith('--take='))?.slice(7)??'01';assert.match(take,/^\d{2}$/);
const inspect=process.argv.includes('--inspect'),root='runs/20261109-pamela-p5-card-calibration',run=`${root}/${inspect?'inspection':'take'}-${take}`;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
async function read<T>(p:string):Promise<T>{return JSON.parse(await readFile(p,'utf8')) as T;}
const ref=async(path:string):Promise<Ref>=>({path,sha256:hash(await readFile(path))});
const registryPath='references/pamela-material-selections.json',registry=await read<{entries:Selection[]}>(registryPath),selection=registry.entries.find(x=>x.id==='C2-P5');assert(selection);
assert.equal(hash(await readFile(selection.evidence.path)),selection.evidence.sha256);
const track=await read<Track>(selection.evidence.path),inputs=await read<{jobs:Job[]}>(track.inputs.path),job=inputs.jobs.find(j=>j.seat===5);assert(job);
assert.equal(hash(await readFile(track.inputs.path)),track.inputs.sha256);assert.equal(track.source.sha256,P5_NATIVE.sourceSha256);assert.equal(hash(await readFile(track.source.path)),track.source.sha256);assert.equal(job.source.sha256,track.source.sha256);
const firstQuad=job.static.quads.c1,first=job.static.layers.find(l=>l.card==='C1'),moving=job.static.layers.find(l=>l.card==='C2');assert(first&&moving);assert.equal(first.diagnosticValue,'5S');assert.equal(moving.diagnosticValue,'9H');
const W=P5_NATIVE.width,H=P5_NATIVE.height,frames=[0,45,65,...Array.from({length:29},(_,i)=>75+i),125,165,350];
await mkdir(root,{recursive:true});await mkdir(run);await mkdir(run+'/qa');await mkdir(run+'/snapshot');sharp.concurrency(1);
const code:Ref[]=[];for(const p of ['tools/pamela-p5-calibration-proof.ts','src/pamela-p5-card-calibration.ts','src/pamela-two-sided-card.ts','src/pamela-proof-card-designs.ts']){code.push(await ref(p));await copyFile(p,run+'/snapshot/'+p.split('/').at(-1));}
const records:Record<string,unknown>[]=[],panels:Ref[]=[],sheets:Ref[]=[],assets:Record<string,unknown>[]=[],guardCorrections:Record<string,unknown>[]=[];
type Design={id:string;back:CardTexture;first:CardTexture;front:CardTexture};const designs:Design[]=[];
if(!inspect){
 await mkdir(run+'/assets');await mkdir(run+'/render');
 async function texture(id:string,source?:string,svg?:string):Promise<CardTexture>{const path=`${run}/assets/${id}.png`;if(source)await copyFile(source,path);else await sharp(Buffer.from(svg!)).resize(252,352).removeAlpha().png().toFile(path);assets.push({...await ref(path),source:source?await ref(source):'authored SVG in snapshotted proofCardFrontSvg'});return{id,width:252,height:352,rgb:await sharp(path).removeAlpha().raw().toBuffer()};}
 for(const [id,modern,backName]of [['sg-classic',false,'sg-back'],['blue-ivory',true,'blue-back']] as const)designs.push({id,back:await texture(backName,`runs/20261109-pamela-two-sided-flip/take-03/assets/${backName}.png`),first:await texture(`${id}-5S`,undefined,proofCardFrontSvg('5S',modern)),front:await texture(`${id}-9H`,undefined,proofCardFrontSvg('9H',modern))});
}
assert.equal(pamelaP5FlipSide(87,P5_NATIVE.sourceSha256),'BACK');assert.equal(pamelaP5FlipSide(88,P5_NATIVE.sourceSha256),'EDGE');assert.equal(pamelaP5FlipSide(93,P5_NATIVE.sourceSha256),'EDGE');assert.equal(pamelaP5FlipSide(94,P5_NATIVE.sourceSha256),'FRONT');
for(const f of [-1,360,NaN,1.5])assert.throws(()=>pamelaP5FlipSide(f,P5_NATIVE.sourceSha256));assert.throws(()=>pamelaP5FlipSide(90,'wrong-source'));
let addedTotal=0,guardChanges=0,firstCoverageChanges=0,outsideChanges=0,protectedChanges=0,uvCornerMaxError=0,engineChecks=0,independenceChecks=0;
for(const f of frames){
 const rec=track.frames[f];assert.equal(rec.frame,f);const src=await readFile(rec.source.path),msk=await readFile(rec.mask.path);assert.equal(hash(src),rec.source.sha256);assert.equal(hash(msk),rec.mask.sha256);
 const raw=await sharp(src).removeAlpha().raw().toBuffer(),mask=await sharp(msk).removeAlpha().raw().toBuffer(),rawBefore=hash(raw),maskBefore=hash(mask),cal=calibrateP5CardFrame({frame:f,sourceSha256:track.source.sha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad});
 assert.equal(hash(raw),rawBefore);assert.equal(hash(mask),maskBefore);assert.deepEqual(cal.quads[0],firstQuad);addedTotal+=cal.added;
 const calibrated=Buffer.from(mask),oldMoving=new Uint8Array(W*H),changedGuards:number[]=[],pixels:Record<string,unknown>[]=[];
 for(let p=0;p<W*H;p++){
  oldMoving[p]=mask[p*3+1];calibrated[p*3+1]=cal.coverage[1][p];calibrated[p*3+2]=cal.guard[p];
  if(cal.coverage[0][p]!==mask[p*3])firstCoverageChanges++;
  if(cal.guard[p]!==mask[p*3+2]){guardChanges++;changedGuards.push(p);pixels.push({index:p,x:p%W,y:Math.floor(p/W),sourceRgb:Array.from(raw.subarray(p*3,p*3+3)),coverage:cal.coverage[1][p]});assert([85,86,87,94].includes(f));assert(mask[p*3+2]&&!cal.guard[p]&&cal.coverage[1][p]&&!cal.coverage[0][p]);}
  assert(!(cal.coverage[0][p]&&cal.coverage[1][p]),'Card coverage overlap');
 }
 assert.deepEqual(changedGuards,cal.releasedGuardPixels);if(pixels.length)guardCorrections.push({frame:f,releasedGuardPixels:cal.releasedGuardPixels,pixels});
 if(cal.side!=='EDGE'){
  const q=cal.quads[1],cross=q.map((a,i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});assert(cross.every(v=>v>1e-6)||cross.every(v=>v< -1e-6),'Non-edge quad must be ordered, convex and nondegenerate');
  const uv=cardProjectiveUv(q);for(const [i,p]of q.entries()){const got=uv(...p),expected=[[0,0],[1,0],[1,1],[0,1]][i];assert(got.every(Number.isFinite));uvCornerMaxError=Math.max(uvCornerMaxError,Math.abs(got[0]-expected[0]),Math.abs(got[1]-expected[1]));}
 }
 const cx=cal.quads[1].reduce((s,p)=>s+p[0],0)/4,cy=cal.quads[1].reduce((s,p)=>s+p[1],0)/4,roi={left:Math.max(0,Math.min(W-320,Math.floor(cx-160))),top:Math.max(0,Math.min(H-224,Math.floor(cy-96))),width:320,height:224};
 const painted:Uint8Array[]=[],variants:Record<string,unknown>[]=[];
 for(const d of designs){
  const layers:CardSurface[]=[{presentation:{slotId:first.slotId,physicalSide:'FRONT',engine:{cardId:first.diagnosticValue,frontAllowed:true},back:d.back,front:()=>d.first},coverage:cal.coverage[0],guard:cal.guard,quad:cal.quads[0],bounds:cal.bounds[0]},{presentation:{slotId:moving.slotId,physicalSide:cal.side,engine:{cardId:moving.diagnosticValue,frontAllowed:true},back:d.back,front:()=>d.front},coverage:cal.coverage[1],guard:cal.guard,quad:cal.quads[1],bounds:cal.bounds[1]}];
  const result=renderTwoSidedCards(raw,W,H,layers);let outside=0,protectedPixels=0;
  for(let p=0;p<W*H;p++){const k=p*3,changed=result.rgb[k]!==raw[k]||result.rgb[k+1]!==raw[k+1]||result.rgb[k+2]!==raw[k+2];if(changed&&!result.paper[p])outside++;if(changed&&cal.guard[p])protectedPixels++;}
  assert.equal(outside,0);assert.equal(protectedPixels,0);outsideChanges+=outside;protectedChanges+=protectedPixels;
  const path=`${run}/render/${d.id}-${String(f).padStart(4,'0')}.png`;await sharp(Buffer.from(result.rgb),{raw:{width:W,height:H,channels:3}}).png().toFile(path);painted.push(result.rgb);variants.push({id:d.id,states:result.states,printedRgbSha256:hash(result.rgb),output:await ref(path),changedOutsideCoverage:outside,changedProtectedPixels:protectedPixels});
  if(f===87||f===90||f===94){
   const originalFront=layers[1].presentation.front;layers[1].presentation.front=()=>{throw Error('Forbidden front lookup');};
   layers[1].presentation.engine.frontAllowed=false;const denied=renderTwoSidedCards(raw,W,H,layers);assert.equal((denied.states[1] as {displayedSide:string}).displayedSide,cal.side==='FRONT'?'CONCEALED':cal.side);
   layers[1].presentation.engine={cardId:null,frontAllowed:true};renderTwoSidedCards(raw,W,H,layers);engineChecks+=2;
   layers[1].presentation.engine={cardId:moving.diagnosticValue,frontAllowed:true};layers[1].presentation.front=originalFront;
   const other=designs.find(x=>x.id!==d.id)!;
   if(cal.side==='FRONT')layers[1].presentation.back=other.back;else if(cal.side==='BACK')layers[1].presentation.front=()=>other.front;else{layers[1].presentation.back=other.back;layers[1].presentation.front=()=>other.front;}
   assert.equal(hash(renderTwoSidedCards(raw,W,H,layers).rgb),hash(result.rgb));independenceChecks++;
  }
 }
 const tiles:OverlayOptions[]=[],tileInputs=[raw,calibrated,...painted],panel=`${run}/qa/native-${String(f).padStart(4,'0')}.png`,width=320*tileInputs.length;
 tiles.push({input:Buffer.from(`<svg width="${width}" height="28"><rect width="${width}" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="14">C2-P5 f${f} ${cal.side} | SOURCE | PAPER / GUARD | CLASSIC 5S,9H | IVORY 5S,9H | added ${cal.added}; released ${cal.releasedGuardPixels.length}</text></svg>`),left:0,top:0});
 for(const [i,p]of tileInputs.entries())tiles.push({input:await sharp(Buffer.from(p),{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:i*320,top:28});
 await sharp({create:{width,height:252,channels:3,background:'#17232b'}}).composite(tiles).png().toFile(panel);panels.push(await ref(panel));
 records.push({frame:f,side:cal.side,source:rec.source,mask:rec.mask,sourceRgbSha256:rawBefore,movingCoverageSha256:hash(cal.coverage[1]),originalMovingCoverageSha256:hash(oldMoving),firstCoverageSha256:hash(cal.coverage[0]),guardSha256:hash(cal.guard),addedObservedPaperPixels:cal.added,releasedGuardPixels:cal.releasedGuardPixels,quad:cal.quads[1],firstQuad:cal.quads[0],bounds:cal.bounds,roi,variants,panel:await ref(panel)});
}
assert.equal(firstCoverageChanges,0);assert(uvCornerMaxError<1e-7);
for(let start=0;start<panels.length;start+=5){const group=panels.slice(start,start+5),path=`${run}/qa/contact-${String(start/5+1).padStart(2,'0')}.png`;await sharp({create:{width:inspect?640:1280,height:252*group.length,channels:3,background:'#17232b'}}).composite(group.map((p,i)=>({input:p.path,left:0,top:i*252}))).png().toFile(path);sheets.push(await ref(path));}
for(const c of code)assert.equal(hash(await readFile(c.path)),c.sha256,'Code changed during proof');
await writeFile(run+'/guard-corrections.json',JSON.stringify(guardCorrections,null,2));
const evidence={status:inspect?'inspection-only':'bounded-local-calibration-candidate',source:track.source,registry:await ref(registryPath),selection,inputs:track.inputs,code,assets,diagnosticIdentities:{C1:first.diagnosticValue,C2:moving.diagnosticValue,realGameValues:false},sidePolicy:P5_SIDE_POLICY,frames:frames.length,continuousNativeFrames:[75,103],records,sheets,guardCorrections:await ref(run+'/guard-corrections.json'),verification:{addedObservedPaperPixels:addedTotal,changedProtectedPixels:protectedChanges,changedOutsideCoverage:outsideChanges,firstCoverageChanges,reclassifiedFreePaperGuardPixels:guardChanges,uvCornerMaxError,wrongSourceAndFrameRejected:true,sourceAndMaskInputsUnchanged:true,engineRevokedAndMissingIdentityChecks:engineChecks,independentMaterialChecks:independenceChecks},limitations:['Blank original: semantic FRONT/BACK is authored; physical sides UNKNOWN.','Dense native75..103 and six context probes, not full360 motion or GPU acceptance.','The thin olive original edge88..93 overlaps the fingers; its complete frozen guard remains unchanged.','Only source-qualified connected neutral paper inside explicit native corridors is added. Guard corrections exist only85,86,87,94; every released pixel has a source RGB/index receipt.','Back UV80..87 and front94 are independent P5 source fits. Hidden physical corner correspondence is authored; fine boundary/blur uncertainty remains.'],apiCalls:0,productionAccepted:false};
await writeFile(run+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({run,frames:frames.length,verification:evidence.verification,evidenceSha256:hash(await readFile(run+'/evidence.json'))}));
