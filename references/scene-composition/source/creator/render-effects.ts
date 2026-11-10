import type {Effect} from './types.ts';
import * as T from '/scene/vendor/three.module.js';

// These are independent scene layers. The room image is never warped to animate them.
export function createStudioEffects(){
  const group=new T.Group(),resources:Array<{dispose():void}>=[],origin=Date.now();
  function texture(draw:(context:CanvasRenderingContext2D)=>void){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;draw(canvas.getContext('2d')!);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;resources.push(map);return map;}
  const glow=texture(ctx=>{const gradient=ctx.createRadialGradient(128,128,0,128,128,128);gradient.addColorStop(0,'rgba(255,245,190,1)');gradient.addColorStop(.15,'rgba(255,239,160,.55)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);});
  const mist=texture(ctx=>{const gradient=ctx.createRadialGradient(128,128,0,128,128,128);gradient.addColorStop(0,'rgba(210,222,222,.6)');gradient.addColorStop(1,'rgba(210,222,222,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);});
  const fireflies=new T.Group(),fog=new T.Group();group.add(fireflies,fog);
  for(let i=0;i<24;i++){const material=new T.SpriteMaterial({map:glow,transparent:true,depthWrite:false,blending:T.AdditiveBlending});const sprite=new T.Sprite(material);sprite.scale.setScalar(.055+(i%3)*.025);fireflies.add(sprite);resources.push(material);}
  for(let i=0;i<8;i++){const material=new T.SpriteMaterial({map:mist,transparent:true,opacity:.06,depthWrite:false});const sprite=new T.Sprite(material);sprite.scale.set(3.5,1,1);fog.add(sprite);resources.push(material);}
  const face=texture(ctx=>{ctx.fillStyle='#ebe5cf';ctx.beginPath();ctx.arc(128,128,125,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#404b3c';ctx.lineWidth=8;ctx.stroke();for(let i=0;i<60;i++){const a=i*Math.PI/30,r=i%5?112:102;ctx.lineWidth=i%5?1.5:3;ctx.beginPath();ctx.moveTo(128+Math.sin(a)*r,128-Math.cos(a)*r);ctx.lineTo(128+Math.sin(a)*117,128-Math.cos(a)*117);ctx.stroke();}ctx.font='19px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';for(let n=1;n<=12;n++){const a=n*Math.PI/6;ctx.fillStyle='#273428';ctx.fillText(String(n),128+Math.sin(a)*85,128-Math.cos(a)*85);}});
  const clock=new T.Group();clock.position.set(1.85,1.37,-1.1);group.add(clock);
  const faceGeometry=new T.CircleGeometry(.24,64),faceMaterial=new T.MeshBasicMaterial({map:face});clock.add(new T.Mesh(faceGeometry,faceMaterial));resources.push(faceGeometry,faceMaterial);
  const hands:T.Group[]=[];for(const [length,width,color]of [[.12,.018,0x243327],[.175,.012,0x243327],[.18,.006,0xb16c34]]){const g=new T.BoxGeometry(width,length,.005),m=new T.MeshBasicMaterial({color}),pivot=new T.Group(),hand=new T.Mesh(g,m);hand.position.y=length/2;hand.position.z=.012+hands.length*.005;pivot.add(hand);clock.add(pivot);hands.push(pivot);resources.push(g,m);}
  const stemGeometry=new T.CylinderGeometry(.015,.023,1.12,12),stemMaterial=new T.MeshStandardMaterial({color:0x5b5945,roughness:.55,metalness:.5}),stem=new T.Mesh(stemGeometry,stemMaterial);stem.position.set(0,-.8,-.04);clock.add(stem);resources.push(stemGeometry,stemMaterial);
  let settings:Effect[]=[];
  const setting=(id:string)=>settings.find(s=>s.id===id)??{enabled:false,intensity:0,speed:0};
  return {
    group,
    set(value:Effect[]|null|undefined){settings=value??[];},
    active(){return settings.some(s=>s.enabled&&s.intensity>0&&s.speed>0);},
    light(time:number){const s=setting('light');return s.enabled?(.94+.06*Math.sin(time*s.speed/100*.14))*s.intensity/100:1;},
    leaves(){return setting('leaves');},
    update(time:number){
      const f=setting('fireflies');fireflies.visible=f.enabled&&f.intensity>0;fireflies.children.forEach((child,i)=>{const p=child as T.Sprite;const t=time*f.speed/100;p.position.set(Math.sin(i*19.7+t*.19)*3,.4+(Math.sin(i*4.9+t*.3)+1)*1.1,-.6-Math.cos(i*1.3+t*.12)*2);p.material.opacity=f.intensity/100*(.4+.6*Math.pow(Math.sin(i+t),2));});
      const m=setting('fog');fog.visible=m.enabled&&m.intensity>0;fog.children.forEach((child,i)=>{const p=child as T.Sprite;const t=time*m.speed/100;p.position.set(Math.sin(i*1.9+t*.08)*5,.12+(i%3)*.06,-1.8-(i%4)*1.4);p.material.opacity=m.intensity/100*.19;});
      const c=setting('clock');clock.visible=c.enabled&&c.intensity>0;clock.traverse(object=>{if(object instanceof T.Mesh && !Array.isArray(object.material)){object.material.transparent=c.intensity<100;object.material.opacity=c.intensity/100;}});const date=new Date(origin+time*c.speed/100*1000),seconds=date.getSeconds()+date.getMilliseconds()/1000,minutes=date.getMinutes()+seconds/60,hours=date.getHours()+minutes/60;hands[0].rotation.z=-hours*Math.PI/6;hands[1].rotation.z=-minutes*Math.PI/30;hands[2].rotation.z=-seconds*Math.PI/30;
    },
    dispose(){group.removeFromParent();for(const r of resources)r.dispose();},
  };
}
