import type * as Three from 'three';
// Calibrated forearm depth for Liv's light sleeves and dark vest.
// This is a calibrated image surface, not a reconstructed or tracked 3D person.
export function addAvatarDepth(material:Three.Material,tableTop=.815){
  const span={value:0},aspect={value:1},tableHeight={value:tableTop},feltClampEnd={value:.80};
  const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    Object.assign(shader.uniforms,{avatarDepthSpan:span,avatarImageAspect:aspect,avatarTableHeight:tableHeight,avatarFeltClampEnd:feltClampEnd});
    const declarations='uniform float avatarDepthSpan;\nuniform float avatarImageAspect;\nvarying vec4 avatarBodyClip;\nuniform float avatarTableHeight;\nuniform float avatarFeltClampEnd;\nvarying vec4 avatarTableClip;\n';
    shader.vertexShader=declarations+shader.vertexShader;
    shader.fragmentShader=declarations+shader.fragmentShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      avatarBodyClip=projectionMatrix*modelViewMatrix*vec4(transformed,1.);
      float sourceY=1.-uv.y;
      // The hand and card can cross the center, so depth spans the full forearm band.
      float forearm=smoothstep(.31,.47,sourceY)*(1.-smoothstep(.57,.67,sourceY));
      transformed.z+=avatarDepthSpan*forearm;
      // Project the felt intersection along this same camera ray. The image
      // contour stays fixed; only forearm/prop occlusion is constrained below.
      vec3 avatarWorld=(modelMatrix*vec4(transformed,1.)).xyz;
      vec3 avatarRay=avatarWorld-cameraPosition;
      float feltRayT=(avatarTableHeight-cameraPosition.y)/min(avatarRay.y,-.0001);
      avatarTableClip=projectionMatrix*viewMatrix*vec4(cameraPosition+avatarRay*feltRayT,1.);
    `);
    // The dark vest belongs to the torso even where it borders the light sleeves.
    // Keep its depth behind the rail, without distorting the contour of either arm.
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
      #include <alphatest_fragment>
      gl_FragDepth=gl_FragCoord.z;
      #ifdef USE_MAP
        vec4 bodySample=texture2D(map,vMapUv);
        #ifdef DECODE_VIDEO_TEXTURE
          bodySample=sRGBTransferEOTF(bodySample);
        #endif
        vec3 bodyPixel=bodySample.rgb;
        float darkVest=1.-smoothstep(.055,.12,max(bodyPixel.r,max(bodyPixel.g,bodyPixel.b)));
        float lowerBody=smoothstep(.38,.44,1.-vMapUv.y)*(1.-smoothstep(.65,.72,1.-vMapUv.y));
        if(avatarDepthSpan>0.){
          gl_FragDepth=mix(gl_FragCoord.z,avatarBodyClip.z/avatarBodyClip.w*.5+.5,darkVest*lowerBody);
          // The dark torso remains behind the rail. Skin, cuffs and the neutral
          // filmed card may rest on the felt instead of being cut by its mesh.
          float feltBand=1.-smoothstep(avatarFeltClampEnd-.08,avatarFeltClampEnd,1.-vMapUv.y);
          if(lowerBody>.5&&feltBand>.5&&darkVest<.5&&avatarTableClip.w>0.)
            gl_FragDepth=min(gl_FragDepth,avatarTableClip.z/avatarTableClip.w*.5+.5-.000001);
        }
      #endif
    `);
  };
  material.customProgramCacheKey=()=>cache()+'-arm-depth-v7';
  return {set(depthSpan:number,imageAspect:number,feltTop=tableTop,clampEnd=.80){span.value=depthSpan;aspect.value=imageAspect;tableHeight.value=feltTop;feltClampEnd.value=clampEnd;}};
}
