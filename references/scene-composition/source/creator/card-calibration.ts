import type {Project,Asset,Shot,PlacementSettings,CardCalibration} from './types.ts';
import type {PublicRound,CommandAction} from '../blackjack/types.ts';
import type {CardEntry,CardCue,RoundStep,RoundPlan,FramePresentation} from './presentation-types.ts';
interface Point {x:number;y:number;z:number}
interface VisibleSample {frame:number;visible:true;progress:number;sizeScale:number;origin:Point;target:Point;position:Point;mask:number[];corners?:Point[]}
type CardSample=VisibleSample|{frame:number;visible:false;mask:null};
export interface CardCalibrationInput {assetId:string;keystone:string|null;binding:string;fps:number;frameCount:number;contactFrame:number;releaseFrame:number;sourceWidth:number;sourceHeight:number;rect:number[];corners?:number[][]}
export function sameCardAnchorInput(saved:CardCalibration,input:CardCalibrationInput){
  return (['assetId','keystone','binding','fps','frameCount','contactFrame','releaseFrame','sourceWidth','sourceHeight'] as const).every(key=>saved[key]===input[key])&&
    input.rect.length===4&&input.rect.every((value,i)=>Number.isFinite(value)&&Math.abs(value-saved.rect[i])*(i%2?saved.sourceHeight:saved.sourceWidth)<.051);
}
import {TABLE,WIDE_PLACEMENT,placementSettings,makeError} from './contracts.ts';

const smooth=(a:number,b:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const finite=(x:unknown,lo:number,hi:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
const poseFor=(project:Project,asset?:Asset)=>({...WIDE_PLACEMENT,...project.dealer.placement,...asset?.metadata?.placement});
export function validCardCorners(corners:unknown,rect:number[]):corners is number[][]{
  if(!Array.isArray(corners)||corners.length!==4||corners.some(p=>!Array.isArray(p)||p.length!==2||!finite(p[0],rect[0],rect[2])||!finite(p[1],rect[1],rect[3])))return false;
  // Clockwise in source-image coordinates: back-left, back-right, front-right,
  // front-left. Reject crossings, concave shapes and collapsed card surfaces.
  return corners.every((a,i)=>{const b=corners[(i+1)%4],c=corners[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])>1e-7;});
}
export function calibrationBinding(project:Project,shot:Shot,placement?:Partial<PlacementSettings>){
  const asset=project.assets.find(a=>a.id===shot.assetId),pose=poseFor(project,asset);
  const image=project.assets.find(a=>a.id===project.keystone);
  const settings=placementSettings(placement??(project.dealer.calibration?.keystone===project.keystone?project.dealer.calibration:{}));
  return JSON.stringify([project.id,shot.id,asset?.id,asset?.sha256,image?.id,image?.sha256,project.readyPose,
    project.table.id,project.table.geometry,project.table.scale,project.table.feltTop,
    [pose.planeHeight,pose.fingertipSourceY,pose.handHeight,pose.depth],
    [settings.scale,settings.height,settings.x,settings.depth]]);
}
export function createCardCalibration(project:Project,shot:Shot,input:CardCalibrationInput):CardCalibration{
  const asset=project.assets.find(a=>a.id===shot.assetId);
  if(!asset||input.assetId!==asset.id)throw makeError('clip_changed','Klippet har bytts ut. Läs in den aktuella tagningen.',409);
  if(shot.category!=='Kortgivning'||!shot.compatible)throw makeError('card_clip','Välj ett kortklipp som hör till grundposen.');
  if(input.keystone!==project.keystone||input.binding!==calibrationBinding(project,shot))throw makeError('placement_changed','Posen eller inpassningen har ändrats. Mät kortankaret igen.',409);
  const {fps,frameCount,contactFrame,releaseFrame,sourceWidth,sourceHeight,rect}=input;
  if(!finite(fps,1,120)||!Number.isInteger(frameCount)||frameCount<2||!Number.isInteger(contactFrame)||!Number.isInteger(releaseFrame)||contactFrame<0||releaseFrame<contactFrame||releaseFrame>=frameCount)throw makeError('card_frames','Ange uppmätt bildfrekvens, bordskontakt och släppruta.');
  if(!Number.isInteger(sourceWidth)||!Number.isInteger(sourceHeight)||!finite(sourceWidth,16,8192)||!finite(sourceHeight,16,8192))throw makeError('card_dimensions','Klippets bildmått saknas.');
  const metadata=asset.metadata??{};
  if(metadata.constantFrameRate===false)throw makeError('variable_framerate','Kortankare kräver en film med fast bildfrekvens.');
  for(const [key,value]of Object.entries({fps,frameCount,width:sourceWidth,height:sourceHeight}))if(Number.isFinite(metadata[key])&&metadata[key]!==value)throw makeError('card_metadata','Uppgifterna stämmer inte med den uppmätta filmen.');
  if(!Array.isArray(rect)||rect.length!==4||!rect.every(x=>finite(x,0,1))||rect[2]-rect[0]<1/sourceWidth||rect[3]-rect[1]<1/sourceHeight||rect[2]-rect[0]>.18||rect[3]-rect[1]>.15)throw makeError('card_rect','Markera en snäv ruta runt det släppta kortet.');
  if(input.corners!==undefined&&!validCardCorners(input.corners,rect))throw makeError('card_corners','Ange fyra hörn i ordning runt kortet, innanför kortets markering.');
  return {schema:'creator-card-anchor/v1',binding:input.binding,assetId:asset.id,sha256:asset.sha256,keystone:project.keystone,
    fps,frameCount,contactFrame,releaseFrame,sourceWidth,sourceHeight,rect:[...rect],...(input.corners?{corners:input.corners.map(p=>[...p])}:{}),measuredAt:new Date().toISOString()};
}
export function currentCardCalibration(project:Project|null|undefined,shot:Shot|undefined,placement?:Partial<PlacementSettings>){
  if(!project||!shot)return null;const c=shot.cardCalibration;if(!c||c.schema!=='creator-card-anchor/v1'||c.binding!==calibrationBinding(project,shot,placement)||!shot.compatible||c.corners&&!validCardCorners(c.corners,c.rect))return null;
  return c;
}
export function neutralCardRegion(asset:Asset|undefined,time:number){
  const track=asset?.metadata?.neutralCardTrack;
  if(!track||track.sha256!==asset.sha256||track.fps!==asset.metadata.fps||!Number.isFinite(time)||time<0)return null;
  const frame=Math.floor(time*track.fps+.0001),region=track.regions?.find(r=>r.frame===frame),rect=region?.rect;
  return Array.isArray(rect)&&rect.length===4&&rect.every(x=>finite(x,0,1))&&rect[2]>rect[0]&&rect[3]>rect[1]&&rect[2]-rect[0]<.12&&rect[3]-rect[1]<.1?rect:null;
}
export function cardDestination(shot:Pick<Shot,'box'|'situation'>,index=0):Point{
  if(!Number.isInteger(index)||index<0||index>20)throw Error('Invalid card index');
  if(typeof shot.box==='number'&&Number.isInteger(shot.box)&&shot.box>=0&&shot.box<7){
    // Same seven marks as furniture.mjs bettingPrint, 2048x1024 on a 2.52x1.26 m decal.
    const angle=(shot.box-3)*.29;
    return {x:Math.sin(angle)*780/2048*2.52+index*.025,y:TABLE.feltTop+.006+index*.0005,z:.18+((540+Math.cos(angle)*205)/1024-.5)*1.26-.12};
  }
  if(shot.situation==='dealer-up')return {x:-.08+index*.08,y:TABLE.feltTop+.006,z:-.20};
  if(shot.situation==='dealer-hole')return {x:.08,y:TABLE.feltTop+.006,z:-.20};
  throw Error('No card destination');
}
export function sourceCardOrigin(project:Project,shot:Shot,calibration:CardCalibration,placement?:Partial<PlacementSettings>):Point{
  return sourceCardPoint(project,shot,calibration,[(calibration.rect[0]+calibration.rect[2])/2,(calibration.rect[1]+calibration.rect[3])/2],placement);
}
export function sourceCardPoint(project:Project,shot:Shot,calibration:CardCalibration,[u,v]:number[],placement?:Partial<PlacementSettings>):Point{
  const asset=project.assets.find(a=>a.id===shot.assetId),pose=poseFor(project,asset),s=placementSettings(placement??project.dealer.calibration),scale=s.scale/100;
  const forearm=smooth(.31,.47,v)*(1-smooth(.57,.67,v));
  return {x:s.x/100+(u-.5)*pose.planeHeight*calibration.sourceWidth/calibration.sourceHeight*scale,
    y:pose.handHeight+(pose.fingertipSourceY-v)*pose.planeHeight*scale+s.height/100,
    z:pose.depth-.46+.46*forearm+s.depth/100};
}

// The video surface keeps its screen contour when the depth shader meets the
// felt. Put the replacement on that same camera ray, not directly above/below
// the source point. The ray factor also preserves its apparent width.
export function cardOnFelt(source:Point,camera:Point,height=TABLE.feltTop+.006){
  if(![source.x,source.y,source.z,camera.x,camera.y,camera.z,height].every(Number.isFinite)||camera.y<=height||source.y>=camera.y)return null;
  const scale=(height-camera.y)/(source.y-camera.y);
  return {position:{x:camera.x+(source.x-camera.x)*scale,y:height,z:camera.z+(source.z-camera.z)*scale},scale};
}
// Presentation only: the caller supplies a server-owned card separately. No deck,
// random draw, rank, payout or balance is selected here. Preview uses a blank card.
export function sampleCreatorDeal(project:Project,shot:Shot,mediaTime:number,{placement,index=0,camera}: {placement?:Partial<PlacementSettings>;index?:number;camera?:Point}={}):CardSample|null{
  const c=currentCardCalibration(project,shot,placement);if(!c||!Number.isFinite(mediaTime))return null;
  const frame=Math.max(0,Math.floor(mediaTime*c.fps+.0001));if(frame<c.releaseFrame)return {frame,visible:false,mask:null};
  const source=sourceCardOrigin(project,shot,c,placement),height=project.table.feltTop+.006,grounded=camera?cardOnFelt(source,camera,height):null;
  if(camera&&!grounded)return {frame,visible:false,mask:null};
  const origin=grounded?.position??{...source,y:Math.max(height,source.y)},target={...origin},progress=smooth(0,.4,mediaTime-c.releaseFrame/c.fps);
  const pose=poseFor(project,project.assets.find(a=>a.id===shot.assetId)),scale=placementSettings(placement??project.dealer.calibration).scale/100;
  const sourceScale=(c.rect[2]-c.rect[0])*pose.planeHeight*c.sourceWidth/c.sourceHeight*scale/.063;
  const corners=camera&&c.corners?c.corners.map(uv=>cardOnFelt(sourceCardPoint(project,shot,c,uv,placement),camera,height)?.position):undefined;
  if(corners?.some(p=>!p))return {frame,visible:false,mask:null};
  return {frame,visible:true,progress,sizeScale:sourceScale*(grounded?.scale??1),origin,target,position:{...origin},mask:[...c.rect],...(corners?{corners:corners as Point[]}: {})};
}



// This module arranges server-owned cards. It does not draw cards or settle bets.
export function roundCards(round:PublicRound|null|undefined):CardEntry[]{
  const cards:CardEntry[]=[];
  for(const hand of round?.hands??[]){
    const peers=round!.hands.filter(h=>h.box===hand.box),slot=peers.findIndex(h=>h.hand===hand.hand);
    hand.cards.forEach((card,index)=>cards.push({key:card.id,card,owner:'player',box:hand.box,hand:hand.hand,index,handSize:hand.cards.length,handSlot:slot,handCount:peers.length}));
  }
  (round?.dealerCards??[]).forEach((card,index)=>cards.push({key:index===1?'dealer-hole':card.id,card,owner:'dealer',index,handSize:round!.dealerCards.length}));
  return cards;
}
export function gameCardPosition(entry:CardEntry,project?:Project|null):Point & {sizeScale?:number}{
  // Settled cards occupy reading lanes, independently of the filmed handoff.
  // A long fan compresses within its lane. Split hands use separate depth rows
  // instead of moving sideways into a neighbour's cards.
  const count=Math.max(entry.index+1,entry.handSize??1),handCount=entry.handCount??1;
  const sizeScale=entry.owner==='player'&&handCount>2?1.25:1.45,cardWidth=.063*sizeScale;
  if(entry.owner==='dealer'){
    const step=Math.min(.065,(.48-cardWidth)/Math.max(1,count-1));
    return {x:-.05+(entry.index-(count-1)/2)*step,y:TABLE.feltTop+.008+entry.index*.0006,z:-.28,sizeScale};
  }
  const p=cardDestination({box:entry.box},0);
  const neighbours=[entry.box!-1,entry.box!+1].filter(box=>box>=0&&box<7).map(box=>Math.abs(cardDestination({box},0).x-p.x));
  const laneWidth=Math.min(...neighbours)*.82,step=Math.min(.025,(laneWidth-cardWidth)/Math.max(1,count-1));
  const front=p.z+.035,rowStep=Math.min(.145,(front+.10)/Math.max(1,handCount-1));
  return {x:p.x+(entry.index-(count-1)/2)*step,y:p.y+entry.index*.0006,z:front-(entry.handSlot??0)*rowStep,sizeScale};
}
export function shotForCard(entry:CardEntry,type:CardCue['type']='deal'){
  return type==='reveal'?'flip':entry.owner==='player'?`pos${entry.box!+1}-iv`:entry.index===1?'hole-i':'posdealer-iv';
}
export function buildRoundPlan(before:PublicRound|null,after:PublicRound,action:CommandAction):RoundPlan{
  const finalCards=roundCards(after),old=action==='deal'?[]:roundCards(before),oldByKey=new Map(old.map(e=>[e.key,e]));
  const initial=finalCards.filter(e=>oldByKey.has(e.key)).map(e=>({...e,card:oldByKey.get(e.key)!.card}));
  const steps:RoundStep[]=[],add=(entry:CardEntry,type:CardCue['type']='deal')=>steps.push({shotId:shotForCard(entry,type),cue:{type,entry}});
  if(action==='deal'){
    const hands=[...(after.hands??[])].sort((a,b)=>b.box-a.box||a.hand-b.hand);
    for(let index=0;index<2;index++){
      for(const hand of hands){const entry=finalCards.find(e=>e.owner==='player'&&e.hand===hand.hand&&e.index===index);if(entry)add(entry);}
      const dealer=finalCards.find(e=>e.owner==='dealer'&&e.index===index);
      if(dealer)add(index===1?{...dealer,card:{hidden:true,id:'dealer-hole'}}:dealer);
    }
  }else{
    for(const entry of finalCards.filter(e=>e.owner==='player'&&!oldByKey.has(e.key)))add(entry);
  }
  const hole=finalCards.find(e=>e.key==='dealer-hole');
  if(after.phase==='done'&&hole&&!hole.card.hidden&&(action==='deal'||oldByKey.get('dealer-hole')?.card.hidden))add(hole,'reveal');
  for(const entry of finalCards.filter(e=>e.owner==='dealer'&&e.index>=2&&!oldByKey.has(e.key)))add(entry);
  return {initial,steps,final:finalCards};
}
export function completeCardCue(cards:CardEntry[],cue:CardCue){return [...cards.filter(e=>e.key!==cue.entry.key),cue.entry];}
export function gameShotReady(project:Project|null|undefined,id:string){
  const shot=project?.shots.find(s=>s.id===id);
  return Boolean(project&&shot?.assetId&&shot.compatible&&shot.status!=='rejected'&&project.assets.some(a=>a.id===shot.assetId)&&
    (shot.category!=='Kortgivning'||currentCardCalibration(project,shot)));
}
export function playableBoxes(project:Project|null|undefined){
  const common=['idle','posdealer-iv','hole-i','flip'].every(id=>gameShotReady(project,id));
  return Array.from({length:7},(_,box)=>common&&gameShotReady(project,`pos${box+1}-iv`));
}

// Keep the existing hidden card until the filmed hand touches it. Loading a
// reveal must neither erase the back nor expose the server-owned face early.
export function revealCoverCard(project:Project,shot:Shot,presentation:FramePresentation|null,time:number,{placement,loaded=false}: {placement?:Partial<PlacementSettings>;loaded?:boolean}={}){
  const cue=presentation?.cue;if(cue?.type!=='reveal')return null;
  const previous=presentation?.cards?.find(e=>e.key===cue.entry.key&&e.card.hidden);if(!previous)return null;
  const calibration=currentCardCalibration(project,shot,placement);
  return !loaded||!calibration||!Number.isFinite(time)||time*calibration.fps<calibration.contactFrame?previous:null;
}

// Count only the cards currently shown, plus a cue once its filmed release is visible.
export function displayedCardEntries(cards:CardEntry[],cue?:CardCue|null):CardEntry[]{
  const visible=cue?[...cards.filter(card=>card.key!==cue.entry.key),cue.entry]:cards;
  const group=(entry:CardEntry)=>entry.owner==='dealer'?'dealer':'player:'+entry.box+':'+entry.hand;
  const counts=new Map<string,number>();for(const entry of visible)counts.set(group(entry),(counts.get(group(entry))??0)+1);
  return visible.map(entry=>({...entry,handSize:counts.get(group(entry))??1}));
}
export function sampleGameDeal(project:Project,shot:Shot,time:number,entry:CardEntry,placement?:Partial<PlacementSettings>,camera?:Point):CardSample|null{
  const sample=sampleCreatorDeal(project,shot,time,{placement,index:entry.index,camera});
  // A split changes the reading lane, never the measured position of the hand.
  return sample;
}

export interface CardPose {x:number;y:number;z:number;sizeScale:number;corners?:Point[]}
export function cardPoseCorners(p:CardPose):Point[]{
  const w=.063*p.sizeScale/2,d=.088*p.sizeScale/2;
  return p.corners??[{x:p.x-w,y:p.y,z:p.z-d},{x:p.x+w,y:p.y,z:p.z-d},{x:p.x+w,y:p.y,z:p.z+d},{x:p.x-w,y:p.y,z:p.z+d}];
}
const clonePose=(p:CardPose):CardPose=>({...p,...(p.corners?{corners:p.corners.map(c=>({...c}))}:{})});
interface Move {from:CardPose;to:CardPose;start:number}
const duration=420;
const same=(a:CardPose,b:CardPose)=>a.x===b.x&&a.y===b.y&&a.z===b.z&&a.sizeScale===b.sizeScale&&Boolean(a.corners)===Boolean(b.corners)&&(!a.corners||a.corners.every((p,i)=>p.x===b.corners![i].x&&p.y===b.corners![i].y&&p.z===b.corners![i].z));

// Presentation clock only. Called after a completed clip or for a covered card
// returning to the flip handoff. No card identity, rank or game state is changed.
export function createCardMotion(){
  const poses=new Map<string,CardPose>(),moves=new Map<string,Move>();
  function sample(key:string,now:number){
    const move=moves.get(key);if(!move)return poses.get(key);
    const t=Math.min(1,Math.max(0,(now-move.start)/duration)),ease=t*t*(3-2*t);
    if(t===1){poses.set(key,clonePose(move.to));moves.delete(key);return poses.get(key);}
    const p:CardPose={x:move.from.x+(move.to.x-move.from.x)*ease,y:move.from.y+(move.to.y-move.from.y)*ease,
      z:move.from.z+(move.to.z-move.from.z)*ease,sizeScale:move.from.sizeScale+(move.to.sizeScale-move.from.sizeScale)*ease};
    if(move.from.corners||move.to.corners){const end=cardPoseCorners(move.to);p.corners=cardPoseCorners(move.from).map((start,i)=>({x:start.x+(end[i].x-start.x)*ease,y:start.y+(end[i].y-start.y)*ease,z:start.z+(end[i].z-start.z)*ease}));}
    poses.set(key,p);return p;
  }
  return {
    sample,
    pin(key:string,p:CardPose){moves.delete(key);poses.set(key,clonePose(p));return p;},
    move(key:string,to:CardPose,now:number,reduced=false){
      const current=sample(key,now);
      if(!current||reduced){moves.delete(key);poses.set(key,clonePose(to));return;}
      if(same(moves.get(key)?.to??current,to))return;
      moves.set(key,{from:clonePose(current),to:clonePose(to),start:now});
    },
    retain(keys:Set<string>){for(const key of poses.keys())if(!keys.has(key)){poses.delete(key);moves.delete(key);}},
    get active(){return moves.size>0;},
  };
}
