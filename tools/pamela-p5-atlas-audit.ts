import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {calibrateP5CardFrame,P5_NATIVE,pamelaP5FlipSide} from '../src/pamela-p5-card-calibration.ts';
import {renderTwoSidedCards,type CardTexture,type CardSurface} from '../src/pamela-two-sided-card.ts';
import {keyPamelaFrame} from '../src/pamela-key.ts';

const root='runs/20261109-pamela-p5-atlas/take-01',out=root+'/audit-astra',reviewPath=root+'/review-astra.json';
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const verified=new Map<string,string>();
async function verify(r:{path:string;sha256:string}){assert.equal(hash(await readFile(r.path)),r.sha256,r.path+' changed');verified.set(r.path,r.sha256);}
sharp.concurrency(1);
const evidenceRef=await ref(root+'/evidence.json'),e=await read(evidenceRef.path);await verify(evidenceRef);
for(const r of [e.source,e.selection.evidence,e.selection.review,e.calibration,e.manifest,e.frameRecords,...e.assets,...e.pages,...e.outputs])await verify(r);
const manifest=await read(e.manifest.path),records=await read(e.frameRecords.path),proof=await read(e.calibration.path),track=await read(e.selection.evidence.path);
await verify(track.inputs);const inputs=await read(track.inputs.path),job=inputs.jobs.find((j:any)=>j.seat===5),firstQuad=job.static.quads.c1;
assert.equal(e.source.sha256,P5_NATIVE.sourceSha256);assert.deepEqual(e.source,track.source);assert.deepEqual(job.source,e.source);
for(const r of [...e.code,...proof.code]){
 await verify(r);
 const snapshot=(e.code.some((c:any)=>c.path===r.path)?root+'/snapshot/':e.calibration.path.replace('evidence.json','snapshot/'))+r.path.split('/').at(-1);
 assert.equal(hash(await readFile(snapshot)),r.sha256,'Frozen code mismatch: '+snapshot);
}
await verify(proof.guardCorrections);const corrections=await read(proof.guardCorrections.path),allowed=new Map<number,number[]>(corrections.map((c:any)=>[c.frame,c.releasedGuardPixels]));
assert.equal(corrections.reduce((n:number,c:any)=>n+c.releasedGuardPixels.length,0),414);
assert.equal(manifest.frames.length,360);assert.equal(records.length,360);assert.equal(track.frames.length,360);
let allFramePolicy=0,allFrameReleaseCount=0;
for(let f=0;f<360;f++){
 const side=f<88?'BACK':f<94?'EDGE':'FRONT';assert.equal(pamelaP5FlipSide(f,e.source.sha256),side);assert.equal(manifest.frames[f].frame,f);assert.equal(records[f].frame,f);
 assert.equal(manifest.frames[f].cards[0].side,'FRONT');assert.equal(manifest.frames[f].cards[1].side,side);assert.equal(records[f].side,side);
 assert.deepEqual(records[f].releasedGuardPixels,allowed.get(f)??[]);allFrameReleaseCount+=records[f].releasedGuardPixels.length;
 for(const v of records[f].variants)assert.equal(v.states[1].displayedSide,side);allFramePolicy++;
}
assert.equal(allFrameReleaseCount,414);
await mkdir(out);const refs=[];
for(const path of ['tools/pamela-p5-atlas-audit.ts','src/pamela-key.ts','runs/20261109-pamela-bank-sequence/take-03/plan.json']){
 const r=await ref(path);refs.push(r);await copyFile(path,out+'/'+path.split('/').at(-1));
}
const plan=await read(refs[2].path),sceneAssets=plan.jobs[0].scene;
for(const r of sceneAssets){await verify(r);refs.push(r);}
const W=1762,H=1174,room=await sharp(sceneAssets[0].path).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const stage=await sharp(room).composite([{input:await readFile(sceneAssets[1].path)}]).removeAlpha().raw().toBuffer();
const pages=await Promise.all(manifest.pages.map(async(p:any)=>({data:await sharp(p.path).greyscale().raw().toBuffer(),width:p.width,height:p.height})));
const artwork=new Map<string,CardTexture>();
for(const a of e.assets){const m=await sharp(a.path).metadata();assert.equal(m.width,252);assert.equal(m.height,352);artwork.set(a.path,{id:a.path.split('/').at(-1).replace('.png',''),width:252,height:352,rgb:await sharp(a.path).removeAlpha().raw().toBuffer()});}
const designs=[{id:'sg-classic',back:'sg',front:'classic'},{id:'blue-ivory',back:'blue',front:'ivory'}],values=['5S','9H'];
const results:any[]=[],images:any[]=[],releaseAudit:any[]=[],beforeRefs:any[]=[];
let firstCoverageChanges=0,guardDifferences=0,protectedChanges=0,outsideChanges=0,overlap=0,atlasMismatches=0,comparisons=0,printedMatches=0,sceneMatches=0,releaseMatches=0,engineCases=0;
for(let f=63;f<=119;f++){
 const rec=track.frames[f],stored=records[f],mf=manifest.frames[f];await verify(rec.source);await verify(rec.mask);await verify(rec.output);beforeRefs.push(rec.output);
 const raw=await sharp(rec.source.path).removeAlpha().raw().toBuffer(),mask=await sharp(rec.mask.path).removeAlpha().raw().toBuffer();assert.equal(hash(raw),mf.sourceRgbSha256);
 const cal=calibrateP5CardFrame({frame:f,sourceSha256:e.source.sha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad});
 assert.deepEqual(cal.releasedGuardPixels,allowed.get(f)??[]);assert.equal(cal.added,stored.added);assert.deepEqual(cal.quads[0],firstQuad);
 const paper=new Uint8Array(W*H),oldPaper=new Uint8Array(W*H),released=new Set(cal.releasedGuardPixels);
 for(let p=0;p<W*H;p++){
  if(cal.coverage[0][p]!==mask[p*3])firstCoverageChanges++;
  if(cal.guard[p]!==mask[p*3+2]){guardDifferences++;assert(released.has(p)&&mask[p*3+2]&&!cal.guard[p]&&cal.coverage[1][p]);}
  if(cal.coverage[0][p]&&cal.coverage[1][p])overlap++;
  paper[p]=Math.max(cal.coverage[0][p],cal.coverage[1][p]);oldPaper[p]=Math.max(mask[p*3],mask[p*3+1]);
 }
 assert.equal(hash(paper),mf.paperSha256);
 for(let slot=0;slot<2;slot++){
  const card=mf.cards[slot],b=card.bounds,a=card.atlas,page=pages[a.page];assert.deepEqual(cal.quads[slot],card.quad);assert.deepEqual(cal.bounds[slot],b);
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
   const p=(b.top+y)*W+b.left+x,expected=cal.guard[p]?0:cal.coverage[slot][p];
   if(page.data[(a.top+y)*page.width+a.left+x]!==expected)atlasMismatches++;
  }
 }
 const proofRec=proof.records.find((r:any)=>r.frame===f);
 if(proofRec){assert.equal(hash(cal.coverage[0]),proofRec.firstCoverageSha256);assert.equal(hash(cal.coverage[1]),proofRec.movingCoverageSha256);assert.equal(hash(cal.guard),proofRec.guardSha256);}
 const receipt=corrections.find((r:any)=>r.frame===f);
 if(receipt){
  assert.deepEqual(receipt.pixels.map((p:any)=>p.index),cal.releasedGuardPixels);
  for(const r of receipt.pixels){const p=r.index;assert.equal(r.y*W+r.x,p);assert.deepEqual(Array.from(raw.subarray(p*3,p*3+3)),r.sourceRgb);assert.equal(cal.coverage[1][p],r.coverage);const [red,green,blue]=r.sourceRgb;assert(Math.min(red,blue)>100&&green>105&&red-green<18&&red-blue<28&&green-Math.max(red,blue)<45);releaseMatches++;}
  releaseAudit.push({frame:f,pixels:receipt.pixels.length,sourceRgbReceiptMatched:true,sourceQualified:true});
 }
 const keyed=keyPamelaFrame(raw,W,H),base=Buffer.from(stage);
 for(let p=0;p<W*H;p++){const k=p*3,a=keyed.alpha[p];for(let c=0;c<3;c++)base[k+c]=Math.round(stage[k+c]*(1-a)+keyed.rgb[k+c]*a);}
 const painted:Buffer[]=[],prints:Uint8Array[]=[];
 for(const design of designs){
  const layers:CardSurface[]=cal.coverage.map((coverage,slot)=>({presentation:{slotId:`seat-5.card-${slot+1}`,physicalSide:slot===0?'FRONT':cal.side,engine:{cardId:values[slot],frontAllowed:true},back:artwork.get(manifest.artwork.back[design.back])!,front:id=>artwork.get(manifest.artwork.front[design.front][id])!},coverage,guard:cal.guard,quad:cal.quads[slot],bounds:cal.bounds[slot]}));
  const rendered=renderTwoSidedCards(raw,W,H,layers),scene=Buffer.from(base),sv=stored.variants.find((v:any)=>v.id===design.id);assert.equal(hash(rendered.rgb),sv.printedRgbSha256);printedMatches++;
  for(let p=0;p<W*H;p++){
   const k=p*3,changed=rendered.rgb[k]!==raw[k]||rendered.rgb[k+1]!==raw[k+1]||rendered.rgb[k+2]!==raw[k+2];
   if(changed&&!paper[p])outsideChanges++;if(changed&&cal.guard[p])protectedChanges++;
   if(paper[p]&&!cal.guard[p]){const a=Math.max(keyed.alpha[p],paper[p]/255);for(let c=0;c<3;c++)scene[k+c]=Math.round(stage[k+c]*(1-a)+rendered.rgb[k+c]*a);}
  }
  assert.equal(hash(scene),sv.sceneRgbSha256);sceneMatches++;painted.push(scene);prints.push(rendered.rgb);
  if(f===87||f===88||f===93||f===94){for(const engine of [{cardId:'9H',frontAllowed:false},{cardId:null,frontAllowed:true}]){layers[1].presentation.engine=engine;layers[1].presentation.front=()=>{throw Error('Denied front lookup');};const denied=renderTwoSidedCards(raw,W,H,layers);assert.equal((denied.states[1] as any).displayedSide,cal.side==='FRONT'?'CONCEALED':cal.side);engineCases++;}}
 }
 const old=await sharp(rec.output.path).removeAlpha().raw().toBuffer(),before=Buffer.from(base);
 for(let p=0;p<W*H;p++)if(oldPaper[p]){const k=p*3,a=Math.max(keyed.alpha[p],oldPaper[p]/255);for(let c=0;c<3;c++)before[k+c]=Math.round(stage[k+c]*(1-a)+old[k+c]*a);}
 const q=cal.quads[1],cx=q.reduce((s,p)=>s+p[0],0)/4,cy=q.reduce((s,p)=>s+p[1],0)/4,roi={left:Math.max(0,Math.min(W-240,Math.round(cx-120))),top:Math.max(0,Math.min(H-240,Math.round(cy-120))),width:240,height:240};
 const comparisonPath=`${root}/comparison/frame-${String(f-63).padStart(3,'0')}.png`;
 const comparison=await sharp(comparisonPath).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(comparison.info.width,1440);assert.equal(comparison.info.height,504);
 for(const [i,pixels]of [before,...painted].entries()){
  const expected=await sharp(pixels,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(480,480,{kernel:'nearest'}).raw().toBuffer();
  const actual=await sharp(comparisonPath).extract({left:i*480,top:24,width:480,height:480}).removeAlpha().raw().toBuffer();assert.equal(hash(actual),hash(expected),`Comparison f${f} panel${i} mismatch`);
 }
 comparisons++;
 if(f>=85&&f<=95){
  const overlay=Buffer.from(raw);for(let p=0;p<W*H;p++){const k=p*3;if(released.has(p)){overlay[k]=255;overlay[k+1]=0;overlay[k+2]=255;}else if(cal.guard[p]){overlay[k]=Math.round(raw[k]*.55);overlay[k+1]=Math.round(raw[k+1]*.55);overlay[k+2]=Math.min(255,Math.round(raw[k+2]*.55+100));}}
  const panel=`${out}/native-${String(f).padStart(4,'0')}.png`,header=Buffer.from(`<svg width="1440" height="28"><rect width="1440" height="28" fill="#17232b"/><text x="8" y="20" fill="white" font-family="Arial" font-size="15">P5 f${f} ${cal.side} | SOURCE | GUARD blue / RELEASE magenta | SG PRINT native2x | released ${released.size}</text></svg>`),tiles:any[]=[{input:header,left:0,top:0}];
  for(const [i,pixels]of [raw,overlay,prints[0]].entries())tiles.push({input:await sharp(Buffer.from(pixels),{raw:{width:W,height:H,channels:3}}).extract(roi).resize(480,480,{kernel:'nearest'}).png().toBuffer(),left:i*480,top:28});
  await sharp({create:{width:1440,height:508,channels:3,background:'#17232b'}}).composite(tiles).png().toFile(panel);images.push(await ref(panel));
 }
 results.push({frame:f,side:cal.side,atlasCardsMatched:2,printedVariantsMatched:2,sceneVariantsMatched:2,comparisonPanelsMatched:3,source:rec.source,mask:rec.mask,frozenBefore:rec.output,comparison:await ref(comparisonPath),releasedGuardPixels:cal.releasedGuardPixels});
 if(f%10===0)console.log(JSON.stringify({frame:f,sceneMatches,comparisons}));
}
assert.equal(firstCoverageChanges,0);assert.equal(protectedChanges,0);assert.equal(outsideChanges,0);assert.equal(overlap,0);assert.equal(atlasMismatches,0);assert.equal(releaseMatches,414);assert.equal(guardDifferences,414);
const probe=[];
for(const r of [e.source,...e.outputs]){
 const value=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',r.path],{encoding:'utf8',windowsHide:true}));
 const comparison=r.path.endsWith('turn-before-after.mp4');assert.equal(value.streams[0].avg_frame_rate,'30/1');assert.equal(+value.streams[0].nb_read_frames,comparison?57:360);assert.equal(+value.format.duration,comparison?1.9:12);assert.equal(value.streams[0].width,comparison?1440:1762);assert.equal(value.streams[0].height,comparison?504:1174);probe.push({path:r.path,value});
}
for(const [path,sha256] of verified)assert.equal(hash(await readFile(path)),sha256,'Input changed during audit '+path);
for(const r of refs)await verify(r);
const result={status:'blocked',blockers:['Pending optical review of independently generated risk-frame overlays.'],createdAt:new Date().toISOString(),evidence:evidenceRef,provenance:{refs:[evidenceRef,...refs,...Array.from(verified,([path,sha256])=>({path,sha256}))],supplement:'Build evidence omitted keyPamelaFrame code, scene plan and scene asset refs; this independent receipt freezes them and reproduces114 sceneRgbSha256 across57 consecutive frames.',snapshots:await Promise.all(['pamela-p5-atlas-audit.ts','pamela-key.ts','plan.json'].map(n=>ref(out+'/'+n)))},scope:{allFramePolicy:allFramePolicy,numericalNativeFrames:[63,119],numericalFrameCount:57,independentSceneVariants:sceneMatches,opticalNativeFrames:[85,95],opticalFrameCount:11,encodedVideo:'Hashes and freshly counted metadata only; no claim of pixel identity after lossy H264 or complete playback acceptance.'},verification:{allFrameReleaseCount,releaseMatches,releaseAudit,atlasMismatches,firstCoverageChanges,protectedChanges,outsideChanges,overlap,guardDifferences,printedMatches,sceneMatches,comparisons,engineCases},probe,images,results,findings:[],limitations:['Blank source: FRONT/BACK is authored and physical side is UNKNOWN.','The unmodified olive edge88..93 retains conservative hand protection and visible residual color.','Numerical zero-change claims apply to the pre-encoding card pass over57 consecutive frames, not the lossy videos or all360 frames.','No source geometries, shoes, or contact calibrations from P4 were imported.','Root owns WebView integration and whole-film playback acceptance.'],apiCalls:0,productionAccepted:false,ownedProcessesRemaining:0};
await writeFile(reviewPath,JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({reviewPath,reviewSha256:hash(await readFile(reviewPath)),verification:result.verification}));
