import {projectDealerPixel,type StageProjection} from './pamela-stage-projection.ts';
import {sourceContactAnchor} from './pamela-table-layer.ts';

type Point=readonly [number,number];
type Quad=readonly [Point,Point,Point,Point];
type WorldPoint=readonly [number,number,number];
export const PAMELA_CONTACT_CALIBRATION={
  id:'pamela-c2-p4-contact-v1',
  sourceSha256:'67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167',
  sourcePath:'runs/20261109-pamela-seat-bank/c2/bank-v2-stage-2/original/pamela-seat-4-wan3-c2-bank-v2.mp4',
  trackPath:'runs/20261109-pamela-c2-motion-track/take-01/seat-4/draft-03/track.json',
  trackSha256:'5f7bdf302f9a1cc602c0addac3a691888af019fefede75d671fe59ccff1bb4d8',
  inputsPath:'runs/20261109-pamela-c2-motion-track/take-01/inputs.json',
  inputsSha256:'8da69a4d2a4f64cd48d3bb0c123d749f98f08d52472329154ca34eeec89ab9fc',
  width:1762,height:1174,fps:30,frames:360,foldSourceY:876,
  // These are source-pixel contour estimates. Neither the native images nor
  // the folded projection measure physical card height or finger pressure.
  c1Quad:[[846,1010],[917,1010],[919,1077],[842,1077]] as Quad,
  c2LandedQuad:[[868,1000],[945,1000],[945,1068],[868,1068]] as Quad,
  intervals:{
    c1Supported:[0,360],c2Supported:[180,360],
    handOnC2:[180,212],handReleaseUnknown:[212,218],handRaised:[218,360],
  },
  intervalsConvention:'integer source frame; start inclusive, end exclusive',
  decision:'Conservative source-observed contact gates, not measured physical depth',
  handShadowPolicy:'Preserve baked hand shading. Never add a tabletop ellipse for the dealing hand.',
  cardShadowPolicy:'Preserve baked card shading by default. Optional replacement is <=1.25 native px, max alpha .06; C2 clipped inside C1.',
} as const;

export type PamelaContactStatus='visually-supported'|'unknown'|'separated';
export type PamelaContactFrame={
  sourceSha256:string;frame:number;foldSourceY:number;
  cards:{id:'c1'|'c2';status:PamelaContactStatus;receiver:'table'|'card1-and-table';sourceQuad:Quad|null;worldQuad:WorldPoint[]|null;shadowWorldQuad:WorldPoint[]|null}[];
  hand:{status:PamelaContactStatus;receiver:'card2'|null;shadow:null;reason:string};
  shadow:{mode:'preserve-source';maxRadiusNativePx:1.25;maxCard1Opacity:.06;maxCard2Opacity:.05;offsetNative:Point};
  limitations:readonly string[];
};
function assertSource(sourceSha256:string,frame:number){
  if(sourceSha256!==PAMELA_CONTACT_CALIBRATION.sourceSha256)throw Error('Contact calibration/source mismatch');
  if(!Number.isInteger(frame)||frame<0||frame>=360)throw Error('Contact calibration requires an integer source frame 0..359');
}
/** The y=876 fold is a display projection, NEVER a physical-contact classifier. */
export function getPamelaContactFrame(input:{sourceSha256:string;frame:number;projection:StageProjection;feltHeight:number}):PamelaContactFrame{
  const {sourceSha256,frame,projection:p,feltHeight}=input;assertSource(sourceSha256,frame);
  if(p.sourceWidth!==1762||p.sourceHeight!==1174||p.contactSourceY!==876||!Number.isFinite(feltHeight)||
    Math.abs(p.tableHeight-feltHeight-.004)>1e-8)throw Error('Contact calibration requires native C2-P4 dimensions, fold y876 and the .004 display-plane separation');
  const c2Supported=frame>=180;
  const makeCard=(id:'c1'|'c2',q:Quad|null):PamelaContactFrame['cards'][number]=>({
    id,status:q?'visually-supported':'unknown',receiver:id==='c1'?'table':'card1-and-table',sourceQuad:q,
    worldQuad:q?q.map(([x,y])=>projectDealerPixel(x,y,p)):null,
    shadowWorldQuad:q?q.map(([sourceX,sourceY])=>sourceContactAnchor({sourceX,sourceY},p,feltHeight)):null,
  });
  const hand:PamelaContactFrame['hand']=frame>=218?{status:'separated',receiver:null,shadow:null,reason:'Hand visibly lifted; no added contact shadow'}:
    frame>=180&&frame<212?{status:'visually-supported',receiver:'card2',shadow:null,reason:'Finger on upper card; existing source shading retained, no tabletop hand shadow'}:
    {status:'unknown',receiver:null,shadow:null,reason:frame>=212?'Release transition 212..217; no added contact shadow':'Moving/flattening contact not calibrated; no added contact shadow'};
  return {sourceSha256,frame,foldSourceY:876,cards:[makeCard('c1',PAMELA_CONTACT_CALIBRATION.c1Quad),makeCard('c2',c2Supported?PAMELA_CONTACT_CALIBRATION.c2LandedQuad:null)],hand,
    shadow:{mode:'preserve-source',maxRadiusNativePx:1.25,maxCard1Opacity:.06,maxCard2Opacity:.05,offsetNative:[.25,.45]},
    limitations:['Contact intervals are conservative visual gates, not a recovered depth solution.','First possible C2 touch during frames160..179 remains unknown.','Hand-on-card contact is not evidence of hand-on-table contact.','Contour estimates differ slightly from observed pixel masks; masks always have priority.','Do not overlay replacement shadows over preserved source contact shading.']};
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
function inside(q:Quad,p:Point){
  let sign=0;
  for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],cross=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);if(Math.abs(cross)<1e-9)continue;const s=Math.sign(cross);if(sign&&s!==sign)return false;sign=s;}
  return true;
}
function edgeDistance(q:Quad,p:Point){
  let nearest=Infinity;
  for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy));nearest=Math.min(nearest,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));}
  return nearest;
}
/** Opt-in only when a compositor has removed the original card shadow.
 * Coverage is the authoritative native RGB mask (R=C1,G=C2,B=hand/shoe guard),
 * normalized to 0..1. No semantic mask, no synthetic shadow. No hand shadows.
 * Draw tableAlpha BELOW the dealer. Apply interCardAlpha only to visible C1.
 */
export function samplePamelaContactShadow(state:PamelaContactFrame,point:Point,coverage:{c1:number;c2:number;guard:number},mode:'preserve-source'|'replace-lost-card-shadow'='preserve-source'){
  assertSource(state.sourceSha256,state.frame);
  if(![...point,coverage.c1,coverage.c2,coverage.guard].every(Number.isFinite)||[coverage.c1,coverage.c2,coverage.guard].some(v=>v<0||v>1))throw Error('Contact coverage must be finite normalized mask data');
  if(mode==='preserve-source'||coverage.guard>0||coverage.c2>0)return {tableAlpha:0,interCardAlpha:0};
  const c1=state.cards[0].sourceQuad!,c2=state.cards[1].sourceQuad,offset=state.shadow.offsetNative;
  const shifted:Point=[point[0]-offset[0],point[1]-offset[1]],radius=state.shadow.maxRadiusNativePx;
  const falloff=(q:Quad)=>{if(edgeDistance(q,point)>radius)return 0;const distance=edgeDistance(q,shifted);return clamp(1-distance/radius)**2;};
  // The outer C1 cue never paints over paper or a protected hand. The C2 cue
  // cannot escape C1, even when C2 extends beyond the lower card's silhouette.
  const tableAlpha=coverage.c1===0&&!inside(c1,point)&&(!c2||!inside(c2,point))?state.shadow.maxCard1Opacity*falloff(c1):0;
  const interCardAlpha=c2&&coverage.c1>0&&inside(c1,point)&&!inside(c2,point)?state.shadow.maxCard2Opacity*falloff(c2)*coverage.c1:0;
  return {tableAlpha,interCardAlpha};
}

/** Match a source-bound decal to the SAME folded mesh. This is a geometry
 * helper only: using it does not certify that its source pixel touches felt. */
export function projectPamelaSourceContact(sourceX:number,sourceY:number,projection:StageProjection,feltHeight:number){
  return {source:[sourceX,sourceY] as Point,dealerWorld:projectDealerPixel(sourceX,sourceY,projection),shadowWorld:sourceContactAnchor({sourceX,sourceY},projection,feltHeight),physicalContact:'unknown' as const};
}
