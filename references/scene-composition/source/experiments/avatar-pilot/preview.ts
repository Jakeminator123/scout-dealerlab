import type {Project,Shot,PlacementSettings,Placement} from '../../creator/types.ts';
import {errorDetails} from '../../creator/types.ts';
import type {GamePresentation,EditorEvent} from '../../creator/ui-types.ts';
import type {PlaybackIdentity} from '../../creator/sequence-player.ts';
import type {VisualSettings,SettingKey} from './settings.ts';
import type {CameraValues} from './camera-motion.ts';
interface PreviewElements {'asset-label':HTMLElement;'reset-view':HTMLButtonElement;'fullscreen':HTMLButtonElement;'stage':HTMLElement;'world':HTMLCanvasElement;'raw':HTMLVideoElement;'room-label':HTMLElement;'view-label':HTMLElement;'status':HTMLElement;'load-error':HTMLElement;'error-text':HTMLElement;'retry':HTMLButtonElement;'scene-hint':HTMLElement;'light-label':HTMLElement;'settings-panel':HTMLElement;'panel-grip':HTMLElement;'save-state':HTMLElement;'play':HTMLButtonElement;'restart':HTMLButtonElement;'panel-toggle':HTMLButtonElement;'panel-body':HTMLElement;'panel-tabs':HTMLElement;'panel-sections':HTMLElement;'seek':HTMLInputElement;'loop':HTMLInputElement;'speed':HTMLInputElement;'metadata':HTMLElement;'bookmark-status':HTMLElement}
interface CardPicking {assetId:string;points:number[][];frame?:number}
type Gesture={distance:number;zoom:number}|(CameraValues&{x:number;y:number});
import {calibrationBinding,currentCardCalibration} from '../../creator/card-calibration.ts';
import {createCardPreview,createGameCards} from './card-preview.ts';
import * as T from '../../scene/vendor/three.module.js';
import {GroundedSkybox} from '../../scene/vendor/GroundedSkybox.js';
import {createTable,createGround} from '../../scene/furniture.ts';
import {createCardShoe,createSalon} from '../../scene/furniture.ts';
import {createShade,createLeaves} from '../../scene/atmosphere.ts';
import {addAvatarKey} from './avatar-key.ts';
import {addAvatarDepth} from './avatar-depth.ts';
import {releaseVideoSource,createVideoPreloader,createPresentedFrameClock} from './video-source.ts';
const preloader=createVideoPreloader();let avatarGeometryKey='';
let presentedFrameClock:ReturnType<typeof createPresentedFrameClock>|null=null;
import {createCameraMotion,renderPixelRatio,photoBackdropLayout} from './camera-motion.ts';
import {SEATED_POSE} from './pose-config.ts';
import {panoramaRoom} from '../../scene/panorama-room.ts';
import {createEnvironmentFx as createLaFx} from '../../scene/environments/los-angeles.ts';
import {createEnvironmentFx as createVegasFx} from '../../scene/environments/las-vegas.ts';
import {createSettings,normalizeSettings,DEFAULTS,STORAGE_KEY} from './settings.ts';
import {createPanel} from './panel.ts';
import {roomProfile,salonLampLevel} from './room-profile.ts';
import {createStudioEffects} from '../../creator/render-effects.ts';
import {playbackMatches} from '../../creator/sequence-player.ts';

function $<K extends keyof PreviewElements>(id:K):PreviewElements[K];
function $(id:string):HTMLElement;
function $(id:string):HTMLElement{const found=document.getElementById(id);if(!found)throw Error('Missing preview control: '+id);return found;}
const control=(id:string)=>$(id) as HTMLInputElement|HTMLSelectElement;
const canvas=$('world'),stage=$('stage');
let video=$('raw'),avatarLoadAbort:AbortController|undefined,idleSequence=false,lastPlayRequest=-1,cardPreview:ReturnType<typeof createCardPreview>|undefined,cardPreviewEnabled=false,cardPicking:CardPicking|null=null,cardOutline:T.LineLoop<T.BufferGeometry,T.LineBasicMaterial>|null=null,loadedAvatarAssetId:string|null=null,avatarLoading=false,playRevision=0,activePlayback:PlaybackIdentity|null=null,requestedCardPreview=false,gamePresentation:GamePresentation|null=null,gameCards:ReturnType<typeof createGameCards>|null=null;
const placementNow=():PlacementSettings=>({scale:state.scale,height:state.height,x:state.x,depth:state.depth});
const query=new URLSearchParams(location.search),gameMode=query.get('mode')==='play',projectId=/^[a-z0-9-]{1,64}$/.test(query.get('project')??'')?query.get('project'):null;
let sourcePose:Placement=SEATED_POSE;let project:Project|null=null,projectShot:string|null=null,sourceIsSeated=true,tableTexture:T.Texture|null=null,loadedTableAsset:string|null|undefined=null;
if(projectId){try{const response=await fetch('/api/creator/projects/'+projectId);if(response.ok)project=await response.json();}catch{}}
if(query.has('embed'))document.body.classList.add('embedded');
let storage:Pick<Storage,'getItem'|'setItem'>|undefined;try{const prefix=projectId?projectId+(gameMode?'.game.':'.'):'';storage={getItem:(key:string)=>localStorage.getItem(prefix+key),setItem:(key:string,value:string)=>localStorage.setItem(prefix+key,value)};}catch{}
const poseSettings=(p:Project|null):Partial<PlacementSettings>=>p&&p.dealer.calibration?.keystone===p.keystone?p.dealer.calibration??{}:{scale:100,height:0,x:0,depth:0};
const store=createSettings(storage),reduced=matchMedia('(prefers-reduced-motion: reduce)');
if(project)store.update({...poseSettings(project),avatar:'project',environment:project.environment.preset,daylight:project.environment.daylight,leaves:project.environment.effects.find(effect=>effect.id==='leaves')?.enabled??DEFAULTS.leaves,tableWidth:100,tableHeight:82,...(gameMode?{view:'table',avatarVisible:true,greenKey:true,loop:true,speed:100,...(!store.restored?{zoom:110}:{})}:{} )});
let state=store.value,ready=false,paused=reduced.matches,frame=0,last=0,time=0,fxTime=0,lastUi=0,cycle:{from:number;to:number;elapsed:number}|null=null;
let renderer:T.WebGLRenderer,world:T.Scene,camera:T.PerspectiveCamera,rawWorld:T.Scene,rawCamera:T.OrthographicCamera,rawPlane:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>,texture:T.Texture|undefined,table:Awaited<ReturnType<typeof createTable>>,ground:Awaited<ReturnType<typeof createGround>>,sky:T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>|null=null,environment:T.WebGLRenderTarget|null=null,panorama:T.Texture<HTMLImageElement>|null=null,roomFx:ReturnType<typeof createLaFx>|ReturnType<typeof createVegasFx>|null=null,leafEffect:ReturnType<typeof createLeaves>;
let customPanorama=false,roomClock:T.Object3D|undefined;
let cardShoe:ReturnType<typeof createCardShoe>|undefined;
let salon:ReturnType<typeof createSalon>|undefined;
let roomClockMaterials:T.Material[]=[];
let dealer:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>,dealerFrame:T.LineSegments<T.EdgesGeometry,T.LineBasicMaterial>,material:T.MeshBasicMaterial,key:ReturnType<typeof addAvatarKey>,depthLayer:ReturnType<typeof addAvatarDepth>,light:T.DirectionalLight,ambient:T.HemisphereLight,shadow:T.ShadowMaterial,pmrem:T.PMREMGenerator,room='forest',loadRevision=0,loadedQuality='',studioFx:ReturnType<typeof createStudioEffects>;
let dirty=true,shadowDirty=true,avatarRevision=0,sourceWidth=1080,sourceHeight=1920,sourceFps:number|null=24,sourceKind='seated',resizePending=false,inFrame=false;
const motion=createCameraMotion(state);
const shade=createShade(),disposables:Array<{dispose?:()=>void}>=[],clockStart=Date.now();
const dayColor=new T.Color(0xffe7c6),eveningColor=new T.Color(0xffa055),cloudColor=new T.Color(0xbac9df);
const roomNames:Record<string,string>={forest:'Natur · skog',la:'Los Angeles',vegas:'Las Vegas',custom:'Egen miljö'};
const panel=createPanel({store,onAction,storage,initialHeight:query.has('embed')?68:300});
const limit=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
function notice(text=''){ $('status').textContent=text;$('status').hidden=!text; }
function showError(text:string){$('error-text').textContent=text;$('load-error').hidden=false;notice();if(project)parent.postMessage({type:'creator-playback-error',...requestedPlayback(),message:text},location.origin);}
function stopCycle(){cycle=null;const button=document.querySelector<HTMLButtonElement>('[data-action="sun-cycle"]')!;const profile=roomProfile(room);button.textContent=profile.sunrise?'Spela soluppgång · 45 s':profile.lighting==='sun'?'Spela solnedgång · 45 s':'Spela ljusförlopp · 45 s';button.setAttribute('aria-pressed','false');}
function wake(){dirty=true;if(ready&&!frame&&!inFrame&&!document.hidden){last=0;frame=requestAnimationFrame(tick);}}
function requestedPlayback(){return {projectId,shotId:projectShot,assetId:project?.shots.find(s=>s.id===projectShot)?.assetId,playRequest:lastPlayRequest};}
function playUi(){ $('play').textContent=paused?'Spela rörelser':'Pausa rörelser';$('play').setAttribute('aria-pressed',String(!paused));$('restart').disabled=sourceKind==='seated';if(!avatarLoading&&playbackMatches(activePlayback,requestedPlayback()))parent.postMessage({type:'creator-playback',...activePlayback,paused},location.origin); }
async function play(){if(!ready)return;const intent=++playRevision,element=video;paused=false;playUi();wake();try{if(sourceKind==='idle')await element.play();if(intent!==playRevision||element!==video)return;notice();}catch(error){if(intent!==playRevision||element!==video)return;paused=true;if(errorDetails(error).name!=='AbortError')notice('Tryck Spela för att starta klippet.');}playUi();wake();}
function pause(){playRevision++;video.pause();paused=true;notice();playUi();wake();}
function front(){pointers.clear();gesture=null;motion.set({orbit:0,zoom:100,yaw:0,pitch:0});store.update({seat:4,orbit:0,zoom:100,yaw:0,pitch:0});wake();}
function onAction(action:string,value?:string|number){
  if(gameMode&&['reset-dealer','reset-all','restore-view','seek'].includes(action))return;
  if(action==='setting'){if(value==='daylight'||value==='environment')stopCycle();return;}
  const presets:Record<string,Partial<VisualSettings>>={day:{daylight:100,cloud:0,autoCloud:false,exposure:100},evening:{daylight:25,cloud:0,autoCloud:false,exposure:100},overcast:{daylight:100,cloud:85,autoCloud:false,exposure:100}};
  if(presets[action]){stopCycle();store.update(presets[action]);return;}
  if(action==='front')front();
  if(action==='reset-dealer')store.update(Object.fromEntries((['avatarVisible','scale','height','x','depth','brightness','lightSync','greenKey','frame'] as const).map(k=>[k,DEFAULTS[k]])));
  if(action==='reset-all'){stopCycle();store.reset();}
  if(action==='seek'&&ready&&sourceKind==='idle'){const time=limit(Number(value),0,video.duration-(sourceFps?1/sourceFps:.001));video.currentTime=sourceFps?Math.round(time*sourceFps)/sourceFps:time;panel.timeline(video.currentTime,video.duration);wake();}
  if(action==='sun-cycle'&&ready){if(cycle){stopCycle();return;}const from=room==='la'?0:100,to=room==='la'?100:0;store.update({daylight:from});cycle={from,to,elapsed:0};const b=document.querySelector<HTMLButtonElement>('[data-action="sun-cycle"]')!;b.textContent='Stoppa ljusförlopp';b.setAttribute('aria-pressed','true');void play();}
  if(action==='save-view'){try{if(!storage)throw Error();storage.setItem(STORAGE_KEY+'.bookmark',JSON.stringify(state));$('bookmark-status').textContent='Vyn är sparad. Du kan fortsätta justera och hämta den igen.';}catch{$('bookmark-status').textContent='Webbläsaren kunde inte spara vyn.';}}
  if(action==='restore-view'){try{const saved=storage?.getItem(STORAGE_KEY+'.bookmark');if(!saved){$('bookmark-status').textContent='Spara en vy först.';return;}stopCycle();store.update(normalizeSettings(JSON.parse(saved)));$('bookmark-status').textContent='Den sparade vyn är hämtad.';}catch{$('bookmark-status').textContent='Den sparade vyn kunde inte läsas.';}}
}
function resize(){if(!renderer)return;const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),aspect=w/h;renderer.setPixelRatio(renderPixelRatio(w,h,devicePixelRatio));renderer.setSize(w,h,false);camera.aspect=aspect;const fit=Math.max(1,(sourceWidth/sourceHeight)/aspect);rawCamera.left=-aspect*fit;rawCamera.right=aspect*fit;rawCamera.top=fit;rawCamera.bottom=-fit;rawCamera.updateProjectionMatrix();cameraView();wake();}
function scheduleResize(){if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;resize();});}
function cameraView(){const c=motion.value,angle=c.orbit*Math.PI/180,radius=state.view==='body'?4.15:2.9;camera.position.set(Math.sin(angle)*radius,state.eyeHeight/100,Math.cos(angle)*radius+.08);camera.lookAt(0,state.view==='body'?.83:.95,.05);camera.rotateY(-c.yaw*Math.PI/180);camera.rotateX(c.pitch*Math.PI/180);const fit=Math.max(1,Math.min(1.65,1.6/camera.aspect));camera.fov=2*Math.atan(Math.tan(24*Math.PI/180)*100/c.zoom*fit)*180/Math.PI;camera.updateProjectionMatrix();}
function place(){const scale=state.scale/100,handHeight=sourcePose.handHeight*(project?1:state.tableHeight/82),reach=.46;dealer.scale.setScalar(scale);const y=sourceIsSeated?handHeight+(sourcePose.fingertipSourceY-.5)*sourcePose.planeHeight*scale:1.04*scale-.09;dealer.position.set(state.x/100,y+state.height/100,(sourceIsSeated?sourcePose.depth-reach:-.56)+state.depth/100);depthLayer.set(sourceIsSeated?reach/scale:0,sourceWidth/sourceHeight,(project?.table.feltTop??.809)*(project?1:state.tableHeight/82)+.006,project?.shots.find(shot=>shot.id===projectShot)?.experimental? .56:.80);dealer.visible=state.avatarVisible;dealerFrame.visible=state.frame&&state.avatarVisible;dealerFrame.position.copy(dealer.position);dealerFrame.scale.copy(dealer.scale);table.group.scale.set(project?1:state.tableWidth/100,project?1:state.tableHeight/82,1);shadowDirty=true;if(project)parent.postMessage({type:'creator-placement',keystone:project.keystone,settings:Object.fromEntries((['scale','height','x','depth'] as const).map(k=>[k,state[k]]))},location.origin);}
function updateView(){table.group.visible=state.view==='table';shadowDirty=true;canvas.setAttribute('aria-label',state.view==='raw'?'Original mot grönt':state.view==='body'?'Frilagd helkropp i rummet':'Dealer och blackjackbord');$('view-label').textContent=({table:'Bakom bordet',body:'Hela kroppen',raw:'Original mot grönt'} as Record<string,string>)[state.view];$('scene-hint').textContent=state.view==='raw'?'Oförändrad originalbild · kamera och ljus påverkar inte denna vy':state.dragMode==='orbit'?'Dra för att flytta runt bordet · skrolla för zoom':'Dra för att titta · skrolla för zoom';cameraView();}
async function loadAvatar(){
  avatarLoading=true;activePlayback=null;if(!gamePresentation)cardPreview?.clear();else video.pause();cardPicking=null;if(cardOutline)cardOutline.visible=false;const revision=++avatarRevision;avatarLoadAbort?.abort();avatarLoadAbort=new AbortController();
  const asset=state.avatar==='project'?project?.assets.find(a=>a.id===(project?.shots.find(s=>s.id===projectShot)?.assetId??project?.keystone)):null;
  const target=asset?(asset.mime==='video/mp4'?'idle':'seated'):state.avatar==='project'?'seated':state.avatar;
  const nextPose={...SEATED_POSE,...(asset?.metadata?.placement??project?.dealer.placement??{})};
  const url=asset?projectAsset(asset.id):target==='seated'?SEATED_POSE.url:'/idle.mp4';
  notice('Laddar '+(target==='seated'?'sittande grundpose':'dealerklipp')+'…');
  for(const id of ['seek','speed','loop'])control(id).disabled=true;
  let next:T.Texture,nextVideo:HTMLVideoElement|undefined;
  try{
    if(target==='seated')next=await new T.TextureLoader().loadAsync(url);
    else{nextVideo=await preloader.take(url,{signal:avatarLoadAbort.signal});next=new T.VideoTexture(nextVideo);next.needsUpdate=true;}
  }catch(error){if(revision!==avatarRevision)return;avatarLoading=false;throw error;}
  if(revision!==avatarRevision){next?.dispose();if(nextVideo)releaseVideoSource(nextVideo);return;}
  loadedAvatarAssetId=asset?.id??null;avatarLoading=false;activePlayback=asset?.id===requestedPlayback().assetId?requestedPlayback():null;sourceIsSeated=Boolean(asset)||target==='seated';sourcePose=nextPose;
  sourceFps=asset?(asset.metadata?.fps??project?.shots.find(s=>s.id===projectShot)?.fps??null):24;
  if(nextVideo){const previous=video;nextVideo.id='raw';nextVideo.hidden=true;previous.replaceWith(nextVideo);video=nextVideo;bindVideo(video);releaseVideoSource(previous);}else video.pause();
  next.colorSpace=T.SRGBColorSpace;sourceKind=target;sourceWidth=target==='seated'?(next.image as HTMLImageElement).naturalWidth:video.videoWidth;sourceHeight=target==='seated'?(next.image as HTMLImageElement).naturalHeight:video.videoHeight;
  const mapKindChanged=Boolean(texture instanceof T.VideoTexture)!==Boolean(next instanceof T.VideoTexture)||!texture;texture?.dispose();texture=next;material.map=texture;rawPlane.material.map=texture;if(mapKindChanged){material.needsUpdate=true;rawPlane.material.needsUpdate=true;}
  const height=sourceIsSeated?sourcePose.planeHeight:2.08,geometryKey=[height,sourceWidth/sourceHeight,sourceIsSeated].join(':');
  if(geometryKey!==avatarGeometryKey){avatarGeometryKey=geometryKey;dealer.geometry.dispose();dealer.geometry=new T.PlaneGeometry(height*sourceWidth/sourceHeight,height,sourceIsSeated?192:1,sourceIsSeated?160:1);dealerFrame.geometry.dispose();dealerFrame.geometry=new T.EdgesGeometry(dealer.geometry);rawPlane.geometry.dispose();rawPlane.geometry=new T.PlaneGeometry(2*sourceWidth/sourceHeight,2);}key.set(state.greenKey,sourceWidth,sourceHeight);
  $('asset-label').textContent=asset?asset.label:target==='seated'?'SITTANDE GRUNDPOSE':'TIDIGARE STÅENDE IDLE';
  $('metadata').textContent=sourceWidth+' × '+sourceHeight+(target==='seated'?' · stillbild · händer över filten.':' · '+video.duration.toFixed(2)+' s · '+(sourceFps?sourceFps+' fps':'bildfrekvens ej uppmätt')+' · '+(asset?'ny tagning':'tidigare stående prov')+'.');
  video.loop=idleSequence?false:state.loop;video.playbackRate=state.speed/100;cardPreviewEnabled=requestedCardPreview&&Boolean(currentCardCalibration(project,project?.shots.find(s=>s.id===projectShot),placementNow()));place();resize();playUi();notice();$('load-error').hidden=true;if(ready&&!paused)await play();wake();
  for(const id of ['seek','speed','loop'])control(id).disabled=target==='seated'||gameMode&&id!=='speed';$('seek').step=sourceFps?String(1/sourceFps):'any';
}
function projectAsset(id:string){return '/api/creator/projects/'+project!.id+'/assets/'+id;}
function updateTable(){table.setFinish(state.finish);table.setView(state.material);const colors:Record<string,number>={moss:0x294b3a,blue:0x183548,burgundy:0x4a202d};if(colors[state.felt])table.materials[2].color.setHex(colors[state.felt]);if(project){for(const [index,name]of (['wood','rail','felt'] as const).entries())table.materials[index].color.set(project.table[name]);if(tableTexture&&state.material==='photo'){table.materials[0].map=tableTexture;table.materials[0].needsUpdate=true;}}}
async function applyProject(next:Project,shotId:string|null,sequence=false,playRequest=0,playbackPaused:boolean|null=null,previewCards=false){
  if(!next||next.id!==projectId)return;const requested=playRequest!==lastPlayRequest;lastPlayRequest=playRequest;idleSequence=sequence;requestedCardPreview=Boolean(previewCards);video.loop=idleSequence?false:state.loop;if(requested){activePlayback=null;paused=sequence&&playbackPaused===true;if(paused)video.pause();playUi();}
  const oldAsset=project?.shots.find(s=>s.id===projectShot)?.assetId??project?.keystone,oldEnvironment=project?.environment.assetId;
  const calibrationChanged=project?.keystone!==next.keystone||JSON.stringify(project?.dealer.calibration)!==JSON.stringify(next.dealer.calibration);
  project=next;projectShot=shotId??null;syncStudioEffects();
  const newAsset=project.shots.find(s=>s.id===projectShot)?.assetId??project.keystone,oldAvatar=state.avatar;
  store.update({...(calibrationChanged?poseSettings(project):{}),...(requested&&sequence?{view:'table',avatarVisible:true}:{}),avatar:'project',environment:project.environment.preset,daylight:project.environment.daylight,leaves:project.environment.effects.find(effect=>effect.id==='leaves')?.enabled??DEFAULTS.leaves,tableWidth:100,tableHeight:82});
  if(!ready)return;
  if(oldAsset!==newAsset&&oldAvatar==='project')await loadAvatar();
  if(playRequest!==lastPlayRequest||(shotId??null)!==projectShot)return;
  if(!avatarLoading&&loadedAvatarAssetId===newAsset){activePlayback=requestedPlayback();cardPreviewEnabled=requestedCardPreview&&Boolean(currentCardCalibration(project,project.shots.find(s=>s.id===projectShot),placementNow()));if(requested&&sourceKind==='idle'&&oldAsset===newAsset){video.currentTime=0;if(!paused)await play();else pause();}}
  $('loop').disabled=sourceKind==='seated'||idleSequence||gameMode;
  if(oldEnvironment!==project.environment.assetId){loadedQuality='';await loadRoom();}
  if(loadedTableAsset!==project.table.assetId){loadedTableAsset=project.table.assetId;tableTexture?.dispose();tableTexture=null;if(loadedTableAsset){tableTexture=await new T.TextureLoader().loadAsync(projectAsset(loadedTableAsset));tableTexture.colorSpace=T.SRGBColorSpace;tableTexture.wrapS=tableTexture.wrapT=T.RepeatWrapping;}}
  updateTable();place();wake();
}
window.addEventListener('message',(event:MessageEvent<EditorEvent>)=>{if(event.origin!==location.origin||event.source!==parent)return;const d=event.data;if(d?.type==='creator-preload'&&d.projectId===projectId){const shot=project?.shots.find(s=>s.id===d.shotId),asset=project?.assets.find(a=>a.id===shot?.assetId);preloader.warm(shot?.compatible&&shot.status!=='rejected'&&asset?.mime==='video/mp4'&&asset.id!==loadedAvatarAssetId?projectAsset(asset.id):null);return;}if(d?.type==='creator-project'){gamePresentation=d.game??null;gameCards?.set(gamePresentation,d.project);}if(d?.type==='creator-project')void applyProject(d.project,d.shotId,d.idleSequence,d.playRequest,d.playbackPaused,d.previewCards).catch(e=>{if(d.playRequest===lastPlayRequest&&d.shotId===projectShot)showError(e.message);});if(d?.type==='creator-playback-control'&&playbackMatches(d,requestedPlayback())){if(d.action==='pause')pause();else if(d.action==='play'){if(avatarLoading){paused=false;playUi();}else void play();}}});
function syncStudioEffects(){
  // LA and Vegas keep their own clocks instead of also showing the generic clock.
  studioFx?.set(project?.environment.effects.map(effect=>roomFx&&effect.id==='clock'?{...effect,enabled:false}:effect));
}
function disposeRoomEffects(){
  roomFx?.dispose();roomFx=null;roomClock=undefined;
  for(const material of roomClockMaterials)material.dispose();roomClockMaterials=[];
}
function prepareRoomEffects(){
  const name=roomProfile(room).clockName;
  roomClock=name?roomFx?.group.getObjectByName(name):undefined;
  // Native clocks share finishes with room fixtures. Give clock opacity its own copies.
  const copies=new Map<T.Material,T.Material>();
  const copy=(material:T.Material)=>{if(!copies.has(material))copies.set(material,material.clone());return copies.get(material)!;};
  roomClock?.traverse(object=>{if(object instanceof T.Mesh)object.material=Array.isArray(object.material)?object.material.map(copy):copy(object.material);});
  roomClockMaterials=[...copies.values()];syncStudioEffects();
}
function updateRoomEffects(){
  if(!roomFx)return;
  const clock=project?.environment.effects.find(effect=>effect.id==='clock'),lamp=project?.environment.effects.find(effect=>effect.id==='light');
  const clockStrength=project?(clock?.enabled?clock.intensity/100:0):1;
  const clockSpeed=project?(clock?.speed??0)/100:1,lampSpeed=project?(lamp?.enabled?lamp.speed/100:0):1;
  const lampStrength=project&&lamp?.enabled?lamp.intensity/100:1;
  roomFx.group.visible=state.effects;
  roomFx.update({time:fxTime*lampSpeed,date:new Date(clockStart+fxTime*clockSpeed*1000)});
  if(roomClock)roomClock.visible=clockStrength>0;
  for(const material of roomClockMaterials){const transparent=clockStrength<1;if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}material.opacity=clockStrength;}
  if(room==='vegas')roomFx.group.traverse(object=>{
    if(object instanceof T.PointLight)object.intensity*=lampStrength;
    if(object instanceof T.Mesh&&object.material instanceof T.MeshBasicMaterial)object.material.color.multiplyScalar(lampStrength);
  });
}
async function loadRoom(){
  const target=state.environment==='custom'&&!project?.environment.assetId?'forest':state.environment,requested=state.quality,revision=++loadRevision;
  const width=target==='forest'?Math.min(Number(requested),renderer.capabilities.maxTextureSize>=4096?4096:2048):requested==='1024'?1024:1774;
  if(room===target&&loadedQuality===String(width)&&sky)return;
  const file=target==='forest'?`panorama-${width}.avif`:`${target==='la'?'la':'vegas'}-panorama${width===1024?'-1k':''}.jpg`;
  notice('Laddar '+roomNames[target]+'…');
  try{
    const next=await new T.TextureLoader().loadAsync(target==='custom'?projectAsset(project!.environment.assetId!):'/assets/'+file);if(revision!==loadRevision){next.dispose();return;}
    const roomAsset=project?.assets.find(a=>a.id===project?.environment.assetId),profile=roomProfile(target,state.daylight,roomAsset?.metadata?.projection);customPanorama=target==='custom'&&profile.backdrop==='panorama';
    next.colorSpace=T.SRGBColorSpace;let nextEnvironment=null;if(target!=='custom'||customPanorama){next.mapping=T.EquirectangularReflectionMapping;nextEnvironment=pmrem.fromEquirectangular(next);}
    if(sky){world.remove(sky);sky.geometry.dispose();sky.material.dispose();}panorama?.dispose();environment?.dispose();disposeRoomEffects();
    sky=profile.backdrop==='panorama'?panoramaRoom(next,customPanorama?(roomAsset?.metadata.rotation??Math.PI/2):target==='la'?Math.PI/2:0):profile.backdrop==='photo'?new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:next,depthWrite:false})):new GroundedSkybox(next,8,60,96);
    if(profile.backdrop==='grounded')sky.position.y=8;else if(profile.backdrop==='panorama')sky.position.copy(camera.position);
    shade.apply(sky.material);world.add(sky);panorama=next;environment=nextEnvironment;world.environment=environment?.texture??null;
    roomFx=target==='la'?createLaFx(T):target==='vegas'?createVegasFx(T):null;if(roomFx)world.add(roomFx.group);
    room=target;prepareRoomEffects();loadedQuality=String(width);ground.visible=room==='forest';$('room-label').textContent=customPanorama?'Projektets panorama':roomNames[room];notice();stopCycle();shadowDirty=true;wake();
  }catch(error){if(revision!==loadRevision)return;if(!sky)throw error;notice('Miljön kunde inte läsas. Föregående miljö visas.');store.update({environment:room,quality:loadedQuality==='1774'?'2048':loadedQuality});}
}
// Photo-only framing: optical zoom plus a bounded pan, without bent columns
// or exposed image edges. Only actual scene geometry has positional parallax.
const photoDirection=new T.Vector3(),photoOffset=new T.Vector3();
function placePhotoBackdrop(){
  if(room!=='custom'||customPanorama||!sky||!panorama?.image)return;
  const distance=80,layout=photoBackdropLayout({aspect:camera.aspect,imageAspect:panorama.image.width/panorama.image.height,...motion.value});
  sky.scale.set(layout.width*distance,layout.height*distance,1);
  camera.getWorldDirection(photoDirection);sky.position.copy(camera.position).addScaledVector(photoDirection,distance);
  photoOffset.set(layout.x*distance,layout.y*distance,0).applyQuaternion(camera.quaternion);sky.position.add(photoOffset);
  sky.quaternion.copy(camera.quaternion);
}
function updateLight(){
  const builtRoom=room==='custom'&&state.roomGeometry;
  if(salon){
    salon.group.visible=builtRoom;
    const lamp=project?.environment.effects.find(effect=>effect.id==='light');
    const flicker=state.effects&&!reduced.matches&&lamp?.enabled?salonLampLevel(fxTime*lamp.speed/100):1;
    salon.update(1-(1-flicker)*(lamp?.intensity??100)/100);
  }
  if(sky)sky.visible=!builtRoom;
  const backdropLabel=builtRoom?'Byggd 3D-salong':customPanorama?`Panorama · ${panorama?.image?.width??'?'} × ${panorama?.image?.height??'?'}`:roomNames[room];
  if($('room-label').textContent!==backdropLabel)$('room-label').textContent=backdropLabel;
  placePhotoBackdrop();
  const profile=roomProfile(room,state.daylight,customPanorama?'equirectangular':undefined),dusk=1-state.daylight/100;
  const cloud=profile.weather?(state.autoCloud?Math.max(state.cloud/100,Math.pow(Math.max(0,Math.sin(time*.17)),2)*.9):state.cloud/100):0;
  const modulation=project&&state.effects?studioFx.light(fxTime):1;
  const sun=(1-cloud*.88)*(1-.88*dusk)*modulation;
  if(profile.lighting==='sun'){
    light.position.set(-3.5+1.7*dusk,7-6.2*dusk,3.5);light.intensity=2.7*sun;
    light.color.copy(dayColor).lerp(eveningColor,dusk).lerp(cloudColor,cloud*.45);
    ambient.intensity=(.85+cloud*.1)*(1-dusk*.5);ambient.color.set(0xd9e6ec);ambient.groundColor.set(0x49533b);
    world.environmentIntensity=(1.1-cloud*.25)*(1-dusk*.6);
  }else{
    // Neutral fill keeps dark table finishes readable without rewriting their colors.
    light.position.set(-3.5,5,3.5);light.intensity=profile.keyIntensity*modulation;light.color.set(room==='vegas'?0xffeee0:0xffffff);
    ambient.intensity=profile.fillIntensity;ambient.color.set(0xf0f2f5);ambient.groundColor.set(0x777777);
    world.environmentIntensity=profile.reflectionIntensity;
  }
  const r=profile.lighting==='sun'?(1-cloud*.24)*(1-dusk*.30):profile.backdropBrightness;
  const g=profile.lighting==='sun'?(1-cloud*.21)*(1-dusk*.48):profile.backdropBrightness;
  const b=profile.lighting==='sun'?(1-cloud*.15)*(1-dusk*.58):profile.backdropBrightness;
  if(sky){sky.material.color.setRGB(r,g,b);if(profile.backdrop==='panorama')sky.position.copy(camera.position);}
  const boost=state.brightness/100;material.color.setRGB(state.lightSync?r*boost:boost,state.lightSync?g*boost:boost,state.lightSync?b*boost:boost);
  material.userData.studyShadeWeight.value=state.lightSync&&profile.spatialShade?1:0;
  if(room==='vegas'&&sky){const lamp=project?.environment.effects.find(effect=>effect.id==='light'),speed=project?(lamp?.enabled?lamp.speed/100:0):1,pulse=.5+.5*Math.sin(fxTime*speed*Math.PI/5);sky.material.color.setRGB(r*(.96+.04*pulse),g*(.94+.04*pulse),b);}
  shade.update(dusk,state.spatialShade&&profile.spatialShade);light.castShadow=state.shadows;shadow.opacity=state.shadows?.16+.24*sun:0;
  renderer.toneMappingExposure=1.05*state.exposure/100;
}
function tick(now:number){
  frame=0;if(document.hidden)return;inFrame=true;const dt=last?Math.max(0,(now-last)/1000):0;last=now;
  const movement=motion.step(Math.min(dt,.1),reduced.matches);if(movement.changed){cameraView();dirty=true;}
  if(!paused){time+=dt*state.wind/100;if(state.effects)fxTime+=dt;if(cycle){cycle.elapsed+=dt;const p=limit(cycle.elapsed/45,0,1);store.update({daylight:Math.round(cycle.from+(cycle.to-cycle.from)*p)});if(p>=1)stopCycle();}}
  const animated=Boolean(gameCards?.active)||!paused&&(sourceKind==='idle'||cycle||state.view!=='raw'&&(room==='forest'&&(state.leaves||state.autoCloud)||roomFx&&state.effects||project&&state.effects&&studioFx.active()));
  const updateUi=dirty||now-lastUi>200;
  if(dirty||animated){
    const leaves=project?studioFx.leaves():null;leafEffect.mesh.count=leaves?Math.round(36*leaves.intensity/100):36;
    leafEffect.update(time*(leaves?leaves.speed/100:1),state.leaves&&(leaves?leaves.enabled:room==='forest'));
    if(studioFx){studioFx.group.visible=Boolean(project)&&state.effects;studioFx.update(fxTime);}
    updateRoomEffects();
    updateLight();
    // Static table shadows do not need a second geometry pass every camera frame.
    if(state.view!=='raw'&&shadowDirty){renderer.shadowMap.needsUpdate=true;shadowDirty=false;}
    const shot=project?.shots.find(s=>s.id===projectShot),loaded=!avatarLoading&&loadedAvatarAssetId===shot?.assetId&&state.view==='table'&&sourceKind==='idle';
    const cardTime=presentedFrameClock?.time??video.currentTime;
    if(!avatarLoading)cardPreview?.update(project,shot,cardTime,placementNow(),(cardPreviewEnabled||Boolean(gamePresentation?.cue))&&loaded,loaded,!gamePresentation,camera.position);
    gameCards?.update(project,shot,cardTime,placementNow(),loaded,camera.position);if(gameCards)gameCards.group.visible=Boolean(gamePresentation)&&state.view==='table';
    if(cardShoe)cardShoe.group.visible=Boolean(project)&&state.view==='table';
    renderer.render(state.view==='raw'?rawWorld:world,state.view==='raw'?rawCamera:camera);dirty=false;
  }
  if(updateUi){lastUi=now;panel.timeline(sourceKind==='idle'?video.currentTime:0,sourceKind==='idle'?video.duration:0);$('light-label').textContent=state.view==='raw'?(sourceKind==='idle'?'Original · '+(sourceFps?sourceFps+' fps':'bildfrekvens ej uppmätt'):'Original · stillbild'):room==='vegas'?'Neon · '+state.daylight+' %':room==='custom'?'Rummets ljus · '+state.daylight+' %':state.daylight<60?'Skymning · '+state.daylight+' %':room==='forest'&&state.cloud>50?'Molnigt':'Dagsljus';}
  inFrame=false;if((movement.moving||animated)&&!frame)frame=requestAnimationFrame(tick);
}
store.subscribe((next,changed)=>{state=next;motion.set(Object.fromEntries(changed.map(k=>[k,state[k]])));if(ready){if(changed.some(k=>['environment','quality'].includes(k)))void loadRoom();if(changed.includes('avatar'))void loadAvatar().catch(error=>showError(error.message));if(changed.some(k=>['view','dragMode','eyeHeight'].includes(k)))updateView();if(changed.some(k=>['scale','height','x','depth','avatarVisible','frame','tableWidth','tableHeight'].includes(k)))place();if(changed.some(k=>['finish','material','felt'].includes(k)))updateTable();if(changed.some(k=>['daylight','shadows','effects'].includes(k)))shadowDirty=true;if(project&&changed.includes('environment')&&state.environment!==project.environment.preset)parent.postMessage({type:'creator-environment',value:state.environment},location.origin);if(project&&changed.includes('leaves')&&state.leaves!==project.environment.effects.find(effect=>effect.id==='leaves')?.enabled)parent.postMessage({type:'creator-effect',id:'leaves',enabled:state.leaves},location.origin);if(project&&changed.includes('daylight')&&state.daylight!==project.environment.daylight)parent.postMessage({type:'creator-daylight',value:state.daylight},location.origin);key.set(state.greenKey,sourceWidth,sourceHeight);video.loop=idleSequence?false:state.loop;video.playbackRate=state.speed/100;wake();}panel.saveStatus(storage?'Sparas i webbläsaren':'Sparning ej tillgänglig');});
$('play').addEventListener('click',()=>{if(paused)void play();else pause();});
$('restart').addEventListener('click',()=>{video.currentTime=0;void play();});
$('reset-view').addEventListener('click',front);$('retry').addEventListener('click',()=>location.reload());
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{notice('Helskärm är inte tillgängligt i denna webbläsare.');}});
function postFrame(element:HTMLVideoElement,field?:string){if(element!==video||avatarLoading||!project||sourceKind!=='idle'||!sourceFps)return;const shot=project.shots.find(s=>s.id===projectShot);if(!shot||shot.assetId!==loadedAvatarAssetId||!playbackMatches(activePlayback,requestedPlayback()))return;parent.postMessage({type:field?'creator-frame-picked':'creator-frame',field,...activePlayback,frame:Math.min((shot.frameCount??Infinity)-1,Math.max(0,Math.floor(element.currentTime*sourceFps+0.0001))),fps:sourceFps,paused:element.paused,seeking:element.seeking},location.origin);}
function bindVideo(element:HTMLVideoElement){presentedFrameClock?.dispose();presentedFrameClock=createPresentedFrameClock(element);for(const event of ['seeking','seeked','loadeddata','pause','play'])element.addEventListener(event,()=>postFrame(element));element.addEventListener('ended',()=>{if(element!==video||avatarLoading||!element.ended||element.seeking||!playbackMatches(activePlayback,requestedPlayback()))return;if(idleSequence&&!paused)parent.postMessage({type:'creator-clip-ended',...activePlayback},location.origin);else if(!state.loop)pause();});element.addEventListener('seeked',wake);element.addEventListener('loadeddata',wake);element.addEventListener('error',()=>{if(element===video&&sourceKind==='idle')showError('Klippet kunde inte läsas. Välj ett annat klipp eller försök igen.');});}bindVideo(video);
const pointers=new Map<number,{x:number;y:number}>();let gesture:Gesture|null=null;
function startGesture(){const p=[...pointers.values()],c=motion.target;gesture=!p.length?null:p.length===2?{distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:c.zoom}:{...c,x:p[0].x,y:p[0].y};}
function commitCamera(){store.update(motion.target);}
canvas.addEventListener('pointerdown',e=>{if(cardPicking&&state.view==='raw'&&e.button===0){pickCardPoint(e);return;}if(state.view==='raw'||e.button!==0)return;canvas.focus();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);startGesture();});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;if(e.pointerType==='mouse'&&e.buttons===0){pointers.delete(e.pointerId);commitCamera();startGesture();return;}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...pointers.values()];if(p.length===2&&'distance' in gesture&&gesture.distance>0)motion.set({zoom:gesture.zoom*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/gesture.distance});else if(p.length===1&&'x' in gesture){const delta=(e.clientX-gesture.x)/stage.clientWidth*120;motion.set({[state.dragMode==='orbit'?'orbit':'yaw']:gesture[state.dragMode==='orbit'?'orbit':'yaw']-delta,pitch:gesture.pitch+(e.clientY-gesture.y)/stage.clientHeight*80});}wake();});
for(const name of ['pointerup','pointercancel','lostpointercapture'] as const)canvas.addEventListener(name,e=>{if(!pointers.delete(e.pointerId))return;commitCamera();startGesture();});
window.addEventListener('blur',()=>{if(pointers.size){pointers.clear();gesture=null;commitCamera();}});
let wheelTimer:ReturnType<typeof setTimeout>|undefined;
canvas.addEventListener('wheel',e=>{if(state.view==='raw'||e.ctrlKey)return;e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1);motion.set({zoom:motion.target.zoom*Math.exp(-pixels*.0015)});wake();clearTimeout(wheelTimer);wheelTimer=setTimeout(commitCamera,180);},{passive:false});
canvas.addEventListener('keydown',e=>{if(state.view==='raw')return;const updates:Record<string,Partial<VisualSettings>>={ArrowLeft:{yaw:state.yaw-2},ArrowRight:{yaw:state.yaw+2},ArrowUp:{pitch:state.pitch+2},ArrowDown:{pitch:state.pitch-2},'+':{zoom:state.zoom+5},'=':{zoom:state.zoom+5},'-':{zoom:state.zoom-5}};if(e.key==='Home'){e.preventDefault();front();}else if(updates[e.key]){e.preventDefault();store.update(updates[e.key]);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();cancelAnimationFrame(frame);frame=0;commitCamera();store.flush();}else if(ready){last=0;wake();if(!paused)void play();}});
reduced.addEventListener('change',e=>{if(e.matches)pause();});
window.addEventListener('pagehide',e=>{preloader.clear();avatarLoadAbort?.abort();video.pause();commitCamera();cancelAnimationFrame(frame);frame=0;store.flush();if(!e.persisted){presentedFrameClock?.dispose();texture?.dispose();tableTexture?.dispose();studioFx?.dispose();for(const item of disposables)item.dispose?.();disposeRoomEffects();environment?.dispose();panorama?.dispose();renderer?.dispose();}});
window.addEventListener('pageshow',e=>{if(e.persisted&&ready){last=0;if(!frame)frame=requestAnimationFrame(tick);if(!paused)void play();}});

try{
  renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});renderer.setClearColor(0x20361e);renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;
  world=new T.Scene();camera=new T.PerspectiveCamera(48,1,.05,120);rawWorld=new T.Scene();rawWorld.background=new T.Color(0x173d12);rawCamera=new T.OrthographicCamera(-1,1,1,-1,.1,2);rawCamera.position.z=1;cameraView();resize();new ResizeObserver(scheduleResize).observe(stage);
  pmrem=new T.PMREMGenerator(renderer);disposables.push(pmrem);
  const loader=new T.TextureLoader();
  const [model,terrain]=await Promise.all([createTable(loader,renderer),createGround(loader,renderer)]);table=model;ground=terrain;world.add(table.group,ground);for(const m of table.materials)shade.apply(m);shade.apply(ground.material);
  ambient=new T.HemisphereLight(0xd9e6ec,0x49533b,.85);light=new T.DirectionalLight(0xffe7c6,2.7);light.target.position.set(0,0,0);light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:20});light.shadow.normalBias=.015;world.add(ambient,light,light.target);
  shadow=new T.ShadowMaterial({opacity:.25,depthWrite:false});const floor=new T.Mesh(new T.PlaneGeometry(200,200),shadow);floor.rotation.x=-Math.PI/2;floor.position.y=.002;floor.receiveShadow=true;world.add(floor);
  material=new T.MeshBasicMaterial({transparent:true,alphaTest:.045,side:T.DoubleSide});shade.apply(material);key=addAvatarKey(material);depthLayer=addAvatarDepth(material);
  cardPreview=createCardPreview(material);gameCards=createGameCards();gameCards.set(gamePresentation,project);world.add(cardPreview.card,gameCards.group);disposables.push(cardPreview,gameCards);
  cardShoe=createCardShoe(project?.table.feltTop);world.add(cardShoe.group);disposables.push(cardShoe);
  salon=createSalon(table.materials[0].map);salon.group.visible=false;world.add(salon.group);disposables.push(salon);
  const geometry=new T.PlaneGeometry(1,1);dealer=new T.Mesh(geometry,material);world.add(dealer);dealerFrame=new T.LineSegments(new T.EdgesGeometry(geometry),new T.LineBasicMaterial({color:0xe7d49c}));world.add(dealerFrame);disposables.push(material,dealerFrame.material);
  rawPlane=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({toneMapped:false}));rawWorld.add(rawPlane);disposables.push(rawPlane.material);
  leafEffect=createLeaves();world.add(leafEffect.mesh);studioFx=createStudioEffects();syncStudioEffects();world.add(studioFx.group);await Promise.all([loadRoom(),loadAvatar()]);ready=true;updateView();updateTable();
  if(project){for(const id of ['tableWidth','tableHeight'])control(id).disabled=true;await applyProject(project,projectShot);const size=new T.Box3().setFromObject(table.group).getSize(new T.Vector3());parent.postMessage({type:'table-measure',width:size.x,depth:size.z,height:size.y},location.origin);parent.postMessage({type:'creator-ready'},location.origin);}
  if(gameMode){for(const id of ['avatar','view','scale','height','x','depth','avatarVisible','greenKey','tableWidth','tableHeight','seek','loop'])control(id).disabled=true;for(const b of document.querySelectorAll<HTMLButtonElement>('[data-action=reset-dealer],[data-action=reset-all],[data-action=restore-view]'))b.disabled=true;}
  $('play').disabled=false;notice();if(!paused)await play();else playUi();wake();
}catch(error){console.error(error);showError('Provet kunde inte starta. '+(errorDetails(error).message??'Video eller WebGL saknas.'));}

window.addEventListener('message',(event:MessageEvent<EditorEvent>)=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='creator-pick-frame'||!['entry','exit','contact','release'].includes(event.data.field))return;
 const requested=video,assetId=event.data.assetId,field=event.data.field;
 const reply=()=>{if(requested===video&&video.paused&&project?.shots.find(s=>s.id===projectShot)?.assetId===assetId)postFrame(video,field);};
 if(video.seeking)video.addEventListener('seeked',reply,{once:true});else reply();
});

function clearCardPicking(){cardPicking=null;if(cardOutline)cardOutline.visible=false;wake();notice();}
function pickCardPoint(event:PointerEvent){
 const shot=project?.shots.find(s=>s.id===projectShot);if(!project||!shot||!cardPicking||!sourceFps||avatarLoading||shot.assetId!==loadedAvatarAssetId||shot.assetId!==cardPicking.assetId||!video.paused||video.seeking){notice('Pausa på släpprutan innan du markerar kortet.');return;}
 const frame=Math.floor(video.currentTime*sourceFps+.0001);
 if(cardPicking.points.length&&frame!==cardPicking.frame){cardPicking.points=[];notice('Bildrutan ändrades. Markera övre vänstra hörnet igen.');}
 const bounds=canvas.getBoundingClientRect(),ray=new T.Raycaster();rawPlane.updateMatrixWorld();rawCamera.updateMatrixWorld();ray.setFromCamera(new T.Vector2((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2),rawCamera);
 const hit=ray.intersectObject(rawPlane)[0];if(!hit?.uv)return;cardPicking.points.push([hit.uv.x,1-hit.uv.y]);cardPicking.frame=frame;
 if(cardPicking.points.length===1){notice('Klicka kortets nedre högra hörn på samma ruta.');return;}
 const [a,b]=cardPicking.points,rect=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])];
 const aspect=sourceWidth/sourceHeight,points=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]].map(([u,v])=>new T.Vector3((u-.5)*2*aspect,(.5-v)*2,.01));
 if(!cardOutline){cardOutline=new T.LineLoop(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xffdf60,depthTest:false}));rawWorld.add(cardOutline);disposables.push({dispose(){cardOutline?.geometry.dispose();cardOutline?.material.dispose();}});}
 cardOutline.geometry.dispose();cardOutline.geometry=new T.BufferGeometry().setFromPoints(points);cardOutline.visible=true;
 parent.postMessage({type:'creator-card-anchor',projectId,assetId:shot.assetId,frame,sourceWidth,sourceHeight,rect,binding:calibrationBinding(project,shot,placementNow())},location.origin);
 cardPicking=null;notice('Kortet är markerat. Spara kortankaret i klippgranskningen.');wake();
}
window.addEventListener('message',(event:MessageEvent<EditorEvent>)=>{
 if(event.origin!==location.origin||event.source!==parent)return;const d=event.data,shot=project?.shots.find(s=>s.id===projectShot);
 if(d?.type==='creator-cancel-card-pick'){clearCardPicking();return;}
 if(d?.type==='creator-pick-card'&&shot&&d.assetId===shot?.assetId&&loadedAvatarAssetId===shot.assetId&&!avatarLoading&&sourceKind==='idle'){
  pause();cardPreviewEnabled=false;cardPreview?.clear();clearCardPicking();cardPicking={assetId:shot.assetId,points:[]};store.update({view:'raw'});notice('Välj släpprutan och klicka kortets övre vänstra hörn.');return;
 }
 if(d?.type==='creator-test-card'){
  clearCardPicking();cardPreviewEnabled=false;cardPreview?.clear();
  if(d.enabled&&project&&shot&&d.assetId===shot.assetId&&loadedAvatarAssetId===shot.assetId&&!avatarLoading){const c=currentCardCalibration(project,shot,placementNow());if(!c){notice('Kortankaret stämmer inte med aktuell inpassning. Spara posen och mät om.');return;}cardPreviewEnabled=true;store.update({view:'table'});video.currentTime=Math.max(0,c.contactFrame/c.fps-.8);void play();notice('Provkort · kontrollera handen och övergången till filten.');}
  wake();
 }
});

window.addEventListener('message',(event:MessageEvent<EditorEvent>)=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='creator-step-frame'||![-1,1].includes(event.data.step))return;
 const shot=project?.shots.find(s=>s.id===projectShot);if(!shot||event.data.assetId!==shot.assetId||loadedAvatarAssetId!==shot.assetId||avatarLoading||sourceKind!=='idle'||!sourceFps||video.seeking)return;
 pause();const current=Math.floor(video.currentTime*sourceFps+.0001),last=(shot.frameCount??Math.floor(video.duration*sourceFps))-1,next=limit(current+event.data.step,0,last);
 if(next===current){postFrame(video);return;}video.currentTime=next/sourceFps;wake();
});




