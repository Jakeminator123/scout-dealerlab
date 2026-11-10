import type {CardPhysicalSide,CardQuad} from './pamela-two-sided-card.ts';
import type {PixelBounds} from './pamela-p4-card-calibration.ts';
export type AtlasRect=PixelBounds&{page:number};
export type AtlasCard={bounds:PixelBounds;atlas:AtlasRect;quad:CardQuad;side:CardPhysicalSide};
export type CardAtlasManifest={schemaVersion:1;source:{path:string;sha256:string};width:number;height:number;fps:number;frames:{frame:number;cards:AtlasCard[];sourceRgbSha256:string;paperSha256:string}[];pages:{path:string;sha256:string;width:number;height:number}[];artwork:{back:Record<string,string>;front:Record<string,Record<string,string>>};verification:{nativeFrames:number;unchangedPaperFrames:number;guardedPixelsWritten:number;overlapPixels:number};limitations:string[]};
/** Column-major inverse homography for GLSL; it agrees with cardProjectiveUv. */
export function cardUvMatrix(q:CardQuad):number[]{
 const[a,b,c,d]=q,dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0],dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1],det=dx1*dy2-dx2*dy1;
 if(Math.abs(det)<1e-8)throw Error('Degenerate plane must use EDGE material');
 const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
 const[aa,bb,cc,dd,ee,ff,gg,hh,ii]=[b[0]-a[0]+g*b[0],d[0]-a[0]+h*d[0],a[0],b[1]-a[1]+g*b[1],d[1]-a[1]+h*d[1],a[1],g,h,1];
 return[ee*ii-ff*hh,ff*gg-dd*ii,dd*hh-ee*gg,cc*hh-bb*ii,aa*ii-cc*gg,bb*gg-aa*hh,bb*ff-cc*ee,cc*dd-aa*ff,aa*ee-bb*dd];
}
export function resolveArtwork<T>(side:CardPhysicalSide,engine:{cardId:string|null;frontAllowed:boolean},back:T,front:(id:string)=>T):T|null{
 if(side==='EDGE')return null;
 return side==='FRONT'&&engine.frontAllowed&&engine.cardId?front(engine.cardId):back;
}
export const PAMELA_CARD_ATLAS_GLSL=`
uniform sampler2D cardMask0; uniform sampler2D cardMask1;
uniform sampler2D cardInk0; uniform sampler2D cardInk1;
uniform vec4 cardBounds0; uniform vec4 cardBounds1;
uniform vec4 cardAtlas0; uniform vec4 cardAtlas1;
uniform vec2 cardPageSize0; uniform vec2 cardPageSize1;
uniform mat3 cardUv0; uniform mat3 cardUv1;
uniform float cardEdge0; uniform float cardEdge1;
uniform vec2 cardInkSize;
float paperMask(sampler2D maskTex,vec2 p,vec4 bounds,vec4 rect,vec2 size){
 vec2 local=p-bounds.xy;
 if(any(lessThan(local,vec2(0.0)))||any(greaterThanEqual(local,bounds.zw)))return 0.0;
 return texture2D(maskTex,(rect.xy+floor(local)+vec2(0.5))/size).r;
}
vec3 printCard(vec3 source,vec2 p,mat3 uvMatrix,sampler2D ink,float edge){
 vec3 h=uvMatrix*vec3(p,1.0);vec2 uv=clamp(h.xy/h.z,0.0,1.0);
 vec3 art=edge>0.5?vec3(230.0/255.0):texture2D(ink,(uv*(cardInkSize-1.0)+0.5)/cardInkSize).rgb;
 float neutralG=min(source.g,max(source.r,source.b)+5.0/255.0);
 float light=clamp(dot(vec3(source.r,neutralG,source.b),vec3(.3,.5,.2)),.18,1.0);
 return art*light;
}
void applyPamelaCards(in vec3 source,in vec2 pixel,inout vec3 keyed,inout float alpha){
 float a0=paperMask(cardMask0,pixel,cardBounds0,cardAtlas0,cardPageSize0);
 float a1=paperMask(cardMask1,pixel,cardBounds1,cardAtlas1,cardPageSize1);
 if(a0>0.0){keyed=mix(source,printCard(source,pixel,cardUv0,cardInk0,cardEdge0),a0);alpha=max(alpha,a0);}
 if(a1>0.0){keyed=mix(source,printCard(source,pixel,cardUv1,cardInk1,cardEdge1),a1);alpha=max(alpha,a1);}
}
`;
