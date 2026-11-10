/** Coverage is separate from the brightness of opaque paper or its hand shadow.
 * This bounded chroma-source estimator never invents paper outside a supplied
 * source support, and never changes protected foreground pixels. */
export function paperCoverage(raw:Buffer,support:Buffer,protectedPixels:Buffer,width:number,height:number){
 if(raw.length!==width*height*3||support.length!==width*height||protectedPixels.length!==width*height)throw Error('Native paper coverage dimensions required');
 const result=Buffer.alloc(width*height);let opaque=0,edge=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=y*width+x;if(!support[p]||protectedPixels[p])continue;
  const j=p*3,r=raw[j],g=raw[j+1],b=raw[j+2];
  // Neutral shaded paper remains opaque. The former intensity-based alpha
  // incorrectly removed green from such pixels and made its shadow magenta.
  if(g-Math.max(r,b)<20){result[p]=255;opaque++;continue;}
  let br=0,bb=0,n=0,white=0;
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;
   const q=yy*width+xx,k=q*3,rr=raw[k],gg=raw[k+1],bbb=raw[k+2];
   if(!support[q]&&!protectedPixels[q]&&gg-Math.max(rr,bbb)>65){br+=rr;bb+=bbb;n++;}
   if(support[q]&&!protectedPixels[q]&&gg-Math.max(rr,bbb)<15)white=Math.max(white,(rr+bbb)/2);
  }
  if(n&&white>100){const background=(br+bb)/(2*n);result[p]=Math.round(Math.max(0,Math.min(1,((r+b)/2-background)/Math.max(20,white-background)))*255);}
  else result[p]=support[p];
  edge++;
 }
 return {coverage:result,opaquePixels:opaque,edgePixels:edge};
}
