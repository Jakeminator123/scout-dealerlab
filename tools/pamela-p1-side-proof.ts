import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderTwoSidedCards,cardProjectiveUv,type CardQuad,type CardTexture,type CardSurface} from '../src/pamela-two-sided-card.ts';
import {calibrateP1CardFrame,P1_NATIVE,P1_SIDE_POLICY,pamelaP1FlipSide} from '../src/pamela-p1-side-calibration.ts';
import {proofCardFrontSvg} from '../src/pamela-proof-card-designs.ts';

type Ref={path:string;sha256:string};
type Frame={frame:number;source:Ref;mask:Ref;quad:CardQuad};
type Track={source:Ref;inputs:Ref;frames:Frame[]};
const root='runs/20261110-pamela-p1-side-calibration';
const take=process.argv.find(v=>v.startsWith('--take='))?.slice(7)??'01';assert.match(take,/^\d{2}$/);
const inspect=process.argv.includes('--inspect'),extended=process.argv.includes('--extended');
const run=`${root}/${inspect?'inspection':'take'}-${take}`,W=1762,H=1174;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const ref=async(path:string):Promise<Ref>=>({path,sha256:hash(await readFile(path))});
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const registryPath='references/pamela-material-selections.json',registry=await read(registryPath),selection=registry.entries.find((x:{id:string})=>x.id==='C2-P1');assert(selection);
const registryRef=await ref(registryPath);
assert.equal(hash(await readFile(selection.evidence.path)),selection.evidence.sha256);
const track:Track=await read(selection.evidence.path);
assert.equal(track.source.sha256,P1_NATIVE.sourceSha256);
assert.equal(hash(await readFile(track.source.path)),track.source.sha256);
assert.equal(hash(await readFile(track.inputs.path)),track.inputs.sha256);
await mkdir(root,{recursive:true});await mkdir(run);await mkdir(run+'/qa');await mkdir(run+'/snapshot');
const code=[];for(const path of ['tools/pamela-p1-side-proof.ts','src/pamela-p1-side-calibration.ts','src/pamela-two-sided-card.ts','src/pamela-proof-card-designs.ts']){code.push(await ref(path));await copyFile(path,run+'/snapshot/'+path.split('/').at(-1));}sharp.concurrency(1);
const frames=inspect?(extended?[...Array.from({length:15},(_,i)=>59+i),...Array.from({length:16},(_,i)=>130+i)]:[0,45,65,...Array.from({length:56},(_,i)=>74+i),165,350,359]):[0,45,...Array.from({length:87},(_,i)=>59+i),165,350,359],records:Record<string,any>[]=[];
if(!inspect){
 await mkdir(run+'/assets');await mkdir(run+'/render');
 const inputs=await read(track.inputs.path),job=inputs.jobs.find((j:{seat:number})=>j.seat===1);assert(job);assert.equal(job.source.sha256,track.source.sha256);
 const firstQuad=job.static.quads.c1 as CardQuad,first=job.static.layers.find((l:{card:string})=>l.card==='C1'),moving=job.static.layers.find((l:{card:string})=>l.card==='C2');assert.equal(first.diagnosticValue,'AC');assert.equal(moving.diagnosticValue,'KH');
 const assets:unknown[]=[],designs:{id:string;back:CardTexture;first:CardTexture;front:CardTexture}[]=[];
 async function texture(id:string,source?:string,svg?:string):Promise<CardTexture>{
  const path=`${run}/assets/${id}.png`;if(source)await copyFile(source,path);else await sharp(Buffer.from(svg!)).resize(252,352).removeAlpha().png().toFile(path);
  const m=await sharp(path).metadata();assert.equal(m.width,252);assert.equal(m.height,352);assets.push({...await ref(path),source:source?await ref(source):'diagnostic SVG in snapshotted proofCardFrontSvg'});
  return{id,width:252,height:352,rgb:await sharp(path).removeAlpha().raw().toBuffer()};
 }
 for(const [id,modern,back]of [['sg-classic',false,'sg-back'],['blue-ivory',true,'blue-back']] as const)designs.push({id,back:await texture(back,`runs/20261109-pamela-two-sided-flip/take-03/assets/${back}.png`),first:await texture(id+'-AC',undefined,proofCardFrontSvg('AC',modern)),front:await texture(id+'-KH',undefined,proofCardFrontSvg('KH',modern))});
 for(let f=0;f<360;f++)assert.equal(pamelaP1FlipSide(f,P1_NATIVE.sourceSha256),f<83?'FRONT':f<104?'EDGE':f<114?'BACK':f<119?'EDGE':'FRONT');
 for(const f of [-1,360,NaN,1.5,Infinity])assert.throws(()=>pamelaP1FlipSide(f,P1_NATIVE.sourceSha256));assert.throws(()=>pamelaP1FlipSide(104,'wrong-source'));
 let firstCoverageChanges=0,movingCoverageChanges=0,guardChanges=0,outsideChanges=0,protectedChanges=0,firstMaterialChanges=0,uvCornerMaxError=0,engineGateCases=0,independenceChecks=0;
 for(const f of frames){
  const rec=track.frames[f];assert.equal(rec.frame,f);const src=await readFile(rec.source.path),msk=await readFile(rec.mask.path);assert.equal(hash(src),rec.source.sha256);assert.equal(hash(msk),rec.mask.sha256);
  for(const bytes of [src,msk]){const m=await sharp(bytes).metadata();assert.equal(m.width,W);assert.equal(m.height,H);}
  const raw=await sharp(src).removeAlpha().raw().toBuffer(),mask=await sharp(msk).removeAlpha().raw().toBuffer(),rawHash=hash(raw),maskHash=hash(mask),quadHash=hash(JSON.stringify(rec.quad));
  const args={frame:f,sourceSha256:track.source.sha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad},cal=calibrateP1CardFrame(args);
  assert.deepEqual(cal.quads[0],firstQuad);assert.equal(cal.added,0);assert.deepEqual(cal.releasedGuardPixels,[]);
  if(f===0){assert.throws(()=>calibrateP1CardFrame({...args,sourceRgb:raw.subarray(3)}));assert.throws(()=>calibrateP1CardFrame({...args,semanticMaskRgb:mask.subarray(3)}));assert.throws(()=>calibrateP1CardFrame({...args,movingQuad:[[NaN,0],[0,0],[0,0],[0,0]]}));}
  for(let p=0;p<W*H;p++){if(cal.coverage[0][p]!==mask[p*3])firstCoverageChanges++;if(cal.coverage[1][p]!==mask[p*3+1])movingCoverageChanges++;if(cal.guard[p]!==mask[p*3+2])guardChanges++;assert(!(cal.coverage[0][p]&&cal.coverage[1][p]));}
  if(cal.side!=='EDGE'){
   const q=cal.quads[1],cross=q.map((a,i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});assert(cross.every(v=>v>1e-6)||cross.every(v=>v< -1e-6));
   const uv=cardProjectiveUv(q);for(const [i,p]of q.entries()){const got=uv(...p),expected=[[0,0],[1,0],[1,1],[0,1]][i];assert(got.every(Number.isFinite));uvCornerMaxError=Math.max(uvCornerMaxError,Math.abs(got[0]-expected[0]),Math.abs(got[1]-expected[1]));}
  }
  const cx=cal.quads[1].reduce((s,p)=>s+p[0],0)/4,cy=cal.quads[1].reduce((s,p)=>s+p[1],0)/4,roi={left:Math.max(0,Math.min(W-320,Math.floor(cx-160))),top:Math.max(0,Math.min(H-224,Math.floor(cy-96))),width:320,height:224};
  const painted:Uint8Array[]=[],variants=[];
  for(const d of designs){
   const layers:CardSurface[]=[{presentation:{slotId:first.slotId,physicalSide:'FRONT',engine:{cardId:'AC',frontAllowed:true},back:d.back,front:()=>d.first},coverage:cal.coverage[0],guard:cal.guard,quad:cal.quads[0],bounds:cal.bounds[0]},{presentation:{slotId:moving.slotId,physicalSide:cal.side,engine:{cardId:'KH',frontAllowed:true},back:d.back,front:()=>d.front},coverage:cal.coverage[1],guard:cal.guard,quad:cal.quads[1],bounds:cal.bounds[1]}];
   const result=renderTwoSidedCards(raw,W,H,layers),firstOnly=renderTwoSidedCards(raw,W,H,[layers[0]]);let outside=0,protectedPixels=0,changedFirst=0;
   for(let p=0;p<W*H;p++){const k=p*3,changed=result.rgb[k]!==raw[k]||result.rgb[k+1]!==raw[k+1]||result.rgb[k+2]!==raw[k+2];if(changed&&!result.paper[p])outside++;if(changed&&cal.guard[p])protectedPixels++;if(cal.coverage[0][p]&&(result.rgb[k]!==firstOnly.rgb[k]||result.rgb[k+1]!==firstOnly.rgb[k+1]||result.rgb[k+2]!==firstOnly.rgb[k+2]))changedFirst++;}
   assert.equal(outside,0);assert.equal(protectedPixels,0);assert.equal(changedFirst,0);outsideChanges+=outside;protectedChanges+=protectedPixels;firstMaterialChanges+=changedFirst;
   const path=`${run}/render/${d.id}-${String(f).padStart(4,'0')}.png`;await sharp(Buffer.from(result.rgb),{raw:{width:W,height:H,channels:3}}).png().toFile(path);painted.push(result.rgb);
   variants.push({id:d.id,states:result.states,printedRgbSha256:hash(result.rgb),output:await ref(path),changedOutsideCoverage:outside,changedProtectedPixels:protectedPixels,changedFirstCardPixels:changedFirst});
   for(const engine of [{cardId:'KH',frontAllowed:false},{cardId:null,frontAllowed:true}]){layers[1].presentation.engine=engine;layers[1].presentation.front=()=>{throw Error('Forbidden front lookup');};const denied=renderTwoSidedCards(raw,W,H,layers);assert.equal((denied.states[1] as {displayedSide:string}).displayedSide,cal.side==='FRONT'?'CONCEALED':cal.side);engineGateCases++;}
   layers[1].presentation.engine={cardId:'KH',frontAllowed:true};layers[1].presentation.front=()=>d.front;const other=designs.find(v=>v.id!==d.id)!;
   if(cal.side==='FRONT')layers[1].presentation.back=other.back;else if(cal.side==='BACK')layers[1].presentation.front=()=>other.front;else{layers[1].presentation.back=other.back;layers[1].presentation.front=()=>other.front;}
   assert.equal(hash(renderTwoSidedCards(raw,W,H,layers).rgb),hash(result.rgb));independenceChecks++;
  }
  assert.equal(hash(raw),rawHash);assert.equal(hash(mask),maskHash);assert.equal(hash(JSON.stringify(rec.quad)),quadHash);
  const path=`${run}/qa/native-${String(f).padStart(4,'0')}.png`,header=Buffer.from(`<svg width="1280" height="28"><rect width="1280" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="14">C2-P1 f${f} ${cal.side} | SOURCE | FROZEN PAPER/GUARD | CLASSIC AC,KH | IVORY AC,KH | semantic UNKNOWN</text></svg>`),tiles=[{input:header,left:0,top:0}];
  for(const [i,p]of [raw,mask,...painted].entries())tiles.push({input:await sharp(Buffer.from(p),{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:i*320,top:28});
  await sharp({create:{width:1280,height:252,channels:3,background:'#17232b'}}).composite(tiles).png().toFile(path);
  records.push({frame:f,side:cal.side,source:rec.source,mask:rec.mask,sourceRgbSha256:rawHash,firstCoverageSha256:hash(cal.coverage[0]),movingCoverageSha256:hash(cal.coverage[1]),guardSha256:hash(cal.guard),addedObservedPaperPixels:0,releasedGuardPixels:[],quad:cal.quads[1],frozenQuad:rec.quad,firstQuad:cal.quads[0],bounds:cal.bounds,roi,variants,panel:await ref(path)});
 }
 assert.equal(firstCoverageChanges,0);assert.equal(movingCoverageChanges,0);assert.equal(guardChanges,0);assert(uvCornerMaxError<1e-7);
 const sheets=[];for(let i=0;i<records.length;i+=5){const group=records.slice(i,i+5),path=`${run}/qa/contact-${String(i/5+1).padStart(2,'0')}.png`;await sharp({create:{width:1280,height:252*group.length,channels:3,background:'#17232b'}}).composite(group.map((r,j)=>({input:r.panel.path,left:0,top:j*252}))).png().toFile(path);sheets.push(await ref(path));}
 await writeFile(run+'/guard-corrections.json','[]\n');
 for(const r of [...code,registryRef,selection.evidence,track.inputs,track.source])assert.equal(hash(await readFile(r.path)),r.sha256,'Input changed during proof');
 const evidence={status:'bounded-two-passage-presentation-candidate',source:track.source,registry:registryRef,selection,inputs:track.inputs,code,assets,diagnosticIdentities:{C1:'AC',C2:'KH',realGameValues:false},sidePolicy:P1_SIDE_POLICY,frames:frames.length,continuousNativeFrames:[59,145],records,sheets,guardCorrections:await ref(run+'/guard-corrections.json'),verification:{firstCoverageChanges,movingCoverageChanges,guardChanges,changedProtectedPixels:protectedChanges,changedOutsideCoverage:outsideChanges,changedFirstCardPixels:firstMaterialChanges,uvCornerMaxError,engineGateCases,independenceChecks,wrongSourceFrameAndDimensionsRejected:true,immutableInputs:true,sidePolicyValidatedFrames:360},limitations:['Blank source: physical semantic side UNKNOWN. Two observed passages support an authored FRONT/EDGE/BACK/EDGE/FRONT display candidate, not recovered card identity.','Segments are ordered half-open intervals. Both FRONT intervals require external engine frontAllowed and non-null cardId. Do not flatten to one flip.','All source/guard frames59..145 plus0,45,165,350,359 are hash-bound. This is not all360, GPU or motion-playback acceptance.','No guard exceptions and no coverage additions/removals. Frozen conservative unprinted grip115..118 and approximately1-2 native-pixel mixed boundary remain.','Native P1 UV-only fits61,62,124..140 replace unsuitable frozen planes. Reordered PCA corners63..82 and104..113 are authored; hidden physical corner correspondence across the two-hand transfer is not proven.','All outputs start from neutral source RGB. Full source pixels outside the frozen paper coverage, all guard pixels and C1 material are verified unchanged by C2.'],apiCalls:0,productionAccepted:false};
 await writeFile(run+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({run,frames:frames.length,verification:evidence.verification,evidence:await ref(run+'/evidence.json')}));process.exit(0);
}
for(const f of frames){
 const rec=track.frames[f];assert.equal(rec.frame,f);const src=await readFile(rec.source.path),msk=await readFile(rec.mask.path);assert.equal(hash(src),rec.source.sha256);assert.equal(hash(msk),rec.mask.sha256);
 const meta=await sharp(src).metadata();assert.equal(meta.width,W);assert.equal(meta.height,H);
 const cx=rec.quad.reduce((s,p)=>s+p[0],0)/4,cy=rec.quad.reduce((s,p)=>s+p[1],0)/4;
 const roi={left:Math.max(0,Math.min(W-240,Math.floor(cx-120))),top:Math.max(0,Math.min(H-160,Math.floor(cy-70))),width:240,height:160};
 const raw=await sharp(src).removeAlpha().raw().toBuffer(),mask=await sharp(msk).removeAlpha().raw().toBuffer();
 const path=`${run}/qa/native-${String(f).padStart(4,'0')}.png`;
 const header=Buffer.from(`<svg width="960" height="28"><rect width="960" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="14">C2-P1 f${f} | native 2x x${roi.left} y${roi.top} | SOURCE | R C1 / G C2 / B HAND GUARD</text></svg>`);
 await sharp({create:{width:960,height:348,channels:3,background:'#17232b'}}).composite([{input:header,left:0,top:0},{input:await sharp(raw,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(480,320,{kernel:'nearest'}).png().toBuffer(),left:0,top:28},{input:await sharp(mask,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(480,320,{kernel:'nearest'}).png().toBuffer(),left:480,top:28}]).png().toFile(path);
 records.push({frame:f,source:rec.source,mask:rec.mask,sourceRgbSha256:hash(raw),roi,quad:rec.quad,panel:await ref(path)});
}
const sheets=[];
for(let i=0;i<records.length;i+=4){const group=records.slice(i,i+4),path=`${run}/qa/contact-${String(i/4+1).padStart(2,'0')}.png`;await sharp({create:{width:960,height:348*group.length,channels:3,background:'#17232b'}}).composite(group.map((r,j)=>({input:r.panel.path,left:0,top:j*348}))).png().toFile(path);sheets.push(await ref(path));}
await writeFile(run+'/evidence.json',JSON.stringify({status:'inspection-only',source:track.source,registry:registryRef,selection,inputs:track.inputs,code,frames:frames.length,continuousNativeFrames:extended?[[59,73],[130,145]]:[[74,129]],records,sheets,apiCalls:0,productionAccepted:false},null,2));
console.log(JSON.stringify({run,frames:frames.length,evidence:await ref(run+'/evidence.json')}));
