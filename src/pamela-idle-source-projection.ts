import {dealerProjectionMesh,projectDealerPixel,type StageProjection} from './pamela-stage-projection.ts';

/** Explicit adapter for one 1764-wide source. No crop, stretch, interpolation,
 * retiming, pose alignment or acceptance of any A<->B seam is performed here. */
export const PAMELA_IDLE_SOURCE={
  sha256:'5cc9b0cd7604262a4859140f08bfdb36c96cf51828d7b0caa0cf5fa02248633c',
  path:'runs/20261109-pamela-idle-anchor-pilot/run-01/original/pamela-01-wan3.mp4',
  width:1764,height:1174,canonicalWidth:1762,fps:30,frames:360,
  sourceToCanonicalX:-1,canonicalToSourceX:1,
  policy:'Centre-align pixel grids, preserve scene units per source pixel; retain one extra source column on each side.',
  physicalCameraRecovered:false,aConnectionAccepted:false,
} as const;
export const PAMELA_IDLE_WINDOWS=[
  {id:'zero',start:289,endExclusive:327,frames:38,blinks:0,threeCyclesWithClosure:115},
  {id:'one',start:252,endExclusive:317,frames:65,blinks:1,threeCyclesWithClosure:196},
] as const;
export type PamelaIdleWindow=typeof PAMELA_IDLE_WINDOWS[number]['id'];
export const PAMELA_IDLE_SOURCE_REGIONS={
  face:{left:751,top:115,width:230,height:255},
  leftHand:{left:641,top:750,width:210,height:140},
  rightHand:{left:891,top:740,width:230,height:155},
  shoe:{left:1180,top:625,width:530,height:280},
} as const;
function requireSource(sha256:string){if(sha256!==PAMELA_IDLE_SOURCE.sha256)throw Error('Idle width adapter requires the bound 1764-pixel source');}
export function idleSourceToCanonicalPixel(x:number,y:number):[number,number]{
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1764||y<0||y>1174)throw Error('Outside full native idle source');
  return [x-1,y];
}
export function canonicalToIdleSourcePixel(x:number,y:number):[number,number]{
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1762||y<0||y>1174)throw Error('Outside canonical source');
  return [x+1,y];
}
export function pamelaIdleStageProjection(canonical:StageProjection,sourceSha256:string):StageProjection{
  requireSource(sourceSha256);
  if(canonical.sourceWidth!==1762||canonical.sourceHeight!==1174||canonical.contactSourceY!==876||!(canonical.width>0))throw Error('Idle adapter requires canonical1762x1174 projection with fold876');
  return {...canonical,width:canonical.width*1764/1762,sourceWidth:1764,sourceHeight:1174,camera:[...canonical.camera],cameraTarget:[...canonical.cameraTarget]};
}
export function pamelaIdleProjectionMesh(canonical:StageProjection,sourceSha256:string){return dealerProjectionMesh(pamelaIdleStageProjection(canonical,sourceSha256));}
export function projectPamelaIdlePixel(x:number,y:number,canonical:StageProjection,sourceSha256:string){
  idleSourceToCanonicalPixel(x,y);
  return projectDealerPixel(x,y,pamelaIdleStageProjection(canonical,sourceSha256));
}
/** Pad a canonical layer, rather than shrinking/cropping the 1764px video.
 * Output dimensions1764x1174; source bytes remain exact at output x+1.
 * RGBA layers get transparent outer columns; RGB backgrounds repeat edge pixels.
 */
export function padCanonicalForIdle(source:Uint8Array,channels:3|4):Uint8Array{
  if(source.length!==1762*1174*channels)throw Error('Canonical native packed layer required');
  const out=new Uint8Array(1764*1174*channels),row=1762*channels;
  for(let y=0;y<1174;y++){
    const input=y*row,output=y*1764*channels;out.set(source.subarray(input,input+row),output+channels);
    if(channels===3){out.set(source.subarray(input,input+3),output);out.set(source.subarray(input+row-3,input+row),output+1763*3);}
  }
  return out;
}
export function pamelaIdleSourceFrame(windowId:PamelaIdleWindow,outputFrame:number){
  const w=PAMELA_IDLE_WINDOWS.find(w=>w.id===windowId);
  if(!w||!Number.isInteger(outputFrame)||outputFrame<0)throw Error('Invalid idle window/frame');
  return w.start+outputFrame%w.frames;
}
