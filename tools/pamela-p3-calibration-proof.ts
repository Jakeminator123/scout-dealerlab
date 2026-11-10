import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {calibrateP3CardFrame,P3_NATIVE,P3_SIDE_POLICY,pamelaP3FlipSide} from '../src/pamela-p3-card-calibration.ts';
import {renderTwoSidedCards,cardProjectiveUv,type CardTexture,type CardSurface,type CardQuad} from '../src/pamela-two-sided-card.ts';
import {proofCardFrontSvg} from '../src/pamela-proof-card-designs.ts';

const take=process.argv.find(v=>v.startsWith('--take='))?.slice(7)??'01';assert.match(take,/^\d{2}$/);
const inspect=process.argv.includes('--inspect');
const root='runs/20261109-pamela-p3-card-calibration',run=`${root}/${inspect?'inspection':'take'}-${take}`;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const W=1762,H=1174;
const registryPath='references/pamela-material-selections.json',registry=await read(registryPath),selection=registry.entries.find((x:any)=>x.id==='C2-P3');
const registryRef=await ref(registryPath);
assert(selection);assert.equal(hash(await readFile(selection.evidence.path)),selection.evidence.sha256);
const track=await read(selection.evidence.path);
assert.equal(track.source.sha256,'bce1003fedde8573cfd85470367a16e439d40c230e3f526c5a51a105d151794b');
assert.equal(hash(await readFile(track.source.path)),track.source.sha256);
assert.equal(hash(await readFile(track.inputs.path)),track.inputs.sha256);
const inputs=await read(track.inputs.path),job=inputs.jobs.find((j:any)=>j.seat===3);assert.deepEqual(job.source,track.source);
await mkdir(root,{recursive:true});await mkdir(run);await mkdir(run+'/native');await mkdir(run+'/snapshot');
await copyFile('tools/pamela-p3-calibration-proof.ts',run+'/snapshot/pamela-p3-calibration-proof.ts');
sharp.concurrency(1);
const frames=[0,...Array.from({length:31},(_,i)=>45+i),80,100,125,165,350],records:any[]=[];
if(!inspect){
 await mkdir(run+'/assets');await mkdir(run+'/qa');await mkdir(run+'/render');
 const code=[];for(const p of ['tools/pamela-p3-calibration-proof.ts','src/pamela-p3-card-calibration.ts','src/pamela-two-sided-card.ts','src/pamela-proof-card-designs.ts']){code.push(await ref(p));await copyFile(p,run+'/snapshot/'+p.split('/').at(-1));}
 const firstQuad=job.static.quads.c1 as CardQuad;
 for(let f=0;f<360;f++)assert.equal(pamelaP3FlipSide(f,P3_NATIVE.sourceSha256),f<52?'BACK':f<67?'EDGE':'FRONT');
 for(const f of [-1,360,NaN,1.5,Infinity])assert.throws(()=>pamelaP3FlipSide(f,P3_NATIVE.sourceSha256));assert.throws(()=>pamelaP3FlipSide(54,'wrong-source'));
 const assets:any[]=[];
 async function texture(id:string,source?:string,svg?:string):Promise<CardTexture>{
  const path=`${run}/assets/${id}.png`;if(source)await copyFile(source,path);else await sharp(Buffer.from(svg!)).resize(252,352).removeAlpha().png().toFile(path);
  assets.push({...await ref(path),source:source?await ref(source):'proofCardFrontSvg; explicit diagnostic value'});
  const metadata=await sharp(path).metadata();assert.equal(metadata.width,252);assert.equal(metadata.height,352);
  return{id,width:252,height:352,rgb:await sharp(path).removeAlpha().raw().toBuffer()};
 }
 const designs=[{id:'sg-classic',back:await texture('sg-back','runs/20261109-pamela-two-sided-flip/take-03/assets/sg-back.png'),first:await texture('classic-3S',undefined,proofCardFrontSvg('3S',false)),front:await texture('classic-JH',undefined,proofCardFrontSvg('JH',false))},{id:'blue-ivory',back:await texture('blue-back','runs/20261109-pamela-two-sided-flip/take-03/assets/blue-back.png'),first:await texture('ivory-3S',undefined,proofCardFrontSvg('3S',true)),front:await texture('ivory-JH',undefined,proofCardFrontSvg('JH',true))}];
 let addedTotal=0,protectedChanges=0,outsideChanges=0,firstCoverageChanges=0,guardChanges=0,changedFrozenGuardPixels=0,uvCornerMaxError=0,engineGateCases=0;
 const panels:any[]=[],sheets:any[]=[],guardCorrections:any[]=[],addedPaper:any[]=[];
 for(const f of frames){
  const rec=track.frames[f],src=await readFile(rec.source.path),msk=await readFile(rec.mask.path);assert.equal(hash(src),rec.source.sha256);assert.equal(hash(msk),rec.mask.sha256);
  const raw=await sharp(src).removeAlpha().raw().toBuffer(),mask=await sharp(msk).removeAlpha().raw().toBuffer(),rawHash=hash(raw),maskHash=hash(mask),quadHash=hash(JSON.stringify(rec.quad));
  const args={frame:f,sourceSha256:track.source.sha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad};
  const cal=calibrateP3CardFrame(args);assert.deepEqual(cal.quads[0],firstQuad);addedTotal+=cal.added;
  if(f===0){assert.throws(()=>calibrateP3CardFrame({...args,sourceRgb:raw.subarray(3)}));assert.throws(()=>calibrateP3CardFrame({...args,semanticMaskRgb:mask.subarray(3)}));assert.throws(()=>calibrateP3CardFrame({...args,movingQuad:[[NaN,0],[0,0],[0,0],[0,0]]}));}
  const correctedGuard:any[]=[],addedPixels:any[]=[],released=new Set(cal.releasedGuardPixels);assert.equal(released.size,cal.releasedGuardPixels.length);
  const oldMoving=Buffer.alloc(W*H);
  for(let p=0;p<W*H;p++){
   oldMoving[p]=mask[p*3+1];if(cal.coverage[0][p]!==mask[p*3])firstCoverageChanges++;
   if(cal.guard[p]!==mask[p*3+2]){
    guardChanges++;const x=p%W,y=Math.floor(p/W);assert.equal(f,53);assert(x>=1035&&x<=1077&&y>=717&&y<=744);
    assert(mask[p*3+2]&&!cal.guard[p]&&!cal.coverage[0][p]&&cal.coverage[1][p]);
    correctedGuard.push({x,y,sourceRgb:Array.from(raw.subarray(p*3,p*3+3)),coverage:cal.coverage[1][p]});
   }
   if(cal.coverage[1][p]!==mask[p*3+1]){assert(!mask[p*3+1]&&cal.coverage[1][p]>0&&!cal.guard[p]);addedPixels.push({index:p,x:p%W,y:Math.floor(p/W),sourceRgb:Array.from(raw.subarray(p*3,p*3+3)),coverage:cal.coverage[1][p]});}
   assert(!(cal.coverage[0][p]&&cal.coverage[1][p]),'Card coverage overlap');
  }
  assert.equal(addedPixels.length,cal.added);assert.deepEqual(correctedGuard.map(v=>v.y*W+v.x),cal.releasedGuardPixels);
  if(correctedGuard.length)guardCorrections.push({frame:f,source:rec.source,mask:rec.mask,releasedGuardPixels:cal.releasedGuardPixels,pixels:correctedGuard});
  if(addedPixels.length)addedPaper.push({frame:f,source:rec.source,pixels:addedPixels});
  if(cal.side!=='EDGE'){
   const uv=cardProjectiveUv(cal.quads[1]);for(const [i,q]of cal.quads[1].entries()){const got=uv(...q),expected=[[0,0],[1,0],[1,1],[0,1]][i];uvCornerMaxError=Math.max(uvCornerMaxError,Math.abs(got[0]-expected[0]),Math.abs(got[1]-expected[1]));assert(got.every(Number.isFinite));}
  }
  const cx=cal.quads[1].reduce((s,p)=>s+p[0],0)/4,cy=cal.quads[1].reduce((s,p)=>s+p[1],0)/4;
  const roi={left:Math.max(0,Math.min(W-320,Math.floor(cx-160))),top:Math.max(0,Math.min(H-224,Math.floor(cy-96))),width:320,height:224};
  const painted:Uint8Array[]=[],variants=[];
  for(const d of designs){
   const layers:CardSurface[]=[{presentation:{slotId:'seat-3.card-1',physicalSide:'FRONT',engine:{cardId:'3S',frontAllowed:true},back:d.back,front:()=>d.first},coverage:cal.coverage[0],guard:cal.guard,quad:cal.quads[0],bounds:cal.bounds[0]},{presentation:{slotId:'seat-3.card-2',physicalSide:cal.side,engine:{cardId:'JH',frontAllowed:true},back:d.back,front:()=>{assert.equal(cal.side,'FRONT');return d.front;}},coverage:cal.coverage[1],guard:cal.guard,quad:cal.quads[1],bounds:cal.bounds[1]}];
   const result=renderTwoSidedCards(raw,W,H,layers);let outside=0,protectedPixels=0;
   for(let p=0;p<W*H;p++){const k=p*3,changed=result.rgb[k]!==raw[k]||result.rgb[k+1]!==raw[k+1]||result.rgb[k+2]!==raw[k+2];if(changed&&!result.paper[p])outside++;if(changed&&cal.guard[p])protectedPixels++;if(changed&&mask[p*3+2]){assert(released.has(p));changedFrozenGuardPixels++;}}
   assert.equal(outside,0);assert.equal(protectedPixels,0);outsideChanges+=outside;protectedChanges+=protectedPixels;
   const path=`${run}/render/${d.id}-${String(f).padStart(4,'0')}.png`;await sharp(Buffer.from(result.rgb),{raw:{width:W,height:H,channels:3}}).png().toFile(path);painted.push(result.rgb);
   variants.push({id:d.id,states:result.states,printedRgbSha256:hash(result.rgb),output:await ref(path),changedOutsideCoverage:outside,changedProtectedPixels:protectedPixels});
   for(const engine of [{cardId:'JH',frontAllowed:false},{cardId:null,frontAllowed:true}]){
    layers[1].presentation.engine=engine;layers[1].presentation.front=()=>{throw Error('Forbidden front lookup');};
    const concealed=renderTwoSidedCards(raw,W,H,layers);assert.equal((concealed.states[1] as any).displayedSide,cal.side==='FRONT'?'CONCEALED':cal.side);engineGateCases++;
   }
  }
  assert.equal(hash(raw),rawHash,'Source mutated');assert.equal(hash(mask),maskHash,'Mask mutated');assert.equal(hash(JSON.stringify(rec.quad)),quadHash,'Input quad mutated');
  const calibratedMask=Buffer.from(mask);for(let p=0;p<W*H;p++){calibratedMask[p*3+1]=cal.coverage[1][p];calibratedMask[p*3+2]=cal.guard[p];}
  const panel=`${run}/qa/native-${String(f).padStart(4,'0')}.png`,header=Buffer.from(`<svg width="1280" height="28"><rect width="1280" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="14">C2-P3 f${f} ${cal.side} | SOURCE | CALIBRATED PAPER/GUARD | SG / CLASSIC 3S,JH | BLUE / IVORY 3S,JH | added ${cal.added}</text></svg>`),tiles:any[]=[{input:header,left:0,top:0}];
  for(const [i,pixels]of [raw,calibratedMask,...painted].entries())tiles.push({input:await sharp(Buffer.from(pixels),{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:i*320,top:28});
  await sharp({create:{width:1280,height:252,channels:3,background:'#17232b'}}).composite(tiles).png().toFile(panel);panels.push(await ref(panel));
  records.push({frame:f,side:cal.side,source:rec.source,mask:rec.mask,sourceRgbSha256:rawHash,movingCoverageSha256:hash(cal.coverage[1]),originalMovingCoverageSha256:hash(oldMoving),firstCoverageSha256:hash(cal.coverage[0]),guardSha256:hash(cal.guard),addedObservedPaperPixels:cal.added,reclassifiedFreePaperGuardPixels:correctedGuard.length,releasedGuardPixels:cal.releasedGuardPixels,quad:cal.quads[1],firstQuad:cal.quads[0],bounds:cal.bounds,roi,variants,panel:await ref(panel)});
 }
 assert.equal(firstCoverageChanges,0);assert(uvCornerMaxError<1e-7);assert(guardChanges>0);
 for(let start=0;start<panels.length;start+=5){const group=panels.slice(start,start+5),path=`${run}/qa/contact-${String(start/5+1).padStart(2,'0')}.png`;await sharp({create:{width:1280,height:252*group.length,channels:3,background:'#17232b'}}).composite(group.map((p:any,i:number)=>({input:p.path,left:0,top:i*252}))).png().toFile(path);sheets.push(await ref(path));}
 for(const c of code)assert.equal(hash(await readFile(c.path)),c.sha256,'Code changed during proof');
 assert.equal(hash(await readFile(registryPath)),registryRef.sha256,'Registry changed during proof');
 assert.equal(hash(await readFile(selection.evidence.path)),selection.evidence.sha256,'Track changed during proof');
 assert.equal(hash(await readFile(track.inputs.path)),track.inputs.sha256,'Inputs changed during proof');
 assert.equal(hash(await readFile(track.source.path)),track.source.sha256,'Source video changed during proof');
 await writeFile(run+'/guard-corrections.json',JSON.stringify(guardCorrections,null,2));await writeFile(run+'/added-paper-pixels.json',JSON.stringify(addedPaper,null,2));
 const evidence={status:'bounded-local-calibration-candidate',source:track.source,registry:registryRef,selection,inputs:track.inputs,methodReferenceOnly:await ref('runs/20261109-pamela-p2-card-calibration/take-05/evidence.json'),code,assets,sidePolicy:P3_SIDE_POLICY,frames:frames.length,continuousNativeFrames:[45,75],records,sheets,guardCorrections:await ref(run+'/guard-corrections.json'),addedPaper:await ref(run+'/added-paper-pixels.json'),verification:{addedObservedPaperPixels:addedTotal,changedProtectedPixels:protectedChanges,changedOutsideCoverage:outsideChanges,firstCoverageChanges,reclassifiedFreePaperGuardPixels:guardChanges,changedFrozenGuardPixelsAcrossTwoDesigns:changedFrozenGuardPixels,uvCornerMaxError,wrongSourceAndFrameRejected:true,nativeDimensionsAndFiniteQuadsRequired:true,engineRevokedAndMissingIdentityConcealed:true,engineGateCases,immutableInputs:true},limitations:['Blank original: physical semantic side UNKNOWN; BACK/EDGE/FRONT is authored, not recovered card identity.','37 selected frames include every native frame45..75; this is not acceptance of all360 frames or motion playback.','Only f53 source-qualified free paper in the first30% of its explicit corridor can release the frozen guard; remaining hand protection wins. Pixel correction receipt includes native coordinates and original RGB.','P3 RGB-qualified additions are bounded46..70 and fractional at low-contrast edges. Green reflection and motion blur prevent a claim of ground-truth subpixel alpha or perfect full contour.','The rear hand under the opening card remains conservatively protected where the frozen guard overlaps uncertain paper. Grip corners and hidden physical corner correspondence across the thin passage are authored.','P2 take05 supplies methodology only. All P3 geometry is fitted to its own immutable source.'],apiCalls:0,productionAccepted:false};
 await writeFile(run+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({run,frames:frames.length,calibrationSha256:code.find(c=>c.path.endsWith('pamela-p3-card-calibration.ts'))!.sha256,evidenceSha256:hash(await readFile(run+'/evidence.json')),verification:evidence.verification}));process.exit(0);
}
for(const f of frames){
 const rec=track.frames[f],source=await readFile(rec.source.path),mask=await readFile(rec.mask.path);
 assert.equal(hash(source),rec.source.sha256);assert.equal(hash(mask),rec.mask.sha256);
 const cx=rec.quad.reduce((s:number,p:number[])=>s+p[0],0)/4,cy=rec.quad.reduce((s:number,p:number[])=>s+p[1],0)/4;
 const roi={left:Math.max(0,Math.min(W-320,Math.floor(cx-160))),top:Math.max(0,Math.min(H-224,Math.floor(cy-96))),width:320,height:224};
 const src=await sharp(source).extract(roi).removeAlpha().resize(640,448,{kernel:'nearest'}).png().toBuffer(),msk=await sharp(mask).extract(roi).removeAlpha().resize(640,448,{kernel:'nearest'}).png().toBuffer();
 const out=`${run}/native/frame-${String(f).padStart(4,'0')}.png`;
 const header=Buffer.from(`<svg width="1280" height="28"><rect width="1280" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="14">C2-P3 f${f} native pixels 2x | crop x${roi.left} y${roi.top} | source | frozen mask: R first, G moving, B guard</text></svg>`);
 await sharp({create:{width:1280,height:476,channels:3,background:'#17232b'}}).composite([{input:header,left:0,top:0},{input:src,left:0,top:28},{input:msk,left:640,top:28}]).png().toFile(out);
 records.push({frame:f,source:rec.source,mask:rec.mask,roi,quad:rec.quad,panel:await ref(out)});
}
await writeFile(run+'/inspection.json',JSON.stringify({source:track.source,registry:await ref(registryPath),selection,records,code:await ref('tools/pamela-p3-calibration-proof.ts'),apiCalls:0},null,2));
console.log(JSON.stringify({run,frames:frames.length}));
