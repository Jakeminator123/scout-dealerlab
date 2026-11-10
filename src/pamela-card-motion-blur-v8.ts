import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createPamelaCardContactV6Renderer,type PamelaCardContactV4Frame} from './pamela-card-contact-v6.ts';
import {loadPamelaMesh,projectPamelaMesh,preparePamelaMesh,type CardMeshFrame,type MeshPoint} from './pamela-card-mesh.ts';
import {PAMELA_SG_BACK_SVG,PAMELA_CARD_SOURCE_SHA256} from './pamela-card-surfaces.ts';

// A bounded, local presentation experiment. All geometry and timing remain source-bound.
export const PAMELA_V8_PARAMETERS={width:1762,height:1174,sourceStart:48,sourceEndInclusive:84,
  shutterFraction:.20,maxPrintBlurPixels:9,minimumPrintBlurPixels:3,crossBlurPixels:1,
  samplesAlong:21,samplesAcross:3,observedSupportRadius:5,preserveOriginalFrame:60,
  method:'convex local paper/background compositing; source-observed silhouette; directional print integration; separate paper/skin/nail masks'} as const;
const {width:W,height:H}=PAMELA_V8_PARAMETERS;
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
type EdgeFrame={sourceFrame:number;coreInclude:MeshPoint[][];blurSupport:MeshPoint[][];skinExclude:MeshPoint[][];preserveOriginalEdge?:boolean};
function inside(x:number,y:number,polygon:MeshPoint[]){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)if((polygon[i][1]>y)!==(polygon[j][1]>y)&&x<(polygon[j][0]-polygon[i][0])*(y-polygon[i][1])/(polygon[j][1]-polygon[i][1])+polygon[i][0])yes=!yes;return yes;}
const inPolys=(x:number,y:number,polys:MeshPoint[][])=>polys.some(poly=>inside(x+.5,y+.5,poly));
function strongSkin(raw:Buffer,p:number){const i=p*3,r=raw[i],g=raw[i+1],b=raw[i+2];return r>95&&r-g>28&&r-b>48&&g-b>12;}
function likelySkin(raw:Buffer,p:number){const i=p*3,r=raw[i],g=raw[i+1],b=raw[i+2];return r>95&&r>g*1.12&&g>b*1.07;}
function meshPoint(mesh:CardMeshFrame,u:number,v:number):MeshPoint{
  const e=Math.max(1,mesh.sections.findIndex(s=>s.v>=v)),a=mesh.sections[e-1],b=mesh.sections[e];
  const t=(v-a.v)/(b.v-a.v),left=[a.left[0]+(b.left[0]-a.left[0])*t,a.left[1]+(b.left[1]-a.left[1])*t],right=[a.right[0]+(b.right[0]-a.right[0])*t,a.right[1]+(b.right[1]-a.right[1])*t];
  return [left[0]+(right[0]-left[0])*u,left[1]+(right[1]-left[1])*u];
}
function texel(texture:Buffer,u:number,v:number,c:number){
 const x=clamp(u)*209,y=clamp(v)*293,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const at=(a:number,b:number)=>texture[(Math.min(293,b)*210+Math.min(209,a))*3+c];
 return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
}
function nearestMap(seed:Uint8Array,left:number,top:number,right:number,bottom:number){
 const w=right-left+1,h=bottom-top+1,nearest=new Int32Array(w*h),distance=new Uint16Array(w*h),queue=new Int32Array(w*h);nearest.fill(-1);distance.fill(65535);let tail=0;
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const p=y*W+x,j=(y-top)*w+x-left;if(seed[p]){nearest[j]=p;distance[j]=0;queue[tail++]=j;}}
 for(let head=0;head<tail;head++){const j=queue[head],x=j%w,y=Math.floor(j/w);for(const next of [x>0?j-1:-1,x+1<w?j+1:-1,y>0?j-w:-1,y+1<h?j+w:-1])if(next>=0&&nearest[next]<0){nearest[next]=nearest[j];distance[next]=distance[j]+1;queue[tail++]=next;}}
 return {nearest,distance,index:(x:number,y:number)=>(y-top)*w+x-left};
}

export async function createPamelaCardMotionBlurV8Renderer(mode:'print-only'|'convex-coverage'='print-only'){
 const v6=await createPamelaCardContactV6Renderer();
 const meshAt=await loadPamelaMesh('runs/20261109-pamela-shoe-v6-audit/card-mesh.json');
 const edgeContract=JSON.parse(await readFile('runs/20261109-pamela-v7-edge-audit/paper-edge-contract.json','utf8'));
 if(edgeContract.sourceSha256!==PAMELA_CARD_SOURCE_SHA256)throw Error('V8 paper source mismatch');
 const back=await sharp(Buffer.from(PAMELA_SG_BACK_SVG)).removeAlpha().raw().toBuffer();
 const front=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><rect width="210" height="294" fill="#f7f4e9"/><g fill="#161b20" font-family="Arial,sans-serif" text-anchor="middle"><text x="30" y="52" font-size="52" font-weight="bold">A</text><text x="30" y="94" font-size="43">♠</text><text x="105" y="187" font-size="88">♠</text><g transform="translate(210 294) rotate(180)"><text x="30" y="52" font-size="52" font-weight="bold">A</text><text x="30" y="94" font-size="43">♠</text></g></g></svg>')).removeAlpha().raw().toBuffer();
 return async(input:PamelaCardContactV4Frame)=>{
  if(input.clip!=='deal'||input.dealOrdinal!==0||input.sourceFrame<48||input.sourceFrame>84||!input.mask||!input.shoeMask)throw Error('V8 only supports first-card source48..84 with measured masks');
  const before=await v6(input),sourceScene=await v6({...input,clip:'approach'}),mesh=meshAt(input.sourceFrame);
  if(!mesh)throw Error('V8 missing measured mesh');
  const edge=edgeContract.frames.find((f:EdgeFrame)=>f.sourceFrame===input.sourceFrame) as EdgeFrame|undefined;
  const points=[...mesh.sections.flatMap(s=>[s.left,s.right]),...(edge?.blurSupport??[]).flat()];
  const left=Math.max(1,Math.floor(Math.min(...points.map(p=>p[0])))-24),right=Math.min(W-2,Math.ceil(Math.max(...points.map(p=>p[0])))+24);
  const top=Math.max(1,Math.floor(Math.min(...points.map(p=>p[1])))-24),bottom=Math.min(H-2,Math.ceil(Math.max(...points.map(p=>p[1])))+24);
  const raw=input.raw,uv=projectPamelaMesh(mesh,W,H),seed=new Uint8Array(W*H),support=new Uint8Array(W*H),skin=new Uint8Array(W*H),nail=new Uint8Array(W*H),core=new Uint8Array(W*H);
  const v6Surface=preparePamelaMesh(raw,mesh,W,H,input.mask,input.shoeMask);
  const alpha=new Float32Array(W*H),safeSkin=new Uint8Array(W*H),native=Buffer.from(before.native);
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const p=y*W+x;core[p]=inPolys(x,y,edge?.coreInclude??[])?1:0;nail[p]=inPolys(x,y,edge?.skinExclude??[])?1:0;
   const observedEdge=inPolys(x,y,edge?.blurSupport??[]),manualPaper=core[p]||observedEdge&&!nail[p];
   // Warm source-paper blur is not automatically a finger. Explicitly reviewed
   // paper support is uncertain paper, while safe-skin measurements exclude it.
   safeSkin[p]=strongSkin(raw,p)&&!manualPaper?1:0;skin[p]=safeSkin[p]||(!manualPaper&&likelySkin(raw,p))?1:0;
   if(input.mask[p]||uv[p*2]>=0)seed[p]=1;
  }
  const nearest=nearestMap(seed,left,top,right,bottom);
  const whiteSamples:number[][]=[[],[],[]];
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const p=y*W+x,i=p*3,d=nearest.distance[nearest.index(x,y)];
   if(skin[p]||nail[p])continue;
   const allowed=d<=PAMELA_V8_PARAMETERS.observedSupportRadius||inPolys(x,y,edge?.blurSupport??[]);
   const reviewed=inPolys(x,y,edge?.blurSupport??[]);
   const neutral=raw[i]>75&&raw[i+2]>65&&raw[i]-raw[i+2]<(reviewed?125:55)&&raw[i]-raw[i+1]<(reviewed?95:40);
   support[p]=allowed&&neutral?1:0;
   if(support[p]&&seed[p]&&raw[i]>175&&raw[i+2]>145&&Math.abs(raw[i]-raw[i+2])<45)for(let c=0;c<3;c++)whiteSamples[c].push(raw[i+c]);
  }
  const white=whiteSamples.map(a=>{a.sort((a,b)=>a-b);return a[Math.floor((a.length-1)*.78)]??225;});
  const texture=mesh.side==='BACK'?back:front,neutralPaper=mesh.side==='BACK'?[10,11,13]:[247,244,233];
  const textureAt=(x:number,y:number,c:number)=>{
   const ix=Math.round(x),iy=Math.round(y);if(ix<left||ix>right||iy<top||iy>bottom)return neutralPaper[c];
   const p=iy*W+ix;if(uv[p*2]<0)return neutralPaper[c];
   let u=uv[p*2],v=uv[p*2+1];if(mesh.textureRotate180){u=1-u;v=1-v;}return texel(texture,u,v,c);
  };
  const prev=meshAt(input.sourceFrame-1)??mesh,next=meshAt(input.sourceFrame+1)??mesh;
  let area=0;const polygon=[...mesh.sections.map(s=>s.left),...mesh.sections.toReversed().map(s=>s.right)];
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)area+=polygon[j][0]*polygon[i][1]-polygon[i][0]*polygon[j][1];
  const a=meshPoint(mesh,.5,0),b=meshPoint(mesh,.5,1),thickness=Math.abs(area/2)/Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1]));
  const printStrength=input.sourceFrame===60?0:clamp((thickness-4)/6);
  let paperPixels=0,uncertainPixels=0,changedSafeSkin=0,changedOutsideSupport=0,changedHead=0,restoredGuardPixels=0;
  let blurLengthSum=0,blurCount=0;
  const blurredPrint=(p:number,x:number,y:number)=>{
   const near=uv[p*2]>=0?p:nearest.nearest[nearest.index(x,y)],u=near>=0&&uv[near*2]>=0?uv[near*2]:.5,v=near>=0&&uv[near*2]>=0?uv[near*2+1]:.5;
   const pa=meshPoint(prev,u,v),pb=meshPoint(next,u,v),vx=(pb[0]-pa[0])/2,vy=(pb[1]-pa[1])/2,speed=Math.hypot(vx,vy);
   const length=clamp(speed*PAMELA_V8_PARAMETERS.shutterFraction,PAMELA_V8_PARAMETERS.minimumPrintBlurPixels,PAMELA_V8_PARAMETERS.maxPrintBlurPixels),dx=speed>0?vx/speed:1,dy=speed>0?vy/speed:0;
   blurLengthSum+=length;blurCount++;
   const i=p*3,light=clamp((raw[i]+raw[i+1]+raw[i+2])/(3*244),.65,1.05),ink=[0,0,0];
   for(let j=0;j<PAMELA_V8_PARAMETERS.samplesAlong;j++)for(let k=-1;k<=1;k++){
    const t=(j/(PAMELA_V8_PARAMETERS.samplesAlong-1)-.5)*length,perp=k*PAMELA_V8_PARAMETERS.crossBlurPixels;
    for(let c=0;c<3;c++)ink[c]+=textureAt(x+dx*t-dy*perp,y+dy*t+dx*perp,c)*light/(PAMELA_V8_PARAMETERS.samplesAlong*3);
   }
   return ink;
  };
  // Convex compositing uses source-observed paper alpha and an actual nearby scene
  // sample. Never subtract a green-lit raw paper colour from a keyed RGB value.
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const p=y*W+x,i=p*3;
   if(mode==='print-only'){
    if(skin[p]||nail[p]){for(let c=0;c<3;c++)native[i+c]=sourceScene.native[i+c];restoredGuardPixels++;continue;}
    if(!v6Surface.paintMask[p])continue;
    const opacity=v6Surface.paintMask[p]/255;alpha[p]=opacity*printStrength;
    if(printStrength===0){for(let c=0;c<3;c++)native[i+c]=sourceScene.native[i+c];continue;}
    const ink=blurredPrint(p,x,y);paperPixels++;
    for(let c=0;c<3;c++)native[i+c]=Math.round(clamp(sourceScene.native[i+c]*(1-opacity*printStrength)+ink[c]*opacity*printStrength,0,255));
    continue;
   }
   if(seed[p])for(let c=0;c<3;c++)native[i+c]=sourceScene.native[i+c];
   if(skin[p]||nail[p]){for(let c=0;c<3;c++)native[i+c]=sourceScene.native[i+c];restoredGuardPixels++;continue;}
   if(!support[p])continue;
   if(printStrength===0){for(let c=0;c<3;c++)native[i+c]=sourceScene.native[i+c];continue;}
   let donors:{p:number;a:number;score:number}[]=[];
   for(let k=0;k<16;k++){
    const angle=k*Math.PI/8,dx=Math.cos(angle),dy=Math.sin(angle);
    for(const r of [3,5,8,12,18,24]){
     const xx=Math.round(x+dx*r),yy=Math.round(y+dy*r);if(xx<left||xx>right||yy<top||yy>bottom)break;
     const q=yy*W+xx,j=q*3;if(support[q]||seed[q])continue;
     let numerator=0,denominator=0;for(let c=0;c<3;c++){const d=white[c]-raw[j+c];numerator+=(raw[i+c]-raw[j+c])*d;denominator+=d*d;}
     if(denominator<5000)continue;const aa=clamp(numerator/denominator);
     const error=Math.sqrt(white.reduce((s,w,c)=>s+(raw[i+c]-(w*aa+raw[j+c]*(1-aa)))**2,0)/3);
     donors.push({p:q,a:aa,score:error+r*.32});break;
    }
   }
   donors.sort((a,b)=>a.score-b.score);donors=donors.slice(0,3);
   let opacity=0,background=[0,0,0];
   if(donors.length){
    let sum=0,asum=0;for(const donor of donors){const weight=1/(1+donor.score*donor.score);sum+=weight;asum+=weight*donor.a;for(let c=0;c<3;c++)background[c]+=sourceScene.native[donor.p*3+c]*weight;}
    opacity=asum/sum;for(let c=0;c<3;c++)background[c]/=sum;
   }else if(seed[p]){opacity=1;background=Array.from(sourceScene.native.subarray(i,i+3));}
   else{uncertainPixels++;continue;}
   // High-confidence observed paper is opaque. A poor chromatic fit stays source.
   if(!core[p]&&donors[0]?.score>40){uncertainPixels++;continue;}
   if(seed[p]&&raw[i]>white[0]*.90&&raw[i+2]>white[2]*.88)opacity=1;
   opacity=clamp(opacity);if(opacity<.06)continue;alpha[p]=opacity;paperPixels++;
   const ink=blurredPrint(p,x,y);
   for(let c=0;c<3;c++){
    const corrected=ink[c]*opacity+background[c]*(1-opacity);
    native[i+c]=Math.round(clamp(sourceScene.native[i+c]*(1-printStrength)+corrected*printStrength,0,255));
   }
  }
  let safeSkinPixels=0,safeSkinChangedSource=0;
  for(let p=0;p<W*H;p++){
   const i=p*3,changed=native[i]!==before.native[i]||native[i+1]!==before.native[i+1]||native[i+2]!==before.native[i+2];
   if(safeSkin[p]){safeSkinPixels++;if(changed)changedSafeSkin++;if(native[i]!==raw[i]||native[i+1]!==raw[i+1]||native[i+2]!==raw[i+2])safeSkinChangedSource++;}
   if(changed&&!support[p]&&!skin[p]&&!nail[p]&&!seed[p])changedOutsideSupport++;
   if(changed&&p<W*480)changedHead++;
  }
  if(changedHead||changedOutsideSupport||safeSkinChangedSource)throw Error(`V8 protection failed: head=${changedHead},outside=${changedOutsideSupport},safeSkinSource=${safeSkinChangedSource}`);
  return {native,before:before.native,sourceScene:sourceScene.native,masks:{paper:Buffer.from(alpha.map(v=>v*255)),skin:Buffer.from(skin.map(v=>v*255)),nail:Buffer.from(nail.map(v=>v*255)),safeSkin:Buffer.from(safeSkin.map(v=>v*255))},diagnostics:{sourceFrame:input.sourceFrame,mode,side:mesh.side,thickness,printStrength,paperPixels,uncertainPixels,restoredGuardPixels,safeSkinPixels,changedSafeSkin,safeSkinChangedSource,changedOutsideSupport,changedHead,meanPrintBlurPixels:blurLengthSum/Math.max(1,blurCount),whiteReference: white,maskLimits:'Source RGB classifier plus manually observed guards on annotated frames. Not a complete semantic hand matte; uncertain contact pixels require visual review.'}};
 };
}
