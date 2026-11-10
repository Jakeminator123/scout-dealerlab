import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {keyPamelaFrame} from './pamela-key.ts';
import {buildPamelaContactLayers} from './pamela-contact-shadow.ts';
import {retargetPamelaC2Frame,PAMELA_C2_SOURCE_SHA256} from './pamela-c2-retarget.ts';
import {preparePamelaCardSurface,PAMELA_SG_BACK_SVG} from './pamela-card-surfaces.ts';

type Point=[number,number];type Quad=[Point,Point,Point,Point];
const W=1762,H=1174,run='runs/20261109-pamela-central-composite';
const landed:Quad=[[820,1026],[943,1026],[963,1093],[802,1093]];
const clamp=(x:number,a=0,b=1)=>Math.min(b,Math.max(a,x));
const shifted=(q:Quad,dx:number)=>q.map(([x,y])=>[x+dx,y]) as Quad;
export type PamelaSceneFrame={raw:Buffer;clip:'approach'|'deal'|'retreat'|'idle';sourceFrame:number;dealOrdinal?:number;priorCards?:number;mask?:Buffer;contour?:Point[];quad?:Quad|null};
function homography(q:Quad){
 const uv=[[0,0],[1,0],[1,1],[0,1]],rows:number[][]=[];
 for(let i=0;i<4;i++){const[x,y]=q[i],[u,v]=uv[i];rows.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}
 for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(rows[r][c])>Math.abs(rows[p][c]))p=r;[rows[c],rows[p]]=[rows[p],rows[c]];const d=rows[c][c];if(Math.abs(d)<1e-8)return null;for(let k=c;k<9;k++)rows[c][k]/=d;for(let r=0;r<8;r++)if(r!==c){const f=rows[r][c];for(let k=c;k<9;k++)rows[r][k]-=f*rows[c][k];}}
 return rows.map(r=>r[8]);
}
function inferredQuad(contour:Point[]):Quad|null{
 if(contour.length<4)return null;
 const scores=[(p:Point)=>p[0]+p[1],(p:Point)=>-p[0]+p[1],(p:Point)=>-p[0]-p[1],(p:Point)=>p[0]-p[1]];
 const q=scores.map(s=>contour.reduce((a,p)=>s(p)<s(a)?p:a)) as Quad;
 return new Set(q.map(p=>p.join(','))).size===4?q:null;
}
function paint(out:Buffer,tex:Buffer,q:Quad,coverage?:Float32Array,mask?:Buffer,raw?:Buffer){
 const h=homography(q);if(!h)return 0;
 // A mask defines the paper silhouette. Extend edge UVs to observed mask pixels
 // outside the inferred quad rather than retaining a second original paper rim.
 let left=W,right=-1,top=H,bottom=-1;
 if(mask){for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(mask[y*W+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 else{left=Math.floor(Math.min(...q.map(p=>p[0])));right=Math.ceil(Math.max(...q.map(p=>p[0])));top=Math.floor(Math.min(...q.map(p=>p[1])));bottom=Math.ceil(Math.max(...q.map(p=>p[1])));}
 let extended=0;
 for(let y=Math.max(0,top);y<=Math.min(H-1,bottom);y++)for(let x=Math.max(0,left);x<=Math.min(W-1,right);x++){
  const p=y*W+x,a=mask?mask[p]/255:1;if(!a)continue;
  const d=h[6]*x+h[7]*y+1;if(Math.abs(d)<1e-8)continue;
  const u=(h[0]*x+h[1]*y+h[2])/d,v=(h[3]*x+h[4]*y+h[5])/d;
  const outside=u<0||u>1||v<0||v>1;if(outside&&!mask)continue;if(outside)extended++;
  const t=(Math.min(293,Math.floor(clamp(v)*294))*210+Math.min(209,Math.floor(clamp(u)*210)))*3,i=p*3;
  const light=raw?clamp((raw[i]+raw[i+1]+raw[i+2])/(3*244),.65,1.05):.93;
  for(let c=0;c<3;c++)out[i+c]=Math.round(clamp(out[i+c]*(1-a)+tex[t+c]*light*a,0,255));
  if(coverage)coverage[p]=a+coverage[p]*(1-a);
 }
 return extended;
}
export async function createPamelaSceneRenderer(options:{retargetSecond?:boolean;contact?:boolean;cardSurfaceFix?:{sourceSha256:string}}={}){
 if(options.cardSurfaceFix&&options.retargetSecond)throw Error('Card-side proof does not include C2 retargeting');
 const roomPath=`${run}/scene-assets/pamela-clean-room-v1.png`,table=await readFile(`${run}/scene-assets-v2/dark-felt-table-native-1762x1174.png`);
 const room=await sharp(roomPath).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
 const stage=await sharp(room).composite([{input:table}]).removeAlpha().raw().toBuffer();
 const portraitRoom=await sharp(roomPath).resize(1080,1920,{fit:'cover'}).blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
 const felt=await sharp(table).extract({left:278,top:838,width:1200,height:336}).resize(1080,1086).toBuffer();
 const rail=await sharp(table).extract({left:278,top:817,width:1200,height:21}).resize(1080,19).toBuffer();
 const portraitStage=await sharp(portraitRoom).composite([{input:felt,left:0,top:834},{input:rail,left:0,top:815}]).removeAlpha().toBuffer();
 const texture=async(rank:string,suit:string,color:string)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><rect width="210" height="294" fill="#f7f4e9"/><g fill="${color}" font-family="Arial,sans-serif" text-anchor="middle"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text><text x="105" y="185" font-size="105">${suit}</text><g transform="translate(210 294) rotate(180)"><text x="27" y="40" font-size="33" font-weight="bold">${rank}</text><text x="27" y="72" font-size="31">${suit}</text></g></g></svg>`)).removeAlpha().raw().toBuffer();
 const textures=[await texture('A','♠','#161b20'),await texture('K','♥','#a52d32')];
 const backTexture=options.cardSurfaceFix?await sharp(Buffer.from(PAMELA_SG_BACK_SVG)).removeAlpha().raw().toBuffer():null;
 function card(out:Buffer,n:number,coverage:Float32Array){
  const dx=options.retargetSecond&&n===1?46:0,q=shifted(landed,dx);
  for(let y=1023;y<1103;y++)for(let x=796+dx;x<972+dx;x++){
   const a=.15*clamp(Math.min(x-(796+dx),(972+dx)-x,y-1023,1103-y)/8),p=y*W+x;
   for(let c=0;c<3;c++)out[p*3+c]*=1-a;coverage[p]=a+coverage[p]*(1-a);
  }
  paint(out,textures[n],q,coverage);
 }
 return async(input:PamelaSceneFrame)=>{
  if(input.raw.length!==W*H*3)throw Error('Native RGB dimensions do not match scene calibration');
  let raw=input.raw,mask=input.mask,contour=input.contour??[],quad=input.quad??null,warp:null|ReturnType<typeof retargetPamelaC2Frame>=null;
  if(input.clip==='deal'&&input.dealOrdinal===1&&options.retargetSecond){
   if(!mask)throw Error('C2 requires the measured visible-card mask');
   warp=retargetPamelaC2Frame({sourceRGB:raw,visibleCardMask:mask,width:W,height:H,sourceFrameIndex:input.sourceFrame,sourceSha256:PAMELA_C2_SOURCE_SHA256,contourNative:contour});
   raw=warp.rgb;mask=warp.visibleCardMask;contour=warp.geometry.movingContourNative;if(quad)quad=quad.map(warp.mapPoint) as Quad;
  }
  const keyed=keyPamelaFrame(raw,W,H),out=Buffer.from(stage),coverage=new Float32Array(W*H),rgb=Buffer.from(keyed.rgb);
  const surface=options.cardSurfaceFix&&input.clip==='deal'&&mask?preparePamelaCardSurface({sourceRGB:raw,visibleMask:mask,width:W,height:H,sourceFrameIndex:input.sourceFrame,sourceSha256:options.cardSurfaceFix.sourceSha256}):null;
  const dx=options.retargetSecond&&input.dealOrdinal===1?46:0;
  const removal=input.clip==='deal'&&input.sourceFrame>=118?{x:793+dx,y:1018,width:182,height:87}:null;
  const contact=options.contact?buildPamelaContactLayers(raw,keyed.alpha,W,H,{excludeShadowRects:removal?[removal]:[]}):null;
  const alpha=contact?.foregroundAlpha??keyed.alpha;
  for(let n=0;n<(input.priorCards??0);n++)card(out,n,coverage);
  if(input.clip==='deal'&&input.sourceFrame>=118)card(out,input.dealOrdinal??0,coverage);
  if(contact)for(let p=0;p<W*H;p++){const a=contact.shadowAlpha[p];if(!a)continue;for(let c=0;c<3;c++)out[p*3+c]*=1-a;coverage[p]=a+coverage[p]*(1-a);}
  let extendedMaskPixels=0;
  if(surface&&input.sourceFrame<118){
   // Surface opacity is independent of key colour and is protected after the
   // torso/contact pass. Source fingers remain outside the observed support.
   for(let p=0;p<W*H;p++)if(surface.coverage[p]>0){alpha[p]=Math.max(alpha[p],surface.coverage[p]);if(surface.side.side==='UNKNOWN')for(let c=0;c<3;c++)rgb[p*3+c]=raw[p*3+c];}
   if(surface.side.side!=='UNKNOWN'){
    const q=quad??inferredQuad(contour);if(q)extendedMaskPixels=paint(rgb,surface.side.side==='BACK'?backTexture!:textures[input.dealOrdinal??0],q,undefined,surface.paintMask,raw);
   }
  }else if(!options.cardSurfaceFix&&input.clip==='deal'&&input.sourceFrame>=48&&input.sourceFrame<118&&!(input.sourceFrame>=54&&input.sourceFrame<=73)&&mask){
   const q=quad??inferredQuad(contour);if(q)extendedMaskPixels=paint(rgb,textures[input.dealOrdinal??0],q,undefined,mask,raw);
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const p=y*W+x,i=p*3;let a=alpha[p];if(removal&&x>=removal.x&&x<removal.x+removal.width&&y>=removal.y&&y<removal.y+removal.height)a=0;
   if(a)for(let c=0;c<3;c++)out[i+c]=Math.round(rgb[i+c]*a+out[i+c]*(1-a));coverage[p]=a+coverage[p]*(1-a);
  }
  const rgba=Buffer.alloc(W*H*4);
  for(let p=0;p<W*H;p++){const a=coverage[p];if(a<.004)continue;for(let c=0;c<3;c++)rgba[p*4+c]=Math.round(clamp((out[p*3+c]-stage[p*3+c]*(1-a))/a,0,255));rgba[p*4+3]=Math.round(a*255);}
  const projected=await sharp(rgba,{raw:{width:W,height:H,channels:4}}).resize(1586,1057).extract({left:250,top:0,width:1080,height:1057}).png().toBuffer();
  const portrait=await sharp(portraitStage).composite([{input:projected,left:0,top:80}]).removeAlpha().raw().toBuffer();
  return {native:out,portrait,diagnostics:{extendedMaskPixels,contact:contact?.diagnostics,warp:warp?.diagnostics,cardSurface:surface?{...surface.side,...surface.diagnostics}:null}};
 };
}
