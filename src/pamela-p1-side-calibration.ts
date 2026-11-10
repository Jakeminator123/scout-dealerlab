import type {CardPhysicalSide,CardQuad} from './pamela-two-sided-card.ts';

/** Optical presentation candidate only. The source prop is blank, so its
 * semantic physical side and hidden corner correspondence remain UNKNOWN. */
export const P1_NATIVE={width:1762,height:1174,frames:360,fps:30,sourceSha256:'98ff074a7815cf5ecb2e58a85748e9da79b8acd04a9a97048222ddb104bb6813'} as const;
export const P1_SIDE_POLICY={
 sourceSha256:P1_NATIVE.sourceSha256,physicalSide:'UNKNOWN',intervalConvention:'start-inclusive-end-exclusive',
 segments:[
  {start:0,end:83,side:'FRONT'},
  {start:83,end:104,side:'EDGE'},
  {start:104,end:114,side:'BACK'},
  {start:114,end:119,side:'EDGE'},
  {start:119,end:360,side:'FRONT'},
 ],
 authoredChoice:'The same visible face is called FRONT before and after the two passages; the green-reflected intervening face is called BACK. Engine permission and identity must gate BOTH FRONT intervals.',
} as const;
export function pamelaP1FlipSide(frame:number,sourceSha256:string):CardPhysicalSide{
 if(sourceSha256!==P1_NATIVE.sourceSha256||!Number.isInteger(frame)||frame<0||frame>=P1_NATIVE.frames)throw Error('P1 calibration source/frame mismatch');
 return P1_SIDE_POLICY.segments.find(s=>frame>=s.start&&frame<s.end)!.side;
}
type PixelBounds={left:number;top:number;width:number;height:number};
// Independent native P1 fits. The frozen track interpolates a quarter-turn
// at61/62 and replaces broad opening quads with PCA bounding rectangles.
// These are UV-only authored planes: coverage/occlusion is NEVER expanded by
// their coordinates. Grip corners and subpixel blur remain approximate.
const fittedQuads:Record<number,CardQuad>={
 61:[[1176,671],[1229,685],[1140,740],[1108,728]],
 62:[[1170,676],[1214,687],[1129,742],[1097,731]],
 124:[[258,809],[330,846],[332,897],[260,865]],
 125:[[243,817],[321,857],[320,912],[244,870]],
 126:[[233,823],[309,857],[309,921],[233,884]],
 127:[[232,827],[306,861],[305,927],[232,890]],
 128:[[226,833],[302,866],[301,933],[226,896]],
 129:[[208,851],[282,882],[281,943],[205,913]],
 130:[[201,865],[274,892],[274,952],[193,922]],
 131:[[197,872],[270,895],[270,958],[187,929]],
 132:[[195,877],[269,900],[269,964],[185,934]],
 133:[[192,882],[267,906],[267,969],[183,939]],
 134:[[185,892],[261,914],[260,978],[174,949]],
 135:[[183,899],[258,922],[253,987],[167,957]],
 136:[[179,904],[255,927],[249,994],[165,962]],
 137:[[179,906],[254,930],[249,997],[164,967]],
 138:[[176,909],[253,933],[245,1003],[162,974]],
 139:[[176,910],[252,935],[241,1006],[160,980]],
 140:[[175,915],[252,937],[240,1010],[160,984]],
};
function bounds(mask:Uint8Array):PixelBounds{
 const W=P1_NATIVE.width;let l:number=W,t:number=P1_NATIVE.height,r=-1,b=-1;
 for(let p=0;p<mask.length;p++)if(mask[p]){const x=p%W,y=Math.floor(p/W);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 return r<0?{left:0,top:0,width:1,height:1}:{left:l,top:t,width:r-l+1,height:b-t+1};
}
export function calibrateP1CardFrame(input:{frame:number;sourceSha256:string;sourceRgb:Uint8Array;semanticMaskRgb:Uint8Array;movingQuad:CardQuad;firstQuad:CardQuad}){
 const {width:W,height:H}=P1_NATIVE,{frame:f,sourceRgb:raw,semanticMaskRgb:mask}=input,side=pamelaP1FlipSide(f,input.sourceSha256);
 if(raw.length!==W*H*3||mask.length!==raw.length)throw Error('Native P1 RGB/mask dimensions required');
 for(const q of [input.firstQuad,input.movingQuad])if(q.length!==4||q.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Finite P1 card quads required');
 const coverage:[Uint8Array,Uint8Array]=[new Uint8Array(W*H),new Uint8Array(W*H)],guard=new Uint8Array(W*H);
 for(let p=0;p<W*H;p++){coverage[0][p]=mask[p*3];coverage[1][p]=mask[p*3+1];guard[p]=mask[p*3+2];}
 const q=fittedQuads[f]??input.movingQuad;
 // Preserve the grip short-edge convention before the first passage. The
 // middle BACK plane gets its own authored short-edge UV convention; blank
 // paper cannot prove matching physical corners through the two-hand grip.
 const order=f>=63&&f<83?[1,2,3,0]:f>=104&&f<114?[3,0,1,2]:[0,1,2,3];
 const movingQuad=order.map(i=>[q[i][0],q[i][1]]) as CardQuad;
 return{coverage,guard,quads:[input.firstQuad.map(p=>[p[0],p[1]]) as CardQuad,movingQuad] as [CardQuad,CardQuad],bounds:coverage.map(bounds),side,added:0,releasedGuardPixels:[] as number[]};
}
