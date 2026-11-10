// A room chooses presentation differences; camera, table and dealer keep one scene.
// Custom images have no known room geometry or indoor/outdoor classification.
export function salonLampLevel(time:number){
  // Two brief, shallow tungsten dips every 47 seconds. No full-screen flash.
  const t=((time%47)+47)%47;
  const pulse=(center:number,width:number)=>Math.max(0,1-Math.abs(t-center)/width);
  return 1-.19*pulse(12.2,.11)-.11*pulse(12.48,.08);
}
export function roomProfile(room:string,daylight=100,projection?:string){
  const day=Math.min(100,Math.max(0,Number.isFinite(daylight)?daylight:100))/100;
  const outdoor=room==='forest'||room==='la',neon=room==='vegas';
  return {
    backdrop:room==='forest'?'grounded':room==='la'||neon||projection==='equirectangular'?'panorama':'photo',
    lighting:outdoor?'sun':neon?'neon':'neutral',
    spatialShade:outdoor,
    weather:room==='forest',
    sunrise:room==='la',
    clockName:room==='la'?'los-angeles-digital-clock':neon?'vegas-analog-clock':null,
    keyIntensity:(neon?.8:1)+.6*day,
    fillIntensity:(neon?1.05:.9)+.3*day,
    reflectionIntensity:(neon?1:.9)+.25*day,
    backdropBrightness:.82+.18*day,
  };
}
