import type * as Three from '../references/card-materials/vendor/three.module.js';
import {sourcePlanePixel, type StageProjection} from './pamela-stage-projection.ts';

/** Materials are replaceable; the camera, physical silhouette and felt plane are not. */
export const PAMELA_TABLE_VARIANTS = [
  {id:'emerald-leather',label:'Smaragd / brun läderkant',felt:'#3d725b',rail:'#493126',body:'#302721',trim:'#a08a5b'},
  {id:'blue-slate',label:'Blå / mörk läderkant',felt:'#3b657f',rail:'#26313c',body:'#252c32',trim:'#929b9c'},
] as const;
export type PamelaTableVariantId = typeof PAMELA_TABLE_VARIANTS[number]['id'];
export type PamelaTableDimensions = {
  width:number;depth:number;thickness:number;rimHeight:number;cornerRadius:number;rimWidth:number;feltHeight:number;
};
export type PamelaTableContact = {
  sourceX:number;sourceY:number;width:number;depth:number;opacity:number;
  kind?:'hand'|'shoe'|'card';role?:string;visible?:boolean;
};
export type PamelaTableLayerOptions = {
  table:PamelaTableDimensions;projection:StageProjection;variant?:PamelaTableVariantId;contactShadows?:readonly PamelaTableContact[];
};
const finite=(values:readonly number[])=>values.every(Number.isFinite);
function variantFor(id:PamelaTableVariantId){
  const variant=PAMELA_TABLE_VARIANTS.find(v=>v.id===id);
  if(!variant)throw Error(`Unknown table material: ${id}`);
  return variant;
}
function validatedTable(input:PamelaTableDimensions):Readonly<PamelaTableDimensions>{
  const t={...input};
  if(!finite([t.width,t.depth,t.thickness,t.rimHeight,t.cornerRadius,t.rimWidth,t.feltHeight])||
    t.width<=0||t.depth<=0||t.thickness<=.05||t.rimHeight<=.025||t.rimWidth<=.025||
    t.rimWidth>=t.cornerRadius||t.cornerRadius>=Math.min(t.width,t.depth)/2||t.feltHeight<0)
    throw Error('Invalid table dimensions');
  return Object.freeze(t);
}
/** Always intersects the ORIGINAL camera ray. A later camera pan must not move the shadow. */
export function sourceContactAnchor(contact:Pick<PamelaTableContact,'sourceX'|'sourceY'>,projection:StageProjection,feltHeight:number):[number,number,number]{
  if(!finite([contact.sourceX,contact.sourceY,feltHeight,projection.width,projection.sourceWidth,projection.contactSourceY,projection.tableHeight,projection.depth,...projection.camera,...projection.cameraTarget])||
    projection.width<=0||projection.sourceWidth<=0||projection.camera.length!==3||projection.cameraTarget.length!==3||
    projection.camera[0]!==0||projection.cameraTarget[0]!==0||projection.camera[2]<=projection.cameraTarget[2]||projection.camera[1]<=feltHeight)
    throw Error('Invalid contact projection');
  const point=sourcePlanePixel(contact.sourceX,contact.sourceY,projection),[cx,cy,cz]=projection.camera,y=feltHeight+.001;
  const ratio=(y-cy)/(point[1]-cy);
  if(!Number.isFinite(ratio)||ratio<=0)throw Error('Contact ray does not intersect the visible table plane');
  return [cx+(point[0]-cx)*ratio,y,cz+(point[2]-cz)*ratio];
}
export function restrainedTableContact(contact:PamelaTableContact){
  if(!finite([contact.width,contact.depth,contact.opacity])||contact.width<=0||contact.depth<=0)throw Error('Invalid table contact');
  const kind=contact.kind??(/shoe|sko/i.test(contact.role??'')?'shoe':/card|kort/i.test(contact.role??'')?'card':'hand');
  // A contact cue is a thin footprint, never a large oval cast shadow.
  return {...contact,kind,width:Math.min(contact.width,kind==='shoe'?1.25:kind==='card'?.5:.4),depth:Math.min(contact.depth,.055),opacity:Math.max(0,Math.min(contact.opacity,kind==='shoe'?.12:.10))};
}

export function createPamelaTableLayer(T:typeof Three,options:PamelaTableLayerOptions){
  const table=validatedTable(options.table),projection={...options.projection,camera:[...options.projection.camera],cameraTarget:[...options.projection.cameraTarget]};
  let variant=variantFor(options.variant??'emerald-leather'),disposed=false;
  const group=new T.Group(),contactGroup=new T.Group();
  const geometries:InstanceType<typeof T.BufferGeometry>[]=[],materials:InstanceType<typeof T.Material>[]=[],textures:InstanceType<typeof T.Texture>[]=[];
  const spatial=<V,>(v:V)=>v as V&{position:{set(x:number,y:number,z:number):void};rotation:{x:number};visible:boolean;renderOrder:number};
  const Mesh=T.Mesh as unknown as new(g:InstanceType<typeof T.BufferGeometry>,m:InstanceType<typeof T.Material>)=>InstanceType<typeof T.Mesh>;
  function outline(w:number,d:number,r:number){
    const s=new T.Shape(),x=w/2,z=d/2;s.moveTo(-x+r,-z);s.lineTo(x-r,-z);s.quadraticCurveTo(x,-z,x,-z+r);s.lineTo(x,z-r);s.quadraticCurveTo(x,z,x-r,z);s.lineTo(-x+r,z);s.quadraticCurveTo(-x,z,-x,z-r);s.lineTo(-x,-z+r);s.quadraticCurveTo(-x,-z,-x+r,-z);s.closePath();return s;
  }
  function solid(shape:InstanceType<typeof T.Shape>,height:number,bevel:number){
    const g=new T.ExtrudeGeometry(shape,{depth:height-2*bevel,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:5,curveSegments:32,steps:1});g.rotateX(-Math.PI/2);return g;
  }
  function part(g:InstanceType<typeof T.BufferGeometry>,m:InstanceType<typeof T.Material>,y:number){
    geometries.push(g);materials.push(m);const obj=spatial(new Mesh(g,m));obj.position.set(0,y,0);group.add(obj);return obj;
  }
  function grain(seed:number){
    const size=256,data=new Uint8Array(size*size*4);let state=seed;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      const p=(y*size+x)*4,n=(state>>>24)/255,warp=Math.sin((x+(y%2)*.4)*Math.PI)*.04;
      const v=Math.round(128+(n-.5)*36+warp*255);data[p]=v;data[p+1]=v;data[p+2]=v;data[p+3]=255;
    }
    // The vendored JS constructor's inferred declaration only exposes its null default.
    const DataTexture=T.DataTexture as unknown as new(data:Uint8Array,width:number,height:number,format:number)=>InstanceType<typeof T.DataTexture>;
    const texture=new DataTexture(data,size,size,T.RGBAFormat);texture.colorSpace=T.NoColorSpace;texture.wrapS=T.RepeatWrapping;texture.wrapT=T.RepeatWrapping;
    texture.repeat.set(table.width*2.5,table.depth*2.5);texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;textures.push(texture);return texture;
  }
  const feltGrain=grain(34701),leatherGrain=grain(84013);
  const bodyMaterial=new T.MeshStandardMaterial({color:variant.body,roughness:.68,metalness:0});
  part(solid(outline(table.width-.04,table.depth-.04,table.cornerRadius),table.thickness,.018),bodyMaterial,-table.thickness+.018);
  const feltGeometry=new T.ShapeGeometry(outline(table.width-2*table.rimWidth+.018,table.depth-2*table.rimWidth+.018,table.cornerRadius-table.rimWidth),32);
  const uv=feltGeometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/table.width+.5,uv.getY(i)/table.depth+.5);feltGeometry.rotateX(-Math.PI/2);
  const feltMaterial=new T.MeshPhysicalMaterial({color:variant.felt,roughness:.94,metalness:0,reflectivity:.08,map:feltGrain,bumpMap:feltGrain,bumpScale:.0017});
  feltMaterial.onBeforeCompile=(shader?:{fragmentShader:string})=>{if(shader)shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','float grain = texture2D(map, vMapUv).r; diffuseColor.rgb *= 1.0 + (grain - 0.50196) * 0.24;');};
  part(feltGeometry,feltMaterial,table.feltHeight);
  const rim=outline(table.width-.04,table.depth-.04,table.cornerRadius);
  rim.holes.push(new T.Path(outline(table.width-2*table.rimWidth,table.depth-2*table.rimWidth,table.cornerRadius-table.rimWidth).getPoints(32).reverse()));
  const railMaterial=new T.MeshPhysicalMaterial({color:variant.rail,roughness:.56,metalness:0,reflectivity:.22,clearcoat:.08,clearcoatRoughness:.55,bumpMap:leatherGrain,bumpScale:.001});
  part(solid(rim,table.rimHeight,.012),railMaterial,-.025+.012);
  // A physical narrow seam on the front fascia provides depth without a bright decorative halo.
  const seam=outline(table.width-.038,table.depth-.038,table.cornerRadius);
  seam.holes.push(new T.Path(outline(table.width-.064,table.depth-.064,table.cornerRadius-.013).getPoints(32).reverse()));
  const trimMaterial=new T.MeshStandardMaterial({color:variant.trim,roughness:.58,metalness:.58});
  part(solid(seam,.009,.002),trimMaterial,-table.thickness*.46);
  type ContactPart={geometry:InstanceType<typeof T.BufferGeometry>;material:InstanceType<typeof T.Material>;mesh:InstanceType<typeof T.Mesh>};
  let contacts:ReturnType<typeof restrainedTableContact>[]=[],contactParts:ContactPart[]=[];
  function clearContacts(){for(const item of contactParts){contactGroup.remove(item.mesh);item.geometry.dispose();item.material.dispose();}contactParts=[];}
  function setContacts(input:readonly PamelaTableContact[]){
    if(disposed)throw Error('Table layer has been disposed');
    const next=input.filter(c=>c.visible!==false).map(c=>({...restrainedTableContact(c),anchor:sourceContactAnchor(c,projection,table.feltHeight)}));
    clearContacts();contacts=next;
    for(const contact of next){
      const geometry=new T.PlaneGeometry(contact.width,contact.depth);geometry.rotateX(-Math.PI/2);
      const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:contact.opacity}},vertexShader:'varying vec2 shadowUv; void main(){shadowUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 shadowUv; uniform float opacity; void main(){ vec2 p=(shadowUv-.5)*2.0; float a=pow(max(0.0,1.0-dot(p,p)),2.2)*opacity; gl_FragColor=vec4(.022,.027,.025,a); #include <colorspace_fragment>\n }'.replace(' #include','\n #include')});
      const obj=spatial(new Mesh(geometry,material));obj.position.set(...contact.anchor);obj.renderOrder=1;contactGroup.add(obj);contactParts.push({geometry,material,mesh:obj});
    }
  }
  setContacts(options.contactShadows??[]);
  return {
    group,contactGroup,
    setVariant(id:PamelaTableVariantId){if(disposed)throw Error('Table layer has been disposed');variant=variantFor(id);feltMaterial.color.set(variant.felt);railMaterial.color.set(variant.rail);bodyMaterial.color.set(variant.body);trimMaterial.color.set(variant.trim);},
    setContacts,
    setVisible(visible:boolean){group.visible=visible;contactGroup.visible=visible;},
    diagnostics(){return {variant:variant.id,table:{...table},feltPlaneY:table.feltHeight,contactPlaneY:table.feltHeight+.001,geometryObjects:geometries.length,contacts:contacts.map(c=>({...c,anchor:sourceContactAnchor(c,projection,table.feltHeight)})),geometryChangesOnMaterialSwitch:0,lighting:'relative scene lights affect table; recorded dealer light is unchanged',contactPolicy:'authored thin footprints; update or omit hand contact during motion',parallax:'original stage camera only; no independent table translation'};},
    dispose(){if(disposed)return;disposed=true;clearContacts();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());},
  };
}

/** Project a world point into the original source image, with optional restrained camera translation. */
export function tablePointToSource(point:readonly number[],projection:StageProjection,pan:readonly number[]=[0,0]):[number,number]{
  const [cx,cy,cz]=projection.camera,dy=cy-projection.cameraTarget[1],dz=cz-projection.cameraTarget[2],length=Math.hypot(dy,dz),ny=dy/length,nz=dz/length;
  const distance=(cy-projection.tableHeight)*ny+(cz-projection.depth)*nz,baseVertical=(projection.tableHeight-cy)*nz-(projection.depth-cz)*ny;
  const relative=[point[0]-cx-pan[0],point[1]-cy-pan[1],point[2]-cz],depth=-(relative[1]*ny+relative[2]*nz),vertical=relative[1]*nz-relative[2]*ny;
  if(depth<=0||!finite([...point,...pan,distance,depth,vertical]))throw Error('Point is outside the source camera');
  return [(distance*relative[0]/depth/projection.width+.5)*projection.sourceWidth,projection.contactSourceY-(distance*vertical/depth-baseVertical)*projection.sourceWidth/projection.width];
}
/** Procedural QA fixture, not a photorealistic export or replacement for a moving-dealer review. */
export function pamelaTableSvg(options:PamelaTableLayerOptions&{width?:number;height?:number;pan?:readonly number[]}):string{
  const t=validatedTable(options.table),v=variantFor(options.variant??'emerald-leather'),p=options.projection,w=options.width??p.sourceWidth,h=options.height??p.sourceHeight,pan=options.pan??[0,0];
  function ring(width:number,depth:number,radius:number,y:number){
    const points:[number,number,number][]=[];
    for(const [x,z,start] of [[width/2-radius,-depth/2+radius,-Math.PI/2],[width/2-radius,depth/2-radius,0],[-width/2+radius,depth/2-radius,Math.PI/2],[-width/2+radius,-depth/2+radius,Math.PI]] as const)
      for(let i=0;i<=16;i++){const a=start+i*Math.PI/32;points.push([x+Math.cos(a)*radius,y,z+Math.sin(a)*radius]);}
    return points;
  }
  const path=(points:readonly (readonly number[])[])=>points.map((point,i)=>{const [x,y]=tablePointToSource(point,p,pan);return `${i?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`;}).join(' ')+' Z';
  const top=ring(t.width-.04,t.depth-.04,t.cornerRadius,t.rimHeight-.025),bottom=ring(t.width-.04,t.depth-.04,t.cornerRadius,-t.thickness),felt=ring(t.width-2*t.rimWidth+.018,t.depth-2*t.rimWidth+.018,t.cornerRadius-t.rimWidth,t.feltHeight);
  const side=top.slice(17,51).concat(bottom.slice(17,51).reverse());
  const shadows=(options.contactShadows??[]).filter(c=>c.visible!==false).map(c=>{
    const contact=restrainedTableContact(c),anchor=sourceContactAnchor(c,p,t.feltHeight),ellipse=Array.from({length:48},(_,i)=>{const a=i*Math.PI/24;return [anchor[0]+Math.cos(a)*contact.width/2,anchor[1],anchor[2]+Math.sin(a)*contact.depth/2];});
    return `<path d="${path(ellipse)}" fill="#070c0a" opacity="${contact.opacity*.65}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${p.sourceWidth} ${p.sourceHeight}"><defs><linearGradient id="felt-light" x2="0.15" y2="1"><stop stop-color="#fff" stop-opacity=".09"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient><pattern id="felt-weave" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0h1v1H0z M2 2h1v1H2z" fill="#fff" opacity=".022"/></pattern><linearGradient id="rail-light" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".17"/></linearGradient></defs><path d="${path(side)}" fill="${v.body}"/><path d="${path(top)}" fill="${v.rail}"/><path d="${path(top)}" fill="url(#rail-light)"/><path d="${path(felt)}" fill="${v.felt}"/><path d="${path(felt)}" fill="url(#felt-light)"/><path d="${path(felt)}" fill="url(#felt-weave)"/>${shadows}</svg>`;
}
