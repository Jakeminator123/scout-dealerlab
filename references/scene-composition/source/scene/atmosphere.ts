import * as T from './vendor/three.module.js';

// Shared world-space shading is an artistic approximation over the photograph.
// It does not recover the photographed trees' or hillside's actual geometry.
export function createShade() {
  const uniforms = { studyDusk: { value: 0 }, studyShade: { value: 1 } };
  return {
    update(dusk:number, enabled:boolean) { uniforms.studyDusk.value = dusk; uniforms.studyShade.value = enabled ? 1 : 0; },
    apply(material:T.Material) {
      const weight={value:1};material.userData.studyShadeWeight=weight;
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms,{studyShadeWeight:weight});
        shader.vertexShader = 'varying vec3 studyPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
          'studyPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
        shader.fragmentShader = 'varying vec3 studyPosition;\nuniform float studyDusk;\nuniform float studyShade;\nuniform float studyShadeWeight;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
          #include <dithering_fragment>
          float terrain = dot(studyPosition.xz, vec2(0.76, 0.65))
            + 0.35 * sin(studyPosition.z * 0.85) + 0.20 * sin(studyPosition.x * 1.8);
          float edge = mix(7.0, -6.0, studyDusk);
          float shade = smoothstep(edge - 0.35, edge + 0.7, terrain)
            * smoothstep(0.02, 0.3, studyDusk) * studyShade * studyShadeWeight;
          gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.47, 0.56, 0.68), shade);
        `);
      };
      material.customProgramCacheKey = () => 'room-study-spatial-shade-v1';
      material.needsUpdate = true;
    },
  };
}

export function createLeaves() {
  const shape = new T.Shape();
  shape.moveTo(0, -.5);
  shape.bezierCurveTo(-.48, -.15, -.45, .18, 0, .5);
  shape.bezierCurveTo(.36, .12, .36, -.12, 0, -.5);
  const geometry = new T.ShapeGeometry(shape, 5);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setZ(i, .12 * Math.sin(positions.getY(i) * 4));
  geometry.computeVertexNormals();
  const material = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .9, side: T.DoubleSide });
  const mesh = new T.InstancedMesh(geometry, material, 36);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const transform = new T.Object3D();
  const colors = [0x9c652c, 0xbc8d3c, 0x947d36, 0x705b30];
  let seed = 4207;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const leaves = Array.from({length: mesh.count}, (_, i) => {
    mesh.setColorAt(i, new T.Color(colors[i % colors.length]));
    return {x: (random() - .5) * 9, z: (random() - .5) * 8, phase: random(), speed: .032 + random() * .025, size: .06 + random() * .04};
  });
  return { mesh, update(time:number, enabled:boolean) {
    mesh.visible = enabled;
    if (!enabled) return;
    leaves.forEach((leaf, i) => {
      const progress = (leaf.phase + time * leaf.speed) % 1;
      const x = leaf.x + Math.sin(progress * 9 + i) * .35 + progress * .5;
      const z = leaf.z + Math.cos(progress * 7 + i) * .2;
      // Fade in/out by shrinking, with a conservative tabletop exclusion height.
      const landing = Math.abs(x) < 1.55 && z > -.95 && z < .65 ? .88 : .025;
      const y = Math.max(landing, 4.5 * (1 - progress));
      const size = leaf.size * Math.min(1, progress * 30, (1 - progress) * 12);
      transform.position.set(x, y, z);
      transform.rotation.set(progress * 10 + i, progress * 5, Math.sin(progress * 14 + i));
      if (y === landing) transform.rotation.x = -Math.PI / 2;
      transform.scale.setScalar(size);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }};
}
