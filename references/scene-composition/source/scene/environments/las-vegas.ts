import type * as Three from 'three';
/**
 * Local Vegas environment: one slow neon pulse and one ticking analog clock.
 * Panorama: built-in image_gen, 2026-11-07, original 1774 x 887, not upscaled.
 * Prompt: photorealistic 2:1 equirectangular exclusive Vegas casino, empty central
 * floor, distant slot machines, warm dark materials, restrained magenta/cyan;
 * no people, casino tables, brands, readable text or baked-in clocks.
 * Exact prompt and generated-source provenance: .cache/room-study/las-vegas/.
 * Time is supplied by the scene; no private timer runs while the scene is paused.
 */
export const panoramaLevels = Object.freeze({
  1024: Object.freeze({file:'vegas-panorama-1k.jpg',width:1024,height:512,bytes:153162}),
  1774: Object.freeze({file:'vegas-panorama.jpg',width:1774,height:887,bytes:567656}),
});

export function createEnvironmentFx(THREE:typeof Three) {
  const group = new THREE.Group();
  group.name = 'las-vegas-environment';
  const geometries = new Set<Three.BufferGeometry>();
  const materials = new Set<Three.Material>();
  let disposed = false;
  const geometry = <T extends Three.BufferGeometry>(value:T) => (geometries.add(value), value);
  const material = <T extends Three.Material>(value:T) => (materials.add(value), value);
  const metal = material(new THREE.MeshStandardMaterial({color:0x20232a,metalness:.85,roughness:.32}));
  const brass = material(new THREE.MeshStandardMaterial({color:0x947548,metalness:.78,roughness:.3}));
  const dial = material(new THREE.MeshStandardMaterial({color:0xe5d7b9,metalness:.05,roughness:.72}));
  const ink = material(new THREE.MeshStandardMaterial({color:0x20252a,metalness:.35,roughness:.4}));
  const secondInk = material(new THREE.MeshStandardMaterial({color:0x8c294b,metalness:.35,roughness:.38}));
  const magenta = material(new THREE.MeshBasicMaterial({color:0xdc438e,toneMapped:false}));
  const cyan = material(new THREE.MeshBasicMaterial({color:0x58c4cf,toneMapped:false}));
  const magentaBase = magenta.color.clone();
  const cyanBase = cyan.color.clone();
  function mesh(parent:Three.Object3D,shape:Three.BufferGeometry,finish:Three.Material,position:[number,number,number]=[0,0,0]) {
    const object = new THREE.Mesh(geometry(shape),finish);
    object.position.set(...position);
    parent.add(object);
    return object;
  }
  const box = (parent:Three.Object3D,w:number,h:number,d:number,finish:Three.Material,position?:[number,number,number]) => mesh(parent,new THREE.BoxGeometry(w,h,d),finish,position);

  // Anchored architectural sconces. Geometry never moves, only emitted light changes.
  for(const [x,finish] of [[-3.1,magenta],[3.1,cyan]] as const) {
    const sconce = new THREE.Group();
    sconce.name = x < 0 ? 'vegas-magenta-sconce' : 'vegas-cyan-sconce';
    sconce.position.set(x,1.65,-4.8);
    sconce.scale.setScalar(.45);
    group.add(sconce);
    box(sconce,.18,3.5,.14,metal);
    box(sconce,.024,3.3,.022,brass,[-.066,0,.081]);
    box(sconce,.024,3.3,.022,brass,[.066,0,.081]);
    box(sconce,.035,3.24,.026,finish,[0,0,.092]);
  }
  const magentaLight = new THREE.PointLight(0xe45da0,.5,8,2);
  const cyanLight = new THREE.PointLight(0x71d4db,.5,8,2);
  magentaLight.position.set(-3.2,2.65,-.4);
  cyanLight.position.set(3.2,2.65,-.4);
  group.add(magentaLight,cyanLight);

  // A floor-mounted lobby clock keeps the dial clear of the dealer's silhouette.
  const clock = new THREE.Group();
  clock.name = 'vegas-analog-clock';
  clock.position.set(2.4,1.1,-4.2);
  clock.scale.setScalar(.5);
  clock.rotation.y = -.36;
  group.add(clock);
  box(clock,.7,.12,.54,metal,[0,-2.14,-.12]);
  box(clock,.09,1.84,.1,metal,[0,-1.18,-.12]);
  box(clock,.026,1.84,.012,brass,[0,-1.18,-.061]);
  const housing = mesh(clock,new THREE.CylinderGeometry(.47,.47,.12,64),metal,[0,0,-.075]);
  housing.rotation.x = Math.PI/2;
  mesh(clock,new THREE.TorusGeometry(.438,.022,10,80),brass,[0,0,.008]);
  mesh(clock,new THREE.CircleGeometry(.423,80),dial,[0,0,.015]);
  for(let tick=0;tick<60;tick++) {
    const theta=tick*Math.PI/30;
    const major=tick%5===0;
    const marker=box(clock,major?.015:.005,major?.056:.021,.006,ink,[Math.sin(theta)*.384,Math.cos(theta)*.384,.022]);
    marker.rotation.z=-theta;
  }
  // Geometric cardinal numerals remain sharp and need no font/network requests.
  const segments:Record<string,string[]> = {
    1:['b','c'],2:['a','b','g','e','d'],3:['a','b','g','c','d'],
    6:['a','f','g','e','c','d'],9:['a','b','c','d','f','g'],
  };
  function number(text:string,x:number,y:number) {
    const digitWidth=.028, gap=.014, stroke=.004;
    [...text].forEach((digit,index)=>{
      const cx=x+(index-(text.length-1)/2)*(digitWidth+gap);
      const positions:Record<string,[number,number,boolean]>={a:[0,.035,true],g:[0,0,true],d:[0,-.035,true],b:[.014,.018,false],c:[.014,-.018,false],e:[-.014,-.018,false],f:[-.014,.018,false]};
      for(const segment of segments[digit]) {
        const [dx,dy,horizontal]=positions[segment];
        box(clock,horizontal?digitWidth:stroke,horizontal?stroke:.031,.004,ink,[cx+dx,y+dy,.027]);
      }
    });
  }
  number('12',0,.286);number('3',.29,0);number('6',0,-.286);number('9',-.29,0);
  function hand(name:string,length:number,width:number,finish:Three.Material,z:number,tail:number) {
    const pivot=new THREE.Group();
    pivot.name=name;
    clock.add(pivot);
    box(pivot,width,length+tail,.008,finish,[0,(length-tail)/2,z]);
    return pivot;
  }
  const hourHand=hand('vegas-clock-hour',.215,.025,ink,.039,.032);
  const minuteHand=hand('vegas-clock-minute',.306,.018,ink,.051,.038);
  const secondHand=hand('vegas-clock-second',.341,.007,secondInk,.063,.07);
  mesh(clock,new THREE.CircleGeometry(.026,24),brass,[0,0,.076]);
  const localTime=new Intl.DateTimeFormat('en-GB',{
    timeZone:'America/Los_Angeles',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  });
  let lastDateSecond:number|null=null;
  group.userData.animationFamilies=['neon-pulse','analog-clock'];
  group.userData.clockTimeZone='America/Los_Angeles';
  group.userData.clockText='';

  function update({time=0,date}: {time?:number;date?:Date|string|number|null}={}) {
    if(disposed)return;
    const elapsed=Number.isFinite(time)?time:0;
    const pulse=.93+.12*Math.sin(elapsed*Math.PI*2/10);
    magenta.color.copy(magentaBase).multiplyScalar(pulse);
    cyan.color.copy(cyanBase).multiplyScalar(pulse);
    magentaLight.intensity=.5*pulse;
    cyanLight.intensity=.5*pulse;
    group.userData.neonPulse=pulse;
    if(date===undefined||date===null)return;
    const instant=date instanceof Date?date:new Date(date);
    const dateSecond=Math.floor(instant.getTime()/1000);
    if(!Number.isFinite(dateSecond)||dateSecond===lastDateSecond)return;
    lastDateSecond=dateSecond;
    const parts=Object.fromEntries(localTime.formatToParts(instant).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
    const {hour,minute,second}=parts;
    hourHand.rotation.z=-((hour%12)+minute/60+second/3600)*Math.PI/6;
    minuteHand.rotation.z=-(minute+second/60)*Math.PI/30;
    secondHand.rotation.z=-second*Math.PI/30;
    group.userData.clockText=[hour,minute,second].map(value=>String(value).padStart(2,'0')).join(':');
    group.userData.second=second;
    clock.userData.clockText=group.userData.clockText;
    clock.userData.second=second;
  }

  function dispose() {
    if(disposed)return;
    disposed=true;
    group.removeFromParent();
    for(const shape of geometries)shape.dispose();
    for(const finish of materials)finish.dispose();
    magentaLight.dispose();cyanLight.dispose();
    group.clear();
  }
  return {group,update,dispose};
}
