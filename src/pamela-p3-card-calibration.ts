import type {CardPhysicalSide,CardQuad} from './pamela-two-sided-card.ts';

/** C2-P3 only. Blank source: semantic sides and hidden UV corners are authored. */
export const P3_NATIVE={width:1762,height:1174,frames:360,fps:30,sourceSha256:'bce1003fedde8573cfd85470367a16e439d40c230e3f526c5a51a105d151794b'} as const;
export const P3_SIDE_POLICY={back:[0,52],edge:[52,67],front:[67,360],physicalSide:'UNKNOWN'} as const;
export function pamelaP3FlipSide(frame:number,sourceSha256:string):CardPhysicalSide{
 if(sourceSha256!==P3_NATIVE.sourceSha256||!Number.isInteger(frame)||frame<0||frame>=P3_NATIVE.frames)throw Error('P3 calibration source/frame mismatch');
 return frame<52?'BACK':frame<67?'EDGE':'FRONT';
}
type PixelBounds={left:number;top:number;width:number;height:number};
// Native P3 RGB observations, not P2/P4 geometry. Back short edge stays at
// the grip; the frozen track otherwise rotates its corner convention at f51.
// Blur and occluded grip corners remain approximate; coverage is independent.
const fittedQuads:Record<number,CardQuad>={
 46:[[1252,646],[1298,647],[1245,757],[1196,740]],
 47:[[1240,644],[1282,648],[1218,747],[1175,737]],
 48:[[1226,646],[1264,646],[1192,744],[1153,731]],
 49:[[1200,654],[1222,651],[1131,731],[1110,726]],
 50:[[1184,661],[1209,658],[1119,731],[1099,728]],
 51:[[1175,670],[1194,663],[1102,732],[1088,728]],
 67:[[762,864],[818,846],[832,856],[747,879]],
 68:[[743,872],[806,852],[822,867],[734,892]],
 69:[[724,883],[797,864],[796,896],[713,917]],
 70:[[719,888],[797,869],[796,900],[707,924]],
 71:[[713,890],[797,869],[790,907],[704,929]],
 72:[[708,898],[795,875],[787,914],[696,939]],
 73:[[701,906],[792,876],[782,926],[689,948]],
 74:[[689,918],[783,887],[767,941],[676,967]],
};
// Free tip -> grip, bounded half-width in native pixels, independently traced
// through every consecutive P3 source frame. RGB qualifies additions only.
const ribbons:Record<number,readonly [number,number,number,number,number]>={
 46:[1220,748,1275,647,27],47:[1196,742,1261,646,25],48:[1173,737,1245,646,24],
 49:[1119,728,1211,657,14],50:[1108,728,1204,660,12],51:[1096,729,1188,669,10],
 52:[1068,731,1165,677,6],53:[1041,737,1138,689,7],54:[976,749,1091,702,3],
 55:[951,755,1076,710,3],56:[945,758,1055,718,3],57:[929,763,1028,724,3],
 58:[901,773,999,735,3],59:[854,791,958,757,3.5],60:[841,799,944,767,3.5],
 61:[833,804,930,775,3],62:[817,813,914,788,3],63:[821,822,885,802,3],
 64:[777,855,860,830,3.5],65:[773,858,858,832,4.5],66:[763,864,853,839,6],
 67:[750,873,832,849,11],68:[738,886,820,859,14],69:[720,901,799,880,20],70:[714,908,798,883,22],
};
function bounds(mask:Uint8Array):PixelBounds{
 const W=P3_NATIVE.width;let l:number=W,t:number=P3_NATIVE.height,r=-1,b=-1;
 for(let p=0;p<mask.length;p++)if(mask[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 return r<0?{left:0,top:0,width:1,height:1}:{left:l,top:t,width:r-l+1,height:b-t+1};
}
export function calibrateP3CardFrame(input:{frame:number;sourceSha256:string;sourceRgb:Uint8Array;semanticMaskRgb:Uint8Array;movingQuad:CardQuad;firstQuad:CardQuad}){
 const {width:W,height:H}=P3_NATIVE,{frame:f,sourceRgb:raw,semanticMaskRgb:mask}=input,side=pamelaP3FlipSide(f,input.sourceSha256);
 if(raw.length!==W*H*3||mask.length!==raw.length)throw Error('Native P3 RGB/mask dimensions required');
 for(const q of [input.firstQuad,input.movingQuad])if(q.length!==4||q.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Finite P3 card quads required');
 const coverage:[Uint8Array,Uint8Array]=[new Uint8Array(W*H),new Uint8Array(W*H)],guard=new Uint8Array(W*H);
 for(let p=0;p<W*H;p++){coverage[0][p]=mask[p*3];coverage[1][p]=mask[p*3+1];guard[p]=mask[p*3+2];}
 let added=0;const releasedGuardPixels:number[]=[],newPaperPixels:number[]=[],ribbon=ribbons[f];
 if(ribbon){
  const [x0,y0,x1,y1,radius]=ribbon,dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  for(let y=Math.max(0,Math.floor(Math.min(y0,y1)-radius-1));y<=Math.min(H-1,Math.ceil(Math.max(y0,y1)+radius+1));y++)for(let x=Math.max(0,Math.floor(Math.min(x0,x1)-radius-1));x<=Math.min(W-1,Math.ceil(Math.max(x0,x1)+radius+1));x++){
   const along=(x+.5-x0)*ux+(y+.5-y0)*uy,distance=Math.abs((x+.5-x0)*-uy+(y+.5-y0)*ux),p=y*W+x,k=p*3,r=raw[k],g=raw[k+1],b=raw[k+2];
   if(along<0||along>len||distance>radius||coverage[0][p])continue;
   // f53 only: the isolated blue label sits on the FREE blurred paper tip,
   // over70 native pixels from the grip. Exact bounded source-qualified
   // exception; no general erosion/dilation of either hand or paper masks.
   const released=f===53&&along<=len*.3&&!!guard[p]&&Math.min(r,b)>85&&g>95&&r-g<45&&r-b<70&&g-Math.max(r,b)<70;
   if(released){guard[p]=0;releasedGuardPixels.push(p);}
   if(guard[p]||coverage[1][p])continue;
   if(released||(Math.min(r,b)>45&&g>60&&r-g<25&&r-b<45&&g-Math.max(r,b)<80)){
    coverage[1][p]=Math.round(255*Math.min(1,(Math.min(r,b)-35)/110));added++;if(side!=='EDGE')newPaperPixels.push(p);
   }
  }
 }
 if(newPaperPixels.length){
  // Broad-face additions must connect to frozen moving paper through source-
  // qualified pixels. This rejects detached neutral nails through guard holes.
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
 let movingQuad=(fittedQuads[f]??input.movingQuad).map(p=>[p[0],p[1]]) as CardQuad;
 if(side==='EDGE'&&ribbon){
  const [x0,y0,x1,y1,radius]=ribbon,dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy),nx=-dy/len*radius,ny=dx/len*radius;
  movingQuad=[[x0-nx,y0-ny],[x1-nx,y1-ny],[x1+nx,y1+ny],[x0+nx,y0+ny]];
 }
 return{coverage,guard,quads:[input.firstQuad,movingQuad] as [CardQuad,CardQuad],bounds:coverage.map(bounds),side,added,releasedGuardPixels};
}
