import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {checkedMaterialBytes,materialHash as hash,type FrozenRef} from '../src/pamela-frozen-material-track.ts';
import {openBankCardSurfaces,type BankMaterials,type BankEngineSignal,type BankSurfaceSelection} from '../src/pamela-bank-card-surfaces.ts';
const arg=(key:string)=>process.argv.find(a=>a.startsWith(key+'='))?.slice(key.length+1),path=arg('--plan'),sha256=arg('--plan-sha256');assert.ok(path&&sha256);
const planRef={path,sha256},plan=JSON.parse((await checkedMaterialBytes(planRef)).toString());for(const c of plan.code)await checkedMaterialBytes(c);
const run=plan.run+'/preflight';await mkdir(run);await copyFile('tools/pamela-two-sided-bank-preflight.ts',run+'/runner.ts');sharp.concurrency(1);
const texture=async(ref:FrozenRef)=>{const{data,info}=await sharp(await checkedMaterialBytes(ref)).removeAlpha().raw().toBuffer({resolveWithObject:true});return{rgb:data,width:info.width,height:info.height,id:ref.sha256};};
const designs:BankMaterials[]=await Promise.all(plan.designs.map(async(d:any)=>({back:await texture(plan.artwork.back[d.back]),front:new Map(await Promise.all(Object.entries(plan.artwork.front[d.front] as Record<string,FrozenRef>).map(async([id,r])=>[id,await texture(r)] as const)))})));
const signals=new Map<string,BankEngineSignal>(plan.engineFixture.signals.map((s:any)=>[s.slotId,{cardId:s.cardId,frontAllowed:s.frontAllowed}])),unknown=new Map([...signals].map(([id])=>[id,{cardId:'UNBOUND',frontAllowed:true}])),denied=new Map([...signals].map(([id,s])=>[id,{...s,frontAllowed:false}]));
const extra:Record<string,number[]>={'C2-P1':[60,62,63,82,83,103,104,113,114,118,119,124,140,145],'C2-P2':[75,76,78,79,88,89],'C2-P3':[51,52,53,66,67],'C2-P4':[83,84,97,98,99],'C2-P5':[85,86,87,88,93,94]};
const checks:any[]=[],images:any[]=[];let gateCases=0;
for(const selection of plan.selections as BankSurfaceSelection[]){
 const track=await openBankCardSurfaces(selection),frames=[...new Set([0,85,99,118,350,359,...(extra[selection.id]??[])])].sort((a,b)=>a-b);
 for(const f of frames){const native=await track.geometryFrame(f),variants=[];
  for(const [i,materials]of designs.entries()){
   const output=await track.paint(native,materials,signals);variants.push({design:plan.designs[i].id,states:output.states,...output.verification});
   if(f===350||extra[selection.id]?.includes(f)){
    const target=native.geometry.at(-1)!,b=target.bounds,cx=b.left+b.width/2,cy=b.top+b.height/2,roi={left:Math.max(0,Math.min(1762-280,Math.round(cx-140))),top:Math.max(0,Math.min(1174-280,Math.round(cy-140))),width:280,height:280};
    const image=`${run}/${selection.id}-${String(f).padStart(3,'0')}-${plan.designs[i].id}.png`;await sharp(output.printed,{raw:{width:1762,height:1174,channels:3}}).extract(roi).resize(560,560,{kernel:'nearest'}).png().toFile(image);images.push({id:selection.id,frame:f,design:plan.designs[i].id,path:image,sha256:hash(await readFile(image)),roi});
   }
  }
  // Exact raster equivalence: absent/unknown identities conceal to the same
  // source-bound backs as an explicit denied permission, in both P1 FRONTs.
  if(f===0||f===350||(selection.id==='C2-P1'&&[82,104,119].includes(f))){
   const revoke=await track.paint(native,designs[0],denied),missing=await track.paint(native,designs[0],new Map()),unbound=await track.paint(native,designs[0],unknown);
   assert.equal(hash(revoke.printed),hash(missing.printed));assert.equal(hash(revoke.printed),hash(unbound.printed));gateCases+=3;
   for(const state of revoke.states as {physicalSide:string;displayedSide:string}[])assert.notEqual(state.displayedSide,'FRONT');
  }
  checks.push({id:selection.id,frame:f,variants});
 }
 console.log(JSON.stringify({id:selection.id,frames:frames.length,gateCases}));
}
for(const c of plan.code)await checkedMaterialBytes(c);await checkedMaterialBytes(planRef);
await writeFile(run+'/evidence.json',JSON.stringify({status:'native-material-preflight-passed',plan:planRef,code:{path:'tools/pamela-two-sided-bank-preflight.ts',sha256:hash(await readFile('tools/pamela-two-sided-bank-preflight.ts'))},checks,images,verification:{frames:checks.length,designFrames:checks.length*2,gateCases,protectedChanges:0,outsidePaperChanges:0},limits:['Sparse preflight, not all5040 native frames or continuous optical acceptance','C1 no-turn sources use explicit FRONT demonstration; engine can conceal','Semantic identity of original blank papers UNKNOWN'],newPaidJobs:0,productionAccepted:false},null,2));
console.log(JSON.stringify({run,frames:checks.length,designFrames:checks.length*2,gateCases,images:images.length}));
