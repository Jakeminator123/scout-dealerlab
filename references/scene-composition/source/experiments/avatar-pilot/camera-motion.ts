export interface CameraValues {orbit:number;yaw:number;pitch:number;zoom:number}
type CameraKey=keyof CameraValues;
// Same camera geometry and damping as scene/scene3d.mjs on port 4320.
// Pointer motion lives here; persistence and panel DOM update only after a gesture.
const bounds={orbit:[-78,78],yaw:[-55,55],pitch:[-25,30],zoom:[65,180]};
export function createCameraMotion(initial: Partial<CameraValues>){
  const target={orbit:0,yaw:0,pitch:0,zoom:100},current={...target};
  function set(patch: Partial<CameraValues>){for(const key of Object.keys(bounds) as CameraKey[]){const [min,max]=bounds[key],value=patch[key];if(typeof value==='number'&&Number.isFinite(value))target[key]=Math.min(max,Math.max(min,value));}}
  set(initial);Object.assign(current,target);
  return {
    set,get target(){return {...target};},get value(){return {...current};},
    step(seconds:number,reduced=false){
      const ease=reduced?1:Math.min(1,Math.max(0,seconds)*7);let changed=false,moving=false;
      for(const key of Object.keys(bounds) as CameraKey[]){
        const delta=target[key]-current[key];if(delta===0)continue;changed=true;
        current[key]=Math.abs(delta)<.0001?target[key]:current[key]+delta*ease;
        if(current[key]!==target[key])moving=true;
      }
      return {changed,moving};
    },
  };
}
export function renderPixelRatio(width:number,height:number,dpr:number){return Math.min(dpr,1.5,2200/width,Math.sqrt(2600000/(width*height)));}

// A photo can zoom and pan, but cannot supply unseen room sides. Keep every
// camera corner inside its image; leave the true panorama paths unchanged.
export function photoBackdropLayout({aspect,imageAspect,zoom,yaw=0,pitch=0,orbit=0}: {aspect:number;imageAspect:number;zoom:number;yaw?:number;pitch?:number;orbit?:number}){
  const field=2*Math.tan(24*Math.PI/180)*Math.max(1,1.6/aspect);
  const height=field*100/bounds.zoom[0]*Math.max(1,aspect/imageAspect),width=height*imageAspect;
  const viewHeight=field*100/zoom,viewWidth=viewHeight*aspect;
  const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
  return {width,height,x:-Math.max(0,width-viewWidth)/2*clamp((yaw+orbit)/55),y:-Math.max(0,height-viewHeight)/2*clamp(pitch/30)};
}
