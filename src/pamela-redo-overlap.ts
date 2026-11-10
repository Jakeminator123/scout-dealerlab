/** Explicit temporal blends for a fixed-length, local REDO seam study.
 * Blended outputs are processed frames, never original source frames.
 * Endpoint holds are deliberate and exposed in every plan entry.
 */
export const REDO_OVERLAP_SOURCE_SHA256='5abd5dd1107d7433c8efc0d95164c2c7af3b2b9703f1123c87f8f02da378bc0b';
export type OverlapLength=0|4|8;
export type RedoLayer={rgb:Buffer;alpha:Float32Array};
export type RedoPair={outputIndex:number;nominalSourceFrame:number;kind:'source-layer'|'blended-layer';sourceAFrame:number;sourceBFrame:number;weightA:number;weightB:number;outgoingHeldAt359:boolean;incomingHeldAt0:boolean};

export function createRedoOverlapPlan(length:OverlapLength):RedoPair[]{
 if(![0,4,8].includes(length))throw Error('Only the bounded 0/4/8-frame study is supported');
 const first=60-length/2,last=first+length-1;
 return Array.from({length:90},(_,outputIndex)=>{
  const nominalSourceFrame=outputIndex<60?300+outputIndex:outputIndex-60;
  const mixed=length>0&&outputIndex>=first&&outputIndex<=last;
  const weightB=mixed?(outputIndex-first+1)/(length+1):0;
  return {outputIndex,nominalSourceFrame,kind:mixed?'blended-layer':'source-layer',sourceAFrame:mixed?Math.min(359,300+outputIndex):nominalSourceFrame,sourceBFrame:mixed?Math.max(0,outputIndex-60):nominalSourceFrame,weightA:1-weightB,weightB,outgoingHeldAt359:mixed&&outputIndex>=60,incomingHeldAt0:mixed&&outputIndex<60};
 });
}

/** Blend premultiplied dealer/shoe contributions over one unchanged base.
 * The base already contains the independent, unchanged landed-card layer.
 * RGB mixing uses encoded RGB8 values, not optical flow or a spatial warp.
 */
export function composeRedoOverlap(base:Buffer,a:RedoLayer,b:RedoLayer,weightB:number):Buffer{
 if(base.length%3||a.rgb.length!==base.length||b.rgb.length!==base.length||a.alpha.length!==base.length/3||b.alpha.length!==base.length/3)throw Error('Packed RGB and alpha dimensions differ');
 if(!Number.isFinite(weightB)||weightB<0||weightB>1)throw Error('Invalid temporal weight');
 const out=Buffer.allocUnsafe(base.length),weightA=1-weightB;
 for(let p=0;p<a.alpha.length;p++){
  const aa=a.alpha[p]*weightA,ba=b.alpha[p]*weightB,alpha=aa+ba;
  for(let c=0;c<3;c++)out[p*3+c]=Math.round(base[p*3+c]*(1-alpha)+a.rgb[p*3+c]*aa+b.rgb[p*3+c]*ba);
 }
 return out;
}
