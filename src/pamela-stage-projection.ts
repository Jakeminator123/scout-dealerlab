/** A source-camera-preserving 2.5D fold; this is authored geometry, not recovered depth. */
export type StageProjection = {
  width: number; sourceWidth: number; sourceHeight: number; contactSourceY: number;
  depth: number; tableHeight: number; camera: readonly number[]; cameraTarget: readonly number[];
};
export function sourcePlanePixel(x:number,y:number,p:StageProjection):[number,number,number]{
  // Camera-aligned source plane avoids applying a second pitch/foreshortening to the photograph.
  const dy=p.camera[1]-p.cameraTarget[1],dz=p.camera[2]-p.cameraTarget[2],length=Math.hypot(dy,dz),h=(p.contactSourceY-y)*p.width/p.sourceWidth;
  return [(x/p.sourceWidth-.5)*p.width,p.tableHeight+h*dz/length,p.depth-h*dy/length];
}
export function projectDealerPixel(x: number, y: number, p: StageProjection): [number, number, number] {
  const [wx,wy,wz]=sourcePlanePixel(x,y,p);
  if (y <= p.contactSourceY) return [wx, wy, wz];
  const [cx, cy, cz] = p.camera;
  const t = (p.tableHeight - cy) / (wy - cy);
  return [cx + t * (wx - cx), p.tableHeight, cz + t * (wz - cz)];
}
export function dealerProjectionMesh(p: StageProjection) {
  if (!(p.sourceWidth > 0 && p.sourceHeight > p.contactSourceY && p.contactSourceY > 0 && p.width > 0 && p.camera.length === 3 && p.camera.every(Number.isFinite) && p.cameraTarget.length===3 && p.cameraTarget.every(Number.isFinite) && p.camera[0]===0 && p.cameraTarget[0]===0 && p.camera[2]>p.cameraTarget[2] && p.camera[1] > p.tableHeight)) throw Error('Invalid dealer projection');
  const rows = [...new Set([...Array.from({length: 75}, (_, i) => i * p.sourceHeight / 74), p.contactSourceY])].sort((a, b) => a - b);
  const columns = 32, positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const y of rows) for (let j = 0; j <= columns; j++) {
    positions.push(...projectDealerPixel(j * p.sourceWidth / columns, y, p));
    uvs.push(j / columns, 1 - y / p.sourceHeight);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < columns; j++) {
    const a = i * (columns + 1) + j, b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return {positions, uvs, indices};
}
export type StageMotion = {file: string; sha256: string; width: number; height: number; fps: number; frames: number; reviewEndFrame: number; contactFrame: number; label: string; provenance: string};
export type StageLandedCard={seat:number;sourceSha256:string;file:string;sha256:string};
