/** Source-bound presentation surface for the stationary card in the shoe.
 * No card identity, reveal event or semantic side is inferred from blank paper.
 * Callers may use geometry alone when the next shoe card is not identified. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {applyPaperMaterials} from './pamela-paper-material.ts';
import {cardProjectiveUv,type CardQuad,type CardTexture} from './pamela-two-sided-card.ts';

export const IDLE_SHOE_CARD_SOURCES={
 B:{sha256:'5cc9b0cd7604262a4859140f08bfdb36c96cf51828d7b0caa0cf5fa02248633c',
  evidence:{path:'runs/20261109-pamela-idle-anchor-review/job01-width-mismatch-01/numeric.json',sha256:'c98c8d647f089844958cf7c8ba67e74a8541d2fd7a7d6f6354361303b10d79e0'},intervals:[[0,23],[252,327]]},
 bridge:{sha256:'2df2e054051e85e4200025a8b955e0c871e41d6cf0fc78b59a25d107e941e569',
  evidence:{path:'runs/20261109-pamela-idle-ready-bridge/run-01/qa/take-01/evidence.json',sha256:'e06eac8ac37304b79f77a425f3bbaf640a4983edca439ad23d94bf79cd5db26c'},intervals:[[6,90]]},
} as const;
export type IdleShoeSourceId=keyof typeof IDLE_SHOE_CARD_SOURCES;
export type IdleShoeInput={sourceId:IdleShoeSourceId;sourceSha256:string;frame:number;originalRGB:Uint8Array};
export type IdleShoePresentation={slotId:string;displaySide:'BACK'|'FRONT'|'UNKNOWN';cardId:string|null;frontAllowed:boolean;
 back:CardTexture;front:(cardId:string)=>CardTexture;concealed?:CardTexture};
const W=1764,H=1174,N=W*H;
const BOX={left:1234,top:750,width:116,height:116};
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
type RecordRef={path:string;sha256:string;rgbSha256:string;frame:number};

/** Visible paper's four boundaries are fitted only on the exposed lower edges.
 * The top boundary is frozen from the unobstructed shoe face; fingers must not
 * become geometry samples. Bounds and frame gates are specific to these clips.
 * Quads control UV only: coverage comes independently from the neutral plate. */
function surfaceQuad(coverage:Uint8Array):CardQuad{
 const left:number[][]=[],right:number[][]=[],bottom:number[][]=[];
 for(let y=797;y<=850;y++){
  const xs:number[]=[];for(let x=1235;x<1348;x++)if(coverage[y*W+x])xs.push(x+.5);
  if(!xs.length)continue;
  if(y<=824)left.push([y+.5,xs[0]-.5]);
  if(y<=840)right.push([y+.5,xs.at(-1)!+.5]);
  if(y>=838)bottom.push([y+.5,xs[0]-.5]);
 }
 const fit=(pts:number[][])=>{assert.ok(pts.length>=10,'Insufficient exposed paper boundary');const n=pts.length,sx=pts.reduce((s,p)=>s+p[0],0),sy=pts.reduce((s,p)=>s+p[1],0),sxx=pts.reduce((s,p)=>s+p[0]*p[0],0),sxy=pts.reduce((s,p)=>s+p[0]*p[1],0),m=(n*sxy-sx*sy)/(n*sxx-sx*sx);return{m,b:(sy-m*sx)/n};};
 const l=fit(left),r=fit(right),b=fit(bottom),top={m:1.86,b:1299-1.86*756};
 const intersect=(a:{m:number;b:number},b:{m:number;b:number}):[number,number]=>{const y=(b.b-a.b)/(a.m-b.m);return[a.m*y+a.b,y];};
 const q:CardQuad=[intersect(l,top),intersect(r,top),intersect(r,b),intersect(l,b)];
 for(const [x,y]of q)assert.ok(x>1233&&x<1350&&y>748&&y<866,'Observed paper plane left calibrated bounds');
 return q;
}
export async function openIdleShoeCardSurfaces(){
 const refs=new Map<string,RecordRef>();
 for(const [id,binding]of Object.entries(IDLE_SHOE_CARD_SOURCES)){
  const bytes=await readFile(binding.evidence.path);assert.equal(hash(bytes),binding.evidence.sha256,'Idle source evidence changed');
  const evidence=JSON.parse(bytes.toString());
  if(id==='bridge')assert.equal(evidence.sourceBindings.find((r:{id:string})=>r.id==='bridge')?.sha256,binding.sha256);
  for(const f of evidence.frames){if(id==='bridge'&&f.source!=='bridge')continue;
   if(!binding.intervals.some(([start,end])=>f.frame>=start&&f.frame<end))continue;
   refs.set(`${id}:${f.frame}`,{path:f.path,sha256:f.pngSha256??f.sha256,rgbSha256:f.rgbSha256,frame:f.frame});
  }
 }
 assert.equal(refs.size,182,'Missing bound native frames');
 function geometryFrame(input:IdleShoeInput){
  const binding=IDLE_SHOE_CARD_SOURCES[input.sourceId];assert.ok(binding,'Unknown shoe-card source');
  assert.equal(input.sourceSha256,binding.sha256,'Another source cannot borrow this shoe calibration');
  assert.ok(Number.isInteger(input.frame)&&binding.intervals.some(([start,end])=>input.frame>=start&&input.frame<end),'Unreviewed shoe-card frame');
  const ref=refs.get(`${input.sourceId}:${input.frame}`)!;assert.equal(input.originalRGB.length,N*3,'Native 1764x1174 RGB required');
  assert.equal(hash(input.originalRGB),ref.rgbSha256,'Geometry requires the exact neutral native plate');
  const original=Buffer.from(input.originalRGB),coverage=Buffer.alloc(N),guard=Buffer.alloc(N);let paperPixels=0,protectedPixels=0;
  // This narrow ROI contains one white prop; its metal frame is warm/dark.
  // Independently detect saturated foreground before neutral paper. The full
  // source RGB, not a prior printed design, drives both masks on every frame.
  for(let y=BOX.top;y<BOX.top+BOX.height;y++)for(let x=BOX.left;x<BOX.left+BOX.width;x++){
   const p=y*W+x,k=p*3,r=original[k],g=original[k+1],b=original[k+2];
   // The finger's reddish core differs from the desaturated warm contact
   // shadow. The former 18/25-chroma cutoff left conspicuous blank holes
   // under f68..76 on a dark design. Preserve the actual warm foreground;
   // retain the source's contact shading while recoloring shaded paper.
   if(r>80&&r-g>22&&r-b>50){guard[p]=255;protectedPixels++;continue;}
   if(Math.min(r,g,b)>125&&r-b<51&&b-r<25&&Math.abs(r-g)<35){coverage[p]=255;paperPixels++;}
  }
  // Pale nail highlights can be neutral enough to pass the paper classifier.
  // Keep only the component connected to the exposed central paper. Isolated
  // neutral islands inside warm foreground stay byte-exact with the hand.
  const seed=814*W+1290;assert.ok(coverage[seed],'Missing exposed central paper');
  const connected=new Uint8Array(N),queue=[seed];connected[seed]=1;
  for(let i=0;i<queue.length;i++){const p=queue[i];for(const n of[p-1,p+1,p-W,p+W])if(n>=0&&n<N&&coverage[n]&&!connected[n]){connected[n]=1;queue.push(n);}}
  let excludedNeutralIslands=0;for(let y=BOX.top;y<BOX.top+BOX.height;y++)for(let x=BOX.left;x<BOX.left+BOX.width;x++){const p=y*W+x;if(coverage[p]&&!connected[p]){coverage[p]=0;guard[p]=255;paperPixels--;protectedPixels++;excludedNeutralIslands++;}}
  assert.ok(paperPixels>3300&&paperPixels<5600,'Unexpected visible paper area');
  const quad=surfaceQuad(coverage),projective=cardProjectiveUv(quad);
  // Same explicit material orientation as the selected C1-P1 bank contract.
  const uvAt=(x:number,y:number):[number,number]=>{const[u,v]=projective(x,y);return[1-v,u];};
  let outsideUvPixels=0;for(let y=BOX.top;y<BOX.top+BOX.height;y++)for(let x=BOX.left;x<BOX.left+BOX.width;x++)if(coverage[y*W+x]){const[u,v]=uvAt(x+.5,y+.5);if(u<0||u>1||v<0||v>1)outsideUvPixels++;}
  return{sourceId:input.sourceId,sourceSha256:binding.sha256,frame:input.frame,original,sourceFrame:ref,physicalSide:'UNKNOWN' as const,
   coverage,guard,quad,bounds:{...BOX},uvAt,measurements:{paperPixels,protectedPixels,outsideUvPixels,excludedNeutralIslands,sourceRgbSha256:ref.rgbSha256,coverageSha256:hash(coverage),guardSha256:hash(guard)}};
 }
 async function paint(data:ReturnType<typeof geometryFrame>,presentation:IdleShoePresentation){
  assert.ok(presentation.slotId,'Explicit presentation slot required');assert.ok(['BACK','FRONT','UNKNOWN'].includes(presentation.displaySide));
  // Revalidate identity and RGB even if a caller retains or mutates a frame.
  assert.equal(hash(data.original),data.measurements.sourceRgbSha256,'Neutral plate mutated after geometry');
  assert.equal(hash(data.coverage),data.measurements.coverageSha256,'Paper mask mutated');assert.equal(hash(data.guard),data.measurements.guardSha256,'Foreground mask mutated');
  const displayedSide=presentation.displaySide==='BACK'?'BACK':presentation.displaySide==='FRONT'&&presentation.frontAllowed===true&&!!presentation.cardId?'FRONT':'CONCEALED';
  const texture=displayedSide==='FRONT'?presentation.front(presentation.cardId!):displayedSide==='BACK'?presentation.back:presentation.concealed??presentation.back;
  assert.ok(texture&&Number.isInteger(texture.width)&&Number.isInteger(texture.height)&&texture.width>0&&texture.height>0&&texture.rgb.length===texture.width*texture.height*3,'Invalid supplied material');
  const result=await applyPaperMaterials(data.original,W,H,[{slotId:presentation.slotId,coverage:data.coverage,guard:data.guard,bounds:data.bounds,uvAt:data.uvAt,texture:{rgb:Buffer.from(texture.rgb),width:texture.width,height:texture.height,sha256:texture.id}}]);
  let changedProtectedPixels=0;for(let p=0;p<N;p++)if(data.guard[p]){const j=p*3;if(result.after[j]!==data.original[j]||result.after[j+1]!==data.original[j+1]||result.after[j+2]!==data.original[j+2])changedProtectedPixels++;}
  assert.equal(changedProtectedPixels,0);
  return{original:data.original,printed:result.after,paper:result.paper,guard:data.guard,states:[{slotId:presentation.slotId,physicalSide:'UNKNOWN',authoredDisplaySide:presentation.displaySide,displayedSide,textureId:texture.id}],
   verification:{...data.measurements,printedRgbSha256:hash(result.after),changedOutsidePaperPixels:result.outsidePaperChanges,changedProtectedPixels}};
 }
 return{width:W,height:H,refs,geometryFrame,paint};
}
