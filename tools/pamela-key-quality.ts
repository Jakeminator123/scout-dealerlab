import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {keyPamelaFrame} from '../src/pamela-key.ts';

const root='runs/20261109-pamela-central-composite',out=`${root}/review/key-quality`;
await mkdir(out,{recursive:true});
const W=1762,H=1174,clamp=(v:number,a=0,b=1)=>Math.min(b,Math.max(a,v));
const frames=[
 {id:'approach000',source:`${root}/work/approach/frame-001.png`,composite:`${root}/qa/composite-000.png`},
 {id:'retreat089',source:'runs/20261109-pamela-sequence/qa/from-shoe/frame-090.png',composite:`${root}/qa/v2/composite-519.png`},
 {id:'deal100',source:'runs/20261109-pamela-sequence/qa/central-base/frame-101.png',composite:`${root}/qa/composite-185.png`}
];
const rois=[{id:'hair-ears',left:730,top:60,width:280,height:300},{id:'face-core',left:800,top:155,width:135,height:160},{id:'hands',left:630,top:745,width:510,height:150},{id:'forward-hand',left:640,top:800,width:280,height:280},{id:'shoe',left:1200,top:620,width:500,height:300},{id:'jacket',left:630,top:390,width:510,height:430}];
const stage=await sharp(`${root}/scene-assets/pamela-clean-room-v1.png`).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().raw().toBuffer();
const summary=[];
for(const f of frames){
 const source=await sharp(f.source).removeAlpha().raw().toBuffer();
 const old=await sharp(f.composite).removeAlpha().raw().toBuffer();
 const originalAlpha=new Float32Array(W*H),foreground=Buffer.alloc(W*H);
 const dominance=(p:number)=>source[p*3+1]-Math.max(source[p*3],source[p*3+2]);
 for(let p=0;p<W*H;p++){
  const d=dominance(p);originalAlpha[p]=d>8?clamp((52-d)/44):1;
  foreground[p]=d<8?1:0;
 }
 const keyStart=performance.now();
 const {rgb:fg,alpha:smooth}=keyPamelaFrame(source,W,H);
 const keyMilliseconds=performance.now()-keyStart;
 const rgba=Buffer.alloc(W*H*4),comp=Buffer.from(stage),matte=Buffer.alloc(W*H),oldMatte=Buffer.alloc(W*H);
 for(let p=0;p<W*H;p++){const a=smooth[p];matte[p]=Math.round(a*255);oldMatte[p]=Math.round(originalAlpha[p]*255);for(let c=0;c<3;c++){rgba[p*4+c]=fg[p*3+c];comp[p*3+c]=Math.round(fg[p*3+c]*a+comp[p*3+c]*(1-a));}rgba[p*4+3]=matte[p];}
 await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toFile(`${out}/${f.id}-candidate-rgba.png`);
 await sharp(comp,{raw:{width:W,height:H,channels:3}}).png().toFile(`${out}/${f.id}-candidate-on-room.png`);
 const metrics=[];
 for(const roi of rois){
  if(roi.id==='forward-hand'&&f.id!=='deal100')continue;
  const panels=[];for(const [id,data,channels] of [['original',source,3],['root',old,3],['candidate',comp,3],['legacy-alpha',oldMatte,1],['candidate-alpha',matte,1]] as [string,Buffer,1|3][]){
   const crop=await sharp(data,{raw:{width:W,height:H,channels}}).extract(roi).png().toBuffer();
   const label=Buffer.from(`<svg width="${roi.width}" height="25"><rect width="100%" height="100%" fill="#111"/><text x="6" y="18" fill="white" font-family="Arial" font-size="16">${id}</text></svg>`);
   const panel=await sharp(crop).extend({top:25,left:0,right:0,bottom:0,background:'#111'}).composite([{input:label,top:0,left:0}]).png().toBuffer();panels.push({input:panel,top:0,left:panels.length*roi.width});
  }
  await sharp({create:{width:roi.width*5,height:roi.height+25,channels:3,background:'#111'}}).composite(panels).png().toFile(`${out}/${f.id}-${roi.id}-native-comparison.png`);
  let core=0,changed=0,oldPartial=0,newPartial=0,oldAlphaSum=0,newAlphaSum=0;
  for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){const p=y*W+x;if(foreground[p]){core++;if(smooth[p]!==1||[0,1,2].some(c=>fg[p*3+c]!==source[p*3+c]))changed++;}if(originalAlpha[p]>0&&originalAlpha[p]<1)oldPartial++;if(smooth[p]>0&&smooth[p]<1)newPartial++;oldAlphaSum+=originalAlpha[p];newAlphaSum+=smooth[p];}
  metrics.push({roi,confidentForegroundPixels:core,confidentForegroundEdgeChanged:changed,oldPartialPixels:oldPartial,newPartialPixels:newPartial,oldCoverage:oldAlphaSum,newCoverage:newAlphaSum});
 }
 const interiorChecks=[];
 for(const box of [{id:'shoe-grey-interior',x:1430,y:755,w:200,h:45},{id:'jacket-left-interior',x:730,y:520,w:60,h:100},...(f.id==='retreat089'?[{id:'reported-jacket-hole',x:718,y:646,w:9,h:12}]:[])]){let transparentPixels=0,minAlpha=1;for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){const a=smooth[y*W+x];if(a<.999)transparentPixels++;minAlpha=Math.min(minAlpha,a);}interiorChecks.push({...box,transparentPixels,minAlpha});}
 summary.push({...f,keyMilliseconds,sourceSha256:createHash('sha256').update(await readFile(f.source)).digest('hex'),compositeSha256:createHash('sha256').update(await readFile(f.composite)).digest('hex'),metrics,interiorChecks});
}
await writeFile(`${out}/measurements.json`,JSON.stringify({createdAt:new Date().toISOString(),helperSha256:createHash('sha256').update(await readFile('src/pamela-key.ts')).digest('hex'),canvas:{width:W,height:H},method:'src/pamela-key.ts: RGB mixture solve within6px, integral foreground skip, partial-edge20% cross-neighbour feather, exact d<8 core. Additional opaque dark neutral class d<28/g<150/maxRB>0.65g or g<40/d<30 with mild despill. Legacy-alpha panel is the original8..52 dominance formula, not a reconstructed alpha from the root RGB image. No geometry changes. Not temporal QA.',summary},null,2));
console.log(JSON.stringify(summary.map(s=>({id:s.id,metrics:s.metrics})),null,2));
