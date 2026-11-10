import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=async(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+'\n');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const now=new Date().toISOString(),run='runs/20261109-pamela-idle-composite',sourceRun='runs/20261109-pamela-idle-pilot';
const report=await read(`${run}/composition.json`),selection=await read('references/public-selection.json'),identity=await read('references/dealers.json');
const jobs=await Promise.all(['breath','glance'].map(n=>read(`${sourceRun}/${n}.json`)));
const artifacts=report.clips.flatMap((c:any)=>[c.source.path,c.native.path,c.portrait.path,...c.proofs.flatMap((p:any)=>[p.path,p.portrait])]);
artifacts.push(report.sequence.native.path,report.sequence.portrait.path);
for(const c of report.clips){
 const inspect=await read(`${sourceRun}/qa/${c.name}/inspection.json`);
 artifacts.push(inspect.loop.path,...inspect.contactSheets.map((s:any)=>s.path));
}
for(const path of artifacts){const sha256=hash(await readFile(path));identity.assetMappings=identity.assetMappings.filter((a:any)=>a.path!==path);identity.assetMappings.push({path,sha256,dealerId:'pamela-pilot',basis:'Current VILA anchor and task-bound idle original; composited derivatives keep source geometry'});}
selection.media=[...new Set([...selection.media,...artifacts])];
selection.preserveOriginalPaths=[...new Set([...selection.preserveOriginalPaths,...artifacts.filter((p:string)=>p.endsWith('.mp4'))])];
await save('references/public-selection.json',selection);await save('references/dealers.json',identity);
const ledgerPath='runs/20261108-pamela-deal-pilot/qa/budget-ledger.json',ledger=await read(ledgerPath);
if(new Set(ledger.jobs.map((j:any)=>j.taskId)).size!==ledger.jobs.length)throw Error('Duplicate budget task');
ledger.acceptedJobs=ledger.jobs.length;ledger.successfulGenerations=ledger.jobs.filter((j:any)=>j.state==='SUCCEEDED').length;
ledger.apiMaximumCreditsTotal=ledger.jobs.reduce((sum:number,j:any)=>sum+j.apiMaximumCredits,0);
ledger.submissionAttempts=ledger.acceptedJobs+1;ledger.remainingAfterConservativeReserve=ledger.approved.runwayCredits-ledger.apiMaximumCreditsTotal-ledger.failedAttempt.conservativeReserveCredits;
ledger.updatedAt=now;ledger.reservationAccounting='SUCCEEDED reservations reference matching jobs and are not added again to totals.';
if(ledger.acceptedJobs>ledger.approved.maxPaidVideoJobs||ledger.remainingAfterConservativeReserve<0)throw Error('Pilot cap exceeded');
await save(ledgerPath,ledger);
const round=await read('references/review-round.json'),publication=await read('references/public-review.json');
round.round=9;round.updatedAt=now;round.predecessorSnapshot=publication.snapshot;
round.title='Pamela · ny andningsloop och blickinstick';round.featuredScene=report.sequence.native.path;round.featuredLabel='VILA · andning och blick · råa skarvar';round.featuredEvidence='/vila';round.featuredPoster=report.clips[0].proofs[0].path;
round.questions=['Bedöm identitet och hand-/skostabilitet under hela andningsloopen.','Granska råa skarvar vid 6, 12, 15 och 21 sekunder: hoppar pose, ljus eller rörelsetempo?','Fungerar den nedåtriktade blicken som ett kort instick, och håller samma kontakt i stående vy?'];
round.primaryFilmPaths=jobs.map(j=>j.output.path);
for(const job of jobs){const c=report.clips.find((c:any)=>c.name===job.name);round.films=round.films.filter((f:any)=>f.path!==job.output.path);round.films.unshift({label:`Nytt VILA-prov · ${c.label}`,path:job.output.path,...c.source,model:job.model,taskId:job.taskId,jobPath:`${sourceRun}/${job.name}.json`,input:job.input,lastInput:job.input,motionSource:null,apiCreditEstimate:job.expectedCredits,invoiceVerified:false,endpointMode:'identical VILA first and last; no temporal repair',decision:job.decision});}
round.comparisons=[{id:'idle-breath-scene-raw',label:'Andning · scen / original',a:report.clips[0].native.path,b:report.clips[0].source.path},{id:'idle-glance-scene-raw',label:'Blick · scen / original',a:report.clips[1].native.path,b:report.clips[1].source.path}];
round.assessment='Två nya Wan3-original, 6 och 3 sekunder, 1762×1174/30 fps. Samma nära scen och stående derivat. 21-sekunders sekvens visar råa skarvar. Kandidater, inte en produktionsgodkänd vilopolicy.';
round.publicationNote='Nytt denna omgång: två betalda VILA-prov, 180 API-krediter, komposition och original-QA. Centralgivets v2-filmer är oförändrade. C2-ompassningen är avvisad som ofullständigt prov, inte införd.';
round.next='Bedöm viloskarvar och anslutningen till VILA→REDO. För C2: skilj skyddad hand/ärm från komprimerbar grön bakgrund innan hela återgången prövas igen. Inga fler betalda filmer behövs för den diagnosen.';
await save('references/review-round.json',round);
const prod=await read('references/production-plan.json');prod.updatedAt=now;prod.nextAction=round.next;
Object.assign(prod.budget,{knownReservedRunwayCredits:ledger.apiMaximumCreditsTotal+ledger.failedAttempt.conservativeReserveCredits,videoJobs:ledger.acceptedJobs,submissionAttempts:ledger.submissionAttempts,apiMaximumCredits:ledger.apiMaximumCreditsTotal,remainingCredits:ledger.remainingAfterConservativeReserve});
prod.idle={report:`${run}/composition.json`,reviewUrl:'/vila',productionAccepted:false,activated:false,credits:180,frames:270,sequenceFrames:630};
prod.contactExperiment={report:'runs/20261109-pamela-c2-retarget/retarget-manifest.json',status:'rejected-incomplete',next:'Foreground-aware safety check, then complete return QA; no regeneration yet'};
await save('references/production-plan.json',prod);
const status=await read('references/reviewer-status.json');status.checkedAt=now;status.previousSnapshot=publication.snapshot;status.changes=[round.publicationNote,'Separat källstyrd kontaktskugga och bålskymning provas på de nya VILA-kompositerna. Ingen omflyttning av kropp eller händer.', 'new-front2-kortens geometri och material är granskade läskopior; ingen gravitationsmotor hittades i kortscenen.'];status.next=round.next;status.idle=prod.idle;status.contactExperiment=prod.contactExperiment;
await save('references/reviewer-status.json',status);
console.log(JSON.stringify({newFilms:jobs.length,credits:180,acceptedJobs:ledger.acceptedJobs,apiCredits:ledger.apiMaximumCreditsTotal,remainingCredits:ledger.remainingAfterConservativeReserve,artifacts:artifacts.length}));
