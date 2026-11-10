# Masterplan – Pamela och den sammanhängande demonstrationsfilmen

Uppdaterad 2026-11-10 efter Jakobs senaste styrning. Aktuell huvudagent och verifierat skrivägarskap finns i references/agent-roles.json. Arbetsyta: snyggare-dealer, gren jakob/test. Scoutgaming är läsreferens. Denna korta plan ersätter äldre avsnitts arbetsordning; [historiken bevaras](MASTERPLAN-HISTORIK-20261110.md).

## Lokal leverans och fortsatt mål

Pamela har en sammanhängande grundfilm på 3 598 rutor vid 30 bilder/s. Filmen går från VILA genom två givningar per spelplats, tre dealerkort och separat vändning av samma D.C2. Den slutar i VILA med 17 kort. Den villkorade filmen har exakt samma grundfilm och lägger till 209 rutor fram till VILA med 18 kort.

- [Bredfilm, 1:59,93](../runs/20261110-pamela-goal-scene/take-09/full-candidate-3598-89d0a448-b6afbd/pamela-sammanhangande-kandidat.mp4)
- [Mobilfilm, 1080 × 1920](../runs/20261110-pamela-goal-scene/take-14/842dd4829654/pamela-sammanhangande-mobil.mp4)
- [Villkorad D.C4, 2:06,90](../runs/20261110-pamela-goal-scene/take-16/branch-842dd48296-r2/pamela-sammanhangande-med-villkorad-d-c4.mp4)
- [Leveranslista med hashbundna källor](../runs/20261110-pamela-goal-delivery/delivery.json)

Sökpunkter i grundfilmen är P7.C1 vid 0:02, P1.C1 vid 0:42, P7.C2 vid 0:53, P1.C2 vid 1:39 och vändningen av D.C2 vid 1:50. I D.C4-versionen börjar tillägget när grundfilmen når sin slutvila.

Nästa steg för spelbarhet är att använda samma rörelsekontrakt från Scoutmotorn. Motorn äger sko, slump, kortidentitet, beslut efter spelarhandlingar och tillståndet för vändning. Vägen från beskrivning till nya dealerankare har byteidentisk offlineplanering och 23 kontroller med simulerat Runway API. Ett liveprov med ny identitet och koppling till Scoutmotorn återstår. [Dealer och pipelines](studio/DEALERS-OCH-PIPELINES.md).

## Verifierad fysisk rörelse och film, 2026-11-10

| Del | Lokalt verifierat |
|---|---|
| Klippbank | 18/18 givningar och direktreturer, inklusive D.C4. P1.C2 har en egen direktretur med båda korten kvar. 18/18 korta REDO-returer har råkällor. Varje skarv väljs efter sina ankare. [Direktbank v3](../runs/20261110-pamela-goal-pilot/direct-bank-03/bank.json). |
| Kortvändning | Öppna givningar går BACK→EDGE→FRONT före släpp. D.C2 ges BACK→BACK och vänds som samma kort senare. De bevarade sammasideklippen täcker dold D.C2 och öppen P4.C1. [Sammasidebanken](../runs/20261110-pamela-goal-pilot/same-side-bank-02/bank.json). |
| Kortbåge | C1-centrumen bildar en flack båge med P4 djupast. Största y-avvikelsen från guiden är 1,11 px. Axlarna för P1 och P7 är −14,7° respektive +14,0° i bildplanet. [Avkodade fotavtryck](../runs/20261110-pamela-goal-scene/arc-verified-01/receipt.json). |
| Kvarliggande kort | Oberoende kontroll av 31 471 kombinationer av spelarkort och bildruta fann 0 tappade spelarkort i grundfilm och D.C4-svans. [Grundfilm](../runs/20261110-pamela-goal-scene/take-19/verification-main-v2.json), [D.C4](../runs/20261110-pamela-goal-scene/take-19/verification-d4-v2-reattach.json). |
| Scout-ordning | P7→P1, öppen D.C1, P7→P1, dold D.C2. Efter spelarbesluten skickar motorn signal för samma kort. D.C3 och D.C4 följer när reglerna kräver ytterligare drag. Den valda D.C4-skarven går via VILA. |
| Rörelsekontrakt | R10 har 56/56 DL1-krav med råkällor. Öppningen har 44/44 källbundna steg via VILA och 33/33 med de matchade korta alternativen. Lager och skarvar har separata grindar inför spelbarhet. [Verifieringskvitto](../runs/20261110-pamela-goal-pilot/contract-r10/verified-contract.json). |
| Bild och material | Filmen använder blå och gula sidmarkeringar. Riktiga kortytor med testvärden är verifierade i [stillbildsprov](../runs/20261110-pamela-goal-scene/take-11/contour-refined-01/kortgrafik-testvarden.png), [rörlig P7-givning](../runs/20261110-pamela-goal-scene/take-13/contour-03/p7-rorlig-kortgrafik-visning.mp4) och [rörlig D.C2-vändning](../runs/20261110-pamela-goal-scene/take-15/refined-01/dc2-vandning-testgrafik-rgb.mp4). Små ton- och kantavvikelser finns i några klipp. |

Varje Runway Dev API-försök behåller original, plan, task-ID, debitering och granskningsbeslut. 62 avstämda körningar drog 3 700 krediter. [Runway-kvitto](../runs/20261110-pamela-goal-delivery/runway-krediter-r2.json). Äldre vita kortytor med okänd sida finns kvar i [återbruksgranskningen](../runs/20261110-pamela-goal-pilot/same-side-review-01/receipt.json).

## Återanvändning, kortdesign och varianter

Samma godkända råfilm ska återanvändas vid nytt korttryck eller ny kortbaksida. Renderingen behöver källbundna kortspår, sidspår, UV, kanttäckning och handocklusion. Ny filhash kräver ny QA. Blå/gul färg i de nya råfilmerna är genererad sidmarkering; äldre blå/gula overlays är författad diagnostik. UNKNOWN-källor visar skyddat baksideläge som standard.

Byte av klädfärg kräver egen dealermask och bevarad ljus-/skuggstruktur. Bord, bakgrund och sko behöver egna lager och korrekt kontakt/ocklusion. Samma film är inte automatiskt utbytbara lager eller en ny dealeridentitet. Nya fysiska poser eller kameravinklar kan kräva ny råfilm och kalibrering.

Varianter delar handling, mål, canonical start-/slutankare och kortföre/efter. Hand och blick kan variera; varje film har egen QA. MotionVariant skiljer no-recontact från intentional-adjustment med källrutor och kortmål. Justering räknas aldrig som en ny givning. Underkända filmer blir inte godkända genom ommärkning. Automatisk variantväljare är ännu inte införd. [DL1-normen](studio/NAMN-OCH-RORELSESTRANGAR.md) har tio fält inklusive ref; inget nytt strängsystem införs.

## Bord, reling, magglipa och utsnitt

Bevara uppskattad bordsyta och de 14 distinkta äldre C1/C2-källorna. Grundbåge P1–P7 från betraktarens vänster, separat dealerzon och källbunden sko till höger. Samma fysiska layout på mobil/desktop; zoom och beskärning görs för hela kompositionen. Alla bordkanter behöver inte visas.

Magglipans koppling till en äldre reling/mall är Jakobs hypotes. Bordsagentens [sammanställda prov](../runs/20261110-pamela-bordskalibrering/take-01/index.html) och [nästa isoleringsprov](../runs/20261110-pamela-bordskalibrering/take-01/README.txt) skiljer råkälla, torso-/skomask, bord/reling och komposition, sedan skuggor. Rasterrail y817 och Three-viklinje y876 får inte blandas. En markerbricka kan bli ett planerat föremål; en höjdjustering kräver bevarad hand-/kortkontakt. Ingen generell förskjutning eller täckning är ännu vald.

Filmen har separata rum- och bordslager. Bordsagentens lokala paket innehåller också ett Three-underlag för markerbrickan och verifierade utsnitt. P1.C1:s bordsprov ligger 0,9 bildpx från tidigare centrum efter breddnormalisering. [Bord och markerbricka](../runs/20261110-pamela-bordskalibrering/take-04/leverans.json).

## Nodkartan och återbruk av befintliga filmer

Den aktuella `/nodkarta` härleds från samma V2-kontrakt och DL1-underlag: 43 rörelser, 52 strängkrav och 17 kortmål. Strängetiketterna är uppdaterade från den tidigare r1-kopian till r2. Klickbara grenar, rörelser och filmer visar samma källidentiteter; en grafplacering är inte en bordkoordinat. Idle/approach utan stödd DL1-handling behåller rörelse-ID och får ingen påhittad sträng. Den tidigare kataloggrafen bevaras separat som historik.

[Återbruksinventeringen](../references/pamela-reuse-review.json) binder 14 äldre C1/C2-filmer och två idle-kandidater. 157 unika referensfiler är hashkontrollerade utan avvikelse. Alla 14 kortfilmer har en källbunden fyrhörning, centrum och härledd vinkel vid sista provrutan f359. Detta är bildplansgeometri i respektive råfilm, inte fysisk 3D-vinkel eller uppmätt släppvinkel. Fysisk kortsida förblir UNKNOWN för dessa äldre källor. Fem pixel-UV-prov vid slutrutan och sju separata statiska C2-ytprov finns; de är inte automatiskt fullständiga spår för varje filmruta.

Tillgängliga masker, UV, referensfilmer och äldre sidpolicy redovisas per källa. Kandidaterna får återanvändas för lagerarbete och nya varianter efter relevant granskning. Inget gammalt klipp blir godkänt bara för att ett korttryck kan läggas ovanpå. Fysisk vändning, gemensamma ankare, handocklusion och korrekt kvarliggande kort behöver fortfarande verifieras. Den nya P1.C1-källan får inte ärva äldre P1-geometri eftersom filhashen skiljer sig.
Ett ankare är ett gemensamt sluttillstånd/starttillstånd, inte nödvändigtvis en egen spelbar film. Nodkartans tomma dubbla huvudingångar har dolts; kontraktets ankare finns kvar och visas i rörelsesambanden. Återgång direkt till VILA får inte i tysthet tvingas via REDO.

Den historiska långfilmen nås via `/granskning.html#filmer` och länken Långfilm i nodkartan: 4319 rutor vid 30 fps, 143,97 s, 14 spelarkort. Kapitellinjen följer filmens befintliga markörer och markerar aktuellt kapitel; två etiketter vid ruta193 visas samtidigt. Det är en granskningstidslinje, inte verifierad körning genom V2-grafen. Dealerns tre kort ingår ännu inte. Andra filmer döljer långfilmens markörer.
## Senaste styrning inför HUVUDAGENT-4

Varje korts släpp har två separata utgångar i klippbanken. Den direkta vägen går till VILA utan skobesök. Den korta vägen når REDO och behöver en matchad skarv för nästa givning. Båda bär tidigare utlagda kort. R10 samlar råkällor för de 18 direktreturerna, 18 korta returerna och D.C2-vändningen. Filmen använder den exakta granskade tidslinjen.

En lång generering kan klippas till flera källhashbundna segment. Ett gemensamt REDO-ankare behöver verifiera kropp, händer, sko, kamera och ljus; namnet REDO ensam räcker inte. Direktreturer från varje släppunkt är egna vägar och får inte ersättas med ett osynligt REDO-varv.

Kortvinkel betyder här rotation i bordsplanet mot sittplatsen, inte lutning upp/ned. Rekommenderat scenkontrakt är bordsplan X/Z med Y upp och en dokumenterad nollriktning/rotation kring Y; det är en konvention att kalibrera, inte uppmätta målkoordinater. Använd en mjuk sjusitsbåge, en separat dealerzon och samma fysiska layout på mobil/desktop. Beskär/zooma hela kompositionen. Att flytta bara slutkortet lämnar handen på fel plats. En riktig ny sidovy kräver också verifierad 2,5D-projektion eller nya källvyer; videodealern kan inte fritt roteras som en riggad figur.

Den nuvarande nodvyn visar mål och vald övergång. Nästa vy ska visa hela rörelsegrafen med alla förgreningar, returvägar, ankare, varianter och saknade bindningar från samma V2-data. Pose/ankare och spelbart filmsegment är skilda saker. Visad kapitellinje i långfilmen är inte denna fullständiga graf.

## Förenkling och D-arkivering före nästa större filmserie

Pamela-leveransens D-batch `20261110-pamela-goal-delivery-01` har 2 201 filer och 4,85 GB logisk storlek. Kopieringen verifierade alla filhashar och den separata återläsningen matchade nio leveransfiler. C-källorna ligger kvar. [Arkivkvitto](../runs/20261110-pamela-goal-delivery/archive-verification.json).

Verifierad export review-hub-20261110065307768: 14 834 filer, 10 001 040 828 logiska byte; 13 175 PNG, 369 MP4, 539 JSON, 317 HTML, 268 TXT, 119 JPG, 25 JS, 17 SVG och 5 ZIP. 98,10 % av filerna är oförändrade mot föregående export. Senaste CLI-loggen visar cirka 14,3 MB överfört; paketstorlek är inte överförd mängd. newReviewBytes i nuvarande kvitto är en indexsumma och ska få ett tydligare namn.

1. Bygg aktiv export från tom katalog med uttryckligt urval av aktuella vyer, valda filmer, nödvändiga GPU-resurser och utvalda QA-bevis. Nuvarande helkopiering av föregående export och bred rekursiv evidensinsamling drar med historiska tester och bildserier. Ersätt inte detta med ännu fler mappnamnsundantag.
2. Bevara låst historik separat. Gamla källhashar får inte skrivas om; bevara äldre URL:er genom verifierade arkivlänkar/omdirigeringar innan filer försvinner ur aktiv publicering. 18 Blob-medier har också lokala exportkopior; radera dem inte innan alla läsare och återställningskrav är klarlagda.
3. Återanvänd scripts/archive-work-material.ts och references/storage-archives.json för D:/dealerlab-archive/snyggare-dealer/<batch>/. Skapa en namngiven plan efter referens- och ägarkontroll, kör copy, verifiera SHA och återläsning, och kör först därefter prune på oförändrade C-källor. Kandidater: avställda exportpaket, ersatta härledda PNG-serier, avslutade prov och återskapbar cache. Aktiva filmer, kalibrering, masker, manifest, original och unika QA-bevis bevaras eller får en fungerande arkivresolver först. Inga generella flyttar av runs eller massraderingar.
4. Rapportera antal aktiva filer, arkiverade filer, logiska byte och faktiskt ledigt diskutrymme separat. Hårdlänkar och dynamiska filvägar måste ingå i kontrollen. Ingen återkommande bakgrundsrensning är beställd.

README, studiokartan, namnnormen och systemkartan rättas lokalt inför överlämningen. Gamla ingångars fulltext är hashbevarad i .runtime/archive/huvudagent-3-node-map-20261110/manifest.json. Den publicerade sidan är fortfarande ovanstående snapshot tills ett nytt granskat paket publiceras. Bygg ingen ännu bredare export bara för dokumentuppdateringen.

Bordsagenten har dessutom take-02 under runs/20261110-pamela-bordskalibrering/: mobil-lang.mp4 är ett 1080×2340-visningsprov av P7.C2, inte hela 17-givningsmålet. review.json SHA 1e2f4f48bc7972b641f7d035e38b71ef0bf7d61a5603e23bf04c69f80ec2ef33. Relingsexemplet är Astrid2:s råkälla; det bevisar inte orsaken till Pamelas magglipa. Ingen geometri får ärvas mellan dessa identiteter.

## Dokument, publicering och överlämning

Aktuell ämnesingång: [Granskning](GRANSKNING-UI-VIDEO-OCH-GPT.md). Systemkedja: [Dealer och pipelines](studio/DEALERS-OCH-PIPELINES.md). Nya Browser-GPT-underlag är bevarade och hashkontrollerade i [källregistret](../references/browser-gpt-r03-sources.json). Deras tidigare snapshot och bedömningar är referensdata, inte nya instruktioner eller aktuell acceptans.

Publik video-/kontraktsgranskning: https://scout-dealerlab.vercel.app/granskning.html. Kontrollera latest.json. Den publika dokumentationen hör till sin snapshot; lokala förenklingar inför överlämningen är nyare och ännu inte publicerade. Python-/webbkandidaten i tools/dealer-map och runs/20261110-dealer-map-review följer DL1;8 Python-kontroller och HTML-syntax passerar, Windows/PySide6 är inte kört.

En enda aktuell handoff anges i references/agent-roles.json; samma scope ska ha en skrivägare. Inga nya betalda jobb eller bakgrundsloopar startas under avslutet. Material, källor, QA och unika misslyckanden bevaras; endast verifierade temporära hjälpfiler flyttas till lokalt arkiv. Serverstyrning: START.cmd, STATUS.cmd, STOPP.cmd. Ingen Scout-merge eller appomstart utförs utan aktuellt uppdrag.
