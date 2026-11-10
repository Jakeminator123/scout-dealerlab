import type {CardPhysicalSide,CardQuad} from './pamela-two-sided-card.ts';

/** C2-P2 only. The original prop is blank; semantic sides are authored. */
export const P2_NATIVE={width:1762,height:1174,frames:360,fps:30,sourceSha256:'ba257d6f88f95536521fe3170f5c5517f53bb447ced7de908cea94683795d77c'} as const;
export const P2_SIDE_POLICY={back:[0,79],edge:[79,89],front:[89,360],physicalSide:'UNKNOWN'} as const;
export function pamelaP2FlipSide(frame:number,sourceSha256:string):CardPhysicalSide{
 if(sourceSha256!==P2_NATIVE.sourceSha256||!Number.isInteger(frame)||frame<0||frame>=P2_NATIVE.frames)throw Error('P2 calibration source/frame mismatch');
 return frame<79?'BACK':frame<89?'EDGE':'FRONT';
}
type PixelBounds={left:number;top:number;width:number;height:number};
// Full visible blank-paper corners, independently fitted to P2 source RGB.
// The former motion track changed its corner order while the face was broad.
// These keep the original back's short edge at the grip until the edge passage.
const backQuads:Record<number,CardQuad>={
 71:[[1162.41,634.23],[1180.11,655.11],[1096.31,726.09],[1078.62,705.2]],
 72:[[1150.97,636.63],[1165.57,655.29],[1076.14,725.28],[1061.53,706.63]],
 73:[[1136.6,639.99],[1149.05,656.83],[1054.94,726.39],[1042.49,709.55]],
 74:[[1103.16,649.46],[1109.44,659.49],[1006.3,724.07],[1000.02,714.04]],
 75:[[1084,656.4],[1088.79,665.33],[984.22,721.42],[979.43,712.49]],
 76:[[1074.35,658.73],[1078.25,666.45],[970.84,720.64],[966.94,712.91]],
 77:[[1062.8,662.43],[1065.98,669.04],[960.78,719.7],[957.6,713.08]],
 78:[[1046.09,666.89],[1048.64,672.38],[942.28,721.76],[939.73,716.27]],
};
// Explicit per-frame corridor: free tip → grip, maximum half-width in native px.
// No interpolation from P4, no general hand-mask relaxation, no convex fill.
const ribbons:Record<number,readonly [number,number,number,number,number]>={
 // Full native source-paper corridors before collapse. These recover the
 // visibly blank tip/rim omitted by the frozen conservative coverage; source
 // RGB qualification and every existing hand guard still apply pixel by pixel.
 70:[1097.5,718.5,1176.5,645,23],71:[1087.47,715.65,1171.26,644.67,16],
 72:[1068.84,715.96,1158.27,645.96,15],73:[1048.72,717.97,1142.83,648.41,14],
 74:[1003,720,1110,653,7],75:[981,717,1091,659,7],76:[969,717,1080,663,6],77:[959,718,1067,666,4],78:[940,719,1052,667,3],
 79:[892,727,1028,672,2.5],80:[871,730,969,692,2.5],81:[866,729,957,696,2.5],82:[850,732,949,700,2.5],83:[833,735,926,705,2.5],
 84:[790,744,892,713,2.5],85:[776,748,871,722,2.5],86:[767,750,858,727,2.5],87:[760,752,854,729,2.5],88:[744,756,840,732,3],
};
function bounds(mask:Uint8Array):PixelBounds{
 const W=P2_NATIVE.width;let l:number=W,t:number=P2_NATIVE.height,r=-1,b=-1;
 for(let p=0;p<mask.length;p++)if(mask[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 return r<0?{left:0,top:0,width:1,height:1}:{left:l,top:t,width:r-l+1,height:b-t+1};
}
export function calibrateP2CardFrame(input:{frame:number;sourceSha256:string;sourceRgb:Uint8Array;semanticMaskRgb:Uint8Array;movingQuad:CardQuad;firstQuad:CardQuad}){
 const {width:W,height:H}=P2_NATIVE,{frame:f,sourceRgb:raw,semanticMaskRgb:mask}=input,side=pamelaP2FlipSide(f,input.sourceSha256);
 if(raw.length!==W*H*3||mask.length!==raw.length)throw Error('Native P2 RGB/mask dimensions required');
 for(const q of [input.firstQuad,input.movingQuad])if(q.length!==4||q.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Finite P2 card quads required');
 const coverage:[Uint8Array,Uint8Array]=[new Uint8Array(W*H),new Uint8Array(W*H)],guard=new Uint8Array(W*H);
 for(let p=0;p<W*H;p++){coverage[0][p]=mask[p*3];coverage[1][p]=mask[p*3+1];guard[p]=mask[p*3+2];}
 let added=0;const releasedGuardPixels:number[]=[],newPaperPixels:number[]=[];const ribbon=ribbons[f];
 if(ribbon){
  const [x0,y0,x1,y1,radius]=ribbon,dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  for(let y=Math.max(0,Math.floor(Math.min(y0,y1)-radius-1));y<=Math.min(H-1,Math.ceil(Math.max(y0,y1)+radius+1));y++)for(let x=Math.max(0,Math.floor(x0-2));x<=Math.min(W-1,Math.ceil(x1+2));x++){
   const along=(x+.5-x0)*ux+(y+.5-y0)*uy,distance=Math.abs((x+.5-x0)*-uy+(y+.5-y0)*ux),p=y*W+x,k=p*3,r=raw[k],g=raw[k+1],b=raw[k+2];
   if(along<0||along>len||distance>radius||coverage[0][p])continue;
   // In these two frames the frozen skin classifier labeled the FREE paper tip
   // as a hand. The actual grip is >60 native pixels away. Correct only neutral
   // source paper in the first35% of this independently observed thin corridor.
   const released=(f===75||f===76)&&along<=len*.35&&!!guard[p]&&Math.min(r,b)>85&&g>95&&r-g<45&&r-b<70&&g-Math.max(r,b)<70;
   if(released){guard[p]=0;releasedGuardPixels.push(p);}
   if(guard[p]||coverage[1][p])continue;
   // Neutral/green-reflected source paper only. Fractional uncertain boundary;
   // opacity never depends on the new artwork. The remaining blue guard wins.
   if(released||(Math.min(r,b)>45&&g>60&&r-g<25&&r-b<45&&g-Math.max(r,b)<80)){
    coverage[1][p]=Math.round(255*Math.min(1,(Math.min(r,b)-35)/110));added++;if(f>=70&&f<=73)newPaperPixels.push(p);
   }
  }
 }
 if(newPaperPixels.length){
  // A neutral fingernail can pass the RGB gate through an old guard pinhole.
  // Broad-face additions must belong to source-qualified paper connected to
  // the frozen moving paper. This is connectivity within the bounded RGB
  // candidates, not a dilation of either paper or hand masks.
  const seen=new Uint8Array(W*H),queue:number[]=[];
  for(let p=0;p<W*H;p++)if(mask[p*3+1]&&!guard[p]){seen[p]=1;queue.push(p);}
  for(let i=0;i<queue.length;i++){
   const p=queue[i],x=p%W,y=Math.floor(p/W);
   for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++){
    const n=yy*W+xx;if(!seen[n]&&coverage[1][n]&&!guard[n]){seen[n]=1;queue.push(n);}
   }
  }
  for(const p of newPaperPixels)if(!seen[p]){coverage[1][p]=0;added--;}
 }
 const movingQuad=(backQuads[f]??input.movingQuad).map(p=>[p[0],p[1]]) as CardQuad;
 return{coverage,guard,quads:[input.firstQuad,movingQuad] as [CardQuad,CardQuad],bounds:coverage.map(bounds),side,added,releasedGuardPixels};
}
