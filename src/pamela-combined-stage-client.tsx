'use client';
import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {dealerProjectionMesh} from './pamela-stage-projection.ts';
import {createPamelaBackgroundLayer,PAMELA_ROOM_VARIANTS,type PamelaRoomVariant} from './pamela-background-layer.ts';
import {createPamelaTableLayer,PAMELA_TABLE_VARIANTS,type PamelaTableVariantId} from './pamela-table-layer.ts';
import {cardUvMatrix,resolveArtwork,PAMELA_CARD_ATLAS_GLSL,type CardAtlasManifest} from './pamela-card-atlas.ts';
import {validateCardSceneAtlas} from './pamela-card-scene-calibration.ts';
import {getPamelaContactFrame} from './pamela-contact-calibration.ts';
import {PAMELA_SHOE_SHAPES,PAMELA_SHOE_GEOMETRY_GLSL,type PamelaShoeShape} from './pamela-shoe-geometry.ts';
import {resolvePamelaShoeBankShaderBinding} from './pamela-shoe-bank-shader.ts';
import type {PamelaShoeBankIdentity} from './pamela-shoe-bank-profile.ts';
import type stageContract from '../references/pamela-stage-contract.json';

type EngineCard={cardId:string|null;frontAllowed:boolean};
type Presentation={first:EngineCard;second:EngineCard};
type Choices={room:PamelaRoomVariant;table:PamelaTableVariantId;back:string;front:string;reveal:boolean;shoe:'source'|PamelaShoeShape};
type Controls={play():Promise<void>;pause():void;seek(f:number):void;pan(x:number,y:number):void;materials(c:Choices):Promise<void>;engineChanged():Promise<void>};
const fileUrl=(p:string)=>'/files/'+p.split('/').map(encodeURIComponent).join('/');
const defaults:Choices={room:'jade-salon',table:'emerald-leather',back:'sg',front:'classic',reveal:true,shoe:'source'};
/** A fixture can only further restrict permission, never grant beyond the engine. */
export default function PamelaCombinedStage({contract,atlas,presentation,shoeAssets,shoeBankBinding,comparisonHref,publicMode=false}:{contract:typeof stageContract;atlas:CardAtlasManifest;presentation:Presentation;shoeAssets?:Record<PamelaShoeShape,string>;shoeBankBinding?:{identity:PamelaShoeBankIdentity;paperAtlasSha256:string};comparisonHref?:string;publicMode?:boolean}){
 const calibration=useMemo(()=>validateCardSceneAtlas(atlas),[atlas]);
 const bankShoe=useMemo(()=>{
  const identity=shoeBankBinding?.identity;
  return resolvePamelaShoeBankShaderBinding(identity&&identity.clipId===calibration.id&&identity.sourceSha256===atlas.source.sha256&&identity.width===atlas.width&&identity.height===atlas.height&&identity.fps===atlas.fps&&identity.frames===atlas.frames.length?shoeBankBinding:undefined);
 },[shoeBankBinding,calibration.id,atlas]);
 const shoeAvailable=(calibration.shoeGeometry||bankShoe.enabled)&&!!shoeAssets;
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),controls=useRef<Controls|null>(null),choice=useRef<Choices>({...defaults});
 const [choices,setChoices]=useState({...defaults}),[status,setStatus]=useState('Laddar tagning och kortlager…'),[ready,setReady]=useState(false),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),[pan,setPan]=useState<[number,number]>([0,0]);
 const [preciseShoe,setPreciseShoe]=useState(true);
 const engineRef=useRef(presentation);
 useLayoutEffect(()=>{engineRef.current=presentation;void controls.current?.engineChanged().catch(e=>setStatus(String(e)));},[presentation]);
 const drag=useRef<{x:number;y:number;pan:[number,number]}|null>(null),panRef=useRef<[number,number]>([0,0]);
 const move=(x:number,y:number)=>{const p:[number,number]=[Math.max(-1,Math.min(1,x)),Math.max(-1,Math.min(1,y))];panRef.current=p;setPan(p);controls.current?.pan(...p);};
 const change=(patch:Partial<Choices>)=>{const c={...choice.current,...patch};choice.current=c;setChoices(c);void controls.current?.materials(c).catch(e=>setStatus(String(e)));};
 useLayoutEffect(()=>{
  // Replace scene/source resources before paint. Engine changes are handled by
  // the separate layout effect above so the video clock remains uninterrupted.
  let disposed=false,cleaned=false,ownedControls:Controls|null=null,cleanup=()=>{};
  setReady(false);setPlaying(false);setFrame(0);
  if(!shoeAvailable){choice.current={...choice.current,shoe:'source'};setChoices({...choice.current});}
  async function mount(){
   const T:any=await import('../references/card-materials/vendor/three.module.js');if(disposed||!canvas.current||!host.current)return;
   const renderer=new T.WebGLRenderer({canvas:canvas.current,antialias:true,alpha:false,powerPreference:'low-power'});
   const preciseBankShoe=!bankShoe.enabled||renderer.capabilities.precision==='highp',runtimeShoeAvailable=shoeAvailable&&preciseBankShoe;setPreciseShoe(preciseBankShoe);
   renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
   let shaderFailed=false;renderer.debug.onShaderError=(gl:WebGLRenderingContext,p:WebGLProgram,_v:WebGLShader,f:WebGLShader)=>{shaderFailed=true;console.error('Kombinerad scen shader',gl.getProgramInfoLog(p),gl.getShaderInfoLog(f));setStatus('Scenens material kunde inte renderas');setReady(false);};
   const scene=new T.Scene();scene.background=new T.Color('#101714');
   const camera=new T.PerspectiveCamera(contract.camera.fieldOfViewDegrees,1,.1,50);camera.position.set(...contract.camera.position);camera.lookAt(...contract.camera.target);
   const projection={width:contract.dealerPlacement.width,sourceWidth:atlas.width,sourceHeight:atlas.height,contactSourceY:contract.dealerPlacement.contactSourceY,depth:contract.dealerPlacement.depth,tableHeight:contract.table.feltHeight+.004,camera:contract.camera.position,cameraTarget:contract.camera.target};
   const room=createPamelaBackgroundLayer(T,{variant:choice.current.room}),table=createPamelaTableLayer(T,{table:contract.table,projection,variant:choice.current.table,contactShadows:[]});scene.add(room.group);scene.add(table.group);scene.add(table.contactGroup);
   const key=new T.DirectionalLight(contract.lights.neutral.key,contract.lights.neutral.keyIntensity),fill=new T.DirectionalLight(contract.lights.neutral.fill,contract.lights.neutral.fillIntensity);key.position.set(...contract.lightPlacement.key);fill.position.set(...contract.lightPlacement.fill);scene.add(key);scene.add(fill);scene.add(new T.HemisphereLight('#e6eee9','#19221c',contract.lightPlacement.hemisphereIntensity));
   const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';
   const videoTexture=new T.VideoTexture(video);videoTexture.colorSpace=T.NoColorSpace;
   const loader=new T.TextureLoader(),textures:any[]=[videoTexture],cache=new Map<string,Promise<any>>(),listeners:Array<[string,()=>void]>=[];
   let resize:ResizeObserver|undefined,vfc:number|undefined,displayedFrame=0,uniforms:Record<string,{value:any}>={},geometry:any,material:any,shoeMaterial:any;
   const load=(p:string,mask=false):Promise<any>=>{const existing=cache.get(p);if(existing)return existing;const promise=loader.loadAsync(fileUrl(p)).then((t:any)=>{if(disposed){t.dispose();throw Error('disposed');}t.flipY=false;t.colorSpace=T.NoColorSpace;t.generateMipmaps=false;t.minFilter=mask?T.NearestFilter:T.LinearFilter;t.magFilter=mask?T.NearestFilter:T.LinearFilter;textures.push(t);return t;});cache.set(p,promise);return promise;};
   const render=()=>{if(!disposed&&!document.hidden)renderer.render(scene,camera);};
   const hidden=()=>{if(document.hidden)video.pause();else if(video.readyState>=2)showFrame(displayedFrame);};
   cleanup=()=>{if(cleaned)return;cleaned=true;resize?.disconnect();document.removeEventListener('visibilitychange',hidden);if(vfc!==undefined)video.cancelVideoFrameCallback(vfc);for(const[type,fn]of listeners)video.removeEventListener(type,fn);video.pause();video.removeAttribute('src');video.load();renderer.clear(true,true,true);room.dispose();table.dispose();geometry?.dispose();material?.dispose();shoeMaterial?.dispose();textures.forEach(t=>t.dispose());renderer.dispose();if(controls.current===ownedControls)controls.current=null;};
   const masks=await Promise.all(atlas.pages.map(p=>load(p.path,true)));
   for(const [i,mask]of masks.entries())if(mask.image.width!==atlas.pages[i].width||mask.image.height!==atlas.pages[i].height)throw Error('Kortmaskens bildmått skiljer sig från kalibreringen');
   const shoes:Record<string,any>={};if(runtimeShoeAvailable&&shoeAssets)for(const s of PAMELA_SHOE_SHAPES){const tex=await loader.loadAsync(fileUrl(shoeAssets[s.id]));if(disposed){tex.dispose();return;}tex.colorSpace=T.SRGBColorSpace;textures.push(tex);shoes[s.id]=tex;}
   // Load only identities which the supplied presentation permits. The demo
   // switch is an additional restriction, not an authority for a hidden value.
   const loaded=new Map<string,any>();
   async function prepareArtwork(c:Choices){
    if(!atlas.artwork.back[c.back])throw Error('Okänd baksida');
    for(const back of Object.values(atlas.artwork.back))loaded.set(back,await load(back));
    for(const [slot,card]of Object.entries(engineRef.current))if(card.frontAllowed&&(slot!=='second'||c.reveal)&&card.cardId)for(const design of Object.values(atlas.artwork.front)){const p=design[card.cardId];if(p)loaded.set(p,await load(p));}
   }
   await prepareArtwork(choice.current);if(disposed)return;
   uniforms={frameTexture:{value:videoTexture},frameReady:{value:0},cardInkSize:{value:new T.Vector2(252,352)},shoeEnabled:{value:0}};
   for(let i=0;i<2;i++){uniforms['cardMask'+i]={value:masks[0]};uniforms['cardInk'+i]={value:loaded.get(atlas.artwork.back[choice.current.back])};uniforms['cardBounds'+i]={value:new T.Vector4()};uniforms['cardAtlas'+i]={value:new T.Vector4()};uniforms['cardPageSize'+i]={value:new T.Vector2()};uniforms['cardUv'+i]={value:new T.Matrix3()};uniforms['cardEdge'+i]={value:0};}
   const data=dealerProjectionMesh(projection);geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uvs,2));geometry.setIndex(data.indices);
   material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,uniforms,vertexShader:'varying vec2 sourceUv;void main(){sourceUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
varying vec2 sourceUv; uniform sampler2D frameTexture; uniform float frameReady;
uniform float shoeEnabled;
${PAMELA_CARD_ATLAS_GLSL}
${bankShoe.enabled?bankShoe.glsl:PAMELA_SHOE_GEOMETRY_GLSL}
void main(){
 if(frameReady<.5)discard;
 vec3 source=texture2D(frameTexture,sourceUv).rgb;vec3 c=source;vec2 pixel=vec2(sourceUv.x*1762.0,(1.0-sourceUv.y)*1174.0);
 float d=c.g-max(c.r,c.b);bool darkNeutral=(d<.1098&&c.g<.5882&&max(c.r,c.b)>c.g*.65)||(c.g<.1569&&d<.1176);
 float a=darkNeutral?1.0:1.0-smoothstep(.0353,.46,d);
 if(d>=.0314)c.g-=max(0.0,d-.0157)*(darkNeutral?.5:.95);
 applyPamelaCards(source,pixel,c,a);
 float paper=max(paperMask(cardMask0,pixel,cardBounds0,cardAtlas0,cardPageSize0),paperMask(cardMask1,pixel,cardBounds1,cardAtlas1,cardPageSize1));
 a*=1.0-${bankShoe.enabled?'pamelaShoeBankRemovalFromTexture(frameTexture,pixel,shoeEnabled,paper)':'pamelaShoeGeometryRemoval(source,pixel,shoeEnabled,paper)'};
 if(a<.012)discard;
 c=mix(pow((c+.055)/1.055,vec3(2.4)),c/12.92,step(c,vec3(.04045)));gl_FragColor=vec4(c,a);
 #include <colorspace_fragment>
}`});
   const dealer=new T.Mesh(geometry,material);dealer.renderOrder=2;scene.add(dealer);
   shoeMaterial=new T.MeshBasicMaterial({map:shoes['compact-wedge']??null,transparent:true,alphaTest:.001,depthWrite:false,side:T.DoubleSide,toneMapped:false});
   const shoe=new T.Mesh(geometry,shoeMaterial);shoe.renderOrder=1;shoe.visible=false;scene.add(shoe);
   function updateCards(f:number){
    const rec=atlas.frames[f],c=choice.current;
    for(let i=0;i<2;i++){
     const card=rec.cards[i],b=card.bounds,r=card.atlas,page=atlas.pages[r.page],engine=i===0?engineRef.current.first:{...engineRef.current.second,frontAllowed:engineRef.current.second.frontAllowed&&c.reveal};
     const file=resolveArtwork(card.side,engine,atlas.artwork.back[c.back],id=>atlas.artwork.front[c.front]?.[id]??atlas.artwork.back[c.back]);
     uniforms['cardMask'+i].value=masks[r.page];uniforms['cardBounds'+i].value.set(b.left,b.top,b.width,b.height);uniforms['cardAtlas'+i].value.set(r.left,r.top,r.width,r.height);uniforms['cardPageSize'+i].value.set(page.width,page.height);
     if(card.side!=='EDGE')uniforms['cardUv'+i].value.fromArray(cardUvMatrix(card.quad));
     uniforms['cardEdge'+i].value=card.side==='EDGE'?1:0;
     // During asynchronous design loading, fail closed to the selected back.
     uniforms['cardInk'+i].value=loaded.get(file??'')??loaded.get(atlas.artwork.back[c.back]);
    }
   }
   function showFrame(f:number){
    if(disposed||video.readyState<2||!video.videoWidth||!material)return;
    if(video.videoWidth!==atlas.width||video.videoHeight!==atlas.height){uniforms.frameReady.value=0;render();setReady(false);setStatus('Källfilmens bildmått skiljer sig från kalibreringen');return;}
    displayedFrame=Math.max(0,Math.min(359,f));updateCards(displayedFrame);videoTexture.needsUpdate=true;uniforms.frameReady.value=1;render();
    if(!shaderFailed){setFrame(displayedFrame);setReady(true);setStatus('Samma tagning · separata kort- och scenmaterial');}
   }
   const on=(type:string,fn:()=>void)=>{video.addEventListener(type,fn);listeners.push([type,fn]);};
   const decoded=(_time:number,meta:VideoFrameCallbackMetadata)=>{showFrame(Math.floor(meta.mediaTime*30+.01));if(!disposed&&!video.paused)vfc=video.requestVideoFrameCallback(decoded);};
   on('loadeddata',()=>showFrame(Math.floor(video.currentTime*30+.01)));
   on('seeked',()=>showFrame(Math.floor(video.currentTime*30+.01)));
   on('play',()=>{setPlaying(true);if(vfc!==undefined)video.cancelVideoFrameCallback(vfc);vfc=video.requestVideoFrameCallback(decoded);});
   on('pause',()=>{setPlaying(false);if(vfc!==undefined)video.cancelVideoFrameCallback(vfc);vfc=undefined;});
   on('ended',()=>{setPlaying(false);showFrame(359);});
   on('error',()=>{setReady(false);setStatus('Källfilmen kunde inte laddas');});
   resize=new ResizeObserver(()=>{if(!host.current||disposed)return;renderer.setSize(host.current.clientWidth,host.current.clientHeight,false);camera.aspect=host.current.clientWidth/host.current.clientHeight;camera.updateProjectionMatrix();render();});resize.observe(host.current);
   ownedControls={async play(){if(video.ended||video.currentTime>=11.99)video.currentTime=0;await video.play();},pause(){video.pause();},seek(f){video.pause();video.currentTime=(Math.max(0,Math.min(359,f))+.1)/30;},pan(x,y){camera.position.set(contract.camera.position[0]+x*contract.camera.maxPan[0],contract.camera.position[1]+y*contract.camera.maxPan[1],contract.camera.position[2]);render();},async materials(c){
    room.setVariant(c.room);table.setVariant(c.table);shoe.visible=runtimeShoeAvailable&&c.shoe!=='source';uniforms.shoeEnabled.value=shoe.visible?1:0;if(shoe.visible)shoeMaterial.map=shoes[c.shoe];
    // Apply revocation synchronously before any asynchronous loading completes.
    updateCards(displayedFrame);render();await prepareArtwork(c);if(!disposed){updateCards(displayedFrame);render();}
   },async engineChanged(){updateCards(displayedFrame);render();await prepareArtwork(choice.current);if(!disposed){updateCards(displayedFrame);render();}}};
   controls.current=ownedControls;
   document.addEventListener('visibilitychange',hidden);video.src=fileUrl(atlas.source.path);video.load();
  }
  mount().catch(e=>{if(!disposed){cleanup();setReady(false);setStatus(e instanceof Error?e.message:String(e));}});
  return()=>{disposed=true;cleanup();};
 },[contract,atlas,shoeAssets,shoeAvailable,bankShoe]);
 const side=atlas.frames[frame].cards[1].side,contact=calibration.contactCalibration?getPamelaContactFrame({sourceSha256:atlas.source.sha256,frame,projection:{width:contract.dealerPlacement.width,sourceWidth:atlas.width,sourceHeight:atlas.height,contactSourceY:876,depth:contract.dealerPlacement.depth,tableHeight:contract.table.feltHeight+.004,camera:contract.camera.position,cameraTarget:contract.camera.target},feltHeight:contract.table.feltHeight}):null;
 const secondFrontVisible=choices.reveal&&presentation.second.frontAllowed&&!!presentation.second.cardId&&!!atlas.artwork.front[choices.front]?.[presentation.second.cardId];
 return <main className="pc-root"><style>{`.pc-root{background:#101714;color:#e7eee7;min-height:100vh;padding:24px max(20px,calc((100vw - 1500px)/2));font:15px/1.5 system-ui}.pc-root *{box-sizing:border-box}.pc-root a{color:#c4dcc9}.pc-root h1{font-size:30px;margin:12px 0 4px}.pc-root p{color:#b7c7ba}.pc-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px}.pc-stage{height:72vh;min-height:440px;max-height:780px;position:relative;border:1px solid #536454;border-radius:16px;overflow:hidden;touch-action:none;cursor:grab}.pc-stage canvas{display:block;width:100%;height:100%}.pc-overlay{position:absolute;left:14px;bottom:12px;background:#101a17dd;padding:8px 12px;border-radius:8px;pointer-events:none;font-size:12px}.pc-panel{padding:18px;background:#1b2921;border:1px solid #415747;border-radius:16px}.pc-panel label{display:block;margin-bottom:12px}.pc-panel select,.pc-panel button{width:100%;margin-top:4px;background:#2b4032;color:#edf4ee;border:1px solid #708876;border-radius:7px;padding:9px;font:inherit}.pc-panel button{cursor:pointer}.pc-panel button:disabled,.pc-panel select:disabled{opacity:.5}.pc-panel input[type=range]{width:100%}.pc-panel small{display:block;color:#b2c5b6;margin:10px 0}.pc-steps{display:flex;gap:4px;flex-wrap:wrap}.pc-steps button{width:auto;flex:1}.pc-root details{margin-top:18px;max-width:1000px;color:#b9c9bf}.pc-root footer{margin-top:16px;font-size:12px;color:#b9c9bf}@media(max-width:900px){.pc-grid{grid-template-columns:1fr}.pc-stage{height:55vh;min-height:360px}.pc-panel{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}}`}</style>
 <a href={publicMode?'/pamela-loop.html':'/pamela-prov?view=material-round'}>← Hela givningsrundan</a><h1>Kortvändning i en utbytbar scen</h1><p>Plats {calibration.seat} · andra kortet · samma 12-sekunderstagning. Byt fram- och baksida, rum och bord medan rörelsen fortsätter. <a href={comparisonHref??(publicMode?'/pamela-flip.html':'/pamela-prov?view=flip')}>Förstorad kortjämförelse före/efter →</a></p>
 <div className="pc-grid"><div ref={host} className="pc-stage" tabIndex={0} role="region" aria-label="Interaktiv kombinerad scen" onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,pan:panRef.current};}} onPointerMove={e=>{const d=drag.current;if(d)move(d.pan[0]-(e.clientX-d.x)/220,d.pan[1]+(e.clientY-d.y)/220);}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')move(0,0);else move(panRef.current[0]+(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0),panRef.current[1]+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0));}}}><canvas ref={canvas} aria-label="Pamela med dynamisk kortvändning och separat scen"/><span className="pc-overlay">Ruta {frame} · {side==='BACK'?'Baksida':side==='EDGE'?'Tunn kant':secondFrontVisible?'Framsida':'Framsida spärrad'} · dra för försiktig panorering</span></div>
 <aside className="pc-panel"><section><label>Kortets baksida<select aria-label="Kortets baksida" disabled={!ready} value={choices.back} onChange={e=>change({back:e.target.value})}><option value="sg">SG · svart och guld</option><option value="blue">Blå geometri</option></select></label><label>Kortets framsida<select aria-label="Kortets framsida" disabled={!ready} value={choices.front} onChange={e=>change({front:e.target.value})}><option value="classic">Klassisk</option><option value="ivory">Elfenben</option></select></label><label><input type="checkbox" aria-label="Tillåt andra kortets framsida i provet" disabled={!ready||!presentation.second.frontAllowed} checked={choices.reveal} onChange={e=>change({reveal:e.target.checked})}/> Tillåt framsidan i provet</label><small>Provkort: {presentation.first.frontAllowed?presentation.first.cardId:'dolt'} och {presentation.second.frontAllowed&&choices.reveal?presentation.second.cardId:'dolt'}. I spelet måste motorn leverera både kortidentitet och tillstånd att visa framsidan.</small></section>
 <section><label>Rum<select aria-label="Bakgrundsvariant" disabled={!ready} value={choices.room} onChange={e=>change({room:e.target.value as PamelaRoomVariant})}>{PAMELA_ROOM_VARIANTS.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label><label>Bord<select aria-label="Bordsvariant" disabled={!ready} value={choices.table} onChange={e=>change({table:e.target.value as PamelaTableVariantId})}>{PAMELA_TABLE_VARIANTS.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label><label>Kortsko<select aria-label="Skons form" disabled={!ready||!shoeAvailable||!preciseShoe} value={choices.shoe} onChange={e=>change({shoe:e.target.value as Choices['shoe']})}><option value="source">Originalsko</option>{PAMELA_SHOE_SHAPES.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label><small>{!preciseShoe?'Den här visningen saknar precision för skobyte. Originalskon behålls.':shoeAvailable?'Skons kropp byts. Originalets lilla kontaktdel vid uttaget behålls.':'Denna tagning behåller originalskon tills dess egna uttag och handkontakt är kalibrerade.'}</small></section>
 <section><button disabled={!ready} onClick={()=>{if(playing)controls.current?.pause();else void controls.current?.play().catch(e=>setStatus(String(e)));}}>{playing?'Pausa givningen':'Spela givningen'}</button><label>Ruta {frame} / 359<input type="range" aria-label="Rörelsens källruta" min={0} max={359} value={frame} disabled={!ready} onChange={e=>controls.current?.seek(Number(e.target.value))}/></label><div className="pc-steps">{calibration.landmarks.map(f=><button key={f} disabled={!ready} onClick={()=>controls.current?.seek(f)}>{f}</button>)}</div><div className="pc-steps"><button disabled={!ready} onClick={()=>controls.current?.seek(frame-1)}>← En ruta</button><button disabled={!ready} onClick={()=>controls.current?.seek(frame+1)}>En ruta →</button></div><button onClick={()=>move(0,0)}>Återställ vy</button><small>Pan {(pan[0]*.16).toFixed(2)} / {(pan[1]*.07).toFixed(2)}. Låst kamerariktning.</small></section><div role="status">{status}</div></aside></div>
 <details><summary>Källor, ljus och kvarvarande begränsningar</summary><p>Blank källrekvisita: sidväxlingen är kalibrerad till den observerade tunna passagen, inte till ett läsbart originaltryck. Baksida till ruta {calibration.edgeFrame-1}, tunn kant {calibration.edgeFrame}–{calibration.frontFrame-1}, framsida från {calibration.frontFrame} när tillåten. Handmasken har företräde. Alla 360 kortmasker är källbundna; respektive tagning har egen hand- och sidkalibrering.</p><p>Rum och bord har separat geometri/material. Ljuset kommer snett framifrån till vänster; inspelat ljus på Pamela kan inte ändras fysiskt. Nederdelen projiceras på ett antaget bordsplan. Kontakt bedöms separat från detta plan. Inga nya handskuggor läggs till. Kontaktläge: {contact?.cards[1].status??'inte separat kalibrerat för denna källa'}.</p><p>Provet gäller den valda källhashen. Tunna kortkanter har fortfarande cirka 1–2 pixlars osäkerhet. Övriga platser behöver egna sid- och maskprov.</p></details>
 <footer><a href={fileUrl(atlas.source.path)}>Originaltagning · 360 rutor / 30 fps</a> · Kortidentitet och visningstillstånd kommer från en uttrycklig provfixtur, ingen spelmotor är flyttad hit.</footer>
 </main>;
}
