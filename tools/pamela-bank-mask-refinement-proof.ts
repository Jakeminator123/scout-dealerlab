/** New local evidence only; no frozen mask/plan writes and no API work. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {openBankCardSurfaces,type BankMaterials,type BankEngineSignal} from '../src/pamela-bank-card-surfaces.ts';
import {refinePamelaBankPaperMask,type PamelaBankMaskRefinementId} from '../src/pamela-bank-mask-refinements.ts';
const runTake=process.argv.find(a=>a.startsWith('--take='))?.slice(7);assert.match(runTake??'',/^\d\d$/);
const survey=process.argv.includes('--survey'),video=process.argv.includes('--video'),root=`runs/20261110-pamela-bank-mask-refinements/take-${runTake}`,W=1762,H=1174,N=W*H,S=240;
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const checked=async(r:any)=>{const b=await readFile(r.path);assert.equal(hash(b),r.sha256,r.path);return b;};
const planRef={path:'runs/20261110-pamela-two-sided-bank/take-02/plan.json',sha256:'0bc91fb10ba7c77fa9ea4b2a121f8c14be9edffeceb19420849fc2753e443223'},plan=JSON.parse((await checked(planRef)).toString());
const code=await Promise.all(['src/pamela-bank-mask-refinements.ts','tools/pamela-bank-mask-refinement-proof.ts','src/pamela-bank-card-surfaces.ts','src/pamela-paper-material.ts','src/pamela-two-sided-card.ts','src/pamela-edge-card-track.ts'].map(ref));
await mkdir('runs/20261110-pamela-bank-mask-refinements',{recursive:true});await mkdir(root);await mkdir(root+'/code');
for(const c of code)await copyFile(c.path,root+'/code/'+c.path.replaceAll('/','__'));
sharp.concurrency(1);
const signal=new Map<string,BankEngineSignal>(plan.engineFixture.signals.map((s:any)=>[s.slotId,{cardId:s.cardId,frontAllowed:s.frontAllowed}]));
const designs:{id:string;materials:BankMaterials}[]=[];
const tex=async(r:any)=>{const b=await checked(r),{data,info}=await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true});return{rgb:data,width:info.width,height:info.height,id:r.sha256};};
for(const d of plan.designs){const front=new Map();for(const cid of ['7S','8D','6C'])front.set(cid,await tex(plan.artwork.front[d.front][cid]));designs.push({id:d.id,materials:{back:await tex(plan.artwork.back[d.back]),front}});}
const label=(s:string,w=1200)=>Buffer.from(`<svg width="${w}" height="24"><rect width="100%" height="100%" fill="#14212b"/><text x="6" y="17" fill="white" font-family="Arial" font-size="13">${s}</text></svg>`);
const results:any[]=[];
for(const id of ['C1-P7','C2-P6']as PamelaBankMaskRefinementId[]){
 const selection=plan.selections.find((s:any)=>s.id===id),track=await openBankCardSurfaces(selection),motion=id==='C1-P7'?[74,112]:[102,132],selectedEvidence=JSON.parse((await checked(selection.evidence)).toString()),selectedRecords=selectedEvidence.frames??selectedEvidence.records;
 await mkdir(root+'/'+id);await mkdir(root+'/'+id+'/motion');await mkdir(root+'/'+id+'/masks');
 const numbers=survey?Array.from({length:motion[1]-motion[0]+1},(_,i)=>motion[0]+i):Array.from({length:360},(_,i)=>i),records:any[]=[];let motionIndex=0;
 for(const f of numbers){
  const native=await track.geometryFrame(f),moving=native.geometry.at(-1)!,prior=id==='C2-P6'?native.geometry[0].coverage:undefined,beforeHash=hash(moving.coverage),guardHash=hash(moving.guard),priorHash=prior?hash(prior):null,sourceHash=hash(native.original);
  const result=refinePamelaBankPaperMask({id,sourceSha256:track.source.sha256,frame:f,sourceRgb:native.original,coverage:moving.coverage,guard:moving.guard,previousCardCoverage:prior});
  assert.equal(hash(moving.coverage),beforeHash);assert.equal(hash(moving.guard),guardHash);assert.equal(prior?hash(prior):null,priorHash);assert.equal(hash(native.original),sourceHash);
  const geometry=native.geometry.map((g,i)=>i===native.geometry.length-1?{...g,coverage:result.coverage,bounds:result.bounds}:g),after={...native,geometry};
  let guardChanges=0,priorChanges=0,changed=0,minRemoved=255,maxRemoved=0;const removedPoints:number[]=[];
  for(let p=0;p<N;p++)if(result.coverage[p]!==moving.coverage[p]){changed++;if(moving.guard[p])guardChanges++;if(prior?.[p])priorChanges++;if(result.coverage[p]<moving.coverage[p]){const k=p*3,m=Math.min(native.original[k],native.original[k+1],native.original[k+2]);minRemoved=Math.min(minRemoved,m);maxRemoved=Math.max(maxRemoved,m);if(removedPoints.length<4)removedPoints.push(p);}}
  assert.equal(guardChanges,0);assert.equal(priorChanges,0);
  const record:any={frame:f,sourceRgbSha256:sourceHash,beforeCoverageSha256:beforeHash,afterCoverageSha256:hash(result.coverage),guardSha256:guardHash,priorSha256:priorHash,changedPixels:changed,addedPixels:result.addedPixels,removedPixels:result.removedPixels,adjustedPixels:result.adjustedPixels,guardChanges,priorChanges,minRemoved:changed?minRemoved:null,maxRemoved:changed?maxRemoved:null,bounds:result.bounds};
  if(f>=motion[0]&&f<=motion[1]){
   const q=selectedRecords[f],quad=q.record?.quad??q.quad;
   const cx=quad.reduce((s:number,p:number[])=>s+p[0],0)/4,cy=quad.reduce((s:number,p:number[])=>s+p[1],0)/4,roi={left:Math.max(0,Math.min(W-S,Math.round(cx-S/2))),top:Math.max(0,Math.min(H-S,Math.round(cy-S/2))),width:S,height:S};
   const crop=async(rgb:Uint8Array)=>sharp(rgb,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer(),tiles:any[]=[{input:label(`${id} native f${f}: SOURCE | SG before | SG refined | BLUE-IVORY before | BLUE-IVORY refined`),left:0,top:0},{input:await crop(native.original),left:0,top:24}],render=[];
   for(const[d,design]of designs.entries()){
    const a=await track.paint(native,design.materials,signal),b=await track.paint(after,design.materials,signal);let protectedDifference=0,priorDifference=0,outsideUnion=0;
    for(let p=0;p<N;p++){const k=p*3,diff=a.printed[k]!==b.printed[k]||a.printed[k+1]!==b.printed[k+1]||a.printed[k+2]!==b.printed[k+2];if(diff){if(moving.guard[p])protectedDifference++;if(prior?.[p])priorDifference++;if(!moving.coverage[p]&&!result.coverage[p])outsideUnion++;}}
    assert.equal(protectedDifference,0);assert.equal(priorDifference,0);assert.equal(outsideUnion,0);
    const witnessCoordinates=id==='C1-P7'&&f===86?[[1375,755],[1373,753],[1377,737]]:id==='C2-P6'&&f===117?[[1220,712],[1224,710]]:[];
    const witnesses=witnessCoordinates.map(([x,y])=>{const p=y*W+x,k=p*3;return{native:[x,y],sourceRgb:[...native.original.subarray(k,k+3)],beforeRgb:[...a.printed.subarray(k,k+3)],afterRgb:[...b.printed.subarray(k,k+3)],afterPaper:b.paper[p]};});
    tiles.push({input:await crop(a.printed),left:(d*2+1)*S,top:24},{input:await crop(b.printed),left:(d*2+2)*S,top:24});render.push({design:design.id,beforeRgbSha256:hash(a.printed),afterRgbSha256:hash(b.printed),protectedDifference,priorDifference,outsideUnion,witnesses});
   }
   const output=`${root}/${id}/motion/frame-${String(motionIndex++).padStart(4,'0')}.png`;await sharp({create:{width:S*5,height:S+24,channels:3,background:'#14212b'}}).composite(tiles).png().toFile(output);record.motion={...await ref(output),roi,render};
   const maskRgb=(coverage:Uint8Array)=>{const a=Buffer.alloc(N*3);for(let p=0;p<N;p++){a[p*3+1]=coverage[p];a[p*3+2]=moving.guard[p];}return a;};
   const mp=`${root}/${id}/masks/frame-${String(f).padStart(4,'0')}.png`;await sharp({create:{width:S*3,height:S+24,channels:3,background:'#14212b'}}).composite([{input:label(`${id} f${f}: SOURCE | PAPER+GUARD before | refined`,720),left:0,top:0},{input:await crop(native.original),left:0,top:24},{input:await crop(maskRgb(moving.coverage)),left:S,top:24},{input:await crop(maskRgb(result.coverage)),left:S*2,top:24}]).png().toFile(mp);record.maskPanel=await ref(mp);
  }
  if((id==='C1-P7'&&f===86)||(id==='C2-P6'&&f===117)){const points=id==='C1-P7'?[[1375,755],[1373,753],[1377,737],[1366,745]]:[[1220,712],[1224,710],[1234,700],[1235,698]];record.witnesses=points.map(([x,y])=>{const p=y*W+x;return{native:[x,y],sourceRgb:[...native.original.subarray(p*3,p*3+3)],before:moving.coverage[p],after:result.coverage[p],guard:moving.guard[p],prior:prior?.[p]??0};});}
  records.push(record);if(f%90===89)console.log(JSON.stringify({id,frames:f+1}));
 }
 const maskContacts=[];const panelRecords=records.filter(r=>r.maskPanel);for(let i=0;i<panelRecords.length;i+=6){const batch=panelRecords.slice(i,i+6),path=`${root}/${id}/masks-${batch[0].frame}-${batch.at(-1).frame}.png`;await sharp({create:{width:1440,height:Math.ceil(batch.length/2)*264,channels:3,background:'#14212b'}}).composite(await Promise.all(batch.map(async(r:any,j:number)=>({input:await checked(r.maskPanel),left:j%2*720,top:Math.floor(j/2)*264})))).png().toFile(path);maskContacts.push(await ref(path));}
 let movie=null;if(video){const path=`${root}/${id}/motion-proof.mp4`;await promisify(execFile)('ffmpeg',['-v','error','-nostdin','-n','-threads','1','-framerate','30','-i',`${root}/${id}/motion/frame-%04d.png`,'-frames:v',String(motionIndex),'-an','-c:v','libx264','-preset','fast','-crf','15','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',path],{windowsHide:true});movie={...await ref(path),fps:30,frames:motionIndex,width:1200,height:264,content:'Tracked native crop; not a complete scene or all-frame playback'};}
 const rp=`${root}/${id}/records.json`;await writeFile(rp,JSON.stringify({id,source:track.source,selection,records,movie},null,2),{flag:'wx'});results.push({id,source:track.source,selection,records:await ref(rp),frames:records.length,changedFrames:records.filter(r=>r.changedPixels).map(r=>({frame:r.frame,changed:r.changedPixels,added:r.addedPixels,removed:r.removedPixels,adjusted:r.adjustedPixels})),motionFrames:motion,maskContacts,movie,witnesses:records.filter(r=>r.witnesses).map(r=>({frame:r.frame,points:r.witnesses}))});console.log(JSON.stringify({completed:id,changedFrames:results.at(-1).changedFrames}));
}
for(const c of code)await checked(c);await checked(planRef);
await writeFile(root+'/evidence.json',JSON.stringify({createdAt:new Date().toISOString(),status:'AWAITING_NATIVE_REVIEW',mode:survey?'bounded-survey':'all-360-mask-invariants',plan:planRef,code,results,verification:{sourceFrames:results.reduce((s,r)=>s+r.frames,0),sourceMaskInputsUnchanged:true,guardPixelChanges:0,priorCardPixelChanges:0,sourcePixelsUnchanged:true,sidesUnchanged:true,newApiJobs:0,mediaWorkers:1},limitations:['No physical side identity inferred.','Optical review is limited to listed native windows; all360 checks cover mask invariants, not all-frame visual acceptance.','MP4 is a visual aid; exact comparisons use native PNG/RGB and coverage hashes.'],productionAccepted:false},null,2),{flag:'wx'});
console.log(JSON.stringify({evidence:await ref(root+'/evidence.json')}));
