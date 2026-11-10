/** Freeze a complete selected presentation bank; incomplete registries cannot render. */
import{readFile,writeFile,mkdir}from'node:fs/promises';
import assert from'node:assert/strict';
import{materialHash as hash,checkedMaterialBytes}from'../src/pamela-frozen-material-track.ts';
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7);assert.match(take??'',/^\d\d$/);
const registryPath='references/pamela-material-selections.json',registryBytes=await readFile(registryPath),registry=JSON.parse(registryBytes.toString());
assert.equal(registry.presentationOnly,true);assert.equal(registry.dealerId,'pamela');assert.equal(registry.project,'snyggare-dealer');
const order=[1,2].flatMap(pass=>[1,2,3,4,5,6,7].map(seat=>`C${pass}-P${seat}`));assert.deepEqual(registry.entries.map((e:any)=>e.id),order);
const missing=registry.entries.filter((e:any)=>e.status!=='integration-candidate');if(missing.length){console.log(JSON.stringify({prepared:false,pending:missing.map((e:any)=>e.id)}));process.exitCode=1;}else{
 for(const entry of registry.entries){await checkedMaterialBytes(entry.evidence);await checkedMaterialBytes(entry.review);}
 const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
 const registrySnapshot=`runs/20261109-pamela-material-bank/plans/take-${take}-selections.json`;await mkdir('runs/20261109-pamela-material-bank/plans',{recursive:true});await writeFile(registrySnapshot,registryBytes,{flag:'wx'});
 const plan={schemaVersion:1,project:'snyggare-dealer',dealerId:'pamela',presentationOnly:true,productionAccepted:false,width:1762,height:1174,fps:30,run:`runs/20261109-pamela-material-bank/take-${take}`,registry:{path:registrySnapshot,sha256:hash(registryBytes)},selections:registry.entries.map(({id,kind,evidence,review,canonicalUvQuarterTurns}:any)=>({id,kind,evidence,review,canonicalUvQuarterTurns:canonicalUvQuarterTurns??0})),firstPlan:await ref('runs/20261109-pamela-bank-sequence/take-03/plan.json'),secondPlan:await ref('runs/20261109-pamela-c2-bank-sequence/take-01/plan.json'),surfaces:await ref('runs/20261109-pamela-c2-card-surfaces/take-01/surfaces.json'),trim:await ref('runs/20261109-pamela-fourteen-trim/take-01/evidence.json'),outerPlan:await ref('runs/20261109-pamela-fourteen-full-loop/take-01/plan.json'),outerSourceGate:await ref('runs/20261109-pamela-fourteen-full-loop/take-01/source-gate.json')};
 await mkdir('runs/20261109-pamela-material-bank/plans',{recursive:true});const path=`runs/20261109-pamela-material-bank/plans/take-${take}.json`,bytes=Buffer.from(JSON.stringify(plan,null,2));await writeFile(path,bytes,{flag:'wx'});console.log(JSON.stringify({prepared:true,path,sha256:hash(bytes),selections:14}));
}
