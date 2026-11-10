interface VideoOptions {signal?:AbortSignal;createVideo?:()=>HTMLVideoElement;timeoutMs?:number}
interface PreloadedVideo {url:string;controller:AbortController;video:HTMLVideoElement|null;cancelled:boolean;promise:Promise<HTMLVideoElement>|null}
// Decode a replacement independently; the displayed video stays intact until commit.
export function loadVideoSource(url:string,{signal,createVideo=()=>document.createElement('video'),timeoutMs=15000}: VideoOptions={}): Promise<HTMLVideoElement>{
  const video=createVideo();video.muted=true;video.playsInline=true;video.preload='auto';
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadeddata',loaded);video.removeEventListener('canplay',loaded);video.removeEventListener('error',failed);signal?.removeEventListener('abort',aborted);};
    const finish=(error?:Error)=>{if(settled)return;settled=true;cleanup();if(error){releaseVideoSource(video);reject(error);}else resolve(video);};
    const loaded=()=>{if(video.readyState===undefined||video.readyState>=3)finish();},failed=()=>finish(new Error('Videon kunde inte läsas.')),aborted=()=>finish(new DOMException('Ersatt klippval','AbortError'));
    const timer=setTimeout(()=>finish(new Error('Videon tog för lång tid att läsa.')),timeoutMs);
    video.addEventListener('loadeddata',loaded);video.addEventListener('canplay',loaded);video.addEventListener('error',failed);signal?.addEventListener('abort',aborted,{once:true});
    if(signal?.aborted){aborted();return;}video.src=url;video.load();
  });
}
export function releaseVideoSource(video:HTMLVideoElement){video.pause();video.removeAttribute('src');video.load();}



// One decoded look-ahead, outside the displayed video. No growing media cache.
export function createVideoPreloader({load=loadVideoSource,release=releaseVideoSource}: {load?:typeof loadVideoSource;release?:typeof releaseVideoSource}={}){
  let entry:PreloadedVideo|null=null;
  function clear(){
    const old=entry;entry=null;if(!old)return;
    old.cancelled=true;old.controller.abort();if(old.video)release(old.video);
  }
  function warm(url:string|null|undefined){
    if(entry?.url===url)return;clear();if(!url)return;
    const item:PreloadedVideo={url,controller:new AbortController(),video:null,cancelled:false,promise:null};entry=item;
    item.promise=load(url,{signal:item.controller.signal}).then(video=>{
      if(item.cancelled){release(video);throw new DOMException('Ersatt förladdning','AbortError');}
      item.video=video;return video;
    }).catch(error=>{if(entry===item)entry=null;throw error;});
    // A speculative preload may fail. Taking it still observes the rejection.
    void item.promise.catch(()=>{});
  }
  async function take(url:string,{signal}: {signal?:AbortSignal}={}){
    if(entry?.url!==url)return load(url,{signal});
    const item=entry;entry=null;const abort=()=>item.controller.abort();
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try{const video=await item.promise!;if(signal?.aborted){release(video);throw new DOMException('Ersatt klippval','AbortError');}return video;}
    finally{signal?.removeEventListener('abort',abort);}
  }
  return {warm,take,clear};
}

// A video's playhead can lead the picture on screen. Cards must follow the
// decoded/presented media timestamp; seeking and older browsers have a fallback.
export function createPresentedFrameClock(video:HTMLVideoElement){
  let mediaTime=video.currentTime,seen=false,disposed=false,callback:number|null=null;
  const supported=typeof video.requestVideoFrameCallback==='function';
  const reset=()=>{seen=false;};
  function watch(){callback=video.requestVideoFrameCallback((_,frame)=>{if(disposed)return;mediaTime=frame.mediaTime;seen=true;watch();});}
  video.addEventListener('seeking',reset);if(supported)watch();
  return {get time(){return seen?mediaTime:video.currentTime;},dispose(){disposed=true;if(callback!==null)video.cancelVideoFrameCallback(callback);video.removeEventListener('seeking',reset);}};
}
