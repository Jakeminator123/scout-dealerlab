/** Presentation only. The engine supplies card identity and reveal permission.
 * Every render starts from the immutable UNPRINTED plate, never a prior design.
 * Calibrated surfaces/guards are supplied separately from front/back artwork. */
export type CardPoint=[number,number];
export type CardQuad=[CardPoint,CardPoint,CardPoint,CardPoint];
export type CardPhysicalSide='BACK'|'EDGE'|'FRONT';
export type CardTexture={rgb:Uint8Array;width:number;height:number;id:string};
export type CardPresentation={slotId:string;physicalSide:CardPhysicalSide;engine:{cardId:string|null;frontAllowed:boolean};back:CardTexture;front:(cardId:string)=>CardTexture;concealed?:CardTexture};
export function presentedCardMaterial(p:CardPresentation):{side:'BACK'|'EDGE'|'FRONT'|'CONCEALED';texture:CardTexture|null}{
 if(!p.slotId)throw Error('A presentation slot is required');
 if(p.physicalSide==='EDGE')return{side:'EDGE',texture:null};
 if(p.physicalSide==='BACK')return{side:'BACK',texture:p.back};
 if(p.engine.frontAllowed&&p.engine.cardId)return{side:'FRONT',texture:p.front(p.engine.cardId)};
 return{side:'CONCEALED',texture:p.concealed??p.back};
}
/** Exact projective map of the unit square, with inverse homography. */
export function cardProjectiveUv(q:CardQuad){
 const [a,b,c,d]=q,dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0],dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1];
 const determinant=dx1*dy2-dx2*dy1;
 if(Math.abs(determinant)<1e-8)throw Error('Degenerate card plane must be represented by an edge');
 const g=(dx3*dy2-dx2*dy3)/determinant,h=(dx1*dy3-dx3*dy1)/determinant;
 const m=[b[0]-a[0]+g*b[0],d[0]-a[0]+h*d[0],a[0],b[1]-a[1]+g*b[1],d[1]-a[1]+h*d[1],a[1],g,h,1];
 const [aa,bb,cc,dd,ee,ff,gg,hh,ii]=m;
 const inv=[ee*ii-ff*hh,cc*hh-bb*ii,bb*ff-cc*ee,ff*gg-dd*ii,aa*ii-cc*gg,cc*dd-aa*ff,dd*hh-ee*gg,bb*gg-aa*hh,aa*ee-bb*dd];
 return(x:number,y:number):CardPoint=>{const z=inv[6]*x+inv[7]*y+inv[8];return[(inv[0]*x+inv[1]*y+inv[2])/z,(inv[3]*x+inv[4]*y+inv[5])/z];};
}
export type CardSurface={presentation:CardPresentation;coverage:Uint8Array;guard:Uint8Array;quad:CardQuad;bounds:{left:number;top:number;width:number;height:number};uvAt?:(x:number,y:number)=>CardPoint};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export function renderTwoSidedCards(neutralPlate:Uint8Array,width:number,height:number,surfaces:CardSurface[]){
 if(neutralPlate.length!==width*height*3)throw Error('Unprinted native RGB plate required');
 const out=new Uint8Array(neutralPlate),paper=new Uint8Array(width*height),states:unknown[]=[];
 for(const layer of surfaces){
  if(layer.coverage.length!==paper.length||layer.guard.length!==paper.length)throw Error('Native mask size mismatch');
  const {side,texture:t}=presentedCardMaterial(layer.presentation),uv=side==='EDGE'?()=>[0,0] as CardPoint:layer.uvAt??cardProjectiveUv(layer.quad),b=layer.bounds;
  if(b.left<0||b.top<0||b.left+b.width>width||b.top+b.height>height)throw Error('Surface leaves native frame');
  if(t&&(t.width<1||t.height<1||t.rgb.length!==t.width*t.height*3))throw Error('Invalid card texture');
  let changed=0,protectedPixels=0;
  for(let y=b.top;y<b.top+b.height;y++)for(let x=b.left;x<b.left+b.width;x++){
   const p=y*width+x,a=layer.coverage[p]/255;if(!a)continue;if(layer.guard[p]){protectedPixels++;continue;}
   if(paper[p])throw Error('Visible card layers overlap');paper[p]=layer.coverage[p];const k=p*3,[u,v]=uv(x+.5,y+.5);
   if(!Number.isFinite(u)||!Number.isFinite(v))throw Error('Nonfinite UV on visible paper');
   // Neutral lighting from the blank plate. Remove green-set spill without
   // deriving alpha or material identity from the artwork's brightness.
   const r=neutralPlate[k],g=neutralPlate[k+1],blue=neutralPlate[k+2],neutralG=Math.min(g,Math.max(r,blue)+5);
   const light=Math.max(.18,Math.min(1,(r*.3+neutralG*.5+blue*.2)/255));
   const tx=t?clamp(u)*(t.width-1):0,ty=t?clamp(v)*(t.height-1):0,x0=Math.floor(tx),y0=Math.floor(ty),fx=tx-x0,fy=ty-y0;
   for(let c=0;c<3;c++){
    let ink=230;if(t){const sample=(xx:number,yy:number)=>t.rgb[(Math.min(t.height-1,yy)*t.width+Math.min(t.width-1,xx))*3+c];ink=(sample(x0,y0)*(1-fx)+sample(x0+1,y0)*fx)*(1-fy)+(sample(x0,y0+1)*(1-fx)+sample(x0+1,y0+1)*fx)*fy;}
    out[k+c]=Math.round(neutralPlate[k+c]*(1-a)+ink*light*a);
   }
   if(out[k]!==neutralPlate[k]||out[k+1]!==neutralPlate[k+1]||out[k+2]!==neutralPlate[k+2])changed++;
  }
  states.push({slotId:layer.presentation.slotId,physicalSide:layer.presentation.physicalSide,displayedSide:side,textureId:t?.id??null,changedPixels:changed,guardedCoveragePixels:protectedPixels});
 }
 return{rgb:out,paper,states};
}

/** Authored display schedule, tied to the observed thin passage in C2/P4.
 * The source prop is blank: semantic front/back cannot be proved by its print. */
export const PAMELA_P4_FLIP_SOURCE='67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167';
export function pamelaP4FlipSide(frame:number,sourceSha256:string):CardPhysicalSide{
 if(sourceSha256!==PAMELA_P4_FLIP_SOURCE||!Number.isInteger(frame)||frame<0||frame>=360)throw Error('Flip calibration source/frame mismatch');
 return frame<98?'BACK':frame===98?'EDGE':'FRONT';
}
