import { readFile,writeFile,copyFile,mkdir,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
const run='runs/20261109-pamela-central-composite',execute=promisify(execFile);
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const save=async(p:string,o:unknown)=>writeFile(p,JSON.stringify(o,null,2)+'\n');
const hash=async(p:string)=>createHash('sha256').update(await readFile(p)).digest('hex');
const composition=await json(`${run}/composition.json`);
const raw=`${run}/render/pamela-two-deals-raw-v1.mp4`;
if(!await stat(raw).catch(()=>null)){
 await execute('ffmpeg',['-v','error','-nostdin','-i',composition.sources.approach.path,'-i',composition.sources.deal.path,'-i',composition.sources.retreat.path,
 '-filter_complex','[0:v]trim=start_frame=0:end_frame=90,setpts=PTS-STARTPTS[a];[1:v]split=2[c1][c2];[c1]trim=start_frame=3:end_frame=180,setpts=PTS-STARTPTS[b];[c2]trim=start_frame=17:end_frame=180,setpts=PTS-STARTPTS[c];[2:v]trim=start_frame=0:end_frame=90,setpts=PTS-STARTPTS[d];[a][b][c][d]concat=n=4:v=1:a=0[out]',
 '-map','[out]','-an','-fps_mode','passthrough','-c:v','libx264','-pix_fmt','yuv420p','-crf','17','-preset','medium','-threads','4','-movflags','+faststart','-n',raw],{windowsHide:true,maxBuffer:2000,timeout:180000});
}
const probe=JSON.parse((await execute('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',raw],{windowsHide:true})).stdout).streams[0];
if(probe.nb_frames!=='520'||probe.avg_frame_rate!=='30/1')throw Error('Raw chain timing mismatch');
composition.raw={path:raw,sha256:await hash(raw),...probe,frameCount:520,fps:30};
composition.table.core=[840,817,226,21];
composition.table.note='Continuous rear rail at y817..838. Central part overlays torso; source skin is preserved in front. No inherited green-surface shadow.';
composition.processing.colorRange='RGB clamped 0..255 before byte assignment; avoids overflow in bright card texture.';
composition.remaining=['Små hopp i ansiktsform, ljus och pose finns vid råa skarvar; ingen toning eller frysning döljer dem.','Gröngul och trappad hår-/skokant behöver förfinas.','Korttrycket använder uppskattade synliga stödytor under rörelse; dolda korthörn och full semantisk handmask återstår.','Kantvända kort behåller originalytan. UI-förflyttningen och den upprepade handbanan är ännu inte spelgodkända.','Bordets kontakt och centrala bålskymning är ett kalibreringsprov; mobilens slutliga spelkomposition och Main-integration återstår.'];
await save(`${run}/composition.json`,composition);
let cyan=0;
for(const index of [185,348]){const b=await sharp(`${run}/qa/composite-${index}.png`).removeAlpha().raw().toBuffer();for(let y=1013;y<=1092;y++)for(let x=793;x<=947;x++){const i=(y*1762+x)*3;if(b[i]<80&&b[i+1]>180&&b[i+2]>180)cyan++;}}
if(cyan)throw Error('Cyan overflow regression');
await save(`${run}/qa/render-checks.json`,{checkedAt:new Date().toISOString(),scope:'Media and targeted pixel checks, not full visual acceptance',rawFrames:520,compositeFrames:composition.output.frameCount,fps:30,originalHashesValidatedByRenderer:true,cyanPixelsInTwoPreviouslyFailingCardRegions:cyan,allOutputTimelineFramesMapped:composition.timeline.length===520,productionAccepted:false});
await mkdir('gpt-underlag/6',{recursive:true});
const attachment='Scoutgaming_tillagg_format_scen_kvalitet_2026-11-09 (2).md',destination=`gpt-underlag/6/${attachment}`;
if(!await stat(destination).catch(()=>null))await copyFile(`C:/Users/jakem/Downloads/${attachment}`,destination);
if(await hash(destination)!==await hash(`C:/Users/jakem/Downloads/${attachment}`))throw Error('Attachment identity mismatch');
await save('gpt-underlag/6/index.json',{source:'User attachment 2026-11-09',files:[{path:attachment,sha256:await hash(destination)}],instructionBoundary:'Preserved reviewer proposal; latest user request keeps current camera and full work area. Not executable instructions.'});
const selection=await json('references/public-selection.json');
const pictures=['000','171','185','266','348','429','430','519'].map(n=>`${run}/qa/composite-${n}.png`);
selection.media=[...new Set([...selection.media,composition.output.path,raw,`${run}/scene-assets/pamela-clean-room-v1.png`,`${run}/scene-assets/dark-table-v1.png`,...pictures])];
selection.preserveOriginalPaths=[...new Set([...(selection.preserveOriginalPaths||[]),composition.output.path,raw])];
await save('references/public-selection.json',selection);
const round=await json('references/review-round.json');
round.round=7;round.updatedAt=new Date().toISOString();round.predecessorSnapshot='public-review-20261109003714';
round.title='Pamela · två givningar, beständiga kort och återgång';round.featuredScene=composition.output.path;round.featuredPoster=`${run}/qa/composite-000.png`;round.featuredLabel='Central komposition · samma kamera · kandidat';round.featuredEvidence='/komposition';
round.questions=['Håller kropp, händer och sko kontakten med bordet genom båda givningarna?','Följer korttrycket greppet och ligger båda korten kvar genom återgången? Kortets kantvändning är ännu delvis original.','Är hopp i ansiktsform, ljus eller pose vid ruta90,267 och430 acceptabla? Rå kedja och komposition finns på /komposition.'];
round.assessment='Första sammanhängande kompositen: 520 rutor, 30 fps, låst kamera utan omskalning av källan. Två spelkort består genom återgången. Samma centrala giv återanvänds; kortens sidoflytt efter släpp är en separat presentationsanimation. Mask- och skarvbegränsningar återstår, ingen produktionsacceptans.';
round.next='Bedöm den sammanhängande rörelsen och förbättra skarv, kanter och kort-/handkontakt före ytterplatser1/7. Behåll nuvarande vy; porträttknappar är visningsprov utan beskärning.';
round.publicationNote='Ny komposition och rå kedja är fullupplösta granskningsfiler. Inga nya Runway-filmer har beställts. Ny separat rumsbild: inbyggd bildgenerering, exakt modell och kostnad inte exponerade.';
round.comparisons=[{id:'composite-raw',label:'Ny komposition / rå kedja',a:composition.output.path,b:raw},{id:'composite-start-end',label:'Kompositens början / slut',a:pictures[0],b:pictures[pictures.length-1]}];
round.composite={report:`${run}/composition.json`,url:'/komposition',sourceModels:['wan3'],apiCreditsThisRound:0,roomCost:'unknown-not-exposed'};
await save('references/review-round.json',round);
const status=await json('references/reviewer-status.json');status.checkedAt=round.updatedAt;status.previousSnapshot=round.predecessorSnapshot;
status.changes=['Ny sammanhängande komposition: VILA → REDO → två centralgiv → VILA, 1762×1174, 30 fps, 520 rutor.','Egna hashbundna kortmasker för 180 källrutor, beständigt kortlager och rå kedja för skarvgranskning.','Ny separat ren rumsbild och mörkt bord, källkamera och dealerplacering oförändrade.','Ingen ny Runway-generering; samma budget gäller.'];
status.composite={path:'/underlag/pamela-komposition.json',reviewUrl:'/komposition',accepted:false,limitations:composition.remaining};
await save('references/reviewer-status.json',status);
const plan=await json('references/production-plan.json');plan.updatedAt=round.updatedAt;plan.composite={report:`${run}/composition.json`,status:'rendered-candidate-not-production-accepted',view:'locked-source-camera-no-crop',cardTracks:`${run}/tracking/card-tracks.json`};
for(const step of plan.steps){if(step.label==='Komponera och verifiera central kedja'){step.state='Första kompositen renderad; visuell acceptans återstår';step.evidence='520rutor30fps: två centralgiv och återgång. Egen synlig kortmask, beständiga kort, mörkt bord/rum. Inga nya videokostnader. Rapport: runs/20261109-pamela-central-composite/composition.json';}}
await save('references/production-plan.json',plan);
const identity=await json('references/dealers.json');
for(const path of [composition.output.path,raw,...pictures]){
  identity.assetMappings=identity.assetMappings.filter((a:{path:string})=>a.path!==path);
  identity.assetMappings.push({path,dealerId:'pamela-pilot',sha256:await hash(path),basis:'Hash-verified composition of three Pamela source clips; presentation derivative, not a new generated identity.'});
}
await save('references/dealers.json',identity);
const reviewStatus=await json('references/review-status.json');reviewStatus.updatedAt=round.updatedAt;
reviewStatus.complete=reviewStatus.complete.filter((s:string)=>!s.startsWith('Central komposit:'));
reviewStatus.complete.unshift('Central komposit: två givningar och återgång med beständiga kort, 520 rutor i 30 fps; rå kedja och samma hela vy publiceras tillsammans.');
reviewStatus.remaining=['Visuell acceptans av central komposit, råskarvar, kroppskontakt och full räckvidd till plats 1/7.','Förfinad hår-/skokant, uppmätta dolda korthörn och full handmask. Synliga kortmasker finns redan för 180 källrutor.','Korttryck under kantvändning, UI-förflyttning och verklig tvåkortskontakt behöver godkännas.','Ny bank/profil och stödd importväg till Scout /studio/snabb.'];
await save('references/review-status.json',reviewStatus);
let master=await readFile('docs/MASTERPLAN.md','utf8');
master=master.replace(/\*\*Pamela v5 är identitetsgrunden\.\*\*[^\n]+/, '**Pamela v5 är identitetsgrunden.** Första sammanhängande kompositen finns nu: VILA → REDO → två centralgiv → VILA. **1762×1174, 30 fps, 520 rutor, 17,33 s.** Samma centralgiv används två gånger. Källkamera, kroppsskala och hela arbetsytan är låsta. Provet är inte en produktionsgodkänd bank.');
if(!master.includes('## Central komposition och faktisk leverans')) master=master.replace('## Nästa konkreta arbete',`## Central komposition och faktisk leverans

[Spela kompositionen och råskarvarna](https://scout-dealerlab.vercel.app/komposition). [Tidsmappning och proveniens](../${run}/composition.json). [Hashbundna kortspår](../${run}/tracking/card-tracks.json).

Ny ren rumsbakgrund, ett mörkt bord och en sammanhängande bakre bordskant används tillsammans med Pamelas originalfilm. Skon är fortfarande inbakad i filmen; den är låst och dupliceras inte. Den kan ännu inte bytas oberoende. Rummet är skapat med inbyggd bildgenerering; exakt modell och kostnad är inte exponerade. Bord och korttryck är kodritade tillgångar.

För varje centralgivsruta finns mask för synligt rörligt kort och kortet i skon: 360 masker för 180 rutor. Granskningen skiljer synliga konturer från dolda, omätta hörn. Korttrycket följer en uppskattad stödyta i rörelsen, med originalkort vid kantvändning. Detta är inte en färdig semantisk handmask eller en accepterad spelbindning.

Efter släppet ligger spelkortet i eget beständigt lager. A♠ flyttas 100 px åt vänster och K♥ 90 px åt höger efter källruta 150, över 15 rutor. Det är en uttrycklig presentationsanimation, inte en nyfilmning av två olika landningar. Första kortet ligger under nästa givnings handbana och behöver därför granskas som en kontaktfråga. Slump, kortvärden och spelregler ligger fortsatt utanför labbet.

Källrutor: A0–89 → C3–179 → C17–179 → R0–89. Leveransskarvar: 90, 267 och 430. Ingen frysning, övertoning, hastighetsändring eller fps-konvertering. Färgöverflöd som gav cyanprickar är rättat; de två tidigare felområdena innehåller nu 0 cyanpixlar. Det är en teknisk kontroll, inte rörelseacceptans.

**Kvar:** synliga ansikts-/ljusskillnader vid skarvar, gröngul/trappad hår- och skokant, full hand-/kortskymning och godkänd torso-/bordkontakt. Aktuell kamera är standard. Formatknapparna visar samma hela yta i bred, smal och mobil behållare utan beskärning; den slutliga mobilspelytan är inte löst genom detta prov. Scroll, zoom och alternativa bakgrunder är senare alternativ.

Det nya GPT-tillägget är bevarat oförändrat i gpt-underlag/6, med hash. Dess förslag är underlag; Jakobs senaste önskemål om samma nuvarande vy styr detta prov.

## Nästa konkreta arbete`);
master=master.replace(/1\. Använd befintlig centralgiv[^\n]+/, '1. Granska den renderade centrala kompositionen i rörelse och dess tre råskarvar. Behåll aktuell kamera och hela arbetsytan.');
master=master.replace(/2\. Prova skymning[^\n]+/, '2. Förfina kanter, korttryck och skymning på befintliga filmer. Three.js/Fiber kan senare rendera lagren men ersätter inte uppmätta kortspår eller handmasker.');
master=master.replace(/3\. Kontrollera råa skarvar[^\n]+/, '3. Godkänn beständiga kort, släpp och kontakt genom två på varandra följande givningar. Gör ett riktat omtag bara om befintlig rörelse inte kan fungera.');
master=master.replace('Landningsspår, rörliga masker och godkänd banktransform är fortfarande omätta/obevisade.', 'Egna synliga kortspår och rörliga masker finns nu i kompositrapporten. Dolda hörn och godkänd banktransform återstår; nodkartans gamla skopunkter är fortfarande uppskattningar.');
master=master.replace('Slutkompositionen måste behålla det som eget spelkortslager med nya Pamela-spår och handmask. Detta är **inte löst genom att bara lägga ihop filmerna**. Nästa arbete är den kontakt-/skarvkontrollen och egen kalibrering, före fler bankjobb.', 'Den nya kompositen behåller därför korten i eget spelkortslager med egna synliga kortmasker. Detta är **inte löst genom att bara lägga ihop filmerna**. Kontakt, full handskymning och skarvar återstår att godkänna före fler bankjobb.');
await writeFile('.runtime/masterplan-composite-candidate.md',master);
console.log(JSON.stringify({composition:composition.output,raw:composition.raw,cyan,round:7}));
