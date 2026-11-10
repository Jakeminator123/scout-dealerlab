import * as T from './vendor/three.module.js';

// Dimensions in metres. Geometry supplies every view; no camera-facing table image.
function outline(scale=1){
  const s=new T.Shape();s.moveTo(-1.27*scale,-.48*scale);s.lineTo(1.27*scale,-.48*scale);
  s.bezierCurveTo(1.47*scale,-.48*scale,1.49*scale,-.24*scale,1.38*scale,.03*scale);
  s.bezierCurveTo(1.18*scale,.60*scale,.61*scale,.88*scale,0,.88*scale);
  s.bezierCurveTo(-.61*scale,.88*scale,-1.18*scale,.60*scale,-1.38*scale,.03*scale);
  s.bezierCurveTo(-1.49*scale,-.24*scale,-1.47*scale,-.48*scale,-1.27*scale,-.48*scale);
  return s;
}
function slab(shape:T.Shape,depth:number,bevel:number,material:T.Material,y:number){
  const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:5,steps:1,curveSegments:48});
  g.rotateX(Math.PI/2);const mesh=new T.Mesh(g,material);mesh.position.y=y;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
function bettingPrint(){
  const c=document.createElement('canvas');c.width=2048;c.height=1024;const ctx=c.getContext('2d')!;
  ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='rgba(215,207,165,.65)';ctx.textAlign='center';
  ctx.font='48px Georgia';ctx.fillText('BLACKJACK',1024,455);ctx.font='17px Arial';ctx.letterSpacing='4px';ctx.fillText('SCOUTGAMING',1024,495);
  ctx.strokeStyle='rgba(215,207,165,.5)';ctx.lineWidth=3;
  for(let i=0;i<7;i++){const a=(i-3)*.29;const x=1024+Math.sin(a)*780,y=540+Math.cos(a)*205;ctx.beginPath();ctx.ellipse(x,y,53,31,-a*.35,0,Math.PI*2);ctx.stroke();}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;return texture;
}
export async function createTable(loader:T.TextureLoader,renderer:T.WebGLRenderer){
  const group=new T.Group(),materials:T.MeshStandardMaterial[]=[];
  async function tex(file:string,repeat:[number,number],color=false){const map=await loader.loadAsync('./assets/'+file);map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(...repeat);map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(color)map.colorSpace=T.SRGBColorSpace;return map;}
  const [woodColor,woodNormal,woodRough,leatherNormal,leatherRough,feltNormal,feltRough]=await Promise.all([
    tex('wood_table-diffuse.webp',[1.4,1.4],true),tex('wood_table-nor_gl.webp',[1.4,1.4]),tex('wood_table-rough.webp',[1.4,1.4]),
    tex('brown_leather-nor_gl.webp',[7,7]),tex('brown_leather-rough.webp',[7,7]),tex('denim_fabric-nor_gl.webp',[12,12]),tex('denim_fabric-rough.webp',[12,12]),
  ]);
  const wood=new T.MeshStandardMaterial({color:0xd0b79b,map:woodColor,normalMap:woodNormal,normalScale:new T.Vector2(.28,.28),roughnessMap:woodRough,roughness:.78,metalness:0});
  const leather=new T.MeshStandardMaterial({color:0x69513c,normalMap:leatherNormal,normalScale:new T.Vector2(.22,.22),roughnessMap:leatherRough,roughness:.85});
  const felt=new T.MeshStandardMaterial({color:0x294b3a,normalMap:feltNormal,normalScale:new T.Vector2(.12,.12),roughnessMap:feltRough,roughness:1});
  const brass=new T.MeshStandardMaterial({color:0x9c8252,metalness:.75,roughness:.42});
  materials.push(wood,leather,felt,brass);
  group.add(slab(outline(1),.065,.018,wood,.79));
  // Leather rail is a real open ring, with felt inset below its rounded top.
  const ring=outline(1.012),hole=outline(.905);ring.holes.push(new T.Path(hole.getPoints(192)));
  group.add(slab(ring,.044,.021,leather,.824));
  group.add(slab(outline(.906),.014,.006,felt,.803));
  // Recessed curved timber apron, separated from the padded rail.
  const apron=outline(.94);apron.holes.push(new T.Path(outline(.89).getPoints(192)));
  group.add(slab(apron,.12,.009,wood,.728));
  for(const x of [-.85,.85]){
    const leg=new T.Mesh(new T.CylinderGeometry(.12,.17,.67,48),wood);leg.position.set(x,.375,.12);leg.scale.z=1.65;leg.castShadow=leg.receiveShadow=true;group.add(leg);
    const foot=new T.Mesh(new T.CylinderGeometry(.18,.20,.04,48),brass);foot.scale.z=1.45;foot.position.set(x,.02,.12);foot.castShadow=foot.receiveShadow=true;group.add(foot);
  }
  const brace=new T.Mesh(new T.BoxGeometry(1.75,.085,.11),wood);brace.position.set(0,.23,.12);brace.castShadow=brace.receiveShadow=true;group.add(brace);
  const decalMat=new T.MeshStandardMaterial({map:bettingPrint(),transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2});
  const decal=new T.Mesh(new T.PlaneGeometry(2.52,1.26),decalMat);decal.rotation.x=-Math.PI/2;decal.position.set(0,.811,.18);decal.receiveShadow=true;group.add(decal);
  materials.push(decalMat);
  return {group,materials,setFinish(value:string){wood.color.set(value==='oak'?0xffefd5:0xd0b79b);felt.color.set(value==='oak'?0x77776b:0x294b3a);leather.color.set(value==='oak'?0x9f8c72:0x69513c);},setView(mode:string){
    group.traverse(obj=>{if(!(obj instanceof T.Mesh)||!(obj.material instanceof T.MeshStandardMaterial))return;obj.material.wireframe=mode==='wire';});
    wood.map=mode==='clay'?null:woodColor;wood.normalMap=mode==='clay'?null:woodNormal;leather.normalMap=mode==='clay'?null:leatherNormal;felt.normalMap=mode==='clay'?null:feltNormal;
    wood.roughnessMap=mode==='clay'?null:woodRough;leather.roughnessMap=mode==='clay'?null:leatherRough;felt.roughnessMap=mode==='clay'?null:feltRough;
    for(const m of materials)m.needsUpdate=true;
    decal.visible=mode!=='wire';
  }};
}

export async function createGround(loader:T.TextureLoader,renderer:T.WebGLRenderer){
  const maps=await Promise.all(['diffuse','nor_gl','rough'].map(async name=>{
    const map=await loader.loadAsync('./assets/forest_floor-'+name+'.webp');map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(5,5);map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(name==='diffuse')map.colorSpace=T.SRGBColorSpace;return map;
  }));
  const mask=document.createElement('canvas');mask.width=mask.height=256;const ctx=mask.getContext('2d')!,gradient=ctx.createRadialGradient(128,128,65,128,128,125);gradient.addColorStop(0,'white');gradient.addColorStop(1,'black');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
  const material=new T.MeshStandardMaterial({map:maps[0],normalMap:maps[1],normalScale:new T.Vector2(.35,.35),roughnessMap:maps[2],roughness:1,color:0xc4c6a6,alphaMap:new T.CanvasTexture(mask),transparent:true,depthWrite:false});
  // This textured ground patch covers the photographed tripod/nadir seam.
  // The separate shadow catcher just above it receives the table's cast shadows.
  const ground=new T.Mesh(new T.PlaneGeometry(11,11),material);ground.rotation.x=-Math.PI/2;ground.position.y=.0005;ground.renderOrder=1;return ground;
}


// A presentation prop. Its decorative stack is not the authoritative game deck.
export function createCardShoe(feltTop=.809){
  const group=new T.Group();group.name='blackjack-card-shoe';
  group.position.set(.60,feltTop+.005,-.32);group.rotation.y=-.72;
  const resources:Array<{dispose():void}>=[];
  const material=(parameters:T.MeshStandardMaterialParameters)=>{const m=new T.MeshStandardMaterial(parameters);resources.push(m);return m;};
  const dark=material({color:0x151b22,roughness:.4,metalness:.35});
  const brass=material({color:0x9b7840,roughness:.34,metalness:.75});
  const acrylic=material({color:0xbac9d0,transparent:true,opacity:.30,roughness:.18,metalness:.1,depthWrite:false});
  const paper=material({color:0xe6e1d1,roughness:.9});
  const back=material({color:0x18344f,roughness:.75});
  const add=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material)=>{
    const geometry=new T.BoxGeometry(w,h,d);resources.push(geometry);
    const mesh=new T.Mesh(geometry,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  add(.145,.018,.27,0,.009,0,dark);
  for(const x of [-.072,.072]){add(.008,.11,.25,x,.073,-.006,acrylic);add(.011,.005,.25,x,.13,-.006,brass);}
  add(.14,.11,.008,0,.073,-.13,acrylic);
  const tray=add(.117,.012,.22,0,.044,-.012,dark);tray.rotation.x=.20;
  const stack=add(.064,.047,.090,0,.074,-.026,paper);stack.rotation.x=.20;
  const top=add(.060,.001,.086,0,.098,-.021,back);top.rotation.x=.20;
  // Fine paper edges stay geometry, so close camera views retain detail.
  for(let i=0;i<14;i++)add(.064,.0004,.001,0,.052+i*.003,.019,brass);
  const rollerGeometry=new T.CylinderGeometry(.022,.022,.065,20);resources.push(rollerGeometry);
  const roller=new T.Mesh(rollerGeometry,dark);roller.rotation.z=Math.PI/2;roller.position.set(0,.087,-.092);group.add(roller);
  add(.143,.028,.014,0,.028,.12,dark);
  add(.144,.003,.015,0,.043,.12,brass);
  const mouth=add(.063,.001,.025,0,.047,.112,back);mouth.rotation.x=.10;
  return {group,dispose(){group.removeFromParent();for(const resource of resources)resource.dispose();}};
}

// Locally modelled room: actual wall, trim, furniture and floor geometry.
// Reuses the existing wood texture; no resampled panorama or new media job.
export function createSalon(woodSource:T.Texture|null){
  const group=new T.Group();group.name='constructed-wood-salon';
  const resources:Array<{dispose():void}>=[];
  const woodMap=woodSource?.clone()??null;if(woodMap){woodMap.repeat.set(.7,2);woodMap.needsUpdate=true;resources.push(woodMap);}
  const material=(p:T.MeshStandardMaterialParameters)=>{const m=new T.MeshStandardMaterial(p);resources.push(m);return m;};
  const wood=material({color:0x9b6e45,map:woodMap,roughness:.67});
  const dark=material({color:0x33271f,roughness:.8});
  const brass=material({color:0xa98145,metalness:.8,roughness:.32});
  const leather=material({color:0x1c362c,roughness:.73});
  const fabric=material({color:0xbaab8a,roughness:1});
  const emissive=material({color:0xffdc95,emissive:0xffb957,emissiveIntensity:1.2,roughness:.5});
  const geometry=(g:T.BufferGeometry)=>{resources.push(g);return g;};
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material)=>{const mesh=new T.Mesh(geometry(new T.BoxGeometry(w,h,d)),m);mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);return mesh;};
  const soft=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material)=>{
    const g=geometry(new T.BoxGeometry(w,h,d,12,12,12)),positions=g.getAttribute('position'),normals=g.getAttribute('normal');
    const r=Math.min(w,h,d)*.44,v=new T.Vector3(),core=new T.Vector3(),normal=new T.Vector3();
    for(let i=0;i<positions.count;i++){
      v.fromBufferAttribute(positions,i);core.set(T.MathUtils.clamp(v.x,-w/2+r,w/2-r),T.MathUtils.clamp(v.y,-h/2+r,h/2-r),T.MathUtils.clamp(v.z,-d/2+r,d/2-r));
      normal.copy(v).sub(core).normalize();v.copy(core).addScaledVector(normal,r);positions.setXYZ(i,v.x,v.y,v.z);normals.setXYZ(i,normal.x,normal.y,normal.z);
    }
    const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  box(12,.035,14,0,-.025,1,wood);
  box(10,3.4,.16,0,1.7,-3.4,dark);
  for(const x of [-5,5])box(.16,3.4,12,x,1.7,2.5,dark);
  // One instanced draw for the vertical timber flutes, one for floor joints.
  const flutes=new T.InstancedMesh(geometry(new T.BoxGeometry(.065,1.62,.075)),wood,118),dummy=new T.Object3D();
  for(let i=0;i<118;i++){dummy.position.set(-4.94+i*.084,2.02,-3.28);dummy.updateMatrix();flutes.setMatrixAt(i,dummy.matrix);}group.add(flutes);
  const seams=new T.InstancedMesh(geometry(new T.BoxGeometry(.006,.001,14)),dark,36);
  for(let i=0;i<36;i++){dummy.position.set(-5.8+i*.33,-.006,1);dummy.updateMatrix();seams.setMatrixAt(i,dummy.matrix);}group.add(seams);
  for(const y of [.15,1.10,2.92])box(10,.035,.065,0,y,-3.26,brass);
  box(10,.09,.14,0,1.17,-3.22,wood);
  box(9.7,.012,.08,0,1.23,-3.2,emissive);
  for(let i=-4;i<=4;i++){box(.022,.87,.03,i*1.08,.62,-3.30,brass);}
  const lamps:T.PointLight[]=[];
  for(const x of [-2.8,2.8]){
    box(.085,.56,.065,x,2.12,-3.13,brass);
    box(.04,.44,.06,x,2.12,-3.08,emissive);
    const lamp=new T.PointLight(0xffcc85,5,5,2);lamp.position.set(x,2.14,-2.94);group.add(lamp);lamps.push(lamp);
  }
  for(const x of [-1.95,1.95]){
    soft(.76,.18,.78,x,.40,-2.27,leather);
    const back=soft(.76,.61,.19,x,.75,-2.62,leather);back.rotation.x=-.08;
    for(const side of [-1,1])soft(.15,.33,.77,x+side*.37,.55,-2.27,leather);
    const cushion=soft(.34,.31,.14,x,.68,-2.47,fabric);cushion.rotation.z=x>0?.10:-.10;
    for(const dx of [-.28,.28])for(const dz of [-.28,.28])box(.04,.27,.04,x+dx,.16,-2.27+dz,brass);
  }
  const vaseGeometry=geometry(new T.LatheGeometry([[.06,0],[.09,.015],[.14,.09],[.15,.18],[.12,.28],[.055,.34],[.052,.40],[.062,.415]].map(([x,y])=>new T.Vector2(x,y)),40));
  for(const x of [-.6,.6]){const vase=new T.Mesh(vaseGeometry,brass);vase.position.set(x,1.22,-3.08);group.add(vase);}
  return {group,update(level:number){emissive.emissiveIntensity=1.2*level;for(const lamp of lamps)lamp.intensity=5*level;},dispose(){group.removeFromParent();for(const r of resources)r.dispose();}};
}
