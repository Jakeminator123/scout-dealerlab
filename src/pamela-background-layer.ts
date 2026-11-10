import type * as Three from '../references/card-materials/vendor/three.module.js';

/** Authored room geometry, deliberately independent of dealer pixels and table geometry. */
export const PAMELA_ROOM_VARIANTS = [
  {id: 'jade-salon', label: 'Jadesalongen', description: 'Dämpad jade, välvda mässingslinjer och varm sidobelysning.'},
  {id: 'midnight-atrium', label: 'Nattatriet', description: 'Blått glas, en avlägsen stad och varma bronsdetaljer.'},
] as const;
export type PamelaRoomVariant = typeof PAMELA_ROOM_VARIANTS[number]['id'];
export type PamelaRoomLightProfile = 'neutral' | 'warm' | 'cool';

export const PAMELA_ROOM_LIGHT_PROFILES = {
  neutral: {label: 'Neutral', key: '#fff3e3', keyIntensity: 2.2, fill: '#dfeaff', fillIntensity: .8, exposure: 1, roomTint: [1, 1, 1]},
  warm: {label: 'Varm', key: '#ffdbac', keyIntensity: 2.1, fill: '#f4e7d7', fillIntensity: .75, exposure: .96, roomTint: [1.025, 1, .965]},
  cool: {label: 'Sval', key: '#d9e9ff', keyIntensity: 2.2, fill: '#ecf3ff', fillIntensity: .85, exposure: 1.02, roomTint: [.965, 1, 1.025]},
} as const;

export const PAMELA_ROOM_CALIBRATION = {
  coordinateSystem: 'Existing Pamela stage; +X screen right, +Y up, +Z toward camera',
  camera: {position: [0, 3.5, 8], target: [0, 1.35, 0], fieldOfViewDegrees: 35, maxPan: [.16, .07], rotationLocked: true},
  depthBands: {far: [-10, -9], middle: [-7.5, -6.5], near: [-4.8, -4.3]},
  keyPosition: [-3, 6, 4], fillPosition: [4, 3, 2], lightTarget: [0, 1.35, 0],
  hemisphereIntensity: .65,
  lightingBasis: 'Authored relative intensities and directions, not measured lux, Kelvin or recovered dealer lighting',
  dealerLighting: 'Baked source lighting unchanged; unlit room materials cannot physically relight Pamela',
  parallaxBasis: 'Three fixed depth bands viewed by the existing bounded translating camera; no orbit, dealer warp or new dealer view',
  source: 'Original procedural architecture; no downloaded, edited or generated image assets',
} as const;

/** Use at the camera input boundary. It never changes the calibration. */
export function clampPamelaRoomPan(x: number, y: number): [number, number] {
  const clamp = (v: number) => Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return [clamp(x), clamp(y)];
}

type Group = InstanceType<typeof Three.Group>;
type Geometry = InstanceType<typeof Three.BufferGeometry>;
type Material = InstanceType<typeof Three.ShaderMaterial>;
type Point = readonly [number, number];
type Palette = {bottom: string; top: string; glow?: string; glowStrength?: number; grain?: number};
type Spatial = {position: {set(x: number, y: number, z: number): void}; rotation: {x: number}; name: string};

export type PamelaBackgroundLayer = {
  group: Group;
  setVariant(id: PamelaRoomVariant): void;
  setLightProfile(id: PamelaRoomLightProfile): void;
  getVariant(): PamelaRoomVariant;
  getLightProfile(): PamelaRoomLightProfile;
  dispose(): void;
};

/**
 * Add `group` to the existing scene and use it as objects.room. The module owns
 * its geometry/materials, creates no lights/camera/timers, and fetches no assets.
 * Change rooms without remounting the dealer video. Call dispose on teardown.
 */
export function createPamelaBackgroundLayer(
  T: typeof Three,
  options: {variant?: PamelaRoomVariant; lightProfile?: PamelaRoomLightProfile} = {},
): PamelaBackgroundLayer {
  const group = new T.Group();
  group.name = 'pamela-independent-room';
  const geometries: Geometry[] = [], materials: Material[] = [];
  const roomGroups = new Map<PamelaRoomVariant, Group>();
  let variant: PamelaRoomVariant = options.variant ?? 'jade-salon';
  let profile: PamelaRoomLightProfile = options.lightProfile ?? 'neutral';
  let disposed = false;
  const StageMesh = T.Mesh as unknown as new(geometry: Geometry, material: Material) => InstanceType<typeof Three.Mesh> & Spatial;
  const vertexShader = 'varying vec2 roomUv; void main(){roomUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
  const fragmentShader = `
varying vec2 roomUv;
uniform vec3 bottomColor, topColor, glowColor, profileTint;
uniform float glowStrength, grainAmount;
void main(){
  float height=smoothstep(0.0,1.0,roomUv.y);
  vec3 color=mix(bottomColor,topColor,height);
  // Soft, high camera-left key: decorative shading, not a photometric estimate.
  vec2 delta=(roomUv-vec2(.21,.82))*vec2(1.05,1.3);
  color+=glowColor*exp(-dot(delta,delta)*9.0)*glowStrength;
  float grain=fract(sin(dot(floor(roomUv*vec2(1500.0,950.0)),vec2(12.9898,78.233)))*43758.5453)-.5;
  color*=1.0+grain*grainAmount;
  gl_FragColor=vec4(max(color*profileTint,vec3(0.0)),1.0);
  #include <colorspace_fragment>
}`;
  function paint(p: Palette) {
    const material = new T.ShaderMaterial({toneMapped: false, uniforms: {
      bottomColor: {value: new T.Color(p.bottom)}, topColor: {value: new T.Color(p.top)},
      glowColor: {value: new T.Color(p.glow ?? '#ffe4b4')}, glowStrength: {value: p.glowStrength ?? 0},
      grainAmount: {value: p.grain ?? .022}, profileTint: {value: new T.Vector3(1, 1, 1)},
    }, vertexShader, fragmentShader});
    materials.push(material); return material;
  }
  function plane(parent: Group, name: string, width: number, height: number, x: number, y: number, z: number, material: Material) {
    const geometry = new T.PlaneGeometry(width, height); geometries.push(geometry);
    const mesh = new StageMesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh);
    return mesh;
  }
  function strip(parent: Group, name: string, points: readonly Point[], thickness: number, z: number, material: Material) {
    const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / length * thickness / 2, ny = (b[0] - a[0]) / length * thickness / 2;
      vertices.push(points[i][0] + nx, points[i][1] + ny, 0, points[i][0] - nx, points[i][1] - ny, 0);
      uvs.push(0, i / (points.length - 1), 1, i / (points.length - 1));
      if (i) {const n = i * 2; indices.push(n - 2, n - 1, n, n - 1, n + 1, n);}
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    geometries.push(geometry);
    const mesh = new StageMesh(geometry, material); mesh.name = name; mesh.position.set(0, 0, z); parent.add(mesh);
  }
  function arch(parent: Group, name: string, x: number, y: number, width: number, height: number, z: number, thickness: number, material: Material) {
    const radius = width / 2, shoulder = y + height / 2 - radius;
    const points: Point[] = [[x - radius, y - height / 2], [x - radius, shoulder]];
    for (let i = 1; i <= 40; i++) {const t = Math.PI - i * Math.PI / 40; points.push([x + Math.cos(t) * radius, shoulder + Math.sin(t) * radius]);}
    points.push([x + radius, y - height / 2]); strip(parent, name, points, thickness, z, material);
  }
  function frame(parent: Group, name: string, x: number, y: number, w: number, h: number, z: number, t: number, material: Material) {
    for (const direction of [-1, 1]) {
      plane(parent, `${name}-vertical-${direction}`, t, h, x + direction * w / 2, y, z, material);
      plane(parent, `${name}-horizontal-${direction}`, w + t, t, x, y + direction * h / 2, z, material);
    }
  }
  function newRoom(id: PamelaRoomVariant) {
    const room = new T.Group(); room.name = id; roomGroups.set(id, room); group.add(room); return room;
  }

  const jade = newRoom('jade-salon');
  const jadeWall = paint({bottom: '#071310', top: '#183e35', glow: '#dcba7c', glowStrength: .018});
  const jadeInset = paint({bottom: '#0c1815', top: '#1b342c', glowStrength: .009});
  const jadePanel = paint({bottom: '#12231c', top: '#284b3d', glowStrength: .018});
  const jadeShade = paint({bottom: '#050e0a', top: '#122b21'});
  const brass = paint({bottom: '#423728', top: '#ad9360', glowStrength: .018, grain: .035});
  const darkBrass = paint({bottom: '#201f16', top: '#5a5035'});
  const leftLamp = paint({bottom: '#ac8d5d', top: '#efdbaf', glowStrength: .08, grain: 0});
  const rightLamp = paint({bottom: '#7d795f', top: '#c5c6aa', glowStrength: .04, grain: 0});
  plane(jade, 'jade-far-wall', 36, 24, 0, 2, -10, jadeWall);
  plane(jade, 'jade-central-recess', 7.1, 8, 0, 2.3, -7.48, jadeInset);
  for (const side of [-1, 1]) {
    const x = side * 5.15;
    plane(jade, `jade-side-panel-${side}`, 3.0, 7.4, x, 2.45, -7.25, jadePanel);
    frame(jade, `jade-panel-frame-${side}`, x, 2.35, 2.67, 6.55, -7.2, .025, darkBrass);
    arch(jade, `jade-panel-arch-${side}`, x, 1.25, 2.15, 4.8, -7.15, .026, brass);
    for (let n = 0; n < 7; n++) plane(jade, `jade-flute-${side}-${n}`, .045, 7.5, side * (7.05 + n * .16), 2.35, -6.65, n % 2 ? darkBrass : jadeShade);
    plane(jade, `jade-pilaster-${side}`, .34, 8.5, side * 3.64, 2.6, -6.6, jadeShade);
    plane(jade, `jade-pilaster-edge-${side}`, .032, 8.5, side * 3.46, 2.6, -6.56, brass);
    plane(jade, `jade-near-column-${side}`, .7, 10, side * 6.35, 3, -4.55, jadeShade);
    plane(jade, `jade-near-highlight-${side}`, .035, 10, side * 6.0, 3, -4.5, darkBrass);
    plane(jade, `jade-sconce-backing-${side}`, .66, 1.8, x, 2.65, -6.9, darkBrass);
    plane(jade, `jade-sconce-light-${side}`, .19, 1.15, x, 2.75, -6.84, side < 0 ? leftLamp : rightLamp);
    for (const dx of [-.23, .23]) plane(jade, `jade-sconce-brass-${side}-${dx}`, .035, 1.6, x + dx, 2.65, -6.8, brass);
  }
  arch(jade, 'jade-main-arch-outer', 0, 1.12, 6.45, 5.06, -7.35, .045, darkBrass);
  arch(jade, 'jade-main-arch-inner', 0, 1.08, 6.16, 4.92, -7.3, .018, brass);
  plane(jade, 'jade-baseboard', 26, .065, 0, -.65, -6.51, brass);
  const jadeFloor = plane(jade, 'jade-rear-floor', 28, 6.5, 0, -.76, -7.3, jadeShade); jadeFloor.rotation.x = -Math.PI / 2;

  const night = newRoom('midnight-atrium');
  const nightSky = paint({bottom: '#10212b', top: '#101d34', glow: '#b8d8ef', glowStrength: .017});
  const nightHorizon = paint({bottom: '#152e39', top: '#122636', glow: '#c7b296', glowStrength: .009});
  const building = paint({bottom: '#08131c', top: '#12222e'});
  const glass = paint({bottom: '#10212b', top: '#263c4b', glowStrength: .009});
  const mullion = paint({bottom: '#131e25', top: '#3d505c'});
  const bronze = paint({bottom: '#39302a', top: '#9d8260', glowStrength: .012});
  const bronzeShade = paint({bottom: '#171e25', top: '#4d4840'});
  const cityWarm = paint({bottom: '#91856b', top: '#a99a7a', grain: 0});
  const cityCool = paint({bottom: '#546876', top: '#7d92a0', grain: 0});
  plane(night, 'night-far-sky', 36, 24, 0, 2, -10, nightSky);
  plane(night, 'night-horizon', 28, 2.4, 0, .8, -9.8, nightHorizon);
  for (let i = 0; i < 22; i++) {
    const x = (i - 10.5) * 1.01, h = 1.05 + ((i * 17) % 13) * .13, z = -9.58 + (i % 3) * .13;
    plane(night, `night-building-${i}`, .82, h, x, .4 + h / 2, z, building);
    for (let floor = 0; floor < 5; floor++) for (let col = 0; col < 3; col++) {
      if ((i * 19 + floor * 7 + col * 11) % 5 > 1) continue;
      plane(night, `night-window-${i}-${floor}-${col}`, .04, .075, x + (col - 1) * .2, .6 + floor * .29, z + .012, (i + floor) % 3 ? cityWarm : cityCool);
    }
  }
  for (const side of [-1, 1]) {
    plane(night, `night-side-glass-${side}`, 3.5, 7.8, side * 6.25, 3, -7.3, glass);
    plane(night, `night-near-pier-${side}`, .61, 10, side * 6.34, 3, -4.55, bronzeShade);
    plane(night, `night-near-pier-rim-${side}`, .025, 10, side * 6.03, 3, -4.5, bronze);
    plane(night, `night-light-housing-${side}`, .7, .11, side * 4.15, 3.28, -6.7, bronze);
    plane(night, `night-pendant-stem-${side}`, .025, 2.8, side * 4.15, 4.7, -6.69, bronze);
    plane(night, `night-pendant-light-${side}`, .42, .045, side * 4.15, 3.21, -6.65, side < 0 ? leftLamp : rightLamp);
  }
  for (const x of [-7.6, -5.15, -2.65, 2.65, 5.15, 7.6]) {
    plane(night, `night-mullion-${x}`, .055, 9.6, x, 3, -7.1, mullion);
    plane(night, `night-mullion-highlight-${x}`, .012, 9.6, x - .028, 3, -7.08, bronze);
  }
  for (const y of [-.4, 3.65, 6.4]) plane(night, `night-crossbar-${y}`, 25, .045, 0, y, -7.05, mullion);
  plane(night, 'night-quiet-central-lower-panel', 5.2, 2, 0, .35, -6.95, building);
  plane(night, 'night-low-bronze-trim', 25, .055, 0, -.6, -6.9, bronze);
  const nightFloor = plane(night, 'night-rear-floor', 28, 6.5, 0, -.76, -7.3, bronzeShade); nightFloor.rotation.x = -Math.PI / 2;

  function ensureLive() {if (disposed) throw Error('Pamela background layer is disposed');}
  function setVariant(id: PamelaRoomVariant) {
    ensureLive(); if (!roomGroups.has(id)) throw Error(`Unknown Pamela room: ${String(id)}`);
    variant = id; for (const [roomId, room] of roomGroups) room.visible = roomId === id;
  }
  function setLightProfile(id: PamelaRoomLightProfile) {
    ensureLive();
    if (!Object.hasOwn(PAMELA_ROOM_LIGHT_PROFILES, id)) throw Error(`Unknown Pamela room light profile: ${String(id)}`);
    profile = id;
    const tint = PAMELA_ROOM_LIGHT_PROFILES[id].roomTint;
    for (const material of materials) {
      const uniforms = material.uniforms as {profileTint: {value: InstanceType<typeof Three.Vector3>}};
      uniforms.profileTint.value.set(...tint);
    }
  }
  setVariant(variant); setLightProfile(profile);
  return {group, setVariant, setLightProfile, getVariant: () => variant, getLightProfile: () => profile,
    dispose() {
      if (disposed) return; disposed = true;
      group.parent?.remove(group); group.clear();
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); roomGroups.clear();
    },
  };
}
