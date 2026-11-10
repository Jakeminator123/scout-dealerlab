import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd();
const read=(p:string)=>readFile(path.join(root,p),'utf8');
const json=async(p:string)=>JSON.parse(await read(p));
const save=(p:string,v:unknown)=>writeFile(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const stamp=new Date().toISOString();
const replace=async(p:string,from:string,to:string)=>{let s=await read(p);if(s.includes(to))return;if(!s.includes(from))throw Error('Missing edit anchor: '+p);await writeFile(path.join(root,p),s.replace(from,to));};

await replace('src/pamela-idle-review-page.ts','</nav><header>','</nav>${version}<p><a href="/scenfinish">Ljusprov och förklaring till ansiktsskiftet</a> · <a href="/kortmaterial">Kortmaterial</a></p><header>');
await replace('src/pamela-idle-review-page.ts','Grundloopen är lugn andning. Blickinsticket återvänder till samma vila.','Grundloopen prövar lugn andning. Blickinsticket har samma avsedda vilopose, men ansiktsåtergivningen skiftar vid klippbytet.');
await replace('src/pamela-idle-review-page.ts','<strong>Råa skarvar visas.</strong>','<strong>Bekräftad avvikelse vid 6 och 12 s:</strong> ansiktets detaljering återställs i originalen. <a href="/scenfinish#skarv">Se originalrutorna och diagnosen</a>. <strong>Råa skarvar visas.</strong>');
await replace('src/composition-review-page.ts','<body><div id="composition-root">','<body><div style="max-width:1714px;margin:auto;padding:8px 24px">${reviewVersionMarkup(snapshot,`Central komposit v2 · ${report.output.sha256.slice(0,12)}`)}</div><div id="composition-root">');
await replace('scripts/build-public-review.ts','|vila(?:.html|.js)?|manifest.json','|vila(?:.html|.js)?|scenfinish(?:.html)?|kortmaterial(?:.html|.js)?|manifest.json');
await replace('scripts/build-public-review.ts',"{src:'/vila',dest:'/vila.html'}]","{src:'/vila',dest:'/vila.html'},{src:'/scenfinish',dest:'/scenfinish.html'},{src:'/kortmaterial',dest:'/kortmaterial.html'}]");
await replace('src/card-material-study-page.ts','const escapeHtml=',"import {reviewVersionMarkup} from './review-version.ts';\nconst escapeHtml=");
await replace('src/card-material-study-page.ts','</nav><header>','<a href="/scenfinish">Ljus och kanter</a></nav>${reviewVersionMarkup(snapshot,\'Fristående kortmodell · ingen ny Pamela-film\')}<header>');

const selection=await json('references/public-selection.json');
const ids=await json('references/dealers.json');
const assets=[
 'runs/20261109-pamela-finish-study/breath-090-dark-baseline.png',
 'runs/20261109-pamela-finish-study/breath-090-dark-tone-only.png',
 ...['skin','edge','torso'].map(x=>'runs/20261109-pamela-finish-study/comparison-'+x+'.png'),
 'runs/20261109-pamela-idle-seams/12s-face-originals.png',
];
for(const asset of assets){
 if(!selection.media.includes(asset))selection.media.push(asset);
 const sha256=createHash('sha256').update(await readFile(path.join(root,asset))).digest('hex');
 const mapping={path:asset,sha256,dealerId:'pamela-pilot',basis:'Same-frame native Pamela originals: source-bound light comparison or original seam diagnosis; no new generation.'};
 const index=ids.assetMappings.findIndex((x:{path:string})=>x.path===asset);
 if(index<0)ids.assetMappings.push(mapping);else ids.assetMappings[index]=mapping;
}
await save('references/public-selection.json',selection);await save('references/dealers.json',ids);
const publication=await json('references/public-review.json');
const round=await json('references/review-round.json');
round.round=10;round.updatedAt=stamp;round.predecessorSnapshot=publication.snapshot;
round.title='Pamela · samma film, nytt ljusprov, skarvdiagnos och 3D-kort';
round.questions=[
 'Samma originalruta: passar A eller den något mörkare B bättre mot rummet, utan att förlora ansikte och händer?',
 'Vid 6 och 12 sekunder återställs huddetaljer i originalen. Är detta synligt i normal spelskala även utan att pausa?',
 'Fungerar kortmaterialets fram-/baksida, valör, milda böjning och glans? Handkontakt med Pamela ingår ännu inte.'
];
round.comparisons=[{id:'finish-tone-only',label:'Samma ruta · nuvarande / mild ljusdämpning',a:assets[0],b:assets[1]}];
round.materialReview={url:'/scenfinish',cardUrl:'/kortmaterial',sourceFilmsChanged:false,newPaidJobs:0};
await save('references/review-round.json',round);
const status=await json('references/reviewer-status.json');
status.checkedAt=stamp;status.previousSnapshot=publication.snapshot;
status.changes=[
 'Ingen ny film eller betald generering denna omgång. Samma Pamela-original och kompositfiler.',
 'Bekräftat ansiktsskifte finns i originalen vid andningsloop 6 s och övergången 12 s; outputruta 369 motsvarar blickruta 9. Råskarvarna är inte godkända.',
 'Samma-frame-ljusprov -0,18 EV med identisk alpha. Separat kombinerat kantprov avvisat utan tydlig förbättring på ljus kontroll.',
 'Fristående 3D-kort med båda sidor, 52 angivbara värden, mild böjning och glans. Plant/stilla efter landning; ännu ingen Pamela-handkontakt.',
 'Synlig publiceringsversion skiljs från filmhash. Budgeten är fördubblad enligt Jakob: 4000 Runway-krediter och 20 USD OpenAI totalt.'
];
status.finish={url:'/scenfinish',report:'runs/20261109-pamela-finish-study/profile.json',appliedToFilms:false};
status.idleSeams={report:'runs/20261109-pamela-idle-seams/inspection.json',accepted:false,issue:'Source facial-detail reset, not keyed opaque face pixels or a measured global translation.'};
status.cardMaterial={url:'/kortmaterial',report:'runs/20261109-card-material-study/review-summary.json',integratedWithPamela:false};
status.vercelAccess={checkedAt:stamp,team:'scoutgaming',teamRead:true,projectRead:false,projectResponse:'404 from MCP at last check; exact project and publication verified through CLI',toolbar:'Read endpoint responds, no threads returned; no automatic screen or chat connection'};
status.next=['Pröva bättre klippunkter för den diagnostiserade ansiktsåterställningen; riktat omtag endast om befintliga rutor inte räcker.','Färdigställ kort 2 med skyddad hand-/armregion, korrekt kontakt och stationärt första kort.','Integrera kortmaterial först mot godkända kortspår och handmask.'];
await save('references/reviewer-status.json',status);
const plan=await json('references/production-plan.json');plan.updatedAt=stamp;plan.finish=status.finish;plan.idleSeams=status.idleSeams;plan.cardMaterial=status.cardMaterial;
await save('references/production-plan.json',plan);
const review=await json('references/review-status.json');review.updatedAt=stamp;
review.complete=review.complete.filter((x:string)=>!x.startsWith('Samma-ruta:')&&!x.startsWith('Fristående 3D-kort:'));
review.complete.unshift('Samma-ruta: -0,18 EV-ljusprov och originalbaserad diagnos av ansiktsskiftet vid 6/12 s. Ingen ny film.', 'Fristående 3D-kort: två sidor, böjning, glans och exakt stillhet efter landning; ingen Pamela-kontakt integrerad.');
review.remaining=review.remaining.filter((x:string)=>!x.startsWith('VILA-skarvar:'));
review.remaining.unshift('VILA-skarvar: ansiktets detaljering återställs vid originalens klippbyten. Befintlig loop är inte sömlös eller produktionsgodkänd.');
await save('references/review-status.json',review);

let master=await read('docs/MASTERPLAN.md');
master=master.replace('Små ändpunktsskillnader kvarstår; detta är kandidater, inte aktiverat spelinnehåll.','Originalens ansiktsdetaljer återställs vid 6 och 12 sekunder i grundsekvensen. Det är ett verifierat kontinuitetsfel; detta är kandidater, inte aktiverat spelinnehåll.');
master=master.replace('**1 038 av 2 000 krediter kvar**','**3 038 av 4 000 krediter kvar** efter Jakobs dubblering av budgeten');
master=master.replace('- Pilotram: 2 000 Runway-krediter, högst 16 betalda videogenereringar och 250 krediter per jobb; OpenAI-bildarbete/granskning högst 10 USD.','- Jakob har fördubblat de monetära taken: totalt **4 000 Runway-krediter och 20 USD för OpenAI**. Högst 16 betalda videogenereringar och 250 krediter per jobb gäller fortsatt. Ingen ny genereringskostnad i ljus-/kortmaterialomgången.');
master=master.replace(/- \*\*10 slutförda videogenereringar\*\*[^\n]+/,'- **12 slutförda videogenereringar**. API-kostnadsuppgifter summerar till **878 krediter**. Med 84 krediter konservativ reserv räknas **962**, och **3 038** återstår. Faktura är inte verifierad. [Budgetjournal](../runs/20261108-pamela-deal-pilot/qa/budget-ledger.json).');
const section=`## Aktuellt: ljusprov, originalskarv och kortmaterial

[Ljus och skarvbevis](https://scout-dealerlab.vercel.app/scenfinish) visar samma andningsruta 90 med nuvarande ljus eller −0,18 EV. Alpha och kontaktgeometri är identiska. Det kombinerade kantprovet på sex rutor tunnar delalpha utan tydlig förbättring på ljus bakgrund och aktiveras inte. Filmfilerna är oförändrade. Hudens rödkanalsmättnad är 1,4–3,1 % i de klassificerade hudregionerna; detta är inte ett mått på korrekt scenljus.

**Ansiktsskiftet är verifierat:** sekvensruta 369 / 12,30 s är blickruta 9, efter bytet vid 12,00 s. Andning 179 → blick 0 återställer huddetaljer; samma fel syns vid andningsloopen 6 s. Friläggningen ändrar 0 pixlar i den kontrollerade opaka ansiktskärnan. Nästa steg är att pröva bättre klippunkter mot tempo och handkontakt, sedan ett riktat omtag om det behövs. Automatisk ansiktsändring eller mer oskärpa är inte en accepterad lösning.

[Kortmaterialprovet](https://scout-dealerlab.vercel.app/kortmaterial) är en separat Three-modell med fram-/baksida, valörer, tunn kant, mild böjning i luften och diskret glans. Efter landning är den exakt plan och stilla. J/Q/K är typografiska provtryck. Ingen fri gravitation, spelrandomisering, Pamela-handmask eller kontaktintegration ingår. Godkända rörelsespår och handskymning krävs innan den ersätter kortet i filmen.

[Scenprofilen](../references/scene-finish-contract.json) binder kamera, kontakt, friläggning, fast färgprofil, skuggor och export. Detta kan automatiseras med kontrollgrindar; ingen exponering ska pumpas automatiskt mellan rutor. Den fysiska ljusriggen bakom källfilmen är okänd. En ny ljusriktning eller flyttad sko/bordhöjd kräver nytt kontaktprov. En markerbricka är ännu bara ett placeringsförslag och får inte dölja hand-/kortbanan.

GPT-underlag/9 bedömer äldre central v2 från 03:02 svensk tid. Den nya vilokompositen har separat kontaktskugga/bålskymning; råden är inte bevis för samma rektangelfel i den. Synlig paketversion skiljs nu från filmernas hash. Vercel MCP kan läsa Scout Gaming-teamet men gav fortfarande 404 för labbprojektet vid senaste kontroll; publicering via verifierad CLI fungerar. Toolbar innebär ingen automatisk koppling mellan agentchattar.

`;
if(!master.includes('## Aktuellt: ljusprov, originalskarv och kortmaterial'))master=master.replace('## Vila: nya original och första grundsekvens',section+'## Vila: nya original och första grundsekvens');
await writeFile(path.join(root,'.runtime/masterplan-finish-candidate.md'),master);
console.log(JSON.stringify({round:10,addedAssets:assets.length,masterCandidate:'.runtime/masterplan-finish-candidate.md',newPaidJobs:0}));
