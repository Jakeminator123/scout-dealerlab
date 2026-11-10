import type {CardPhysicalSide,CardQuad} from './pamela-two-sided-card.ts';

/** C2-P5 only. Blank source prop: semantic front/back are authored. */
export const P5_NATIVE={width:1762,height:1174,frames:360,fps:30,sourceSha256:'9a73beb62ccaa93325c7f3d0a65feb3c767ad873d1d3678f9ad494e53a8b0a58'} as const;
export const P5_SIDE_POLICY={back:[0,88],edge:[88,94],front:[94,360],physicalSide:'UNKNOWN'} as const;
export function pamelaP5FlipSide(frame:number,sourceSha256:string):CardPhysicalSide{
 if(sourceSha256!==P5_NATIVE.sourceSha256||!Number.isInteger(frame)||frame<0||frame>=P5_NATIVE.frames)throw Error('P5 calibration source/frame mismatch');
 return frame<88?'BACK':frame<94?'EDGE':'FRONT';
}
type PixelBounds={left:number;top:number;width:number;height:number};
// Native P5 paper-axis fits. These keep the grip short edge first on the back;
// the old track interpolated its corner order while the face was still broad.
// Front94 uses the landing convention and the complete observed paper length.
const fittedQuads:Record<number,CardQuad>={
 80:[[1244.13,613.08],[1264.18,640.8],[1184.28,698.56],[1164.24,670.84]],
 81:[[1246.21,613.45],[1263.9,641.05],[1178.17,696.02],[1160.48,668.43]],
 82:[[1242.63,616.44],[1257.75,640.78],[1172.75,693.57],[1157.64,669.23]],
 83:[[1238.97,623.56],[1250.86,644.91],[1164.71,692.87],[1152.83,671.51]],
 84:[[1231.58,635.85],[1239.33,649.72],[1151.58,698.79],[1143.82,684.92]],
 85:[[1227,641],[1233,652],[1134,708],[1128,697]],
 86:[[1218,650],[1223,658],[1135,711],[1130,703]],
 87:[[1211,653],[1214,659],[1130,713],[1127,707]],
 94:[[1087,780],[1163,740],[1168,749],[1092,790]],
};
// Free tip -> far grip. Radius is a native source-paper corridor, not dilation.
const corridors:Record<number,readonly [number,number,number,number,number]>={
 80:[1167,683,1250,623,30],81:[1161,687,1253,628,26],82:[1155,692,1250,633,23],83:[1149,695,1246,641,21],84:[1143,700,1236,648,14],
 85:[1136,705,1228,650,10],86:[1131,709,1218,654,9],87:[1128,710,1216,653,8],
 94:[1093,790,1168,747,9],95:[1087,800,1166,755,11],96:[1084,806,1164,765,13],97:[1083,814,1160,774,14],98:[1084,832,1156,793,17],99:[1084,847,1151,809,20],
};
function bounds(mask:Uint8Array):PixelBounds{
 const W=P5_NATIVE.width;let l:number=W,t:number=P5_NATIVE.height,r=-1,b=-1;
 for(let p=0;p<mask.length;p++)if(mask[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 return r<0?{left:0,top:0,width:1,height:1}:{left:l,top:t,width:r-l+1,height:b-t+1};
}
export function calibrateP5CardFrame(input:{frame:number;sourceSha256:string;sourceRgb:Uint8Array;semanticMaskRgb:Uint8Array;movingQuad:CardQuad;firstQuad:CardQuad}){
 const {width:W,height:H}=P5_NATIVE,{frame:f,sourceRgb:raw,semanticMaskRgb:mask}=input,side=pamelaP5FlipSide(f,input.sourceSha256);
 if(raw.length!==W*H*3||mask.length!==raw.length)throw Error('Native P5 RGB/mask dimensions required');
 for(const q of [input.firstQuad,input.movingQuad])if(q.length!==4||q.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Finite P5 card quads required');
 const coverage:[Uint8Array,Uint8Array]=[new Uint8Array(W*H),new Uint8Array(W*H)],guard=new Uint8Array(W*H);
 for(let p=0;p<W*H;p++){coverage[0][p]=mask[p*3];coverage[1][p]=mask[p*3+1];guard[p]=mask[p*3+2];}
 let added=0;const releasedGuardPixels:number[]=[],newPixels:number[]=[],corridor=corridors[f];
 if(corridor){
  const [x0,y0,x1,y1,radius]=corridor,dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  for(let y=Math.max(0,Math.floor(Math.min(y0,y1)-radius));y<=Math.min(H-1,Math.ceil(Math.max(y0,y1)+radius));y++)for(let x=Math.max(0,Math.floor(x0-4));x<=Math.min(W-1,Math.ceil(x1+4));x++){
   const along=(x+.5-x0)*ux+(y+.5-y0)*uy,normal=Math.abs((x+.5-x0)*-uy+(y+.5-y0)*ux),p=y*W+x,k=p*3,r=raw[k],g=raw[k+1],b=raw[k+2];
   if(along< -4||along>len+4||normal>radius||coverage[0][p])continue;
   // Only high-confidence neutral paper; skin and the olive88..93 edge do not
   // qualify. The latter retains the full source guard, including its pinholes.
   const white=Math.min(r,b)>100&&g>105&&r-g<18&&r-b<28&&g-Math.max(r,b)<45;
   if(!white)continue;
   // Native source/guard overlays verified these white strips at85,86,87,94.
   // Their source-qualified pixels are paper, including the visible rim below
   // the gripping fingers; the pink nail above the strip fails this RGB gate.
   // This is a frame-specific correction, never a general guard relaxation.
   const verifiedPaper=f===85||f===86||f===87||f===94;
   if(guard[p]&&verifiedPaper){guard[p]=0;releasedGuardPixels.push(p);}
   if(guard[p]||coverage[1][p])continue;
   coverage[1][p]=Math.round(255*Math.min(1,(Math.min(r,b)-50)/100));added++;newPixels.push(p);
  }
  // Candidates must connect to the frozen moving paper. Isolated highlights
  // on a fingernail cannot become a card merely by passing the RGB threshold.
  const seen=new Uint8Array(W*H),queue:number[]=[];
  for(let p=0;p<W*H;p++)if(mask[p*3+1]&&!guard[p]){seen[p]=1;queue.push(p);}
  for(let i=0;i<queue.length;i++){const p=queue[i],x=p%W,y=Math.floor(p/W);for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++){const n=yy*W+xx;if(!seen[n]&&coverage[1][n]&&!guard[n]){seen[n]=1;queue.push(n);}}}
  for(const p of newPixels)if(!seen[p]){coverage[1][p]=0;added--;if(mask[p*3+2])guard[p]=mask[p*3+2];}
  // Stable sorted receipt, including an existing covered pixel if its guard
  // was corrected; never list a candidate that connectivity rejected.
  for(let i=releasedGuardPixels.length-1;i>=0;i--)if(guard[releasedGuardPixels[i]])releasedGuardPixels.splice(i,1);
 }
 const movingQuad=(fittedQuads[f]??input.movingQuad).map(p=>[p[0],p[1]]) as CardQuad;
 return{coverage,guard,quads:[input.firstQuad,movingQuad] as [CardQuad,CardQuad],bounds:coverage.map(bounds),side,added,releasedGuardPixels};
}
