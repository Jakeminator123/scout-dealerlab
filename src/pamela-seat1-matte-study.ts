import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {keyPamelaFrame} from './pamela-key.ts';

export const SEAT1_MATTE_SOURCE='5488934997d6311098680ee0d99a3273074e92d7e9ab981138d2a76950748abb';
export const SEAT1_MATTE_SIZE={width:1762,height:1174,fps:30,start:190,endInclusive:225};
export type Point=[number,number];
type Box={left:number;top:number;right:number;bottom:number};
const W=1762,H=1174,N=W*H;
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export const SEAT1_MATTE_CONTRACT={
 sourceSha256:SEAT1_MATTE_SOURCE,coordinateSystem:'native1762x1174; zero-based source frames',
 tableLine:{leftY:833,rightY:820},backgroundReferenceFrames:[240,260,280,320,359],
 backgroundReferencePolicy:'Temporal median only on clean table x<620,y>=836; elsewhere use clean row samples x480..560. No frame-difference mask and no REDO hand subtraction.',
 cardReferenceFrame:215,releaseFrame:209,
 cardKeys:[
  {frame:190,quad:[[124,935],[247,935],[196,1001],[59,1000]] as Point[]},
  {frame:200,quad:[[137,935],[250,935],[201,1001],[72,1001]] as Point[]},
  {frame:225,quad:[[138,935],[250,935],[201,1001],[73,1001]] as Point[]},
 ],
 handKeys:[
  {frame:190,box:[94,790,365,973]}, {frame:205,box:[96,794,375,978]},
  {frame:209,box:[93,790,378,946]}, {frame:212,box:[105,775,390,920]},
  {frame:215,box:[145,754,415,902]}, {frame:218,box:[245,727,480,880]},
  {frame:220,box:[325,710,542,867]}, {frame:222,box:[422,703,630,855]},
  {frame:225,box:[525,694,730,852]},
 ],
 sleeveKeys:[
  {frame:190,polygon:[[241,824],[401,824],[379,849],[351,879],[329,884],[321,862],[333,838],[307,822]] as Point[]},
  {frame:205,polygon:[[246,824],[410,824],[385,851],[354,884],[332,888],[324,864],[338,840],[310,822]] as Point[]},
  {frame:209,polygon:[[252,824],[410,824],[385,851],[354,881],[332,885],[327,860],[339,837],[312,820]] as Point[]},
  {frame:212,polygon:[[270,820],[416,820],[394,840],[374,861],[349,865],[345,846],[352,829],[323,814]] as Point[]},
  {frame:215,polygon:[[310,816],[430,816],[416,831],[400,848],[379,850],[371,837],[373,823],[343,809]] as Point[]},
  {frame:218,polygon:[[379,797],[464,797],[464,812],[464,823],[430,828],[409,818],[403,807],[395,798]] as Point[]},
  {frame:225,polygon:[[485,760],[570,760],[570,775],[570,786],[536,791],[515,781],[509,770],[501,761]] as Point[]},
 ],
 contactFingerKeys:[
  {frame:190,polygons:[[[122,923],[141,924],[138,934],[131,942],[123,942],[118,937],[118,930]],[[142,931],[171,931],[164,949],[156,959],[142,959],[134,952],[135,943]],[[182,930],[211,932],[205,947],[193,957],[181,959],[170,954],[170,943]]] as Point[][]},
  {frame:205,polygons:[[[130,929],[149,930],[146,940],[139,948],[131,948],[126,943],[126,936]],[[148,932],[177,932],[170,950],[162,960],[148,960],[140,953],[141,944]],[[190,930],[219,932],[213,947],[201,957],[189,959],[178,954],[178,943]]] as Point[][]},
  {frame:208,polygons:[[[123,922],[142,923],[139,933],[132,941],[124,941],[119,936],[119,929]],[[140,928],[169,928],[162,946],[154,956],[140,956],[132,949],[133,940]],[[182,921],[211,923],[205,938],[193,948],[181,950],[170,945],[170,934]]] as Point[][]},
 ],
 shoePolygon:[[1189,815],[1197,787],[1260,740],[1330,712],[1598,636],[1684,666],[1688,827],[1654,844],[1280,899],[1212,887],[1189,867]] as Point[],
 note:'Manually bounded support, refined by source colour and observed edge gradients. Hidden card support comes only from source215; no fabricated card design. Source generated artwork remains unapproved.',
};
function interpolate<T extends {frame:number}>(keys:T[],frame:number,extract:(key:T)=>number[]):number[]{
 const index=keys.findIndex(k=>k.frame>=frame),next=index<0?keys.length-1:index,b=keys[next],a=keys[Math.max(0,next-1)],t=a.frame===b.frame?0:clamp((frame-a.frame)/(b.frame-a.frame));
 return extract(a).map((v,i)=>v+(extract(b)[i]-v)*t);
}
function polygonAt(keys:{frame:number;polygon:Point[]}[],frame:number):Point[]{const a=interpolate(keys,frame,k=>k.polygon.flat());return Array.from({length:a.length/2},(_,i)=>[a[i*2],a[i*2+1]]);}
function cardAt(frame:number):Point[]{const a=interpolate(SEAT1_MATTE_CONTRACT.cardKeys,frame,k=>k.quad.flat());return Array.from({length:4},(_,i)=>[a[i*2],a[i*2+1]]);}
function handAt(frame:number):Box{const [left,top,right,bottom]=interpolate(SEAT1_MATTE_CONTRACT.handKeys,frame,k=>k.box);return {left:Math.max(1,left-40),top:Math.max(1,top-20),right:right+40,bottom:bottom+20};}
function inside(x:number,y:number,poly:Point[]){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>y)!==(poly[j][1]>y)&&x<(poly[j][0]-poly[i][0])*(y-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])yes=!yes;return yes;}
function signedDistance(x:number,y:number,poly:Point[]){let distance=Infinity;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
 const a=poly[i],b=poly[j],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy));distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
 }return inside(x,y,poly)?distance:-distance;}
function bilinear(raw:Buffer,x:number,y:number,c:number){x=clamp(x,0,W-1);y=clamp(y,0,H-1);const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,at=(xx:number,yy:number)=>raw[(Math.min(H-1,yy)*W+Math.min(W-1,xx))*3+c];return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;}
function cardReferencePoint(x:number,y:number,quad:Point[],reference:Point[]):Point{
 const v=clamp((y-quad[0][1])/(quad[3][1]-quad[0][1])),left=quad[0][0]*(1-v)+quad[3][0]*v,right=quad[1][0]*(1-v)+quad[2][0]*v,u=clamp((x-left)/(right-left));
 return [(reference[0][0]*(1-v)+reference[3][0]*v)*(1-u)+(reference[1][0]*(1-v)+reference[2][0]*v)*u,reference[0][1]*(1-v)+reference[3][1]*v];
}
function observedCardAlpha(raw:Buffer,background:Buffer){
 const result=new Float32Array(N),left=new Int16Array(H),right=new Int16Array(H);left.fill(32767);right.fill(-1);let first=H,last=-1;
 // The observed top paper edge is y934..936 throughout this landing. Do not
 // classify a pale fingernail above that edge as part of the laid card.
 for(let y=934;y<=1008;y++)for(let x=45;x<=270;x++){
  const i=(y*W+x)*3,r=raw[i],g=raw[i+1],b=raw[i+2];
  if(Math.min(r,g,b)>165&&Math.max(r,g,b)-Math.min(r,g,b)<48){left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);first=Math.min(first,y);last=Math.max(last,y);}
 }
 if(last<first)throw Error('Visible source paper border missing');
 for(let y=Math.max(934,first-2);y<=Math.min(1008,last+2);y++){
  let row=Math.max(first,Math.min(last,y));if(right[row]<left[row])continue;
  for(let x=Math.max(45,left[row]-2);x<=Math.min(270,right[row]+2);x++){
   const p=y*W+x,i=p*3,m=Math.min(raw[i],raw[i+1],raw[i+2]),bg=Math.min(background[i],background[i+1],background[i+2]);
   const interior=y>first+1&&y<last-1&&x>left[row]+1&&x<right[row]-1;
   result[p]=interior||m>215?1:clamp((m-bg-3)/(235-bg-3));
  }
 }
 return result;
}
function sampleAlpha(alpha:Float32Array,x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;return (alpha[iy*W+ix]*(1-fx)+alpha[iy*W+ix+1]*fx)*(1-fy)+(alpha[(iy+1)*W+ix]*(1-fx)+alpha[(iy+1)*W+ix+1]*fx)*fy;}
function nearestSeed(seed:Uint8Array,box:Box){
 const left=Math.floor(box.left),right=Math.ceil(box.right),top=Math.floor(box.top),bottom=Math.ceil(box.bottom),rw=right-left+1,rh=bottom-top+1,nearest=new Int32Array(rw*rh),distance=new Uint16Array(rw*rh),queue=new Int32Array(rw*rh);nearest.fill(-1);distance.fill(65535);let tail=0;
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*W+x,j=(y-top)*rw+x-left;if(seed[p]){nearest[j]=p;distance[j]=0;queue[tail++]=j;}}
 for(let head=0;head<tail;head++){const j=queue[head],x=j%rw,y=Math.floor(j/rw);for(const q of [x>0?j-1:-1,x+1<rw?j+1:-1,y>0?j-rw:-1,y+1<rh?j+rw:-1])if(q>=0&&nearest[q]<0){nearest[q]=nearest[j];distance[q]=distance[j]+1;queue[tail++]=q;}}
 return {nearest,distance,index:(x:number,y:number)=>(y-top)*rw+x-left};
}
export async function createSeat1MatteStudy(referenceFrames:Buffer[],cardReference:Buffer){
 if(referenceFrames.length!==SEAT1_MATTE_CONTRACT.backgroundReferenceFrames.length)throw Error('Complete temporal background references required');
 const plate=Buffer.alloc(N*3);for(let p=0;p<N;p++)for(let c=0;c<3;c++){const values=referenceFrames.map(b=>b[p*3+c]).sort((a,b)=>a-b);plate[p*3+c]=values[Math.floor(values.length/2)];}
 for(let y=836;y<H;y++){
  const row=[0,0,0];for(let x=480;x<=560;x++)for(let c=0;c<3;c++)row[c]+=plate[(y*W+x)*3+c]/81;
  for(let x=620;x<W;x++)for(let c=0;c<3;c++)plate[(y*W+x)*3+c]=Math.round(row[c]);
 }
 const roomPath='runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png',tablePath='runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png';
 const room=await sharp(roomPath).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
 const stage=await sharp(room).composite([{input:await readFile(tablePath)}]).removeAlpha().raw().toBuffer();
 const referenceCardAlpha=observedCardAlpha(cardReference,plate);
 return {plate,stage,render:async(raw:Buffer,frame:number)=>{
  if(frame<190||frame>225||raw.length!==N*3)throw Error('Bounded native seat1 frames190..225 only');
  const keyed=keyPamelaFrame(raw,W,H),upper=Float32Array.from(keyed.alpha),hand=new Float32Array(N),card=new Float32Array(N),shoe=new Float32Array(N),shadow=new Float32Array(N),dealer=new Float32Array(N);
  const foreground=Buffer.from(keyed.rgb),cardRgb=Buffer.from(raw),quad=cardAt(frame),referenceQuad=cardAt(215),handBox=handAt(frame),sleeve=polygonAt(SEAT1_MATTE_CONTRACT.sleeveKeys,frame);
  const cardTemplate=Buffer.alloc(N*3),cardGeometry=observedCardAlpha(raw,plate);
  const contactDistance=new Float32Array(N);contactDistance.fill(-100);
  const fingers=frame<209?Array.from({length:3},(_,i)=>polygonAt(SEAT1_MATTE_CONTRACT.contactFingerKeys.map(k=>({frame:k.frame,polygon:k.polygons[i]})),frame)):[];
  for(let y=928;y<=1008;y++)for(let x=45;x<=270;x++){
   const p=y*W+x,d=signedDistance(x+.5,y+.5,quad),[rx,ry]=cardReferencePoint(x,y,quad,referenceQuad);
   if(frame<209&&d>-.5)cardGeometry[p]=Math.max(cardGeometry[p],sampleAlpha(referenceCardAlpha,rx,ry));
   for(let c=0;c<3;c++)cardTemplate[p*3+c]=Math.round(bilinear(cardReference,rx,ry,c));
   if(frame<209)contactDistance[p]=Math.max(...fingers.map(poly=>signedDistance(x+.5,y+.5,poly)));
  }
  const seed=new Uint8Array(N),core=new Uint8Array(N),handRegions=[handBox,{left:835,top:750,right:1040,bottom:890}];
  for(const box of handRegions){
   for(let y=Math.floor(box.top);y<=Math.ceil(box.bottom);y++)for(let x=Math.floor(box.left);x<=Math.ceil(box.right);x++){
    const p=y*W+x,i=p*3,r=raw[i],g=raw[i+1],b=raw[i+2];
    let manualFingerCore=false;
    if(cardGeometry[p]>.01){if(frame>=209||contactDistance[p]<-1)continue;manualFingerCore=contactDistance[p]>1.5;const difference=Math.max(...[0,1,2].map(c=>Math.abs(raw[i+c]-cardTemplate[i+c])));if(!manualFingerCore&&difference<24)continue;}
    seed[p]=(manualFingerCore?r>100&&r-b>4:r>105&&r-g>8&&r-b>13&&g>52&&b>34)?1:0;
   }
   for(let y=Math.floor(box.top)+2;y<Math.ceil(box.bottom)-2;y++)for(let x=Math.floor(box.left)+2;x<Math.ceil(box.right)-2;x++){
    const p=y*W+x;if(!seed[p])continue;let solid=true;for(const [dx,dy]of [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,1],[-1,1],[1,-1]])if(!seed[p+dy*W+dx])solid=false;
    // Preserve deeply coloured skin grooves, even when a neighbouring dark
    // crease is not a chroma seed. This does not infer a new hand silhouette.
    const sourceCore=(q:number)=>{const i=q*3,r=raw[i],g=raw[i+1],b=raw[i+2];return r>160&&g>65&&b>40&&r-g>25&&r-b>45;};
    const skinInterior=cardGeometry[p]<.01&&[[0,0],[-3,0],[3,0],[0,-3],[0,3]].every(([dx,dy])=>sourceCore(p+dy*W+dx));
    core[p]=solid||skinInterior?1:0;
   }
   const nearest=nearestSeed(core,box);
   for(let y=Math.floor(box.top);y<=Math.ceil(box.bottom);y++)for(let x=Math.floor(box.left);x<=Math.ceil(box.right);x++){
    const p=y*W+x,i=p*3,j=nearest.index(x,y),q=nearest.nearest[j];if(q<0||nearest.distance[j]>8)continue;
    if(cardGeometry[p]>.01&&(frame>=209||contactDistance[p]<-1))continue;
    const tableY=833-13*x/(W-1);
    if(y<tableY-2){hand[p]=keyed.alpha[p];continue;}
    if(core[p]){hand[p]=1;for(let c=0;c<3;c++)foreground[i+c]=raw[i+c];continue;}
    const background=cardGeometry[p]>.2?cardTemplate:plate,bgIndex=i;let numerator=0,denominator=0;
    for(let c=0;c<3;c++){const d=raw[q*3+c]-background[bgIndex+c];numerator+=(raw[i+c]-background[bgIndex+c])*d;denominator+=d*d;}
    if(denominator<1000)continue;const a=clamp(numerator/denominator),error=Math.sqrt([0,1,2].reduce((s,c)=>s+(raw[i+c]-(raw[q*3+c]*a+background[i+c]*(1-a)))**2,0)/3);
    if(error>33||a<.025||raw[i]<raw[i+1]+3)continue;hand[p]=a;
    // Reject unstable red/green spikes from division at a translucent edge. The
    // colour stays within the observed nearby opaque hand sample, not a new hue.
    for(let c=0;c<3;c++)foreground[i+c]=Math.round(clamp((raw[i+c]-background[i+c]*(1-a))/Math.max(.06,a),Math.max(0,raw[q*3+c]-28),Math.min(255,raw[q*3+c]+28)));
   }
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const p=y*W+x,i=p*3,tableY=833-13*x/(W-1);
   // Source table is never accepted as dealer foreground merely because it is dark.
   upper[p]*=x>1160?0:1-smooth((y-tableY+.5)/1.5);
   let sleeveAlpha=0;
   if(x>=handBox.left&&x<=handBox.right+80&&y>=tableY-3&&y<910){const d=signedDistance(x+.5,y+.5,sleeve);sleeveAlpha=Math.min(keyed.alpha[p],smooth((d+.8)/1.6));}
   dealer[p]=Math.max(upper[p],hand[p],sleeveAlpha);
   if(sleeveAlpha>0&&hand[p]===0)for(let c=0;c<3;c++)foreground[i+c]=keyed.rgb[i+c];
   if(x>=1185&&x<=1693&&y>=630&&y<=905){const d=signedDistance(x+.5,y+.5,SEAT1_MATTE_CONTRACT.shoePolygon);shoe[p]=Math.min(keyed.alpha[p],smooth((d+.7)/1.4));}
   card[p]=cardGeometry[p];
   if(card[p]>0&&hand[p]>.001)for(let c=0;c<3;c++)cardRgb[i+c]=cardTemplate[i+c];
  }
  // Shadows are independent darkening on the replacement table, never copied RGB.
  for(let y=836;y<1050;y++)for(let x=35;x<1080;x++){
   const p=y*W+x;if(dealer[p]>.1||card[p]>.1)continue;
   const nearHand=x>handBox.left-15&&x<handBox.right+25&&y>Math.max(836,handBox.top)&&y<handBox.bottom+48;
   const nearCard=x>55&&x<260&&y>930&&y<1014;if(!nearHand&&!nearCard)continue;
   const i=p*3,lum=(raw[i]+raw[i+1]+raw[i+2])/3,base=(plate[i]+plate[i+1]+plate[i+2])/3;
   const edgeWeight=nearHand?smooth(Math.min(x-handBox.left+15,handBox.right+25-x,handBox.bottom+48-y)/18):1;
   shadow[p]=clamp((1-lum/Math.max(12,base))*.6,0,.32)*edgeWeight;
  }
  const shadowBytes=await sharp(Buffer.from(shadow.map(a=>a*255)),{raw:{width:W,height:H,channels:1}}).blur(2).raw().toBuffer();
  const native=Buffer.from(stage),before=Buffer.from(stage),checker=Buffer.alloc(N*3),rgba=Buffer.alloc(N*4),cardRgba=Buffer.alloc(N*4),shoeRgba=Buffer.alloc(N*4);
  let safeHandPixels=0,safeHandChanged=0,faceCorePixels=0,faceCoreChanged=0,cardVisiblePixels=0,cardAfterReleaseChanged=0;
  const alphaToByte=(a:number)=>Math.round(clamp(a)*255);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const p=y*W+x,i=p*3,a=dealer[p],ca=card[p],sa=shoe[p],checkerGrey=((x>>5)+(y>>5))%2?75:44;
   for(let c=0;c<3;c++){
    before[i+c]=Math.round(keyed.rgb[i+c]*keyed.alpha[p]+stage[i+c]*(1-keyed.alpha[p]));
    let value=stage[i+c]*(1-shadowBytes[p]/255);value=cardRgb[i+c]*ca+value*(1-ca);value=raw[i+c]*sa+value*(1-sa);value=foreground[i+c]*a+value*(1-a);native[i+c]=Math.round(clamp(value,0,255));
    checker[i+c]=Math.round(foreground[i+c]*a+checkerGrey*(1-a));rgba[p*4+c]=foreground[i+c];cardRgba[p*4+c]=cardRgb[i+c];shoeRgba[p*4+c]=raw[i+c];
   }
   rgba[p*4+3]=alphaToByte(a);cardRgba[p*4+3]=alphaToByte(ca);shoeRgba[p*4+3]=alphaToByte(sa);
   if(core[p]&&hand[p]===1){safeHandPixels++;if([0,1,2].some(c=>native[i+c]!==raw[i+c]))safeHandChanged++;}
   if(x>680&&x<865&&y>175&&y<350&&raw[i]>raw[i+1]+15&&raw[i]>raw[i+2]+25&&keyed.alpha[p]===1){faceCorePixels++;if([0,1,2].some(c=>native[i+c]!==raw[i+c]))faceCoreChanged++;}
   if(ca>.999&&hand[p]===0){cardVisiblePixels++;if(frame>=209&&[0,1,2].some(c=>native[i+c]!==raw[i+c]))cardAfterReleaseChanged++;}
  }
  if(safeHandChanged||faceCoreChanged||cardAfterReleaseChanged)throw Error(`Source core preservation failed: hand=${safeHandChanged},face=${faceCoreChanged},card=${cardAfterReleaseChanged}`);
  return {native,before,checker,rgba,cardRgba,shoeRgba,masks:{dealer:Buffer.from(dealer.map(alphaToByte)),hand:Buffer.from(hand.map(alphaToByte)),card:Buffer.from(card.map(alphaToByte)),shoe:Buffer.from(shoe.map(alphaToByte)),shadow:shadowBytes},diagnostics:{sourceFrame:frame,handBox,cardQuad:quad,sleevePolygon:sleeve,safeHandPixels,safeHandChanged,faceCorePixels,faceCoreChanged,cardVisiblePixels,cardAfterReleaseChanged,hiddenCardReferenceFrame:frame<209?215:null}};
 }};
}
