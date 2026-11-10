import{readFile,writeFile,mkdir,rename}from'node:fs/promises';
import{createHash}from'node:crypto';
import{readPamelaC2Catalog}from'../src/pamela-c2-bank-catalog.ts';
import{validateMotionContract,listMissingClips,type MotionContract,type MotionAsset}from'../src/pamela-motion-contract.ts';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),file='references/pamela-motion-contract.json',before=await readFile(file,'utf8'),contract=JSON.parse(before)as MotionContract;
if(validateMotionContract(contract).length)throw Error('Existing contract is invalid');
const candidates=await readPamelaC2Catalog();if(candidates.some(c=>c.status!=='raw-candidate'))throw Error('All seven completed C2 reviews required');
const changed=new Set<string>();
for(const c of candidates){
 if(!c.source||!c.reviewPath)throw Error('Missing candidate');
 const bytes=await readFile(c.source.path);if(hash(bytes)!==c.source.sha256)throw Error('Changed C2 source');
 const reviewBytes=await readFile(c.reviewPath),review=JSON.parse(reviewBytes.toString());
 const plan=JSON.parse(await readFile(review.plan.path,'utf8')),anchor=plan.jobs.find((j:any)=>j.seat===c.seat),first=contract.clips.find(n=>n.id===`deal.seat-${c.seat}.first`);
 if(hash(await readFile(review.plan.path))!==review.plan.sha256||anchor.provenance.sourceSha256!==first?.binding?.sha256)throw Error('C1/C2 provenance mismatch');
 const asset:MotionAsset={id:`seat${c.seat}-c2-bank-v2-raw`,path:c.source.path,sha256:c.source.sha256,kind:'video',width:1762,height:1174,fps:30,frames:360,role:'Second-card raw motion candidate; source contains existing C1 and moving C2. Keep source C1 separate from caller overlay. No runtime approval.'};
 const existing=contract.assets.find(a=>a.id===asset.id);if(existing&&(existing.path!==asset.path||existing.sha256!==asset.sha256))throw Error('Asset identity collision');if(!existing)contract.assets.push(asset);
 const clip=contract.clips.find(n=>n.id===`deal.seat-${c.seat}.second`);if(!clip)throw Error('Missing presentation slot');
 const binding={assetId:asset.id,sha256:asset.sha256,startFrame:0,endFrameExclusive:360,presentation:'raw-reference' as const};if(JSON.stringify(clip.binding)!==JSON.stringify(binding))changed.add(clip.id);clip.binding=binding;
 clip.qa={status:'pending',evidence:{path:c.reviewPath,sha256:hash(reviewBytes)},reason:`Rågranskning visar två kvarliggande konturer och fri hand vid ${c.clearHandFrame}. Kortvärden, separata tryckmasker, fysisk skala och exakta skarvar återstår.`};
 clip.note='12 s original på heltalsrutor0–359. Befintligt C1 ingår i råkällan och får inte samtidigt ritas dubbelt av anroparen. Två vita konturer är inte två färdiga separata trycklager. Äldre centralreferens bevaras i assets.';
}
contract.revision='local-candidates-20261109-r5';contract.edgeGates=contract.edgeGates.filter(g=>!changed.has(g.from.nodeId)&&!changed.has(g.to.nodeId));
contract.generationPlan.note='Alla14 givningshandlingar har källhashbundna råkandidater med heltalsrutor0–359. Tre VILA-klipp och två bryggor är bevarade. Lagerseparering, korttryck och exakta skarvar återstår. Kontraktet startar inga jobb och utökar ingen budget; kortvärden och spelregler ägs av anroparens motor.';
const errors=validateMotionContract(contract);if(errors.length)throw Error(errors.join('; '));
const after=JSON.stringify(contract,null,2)+'\n',missing=listMissingClips(contract),receipt={beforeSha256:hash(before),afterSha256:hash(after),changed:[...changed],missingMedia:missing.filter(m=>m.reasons.includes('missing-media')).length,runtimeApproved:contract.clips.filter(c=>c.qa.status==='approved').length,unavailableRuntime:missing.length};
if(!process.argv.includes('--dry-run')&&before!==after){const run='runs/20261109-pamela-candidate-registration/c2-bank-v2';await mkdir(run);await writeFile(run+'/contract-before.json',before,{flag:'wx'});await writeFile(run+'/contract-after.json',after,{flag:'wx'});if(await readFile(file,'utf8')!==before)throw Error('Concurrent contract change');const temp=file+'.c2.tmp';await writeFile(temp,after,{flag:'wx'});await rename(temp,file);await writeFile(run+'/receipt.json',JSON.stringify(receipt,null,2));}
console.log(JSON.stringify({dryRun:process.argv.includes('--dry-run'),...receipt}));
