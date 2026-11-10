import {PAMELA_P4_FLIP_SOURCE,pamelaP4FlipSide,type CardQuad} from './pamela-two-sided-card.ts';

/** Frozen native calibration from take-03. Artwork is deliberately absent. */
export const P4_NATIVE={width:1762,height:1174,frames:360,fps:30,sourceSha256:PAMELA_P4_FLIP_SOURCE} as const;
export type PixelBounds={left:number;top:number;width:number;height:number};
const lineKeys=[{f:83,p:[1077,700,1189,647]},{f:84,p:[1048,698,1172,645]},{f:85,p:[1040,697,1167,644]},{f:88,p:[1022,702,1140,662]},{f:90,p:[984,724,1108,687]},{f:92,p:[976,727,1085,697]},{f:95,p:[940,758,1055,731]},{f:98,p:[923,778,1026,753]}];
function axis(f:number){const hi=lineKeys.findIndex(k=>k.f>=f),b=lineKeys[hi<0?lineKeys.length-1:hi],a=lineKeys[Math.max(0,hi-1)],t=b.f===a.f?0:(f-a.f)/(b.f-a.f);return a.p.map((v,i)=>v+(b.p[i]-v)*t);}
export function paperBounds(mask:Uint8Array):PixelBounds{const W=P4_NATIVE.width,H=P4_NATIVE.height;let l:number=W,t:number=H,r=-1,b=-1;for(let p=0;p<mask.length;p++)if(mask[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}return r<0?{left:0,top:0,width:1,height:1}:{left:l,top:t,width:r-l+1,height:b-t+1};}
export function calibrateP4CardFrame(input:{frame:number;sourceSha256:string;sourceRgb:Uint8Array;semanticMaskRgb:Uint8Array;movingQuad:CardQuad;firstQuad:CardQuad}){
 const {width:W,height:H}=P4_NATIVE,{frame:f,sourceRgb:raw,semanticMaskRgb:mask}=input;
 const side=pamelaP4FlipSide(f,input.sourceSha256);
 if(raw.length!==W*H*3||mask.length!==raw.length)throw Error('Native P4 RGB/mask dimensions required');
 const coverage=[new Uint8Array(W*H),new Uint8Array(W*H)],guard=new Uint8Array(W*H);
 for(let p=0;p<W*H;p++){coverage[0][p]=mask[p*3];coverage[1][p]=mask[p*3+1];guard[p]=mask[p*3+2];}
 let movingQuad=input.movingQuad,added=0;
 if(f>=84&&f<=98){
  const [x0,y0,x1,y1]=axis(f),dx=x1-x0,dy=y1-y0,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
  for(let y=Math.max(0,Math.floor(Math.min(y0,y1)-11));y<=Math.min(H-1,Math.ceil(Math.max(y0,y1)+11));y++)for(let x=Math.floor(Math.min(x0,x1)-3);x<=Math.ceil(Math.max(x0,x1)+3);x++){
   const along=((x-x0)*dx+(y-y0)*dy)/(length*length),distance=Math.abs((x-x0)*nx+(y-y0)*ny),p=y*W+x,k=p*3,r=raw[k],g=raw[k+1],b=raw[k+2];
   if(along<-.01||along>1.01||distance>7||guard[p]||coverage[0][p])continue;
   if(Math.min(r,b)>25&&g>45&&r-g<32&&r-b<55&&!coverage[1][p]){coverage[1][p]=255;added++;}
  }
  const half=4;movingQuad=[[x1-nx*half,y1-ny*half],[x1+nx*half,y1+ny*half],[x0+nx*half,y0+ny*half],[x0-nx*half,y0-ny*half]];
 }else if(f===83){const q=movingQuad;movingQuad=[q[1],q[2],q[3],q[0]];}
 return{coverage,guard,quads:[input.firstQuad,movingQuad],bounds:coverage.map(paperBounds),side,added};
}
