import{readFile,writeFile,mkdir}from'node:fs/promises';
import sharp from'sharp';
import assert from'node:assert/strict';
import{openFrozenMaterialTrack,materialHash as hash}from'../src/pamela-frozen-material-track.ts';
import{keyPamelaFrame}from'../src/pamela-key.ts';
import{keyPamelaFrameWithPaper}from'../src/pamela-key-paper.ts';
const W=1762,H=1174,run='runs/20261109-pamela-paper-edge/take-01',registry=JSON.parse(await readFile('references/pamela-material-selections.json','utf8'));
await mkdir('runs/20261109-pamela-paper-edge',{recursive:true});await mkdir(run);const records=[];
for(const seat of[1,3,7]){
 const track=await openFrozenMaterialTrack(registry.entries.find((e:any)=>e.id===`C2-P${seat}`));
 for(const frame of seat===1?[110,350]:seat===3?[238]:[84,180,350]){
  const f=await track.frame(frame),old=keyPamelaFrame(f.printed,W,H);for(let p=0;p<W*H;p++){const a=f.paper[p]/255;if(a===1){old.alpha[p]=1;for(let c=0;c<3;c++)old.rgb[p*3+c]=f.printed[p*3+c];}else if(a>old.alpha[p])old.alpha[p]=a;}
  const after=keyPamelaFrameWithPaper(f.printed,W,H,f.paper,f.original),baseline=keyPamelaFrame(f.printed,W,H),reference=keyPamelaFrame(f.original,W,H),beforeRgb=Buffer.alloc(W*H*3),afterRgb=Buffer.alloc(W*H*3);let outsideChanged=0,protectedCoreChanged=0;
  for(let p=0;p<W*H;p++){
   if(!f.paper[p]){if(after.alpha[p]!==baseline.alpha[p])outsideChanged++;for(let c=0;c<3;c++)if(after.rgb[p*3+c]!==baseline.rgb[p*3+c])outsideChanged++;}
   if(f.paper[p]===255&&f.original[p*3+1]-Math.max(f.original[p*3],f.original[p*3+2])<=25){if(after.alpha[p]!==1)protectedCoreChanged++;for(let c=0;c<3;c++)if(after.rgb[p*3+c]!==f.printed[p*3+c])protectedCoreChanged++;}
   for(let c=0;c<3;c++){const bg=[18,35,30][c];beforeRgb[p*3+c]=Math.round(bg*(1-old.alpha[p])+old.rgb[p*3+c]*old.alpha[p]);afterRgb[p*3+c]=Math.round(bg*(1-after.alpha[p])+after.rgb[p*3+c]*after.alpha[p]);}
  }
  assert.equal(outsideChanged,0);assert.equal(protectedCoreChanged,0);
  const roi=seat===1?{left:110,top:970,width:180,height:140}:seat===3?{left:610,top:960,width:150,height:140}:{left:1510,top:970,width:170,height:140};
  const path=`${run}/P${seat}-${frame}.png`;await sharp({create:{width:roi.width*3,height:roi.height,channels:3,background:'#17212a'}}).composite(await Promise.all([f.original,beforeRgb,afterRgb].map(async(b,i)=>({input:await sharp(b,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),left:i*roi.width,top:0})))).png().toFile(path);
  const witness=frame===350&&(seat===1||seat===7)?(seat===1?[223,989]:[1650,1051]):null,p=witness?witness[1]*W+witness[0]:null;
  records.push({seat,frame,selection:track.selection,checks:{outsideChanged,protectedCoreChanged,...after.verification},witness:p===null?null:{xy:witness,paper:f.paper[p],raw:[...f.original.subarray(p*3,p*3+3)],oldAlpha:old.alpha[p],referenceAlpha:reference.alpha[p],newAlpha:after.alpha[p],newRgb:[...after.rgb.subarray(p*3,p*3+3)]},proof:{path,sha256:hash(await readFile(path))}});
 }
}
await writeFile(run+'/evidence.json',JSON.stringify({columns:['Source','Old semantic key','Source-aware mixed-edge key'],records,code:await Promise.all(['tools/pamela-paper-edge-probe.ts','src/pamela-key-paper.ts','src/pamela-frozen-material-track.ts'].map(async path=>({path,sha256:hash(await readFile(path))}))),productionAccepted:false},null,2));console.log(JSON.stringify({run,records:records.map(r=>({seat:r.seat,frame:r.frame,witness:r.witness,checks:r.checks}))}));
