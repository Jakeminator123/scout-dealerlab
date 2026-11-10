/** Native source-pixel card surfaces. Hidden C1 is never painted; UV is authored. */
export type Point=[number,number];
export type Quad=[Point,Point,Point,Point];
export type Bounds={left:number;top:number;width:number;height:number};
export const W=1762,H=1174;
export const DIAGNOSTICS=[['AC','KH'],['2C','QD'],['3S','JH'],['4C','10D'],['5S','9H'],['6C','8D'],['7S','AS']] as const;
export const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function quadFromMask(mask:Buffer,width=W):Quad{
 let best=[Infinity,-Infinity,-Infinity,Infinity],q:Quad=[[0,0],[0,0],[0,0],[0,0]];
 for(let p=0;p<mask.length;p++)if(mask[p]>=200){const x=p%width,y=Math.floor(p/width),values=[x+y,x-y,x+y,x-y];for(let i=0;i<4;i++)if(i===0||i===3?values[i]<best[i]:values[i]>best[i]){best[i]=values[i];q[i]=[x,y];}}
 if(!Number.isFinite(best[0]))throw Error('Empty native mask');return q;
}
export function uvAt(q:Quad,x:number,y:number):Point{
 // Inverse bilinear map; no nonlocal warp or change to source pixels.
 let u=.5,v=.5;for(let i=0;i<10;i++){const ax=q[1][0]-q[0][0],ay=q[1][1]-q[0][1],bx=q[3][0]-q[0][0],by=q[3][1]-q[0][1],cx=q[0][0]-q[1][0]+q[2][0]-q[3][0],cy=q[0][1]-q[1][1]+q[2][1]-q[3][1];const ex=q[0][0]+ax*u+bx*v+cx*u*v-x,ey=q[0][1]+ay*u+by*v+cy*u*v-y,duX=ax+cx*v,duY=ay+cy*v,dvX=bx+cx*u,dvY=by+cy*u,det=duX*dvY-duY*dvX;if(Math.abs(det)<1e-8)return[-1,-1];u-=(ex*dvY-ey*dvX)/det;v-=(ey*duX-ex*duY)/det;}return[u,v];
}
export function inside(q:Quad,x:number,y:number){const[u,v]=uvAt(q,x,y);return u>=0&&u<=1&&v>=0&&v<=1;}
export function diagnosticSvg(value:string,instance:string){const red=/[HD]$/.test(value),rank=value.slice(0,-1),suit=({C:'♣',D:'♦',H:'♥',S:'♠'} as Record<string,string>)[value.at(-1)!],ink=red?'#b81025':'#101a27';return `<svg xmlns="http://www.w3.org/2000/svg" width="252" height="352" viewBox="0 0 252 352"><rect width="252" height="352" fill="white"/><g fill="${ink}" font-family="Arial" font-weight="bold"><text x="12" y="46" font-size="42">${rank}</text><text x="12" y="80" font-size="36">${suit}</text><text x="126" y="207" text-anchor="middle" font-size="92">${suit}</text><g transform="translate(252 352) rotate(180)"><text x="12" y="46" font-size="42">${rank}</text><text x="12" y="80" font-size="36">${suit}</text></g><text x="126" y="266" text-anchor="middle" font-size="15">${instance} · DEMO</text></g></svg>`;}
export function unionBounds(a:Bounds,b:Bounds,pad=8):Bounds{const left=Math.max(0,Math.min(a.left,b.left)-pad),top=Math.max(0,Math.min(a.top,b.top)-pad);return{left,top,width:Math.min(W,Math.max(a.left+a.width,b.left+b.width)+pad)-left,height:Math.min(H,Math.max(a.top+a.height,b.top+b.height)+pad)-top};}
export function alphaChannel(rgba:Buffer){if(rgba.length!==W*H*4)throw Error('Native RGBA required');const a=Buffer.alloc(W*H);for(let p=0;p<a.length;p++)a[p]=rgba[p*4+3];return a;}
export function sourcePaperMask(raw:Buffer,b:Bounds){const mask=Buffer.alloc(W*H);for(let y=b.top;y<b.top+b.height;y++)for(let x=b.left;x<b.left+b.width;x++){const p=y*W+x,j=p*3,r=raw[j],g=raw[j+1],bb=raw[j+2];if(Math.min(r,bb)>95&&Math.abs(r-bb)<32&&g-Math.max(r,bb)<36&&r-g<20)mask[p]=255;}return mask;}

/** Distance in native pixels: positive inside, negative outside. */
export function quadDistance(q:Quad,x:number,y:number){let d=Infinity;for(let k=0;k<4;k++){const a=q[k],b=q[(k+1)%4],dx=b[0]-a[0],dy=b[1]-a[1];d=Math.min(d,(dx*(y-a[1])-dy*(x-a[0]))/Math.hypot(dx,dy));}return d;}

export type SurfaceResult={after:Buffer;ink:[Buffer,Buffer];coverage:[Buffer,Buffer];lighting:[Buffer,Buffer];uv:[Buffer,Buffer];stats:{changedPixels:number[];outsidePaperChanges:number;overlapPixels:number;shadowGuardPixels:number;opaqueDarkPaperPixels:number;protectedNonPaperPixels:number}};
/** Conservative observed interiors. The original neutral plate carries the entire
 * outer contour and the uncertain two-pixel overlap seam. Materials are ink-only
 * RGBA overlays; white material leaves the plate EXACTLY unchanged. No inferred
 * hidden C1, background reconstruction, opacity-from-brightness or body warp. */
export function renderSurfaces(raw:Buffer,b:Bounds,quads:{c1:Quad;c2:Quad},textures:[Buffer,Buffer],protectedPixels?:Buffer):SurfaceResult{
 if(raw.length!==W*H*3||textures.some(t=>t.length!==252*352*3))throw Error('Native RGB / 252x352 RGB textures required');
 const mask=sourcePaperMask(raw,b),after=Buffer.from(raw),ink:[Buffer,Buffer]=[Buffer.alloc(W*H*4),Buffer.alloc(W*H*4)],coverage:[Buffer,Buffer]=[Buffer.alloc(W*H),Buffer.alloc(W*H)],lighting:[Buffer,Buffer]=[Buffer.alloc(W*H*3),Buffer.alloc(W*H*3)],uv:[Buffer,Buffer]=[Buffer.alloc(b.width*b.height*8,255),Buffer.alloc(b.width*b.height*8,255)];
 const stats={changedPixels:[0,0],outsidePaperChanges:0,overlapPixels:0,shadowGuardPixels:0,opaqueDarkPaperPixels:0,protectedNonPaperPixels:0};
 for(let y=b.top;y<b.top+b.height;y++)for(let x=b.left;x<b.left+b.width;x++){
  const p=y*W+x,j=p*3;if(!mask[p]||protectedPixels?.[p]){stats.protectedNonPaperPixels++;continue;}
  const dist=quadDistance(quads.c2,x,y);if(Math.abs(dist)<=2){stats.shadowGuardPixels++;continue;}
  const c:0|1=dist>2?1:0,q=c?quads.c2:quads.c1,[u,v]=uvAt(q,x,y);
  // Keep the source outer contour unmodified and avoid boundary interpolation.
  if(u<0||u>1||v<0||v>1||quadDistance(q,x,y)<1)continue;
  let safe=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!mask[(y+dy)*W+x+dx]||protectedPixels?.[(y+dy)*W+x+dx])safe=false;if(!safe)continue;
  coverage[c][p]=255;for(let ch=0;ch<3;ch++)lighting[c][j+ch]=raw[j+ch];
  if(Math.min(raw[j],raw[j+1],raw[j+2])<190)stats.opaqueDarkPaperPixels++;
  const k=((y-b.top)*b.width+x-b.left)*8;uv[c].writeFloatLE(u,k);uv[c].writeFloatLE(v,k+4);
  const tx=clamp(u*251,0,251),ty=clamp(v*351,0,351),x0=Math.floor(tx),y0=Math.floor(ty),x1=Math.min(251,x0+1),y1=Math.min(351,y0+1),fx=tx-x0,fy=ty-y0;
  let changed=false;for(let ch=0;ch<3;ch++){
   const t=textures[c],sample=(xx:number,yy:number)=>t[(yy*252+xx)*3+ch],v0=sample(x0,y0)*(1-fx)+sample(x1,y0)*fx,v1=sample(x0,y1)*(1-fx)+sample(x1,y1)*fx,m=v0*(1-fy)+v1*fy,out=Math.round(raw[j+ch]*m/255);
   after[j+ch]=out;ink[c][p*4+ch]=out;changed ||=out!==raw[j+ch];
  }
  if(changed){ink[c][p*4+3]=255;stats.changedPixels[c]++;}
 }
 for(let p=0;p<W*H;p++){if(coverage[0][p]&&coverage[1][p])stats.overlapPixels++;if((after[p*3]!==raw[p*3]||after[p*3+1]!==raw[p*3+1]||after[p*3+2]!==raw[p*3+2])&&!mask[p])stats.outsidePaperChanges++;}
 return{after,ink,coverage,lighting,uv,stats};
}
