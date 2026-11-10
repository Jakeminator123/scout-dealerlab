import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../references/card-materials/vendor/three.module.js';
import {createPamelaBackgroundLayer, clampPamelaRoomPan, PAMELA_ROOM_VARIANTS, PAMELA_ROOM_CALIBRATION, PAMELA_ROOM_LIGHT_PROFILES, type PamelaRoomLightProfile} from '../src/pamela-background-layer.ts';
import {dealerProjectionMesh} from '../src/pamela-stage-projection.ts';

const run = 'runs/20261109-pamela-background-layer';
const take = process.argv.find(a => a.startsWith('--take='))?.slice(7) ?? '01';
assert.match(take, /^\d{2}$/);
const out = `${run}/take-${take}`;
await mkdir(out, {recursive: true});
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const artifact = async(path: string) => ({path, sha256: hash(await readFile(path))});
const contract = JSON.parse(await readFile('references/pamela-stage-contract.json', 'utf8'));
const motion = JSON.parse(await readFile('references/pamela-stage-motion.json', 'utf8'));
assert.deepEqual(contract.camera.position, PAMELA_ROOM_CALIBRATION.camera.position);
assert.deepEqual(contract.camera.target, PAMELA_ROOM_CALIBRATION.camera.target);
assert.deepEqual(contract.camera.maxPan, PAMELA_ROOM_CALIBRATION.camera.maxPan);
assert.equal(contract.camera.fieldOfViewDegrees, PAMELA_ROOM_CALIBRATION.camera.fieldOfViewDegrees);
const projection = {...contract.dealerPlacement, sourceHeight: motion.height, tableHeight: contract.table.feltHeight + .004, camera: contract.camera.position, cameraTarget: contract.camera.target};
const dealerMeshBefore = hash(JSON.stringify(dealerProjectionMesh(projection)));
const layer = createPamelaBackgroundLayer(T), scene = new T.Scene(); scene.add(layer.group);
type MeshView = {name: string; visible: boolean; geometry?: InstanceType<typeof T.BufferGeometry>; material?: InstanceType<typeof T.ShaderMaterial>; matrixWorld: InstanceType<typeof T.Matrix4>};
const rooms: {id: string; meshes: number; triangles: number; bounds: {min: number[]; max: number[]}}[] = [];
const materialSet = new Set<InstanceType<typeof T.ShaderMaterial>>(), geometrySet = new Set<InstanceType<typeof T.BufferGeometry>>();
for (const room of PAMELA_ROOM_VARIANTS) {
  layer.setVariant(room.id); assert.equal(layer.getVariant(), room.id);
  assert.equal(layer.group.children.filter(g => g.visible).length, 1);
  const roomGroup = layer.group.children.find(g => g.name === room.id)!;
  assert.equal(roomGroup.visible, true);
  scene.updateMatrixWorld(true);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let meshes = 0, triangles = 0;
  roomGroup.traverse((child?: unknown) => {
    const mesh = child as MeshView;
    if (!mesh.geometry || !mesh.material) return;
    meshes++; materialSet.add(mesh.material); geometrySet.add(mesh.geometry);
    assert.equal(mesh.material.toneMapped, false);
    const positions = mesh.geometry.getAttribute('position');
    triangles += (mesh.geometry.getIndex()?.count ?? positions.count) / 3;
    for (let i = 0; i < positions.count; i++) {
      const p = new T.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(mesh.matrixWorld);
      for (const [axis, value] of [p.x, p.y, p.z].entries()) {assert.ok(Number.isFinite(value), mesh.name); min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);}
      assert.ok(p.z <= -4, `Room geometry intrudes into dealer space: ${mesh.name}`);
    }
  });
  rooms.push({id: room.id, meshes, triangles, bounds: {min, max}});
  for (const id of Object.keys(PAMELA_ROOM_LIGHT_PROFILES) as PamelaRoomLightProfile[]) {
    layer.setLightProfile(id); assert.equal(layer.getLightProfile(), id);
    assert.deepEqual(clampPamelaRoomPan(-5, 4), [-1, 1]);
    assert.equal(hash(JSON.stringify(dealerProjectionMesh(projection))), dealerMeshBefore);
  }
}
assert.deepEqual(clampPamelaRoomPan(NaN, Infinity), [0, 0]);
assert.deepEqual(clampPamelaRoomPan(.24, -.87), [.24, -.87]);
const coverage: {aspect: number; x: number; y: number; largestAbsX: number; largestAbsY: number}[] = [];
const Camera = T.PerspectiveCamera as unknown as new(fov: number, aspect: number, near: number, far: number) => InstanceType<typeof T.PerspectiveCamera> & {position: {set(...values: number[]): void}; updateMatrixWorld(force: boolean): void};
for (const aspect of [9 / 16, 1, 16 / 9, 2.4]) {
  const camera = new Camera(contract.camera.fieldOfViewDegrees, aspect, .1, 50);
  camera.position.set(...contract.camera.position); camera.lookAt(...contract.camera.target);
  for (const [x, y] of [[0, 0], [-1, -1], [-1, 1], [1, 1], [1, -1]]) {
    camera.position.set(contract.camera.position[0] + x * .16, contract.camera.position[1] + y * .07, contract.camera.position[2]);
    camera.updateMatrixWorld(true);
    let largestAbsX = 0, largestAbsY = 0;
    for (const [u, v] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const near = new T.Vector3(u, v, -.9).unproject(camera), far = new T.Vector3(u, v, .9).unproject(camera);
      const t = (-10 - near.z) / (far.z - near.z);
      const wx = near.x + t * (far.x - near.x), wy = near.y + t * (far.y - near.y);
      assert.ok(Math.abs(wx) <= 18 && Math.abs(wy - 2) <= 12, `Far-wall coverage failed: aspect=${aspect}, pan=${x}/${y}, corner=${u}/${v}, world=${wx}/${wy}`);
      largestAbsX = Math.max(largestAbsX, Math.abs(wx)); largestAbsY = Math.max(largestAbsY, Math.abs(wy - 2));
    }
    coverage.push({aspect, x, y, largestAbsX, largestAbsY});
  }
}
const materialCount = materialSet.size, geometryCount = geometrySet.size;
let disposedMaterials = 0, disposedGeometries = 0;
for (const material of materialSet) material.addEventListener('dispose', () => disposedMaterials++);
for (const geometry of geometrySet) geometry.addEventListener('dispose', () => disposedGeometries++);
layer.dispose(); layer.dispose();
assert.equal(disposedMaterials, materialCount); assert.equal(disposedGeometries, geometryCount);
assert.equal(scene.children.length, 0); assert.equal(layer.group.children.length, 0);
assert.throws(() => layer.setVariant('jade-salon'), /disposed/);
assert.throws(() => layer.setLightProfile('warm'), /disposed/);
const originalMotion = await artifact(motion.file); assert.equal(originalMotion.sha256, motion.sha256);
const files = await Promise.all(['src/pamela-background-layer.ts', 'tools/pamela-background-proof.ts', 'src/pamela-stage-projection.ts', 'references/pamela-stage-contract.json', 'references/pamela-stage-motion.json', 'references/card-materials/vendor/three.module.js'].map(artifact));
await writeFile(`${out}/pamela-background-layer.ts`, await readFile('src/pamela-background-layer.ts'), {flag: 'wx'});
await writeFile(`${out}/proof.json`, JSON.stringify({
  status: 'passed-geometry-resource-and-source-checks', createdAt: new Date().toISOString(), node: process.version,
  construction: 'Procedural Three geometry and unlit shader materials. No image generation, source edits, uploads or paid services.',
  taskId: 'background_layers_astra', model: 'Astra 6 xhigh requested by Jakob; exact runtime identifier unknown',
  instructions: 'Two independent room variants behind the existing calibrated moving Pamela; bounded translation, fixed relative key/fill directions, preserve baked dealer illumination.',
  variants: rooms, calibration: PAMELA_ROOM_CALIBRATION, profiles: PAMELA_ROOM_LIGHT_PROFILES,
  checks: {sourceCameraMatches: true, sourceMotionHashMatches: true, switchKeepsExactlyOneRoomVisible: true, dealerProjectionUnchangedAcrossAllProfilesAndRooms: true, roomVerticesBehindDealer: true, panClampsFiniteAndInvalidInputs: true, cornerCoverageCases: coverage.length, allOwnedResourcesDisposedExactlyOnce: true, disposedLayersRejectChanges: true},
  coverage, source: originalMotion, files, resources: {materials: materialCount, geometries: geometryCount},
  visualReview: {status: 'pending-live-WebGL-review', acceptedAsFinal: false},
  limitations: ['Authored design and lighting estimates; not measured or reconstructed room geometry.', 'No physical dealer relighting or new viewpoint.', 'Proof verifies geometry and ownership, not shader compilation or moving playback. Parent integration must verify WebGL and motion.'],
}, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({proof: `${out}/proof.json`, rooms, coverageCases: coverage.length, resources: {materialCount, geometryCount}, node: process.version}));
