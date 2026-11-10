/** Source-bound edge-seat study. Authored UVs are separate from observed paper. */
import {SYMMETRIC_P1_SOURCE,trackSymmetricP1Card,type Quad,type Section} from './pamela-seat1-symmetric-card-track.ts';
import {SEAT7_SOURCE,trackSeat7Card} from './pamela-seat7-card-track.ts';
import {paperCoverage} from './pamela-paper-coverage.ts';
export const EDGE_SOURCES={1:SYMMETRIC_P1_SOURCE,7:SEAT7_SOURCE} as const;
export type EdgeSeat=1|7;
const W=1762,H=1174;
const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
export const oldEdgeTrack=(seat:EdgeSeat,raw:Buffer,frame:number)=>seat===1?trackSymmetricP1Card(raw,frame):trackSeat7Card(raw,frame);
export function insideEdgeQuad(x:number,y:number,q:Quad){let yes=false;for(let i=0,j=3;i<4;j=i++)if((q[i][1]>y)!==(q[j][1]>y)&&x<(q[j][0]-q[i][0])*(y-q[i][1])/(q[j][1]-q[i][1])+q[i][0])yes=!yes;return yes;}
/** Zero-phase local quadratic filtering preserves constant acceleration instead
 * of exchanging corner identity whenever a finger hides a convex-hull point. */
export function stableEdgeQuads(seat:EdgeSeat,raw:Quad[]):Quad[]{
 if(raw.length!==360)throw Error('A complete 360-frame source track is required');
 const release=seat===1?194:188,weights=[-2,3,6,7,6,3,-2];
 return raw.map((q,f)=>{
  if(f>=release)return structuredClone(raw[release]);
  if(seat===7||f<79||f>142)return structuredClone(q);
  return q.map((_,corner)=>[0,1].map(axis=>weights.reduce((sum,w,i)=>sum+w*raw[clamp(f+i-3,0,359)][corner][axis],0)/21)) as Quad;
 });
}
/** Warm paper under a lifting hand is not a skin cutout. Reclassification is
 * limited to P7's observed landing, connected to white paper, inside its quad.
 * Saturated hand pixels remain independent seeds of a foreground guard. */
export function trackEdgeCard(seat:EdgeSeat,raw:Buffer,frame:number,quad:Quad){
 const before=oldEdgeTrack(seat,raw,frame),support=Buffer.from(before.mask),guard=Buffer.from(before.protectedSkin),reclassified=Buffer.alloc(W*H);
 let roi=before.record.bounds;let added=0,freeEdgeAdded=0;
 if(seat===7&&frame>=78&&frame<=173){
  const center=[quad.reduce((s,p)=>s+p[0],0)/4,quad.reduce((s,p)=>s+p[1],0)/4],gate=quad.map(p=>[center[0]+1.65*(p[0]-center[0]),center[1]+1.65*(p[1]-center[1])]) as Quad;
  const left=Math.max(0,Math.min(roi.left,Math.floor(Math.min(...gate.map(p=>p[0])))-4)),top=Math.max(0,Math.min(roi.top,Math.floor(Math.min(...gate.map(p=>p[1])))-4)),right=Math.min(W,Math.max(roi.left+roi.width,Math.ceil(Math.max(...gate.map(p=>p[0])))+4)),bottom=Math.min(H,Math.max(roi.top+roi.height,Math.ceil(Math.max(...gate.map(p=>p[1])))+4));
  roi={left,top,width:right-left,height:bottom-top};
  const candidates=new Uint8Array(W*H),visited=new Uint8Array(W*H),queue:number[]=[];
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
   const p=y*W+x,j=p*3,r=raw[j],g=raw[j+1],b=raw[j+2];
   if(r>90&&r-g>12&&r-b>20){guard[p]=255;continue;}
   if(before.shoePaper[p]||!insideEdgeQuad(x+.5,y+.5,gate))continue;
   // Existing paper is retained. New free-edge support must be bright enough
   // to exclude the gray shoe facet touched by the projected tip near f84.
   if((before.mask[p]||Math.min(r,b)>180)&&r-b<22&&b-r<24&&r-g<16&&g-r<145&&g-b<150){candidates[p]=1;if(before.mask[p]>=200){visited[p]=1;queue.push(p);}}
  }
  for(let i=0;i<queue.length;i++){const p=queue[i],x=p%W;for(const n of[x>0?p-1:-1,x<W-1?p+1:-1,p-W,p+W])if(n>=0&&n<W*H&&!visited[n]&&candidates[n]){visited[n]=1;queue.push(n);}}
  for(const p of queue)if(!support[p]){const j=p*3;support[p]=Math.round(255*Math.min(clamp((Math.min(raw[j],raw[j+2])-15)/220),clamp((170-(raw[j+1]-Math.min(raw[j],raw[j+2])))/100)));if(support[p])freeEdgeAdded++;}
 }
 if(seat===7&&frame>=174&&frame<=187){
  const candidates=new Uint8Array(W*H),visited=new Uint8Array(W*H),queue:number[]=[];
  for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
   if(!insideEdgeQuad(x+.5,y+.5,quad))continue;
   const p=y*W+x,j=p*3,r=raw[j],g=raw[j+1],b=raw[j+2];
   // A source-specific chromatic gate; it is not a universal skin detector.
   if(r>100&&g>95&&b>85&&r-g<=37&&r-b<=52&&b-r<25&&g-r<45&&g-b<55){
    candidates[p]=1;
    if(before.mask[p]>=200&&!before.protectedSkin[p]){visited[p]=1;queue.push(p);}
   }
  }
  for(let i=0;i<queue.length;i++){
   const p=queue[i],x=p%W;
   for(const n of[x>0?p-1:-1,x<W-1?p+1:-1,p-W,p+W])if(n>=0&&n<W*H&&!visited[n]&&candidates[n]){visited[n]=1;queue.push(n);}
  }
  for(const p of queue)if(!support[p]||guard[p]){support[p]=255;guard[p]=0;reclassified[p]=255;added++;}
 }
 const covered=paperCoverage(raw,support,guard,W,H);
 let observedLongitudinalScale=1;
 if(seat===1&&frame>=79&&frame<=142){
  const vs:number[]=[];for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){const p=y*W+x;if(covered.coverage[p]<245)continue;const[u,v]=edgeUv(x+.5,y+.5,quad);if(u>-.3&&u<1.3&&v>0&&v<1.3)vs.push(v);}
  vs.sort((a,b)=>a-b);if(vs.length>100){observedLongitudinalScale=clamp(vs[Math.floor((vs.length-1)*.997)],.85,1.15);quad=[quad[0],quad[1],[quad[1][0]+(quad[2][0]-quad[1][0])*observedLongitudinalScale,quad[1][1]+(quad[2][1]-quad[1][1])*observedLongitudinalScale],[quad[0][0]+(quad[3][0]-quad[0][0])*observedLongitudinalScale,quad[0][1]+(quad[3][1]-quad[0][1])*observedLongitudinalScale]];}
 }
 // Smooth two observed edges only where neither is hidden by the hand. The
 // texture origin/corner labels stay those of the same authored quad.
 const sections:Section[]=[];
 for(let k=0;k<=24;k++){
  const v=k/24,l:[number,number]=[quad[0][0]+v*(quad[3][0]-quad[0][0]),quad[0][1]+v*(quad[3][1]-quad[0][1])],r:[number,number]=[quad[1][0]+v*(quad[2][0]-quad[1][0]),quad[1][1]+v*(quad[2][1]-quad[1][1])];
  const observed=before.record.sections[Math.round(v*16)],oldQ=before.record.quad;
  let observedEdges=observed.observedEdges;
  if((seat===7&&frame>=78&&frame<=173||seat===1&&frame>=79&&frame<=142)&&k>1&&k<23){
   const dx=r[0]-l[0],dy=r[1]-l[1],steps=Math.max(80,Math.ceil(Math.hypot(dx,dy)*3));let lo=Infinity,hi=-Infinity;
   for(let j=0;j<=steps;j++){const u=-.45+1.9*j/steps,x=Math.round(l[0]+dx*u),y=Math.round(l[1]+dy*u);if(x<0||x>=W||y<0||y>=H)continue;const p=y*W+x;if(covered.coverage[p]>=200&&!guard[p]){lo=Math.min(lo,u);hi=Math.max(hi,u);}}
   observedEdges=hi-lo>.6&&lo>-.43&&hi<1.43;
   if(observedEdges){const a=[l[0]+dx*lo,l[1]+dy*lo],b=[l[0]+dx*hi,l[1]+dy*hi];l[0]=a[0];l[1]=a[1];r[0]=b[0];r[1]=b[1];}
  }else if(observed.observedEdges&&k>1&&k<23){
   const ol=[oldQ[0][0]+v*(oldQ[3][0]-oldQ[0][0]),oldQ[0][1]+v*(oldQ[3][1]-oldQ[0][1])],or=[oldQ[1][0]+v*(oldQ[2][0]-oldQ[1][0]),oldQ[1][1]+v*(oldQ[2][1]-oldQ[1][1])];
   for(let axis=0;axis<2;axis++){l[axis]+=clamp(observed.left[axis]-ol[axis],-5,5);r[axis]+=clamp(observed.right[axis]-or[axis],-5,5);}
  }
  sections.push({v,left:l,right:r,observedEdges});
 }
 return {before,support,guard,reclassified,coverage:covered.coverage,quad,sections,record:{seat,sourceFrame:frame,quad,sections,observedLongitudinalScale,physicalSide:'UNKNOWN',authoredDisplaySide:'SEPARATE_FRONT_AND_BACK_DIAGNOSTICS',warmPaperReclassifiedPixels:added,freeEdgeAddedPixels:freeEdgeAdded,bounds:roi,coverageOpaquePixels:covered.opaquePixels,coverageEdgePixels:covered.edgePixels}};
}
/** Bilinear quad inverse, also defined at the observed antialiased perimeter.
 * This avoids white holes where a strict triangle rasterizer misses a pixel. */
export function edgeUv(x:number,y:number,q:Quad):[number,number]{
 const bx=q[1][0]-q[0][0],by=q[1][1]-q[0][1],cx=q[3][0]-q[0][0],cy=q[3][1]-q[0][1],dx=q[2][0]-q[1][0]-q[3][0]+q[0][0],dy=q[2][1]-q[1][1]-q[3][1]+q[0][1];
 let u=.5,v=.5;
 for(let i=0;i<8;i++){const fx=q[0][0]+bx*u+cx*v+dx*u*v-x,fy=q[0][1]+by*u+cy*v+dy*u*v-y,a=bx+dx*v,b=cx+dx*u,c=by+dy*v,d=cy+dy*u,det=a*d-b*c;if(Math.abs(det)<.0001)break;const du=(fx*d-fy*b)/det,dv=(fy*a-fx*c)/det;u-=du;v-=dv;if(Math.abs(du)+Math.abs(dv)<1e-5)break;}
 return [u,v];
}
/** Cross-card strips retain the observed modest bending while a stable
 * longitudinal parameter keeps the same artwork corner attached to the grip. */
export function edgeSurfaceUv(x:number,y:number,q:Quad,sections:Section[]):[number,number]{
 const [originalU,v]=edgeUv(x,y,q),index=clamp(v,0,1)*(sections.length-1),a=sections[Math.floor(index)],b=sections[Math.ceil(index)],t=index-Math.floor(index);
 if(v<0||v>1)return[originalU,v];
 const lx=a.left[0]+t*(b.left[0]-a.left[0]),ly=a.left[1]+t*(b.left[1]-a.left[1]),rx=a.right[0]+t*(b.right[0]-a.right[0]),ry=a.right[1]+t*(b.right[1]-a.right[1]),dx=rx-lx,dy=ry-ly;
 return[((x-lx)*dx+(y-ly)*dy)/Math.max(.001,dx*dx+dy*dy),v];
}
