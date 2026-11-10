import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const json = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const save = async (p: string, value: unknown) => writeFile(p, JSON.stringify(value,null,2)+'\n');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const run='runs/20261109-pamela-sequence', now=new Date().toISOString();
const inspected: Record<string,{frames:number[];findings:string[]}> = {
  'from-shoe': { frames:[32,39,51,89], findings:[
    'Alla 90 rutor finns i kontaktarket. Originalrutor 32,39,51,89 inspekterade: handen lämnar skon och återgår till VILA; skons kort ligger kvar.',
    'Händer och armbågar ligger inom bilden i översikten och de inspekterade originalrutorna. Detta bevisar inte hela givräckvidden.',
    'Rå slutpose, identitet och rörelse genom skarven är inte godkända. Inga frysta ändar eller toningar har lagts till.',
  ] },
  'central-base': { frames:[44,58,84,100,122,145,179], findings:[
    'Alla 180 rutor finns i kontaktarket. Originalrutor 44,58,84,100,122,145,179 inspekterade: kort lyfts från skon, byter hand, når central förgrund och blir kvar när händerna återgår mot REDO.',
    'I ruta 84 har kortets synliga kant böjd/mjuk form. Styv plan kortgeometri är inte godkänd; överföring och fingersläpp behöver granskas sammanhängande.',
    'Händer och armbågar ligger inom bilden i översikten och de inspekterade originalrutorna. Plats 1/7 är ännu inte provade.',
    'Slutrutans handpose liknar REDO men exakta råskarvar och hastighet är inte accepterade. Samma pose får inte nollställa det redan utdelade kortet.',
  ] },
};
const entries=[];
for(const name of ['central-base','from-shoe']){
  const job=await json(`${run}/${name}.json`), qa=await json(`${run}/qa/${name}/inspection.json`);
  if(job.state!=='SUCCEEDED'||sha(await readFile(job.output.path))!==job.output.sha256)throw Error('Unverified completed original');
  qa.visualReview={status:'candidate-needs-contact-and-join-review',nativeFrameIndices:inspected[name].frames,findings:inspected[name].findings,reviewedAt:now};
  await save(`${run}/qa/${name}/inspection.json`,qa);
  entries.push({name,mainSlot:name==='central-base'?'deal.player.centre/box3':'transition.shoe/from-shoe',variant:name==='central-base'?'base':null,poseBefore:job.poseBefore,poseAfter:job.poseAfter,film:qa.film,model:job.model,taskId:job.taskId,jobPath:`${run}/${name}.json`,qaPath:`${run}/qa/${name}/inspection.json`,input:job.first,lastInput:job.last,cardStateBefore:job.cardStateBefore,cardStateAfter:job.cardStateAfter,apiCreditEstimate:job.expectedCredits,productionApproval:'pending',integrationStatus:'unbound',findings:inspected[name].findings});
}
const sequence={schema:'dealerlab-sequence-review/1',updatedAt:now,bankId:'pamela-workspace-v1',scope:'New Pamela source media, no Main import',entries,productionAccepted:false,
  sequenceAssembly:{status:'not-composited-or-accepted',reason:'Central raw film retains one landed card, but the standalone return source has an empty tabletop. The final compositor must preserve that game card as its own layer with Pamela-specific track/mask; simply concatenating these originals would make it disappear.'},
  next:'Measure central card corners/contact/release and hand mask on these exact bytes; evaluate raw REDO joins before any further bank generation.'};
await save('references/pamela-sequence.json',sequence);
const ledger=await json('runs/20261108-pamela-deal-pilot/qa/budget-ledger.json');
for(const e of entries)if(!ledger.jobs.some((j:any)=>j.taskId===e.taskId))ledger.jobs.push({path:e.jobPath,taskId:e.taskId,model:e.model,state:'SUCCEEDED',apiMaximumCredits:e.apiCreditEstimate});
ledger.acceptedJobs=10;ledger.successfulGenerations=10;ledger.submissionAttempts=11;ledger.apiMaximumCreditsTotal=698;ledger.remainingAfterConservativeReserve=1218;ledger.updatedAt=now;ledger.productionAcceptedJobs=0;
ledger.builtinImagesThisStage={...ledger.builtinImagesThisStage,count:4,addedThisRound:'REDO pose plus one landed blank card; exact tool model/cost not exposed'};
await save('runs/20261108-pamela-deal-pilot/qa/budget-ledger.json',ledger);
const plan=await json('references/production-plan.json');
if(plan.budget.knownReservedRunwayCredits!==782||plan.budget.videoJobs!==10)throw Error('Budget changed; reconcile before curation');
plan.budget.apiMaximumCredits=698;plan.updatedAt=now;plan.sequenceReview='references/pamela-sequence.json';plan.dealerMap='references/dealer-map.json';await save('references/production-plan.json',plan);
const round=await json('references/review-round.json');
const publication=await json('references/public-review.json');
round.round=6;round.updatedAt=now;round.predecessorSnapshot=publication.snapshot;round.title='Pamela · centralgiv, återgång och nodkarta';
round.featuredScene=entries[0].film.path;round.featuredLabel='Nytt centralgiv · REDO → plats 4 → REDO · kandidat';round.featuredPoster=`${run}/qa/central-base/frame-001.png`;round.featuredEvidence='/underlag/pamela-sekvens.json';
round.primaryFilmPaths=[entries[0].film.path,'runs/20261109-pamela-reference-kit/original/pamela-vila-till-redo-wan3.mp4',entries[1].film.path];
round.assessment='Centralgiv och återgång finns som egna 30 fps-original. Kortet blir kvar efter given, men kortets styvhet, exakt handkontakt, rörelseskarvar och separat handmask är inte godkända. Den kompletta sammansatta sekvensen är ännu inte levererad.';
round.next='Granska kontakt och skarvar på dessa original, mät Pamelas egna kortspår och bevara utdelat kort genom återgången. Därefter ytterplatser 1/7; ingen hel bank ännu.';
round.questions=[
  'Är utdragning, handbyte och fingersläpp trovärdiga? Granska särskilt centralgivets ruta 44,58,84,100 och 122; kortet böjs i rörelsen.',
  'Håller Pamelas identitet och återgången till REDO/VILA? Bedöm råa ändrutor och rörelsen kring skarvarna, inte bara ändbilderna.',
  'Ger nodkartan rätt bild av fack, filmkopplingar och kvarvarande mätningar? Referenspunkter är uppskattningar; landningsspår och masker är ännu inte godkända.',
];
for(const e of entries){const record={...e.film,label:e.name==='central-base'?'Nytt centralgiv · 4:base · kandidat':'Ny återgång · REDO → VILA · kandidat',model:e.model,taskId:e.taskId,jobPath:e.jobPath,input:e.input,lastInput:e.lastInput,motionSource:null,apiCreditEstimate:e.apiCreditEstimate,endpointMode:e.name==='central-base'?'REDO first, REDO plus one landed card last; raw joins not accepted':'REDO first, VILA last; no card extraction; raw joins not accepted'};round.films=round.films.filter((f:any)=>f.path!==record.path);round.films.unshift(record);}
round.comparisons=[{id:'central-and-return',label:'Nya original: centralgiv / återgång',a:entries[0].film.path,b:entries[1].film.path},...round.comparisons.filter((c:any)=>c.id!=='central-and-return')];
round.publicationNote='Ny nodkarta och två nya filmer. Oförändrade original, inte godkänd slutscen eller Main-bank.';
await save('references/review-round.json',round);
const selection=await json('references/public-selection.json'), dealers=await json('references/dealers.json');
const additions=[...entries.map(e=>e.film.path),`${run}/original/pamela-redo-after-central.png`,`${run}/qa/central-base/frame-001.png`,`${run}/qa/central-base/frame-085.png`,`${run}/qa/central-base/frame-101.png`,`${run}/qa/central-base/frame-180.png`,`${run}/qa/central-base/all-frames.jpg`,`${run}/qa/from-shoe/frame-090.png`,`${run}/qa/from-shoe/all-frames.jpg`];
for(const p of additions){if(!selection.media.includes(p))selection.media.push(p);const bytes=await readFile(p);dealers.assetMappings=dealers.assetMappings.filter((a:any)=>a.path!==p);dealers.assetMappings.push({path:p,sha256:sha(bytes),dealerId:'pamela-pilot',role:'reference-candidate',note:'New Pamela sequence evidence, not production accepted.'});}
await save('references/public-selection.json',selection);await save('references/dealers.json',dealers);
const status=await json('references/review-status.json');status.updatedAt=now;status.complete.unshift('Standard och nodträd matchar 36 Main-fack. Publik nodkarta visar kandidater och saknade mätningar.','Nytt centralgiv: 180 rutor/6 s. Ny återgång: 90 rutor/3 s. Båda 1762×1174/30 fps, originalhashar och visuella begränsningar dokumenterade.');status.remaining=status.remaining.filter((s:string)=>!s.startsWith('Central REDO'));status.remaining.unshift('Godkänd centralgiv, komplett komposition med kvarvarande kort genom återgång, samt full räckvidd till plats 1/7.');await save('references/review-status.json',status);
const reviewer=await json('references/reviewer-status.json');reviewer.checkedAt=now;reviewer.previousSnapshot=publication.snapshot;reviewer.git.headBeforeThisRound='976aeda2e34e5a45332e3e16332f397bbf7acc51';reviewer.changes=['Två nya egna Pamela-filmer: centralgiv och återgång, ännu ej accepterade.', 'Nodkarta, standard och nodträd jämförda mot Main; alla 36 fack-ID:n matchar.', 'Samma handpose skiljs från bordets korttillstånd. Rå sammanfogning skulle tappa det utdelade kortet vid återgången.', 'Budget: 698 API-krediter plus 84 konservativ reserv = 782; 1218 kvar.'];reviewer.next=sequence.next;reviewer.sequenceReview=sequence;reviewer.dealerMap='/nodkarta';await save('references/reviewer-status.json',reviewer);
console.log(JSON.stringify({round:round.round,newFilms:entries.map(e=>e.film),budget:plan.budget,publicAssetsAdded:additions.length}));
