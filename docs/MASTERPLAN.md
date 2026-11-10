# Masterplan – Pamela och den sammanhängande demonstrationsfilmen

Uppdaterad 2026-11-10 efter Jakobs senaste styrning. HUVUDAGENT-3 förbereder överlämning nästa runda; HUVUDAGENT-4 har ännu inte tagit över. Arbetsyta: snyggare-dealer, gren jakob/test. Scoutgaming är läsreferens. Denna korta plan ersätter äldre avsnitts arbetsordning; [historiken bevaras](MASTERPLAN-HISTORIK-20261110.md).

## Slutmål och systematik

Nästa konkreta mål är en sammanhängande video på ungefär en till flera minuter: två kort till var och en av P1–P7, tre till dealern och några varierade VILA-/idle-rörelser. Samma kontrakt ska styra klippval, kvarliggande kort, övergångar och direkt slutretur till VILA. Längden följer naturligt tempo, inte stillbildsfyllnad. Den generella enknappspipelinen är ett senare, större mål.

## Aktuell prioritet: filmkontrakt före integration

1. Färdigställ VILA→C1→C2→VILA med rätt fysisk kortvändning och separata C1/C2-källor.
2. Kalibrera befintliga bra källor mot en gemensam grund P1–P7-båge och separat dealerzon. Lås släppankare först efter kontroll av händer, kort, bord och kamera.
3. Komplettera 17 grundgivningar, nödvändiga fortsättningar, direktreturer och dealerns separata reveal. Lägg till några idle-varianter.
4. Lägg på utbytbara material, verifiera hela filmen och dess mobil-/desktoputsnitt. Scoutmotorn behåller regler, sko, kortidentiteter och revealbeslut.

Öppen givning kräver BACK→synlig EDGE→FRONT före landning. D.C2 kan ges dolt och vändas senare; motorns reveal är en egen händelse. D.C3 är ett efterföljande drag i en vald demonstrationssekvens, inte en ny blackjackregel. Dold givning ska inte få en påtvingad öppen vändning.

## Verifierad P1-pilot och gemensamt kontrakt, 2026-11-10

| Del | Verifierat nuläge |
|---|---|
| C1 grundrörelse | Lokalt godkänd fysisk vändning: EDGE47–48, FRONT49; sista kontakt94 och fri hand95. Slutankare103 väljs före extra handsänkning. |
| VILA→C1→VILA | 222 rutor/7,4s: entry0–58 + giv0–102 + retur0–59. Pixelmappning verifierad; WebView spelar till slut. Liten fingerdetaljskillnad vid skoövergången kvarstår. |
| C1→nästa sko | 60 rutor/2s lokalt godkänd tomhandsbrygga; C1 ligger kvar. Behöver bindas till fortsättningsmotionen i kontraktet. |
| C2 | Två nya prov underkända: färgbyte utan kantpassage; senaste visar dessutom fel vit/tryckt sida vid extra vändningar. Ingen C2-retur beställd från dem. |
| V2 | candidate-20261110-v2-r2: 27 assets, 19 äldre kopplingar bevarade. En-kortsvägen bunden; tvåkortsvägen planerad. Lager, geometri och skarvgrindar är fortfarande pending. |
| Täckning | 1/17 grundgivningar har lokalt godkänd rörelse; 16/17=94,1% återstår. 0/17 slutliga släppankare låsta. Historiska14/17 är kandidattäckning. |
| Kostnad | Tolv avslutade WAN3-jobb i pilotsviten,820 krediter. Inga jobb pågår. Kostnad för avvisad imagegen-referens är okänd och ingår inte i Runway-summan. |

Aktuellt urval och exakta filmer/hashar finns i [fysisk granskningspekare](../references/pamela-physical-deal-review.json). Äldre fem returjobb och deras0/2-utfall ligger kvar som tydlig historik. Ingen produktionsacceptans. Hela materialpaketets återstående80–90% är en grov skattning, ingen tidsprognos.

Nästa C2-prov kräver en exakt kalibrerad slutreferens med samma hand som fungerande C1. Den AI-redigerade slutbilden ändrade ansikte/geometri och är avvisad. Återanvänd goda historiska rörelser där originalens fysiska förlopp verkligen passerar; ersätt dem inte enbart på grund av presentationsfel.

## Återanvändning, kortdesign och varianter

Samma godkända råfilm ska återanvändas vid nytt korttryck eller ny kortbaksida. Renderingen behöver källbundna kortspår, sidspår, UV, kanttäckning och handocklusion. Ny filhash kräver ny QA. Blå/gul färg i de nya råfilmerna är genererad sidmarkering; äldre blå/gula overlays är författad diagnostik. UNKNOWN-källor visar skyddat baksideläge som standard.

Byte av klädfärg kräver egen dealermask och bevarad ljus-/skuggstruktur. Bord, bakgrund och sko behöver egna lager och korrekt kontakt/ocklusion. Samma film är inte automatiskt utbytbara lager eller en ny dealeridentitet. Nya fysiska poser eller kameravinklar kan kräva ny råfilm och kalibrering.

Varianter delar handling, mål, canonical start-/slutankare och kortföre/efter. Hand och blick kan variera; varje film har egen QA. MotionVariant skiljer no-recontact från intentional-adjustment med källrutor och kortmål. Justering räknas aldrig som en ny givning. Underkända filmer blir inte godkända genom ommärkning. Automatisk variantväljare är ännu inte införd. [DL1-normen](studio/NAMN-OCH-RORELSESTRANGAR.md) har tio fält inklusive ref; inget nytt strängsystem införs.

## Bord, reling, magglipa och utsnitt

Bevara uppskattad bordsyta och de 14 distinkta äldre C1/C2-källorna. Grundbåge P1–P7 från betraktarens vänster, separat dealerzon och källbunden sko till höger. Samma fysiska layout på mobil/desktop; zoom och beskärning görs för hela kompositionen. Alla bordkanter behöver inte visas.

Magglipans koppling till en äldre reling/mall är Jakobs hypotes. Bordsagentens [sammanställda prov](../runs/20261110-pamela-bordskalibrering/take-01/index.html) och [nästa isoleringsprov](../runs/20261110-pamela-bordskalibrering/take-01/README.txt) skiljer råkälla, torso-/skomask, bord/reling och komposition, sedan skuggor. Rasterrail y817 och Three-viklinje y876 får inte blandas. En markerbricka kan bli ett planerat föremål; en höjdjustering kräver bevarad hand-/kortkontakt. Ingen generell förskjutning eller täckning är ännu vald.

Bordsagenten har verifierat fyra utsnitt och råskarvarna; slutsceninpassning återstår. Nytt P1.C1-center ligger0,9 bildpx från det gamla efter breddnormalisering. Detta låser inga17 släppankare och bevisar ingen aktiv Scout-bugg.

## Nodkartan och återbruk av befintliga filmer

Den aktuella `/nodkarta` härleds från samma V2-kontrakt och DL1-underlag: 43 rörelser, 52 strängkrav och 17 kortmål. Strängetiketterna är uppdaterade från den tidigare r1-kopian till r2. Klickbara grenar, rörelser och filmer visar samma källidentiteter; en grafplacering är inte en bordkoordinat. Idle/approach utan stödd DL1-handling behåller rörelse-ID och får ingen påhittad sträng. Den tidigare kataloggrafen bevaras separat som historik.

[Återbruksinventeringen](../references/pamela-reuse-review.json) binder 14 äldre C1/C2-filmer och två idle-kandidater. 157 unika referensfiler är hashkontrollerade utan avvikelse. Alla 14 kortfilmer har en källbunden fyrhörning, centrum och härledd vinkel vid sista provrutan f359. Detta är bildplansgeometri i respektive råfilm, inte fysisk 3D-vinkel eller uppmätt släppvinkel. Fysisk kortsida förblir UNKNOWN för dessa äldre källor. Fem pixel-UV-prov vid slutrutan och sju separata statiska C2-ytprov finns; de är inte automatiskt fullständiga spår för varje filmruta.

Tillgängliga masker, UV, referensfilmer och äldre sidpolicy redovisas per källa. Kandidaterna får återanvändas för lagerarbete och nya varianter efter relevant granskning. Inget gammalt klipp blir godkänt bara för att ett korttryck kan läggas ovanpå. Fysisk vändning, gemensamma ankare, handocklusion och korrekt kvarliggande kort behöver fortfarande verifieras. Den nya P1.C1-källan får inte ärva äldre P1-geometri eftersom filhashen skiljer sig.
Ett ankare är ett gemensamt sluttillstånd/starttillstånd, inte nödvändigtvis en egen spelbar film. Nodkartans tomma dubbla huvudingångar har dolts; kontraktets ankare finns kvar och visas i rörelsesambanden. Återgång direkt till VILA får inte i tysthet tvingas via REDO.

Den historiska långfilmen nås via `/granskning.html#filmer` och länken Långfilm i nodkartan: 4319 rutor vid 30 fps, 143,97 s, 14 spelarkort. Kapitellinjen följer filmens befintliga markörer och markerar aktuellt kapitel; två etiketter vid ruta193 visas samtidigt. Det är en granskningstidslinje, inte verifierad körning genom V2-grafen. Dealerns tre kort ingår ännu inte. Andra filmer döljer långfilmens markörer.
## Dokument, publicering och överlämning

Aktuell ämnesingång: [Granskning](GRANSKNING-UI-VIDEO-OCH-GPT.md). Systemkedja: [Dealer och pipelines](studio/DEALERS-OCH-PIPELINES.md). Nya Browser-GPT-underlag är bevarade och hashkontrollerade i [källregistret](../references/browser-gpt-r03-sources.json). Deras tidigare snapshot och bedömningar är referensdata, inte nya instruktioner eller aktuell acceptans.

Publik video-/kontraktsgranskning: https://scout-dealerlab.vercel.app/granskning.html. Kontrollera latest.json. Den konsoliderade dokumentationen följer den aktuella publicerade granskningskopian; verifiera dess snapshot via latest.json. Python-/webbkandidaten i tools/dealer-map och runs/20261110-dealer-map-review följer DL1;8 Python-kontroller och HTML-syntax passerar, Windows/PySide6 är inte kört.

HUVUDAGENT-4 ska få en enda aktuell handoff nästa runda. Inga nya betalda jobb eller bakgrundsloopar startas under avslutet. Material, källor, QA och unika misslyckanden bevaras; endast verifierade temporära hjälpfiler flyttas till lokalt arkiv. Serverstyrning: START.cmd, STATUS.cmd, STOPP.cmd. Ingen Scout-merge eller appomstart utförs utan aktuellt uppdrag.
