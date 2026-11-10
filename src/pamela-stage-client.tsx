'use client';
import {useEffect,useRef,useState} from 'react';
import {dealerProjectionMesh,sourcePlanePixel,type StageMotion,type StageLandedCard} from './pamela-stage-projection.ts';

type Light={label:string;key:string;keyIntensity:number;fill:string;fillIntensity:number;exposure:number};
type Contract={assets:{dealer:string;room:string;felt:string;provenance:string};camera:{position:number[];target:number[];fieldOfViewDegrees:number;maxPan:number[]};table:{width:number;depth:number;thickness:number;rimHeight:number;cornerRadius:number;rimWidth:number;feltHeight:number;feltColor:string;feltRoughness:number;feltBumpScale:number;feltTextureRepeat:number;feltTextureMean:number;feltTextureContrast:number;rimColor:string;rimRoughness:number};dealerPlacement:{width:number;sourceWidth:number;cropHeight:number;contactSourceY:number;depth:number};contactShadows:{sourceX:number;sourceY:number;width:number;depth:number;opacity:number}[];lights:Record<string,Light>;lightPlacement:{key:number[];fill:number[];hemisphereIntensity:number}};
type Controls={pan(x:number,y:number):void;light(name:string):void;layer(name:string,on:boolean):void;recordPan():Promise<Blob>;recordMovingPan?():Promise<Blob>;play?():Promise<void>;pause?():void;seek?(frame:number):void};
const url=(file:string)=>`/files/${file.split('/').map(encodeURIComponent).join('/')}`;
const clamp=(n:number)=>Math.max(-1,Math.min(1,n));
const NO_LANDED_CARDS:StageLandedCard[]=[];
export default function PamelaStageClient({contract,publicMode=false,motion:initialMotion,motionOptions=[],landedCards=NO_LANDED_CARDS}:{contract:Contract;publicMode?:boolean;motion?:StageMotion;motionOptions?:StageMotion[];landedCards?:StageLandedCard[]}){
 const defaultMotion=motionOptions.find(m=>m.file===initialMotion?.file)??motionOptions[0]??initialMotion;
 const [motionFile,setMotionFile]=useState(defaultMotion?.file);
 const motion=motionOptions.find(m=>m.file===motionFile)??defaultMotion;
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),control=useRef<Controls|null>(null),drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 const [status,setStatus]=useState('Laddar scenen…'),[profile,setProfile]=useState('neutral'),[pan,setPan]=useState<[number,number]>([0,0]),[layers,setLayers]=useState({room:true,dealer:true,table:true});
 const [playing,setPlaying]=useState(false),[frame,setFrame]=useState(0);
 const [recording,setRecording]=useState(false);
 const [readyMotionFile,setReadyMotionFile]=useState<string|null>(null);
 const motionReady=!motion||readyMotionFile===motion.file;
 const [priorCards,setPriorCards]=useState(true);
 const position=useRef<[number,number]>([0,0]);
 const move=(x:number,y:number)=>{if(recording||!control.current)return;const p:[number,number]=[clamp(x),clamp(y)];position.current=p;setPan(p);control.current.pan(...p);};
 const saveCameraRecording=async(moving:boolean)=>{
  const active=control.current;if(!active||recording)return;
  drag.current=null;setRecording(true);
  try{
   const blob=await(moving?active.recordMovingPan?.():active.recordPan());
   if(!blob||control.current!==active)return;
   const href=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=href;a.download=moving?`pamela-visningsinspelning-${motion?.sha256.slice(0,12)}-givning-pan-fran-${Math.max(0,(motion?.contactFrame??90)-90)}.webm`:`pamela-visningsinspelning-fryst-ruta-${frame}.webm`;
   try{a.click();}finally{setTimeout(()=>URL.revokeObjectURL(href),1000);}
   setStatus('Visningsinspelningen är sparad. Bildrutor kan ha tappats; filmen bevisar inte källtiming.');
  }catch(e){if(control.current===active)setStatus(e instanceof Error?e.message:'Visningsinspelningen kunde inte sparas.');}
  finally{if(control.current===active)setRecording(false);}
 };
 useEffect(()=>{
  setReadyMotionFile(null);setRecording(false);setPlaying(false);setFrame(0);setPriorCards(true);setProfile('neutral');setLayers({room:true,dealer:true,table:true});position.current=[0,0];setPan([0,0]);setStatus('Laddar scenen…');
  let disposed=false,cleanup=()=>{};
  async function mount(){
   const T=await import('../references/card-materials/vendor/three.module.js');
   if(disposed||!canvas.current||!host.current)return;
   const spatial=<V,>(v:V)=>v as V&{position:{set(x:number,y:number,z:number):void};rotation:{x:number};visible:boolean};
   const renderer=new T.WebGLRenderer({canvas:canvas.current,antialias:true,alpha:false,powerPreference:'low-power'});
   let shaderFailed=false;
   const rendererDebug=renderer.debug as {onShaderError:((gl:WebGLRenderingContext,program:WebGLProgram,vertex:WebGLShader,fragment:WebGLShader)=>void)|null};
   rendererDebug.onShaderError=(gl,program,_vertex,fragment)=>{shaderFailed=true;console.error('Scenens shader misslyckades',gl.getProgramInfoLog(program),gl.getShaderInfoLog(fragment));if(!disposed)setStatus('Scenen kunde inte renderas: ett material misslyckades.');};
   renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
   const scene=new T.Scene();scene.background=new T.Color('#101513');
   const camera=spatial(new T.PerspectiveCamera(contract.camera.fieldOfViewDegrees,1,.1,50));
   camera.position.set(...contract.camera.position as [number,number,number]);camera.lookAt(...contract.camera.target as [number,number,number]);
   const loader=new T.TextureLoader(),textures:InstanceType<typeof T.Texture>[]=[],geometries:InstanceType<typeof T.BufferGeometry>[]=[],materials:InstanceType<typeof T.Material>[]=[];
   const objects:Record<string,{visible:boolean}>={};
   let resize:ResizeObserver|undefined,video:HTMLVideoElement|undefined,videoFrameHandle:number|undefined,displayedMediaTime=0;
   let activeRecording:{abort(reason:Error):void}|undefined;
   const videoListeners:{type:string;listener:()=>void}[]=[];
   cleanup=()=>{resize?.disconnect();activeRecording?.abort(Error('Kameraprovet avbröts när scenen stängdes.'));if(video){if(videoFrameHandle!==undefined)video.cancelVideoFrameCallback(videoFrameHandle);for(const {type,listener}of videoListeners)video.removeEventListener(type,listener);video.pause();video.removeAttribute('src');video.load();}textures.forEach(x=>x.dispose());geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());renderer.dispose();control.current=null;};
   async function texture(path:string){const t=await loader.loadAsync(url(path));if(disposed){t.dispose();throw Error('disposed');}t.colorSpace=T.SRGBColorSpace;textures.push(t);return t;}
   const roomTexture=await texture(contract.assets.room),dealerTexture=await texture(contract.assets.dealer),feltTexture=await texture(contract.assets.felt);
   const StageMesh=T.Mesh as unknown as new(geometry:InstanceType<typeof T.BufferGeometry>,material:InstanceType<typeof T.Material>)=>InstanceType<typeof T.Mesh>;
   function mesh(geometry:InstanceType<typeof T.BufferGeometry>,material:InstanceType<typeof T.Material>,x:number,y:number,z:number){geometries.push(geometry);materials.push(material);const obj=spatial(new StageMesh(geometry,material));obj.position.set(x,y,z);scene.add(obj);return obj;}
   objects.room=mesh(new T.PlaneGeometry(14,8.75),new T.MeshBasicMaterial({map:roomTexture,toneMapped:false}),0,3,-3.7);
   const table=contract.table,dealer=contract.dealerPlacement;
   const projection={width:dealer.width,sourceWidth:motion?.width??dealer.sourceWidth,sourceHeight:motion?.height??dealer.cropHeight,contactSourceY:dealer.contactSourceY,depth:dealer.depth,tableHeight:table.feltHeight+.004,camera:contract.camera.position,cameraTarget:contract.camera.target};
   const dealerHeight=dealer.width*dealer.cropHeight/dealer.sourceWidth;
   const dealerY=table.feltHeight+(dealer.contactSourceY-dealer.cropHeight/2)*dealer.width/dealer.sourceWidth;
   let dealerMesh;
   if(motion){
    video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';video.src=url(motion.file);
    const videoTexture=new T.VideoTexture(video);videoTexture.colorSpace=T.NoColorSpace;textures.push(videoTexture);
    const data=dealerProjectionMesh(projection);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uvs,2));geometry.setIndex(data.indices);geometry.computeVertexNormals();
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,uniforms:{frameTexture:{value:videoTexture}},vertexShader:'varying vec2 sourceUv; void main(){sourceUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
varying vec2 sourceUv;
uniform sampler2D frameTexture;
void main(){
 vec3 c=texture2D(frameTexture,sourceUv).rgb;
 float d=c.g-max(c.r,c.b);
 bool darkNeutral=(d<0.1098&&c.g<0.5882&&max(c.r,c.b)>c.g*0.65)||(c.g<0.1569&&d<0.1176);
 float a=darkNeutral?1.0:1.0-smoothstep(0.0353,0.46,d);
 if(a<0.012)discard;
 if(d>=0.0314)c.g-=max(0.0,d-0.0157)*(darkNeutral?0.5:0.95);
 c=mix(pow((c+0.055)/1.055,vec3(2.4)),c/12.92,step(c,vec3(0.04045)));
 gl_FragColor=vec4(c,a);
 #include <colorspace_fragment>
}`});
    dealerMesh=mesh(geometry,material,0,0,0);
   }else dealerMesh=mesh(new T.PlaneGeometry(dealer.width,dealerHeight),new T.MeshBasicMaterial({map:dealerTexture,transparent:true,alphaTest:.015,depthWrite:false,toneMapped:false}),0,dealerY,dealer.depth);
   dealerMesh.renderOrder=2;objects.dealer=dealerMesh;
   const cardsGroup=new T.Group();scene.add(cardsGroup);objects.cards=cardsGroup;
   const selectedSeat=landedCards.find(c=>c.sourceSha256===motion?.sha256)?.seat;
   if(motion&&selectedSeat)for(const card of landedCards.filter(c=>c.seat<selectedSeat)){
    const map=await texture(card.file),data=dealerProjectionMesh(projection),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(data.uvs,2));g.setIndex(data.indices);
    const m=mesh(g,new T.MeshBasicMaterial({map,transparent:true,alphaTest:.01,depthWrite:false,side:T.DoubleSide,toneMapped:false}),0,.0002,0);m.renderOrder=1;scene.remove(m);cardsGroup.add(m);
   }
   const tableGroup=new T.Group();scene.add(tableGroup);objects.table=tableGroup;
   function tablePart(geometry:InstanceType<typeof T.BufferGeometry>,material:InstanceType<typeof T.Material>,y:number){const m=mesh(geometry,material,0,y,0);scene.remove(m);tableGroup.add(m);return m;}
   function outline(w:number,d:number,r:number){const s=new T.Shape(),x=w/2,z=d/2;s.moveTo(-x+r,-z);s.lineTo(x-r,-z);s.quadraticCurveTo(x,-z,x,-z+r);s.lineTo(x,z-r);s.quadraticCurveTo(x,z,x-r,z);s.lineTo(-x+r,z);s.quadraticCurveTo(-x,z,-x,z-r);s.lineTo(-x,-z+r);s.quadraticCurveTo(-x,-z,-x+r,-z);s.closePath();return s;}
   function solid(shape:InstanceType<typeof T.Shape>,height:number,bevel:number){const g=new T.ExtrudeGeometry(shape,{depth:height-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:5,curveSegments:24,steps:1});g.rotateX(-Math.PI/2);return g;}
   tablePart(solid(outline(table.width-.04,table.depth-.04,table.cornerRadius),table.thickness,.025),new T.MeshStandardMaterial({color:'#1e2420',roughness:.65,metalness:0}),-table.thickness+.025);
   // The source photograph is already shaded (mean sRGB 22/34/27). Multiplying it
   // into the albedo made the surface nearly black. Use its grain around a neutral
   // mean plus weak relief, keeping base reflectance independent of the photograph.
   feltTexture.colorSpace=T.NoColorSpace;feltTexture.wrapS=T.RepeatWrapping;feltTexture.wrapT=T.RepeatWrapping;feltTexture.repeat.set(table.feltTextureRepeat,table.feltTextureRepeat);feltTexture.anisotropy=4;
   const feltGeometry=new T.ShapeGeometry(outline(table.width-2*table.rimWidth+.018,table.depth-2*table.rimWidth+.018,table.cornerRadius-table.rimWidth),24);
   // ShapeGeometry's default UVs are scene coordinates; normalize them before tiling.
   const uv=feltGeometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/table.width+.5,uv.getY(i)/table.depth+.5);
   feltGeometry.rotateX(-Math.PI/2);
   const feltMaterial=new T.MeshPhysicalMaterial({color:table.feltColor,roughness:table.feltRoughness,metalness:0,reflectivity:.18,map:feltTexture,bumpMap:feltTexture,bumpScale:table.feltBumpScale});
   feltMaterial.onBeforeCompile=(shader?:{fragmentShader:string})=>{if(!shader)return;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec3 feltSample = texture2D(map, vMapUv).rgb;
    float feltGrain = dot(feltSample, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb *= clamp(1.0 + (feltGrain - ${table.feltTextureMean.toFixed(6)}) * ${table.feltTextureContrast.toFixed(6)}, 0.84, 1.16);`);};
   tablePart(feltGeometry,feltMaterial,table.feltHeight);
   const rim=outline(table.width-.04,table.depth-.04,table.cornerRadius);
   rim.holes.push(new T.Path(outline(table.width-2*table.rimWidth,table.depth-2*table.rimWidth,table.cornerRadius-table.rimWidth).getPoints(24).reverse()));
   tablePart(solid(rim,table.rimHeight,.018),new T.MeshPhysicalMaterial({color:table.rimColor,roughness:table.rimRoughness,metalness:0,reflectivity:.3,clearcoat:.16,clearcoatRoughness:.4}),-.025+.018);
   const contactGroup=new T.Group();scene.add(contactGroup);
   for(const contact of contract.contactShadows){
    const g=new T.PlaneGeometry(contact.width,contact.depth);g.rotateX(-Math.PI/2);
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:contact.opacity}},vertexShader:'varying vec2 shadowUv; void main(){shadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`varying vec2 shadowUv;
uniform float opacity;
void main(){
 vec2 p=(shadowUv-.5)*2.0;
 float a=pow(max(0.0,1.0-dot(p,p)),2.2)*opacity;
 gl_FragColor=vec4(0.025,0.035,0.025,a);
 #include <colorspace_fragment>
}`});
    // Intersect the source contact's original camera ray with the tabletop.
    // Keep that world anchor fixed during camera movement, without screen pinning.
    const [contactX,contactY,contactZ]=motion?sourcePlanePixel(contact.sourceX,contact.sourceY,projection):[(contact.sourceX-dealer.sourceWidth/2)*dealer.width/dealer.sourceWidth,dealerY+(dealer.cropHeight/2-contact.sourceY)*dealer.width/dealer.sourceWidth,dealer.depth];
    const [cx,cy,cz]=contract.camera.position,shadowY=table.feltHeight+.002,rayRatio=(shadowY-cy)/(contactY-cy);
    const shadow=mesh(g,material,cx+(contactX-cx)*rayRatio,shadowY,cz+(contactZ-cz)*rayRatio);
    shadow.renderOrder=1;scene.remove(shadow);contactGroup.add(shadow);
   }
   const key=spatial(new T.DirectionalLight('#fff3e3',2.2)),fill=spatial(new T.DirectionalLight('#dfeaff',.8));
   key.position.set(...contract.lightPlacement.key as [number,number,number]);fill.position.set(...contract.lightPlacement.fill as [number,number,number]);scene.add(key);scene.add(fill);scene.add(new T.HemisphereLight('#e6eee9','#19221c',contract.lightPlacement.hemisphereIntensity));
   const render=()=>{if(!disposed&&!document.hidden)renderer.render(scene,camera);};
   const light=(name:string)=>{const p=contract.lights[name];key.color.set(p.key);key.intensity=p.keyIntensity;fill.color.set(p.fill);fill.intensity=p.fillIntensity;renderer.toneMappingExposure=p.exposure;render();};
   const sized=()=>{if(!host.current||disposed)return;const w=host.current.clientWidth,h=host.current.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();render();};
   resize=new ResizeObserver(sized);resize.observe(host.current);
   const cameraPan=(x:number,y:number)=>{const [cx,cy,cz]=contract.camera.position;camera.position.set(cx+x*contract.camera.maxPan[0],cy+y*contract.camera.maxPan[1],cz);render();};
   const recordCamera=(moving:boolean):Promise<Blob>=>{
    if(activeRecording)return Promise.reject(Error('Ett kameraprov spelas redan in.'));
    if(disposed||document.hidden||!canvas.current)return Promise.reject(Error('Scenen måste vara synlig för att spela in.'));
    if(typeof MediaRecorder==='undefined'||typeof canvas.current.captureStream!=='function')return Promise.reject(Error('Webbläsaren saknar stöd för visningsinspelning.'));
    if(moving&&(!video||!motion))return Promise.reject(Error('Ingen givning är tillgänglig.'));
    const sourceCanvas=canvas.current,sourceVideo=video,savedPan:[number,number]=[...position.current],savedCards=cardsGroup.visible,savedRate=sourceVideo?.playbackRate??1;
    sourceVideo?.pause();const savedTime=sourceVideo?.currentTime??0;
    const startFrame=moving?Math.max(0,motion!.contactFrame-90):0,startTime=moving?startFrame/motion!.fps:0,endTime=moving?motion!.reviewEndFrame/motion!.fps:0;
    if(moving&&endTime<=startTime)return Promise.reject(Error('Rörelseprovet saknar ett spelbart intervall.'));
    const signalController=new AbortController(),restoreController=new AbortController(),chunks:BlobPart[]=[],capture=document.createElement('canvas');
    let recorder:MediaRecorder|undefined,stream:MediaStream|undefined,raf:number|undefined,stopTimer:ReturnType<typeof setTimeout>|undefined;
    let failure:Error|undefined,finishing=false,settled=false,stopRequested=false;
    // Both setup waits and a restore seek are bounded and remove their listeners.
    const waitForVideo=(event:string,ready:()=>boolean,signal?:AbortSignal,action?:()=>void)=>new Promise<void>((resolve,reject)=>{
     if(!sourceVideo){resolve();return;}
     let timer:ReturnType<typeof setTimeout>|undefined,done=false;
     const finish=(error?:Error)=>{if(done)return;done=true;if(timer)clearTimeout(timer);sourceVideo.removeEventListener(event,check);sourceVideo.removeEventListener('error',bad);signal?.removeEventListener('abort',aborted);error?reject(error):resolve();};
     const check=()=>{if(ready())finish();},bad=()=>finish(Error('Råfilmen kunde inte läsas.')),aborted=()=>finish(Error('Kameraprovet avbröts.'));
     sourceVideo.addEventListener(event,check);sourceVideo.addEventListener('error',bad);signal?.addEventListener('abort',aborted,{once:true});
     timer=setTimeout(()=>finish(Error('Råfilmen svarade inte i tid.')),10000);
     if(signal?.aborted){aborted();return;}
     try{action?.();check();}catch(error){finish(error instanceof Error?error:Error('Källrutan kunde inte sökas.'));}
    });
    const seekVideo=(time:number,signal?:AbortSignal)=>waitForVideo('seeked',()=>!sourceVideo!.seeking&&sourceVideo!.readyState>=2&&Math.abs(sourceVideo!.currentTime-time)<.01,signal,()=>{sourceVideo!.currentTime=time;});
    return new Promise<Blob>((resolve,reject)=>{
     const session={abort:(reason:Error)=>stop(reason)};activeRecording=session;
     const lostContext=()=>stop(Error('Scenens grafikyta förlorades under inspelningen.'));sourceCanvas.addEventListener('webglcontextlost',lostContext);
     const finish=()=>{
      if(finishing)return;finishing=true;stopRequested=true;signalController.abort();if(raf!==undefined)cancelAnimationFrame(raf);raf=undefined;if(stopTimer)clearTimeout(stopTimer);
      sourceCanvas.removeEventListener('webglcontextlost',lostContext);
      if(recorder){recorder.ondataavailable=null;recorder.onerror=null;recorder.onstop=null;}
      stream?.getTracks().forEach(track=>track.stop());sourceVideo?.pause();
      const restore=async()=>{
       if(disposed)return;
       cardsGroup.visible=savedCards;setPriorCards(savedCards);position.current=savedPan;setPan(savedPan);
       try{cameraPan(...savedPan);}catch{failure??=Error('Kameravyn återställdes men kunde inte renderas.');}
       if(sourceVideo){sourceVideo.playbackRate=savedRate;if(document.hidden){sourceVideo.currentTime=savedTime;setFrame(Math.floor(savedTime*motion!.fps+.01));}else await seekVideo(savedTime,restoreController.signal);}
      };
      void restore().catch(()=>{failure??=Error('Inspelningen avslutades men ursprungsrutan kunde inte återställas.');}).finally(()=>{
       settled=true;if(activeRecording===session)activeRecording=undefined;capture.width=0;capture.height=0;
       if(failure||disposed)reject(failure??Error('Kameraprovet avbröts.'));else if(!chunks.length)reject(Error('Inspelningen innehöll inga bildrutor.'));else resolve(new Blob(chunks,{type:recorder?.mimeType||'video/webm'}));
      });
     };
     function stop(reason?:Error){
      if(settled)return;if(reason)failure??=reason;if(finishing){restoreController.abort();return;}
      signalController.abort();if(raf!==undefined)cancelAnimationFrame(raf);raf=undefined;sourceVideo?.pause();
      if(stopRequested)return;stopRequested=true;
      if(recorder&&recorder.state!=='inactive'){
       stopTimer=setTimeout(()=>{failure??=Error('Inspelaren kunde inte avslutas.');finish();},2500);
       try{recorder.stop();}catch{failure??=Error('Inspelaren kunde inte stoppas.');finish();}
       stream?.getTracks().forEach(track=>track.stop());
      }else finish();
     }
     void(async()=>{
      try{
       if(sourceVideo)await waitForVideo('loadeddata',()=>sourceVideo.readyState>=2,signalController.signal);
       if(moving){await seekVideo(startTime,signalController.signal);if(stopRequested||disposed)return;cardsGroup.visible=true;setPriorCards(true);sourceVideo!.playbackRate=1;}
       if(stopRequested||disposed)return;
       capture.width=sourceCanvas.width;const labelSize=Math.max(12,Math.round(capture.width/80)),labelHeight=Math.ceil(labelSize*3.4);capture.height=sourceCanvas.height+labelHeight;
       const context=capture.getContext('2d');if(!context)throw Error('Visningsytan kunde inte skapas.');
       const captureFrame=()=>{
        const contentHeight=capture.height-labelHeight,scale=Math.min(capture.width/sourceCanvas.width,contentHeight/sourceCanvas.height),w=sourceCanvas.width*scale,h=sourceCanvas.height*scale;
        context.fillStyle='#101513';context.fillRect(0,0,capture.width,capture.height);context.drawImage(sourceCanvas,(capture.width-w)/2,(contentHeight-h)/2,w,h);
        context.fillStyle='white';context.font=`${labelSize}px sans-serif`;
        context.fillText(`Visningsinspelning · ${moving?`${motion!.label} 1× + panorering`:'fryst ruta + panorering'}`,12,capture.height-labelSize*1.95,capture.width-24);
        context.fillText('Möjliga tappade bildrutor · inte källtiming',12,capture.height-labelSize*.55,capture.width-24);
       };
       cameraPan(0,0);captureFrame();stream=capture.captureStream(30);
       const mimeType=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8000000});
       recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onerror=()=>stop(Error('Visningsinspelaren rapporterade ett fel.'));recorder.onstop=()=>{if(!stopRequested)failure??=Error('Visningsinspelaren stannade oväntat.');finish();};recorder.start();
       if(moving)await sourceVideo!.play();
       if(stopRequested||disposed){sourceVideo?.pause();return;}
       const points:[number,number][]=[[0,0],[-1,-1],[-1,1],[1,1],[1,-1],[0,0]],begin=performance.now();
       let lastProgress=startTime,lastAdvance=begin,completedAt:number|undefined;
       const step=(now:number)=>{
        try{
        raf=undefined;if(stopRequested||disposed||document.hidden){stop(Error('Kameraprovet avbröts när scenen doldes.'));return;}
        const progress=moving?Math.max(startTime,displayedMediaTime):0;
        if(moving&&progress>lastProgress){lastProgress=progress;lastAdvance=now;}
        if(moving&&now-lastAdvance>10000){stop(Error('Givningen slutade leverera bildrutor.'));return;}
        const t=moving?Math.max(0,Math.min(1,sourceVideo!.ended?1:(progress-startTime)/(endTime-startTime))):Math.min(1,(now-begin)/10000);
        const segment=Math.min(4,Math.floor(t*5)),f=Math.min(1,t*5-segment),ease=f*f*(3-2*f),a=points[segment],b=points[segment+1];
        cameraPan(a[0]+(b[0]-a[0])*ease,a[1]+(b[1]-a[1])*ease);captureFrame();
        // Let the canvas stream sample the final centre view before stopping.
        if(t>=1){sourceVideo?.pause();completedAt??=now;if(!moving||now-completedAt>=100){stop();return;}}
        raf=requestAnimationFrame(step);
        }catch(error){stop(error instanceof Error?error:Error('Visningsytan kunde inte spelas in.'));}
       };
       raf=requestAnimationFrame(step);
      }catch(error){stop(error instanceof Error?error:Error('Kameraprovet kunde inte startas.'));}
     })();
    });
   };
   control.current={pan(x,y){if(!activeRecording)cameraPan(x,y);},light(name){if(!activeRecording)light(name);},layer(name,on){if(activeRecording)return;objects[name].visible=on;contactGroup.visible=objects.dealer.visible&&objects.table.visible;render();},recordPan:()=>recordCamera(false),...(video&&motion?{recordMovingPan:()=>recordCamera(true),async play(){if(activeRecording)throw Error('Ett kameraprov spelas in.');if(video!.currentTime>=motion.reviewEndFrame/motion.fps)video!.currentTime=0;await video!.play();},pause(){if(!activeRecording)video!.pause();},seek(frame:number){if(activeRecording)return;video!.pause();video!.currentTime=Math.max(0,Math.min(motion.reviewEndFrame,frame))/motion.fps;}}:{})};
   if(video&&motion){
    const on=(type:string,listener:()=>void)=>{video!.addEventListener(type,listener);videoListeners.push({type,listener});};
    const decoded=(_now:number,metadata:VideoFrameCallbackMetadata)=>{if(disposed||!video)return;if(metadata.mediaTime>motion.reviewEndFrame/motion.fps+.001){video.pause();video.currentTime=motion.reviewEndFrame/motion.fps;return;}displayedMediaTime=metadata.mediaTime;setFrame(Math.min(motion.reviewEndFrame,Math.floor(metadata.mediaTime*motion.fps+0.01)));render();if(!video.paused)videoFrameHandle=video.requestVideoFrameCallback(decoded);};
    on('loadeddata',()=>{if(disposed||shaderFailed)return;render();setReadyMotionFile(motion.file);setStatus('Rörelseprovet är klart · preliminär grönmask');});
    on('play',()=>{setPlaying(true);if(videoFrameHandle!==undefined)video!.cancelVideoFrameCallback(videoFrameHandle);videoFrameHandle=video!.requestVideoFrameCallback(decoded);});
    on('pause',()=>{setPlaying(false);if(videoFrameHandle!==undefined)video!.cancelVideoFrameCallback(videoFrameHandle);videoFrameHandle=undefined;});
    on('seeked',()=>{displayedMediaTime=video!.currentTime;setFrame(Math.min(motion.reviewEndFrame,Math.floor(video!.currentTime*motion.fps+0.01)));render();});
    on('timeupdate',()=>{if(video!.currentTime>motion.reviewEndFrame/motion.fps){video!.pause();video!.currentTime=motion.reviewEndFrame/motion.fps;}});
    on('error',()=>{setReadyMotionFile(null);activeRecording?.abort(Error('Råfilmen kunde inte laddas.'));setStatus('Råfilmen kunde inte laddas.');});
    video.load();
   }
   const resume=()=>{if(document.hidden){activeRecording?.abort(Error('Kameraprovet avbröts när sidan doldes.'));video?.pause();}else render();};document.addEventListener('visibilitychange',resume);const oldCleanup=cleanup;cleanup=()=>{document.removeEventListener('visibilitychange',resume);oldCleanup();};
   light('neutral');sized();if(!shaderFailed)setStatus('Scenen är klar');
  }
  mount().catch(error=>{cleanup();if(!disposed)setStatus(`Scenen kunde inte laddas: ${error instanceof Error?error.message:'WebGL saknas'}`);});
  return()=>{disposed=true;cleanup();};
 },[contract,motion,landedCards]);
 const light=contract.lights[profile];
 return <main className="ps-root"><style>{`
 .ps-root{min-height:100vh;background:#101714;color:#e7ede7;font:15px/1.5 system-ui,sans-serif;padding:28px max(24px,calc((100vw - 1440px)/2));box-sizing:border-box}.ps-root *{box-sizing:border-box}.ps-root a{color:#c9d9c4}.ps-head{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:20px}.ps-head h1{font-size:34px;letter-spacing:-1px;margin:4px 0}.ps-kicker{color:#b7c7a9;letter-spacing:2px;font-size:11px;text-transform:uppercase}.ps-head p{margin:0;color:#a9b7ad;max-width:640px}.ps-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:18px}.ps-stage{height:min(70vh,720px);min-height:440px;position:relative;border:1px solid #3b4840;border-radius:18px;overflow:hidden;background:#17211b;touch-action:none;cursor:grab;outline-offset:4px}.ps-stage:active{cursor:grabbing}.ps-stage canvas{display:block;width:100%;height:100%}.ps-overlay{position:absolute;left:18px;top:16px;background:#0d171bd9;border:1px solid #526351;border-radius:20px;padding:5px 12px;font-size:12px;pointer-events:none}.ps-hint{position:absolute;bottom:15px;left:18px;color:#dbe5db;font-size:12px;background:#111a14d9;padding:7px 12px;border-radius:8px;pointer-events:none}.ps-panel{background:#1b251f;border:1px solid #38483c;border-radius:18px;padding:20px}.ps-panel h2{font-size:16px;margin:0 0 16px}.ps-panel h3{font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 10px;color:#a6b49f}.ps-panel label{display:flex;justify-content:space-between;gap:10px;margin:12px 0}.ps-panel select,.ps-panel button{font:inherit;color:#f0f3ec;background:#2d3c31;border:1px solid #607459;padding:9px 12px;border-radius:8px}.ps-panel select{width:100%}.ps-panel button{width:100%;cursor:pointer}.ps-panel small{display:block;color:#b6c1b6;margin:10px 0}.ps-values{font-variant-numeric:tabular-nums;font-size:12px;line-height:1.8;color:#c6d1c6}.ps-foot{display:flex;flex-wrap:wrap;gap:14px 26px;margin-top:18px;color:#acbbae;font-size:12px}.ps-foot p{margin:0;max-width:800px}.ps-status{font-size:12px;color:#bfcbbd;margin-top:14px}@media(max-width:900px){.ps-grid{grid-template-columns:1fr}.ps-stage{min-height:360px;height:55vh}.ps-panel{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px}.ps-head{display:block}.ps-root{padding:20px 14px}}@media(prefers-reduced-motion:reduce){.ps-root *{scroll-behavior:auto}}
 `}</style>
 <header className="ps-head"><div><a href={publicMode?'/studio':'/'}>← Studion</a><div className="ps-kicker">Pamela / rum & material / scenprov</div><h1>{motion?'Givning i en separat scen':'En scen med djup'}</h1><p>{motion?'Vald givning spelas över ett separat bord och rum. Dra försiktigt och kontrollera handen vid nedsläpp.':'Separat bakgrund, bord med kant och en plan dealerreferens. Dra försiktigt för att pröva kompositionen.'}</p></div><a href={motion?(publicMode?'/pamela-loop.html':'/pamela-prov?view=round'):(publicMode?'/pamela-prov.html':'/komposition')}>{motion?'Visa hela kedjan →':'Visa filmkomposition →'}</a></header>
 <div className="ps-grid"><div ref={host} className="ps-stage" tabIndex={0} role="region" aria-label="Interaktiv scen. Dra för begränsad panorering, eller använd piltangenter. Home återställer."
 onPointerDown={e=>{if(recording||e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,px:position.current[0],py:position.current[1]};}}
 onPointerMove={e=>{const d=drag.current;if(d)move(d.px-(e.clientX-d.x)/220,d.py+(e.clientY-d.y)/220);}}
 onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
 onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')move(0,0);else move(position.current[0]+(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0),position.current[1]+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0));}}}>
 <canvas ref={canvas} aria-label={motion?'Scen med separat rum, bord och Pamela-film':'Three-scen med separat rum, bord och Pamela-still'}/><span className="ps-overlay">3D-bord · {motion?'rörlig dealer':'plan dealerreferens'}</span><span className="ps-hint">Dra eller använd piltangenter · kamerans riktning är låst</span></div>
 <aside className="ps-panel"><section><h2>Ljusstandard</h2><select aria-label="Ljusprofil" disabled={recording} value={profile} onChange={e=>{setProfile(e.target.value);control.current?.light(e.target.value);}}>{Object.entries(contract.lights).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select><div className="ps-values">Key {light.key} · {light.keyIntensity}<br/>Fill {light.fill} · {light.fillIntensity}<br/>Exponering {light.exposure.toFixed(2)}</div><small>Antagna relativa värden. Ljuset påverkar 3D-bordet; dealerns inspelade ljus ligger kvar.</small></section>
 {motion&&<section><h3>{motion.label}</h3>{motionOptions.length>1&&<label>Plats<select aria-label="Givning till plats" disabled={recording} value={motion.file} onChange={e=>setMotionFile(e.target.value)}>{motionOptions.map(m=><option key={m.file} value={m.file}>{m.label}</option>)}</select></label>}<button disabled={recording||!motionReady} onClick={()=>{if(playing)control.current?.pause?.();else void control.current?.play?.().catch(()=>setStatus('Filmen kunde inte startas.'));}}>{playing?'Pausa givningen':'Spela givningen'}</button><label>Ruta {frame} / {motion.reviewEndFrame}<input type="range" min={0} max={motion.reviewEndFrame} value={frame} disabled={recording||!motionReady} aria-label="Rörelsens källruta" onChange={e=>control.current?.seek?.(Number(e.target.value))}/></label><button disabled={recording||!motionReady} onClick={()=>control.current?.seek?.(motion.contactFrame)}>Visa kortsläppet</button><small><a href={url(motion.file)}>Öppna hela råfilmen</a> · {motion.fps} fps. {motion.reviewEndFrame<motion.frames-1?'Provet stannar före källkortets försvinnande.':'Hela råtagningen används i detta scenprov.'}</small></section>}
 <section><h3>Separata lager</h3>{([['room','Bakgrund'],['table','Bord + fysisk kant'],['dealer','Pamela + källans sko']] as const).map(([id,label])=><label key={id}>{label}<input type="checkbox" disabled={recording} checked={layers[id]} onChange={e=>{setLayers({...layers,[id]:e.target.checked});control.current?.layer(id,e.target.checked);}}/></label>)}{motion&&landedCards.length>0&&<><label>Tidigare platsers kort<input type="checkbox" disabled={recording} checked={priorCards} onChange={e=>{setPriorCards(e.target.checked);control.current?.layer('cards',e.target.checked);}}/></label><small>Prov med kort från lägre platsnummer. Separata lager som stannar kvar under givningen och panoreringen.</small></>}</section>
 <section><h3>Begränsad panorering</h3><div className="ps-values">X {(pan[0]*contract.camera.maxPan[0]).toFixed(2)} · Y {(pan[1]*contract.camera.maxPan[1]).toFixed(2)}<br/>Max ±{contract.camera.maxPan[0].toFixed(2)} / ±{contract.camera.maxPan[1].toFixed(2)} scenenheter</div><button disabled={recording} onClick={()=>move(0,0)}>Återställ vy</button><small>Ingen orbit eller ny vinkel på Pamela. Kortet sitter i samma källplan som handen och skon.</small>
 <button disabled={recording||!motionReady} onClick={()=>void saveCameraRecording(false)}>Spara kamerans granskningsprov</button><small>10 sekunder från mittläget genom fyra ytterlägen och tillbaka. Filmrutan står stilla.</small>
 {motion&&<><button disabled={recording||!motionReady} onClick={()=>void saveCameraRecording(true)}>{recording?'Spelar in visningsprovet…':'Spara givning med panorering'}</button><small>Givningen spelas i 1× från ruta {Math.max(0,motion.contactFrame-90)} till {motion.reviewEndFrame}, genom samma kamerabana. Tidigare platsers kort ligger kvar. Ursprunglig ruta och vy återställs pausade.</small></>}
 <small>Exporten är en märkt visningsinspelning. Bildrutor kan tappas; den bevisar inte källtiming. Dold sida avbryter inspelningen.</small></section><div className="ps-status" role="status">{status}</div></aside></div>
 <footer className="ps-foot"><p>{motion?<><strong>Rörelseprov:</strong> originalets tid och bildvinkel bevaras. Den nedre bildytan läggs på bordets plan; djupet är en approximation. Grönmask, kortseparering och skarvar är ännu inte godkända.</>:<><strong>Verifierat:</strong> originalruta 0, separat alfastill och återanvända lokala rum-/bordstillgångar.</>} <strong>Antagande:</strong> kameran, 3D-måtten och ljusplaceringen. Mattens kanter och handkontakten är fortfarande prov.</p><a href={url(motion?.provenance??contract.assets.provenance)}>Källor och filhashar</a></footer>
 </main>;
}

