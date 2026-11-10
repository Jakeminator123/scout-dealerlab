import {keyPamelaFrame} from './pamela-key.ts';

/** Explicit semantic paper support augments the chroma key. A white prop can be
 * green-lit while still completely opaque; chromatic confidence is not coverage.
 * Inputs must be visible paper only, with foreground hand/shoe exclusions applied.
 */
export function keyPamelaFrameWithPaper(source:Buffer,width:number,height:number,paperCoverage:Buffer,unprintedSource?:Buffer){
 if(paperCoverage.length!==width*height)throw Error('Native semantic paper coverage required');
 if(unprintedSource&&unprintedSource.length!==source.length)throw Error('Unprinted reference must match the native RGB source');
 const keyed=keyPamelaFrame(source,width,height);
 const reference=unprintedSource??source,referenceKey=unprintedSource?keyPamelaFrame(reference,width,height):keyed;
 let restoredOpaquePixels=0,changedOutsidePaperPixels=0,preservedMixedEdgePixels=0;
 for(let p=0;p<paperCoverage.length;p++){
  const a=paperCoverage[p]/255;if(!a)continue;
  const j=p*3,r=reference[j],g=reference[j+1],b=reference[j+2];let mixedEdge=false;
  // A structural contour is not subpixel opacity ground truth. Strong green
  // mixing immediately beside the backing screen keeps the measured matte.
  // Use the unprinted plate so black/red artwork cannot alter classification.
  if(g-Math.max(r,b)>25&&Math.min(r,b)<210){
   const x=p%width,y=Math.floor(p/width);
   for(let yy=Math.max(0,y-3);yy<=Math.min(height-1,y+3)&&!mixedEdge;yy++)for(let xx=Math.max(0,x-3);xx<=Math.min(width-1,x+3);xx++){
    const q=yy*width+xx,k=q*3;
    if(!paperCoverage[q]&&reference[k+1]>150&&reference[k+1]-Math.max(reference[k],reference[k+2])>80){mixedEdge=true;break;}
   }
  }
  if(mixedEdge){
   keyed.alpha[p]=referenceKey.alpha[p];
   if(unprintedSource)for(let c=0;c<3;c++){
    // Recover the authored ink multiplier from its coverage-weighted source
    // rendering, then apply it once to the despilled foreground estimate.
    const ratio=reference[j+c]?source[j+c]/reference[j+c]:1,factor=Math.max(0,Math.min(1,(ratio-1+a)/a));
    keyed.rgb[j+c]=Math.round(referenceKey.rgb[j+c]*factor);
   }
   preservedMixedEdgePixels++;continue;
  }
  if(a===1){
   if(keyed.alpha[p]!==1||[0,1,2].some(c=>keyed.rgb[p*3+c]!==source[p*3+c]))restoredOpaquePixels++;
   keyed.alpha[p]=1;for(let c=0;c<3;c++)keyed.rgb[p*3+c]=source[p*3+c];
  }else if(a>keyed.alpha[p]){
   // Source RGB at a mixed edge includes the backing screen. Keep the existing
   // chroma key's despilled foreground estimate while repairing coverage only.
   keyed.alpha[p]=a;
  }
 }
 return {...keyed,verification:{restoredOpaquePixels,changedOutsidePaperPixels,preservedMixedEdgePixels}};
}
