import * as T from './vendor/three.module.js';

// Keep the equirectangular projection intact. Flattening its sphere onto an
// invented wall/ceiling intersection bent straight columns at that intersection.
// The scene centers this distant panorama on the camera; only real 3D objects
// have positional parallax. No recovered room depth is claimed.
export function panoramaRoom(map:T.Texture,rotation=Math.PI/2){
  const geometry=new T.SphereGeometry(60,128,64);geometry.scale(1,1,-1);
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({map,depthWrite:false}));
  mesh.rotation.y=rotation;
  mesh.renderOrder=-10;
  return mesh;
}
