import {retargetPamelaC2Frame,PAMELA_C2_SOURCE_SHA256,type PamelaC2RetargetInput} from './pamela-c2-retarget.ts';
export {PAMELA_C2_SOURCE_SHA256};
type Point=[number,number];
const clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};

/** Source-indexed 2D candidate: shift while the observed paper is nearly edge-on.
 * The thin interval is observed in source55..70; its chosen timing is authored.
 * C2 reaches +46 at69 and stays there. The existing release/return is reused.
 * A local paired-hand warp preserves the grip; it also deforms jacket pixels in
 * the declared region. No full hand matte or physical 3D motion is claimed.
 */
export function pamelaC2EdgeShiftProfile(frame:number){
  if(!Number.isInteger(frame)||frame<0||frame>=180)throw Error('Invalid source frame');
  const cardShift=46*smooth(55,69,frame);
  const handShift=frame<=118?cardShift:frame<124?46*(1-smooth(118,124,frame)):0;
  return {cardShiftPixels:cardShift,handShiftPixels:handShift,lateFieldWeight:smooth(70,94,frame),thinShiftStart:55,thinShiftEnd:69,landingOffset:46};
}

export function retargetPamelaC2FrameV2(input:PamelaC2RetargetInput){
  const {sourceRGB:source,visibleCardMask:mask,width:W,height:H,sourceFrameIndex:frame}=input;
  if(input.sourceSha256!==PAMELA_C2_SOURCE_SHA256||W!==1762||H!==1174||source.length!==W*H*3||mask.length!==W*H)throw Error('Pamela C2 source binding mismatch');
  const profile=pamelaC2EdgeShiftProfile(frame);
  // Exact reuse from94 onward preserves the already reviewed landing and release.
  if(frame<=55||frame>=94){const result=retargetPamelaC2Frame(input);return {...result,diagnostics:{...result.diagnostics,edgeShiftProfile:profile,edgeShiftStatus:'local-2d-candidate-reuses-original-outside56..93'}};}
  const cardRight=new Int16Array(H),handRight=new Int16Array(H);cardRight.fill(-1);handRight.fill(-1);
  let skinTop=840,cardTop=H,cardBottom=-1;
  for(let y=550;y<1125;y++)for(let x=540;x<1160;x++){
    const p=y*W+x,i=p*3;
    if(mask[p]>30){cardRight[y]=Math.max(cardRight[y],x);cardTop=Math.min(cardTop,y);cardBottom=Math.max(cardBottom,y);}
    if(y>=730&&x<940&&source[i]-source[i+1]>30&&source[i]-source[i+2]>60&&source[i]>140){skinTop=Math.min(skinTop,y);handRight[y]=Math.max(handRight[y],x);}
  }
  if(cardBottom<0)throw Error('Edge-shift candidate requires an observed card mask');
  const rigidFromY=clamp(Math.min(skinTop-6,cardTop-4),710,840),earlyBottom=Math.max(800,cardBottom+4);
  const rows=Array.from({length:H},(_,y)=>{
    const lateStrength=profile.cardShiftPixels*smooth(680,rigidFromY,y)*(1-smooth(1110,1125,y));
    const baseRight=y<740?760+(y-680)*.5:y<800?790+(y-740)*.5:820;
    const right=Math.max(baseRight,cardRight[y]>=0?cardRight[y]+12:0,handRight[y]>=0?handRight[y]+12:0);
    // Earlier full displacement needs a wider right falloff than the old
    // near-zero shift at71..83. Keep a conservative positive Jacobian margin.
    return {earlyStrength:profile.cardShiftPixels*smooth(550,620,y)*(1-smooth(earlyBottom,Math.min(1125,earlyBottom+90),y)),lateStrength,right,end:Math.max(940+310*smooth(850,910,y),right+115)};
  });
  const displacement=(x:number,y:number)=>{
    const row=rows[clamp(Math.round(y),0,H-1)],t=profile.lateFieldWeight;
    const early=row.earlyStrength*smooth(540,720,x)*(1-smooth(1108,1250,x));
    const late=row.lateStrength*smooth(400,540,x)*(1-smooth(row.right,row.end,x));
    return early*(1-t)+late*t;
  };
  const mapPoint=(p:Point):Point=>[p[0]+displacement(p[0],p[1]),p[1]];
  const rgb=Buffer.from(source),visibleCardMask=Buffer.from(mask),warpSupportMask=Buffer.alloc(W*H);
  let minJacobian=1,maxCardShiftError=0,changedBytes=0;
  for(let y=550;y<1125;y++){
    if(rows[y].earlyStrength===0&&rows[y].lateStrength===0)continue;
    let sx=399,previous=399+displacement(399,y);
    for(let x=400;x<=1250;x++){
      const mapped=x+displacement(x,y);minJacobian=Math.min(minJacobian,mapped-previous);previous=mapped;
      if(mapped-(x-1+displacement(x-1,y))<=.1)throw Error(`Unsafe local edge-shift fold at frame ${frame}, row ${y}`);
      while(sx+1<W-1&&(sx+1)+displacement(sx+1,y)<x)sx++;
      const a=sx+displacement(sx,y),b=sx+1+displacement(sx+1,y),f=clamp((x-a)/Math.max(1e-9,b-a)),p=y*W+x,q=y*W+sx;
      for(let c=0;c<3;c++){rgb[p*3+c]=Math.round(source[q*3+c]*(1-f)+source[(q+1)*3+c]*f);if(rgb[p*3+c]!==source[p*3+c])changedBytes++;}
      visibleCardMask[p]=Math.round(mask[q]*(1-f)+mask[q+1]*f);
      warpSupportMask[p]=Math.round(255*clamp(Math.abs(x-(sx+f))/46));
    }
  }
  for(let y=550;y<1125;y++)for(let x=540;x<1160;x++)if(mask[y*W+x]>=128)maxCardShiftError=Math.max(maxCardShiftError,Math.abs(displacement(x,y)-profile.cardShiftPixels));
  const originalLanding:Point[]=[[820,1026],[943,1026],[963,1093],[802,1093]];
  return {rgb,visibleCardMask,warpSupportMask,mapPoint,
    geometry:{sourceFrameIndex:frame,card1QuadNative:originalLanding,card2LandingQuadNative:originalLanding.map(([x,y])=>[x+46,y] as Point),movingContourNative:(input.contourNative??[]).map(mapPoint),postReleasePropRemovalRect:null},
    diagnostics:{handShiftPixels:profile.handShiftPixels,cardShiftPixels:profile.cardShiftPixels,rigidFromY,anchorY:550,minimumHorizontalJacobianBound:minJacobian,maxObservedCardShiftErrorPixels:maxCardShiftError,changedBytes,interpolation:'single horizontal bilinear inverse warp of original RGB and measured card mask',semantics:'Early paired-hand region is inferred; includes jacket. Full hand matte absent. No 3D or clean-plate reconstruction.',edgeShiftProfile:profile,edgeShiftStatus:'local-2d-candidate-needs-motion-review',scope:{left:400,top:550,right:1250,bottomExclusive:1125}}};
}
