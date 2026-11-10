import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {buildPamelaContactLayers} from '../src/pamela-contact-shadow.ts';
const root='runs/20261109-pamela-central-composite',run='runs/20261109-pamela-contact-shadow',W=1762,H=1174;
await mkdir(run,{recursive:true});
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const roomPath=`${root}/scene-assets/pamela-clean-room-v1.png`,tablePath=`${root}/scene-assets-v2/dark-felt-table-native-1762x1174.png`;
const room=await sharp(roomPath).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const table=await sharp(tablePath).ensureAlpha().raw().toBuffer();
const dark=await sharp(room).composite([{input:await readFile(tablePath)}]).removeAlpha().raw().toBuffer();
const lightTable=Buffer.from(table);for(let p=0;p<W*H;p++){const i=p*4,l=.2126*table[i]+.7152*table[i+1]+.0722*table[i+2];for(let c=0;c<3;c++)lightTable[i+c]=Math.min(242,Math.round(180+l*.9));}
const light=await sharp({create:{width:W,height:H,channels:3,background:'#dedbd4'}}).composite([{input:await sharp(lightTable,{raw:{width:W,height:H,channels:4}}).png().toBuffer()}]).removeAlpha().raw().toBuffer();
const frames=[{out:0,clip:'approach',f:0},{out:89,clip:'approach',f:89},{out:90,clip:'deal',f:3},{out:171,clip:'deal',f:84},{out:185,clip:'deal',f:98},{out:205,clip:'deal',f:118},{out:519,clip:'retreat',f:89}];
const sources={approach:`${root}/work/approach`,deal:'runs/20261109-pamela-sequence/qa/central-base',retreat:'runs/20261109-pamela-sequence/qa/from-shoe'};
const results=[];
for(const e of frames){
  const sourcePath=`${sources[e.clip as keyof typeof sources]}/frame-${String(e.f+1).padStart(3,'0')}.png`,source=await sharp(sourcePath).removeAlpha().raw().toBuffer();
  const keyed=keyPamelaFrame(source,W,H),begin=performance.now();
  const contact=buildPamelaContactLayers(source,keyed.alpha,W,H,{excludeShadowRects:e.clip==='deal'&&e.f>=118?[{x:793,y:1018,width:182,height:88}]:[]});
  const milliseconds=performance.now()-begin;
  const name=String(e.out).padStart(3,'0');
  await sharp(source,{raw:{width:W,height:H,channels:3}}).extract({left:570,top:780,width:600,height:350}).png().toFile(`${run}/${name}-source-contact.png`);
  for(const [label,base] of [['dark',dark],['light',light]] as [string,Buffer][]){
    const pixels=Buffer.from(base),baseline=Buffer.from(base);
    for(let p=0;p<W*H;p++)for(let c=0;c<3;c++){
      const i=p*3+c,a=contact.foregroundAlpha[p],s=contact.shadowAlpha[p];
      pixels[i]=Math.round(keyed.rgb[i]*a+base[i]*(1-s)*(1-a));
      const originalA=keyed.alpha[p];baseline[i]=Math.round(keyed.rgb[i]*originalA+base[i]*(1-originalA));
    }
    await sharp(pixels,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/${name}-${label}-candidate.png`);
    if(label==='dark')await sharp(baseline,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/${name}-key-only-baseline.png`);
    const roi={left:570,top:780,width:600,height:350};
    const baseCrop=await sharp(baseline,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),newCrop=await sharp(pixels,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer();
    await sharp({create:{width:1200,height:350,channels:3,background:'#111'}}).composite([{input:baseCrop,left:0,top:0},{input:newCrop,left:600,top:0}]).png().toFile(`${run}/${name}-${label}-contact-comparison.png`);
    if(label==='dark'){
      const v2Crop=await sharp(`${root}/qa/v2/composite-${name}.png`).extract(roi).png().toBuffer();
      await sharp({create:{width:1200,height:350,channels:3,background:'#111'}}).composite([{input:v2Crop,left:0,top:0},{input:newCrop,left:600,top:0}]).png().toFile(`${run}/${name}-v2-vs-candidate-contact.png`);
    }
  }
  for(const [label,values] of [['torso',contact.torsoOcclusion],['shadow',contact.shadowAlpha]] as [string,Float32Array][]){
    const bytes=Buffer.from(values.map(v=>Math.round(v*255)));await sharp(bytes,{raw:{width:W,height:H,channels:1}}).png().toFile(`${run}/${name}-${label}-mask.png`);
  }
  results.push({...e,sourcePath,sourceSha256:sha(await readFile(sourcePath)),milliseconds,...contact.diagnostics});
}
await writeFile(`${run}/manifest.json`,JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),status:'isolated-contact-candidate-not-integrated',sourceCanvas:{width:W,height:H,transform:'identity'},scene:{roomPath,roomSha256:sha(await readFile(roomPath)),tablePath,tableSha256:sha(await readFile(tablePath))},helpers:{contactSha256:sha(await readFile('src/pamela-contact-shadow.ts')),keySha256:sha(await readFile('src/pamela-key.ts'))},lightControl:'Same table geometry/alpha, deterministic warm grey luminance remap; no generated image.',rawCardsRetained:true,originalsUnchanged:true,results},null,2));
console.log(JSON.stringify(results.map(({torsoColumns,protectedArmColumns,...r})=>({...r,torsoColumnCount:torsoColumns.length,protectedArmColumnCount:protectedArmColumns.length})),null,2));
