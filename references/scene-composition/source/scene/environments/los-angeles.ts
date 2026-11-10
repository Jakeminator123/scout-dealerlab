import type * as Three from 'three';
/**
 * Local LA room accessory. The root scene owns rendering, time and dawn lighting.
 * No timers, camera following, billboard rotation or random animation are used.
 */
export const panoramaLevels = Object.freeze({
  1024: Object.freeze({file: 'la-panorama-1k.jpg', width: 1024, height: 512, bytes: 66638}),
  1774: Object.freeze({file: 'la-panorama.jpg', width: 1774, height: 887, bytes: 231259}),
});

export const panoramaProvenance = Object.freeze({
  generator: 'OpenAI built-in image_gen',
  generatedDate: '2026-11-07',
  sourceWidth: 1774,
  sourceHeight: 887,
  projection: 'AI-generated 2:1 equirectangular panorama; not a measured photographic capture',
  processing: 'Native-size JPEG plus downsampled 1024 x 512 JPEG; no upscaling',
  promptFile: '.cache/room-study/los-angeles/provenance.json',
});

const DIGITS = ['abcfed', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd'];
const SEGMENTS = {
  a: [12, 0, 57, 10], b: [71, 12, 10, 57], c: [71, 85, 10, 57],
  d: [12, 144, 57, 10], e: [0, 85, 10, 57], f: [0, 12, 10, 57],
  g: [12, 72, 57, 10],
};

/** Creates a freestanding clock with a fixed world position left of the dealer. */
export function createEnvironmentFx(THREE:typeof Three) {
  const group = new THREE.Group();
  group.name = 'los-angeles-environment-fx';
  const clock = new THREE.Group();
  clock.name = 'los-angeles-digital-clock';
  clock.position.set(-2.4, 1.11, -4.2);
  clock.scale.setScalar(.6);
  // Face the default player area, without following later camera motion.
  clock.rotation.y = 0.32;
  group.add(clock);

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 272;
  const context = canvas.getContext('2d')!;
  if (!context) throw new Error('A 2D canvas is required for the Los Angeles clock.');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x111214, roughness: 0.36, metalness: 0.68,
  });
  const standMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3b3e, roughness: 0.4, metalness: 0.8,
  });
  const screenMaterial = new THREE.MeshBasicMaterial({map: texture, toneMapped: false});
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.58, 0.11), frameMaterial);
  frame.castShadow = frame.receiveShadow = true;
  frame.name = 'los-angeles-clock-bezel';
  clock.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 0.4621875), screenMaterial);
  screen.name = 'los-angeles-digital-clock-screen';
  screen.position.z = 0.056;
  clock.add(screen);

  // The post and weighted base make the clock a physical room object.
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.055, 1.54, 0.055), standMaterial);
  post.position.set(0, -1.055, -0.005);
  post.castShadow = post.receiveShadow = true;
  clock.add(post);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.42), frameMaterial);
  base.position.set(0, -1.825, 0);
  base.castShadow = base.receiveShadow = true;
  clock.add(base);

  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  let lastSecond:number|null = null;
  let disposed = false;

  function drawDigits(value:string) {
    context.fillStyle = '#070709';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.font = '500 23px Arial, sans-serif';
    context.fillStyle = '#d56059';
    context.fillText('LOS ANGELES', canvas.width / 2, 37);
    const widths = [...value].map(character => character === ':' ? 24 : 81);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + (value.length - 1) * 22;
    let x = (canvas.width - totalWidth) / 2;
    context.shadowColor = '#ff251c';
    context.shadowBlur = 9;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (character === ':') {
        context.fillStyle = '#ff3a2e';
        context.shadowBlur = 9;
        context.fillRect(x + 7, 113, 10, 10);
        context.fillRect(x + 7, 177, 10, 10);
      } else {
        const active = DIGITS[Number(character)];
        for (const [name, [dx, dy, width, height]] of Object.entries(SEGMENTS)) {
          const enabled = active.includes(name);
          context.fillStyle = enabled ? '#ff3a2e' : '#290f10';
          context.shadowBlur = enabled ? 9 : 0;
          context.fillRect(x + dx, 76 + dy, width, height);
        }
      }
      x += widths[index] + 22;
    }
    context.shadowBlur = 0;
    texture.needsUpdate = true;
  }

  function update({date}: {date?:Date;time?:number} = {}) {
    if (disposed || !(date instanceof Date) || !Number.isFinite(date.getTime())) return false;
    const second = Math.floor(date.getTime() / 1000);
    if (second === lastSecond) return false;
    lastSecond = second;
    const parts = format.formatToParts(date);
    const value = ['hour', 'minute', 'second']
      .map(type => parts.find(part => part.type === type)!.value)
      .join(':');
    drawDigits(value);
    group.userData.clockText = value;
    group.userData.clockEpochSecond = second;
    group.userData.clockTimeZone = 'America/Los_Angeles';
    return true;
  }

  update({date: new Date()});
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse(object => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      frameMaterial.dispose();
      standMaterial.dispose();
      screenMaterial.dispose();
      texture.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}

