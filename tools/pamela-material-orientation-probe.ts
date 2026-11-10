/** Verify one fixed artwork orientation across both sources without changing masks. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp,{type OverlayOptions} from 'sharp';
import {openFrozenMaterialTrack,materialHash as hash} from '../src/pamela-frozen-material-track.ts';
const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6);assert.ok(run&&run.startsWith('runs/'));
const registry=JSON.parse(await readFile('references/pamela-material-selections.json','utf8'));
const surfaces=JSON.parse(await readFile('runs/20261109-pamela-c2-card-surfaces/take-01/surfaces.json','utf8'));
const first=JSON.parse(await readFile('runs/20261109-pamela-bank-sequence/take-03/plan.json','utf8'));
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
await mkdir(run);const records:any[]=[],tiles:OverlayOptions[]=[];
for(let seat=1;seat<=7;seat++){
 const c1=registry.entries.find((e:any)=>e.id===`C1-P${seat}`),c2=registry.entries.find((e:any)=>e.id===`C2-P${seat}`),texture=surfaces.results.find((s:any)=>s.seat===seat).layers[0].material;
 const old=await openFrozenMaterialTrack({...c1,canonicalUvQuarterTurns:0},texture),next=await openFrozenMaterialTrack(c1,texture),second=await openFrozenMaterialTrack(c2);
 const b=first.jobs.find((j:any)=>j.seat===seat).landed.layer.bounds;
 const roi={left:Math.max(0,b.left-16),top:Math.max(0,b.top-16),width:b.width+32,height:b.height+32};
 const inputs=[{track:old,frame:350,label:'before'},{track:next,frame:350,label:'canonical'},{track:second,frame:0,label:'C2-start'}];
 let previousPaper:Buffer|undefined;
 for(let col=0;col<inputs.length;col++){
  const {track,frame,label}=inputs[col],f=await track.frame(frame);
  if(col===0)previousPaper=f.paper;if(col===1)assert.deepEqual(f.paper,previousPaper,'Orientation changed coverage');
  const path=`${run}/P${seat}-${label}.png`;await sharp(f.printed,{raw:{width:1762,height:1174,channels:3}}).png().toFile(path);
  const tile=await sharp(f.printed,{raw:{width:1762,height:1174,channels:3}}).extract(roi).resize(200,170,{fit:'contain',background:'#171c22'}).png().toBuffer();
  tiles.push({input:tile,left:col*200,top:(seat-1)*170});records.push({seat,label,frame,selection:track.selection,verification:f.verification,output:await ref(path)});
 }
 if(seat<=3)for(const frame of [79,94,99,102,117,150,180,250,359]){const f=await next.frame(frame),path=`${run}/P${seat}-motion-${frame}.png`;await sharp(f.printed,{raw:{width:1762,height:1174,channels:3}}).png().toFile(path);records.push({seat,label:'canonical-motion',frame,verification:f.verification,output:await ref(path)});}
}
await sharp({create:{width:600,height:1190,channels:3,background:'#171c22'}}).composite(tiles).png().toFile(run+'/joins.png');
await writeFile(run+'/evidence.json',JSON.stringify({columns:['Before C1 f350','Canonical C1 f350','Same C1 in C2 f0'],rows:[1,2,3,4,5,6,7],records,code:await Promise.all(['tools/pamela-material-orientation-probe.ts','src/pamela-frozen-material-track.ts','src/pamela-paper-material.ts'].map(ref)),registry:await ref('references/pamela-material-selections.json'),newApiJobs:0,productionAccepted:false},null,2));
console.log(JSON.stringify({run,records:records.length,coverageUnchanged:7}));
