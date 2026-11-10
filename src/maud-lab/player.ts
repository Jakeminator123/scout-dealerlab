import {decodeChunk} from './decoder';
type Entry={frame:VideoFrame;tag:any};
export type PlaybackReceipt={id:string;success:boolean;error:string|null;textToAudibleMs:number|null;firstPacketMs:number|null;queueWaitMs:number;frames:number;expected:number;missingMouthFrames:number[];droppedVideoFrames:number;droppedDuringSpeech:number|null;maxSpeechFrameIntervalMs:number|null;maxDriftMs:number|null;mode:string};
export class MaudPlayer{
 video:HTMLVideoElement;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;loop=true;talk:Talk|null=null;private raf=0;
 state:(message:string)=>void;finished:(receipt:PlaybackReceipt)=>void;
 constructor(video:HTMLVideoElement,canvas:HTMLCanvasElement,state:(s:string)=>void,finished:(r:PlaybackReceipt)=>void){
  this.video=video;this.canvas=canvas;this.ctx=canvas.getContext('2d')!;this.state=state;this.finished=finished;
  video.onloadeddata=()=>this.ctx.drawImage(video,0,0);video.onended=()=>{
   if(this.talk?.started){this.talk.ended=true;void this.talk.finish();}
   else if(this.talk?.canStart)void this.talk.start();
   else if(this.loop){video.currentTime=0;void video.play();}
  };this.tick();
 }
 private tick(){this.raf=this.video.requestVideoFrameCallback((_now,m)=>{this.ctx.drawImage(this.video,0,0);this.talk?.draw(m);this.tick();});}
 async play(){if(this.video.ended)this.video.currentTime=0;await this.video.play();}
 pause(){this.video.pause();}
 async prepare(mode:string){
  if(this.talk)await this.talk.finish('Ersatt av en ny replik.');
  const talk=new Talk(this,mode);this.talk=talk;
  // Keep the original moving while the answer is prepared. This also starts the
  // source decoder before its timeline is bound to the generated audio.
  try{await talk.ac.resume();await this.play();}
  catch{await talk.finish('Originalfilmen kunde inte starta.');}
  return talk;
 }
 dispose(){this.video.cancelVideoFrameCallback(this.raf);this.talk?.cancel();this.video.pause();this.video.onended=null;this.video.onloadeddata=null;}
}
export class Talk{
 player:MaudPlayer;mode:string;ac:AudioContext;zero=performance.now();id='';frames=new Map<number,Entry>();received=new Set<number>();missing=new Set<number>();
 started=false;canStart=false;ended=false;done=false;closed=false;expected=0;audio:any=null;firstPacket:number|null=null;readyAt=0;queueWait=0;speechMs:number|null=null;
 private source:AudioBufferSourceNode|null=null;private scheduled=0;private offset=0;private drifts:number[]=[];private initialDropped=0;private speechDroppedStart:number|null=null;private speechDroppedEnd:number|null=null;private speechPresentationTimes:number[]=[];private decodeTail=Promise.resolve();
 private packed=document.createElement('canvas');private patch=document.createElement('canvas');
 constructor(player:MaudPlayer,mode:string){this.player=player;this.mode=mode;this.ac=new AudioContext({sampleRate:24000,latencyHint:'interactive'});this.packed.width=256;this.packed.height=512;this.patch.width=this.patch.height=256;}
 async on(message:any){
  if(this.closed)return;
  if(message.t==='text_ready'){this.id=message.id;this.zero=performance.now();this.player.state('Texten är färdig. Förbereder röst och mun …');}
  if(message.t==='audio'){
   const bytes=Uint8Array.from(atob(message.pcm),(c:string)=>c.charCodeAt(0)),view=new DataView(bytes.buffer),buffer=this.ac.createBuffer(1,63000,24000),target=buffer.getChannelData(0);
   if(message.samples+5280>63000||message.frames>63)throw Error('Ljudet ryms inte i filmen.');
   for(let i=0;i<message.samples;i++)target[5280+i]=view.getInt16(2*i,true)/32768;
   const rms:number[]=[];for(let at=0;at<message.samples;at+=240){let energy=0;for(let i=at;i<Math.min(at+240,message.samples);i++)energy+=target[5280+i]**2;rms.push(Math.sqrt(energy/240));}
   const threshold=Math.max(...rms)*0.03,leading=Math.max(0,rms.findIndex((v,i)=>v>threshold&&(rms[i+1]??0)>threshold));
   this.audio={...message,buffer,leadingMs:leading*10};this.expected=message.frames;this.maybeStart();
  }
  if(message.t==='chunk'){
   this.firstPacket??=performance.now()-this.zero;
   const data=Uint8Array.from(atob(message.data),(c:string)=>c.charCodeAt(0)),meta=message.meta;
   this.decodeTail=this.decodeTail.then(async()=>{
    const decoded=await decodeChunk(data);if(this.closed){decoded.forEach(f=>f.close());return;}
    if(decoded.length!==meta.rutor.length){decoded.forEach(f=>f.close());throw Error('Fel bildruteantal.');}
    decoded.forEach((frame,i)=>{const n=meta.fran+i;if(this.received.has(n)||n>=63){frame.close();throw Error('Dubblerad eller oväntad munruta.');}this.received.add(n);this.frames.set(n,{frame,tag:meta.rutor[i]});});this.maybeStart();
   }).catch(e=>void this.finish(e.message));
  }
  if(message.t==='result'){this.done=true;void this.finish();}
  if(message.t==='error')await this.finish(message.code);
 }
 private maybeStart(){
  if(this.canStart||!this.audio||this.closed)return;for(let n=0;n<Math.min(12,this.expected);n++)if(!this.frames.has(n))return;
  this.canStart=true;this.readyAt=performance.now();
  if(this.mode==='next'&&!this.player.video.paused&&!this.player.video.ended)this.player.state('Munlagret är klart. Väntar på nästa filmvarv …');else void this.start();
 }
 async start(){
  if(this.started||this.closed)return;this.queueWait=performance.now()-this.readyAt;
  const video=this.player.video;video.pause();
  if(video.currentTime!==0)await new Promise<void>(resolve=>{video.addEventListener('seeked',()=>resolve(),{once:true});video.currentTime=0;});
  if(this.closed)return;this.initialDropped=video.getVideoPlaybackQuality().droppedVideoFrames;
  // A loaded/seeked frame can still have a pending callback before playback begins.
  // Bind audio only after play() confirms that the source timeline is running.
  try{await video.play();if(this.closed){video.pause();return;}this.started=true;this.player.state('Maud pratar');}
  catch{await this.finish('Uppspelningen kunde inte starta.');}
 }
 draw(m:VideoFrameCallbackMetadata){
  if(!this.started||this.closed||!this.audio)return;const n=Math.max(0,Math.round(m.mediaTime*24));
  if(!this.source){
   const clock=this.ac.getOutputTimestamp();this.scheduled=this.ac.currentTime+0.025;
   const out=clock.performanceTime!+(this.scheduled-clock.contextTime!)*1000;this.offset=m.mediaTime+(out-m.expectedDisplayTime)/1000;
   if(this.offset<0||this.offset>=0.22){void this.finish('Ljudklockan hann inte synkroniseras. Prova igen.');return;}
   this.source=this.ac.createBufferSource();this.source.buffer=this.audio.buffer;this.source.connect(this.ac.destination);this.source.start(this.scheduled,this.offset);
   this.speechMs=out-this.zero+(0.22+this.audio.leadingMs/1000-this.offset)*1000;
  }
  const entry=this.frames.get(n);if(n<this.expected&&!entry)this.missing.add(n);
  if(entry?.tag){
   if(entry.tag.ruta!==n||entry.tag.tagning!==this.audio.take){void this.finish('Munlagret hör till fel filmruta.');return;}
   const packed=this.packed.getContext('2d',{willReadFrequently:true})!;packed.drawImage(entry.frame,0,0);
   const color=packed.getImageData(0,0,256,256),mask=packed.getImageData(0,256,256,256);for(let i=0;i<color.data.length;i+=4)color.data[i+3]=mask.data[i];this.patch.getContext('2d')!.putImageData(color,0,0);
   const [x,y,w,h]=entry.tag.rect;this.player.ctx.drawImage(this.patch,x,y,w,h);
  }
  if(m.mediaTime>=0.22&&m.mediaTime<=0.22+this.audio.samples/24000){
   const c=this.ac.getOutputTimestamp();this.drifts.push((c.contextTime!+(m.expectedDisplayTime-c.performanceTime!)/1000-this.scheduled+this.offset-m.mediaTime)*1000);
   this.speechDroppedStart??=this.player.video.getVideoPlaybackQuality().droppedVideoFrames;this.speechDroppedEnd=this.player.video.getVideoPlaybackQuality().droppedVideoFrames;this.speechPresentationTimes.push(m.expectedDisplayTime);
  }
  for(const [key,value] of this.frames)if(key<n){value.frame.close();this.frames.delete(key);}
 }
 cancel(){void this.finish('Avbruten av användaren.');}
 async finish(error?:string){
  if(this.closed||(!error&&!(this.ended&&this.done)))return;this.closed=true;await this.decodeTail;
  try{this.source?.stop();}catch{}await this.ac.close();
  const receipt:PlaybackReceipt={id:this.id,success:!error,error:error??null,textToAudibleMs:this.speechMs,firstPacketMs:this.firstPacket,queueWaitMs:this.queueWait,frames:this.received.size,expected:this.expected,missingMouthFrames:[...this.missing],droppedVideoFrames:this.started?this.player.video.getVideoPlaybackQuality().droppedVideoFrames-this.initialDropped:0,droppedDuringSpeech:this.speechDroppedStart===null?null:this.speechDroppedEnd!-this.speechDroppedStart,maxSpeechFrameIntervalMs:this.speechPresentationTimes.length>1?Math.max(...this.speechPresentationTimes.slice(1).map((n,i)=>n-this.speechPresentationTimes[i])):null,maxDriftMs:this.drifts.length?Math.max(...this.drifts.map(Math.abs)):null,mode:this.mode};
  for(const entry of this.frames.values())entry.frame.close();this.frames.clear();if(this.player.talk!==this)return;this.player.talk=null;this.player.finished(receipt);
  if(error){this.player.video.pause();this.player.state(error);}else{this.player.state('Klart – Maud är redo igen');if(this.player.loop){this.player.video.currentTime=0;void this.player.video.play();}}
 }
}
