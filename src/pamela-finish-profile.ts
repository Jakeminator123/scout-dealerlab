/** One fixed, scene-bound finish candidate. No geometry, resampling, sharpening,
 * temporal adaptation, or exposure measurement is used to drive this profile. */
export const PAMELA_FINISH_PROFILE={
  id:'dark-room-fixed-finish-candidate-1',
  exposureEV:-.18,
  exposureLumaStart:.02,
  exposureLumaFull:.18,
  edgeRadius:2,
  edgeGreenRemoval:.8,
  edgeGreenAllowance:1,
  partialAlphaReductionMax:.035,
  jacketRoi:{x:500,y:340,width:710,height:710},
  skinGuard:3,
} as const;
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const encoded=(v:number)=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const linearLut=Float32Array.from({length:256},(_,i)=>linear(i/255));
export function finishPamelaFrame(source:Buffer,keyed:{rgb:Buffer;alpha:Float32Array},W:number,H:number){
  if(W!==1762||H!==1174||source.length!==W*H*3||keyed.rgb.length!==source.length||keyed.alpha.length!==W*H)throw Error('Finish profile requires native Pamela RGB24/keyAlpha');
  const cfg=PAMELA_FINISH_PROFILE,n=W*H,rgb=Buffer.from(keyed.rgb),alpha=Float32Array.from(keyed.alpha),edgeMask=new Uint8Array(n),skin=new Uint8Array(n);
  const roi=cfg.jacketRoi;
  for(let y=roi.y-3;y<roi.y+roi.height+3;y++)for(let x=roi.x-3;x<roi.x+roi.width+3;x++){
    const p=y*W+x,i=p*3,r=source[i],g=source[i+1],b=source[i+2];skin[p]=r>95&&r>g*1.12&&g>b*1.07?1:0;
  }
  let edgePixels=0,alphaChanged=0,skinAlphaChanged=0,opaqueAlphaChanged=0,maxAlphaReduction=0,greenUnitsRemoved=0,alphaEquivalentRemoved=0,contourPixelsDropped=0;
  for(let y=roi.y;y<roi.y+roi.height;y++)for(let x=roi.x;x<roi.x+roi.width;x++){
    const p=y*W+x,i=p*3,a=alpha[p];if(a<=.01||Math.max(rgb[i],rgb[i+1],rgb[i+2])>135)continue;
    let nearSkin=false;for(let yy=y-cfg.skinGuard;yy<=y+cfg.skinGuard&&!nearSkin;yy++)for(let xx=x-cfg.skinGuard;xx<=x+cfg.skinGuard;xx++)if(skin[yy*W+xx]){nearSkin=true;break;}
    if(nearSkin)continue;
    let atEdge=false;for(let yy=y-cfg.edgeRadius;yy<=y+cfg.edgeRadius&&!atEdge;yy++)for(let xx=x-cfg.edgeRadius;xx<=x+cfg.edgeRadius;xx++)if(keyed.alpha[yy*W+xx]<.05){atEdge=true;break;}
    if(!atEdge)continue;
    const d=source[i+1]-Math.max(source[i],source[i+2]);if(d<4)continue;
    const spill=Math.max(0,rgb[i+1]-Math.max(rgb[i],rgb[i+2])-cfg.edgeGreenAllowance);
    const removal=Math.round(spill*cfg.edgeGreenRemoval);rgb[i+1]-=removal;greenUnitsRemoved+=removal;
    if(a>.05&&a<.95&&d>12){const reduction=cfg.partialAlphaReductionMax*4*a*(1-a);alpha[p]=Math.max(0,a-reduction);alphaChanged++;alphaEquivalentRemoved+=a-alpha[p];if(a>=.5&&alpha[p]<.5)contourPixelsDropped++;maxAlphaReduction=Math.max(maxAlphaReduction,reduction);}
    edgeMask[p]=255;edgePixels++;
  }
  // Fixed linear-light tone adjustment, with dark clothing protected from crushing.
  // Gain is a function of each pixel's value, not of per-frame averages/exposure.
  const gain=2**cfg.exposureEV;
  for(let p=0;p<n;p++){
    if(alpha[p]<=0)continue;
    const i=p*3,l=.2126*linearLut[rgb[i]]+.7152*linearLut[rgb[i+1]]+.0722*linearLut[rgb[i+2]],g=1+(gain-1)*smooth((l-cfg.exposureLumaStart)/(cfg.exposureLumaFull-cfg.exposureLumaStart));
    for(let c=0;c<3;c++)rgb[i+c]=Math.round(clamp(encoded(linearLut[rgb[i+c]]*g))*255);
    if(alpha[p]!==keyed.alpha[p]){if(skin[p])skinAlphaChanged++;if(keyed.alpha[p]===1)opaqueAlphaChanged++;}
  }
  return {rgb,alpha,edgeMask,diagnostics:{edgePixels,alphaChanged,skinAlphaChanged,opaqueAlphaChanged,maxAlphaReduction,greenUnitsRemoved,alphaEquivalentRemoved,contourPixelsDropped,profileId:cfg.id}};
}
