import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {buildPamelaContactLayers} from '../src/pamela-contact-shadow.ts';
import {finishPamelaFrame,PAMELA_FINISH_PROFILE} from '../src/pamela-finish-profile.ts';
const run='runs/20261109-pamela-finish-study',scene='runs/20261109-pamela-central-composite',W=1762,H=1174;
await mkdir(run,{recursive:true});
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const hashFile=async(path:string)=>({path,sha256:hash(await readFile(path))});
const roomPath=`${scene}/scene-assets/pamela-clean-room-v1.png`,tablePath=`${scene}/scene-assets-v2/dark-felt-table-native-1762x1174.png`;
const room=await sharp(roomPath).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const table=await sharp(tablePath).ensureAlpha().raw().toBuffer();
const dark=await sharp(room).composite([{input:await readFile(tablePath)}]).removeAlpha().raw().toBuffer();
const lightTable=Buffer.from(table);for(let p=0;p<W*H;p++){const i=p*4,l=.2126*table[i]+.7152*table[i+1]+.0722*table[i+2];for(let c=0;c<3;c++)lightTable[i+c]=Math.min(242,Math.round(180+l*.9));}
const light=await sharp({create:{width:W,height:H,channels:3,background:'#dedbd4'}}).composite([{input:await sharp(lightTable,{raw:{width:W,height:H,channels:4}}).png().toBuffer()}]).removeAlpha().raw().toBuffer();
if(process.argv.includes('--tone-only')){
  const sourcePath='runs/20261109-pamela-idle-pilot/qa/breath/frame-091.png',raw=await sharp(sourcePath).removeAlpha().raw().toBuffer(),key=keyPamelaFrame(raw,W,H),contact=buildPamelaContactLayers(raw,key.alpha,W,H),rgb=Buffer.from(key.rgb),cfg=PAMELA_FINISH_PROFILE;
  // The exact fixed tone formula used by finishPamelaFrame, with no edge pass.
  const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  const encoded=(v:number)=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
  const lut=Float32Array.from({length:256},(_,i)=>linear(i/255)),gain=2**cfg.exposureEV;
  for(let p=0;p<W*H;p++){
    if(key.alpha[p]<=0)continue;
    const i=p*3,l=.2126*lut[rgb[i]]+.7152*lut[rgb[i+1]]+.0722*lut[rgb[i+2]],t=Math.max(0,Math.min(1,(l-cfg.exposureLumaStart)/(cfg.exposureLumaFull-cfg.exposureLumaStart))),g=1+(gain-1)*t*t*(3-2*t);
    for(let c=0;c<3;c++)rgb[i+c]=Math.round(Math.max(0,Math.min(1,encoded(lut[rgb[i+c]]*g)))*255);
  }
  const out=Buffer.from(dark);for(let p=0;p<W*H;p++)for(let c=0;c<3;c++){const i=p*3+c,a=contact.foregroundAlpha[p];out[i]=Math.round(rgb[i]*a+Math.floor(dark[i]*(1-contact.shadowAlpha[p]))*(1-a));}
  const afterPath=`${run}/breath-090-dark-tone-only.png`;await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(afterPath);
  const manifest=JSON.parse(await readFile(`${run}/profile.json`,'utf8'));
  manifest.nativePairToneOnly={frame:'breath-090',before:await hashFile(`${run}/breath-090-dark-baseline.png`),after:await hashFile(afterPath),alphaChanged:0,edgePass:false,exposureEV:cfg.exposureEV,exposureLumaStart:cfg.exposureLumaStart,exposureLumaFull:cfg.exposureLumaFull};
  manifest.toneOnlyGeneration={createdAt:new Date().toISOString(),source:await hashFile(sourcePath),script:await hashFile('tools/pamela-finish-study.ts'),profile:await hashFile('src/pamela-finish-profile.ts'),status:'aesthetic-comparison-only-baseline-retained'};
  const priorScript=manifest.helpers.find((h:{path:string})=>h.path==='tools/pamela-finish-study.ts');
  if(priorScript){const snapshot=await hashFile(`${run}/combined-study-source.ts`);if(snapshot.sha256!==priorScript.sha256)throw Error('Combined source snapshot differs');priorScript.originalPath=priorScript.path;priorScript.path=snapshot.path;}
  await writeFile(`${run}/profile.json`,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest.nativePairToneOnly));process.exit(0);
}
const entries=[{clip:'breath',frame:0},{clip:'breath',frame:90},{clip:'breath',frame:179},{clip:'glance',frame:45},{clip:'deal',frame:84},{clip:'deal',frame:114}];
const rois={edge:{left:520,top:380,width:300,height:260},skin:{left:750,top:105,width:300,height:260},torso:{left:640,top:760,width:500,height:300}};
const sheets:Record<string,Array<{input:Buffer,left:number,top:number}>>={edge:[],skin:[],torso:[]};
const results=[];
function skinStats(raw:Buffer,after:Buffer){
  const values:number[]=[],afterValues:number[]=[];let n=0,any255=0,all250=0,red255=0,any250=0;
  for(let y=105;y<1100;y++)for(let x=620;x<1120;x++){
    const i=(y*W+x)*3,r=raw[i],g=raw[i+1],b=raw[i+2];if(!(r>95&&r>g*1.12&&g>b*1.07))continue;
    n++;if(Math.max(r,g,b)===255)any255++;if(r===255)red255++;if(Math.min(r,g,b)>=250)all250++;if(Math.max(r,g,b)>=250)any250++;
    values.push(.2126*r+.7152*g+.0722*b);afterValues.push(.2126*after[i]+.7152*after[i+1]+.0722*after[i+2]);
  }
  values.sort((a,b)=>a-b);afterValues.sort((a,b)=>a-b);
  const q=(a:number[],p:number)=>a[Math.floor((a.length-1)*p)];return {pixels:n,anyChannel255:any255,red255,allChannelsAtLeast250:all250,anyChannelAtLeast250:any250,lumaP50:q(values,.5),lumaP95:q(values,.95),candidateLumaP50:q(afterValues,.5),candidateLumaP95:q(afterValues,.95)};
}
for(let row=0;row<entries.length;row++){
  const e=entries[row],name=`${e.clip}-${String(e.frame).padStart(3,'0')}`;
  const path=e.clip==='deal'?`runs/20261109-pamela-sequence/qa/central-base/frame-${String(e.frame+1).padStart(3,'0')}.png`:`runs/20261109-pamela-idle-pilot/qa/${e.clip}/frame-${String(e.frame+1).padStart(3,'0')}.png`;
  const raw=await sharp(path).removeAlpha().raw().toBuffer(),key=keyPamelaFrame(raw,W,H),finish=finishPamelaFrame(raw,key,W,H);
  const baselineContact=buildPamelaContactLayers(raw,key.alpha,W,H);
  // Same source-derived contact geometry in both; finish alpha reduction only
  // multiplies the original contact alpha, so this study cannot move the torso line.
  const finishedAlpha=Float32Array.from(baselineContact.foregroundAlpha,(a,p)=>key.alpha[p]>0?a*finish.alpha[p]/key.alpha[p]:0);
  const images:Buffer[]=[];
  let baselineMatchesExisting:null|{differentChannels:number,maxDifference:number}=null;
  for(const [background,stage] of [['dark',dark],['light',light]] as [string,Buffer][]){
    for(const [version,rgb,alpha] of [['baseline',key.rgb,baselineContact.foregroundAlpha],['candidate',finish.rgb,finishedAlpha]] as [string,Buffer,Float32Array][]){
      const out=Buffer.from(stage);for(let p=0;p<W*H;p++)for(let c=0;c<3;c++){const i=p*3+c,shaded=Math.floor(stage[i]*(1-baselineContact.shadowAlpha[p]));out[i]=Math.round(rgb[i]*alpha[p]+shaded*(1-alpha[p]));}
      await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/${name}-${background}-${version}.png`);images.push(out);
      if(e.clip!=='deal'&&background==='dark'&&version==='baseline'){
        const existing=await sharp(`runs/20261109-pamela-idle-composite/qa/${name}.png`).removeAlpha().raw().toBuffer();let differentChannels=0,maxDifference=0;for(let i=0;i<out.length;i++)if(out[i]!==existing[i]){differentChannels++;maxDifference=Math.max(maxDifference,Math.abs(out[i]-existing[i]));}baselineMatchesExisting={differentChannels,maxDifference};
      }
    }
  }
  for(const [label,roi] of Object.entries(rois))for(let col=0;col<images.length;col++)sheets[label].push({input:await sharp(images[col],{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:col*roi.width,top:row*roi.height});
  await sharp(finish.edgeMask,{raw:{width:W,height:H,channels:1}}).png().toFile(`${run}/${name}-edge-mask.png`);
  const edgeSamples=[];
  for(let y=390;y<430&&edgeSamples.length<5;y++)for(let x=630;x<730&&edgeSamples.length<5;x++){
    const p=y*W+x;if(key.alpha[p]===1&&key.alpha[p-W]<.05){const i=p*3;edgeSamples.push({x,y,raw:[...raw.subarray(i,i+3)],keyRGB:[...key.rgb.subarray(i,i+3)],alpha:key.alpha[p],aboveAlpha:key.alpha[p-W]});}
  }
  let markerTestSkinPixels=0;for(let y=818;y<838;y++)for(let x=848;x<902;x++){const i=(y*W+x)*3,r=raw[i],g=raw[i+1],b=raw[i+2];if(r>95&&r>g*1.12&&g>b*1.07)markerTestSkinPixels++;}
  results.push({...e,name,source:await hashFile(path),artifacts:await Promise.all([`${run}/${name}-edge-mask.png`,`${run}/${name}-dark-candidate.png`,`${run}/${name}-light-candidate.png`].map(hashFile)),baselineMatchesExisting,finish:finish.diagnostics,contact:baselineContact.diagnostics,skin:skinStats(raw,finish.rgb),hardEdgeSamples:edgeSamples,markerTestSkinPixels});
}
for(const [label,roi] of Object.entries(rois))await sharp({create:{width:roi.width*4,height:roi.height*entries.length,channels:3,background:'#111'}}).composite(sheets[label]).png().toFile(`${run}/comparison-${label}.png`);
const profile={schemaVersion:1,createdAt:new Date().toISOString(),status:'one-fixed-profile-candidate-baseline-retained-pending-review',decision:{activate:false,recommendation:'Retain baseline. The fixed tone change is an aesthetic comparison; partial-alpha erosion has no unambiguous edge benefit on the light control.',anatomy:'Same original frame on both sides of every comparison. Scene light/colour cannot repair generated anatomical drift or a clip join.'},comparisonImages:await Promise.all(['edge','skin','torso'].map(label=>hashFile(`${run}/comparison-${label}.png`))),nativePair:{frame:'breath-090',before:await hashFile(`${run}/breath-090-dark-baseline.png`),after:await hashFile(`${run}/breath-090-dark-candidate.png`)},geometry:{width:W,height:H,fps:30,transform:'identity',temporalAdaptation:false},scene:await Promise.all([roomPath,tablePath].map(hashFile)),sources:await Promise.all(['runs/20261109-pamela-idle-pilot/original/pamela-breath-wan3.mp4','runs/20261109-pamela-idle-pilot/original/pamela-glance-wan3.mp4','runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4','runs/20261109-pamela-idle-composite/composition.json'].map(hashFile)),helpers:await Promise.all(['src/pamela-key.ts','src/pamela-contact-shadow.ts','src/pamela-finish-profile.ts','tools/pamela-finish-study.ts'].map(hashFile)),parameters:PAMELA_FINISH_PROFILE,sheets:{columns:['dark baseline','dark candidate','light baseline','light candidate'],rows:entries,rois},markerTest:{roi:{x:848,y:818,width:54,height:20},status:'Hypothetical test area only; no tray rendered and no complete trajectory validation.'},rawWhiteCardsRetained:true,results};
await writeFile(`${run}/profile.json`,JSON.stringify(profile,null,2)+'\n');
console.log(JSON.stringify(results.map(({contact,...r})=>r),null,2));
