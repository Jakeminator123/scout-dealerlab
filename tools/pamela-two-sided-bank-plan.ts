/** Freeze geometry, display schedules and an explicit DEMO engine fixture.
 * This does not call a provider, choose game cards, or modify the old bank. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {materialHash as hash,checkedMaterialBytes,type FrozenRef} from '../src/pamela-frozen-material-track.ts';
import {validateBankSidePolicy,type BankSurfaceSelection} from '../src/pamela-bank-card-surfaces.ts';
import {P1_SIDE_POLICY} from '../src/pamela-p1-side-calibration.ts';
import {proofCardFrontSvg} from '../src/pamela-proof-card-designs.ts';
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7);assert.match(take??'',/^\d\d$/);
const run=`runs/20261110-pamela-two-sided-bank/take-${take}`,ref=async(path:string):Promise<FrozenRef>=>({path,sha256:hash(await readFile(path))});
const baseRef=await ref('runs/20261109-pamela-material-bank/plans/take-03.json'),base=JSON.parse((await checkedMaterialBytes(baseRef)).toString());
const survey=await ref('runs/20261109-pamela-side-bank-survey/review.json'),inputsRef=await ref('runs/20261109-pamela-c2-motion-track/take-01/inputs.json'),inputs=JSON.parse((await checkedMaterialBytes(inputsRef)).toString());
const proofs:Record<number,string>={1:'runs/20261110-pamela-p1-side-calibration/take-01/evidence.json',2:'runs/20261109-pamela-p2-card-calibration/take-05/evidence.json',3:'runs/20261109-pamela-p3-card-calibration/take-02/evidence.json',4:'runs/20261109-pamela-card-atlas/take-03/evidence.json',5:'runs/20261109-pamela-p5-card-calibration/take-03/evidence.json'};
const passages:Record<number,[number,number]>={2:[79,89],3:[52,67],4:[98,99],5:[88,94]},selections:BankSurfaceSelection[]=[];
for(const selection of base.selections){
 const e=JSON.parse((await checkedMaterialBytes(selection.evidence)).toString()),seat=Number(selection.id.at(-1)),calibrated=selection.id.startsWith('C2')&&seat<=5;
 const basis=calibrated?await ref(proofs[seat]):survey;
 const segments=calibrated?(seat===1?P1_SIDE_POLICY.segments.map(s=>({...s})):[{start:0,end:passages[seat][0],side:'BACK' as const},{start:passages[seat][0],end:passages[seat][1],side:'EDGE' as const},{start:passages[seat][1],end:360,side:'FRONT' as const}]):[{start:0,end:360,side:'FRONT' as const}];
 const s:BankSurfaceSelection={...selection,sidePolicy:{sourceSha256:e.source.sha256,physicalSide:'UNKNOWN',segments,basis}};
 if(selection.id.startsWith('C2'))s.firstQuad=inputs.jobs.find((j:{seat:number})=>j.seat===seat).static.quads.c1;
 if(calibrated)s.calibration={evidence:basis,code:await ref(seat===1?'src/pamela-p1-side-calibration.ts':`src/pamela-p${seat}-card-calibration.ts`)};
 if(calibrated&&seat===4)s.calibration!.renderEvidence=await ref('runs/20261109-pamela-two-sided-flip/take-03/evidence.json');
 validateBankSidePolicy(s.sidePolicy,e.source.sha256);selections.push(s);
}
const values=[['AC','KH'],['2C','QD'],['3S','JH'],['4C','10D'],['5S','9H'],['6C','8D'],['7S','AS']];
await mkdir('runs/20261110-pamela-two-sided-bank',{recursive:true});await mkdir(run);await mkdir(run+'/assets');await mkdir(run+'/snapshot');sharp.concurrency(1);
const front:Record<string,Record<string,FrozenRef>>={classic:{},ivory:{}},back:Record<string,FrozenRef>={};
for(const style of ['classic','ivory'])for(const value of values.flat()){const path=`${run}/assets/${style}-${value}.png`;await sharp(Buffer.from(proofCardFrontSvg(value,style==='ivory'))).removeAlpha().png().toFile(path);front[style][value]=await ref(path);}
for(const design of ['sg','blue']){const path=`${run}/assets/${design}-back.png`;await copyFile(`runs/20261109-pamela-two-sided-flip/take-03/assets/${design}-back.png`,path);back[design]=await ref(path);}
const engineFixture=values.flatMap((pair,seat)=>pair.map((cardId,index)=>({slotId:`C${index+1}-P${seat+1}`,cardId,frontAllowed:true})));assert.equal(new Set(engineFixture.map(s=>s.cardId)).size,14);
const firstPlan=JSON.parse((await checkedMaterialBytes(base.firstPlan)).toString()),scene=firstPlan.jobs[0].scene;for(const asset of scene)await checkedMaterialBytes(asset);
const codePaths=['tools/pamela-two-sided-bank-plan.ts','tools/pamela-two-sided-bank-render.ts','src/pamela-bank-card-surfaces.ts','src/pamela-frozen-material-track.ts','src/pamela-paper-material.ts','src/pamela-edge-card-track.ts','src/pamela-two-sided-card.ts','src/pamela-proof-card-designs.ts','src/pamela-key-paper.ts','src/pamela-key.ts',...Object.keys(proofs).map(s=>s==='1'?'src/pamela-p1-side-calibration.ts':`src/pamela-p${s}-card-calibration.ts`)];
const code=[];for(const path of codePaths){code.push(await ref(path));await copyFile(path,run+'/snapshot/'+path.replaceAll('/','__'));}
const plan={...base,schemaVersion:2,run,basePlan:baseRef,geometryInputs:inputsRef,selections,scene,artwork:{front,back},designs:[{id:'sg-classic',front:'classic',back:'sg'},{id:'blue-ivory',front:'ivory',back:'blue'}],renderDesign:'sg-classic',engineFixture:{kind:'explicit-demonstration-only',realGameValues:false,signals:engineFixture},code,limitations:['Blank original semantic side UNKNOWN; display schedules are authored','C1 and C2 P6/P7 show a continuous broad face; no invented turn','P1 two passages are a limited optical candidate with a protected grip and mixed edge at115–118','Old outer idle/ready seams retained; new bridge is not accepted','No production engine, GPU or interchangeable shoe claim for this bank']};
await writeFile(run+'/plan.json',JSON.stringify(plan,null,2),{flag:'wx'});console.log(JSON.stringify({run,plan:await ref(run+'/plan.json'),slots:14,designs:2,paidJobs:0}));
