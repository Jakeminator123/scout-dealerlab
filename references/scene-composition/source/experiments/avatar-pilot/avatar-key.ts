import type * as Three from 'three';
import * as T from '/scene/vendor/three.module.js';

// Applies to both still textures and video. The shared legacy key only handles video.
export function addAvatarKey(material:Three.Material){
  const enabled={value:1},pixel={value:new T.Vector2(1/1080,1/1920)};
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);Object.assign(shader.uniforms,{avatarKey:enabled,avatarPixel:pixel});
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_pars_fragment>',`
      #include <map_pars_fragment>
      uniform float avatarKey;
      uniform vec2 avatarPixel;
      float avatarMatte(vec2 uv){
        vec3 c=texture2D(map,uv).rgb;
        float dominance=(c.g-max(c.r,c.b))/max(c.g,.001);
        return 1.-smoothstep(.18,.36,dominance)*smoothstep(.06,.16,c.g);
      }
    `);
    const sample='vec4 sampledDiffuseColor = texture2D( map, vMapUv );';
    const chunk=T.ShaderChunk.map_fragment.replace(sample,`${sample}
      if(avatarKey>.5){
        vec2 d=avatarPixel;
        float a=.6*avatarMatte(vMapUv)+.1*(avatarMatte(vMapUv+vec2(d.x,0.))+avatarMatte(vMapUv-vec2(d.x,0.))+avatarMatte(vMapUv+vec2(0.,d.y))+avatarMatte(vMapUv-vec2(0.,d.y)));
        sampledDiffuseColor.a*=a;
        sampledDiffuseColor.g=min(sampledDiffuseColor.g,max(sampledDiffuseColor.r,sampledDiffuseColor.b)+.015);
      }
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',chunk);
  };
  material.customProgramCacheKey=()=> 'avatar-still-video-key-v1';
  return {set(active:boolean,width:number,height:number){enabled.value=active?1:0;pixel.value.set(1/width,1/height);}};
}
