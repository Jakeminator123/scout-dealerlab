/** Read-only source survey; emits only new hash-bound survey artifacts. */
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
type Json=Record<string,any>;
type Point=[number,number];
const W=1762,H=1174,SIZE=240,COLUMNS=6,ROW=264;
const mode=process.argv.includes('--review')?'review':process.argv.includes('--overview')?'overview':'dense';
const take=process.argv.find(v=>v.startsWith('--take='))?.slice(7)??'01';assert.match(take,/^\d{2}$/);
const intervals=process.argv.find(v=>v.startsWith('--intervals='))?.slice(12);
if(mode==='dense')assert.ok(intervals,'Dense survey requires --intervals=C1-P1:80:110,C2-P1:75:110');
const root='runs/20261109-pamela-side-bank-survey',run=`${root}/${mode}-${take}`;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const registryPath='references/pamela-material-selections.json',registryBytes=await readFile(registryPath),registry=JSON.parse(registryBytes.toString());
assert.equal(registry.dealerId,'pamela');assert.equal(registry.entries.length,14);
if(mode==='review'){await writeSurveyReview();process.exit(0);}
const wanted=mode==='overview'?new Map<string,[number,number]>(registry.entries.filter((s:Json)=>s.id!=='C2-P4').map((s:Json)=>[s.id,[0,359]])):
 new Map(intervals!.split(',').map(part=>{const m=/^(C[12]-P[1-7]):(\d{1,3}):(\d{1,3})$/.exec(part);assert.ok(m,'Invalid interval');const lo=Number(m[2]),hi=Number(m[3]);assert.ok(0<=lo&&lo<=hi&&hi<360&&hi-lo<=80);assert.notEqual(m[1],'C2-P4','Root owns the finished C2-P4 proof');return[m[1],[lo,hi] as [number,number]];}));
sharp.concurrency(1);await mkdir(root,{recursive:true});await mkdir(run);await mkdir(run+'/sheets');
const label=(s:string)=>Buffer.from(`<svg width="${SIZE}" height="24"><rect width="100%" height="100%" fill="#14212b"/><text x="6" y="17" fill="white" font-family="Arial" font-size="13">${s}</text></svg>`);
function geometry(q:Point[]){
 let area=0,longest=0;for(let i=0;i<q.length;i++){const a=q[i],b=q[(i+1)%q.length];area+=a[0]*b[1]-b[0]*a[1];for(const p of q)longest=Math.max(longest,Math.hypot(a[0]-p[0],a[1]-p[1]));}
 area=Math.abs(area)/2;return{area,diagonal:longest,thinness:longest?area/(longest*longest):0};
}
const results:Json[]=[];
for(const [id,interval]of wanted){
 const selection=registry.entries.find((s:Json)=>s.id===id);assert.ok(selection);
 const evidenceBytes=await readFile(selection.evidence.path);assert.equal(hash(evidenceBytes),selection.evidence.sha256);
 const evidence=JSON.parse(evidenceBytes.toString()),sourceBytes=await readFile(evidence.source.path);assert.equal(hash(sourceBytes),evidence.source.sha256);
 const all=evidence.frames??evidence.records;assert.equal(all.length,360);
 const frameInfo=(f:number)=>{const record=all[f],r=record.record??record,q=(r.quad??record.quad)as Point[];assert.equal(q.length,4);const path=record.source?.path??`${evidence.source.frameDirectory}/frame-${String(f).padStart(4,'0')}.png`;return{record,r,q,path,geometry:geometry(q)};};
 const timeline=all.map((_:unknown,f:number)=>({frame:f,...frameInfo(f).geometry}));
 const min=timeline.filter((r:Json)=>r.frame>=60&&r.frame<=140).sort((a:Json,b:Json)=>a.thinness-b.thinness)[0];
 const numbers=mode==='dense'?Array.from({length:interval[1]-interval[0]+1},(_,i)=>interval[0]+i):[...new Set([45,65,80,100,125,165,min.frame,Math.max(45,min.frame-4),Math.min(165,min.frame+4)])].sort((a,b)=>a-b);
 const records:Json[]=[],sheets:Json[]=[],tiles:{input:Buffer;left:number;top:number}[]=[],maskTiles:{input:Buffer;left:number;top:number}[]=[];
 for(const [i,f]of numbers.entries()){
  const info=frameInfo(f),bytes=await readFile(info.path),metadata=await sharp(bytes).metadata();assert.equal(metadata.width,W);assert.equal(metadata.height,H);
  const expectedPng=info.record.source?.sha256??info.record.sourcePngSha256;if(expectedPng)assert.equal(hash(bytes),expectedPng);
  let rgb:Buffer|undefined;
  if(!expectedPng){rgb=await sharp(bytes).removeAlpha().raw().toBuffer();assert.equal(hash(rgb),info.record.sourceRgbSha256,'Decoded native source differs');}
  const cx=info.q.reduce((s,p)=>s+p[0],0)/4,cy=info.q.reduce((s,p)=>s+p[1],0)/4;
  const roi={left:Math.max(0,Math.min(W-SIZE,Math.round(cx-SIZE/2))),top:Math.max(0,Math.min(H-SIZE,Math.round(cy-SIZE/2))),width:SIZE,height:SIZE};
  const cell=i%24,left=cell%COLUMNS*SIZE,top=Math.floor(cell/COLUMNS)*ROW;
  tiles.push({input:label(`${id} f${f} / qThin ${info.geometry.thinness.toFixed(3)}`),left,top},{input:await sharp(bytes).extract(roi).png().toBuffer(),left,top:top+24});
  let maskSummary:Json|undefined;
  if(mode==='dense'){
   let coverage:Buffer,guard:Buffer,maskRefs:Json[];
   if(selection.kind==='c2'){
    const input=await readFile(info.record.mask.path);assert.equal(hash(input),info.record.mask.sha256);const decoded=await sharp(input).removeAlpha().raw().toBuffer();assert.equal(decoded.length,W*H*3);
    coverage=Buffer.alloc(W*H);guard=Buffer.alloc(W*H);for(let p=0;p<W*H;p++){coverage[p]=decoded[p*3+1];guard[p]=decoded[p*3+2];}maskRefs=[info.record.mask];
   }else{
    const masks=info.record.masks,cover=Array.isArray(masks)?masks.find((m:Json)=>m.type==='coverage'):masks.coverage,hand=Array.isArray(masks)?masks.find((m:Json)=>m.type==='hand-guards'):masks.hand;
    maskRefs=[cover,hand];const buffers=[];for(const m of maskRefs){const input=await readFile(m.path);assert.equal(hash(input),m.sha256);buffers.push(await sharp(input).greyscale().raw().toBuffer());} [coverage,guard]=buffers;
   }
   let visible=0,protectedCovered=0;for(let p=0;p<W*H;p++){if(coverage[p])visible++;if(coverage[p]&&guard[p])protectedCovered++;}
   maskSummary={references:maskRefs,visiblePixels:visible,protectedCoveredPixels:protectedCovered};
   if(f===interval[0]||f===interval[1]||f===Math.round((interval[0]+interval[1])/2)){
    const pixels=Buffer.alloc(W*H*3);for(let p=0;p<W*H;p++){pixels[p*3+1]=coverage[p];pixels[p*3+2]=guard[p];}
    const row=maskTiles.length/3;maskTiles.push({input:label(`${id} f${f}: SOURCE | PAPER + GUARD`),left:0,top:row*ROW},{input:await sharp(bytes).extract(roi).png().toBuffer(),left:0,top:row*ROW+24},{input:await sharp(pixels,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:SIZE,top:row*ROW+24});
   }
  }
  records.push({frame:f,source:{path:info.path,sha256:hash(bytes),...(rgb?{rgbSha256:hash(rgb)}:{})},roi,quad:info.q,geometry:info.geometry,...(maskSummary?{mask:maskSummary}:{})});
  if(cell===23||i===numbers.length-1){const first=numbers[i-cell],file=`${run}/sheets/${id}-${first}-${f}.png`;await sharp({create:{width:COLUMNS*SIZE,height:(Math.floor(cell/COLUMNS)+1)*ROW,channels:3,background:'#14212b'}}).composite(tiles).png().toFile(file);sheets.push(await ref(file));tiles.length=0;}
 }
 let maskSheet=null;if(maskTiles.length){const file=`${run}/sheets/${id}-masks.png`;await sharp({create:{width:SIZE*2,height:maskTiles.length/3*ROW,channels:3,background:'#14212b'}}).composite(maskTiles).png().toFile(file);maskSheet=await ref(file);}
 results.push({id,selection,source:evidence.source,measuredQuadMinimum:min,timeline,inspectedFrames:records,sheets,maskSheet,physicalSide:'UNKNOWN',classification:'PENDING_NATIVE_VISUAL_REVIEW'});
 console.log(JSON.stringify({id,frames:numbers.length,minimum:min.frame,thinness:min.thinness,sheets:sheets.map(s=>s.path)}));
}
await copyFile('tools/pamela-side-bank-survey.ts',run+'/survey-source.ts');
await writeFile(run+'/index.json',JSON.stringify({createdAt:new Date().toISOString(),node:process.version,mode,sourceRegistry:{path:registryPath,sha256:hash(registryBytes)},code:await ref('tools/pamela-side-bank-survey.ts'),excluded:{id:'C2-P4',reason:'Root owns completed source-bound side-switch candidate'},results,apiCalls:0,originalPixelsModified:false,productionAccepted:false,geometryMeasure:'Quad area divided by squared maximum diagonal; authored quads are leads, not proof of optical edge passage or physical side'},null,2),{flag:'wx'});
console.log(JSON.stringify({index:run+'/index.json',clips:results.length,sourceFrames:results.reduce((n,r)=>n+r.inspectedFrames.length,0)}));

async function writeSurveyReview(){
 const overviewPath=`${root}/overview-01/index.json`,densePath=`${root}/dense-01/index.json`;
 const overview=JSON.parse(await readFile(overviewPath,'utf8')),dense=JSON.parse(await readFile(densePath,'utf8'));
 for(const [index,prefix]of [[overview,`${root}/overview-01`],[dense,`${root}/dense-01`]]as const){
  assert.equal(index.sourceRegistry.sha256,hash(registryBytes),'Selected bank changed');
  assert.equal(hash(await readFile(prefix+'/survey-source.ts')),index.code.sha256,'Survey code snapshot changed');
 }
 const priorPath='runs/20261109-pamela-authored-flip-probe/take-01/review.json',prior=JSON.parse(await readFile(priorPath,'utf8'));
 for(const p of prior.selections)assert.equal(overview.results.find((r:Json)=>r.id===p.id).source.sha256,p.sourceSha256,'Previous stop applies to another source');
 const decisions:Json[]=[
  {id:'C1-P1',classification:'NO_CLEAR_TURN',intervals:[],reason:'Broad paper persists through sampled extraction, travel and landing. Current source matches the earlier no-hidden-interval stop.',needed:'A different source motion or separately authored depth/occlusion work; do not replace a visibly exposed broad face.'},
  {id:'C1-P2',classification:'NO_CLEAR_TURN',intervals:[],reason:'Broad face throughout sampled travel; no narrow candidate in the full recorded quad timeline.',needed:'Different motion/geometry if a real side turn is required; a texture switch alone remains visible.'},
  {id:'C1-P3',classification:'NO_CLEAR_TURN',intervals:[],reviewedNarrowLead:[103,120],reason:'All18 consecutive lead frames retain a wide bent wedge. The minimum at110 is not an edge-on passage.',needed:'Curved surface geometry is useful for print adhesion, but cannot establish a hidden side switch.'},
  {id:'C1-P4',classification:'NO_CLEAR_TURN',intervals:[],reviewedNarrowLead:[30,55],reason:'26 consecutive extraction frames show bending and a substantial vertical strip, never a vanishing edge.',needed:'Separate shoe/extraction contact geometry; a new turning motion would be needed for an unobtrusive switch.'},
  {id:'C1-P5',classification:'NO_CLEAR_TURN',intervals:[],reason:'Broad paper during extraction, lift and landing in current native overview.',needed:'Different turning motion or independently authored geometry; no source-bound switch interval selected.'},
  {id:'C1-P6',classification:'NO_CLEAR_TURN',intervals:[],reason:'The paper stays broad from shoe to table in the current overview and recorded geometry.',needed:'Different turning motion or independently authored geometry; no source-bound switch interval selected.'},
  {id:'C1-P7',classification:'NO_CLEAR_TURN',intervals:[],reviewedNarrowLead:[86,107],reason:'All22 consecutive frames retain a clear white triangle, including95. Current source matches the previous stop.',needed:'Preserve the stop: a visible triangle cannot be replaced by an unobservable edge. Existing unprinted tip is a separate mask issue.'},
  {id:'C2-P1',classification:'UNCERTAIN',passageObserved:true,intervals:[[82,104],[111,121]],reason:'Long narrow hand-to-hand transfer followed by a second closing/reopening passage. A single BACK→FRONT event is not determined by this blank source.',needed:'Two-hand occlusion, two passage intervals and continuous UV orientation must be calibrated jointly; green-reflected underside and115–118 grip remain uncertain.',priority:4},
  {id:'C2-P2',classification:'OBSERVED_TURN_PASSAGE',passageObserved:true,intervals:[[78,91]],thinCore:[79,88],reason:'Clear narrowing to a continuous edge followed by reopening under one grip. Frozen moving-paper mask follows the edge at85.',needed:'Source-specific edge centerline, UV parity and fractional edge coverage; independently check the protected grip and motion blur.',priority:1},
  {id:'C2-P3',classification:'OBSERVED_TURN_PASSAGE',passageObserved:true,intervals:[[52,67]],thinCore:[54,63],reason:'Continuous thin passage and subsequent opening are visible in consecutive native frames. Existing quad at54 is broad despite the optically narrow source.',needed:'Recalibrate54-era geometry and motion-blurred/green-reflected paper coverage; the frozen quad alone is not adequate.',priority:3},
  {id:'C2-P5',classification:'OBSERVED_TURN_PASSAGE',passageObserved:true,intervals:[[86,95]],thinCore:[88,93],reason:'Compact face→thin edge→opening sequence. Thin paper overlaps the finger region and nearly disappears through green reflection.',needed:'Source-bound thin-paper/hand separation; at91 the blue guard covers almost the entire apparent edge. Do not globally relax the hand mask.',priority:2},
  {id:'C2-P6',classification:'NO_CLEAR_TURN',intervals:[],reason:'Broad face remains visible through the minimum near115 and subsequent placement.',needed:'Different turning motion or independently authored geometry; a forced material switch is unsupported.'},
  {id:'C2-P7',classification:'NO_CLEAR_TURN',intervals:[],reason:'Broad face remains visible through extraction and placement. No narrow interval found in the inspected source/geometry.',needed:'Different turning motion or independently authored geometry; no switch interval selected.'},
 ];
 const results=[];let uniqueFrames=0;
 for(const decision of decisions){
  const broad=overview.results.find((r:Json)=>r.id===decision.id),close=dense.results.find((r:Json)=>r.id===decision.id);
  assert.equal(hash(await readFile(broad.selection.evidence.path)),broad.selection.evidence.sha256);
  const frames=[...new Set<number>([...broad.inspectedFrames,...(close?.inspectedFrames??[])].map((r:Json)=>r.frame))].sort((a,b)=>a-b);uniqueFrames+=frames.length;
  const minimum=[...broad.timeline].filter((r:Json)=>r.frame>=25&&r.frame<=180).sort((a:Json,b:Json)=>a.thinness-b.thinness)[0];
  results.push({...decision,physicalSide:'UNKNOWN',productionAccepted:false,source:broad.source,selection:broad.selection,measuredQuadMinimum25to180:minimum,nativeFramesVisuallyInspected:frames,continuousFramesReviewed:close?[close.inspectedFrames[0].frame,close.inspectedFrames.at(-1).frame]:null,contactSheets:[...broad.sheets,...(close?.sheets??[])],maskSheet:close?.maskSheet??null});
 }
 const report={createdAt:new Date().toISOString(),status:'exploration-not-bank-acceptance',sourceRegistry:await ref(registryPath),overview:await ref(overviewPath),dense:await ref(densePath),previousStop:await ref(priorPath),reviewCode:await ref('tools/pamela-side-bank-survey.ts'),
  coverage:{remainingClips:13,clipsWithCurrentNativeOverview:13,sourceVideosHashVerified:13,recordedQuadFrames:13*360,overviewFrames:overview.results.reduce((n:number,r:Json)=>n+r.inspectedFrames.length,0),continuousNativeFrames:dense.results.reduce((n:number,r:Json)=>n+r.inspectedFrames.length,0),uniqueNativeFramesVisuallyInspected:uniqueFrames,clipsWithConsecutiveNativeAndMaskChecks:7,nativeSourceMaskComparisonPanelsVisuallyInspected:12},
  totals:{observedTurnPassage:3,uncertain:1,noClearTurn:9},recommendedNext:{id:'C2-P2',calibrationInterval:[78,91],reason:'A single clear narrow passage with a visible existing edge mask; fewer hand-transfer and green-overlap complications than the alternatives.'},
  physicalSideCaution:'All source props are blank. Optical narrowing can support an authored side schedule but does not prove which semantic face is front or back. No switch frame or side identity is accepted by this survey.',
  scope:'Overview and targeted consecutive native frames; not full real-time visual acceptance of all13 clips. Source quads are authored estimates, used only to find leads.',results,apiCalls:0,productionAccepted:false};
 await writeFile(root+'/review.json',JSON.stringify(report,null,2),{flag:'wx'});
 await copyFile('tools/pamela-side-bank-survey.ts',root+'/review-source.ts');
 console.log(JSON.stringify({review:root+'/review.json',coverage:report.coverage,totals:report.totals,recommendedNext:report.recommendedNext}));
}
