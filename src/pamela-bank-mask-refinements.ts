/** Source-bound paper ownership fixes. No physical-side or material decisions. */
export const PAMELA_BANK_MASK_REFINEMENT_SOURCES={
 'C1-P7':'b37dbc6cafa99378786eff51ac1e8cb69c3bb01824b2107d390ddd7032a4620e',
 'C2-P6':'daf180780c20f398f123c30e966c1ab03e1698556ffd5dbfd2221da35f0538f5',
} as const;
export type PamelaBankMaskRefinementId=keyof typeof PAMELA_BANK_MASK_REFINEMENT_SOURCES;
export type PamelaBankMaskRefinementInput={id:PamelaBankMaskRefinementId;sourceSha256:string;frame:number;sourceRgb:Uint8Array;coverage:Uint8Array;guard:Uint8Array;previousCardCoverage?:Uint8Array};
const W=1762,H=1174,N=W*H;
export function refinePamelaBankPaperMask(input:PamelaBankMaskRefinementInput){
 const {id,sourceSha256,frame,sourceRgb:raw,coverage:old,guard,previousCardCoverage:prior}=input;
 if(!(id in PAMELA_BANK_MASK_REFINEMENT_SOURCES)||sourceSha256!==PAMELA_BANK_MASK_REFINEMENT_SOURCES[id]||!Number.isInteger(frame)||frame<0||frame>=360)throw Error('Bank mask refinement source/frame mismatch');
 if(raw.length!==N*3||old.length!==N||guard.length!==N||(prior&&prior.length!==N)||(id==='C2-P6'&&!prior))throw Error('Native dimensions and C2 prior-card protection required');
 const coverage=new Uint8Array(old);let addedPixels=0,removedPixels=0,adjustedPixels=0;
 let l=W,t=H,r=-1,b=-1;for(let p=0;p<N;p++)if(old[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 // Existing P7 coverage can contain the grey shoe facet beyond the free tip.
 // This only reduces neutral-grey ownership in the free lower45% of the
 // raised card's current bounds. The grip and warm/green-reflected shadowed
 // paper are excluded; the candidate is not a general brightness key.
 if(id==='C1-P7'&&frame>=78&&frame<=107){
  for(let y=Math.ceil(t+(b-t)*.55);y<=b;y++)for(let x=l;x<=r;x++){const p=y*W+x;if(!old[p]||guard[p]||prior?.[p])continue;const k=p*3,min=Math.min(raw[k],raw[k+1],raw[k+2]),max=Math.max(raw[k],raw[k+1],raw[k+2]);if(max-min>24||max>=160)continue;const a=Math.max(0,Math.min(1,(max-120)/40));coverage[p]=Math.min(old[p],Math.round(old[p]*a));}
 }
 // Recover only near-mask, neutral source paper connected to existing paper.
 // The current hand and shoe guard and prior card are absolute exclusions.
 // Eight-connected distance is bounded; no unconstrained white-pixel flood.
 if(id==='C2-P6'&&frame>=106&&frame<=128&&r>=l){
  const x0=Math.max(0,l-10),x1=Math.min(W-1,r+10),y0=Math.max(0,t-10),y1=Math.min(H-1,b+10),bw=x1-x0+1,bh=y1-y0+1,seen=new Uint8Array(bw*bh),distance=new Uint8Array(bw*bh),queue:number[]=[];
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const p=y*W+x,k=(y-y0)*bw+x-x0;if(old[p]&&!guard[p]&&!prior![p]){seen[k]=1;queue.push(k);}}
  for(let i=0;i<queue.length;i++){
   const q=queue[i],x=q%bw,y=Math.floor(q/bw);if(distance[q]>=10)continue;
   for(let yy=Math.max(0,y-1);yy<=Math.min(bh-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(bw-1,x+1);xx++){
    const n=yy*bw+xx;if(seen[n])continue;seen[n]=1;const p=(yy+y0)*W+xx+x0,k=p*3,red=raw[k],green=raw[k+1],blue=raw[k+2],min=Math.min(red,green,blue),max=Math.max(red,green,blue);
    if(guard[p]||prior![p]||min<170||max-min>35)continue;
    distance[n]=distance[q]+1;queue.push(n);coverage[p]=Math.max(old[p],Math.round(255*Math.min(1,(min-170)/50)));
   }
  }
 }
 l=W;t=H;r=-1;b=-1;
 for(let p=0;p<N;p++){
  if(coverage[p]!==old[p]){if(guard[p]||prior?.[p])throw Error('Mask refinement touched protected foreground');if(coverage[p]>old[p])addedPixels++;else if(!coverage[p])removedPixels++;else adjustedPixels++;}
  if(coverage[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 }
 return{coverage,bounds:r<0?{left:0,top:0,width:1,height:1}:{left:l,top:t,width:r-l+1,height:b-t+1},addedPixels,removedPixels,adjustedPixels};
}
