import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {calibrateP2CardFrame,P2_NATIVE,P2_SIDE_POLICY,pamelaP2FlipSide} from '../src/pamela-p2-card-calibration.ts';
import {renderTwoSidedCards,cardProjectiveUv,type CardTexture,type CardSurface,type CardQuad} from '../src/pamela-two-sided-card.ts';

const take=process.argv.find(v=>v.startsWith('--take='))?.slice(7)??'01';assert.match(take,/^\d{2}$/);
const inspect=process.argv.includes('--inspect');
const root='runs/20261109-pamela-p2-card-calibration',run=`${root}/${inspect?'inspection':'take'}-${take}`;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const W=1762,H=1174;
const registryPath='references/pamela-material-selections.json',registry=await read(registryPath),selection=registry.entries.find((x:any)=>x.id==='C2-P2');
assert(selection);assert.equal(hash(await readFile(selection.evidence.path)),selection.evidence.sha256);
const track=await read(selection.evidence.path);
assert.equal(track.source.sha256,'ba257d6f88f95536521fe3170f5c5517f53bb447ced7de908cea94683795d77c');
assert.equal(hash(await readFile(track.source.path)),track.source.sha256);
if(process.argv.includes('--derive')){
 const lines=[[71,1080,718,1165,646,19],[72,1066,720,1158,648,16],[73,1048,720,1140,652,15],[74,1003,720,1110,653,9],[75,981,719,1091,660,8],[76,969,719,1080,663,8],[77,959,718,1067,666,6],[78,940,719,1052,667,5]];
 for(const [f,x0,y0,x1,y1,radius] of lines){
  const raw=await sharp(track.frames[f].source.path).removeAlpha().raw().toBuffer(),dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,nx=-uy,ny=ux,pts:number[][]=[];
  for(let y=Math.floor(Math.min(y0,y1)-radius);y<=Math.ceil(Math.max(y0,y1)+radius);y++)for(let x=Math.floor(x0-12);x<=x1+12;x++){
   const a=(x-x0)*ux+(y-y0)*uy,d=(x-x0)*nx+(y-y0)*ny,k=(y*W+x)*3,r=raw[k],g=raw[k+1],b=raw[k+2];
   if(a>=-8&&a<=len+8&&Math.abs(d)<=radius&&r>75&&b>65&&g>85&&r-g<25&&r-b<45&&g-Math.max(r,b)<70)pts.push([a,d]);
  }
  const ax=pts.map(p=>p[0]).sort((a,b)=>a-b),norm=pts.map(p=>p[1]).sort((a,b)=>a-b),lo=ax[Math.floor(ax.length*.01)],hi=ax[Math.floor(ax.length*.99)],mn=norm[Math.floor(norm.length*.02)],mx=norm[Math.floor(norm.length*.98)];
  const pt=(a:number,d:number)=>[+(x0+ux*a+nx*d).toFixed(2),+(y0+uy*a+ny*d).toFixed(2)];
  console.log(JSON.stringify({f,count:pts.length,quad:[pt(hi,mn),pt(hi,mx),pt(lo,mx),pt(lo,mn)]}));
 }
 process.exit(0);
}
await mkdir(root,{recursive:true});await mkdir(run);await mkdir(run+'/native');await mkdir(run+'/snapshot');
await copyFile('tools/pamela-p2-calibration-proof.ts',run+'/snapshot/pamela-p2-calibration-proof.ts');
sharp.concurrency(1);
const frames=[0,45,65,70,71,72,73,...Array.from({length:23},(_,i)=>74+i),100,125,165,350],records:any[]=[];
if(!inspect){
 await mkdir(run+'/assets');await mkdir(run+'/qa');await mkdir(run+'/render');
 const code=[];for(const p of ['tools/pamela-p2-calibration-proof.ts','src/pamela-p2-card-calibration.ts','src/pamela-two-sided-card.ts']){code.push(await ref(p));await copyFile(p,run+'/snapshot/'+p.split('/').at(-1));}
 assert.equal(pamelaP2FlipSide(78,P2_NATIVE.sourceSha256),'BACK');assert.equal(pamelaP2FlipSide(79,P2_NATIVE.sourceSha256),'EDGE');assert.equal(pamelaP2FlipSide(88,P2_NATIVE.sourceSha256),'EDGE');assert.equal(pamelaP2FlipSide(89,P2_NATIVE.sourceSha256),'FRONT');
 for(const frame of [-1,360,NaN,1.5])assert.throws(()=>pamelaP2FlipSide(frame,P2_NATIVE.sourceSha256));assert.throws(()=>pamelaP2FlipSide(80,'wrong-source'));
 const inputs=await read(track.inputs.path);assert.equal(hash(await readFile(track.inputs.path)),track.inputs.sha256);
 const firstQuad=inputs.jobs.find((j:any)=>j.seat===2).static.quads.c1 as CardQuad;
 const previousPath='runs/20261109-pamela-p2-card-calibration/take-03/evidence.json',previous=await read(previousPath);assert.equal(hash(await readFile(previousPath)),'29956c882d5ef7b1bfa3b3a6d6918234389e7dc6c588b430ba365ae73704a102');
 const rejectedPath='runs/20261109-pamela-p2-card-calibration/take-04/evidence.json',rejected=await read(rejectedPath),isolatedSourceCandidatesRejected:any[]=[];
 const {calibrateP2CardFrame:calibrateRejected}=await import('../runs/20261109-pamela-p2-card-calibration/take-04/snapshot/pamela-p2-card-calibration.ts');
 const frontSvg=(value:string,modern:boolean)=>{const suit=value.endsWith('D')?'♦':'♣',rank=value.slice(0,-1),ink=value.endsWith('D')?(modern?'#a5442a':'#a91b32'):'#162433';return `<svg width="252" height="352" xmlns="http://www.w3.org/2000/svg"><rect width="252" height="352" fill="${modern?'#f5efde':'#fffdf5'}"/>${modern?'<rect x="7" y="7" width="238" height="338" rx="9" fill="none" stroke="#bba26e" stroke-width="2"/>':''}<g fill="${ink}" font-family="${modern?'Georgia':'Arial'}" font-weight="bold"><text x="15" y="48" font-size="42">${rank}</text><text x="16" y="82" font-size="34">${suit}</text><text x="126" y="214" text-anchor="middle" font-size="${modern?110:96}">${suit}</text><g transform="translate(252 352) rotate(180)"><text x="15" y="48" font-size="42">${rank}</text><text x="16" y="82" font-size="34">${suit}</text></g></g></svg>`;};
 const assets:any[]=[];
 async function texture(id:string,source?:string,svg?:string):Promise<CardTexture>{const path=`${run}/assets/${id}.png`;if(source)await copyFile(source,path);else await sharp(Buffer.from(svg!)).resize(252,352).removeAlpha().png().toFile(path);assets.push({...await ref(path),source:source?await ref(source):'authored SVG in proof source'});return{id,width:252,height:352,rgb:await sharp(path).removeAlpha().raw().toBuffer()};}
 const designs=[{id:'sg-classic',back:await texture('sg-back','runs/20261109-pamela-two-sided-flip/take-03/assets/sg-back.png'),first:await texture('classic-2C',undefined,frontSvg('2C',false)),front:await texture('classic-QD',undefined,frontSvg('QD',false))},{id:'blue-ivory',back:await texture('blue-back','runs/20261109-pamela-two-sided-flip/take-03/assets/blue-back.png'),first:await texture('ivory-2C',undefined,frontSvg('2C',true)),front:await texture('ivory-QD',undefined,frontSvg('QD',true))}];
 let addedTotal=0,protectedChanges=0,outsideChanges=0,firstCoverageChanges=0,guardChanges=0,changedFrozenGuardPixels=0,uvCornerMaxError=0,unchangedOtherProbeFrames=0;const panels:any[]=[],sheets:any[]=[],guardCorrections:any[]=[];
 for(const f of frames){
  const rec=track.frames[f],src=await readFile(rec.source.path),msk=await readFile(rec.mask.path);assert.equal(hash(src),rec.source.sha256);assert.equal(hash(msk),rec.mask.sha256);
  const raw=await sharp(src).removeAlpha().raw().toBuffer(),mask=await sharp(msk).removeAlpha().raw().toBuffer(),cal=calibrateP2CardFrame({frame:f,sourceSha256:track.source.sha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad});
  assert.deepEqual(cal.quads[0],firstQuad);addedTotal+=cal.added;
  const prior=previous.records.find((p:any)=>p.frame===f);assert(prior);assert.equal(hash(cal.guard),prior.guardSha256,'Existing guard correction changed');assert.deepEqual(cal.releasedGuardPixels,prior.releasedGuardPixels);assert.equal(hash(cal.coverage[0]),prior.firstCoverageSha256);assert.deepEqual(cal.quads[1],prior.quad,'Previously calibrated UV changed');
  if(f<70||f>73){assert.equal(hash(cal.coverage[1]),prior.movingCoverageSha256,'Mask changed outside70..73');unchangedOtherProbeFrames++;}
  else{const before=calibrateRejected({frame:f,sourceSha256:track.source.sha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad}),pixels=[];assert.equal(hash(before.coverage[1]),rejected.records.find((r:any)=>r.frame===f).movingCoverageSha256);for(let p=0;p<W*H;p++)if(before.coverage[1][p]!==cal.coverage[1][p]){assert(before.coverage[1][p]&&!cal.coverage[1][p]&&!mask[p*3+1]);pixels.push({index:p,x:p%W,y:Math.floor(p/W),sourceRgb:Array.from(raw.subarray(p*3,p*3+3))});}if(pixels.length)isolatedSourceCandidatesRejected.push({frame:f,pixels});}
  const correctedGuard=[];const released=new Set(cal.releasedGuardPixels);assert.equal(released.size,cal.releasedGuardPixels.length);
  for(let p=0;p<W*H;p++){if(cal.coverage[0][p]!==mask[p*3])firstCoverageChanges++;if(cal.guard[p]!==mask[p*3+2]){guardChanges++;const x=p%W,y=Math.floor(p/W);assert(f===75||f===76);assert(x>=(f===75?970:960)&&x<=(f===75?1030:1020)&&y>=690&&y<=730);assert(mask[p*3+2]&&!cal.guard[p]&&!cal.coverage[0][p]&&cal.coverage[1][p]);correctedGuard.push({x,y,sourceRgb:Array.from(raw.subarray(p*3,p*3+3)),coverage:cal.coverage[1][p]});}assert(!(cal.coverage[0][p]&&cal.coverage[1][p]),'Card coverage overlap');}
  assert.deepEqual(correctedGuard.map(v=>v.y*W+v.x),cal.releasedGuardPixels);for(const p of cal.releasedGuardPixels)assert(mask[p*3+2]&&!cal.guard[p]&&cal.coverage[1][p]);
  if(correctedGuard.length)guardCorrections.push({frame:f,releasedGuardPixels:cal.releasedGuardPixels,pixels:correctedGuard});
  if(cal.side!=='EDGE'){const uv=cardProjectiveUv(cal.quads[1]);for(const [i,q]of cal.quads[1].entries()){const got=uv(...q),expected=[[0,0],[1,0],[1,1],[0,1]][i];uvCornerMaxError=Math.max(uvCornerMaxError,Math.abs(got[0]-expected[0]),Math.abs(got[1]-expected[1]));assert(got.every(Number.isFinite));}}
  const oldMoving=Buffer.alloc(W*H);for(let p=0;p<W*H;p++)oldMoving[p]=mask[p*3+1];
  const cx=cal.quads[1].reduce((s,p)=>s+p[0],0)/4,cy=cal.quads[1].reduce((s,p)=>s+p[1],0)/4,roi={left:Math.max(0,Math.min(W-320,Math.floor(cx-160))),top:Math.max(0,Math.min(H-224,Math.floor(cy-96))),width:320,height:224};
  const painted:Uint8Array[]=[],variants=[];
  for(const d of designs){
   const layers:CardSurface[]=[{presentation:{slotId:'seat-2.card-1',physicalSide:'FRONT',engine:{cardId:'2C',frontAllowed:true},back:d.back,front:()=>d.first},coverage:cal.coverage[0],guard:cal.guard,quad:cal.quads[0],bounds:cal.bounds[0]},{presentation:{slotId:'seat-2.card-2',physicalSide:cal.side,engine:{cardId:'QD',frontAllowed:true},back:d.back,front:()=>d.front},coverage:cal.coverage[1],guard:cal.guard,quad:cal.quads[1],bounds:cal.bounds[1]}];
   const result=renderTwoSidedCards(raw,W,H,layers);let outside=0,protectedPixels=0;
   if(f<70||f>73)assert.equal(hash(result.rgb),prior.variants.find((p:any)=>p.id===d.id).printedRgbSha256,'Existing rendered proof changed');
   for(let p=0;p<W*H;p++){const k=p*3,changed=result.rgb[k]!==raw[k]||result.rgb[k+1]!==raw[k+1]||result.rgb[k+2]!==raw[k+2];if(changed&&!result.paper[p])outside++;if(changed&&cal.guard[p])protectedPixels++;if(changed&&mask[p*3+2]){assert(!cal.guard[p]&&(f===75||f===76));changedFrozenGuardPixels++;}}
   assert.equal(outside,0);assert.equal(protectedPixels,0);outsideChanges+=outside;protectedChanges+=protectedPixels;
   const path=`${run}/render/${d.id}-${String(f).padStart(4,'0')}.png`;await sharp(Buffer.from(result.rgb),{raw:{width:W,height:H,channels:3}}).png().toFile(path);painted.push(result.rgb);
   variants.push({id:d.id,states:result.states,printedRgbSha256:hash(result.rgb),output:await ref(path),changedOutsideCoverage:outside,changedProtectedPixels:protectedPixels});
   if(f===89){layers[1].presentation.engine.frontAllowed=false;layers[1].presentation.front=()=>{throw Error('Forbidden front lookup');};const concealed=renderTwoSidedCards(raw,W,H,layers);assert.equal((concealed.states[1] as any).displayedSide,'CONCEALED');layers[1].presentation.engine={cardId:null,frontAllowed:true};renderTwoSidedCards(raw,W,H,layers);}
  }
  const calibratedMask=Buffer.from(mask);for(let p=0;p<W*H;p++){calibratedMask[p*3+1]=cal.coverage[1][p];calibratedMask[p*3+2]=cal.guard[p];}
  const panel=`${run}/qa/native-${String(f).padStart(4,'0')}.png`,header=Buffer.from(`<svg width="1280" height="28"><rect width="1280" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="14">C2-P2 f${f} ${cal.side} | SOURCE | CALIBRATED PAPER/GUARD | SG / CLASSIC 2C,QD | BLUE / IVORY 2C,QD | added ${cal.added}</text></svg>`),tiles:any[]=[{input:header,left:0,top:0}];
  for(const [i,pixels]of [raw,calibratedMask,...painted].entries())tiles.push({input:await sharp(Buffer.from(pixels),{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:i*320,top:28});
  await sharp({create:{width:1280,height:252,channels:3,background:'#17232b'}}).composite(tiles).png().toFile(panel);panels.push(await ref(panel));
  records.push({frame:f,side:cal.side,source:rec.source,mask:rec.mask,sourceRgbSha256:hash(raw),movingCoverageSha256:hash(cal.coverage[1]),originalMovingCoverageSha256:hash(oldMoving),firstCoverageSha256:hash(cal.coverage[0]),guardSha256:hash(cal.guard),addedObservedPaperPixels:cal.added,reclassifiedFreePaperGuardPixels:correctedGuard.length,releasedGuardPixels:cal.releasedGuardPixels,quad:cal.quads[1],firstQuad:cal.quads[0],bounds:cal.bounds,roi,variants,panel:await ref(panel)});
 }
 assert.equal(firstCoverageChanges,0);assert.equal(guardChanges,216);assert.equal(unchangedOtherProbeFrames,30);assert(uvCornerMaxError<1e-7);
 for(let start=0;start<panels.length;start+=5){const group=panels.slice(start,start+5),path=`${run}/qa/contact-${String(start/5+1).padStart(2,'0')}.png`;await sharp({create:{width:1280,height:252*group.length,channels:3,background:'#17232b'}}).composite(group.map((p:any,i:number)=>({input:p.path,left:0,top:i*252}))).png().toFile(path);sheets.push(await ref(path));}
 for(const c of code)assert.equal(hash(await readFile(c.path)),c.sha256,'Code changed during proof');
 await writeFile(run+'/guard-corrections.json',JSON.stringify(guardCorrections,null,2));
 await writeFile(run+'/rejected-isolated-candidates.json',JSON.stringify({rejectedProof:await ref(rejectedPath),isolatedSourceCandidatesRejected},null,2));
 const evidence={status:'bounded-local-calibration-candidate',source:track.source,registry:await ref(registryPath),selection,inputs:track.inputs,previousProof:await ref(previousPath),code,assets,sidePolicy:P2_SIDE_POLICY,frames:frames.length,continuousNativeFrames:[70,96],records,sheets,guardCorrections:await ref(run+'/guard-corrections.json'),verification:{addedObservedPaperPixels:addedTotal,changedProtectedPixels:protectedChanges,changedOutsideCoverage:outsideChanges,firstCoverageChanges,reclassifiedFreePaperGuardPixels:guardChanges,changedFrozenGuardPixelsAcrossTwoDesigns:changedFrozenGuardPixels,uvCornerMaxError,unchangedOtherProbeFrames,existingGuardsAndUVPreserved:true,wrongSourceAndFrameRejected:true,engineRevokedAndMissingIdentityConcealed:true},limitations:['Blank original: semantic FRONT/BACK is authored, not observed identity.','Only 34 selected frames including consecutive70..96 are visually/proof reviewed; not full360 motion acceptance.','Blue-guard correction is limited to source-qualified free paper tips at75 and76, first35% of each native corridor, over60px from the grip. Pixel-level correction receipt is explicit; all other guard pixels remain unchanged.','Source-qualified paper additions are bounded70..88 and fractional at low-contrast edges; no generic mask dilation. Fine native boundary uncertainty remains.','Back corner convention corrected71..78; front89 onward retains frozen landing convention. Hidden physical corner correspondence across the long edge interval remains authored.'],apiCalls:0,productionAccepted:false};
 await writeFile(run+'/evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({run,frames:frames.length,verification:evidence.verification}));process.exit(0);
}
for(const f of frames){
 const rec=track.frames[f],source=await readFile(rec.source.path),mask=await readFile(rec.mask.path);
 assert.equal(hash(source),rec.source.sha256);assert.equal(hash(mask),rec.mask.sha256);
 const cx=rec.quad.reduce((s:number,p:number[])=>s+p[0],0)/4,cy=rec.quad.reduce((s:number,p:number[])=>s+p[1],0)/4;
 const roi={left:Math.max(0,Math.min(W-320,Math.floor(cx-160))),top:Math.max(0,Math.min(H-224,Math.floor(cy-96))),width:320,height:224};
 const src=await sharp(source).extract(roi).removeAlpha().png().toBuffer(),msk=await sharp(mask).extract(roi).removeAlpha().png().toBuffer();
 const out=`${run}/native/frame-${String(f).padStart(4,'0')}.png`;
 const header=Buffer.from(`<svg width="640" height="28"><rect width="640" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="14">C2-P2 f${f} native 1:1 | source | frozen mask: R first, G moving, B guard</text></svg>`);
 await sharp({create:{width:640,height:252,channels:3,background:'#17232b'}}).composite([{input:header,left:0,top:0},{input:src,left:0,top:28},{input:msk,left:320,top:28}]).png().toFile(out);
 records.push({frame:f,source:rec.source,mask:rec.mask,roi,quad:rec.quad,panel:await ref(out)});
}
await writeFile(run+'/inspection.json',JSON.stringify({source:track.source,registry:await ref(registryPath),selection,records,code:await ref('tools/pamela-p2-calibration-proof.ts'),apiCalls:0},null,2));
console.log(JSON.stringify({run,frames:frames.length}));
