import {readFile} from 'node:fs/promises';
import {PAMELA_CARD_SOURCE_SHA256} from './pamela-card-surfaces.ts';
import {preparePamelaMesh,projectPamelaMesh, type CardMeshFrame, type MeshPoint} from './pamela-card-mesh.ts';

export type PaperEdgeFrame={sourceFrame:number;frameSha256:string;coreInclude:MeshPoint[][];blurSupport:MeshPoint[][];skinExclude:MeshPoint[][];preserveOriginalEdge?:boolean};
export type PaperEdgeContract={sourceSha256:string;frames:PaperEdgeFrame[]};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
function inside(x:number,y:number,poly:MeshPoint[]){
 let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>y)!==(poly[j][1]>y)&&x<(poly[j][0]-poly[i][0])*(y-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])hit=!hit;return hit;
}
export async function loadPamelaPaperEdges(file:string){
 const c=JSON.parse(await readFile(file,'utf8')) as PaperEdgeContract;
 if(c.sourceSha256!==PAMELA_CARD_SOURCE_SHA256)throw Error('Paper-edge source mismatch');
 return (index:number,map:(p:MeshPoint)=>MeshPoint=p=>p)=>{
  const f=c.frames.find(f=>f.sourceFrame===index);if(!f)return undefined;
  const transform=(polys:MeshPoint[][])=>polys.map(poly=>poly.map(map));
  return {...f,coreInclude:transform(f.coreInclude),blurSupport:transform(f.blurSupport),skinExclude:transform(f.skinExclude)};
 };
}

/** A source-paper colour replacement. Optical edge alpha is not colour confidence.
 * At soft edges subtract the old paper contribution before adding the artwork:
 * observed + alpha * (printedPaper - blankPaper). This avoids double white rims.
 * Only reviewed source support is added; hand/nail exclusion always wins.
 */
export function preparePamelaMeshV7(raw:Buffer,mesh:CardMeshFrame,width:number,height:number,moving:Buffer,shoe:Buffer,nails:MeshPoint[][]=[],edge?:PaperEdgeFrame){
 const core=new Uint8Array(width*height),support=new Uint8Array(width*height),guard=new Uint8Array(width*height);
 const augMoving=Buffer.from(moving),polys=[...(edge?.coreInclude??[]),...(edge?.blurSupport??[])];
 const exclusions=[...nails,...(edge?.skinExclude??[])];
 const points=[...mesh.sections.flatMap(s=>[s.left,s.right]),...polys.flat()];
 const left=Math.max(1,Math.floor(Math.min(...points.map(p=>p[0])))-3),right=Math.min(width-2,Math.ceil(Math.max(...points.map(p=>p[0])))+3);
 const top=Math.max(1,Math.floor(Math.min(...points.map(p=>p[1])))-3),bottom=Math.min(height-2,Math.ceil(Math.max(...points.map(p=>p[1])))+3);
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const p=y*width+x;guard[p]=exclusions.some(poly=>inside(x+.5,y+.5,poly))?1:0;
  if(guard[p]){augMoving[p]=0;continue;}
  core[p]=edge?.coreInclude.some(poly=>inside(x+.5,y+.5,poly))?1:0;
  support[p]=core[p]||edge?.blurSupport.some(poly=>inside(x+.5,y+.5,poly))?1:0;
  if(support[p])augMoving[p]=255;
 }
 const authoredUv=projectPamelaMesh(mesh,width,height);
 const surface=preparePamelaMesh(raw,mesh,width,height,augMoving,shoe,exclusions);
 const opticalAlpha=new Float32Array(width*height),paperRgb=Buffer.alloc(raw.length);
 let added=0,soft=0,protectedPixels=0;
 const paperCandidates:[number,number,number][]=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const p=y*width+x,i=p*3;
  if(!guard[p]&&surface.uv[p*2]>=0&&(core[p]||(surface.paintMask[p]>240&&raw[i]>180&&raw[i+2]>160&&Math.abs(raw[i]-raw[i+2])<38)))paperCandidates.push([raw[i],raw[i+1],raw[i+2]]);
 }
 const white=[0,1,2].map(c=>{const values=paperCandidates.map(v=>v[c]).sort((a,b)=>a-b);return values.length?values[Math.floor((values.length-1)*.8)]:244;});
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const p=y*width+x,i=p*3;
  if(guard[p]||edge?.preserveOriginalEdge){surface.paintMask[p]=0;surface.coverage[p]=0;protectedPixels++;continue;}
  if(surface.uv[p*2]<0||(!surface.paintMask[p]&&!support[p]))continue;
  if(core[p]){opticalAlpha[p]=1;for(let c=0;c<3;c++)paperRgb[i+c]=raw[i+c];if(!moving[p])added++;continue;}
  // Find an observed nearby non-paper colour. No inpainting or hidden hand is inferred.
  let background:number[]|null=null,best=Infinity;
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
   for(const distance of [2,4,6,9,13]){
    const bx=x+dx*distance,by=y+dy*distance;if(bx<0||bx>=width||by<0||by>=height)break;
    const bp=by*width+bx,bi=bp*3;
    if(surface.paintMask[bp]||support[bp]||moving[bp])continue;
    const diff=white.reduce((s,w,c)=>s+(w-raw[bi+c])**2,0);
    if(diff<2500)continue;
    const d=distance*Math.hypot(dx,dy);if(d<best){best=d;background=[raw[bi],raw[bi+1],raw[bi+2]];}break;
   }
  }
  if(background){
   let numerator=0,denominator=0;for(let c=0;c<3;c++){const d=white[c]-background[c];numerator+=(raw[i+c]-background[c])*d;denominator+=d*d;}
   const a=clamp(numerator/Math.max(1,denominator));
   // A poor fit is skin/ambiguous mixture: retain the source instead of painting it.
   const error=Math.sqrt(white.reduce((s,w,c)=>s+(raw[i+c]-(a*w+(1-a)*background![c]))**2,0)/3);
   opticalAlpha[p]=error>32?0:a;
   for(let c=0;c<3;c++)paperRgb[i+c]=Math.round(white[c]);
  }else{
   opticalAlpha[p]=surface.paintMask[p]/255;for(let c=0;c<3;c++)paperRgb[i+c]=raw[i+c];
  }
  if(opticalAlpha[p]>0&&opticalAlpha[p]<.98)soft++;
 }
 return {...surface,opticalAlpha,paperRgb,authoredUv,side:mesh.side,filterRadius:mesh.sourceFrame>=46&&mesh.sourceFrame<=80?1.05:.55,bounds:{left,top,right,bottom},diagnostics:{...surface.diagnostics,reviewedEdgeFrame:edge?.sourceFrame??null,addedCorePixels:added,opticalSoftPixels:soft,protectedPixels,method:'source-paper delta replacement with optical alpha; 9-tap print antialias; neutral edge beyond authored UV; no hidden geometry reconstruction'}};
}

function texel(texture:Buffer,u:number,v:number,c:number){
 const x=clamp(u)*209,y=clamp(v)*293,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
 const a=(iy*210+ix)*3,b=(iy*210+Math.min(209,ix+1))*3,d=(Math.min(293,iy+1)*210+ix)*3,e=(Math.min(293,iy+1)*210+Math.min(209,ix+1))*3;
 return (texture[a+c]*(1-fx)+texture[b+c]*fx)*(1-fy)+(texture[d+c]*(1-fx)+texture[e+c]*fx)*fy;
}
export function paintPamelaMeshV7(out:Buffer,texture:Buffer,raw:Buffer,s:ReturnType<typeof preparePamelaMeshV7>,width:number){
 const {left,top,right,bottom}=s.bounds;
 const uvAt=(p:number,c:number,fallback:number)=>s.uv[p*2]>=0?s.uv[p*2+c]:fallback;
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const p=y*width+x,a=s.opticalAlpha[p];if(a<=0)continue;
  const i=p*3,u=s.uv[p*2],v=s.uv[p*2+1];
  const ux=(uvAt(p+1,0,u)-uvAt(p-1,0,u))/2,uy=(uvAt(p+width,0,u)-uvAt(p-width,0,u))/2;
  const vx=(uvAt(p+1,1,v)-uvAt(p-1,1,v))/2,vy=(uvAt(p+width,1,v)-uvAt(p-width,1,v))/2;
  for(let c=0;c<3;c++){
   let ink=0;for(const dx of [-s.filterRadius,0,s.filterRadius])for(const dy of [-s.filterRadius,0,s.filterRadius]){
    let su=u+dx*ux+dy*uy,sv=v+dx*vx+dy*vy;if(s.textureRotate180){su=1-su;sv=1-sv;}ink+=texel(texture,su,sv,c)/9;
   }
   if(s.authoredUv[p*2]<0)ink=s.side==='BACK'?[10,11,13][c]:[247,244,233][c];
   // Work in the keyed colour basis; a raw green-lit white cannot be subtracted
   // from an already despilled pixel. Keep the inferred background nonnegative.
   const keyRatio=raw[i+c]>0?out[i+c]/raw[i+c]:1;
   const white=Math.min(s.paperRgb[i+c]*keyRatio,out[i+c]/a),printed=ink*white/244;
   out[i+c]=Math.round(clamp(out[i+c]+a*(printed-white),0,255));
  }
 }
}
