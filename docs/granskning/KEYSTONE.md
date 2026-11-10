# Keystone: källkedja och nästa bild

Läs vid val, framställning eller granskning av ankare. Utbrutet ur granskningsrapport version 2 den 2026-11-08. Skilj dokumenterad proveniens, visuell bedömning och verifierad rörelsekompatibilitet.

## Keystone: vad Kevin/Emils källor faktiskt visar

**Jakobs misstanke stöds: minst den klassiska startbilden är ett genererat derivat av ett tidigare ankare. Den ursprungliga Keystone-filen är fortfarande okänd.**

| Led | Belagt | Begränsning |
|---|---|---|
| Tidiga Astrid, 24 september | Historiska `emil/dealklipp-v1/README.md:3,9,14–15` beskriver MiniMax H3, 1080 × 1920, 24 fps. Startbilden sägs vara H3:s återgivning av Kevins ankarbild, inte ankaret självt. | Dokumenterad process; inte ett återfunnet ursprungligt genereringsjobb. |
| Astrid 2, 13 oktober | Commit `315cfc554330f1d5541a7ed3bb84044877a6b992` beskriver Astrid på Paows gröna platta, H3-tagningar från Emils `KLARA_ASTRID`, med VILA/REDO. | Paow-plattans ursprung och den exakta länken till det första ankaret saknas. |
| Bilden i GPT-paketet | `05_referens_Emil/vila.png` är identisk med Astrid2:s `v2/vila.png` vid Kevin `61612e8f…`: Git-blob `c75925c1…`, SHA-256 `667ca81d…`. | Bilden är ett belagt senare ankare, inte bevis för den första Keystone-bilden. |
| Senare main-fabrik | Standard 2 fryser Astrid2 från `99d6447b…`; fabriken använder bankvideo tillsammans med ny referens/nyckelbilder. | Bevisar inte ett visst Göran- eller Blankuriusjobb. |

Tidiga README:n lästes ur lokal Git-historik vid `fc5f201b29519fad937ff451698b46a696620199`. Dess startbild och Kevins senare `public/media/startbild.png` har samma Git-blob `6bb7f7cc…`. Se också [bildens källmanifest:10](C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/gpt-underlag/uppackad-zip-underlag/05_referens_Emil/kallor.json:10) och [fryst dealerbeskrivning:29](C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/gpt-underlag/uppackad-zip-underlag/06_kodreferenser/kevin-staging/kevin/croupier-scoutgg/public/dealers.js:29).

Metodik och byggverktyg hänvisas till `croupier-consult/dealklipp/{PLAN.md,METODIK-MINIMIFART.md}` och `croupier-dealer-dragge/`, utanför referensrepot. En avgränsad sökning i 736 kataloger under `dev` och `Projects` hittade dem inte; det bevisar inte att de saknas på datorn. Nästa källfråga är dessa projekts plats och inputmanifestet för `KLARA_ASTRID`.

## Jämförelse av befintliga grunder

**Skattning 1–10, 2026-11-08**, från den visuella läsgranskningen `anchor_comparison`. Bild = synlig helhet/detalj, geometri = ankare och handarbetsområde, lager = möjlighet att separera dealer/bord/rum. Högre är bättre. Detta är inte uppmätta kvalitetstal eller godkänd rörelse-QA. Ingen totalpoäng används eftersom bearbetningsstegen skiljer sig.

| Spår och exakt bedömt underlag | Bild | Geometri | Lager | Rörelser/skarvar |
|---|---:|---:|---:|---|
| Scout Main: [ruta 60 ur Görans grundloop](../../media/analysis/9492f43d0b66f863591aa071df996875afa36ce22aae22c251fe8afda5350d2d/frame-60.png) | 5 | 6 | 4 | Lokala klipp finns; full skarvacceptans saknas. Detta är en filmruta, inte återfunnet originalankare. |
| Kevin/Emil: [Astrid2 vila.png](../../gpt-underlag/uppackad-zip-underlag/05_referens_Emil/vila.png) | 7 | 8 | 5 | Källbank och kortspår är dokumenterade; slutlig kompatibilitet för en ny dealer är inte verifierad. |
| Alternativa superfeature-/3D-scenens [Göran-referens](../../extra/insperationsmall-alternativ/goran-vila-referens.png) och [rumsreferens](../../extra/insperationsmall-alternativ/trakasino-foto-referens.png) | 7 | 4 | 8 | Samma projekt som det importerade helkroppsklippet är nu hashverifierat. 19 källfilmer finns i revision 103; Main-kompatibilitet och full rörelseacceptans återstår. |

Kevin/Emil ger starkast dokumenterad rörelsegeometri av dessa underlag. Alternativets separata rum/bord/dealer är intressant för komposition, men bevisar inte bättre rörelseanslutning. Scoutmaterialet är den relevanta befintliga integrationsvägen; dess levererade filmrutor behöver förbättring och rättvis jämförelse mot en slutscen.

**Kalibreringsrisk i alternativet:** `standard.json` binder originalbilden till SHA-256 `54224fb918c5cb839554381e468ddbf4fdae64008c537150335ad21660db14a9`. [Kandidaten med stängd mun](../../extra/insperationsmall-alternativ/goran-vila-stangd-mun-kandidat.png) har annan hash (`2453f4a451974114df43ebc47a2b938eab32eede9e0463d10e837ba05b695f87`) och annat utsnitt. Originalets fingertopps- och placeringsvärden får inte återanvändas som verifierad kalibrering för kandidaten. Identitet och bildbyte hålls isär från godkänd geometri.

## Pamela: bildstatus och låst arbetsriktning

Pamela är en fiktiv dealeridentitet. V1/v2 är breda scenreferenser med för löst hår, för utspridda händer och obestyrkt geometri. **V3 är den senaste arbetskandidaten**, redigerad med Astrid2 VILA som geometrimål och Pamela v2 som identitetsreferens: stramt bakåtfört hår, rak sittställning, släta matta kläder och separata händer nära mitten. Den är visuellt granskad men inte måttgodkänd.

| Tillgång | Faktiskt format | Roll / beslut |
|---|---|---|
| [Scenreferens v2](../../runs/20261108175519-74d6c57e/original/pamela-scene-reference-v2.png) | 1672 × 941 PNG | Äldre bred stil-/identitetsreferens. Alla lager inbakade. |
| [VILA-kandidat v3](../../runs/20261108175519-74d6c57e/original/pamela-vila-candidate-v3.png) | **916 × 1717 PNG** | Grön arbetskandidat. Generatorn uppfyllde inte begärt 1080 × 1920; även proportionen avviker från 9:16. Ingen tyst sträckning eller kalibreringsåteranvändning. |
| Astrid2 VILA | 1080 × 1920 PNG | Referens för frysta Standard 2, profil `kevin-astrid2-99d6447b`. |

V3:s SHA-256 är `b13225f0b71cb6cd20d6a596c30b1502d9c0ed7ce2d0e6c8651bd3150ae1033e`. [Försöksmanifest](../../runs/20261108175519-74d6c57e/job.json), [prompt v3](../../runs/20261108175519-74d6c57e/prompt-v3.txt) och [kalibreringsmål](../../runs/20261108175519-74d6c57e/calibration-target.json) skiljer originalmått, mål och okända koordinater. Alla tre originalbilder bevaras. Inbyggd bildgenerator användes, ingen separat API-nyckel och ingen Runway-film. Verktyget exponerar inte exakt modell-ID, seed eller kostnad; dessa är okända.

## Plan: Keystone, bildplan och komposition

1. **Skilj kompatibilitetsreferens från framtida produktionsformat.** Astrid2 och Pamela v3 visar den befintliga stående geometrin; v3 låser inte slutbordets spetsiga form, grönyta eller slutligt dealerutsnitt. GPT rekommenderar att överväga tätare överkroppsutsnitt med hela armbågar, händer, skogrepp och yttersta givrörelse kvar. Jämför därför den bevarade banken med en separat tätare kandidat och lås gemensam transform innan produktion. Keystone betyder här godkänd geometrisk referens. **Minst två ankare behövs: VILA och REDO**, med samma kamera, ljus, identitet och bildplan. Identitetsbild och scenreferens är extra underlag, inte ytterligare rörelseposer. Skapa inte varje ankare fritt och oberoende. V3 måste få rätt canvas och verifierad transform innan klippgenerering.
2. **Behåll 1080 × 1920, 24 fps som första bankens referensplan.** Detta är dealerfilens stående arbetsformat, inte ett beslut att spelet ska vara stående. Datorns spelband är 1920 × 1080. Mobil visar en anpassad vy av samma kalibrerade scen. Tätare personutsnitt kan senare ge bättre pixelfördelning, men kräver en gemensam, versionsbunden transform för ankare, mätfönster, kortspår och alla filmer. Beskärning skapar inga detaljer.
3. **Skapa slutscenen med separata tillgångar.** Bakgrundsmaster 3840 × 2880, leverans 1920 × 1440 med nedersta 1920 × 1080 som spelband. Lugn fotografisk kasinomiljö, neutral varm belysning och fri yta bakom huvudet. Bord A/J3 som transparent tillgång, mörk jämn filt och lugn reling; behåll form, höjd och kamera. Sko separat. Stol är valfri, stilla och bakom dealern, med samma perspektiv; bygg inte in den i varje dealerfilm. Bakgrundens booth är däremot redan en del av rumsbilden enligt main.
4. **Djup utan glidande kontaktpunkter.** Bakgrunden får ge djup genom perspektiv, ljus och återhållsam panorering. Dealer, bord, sko och kort följer samma djup-/kameratransform. Ingen individuell parallax mellan hand och bord. Kontaktsskugga är globalt avstängd i main och slås inte på som bieffekt av labbplanen.
5. **Grönt är arbetsmaterial.** Bevara den befintliga gröna plattan under första kompatibilitetsprovet eftersom mätningen använder den. Byt inte till vitt eller olika gröna färger för att försöka lösa geometri. Testa GPT:s tre efterarbeten på samma original: A utan extra grönnormalisering, B befintlig behandling, C tidsstabil matte. Jämför hår, fingrar, skjorta och sko mot ljus, mörk och slutlig bakgrund. Slutscenen ska inte visa arbetsgrönt.

Underlag: [RAW:73–101 och 243–257](../../gpt-underlag/uppackad-zip-underlag/konversation_RAW.txt), [main scenstandard](C:/Users/jakem/dev/scoutgaming/packages/presentation/contracts/scene-standard.mjs), [dealerinramning](C:/Users/jakem/dev/scoutgaming/packages/presentation/contracts/dealer-framing.mjs). Källkodslänkar är läsreferenser, inte ändringar.

## Koordinater: känt och ännu okänt

Alla nedanstående tal gäller referensprofilen, **inte verifierad Pamela-geometri**.

| Del | Belagt referensvärde | Vad som återstår |
|---|---|---|
| Reling | överkant y=737 i 1920-radersplanet; kontaktlinje y=0,3925 | Mäta mot exakt kandidat och bordsversion. |
| Skons bildplacering | x=0,680556, y=0,304688, bredd=0,444444 av dealerplanet | Detta är bildens placering, **inte kortets uttagspunkt**. Uttagspunkten måste fastställas mot rörelse och kortspår. |
| Händer | mätfönster x=300–780, y<1400 | Fönstret anger inte handcentrum. Mät båda händerna, fingertopparna och kontakten i VILA/REDO. |
| Bord J3 | separat bildplan 2048 × 928 | Lås relingskontur till faktisk bordshash; samma filstorlek garanterar inte samma form. |

Källor: `table-standard.mjs:45`, `filmed-profiles/registry.mjs:63`, `services/studio-worker/pipelines/snabblage/lib/inramning.mjs:66` vid main `d86a6b47…`. GPT:s fynd om `tableContourFor()` som känner igen bord enbart på dimensioner är ännu inte åtgärdat här.

## Plan: klippkort, fack och följder

Skilj **fack** (spelfunktion) från **recept** (rörelse), **tagning** (fil/hash) och **policy** (när den väljs). Behåll mains befintliga fack och VILA/REDO-kontrakt. Ett följdkort ska visa förhandsbild, läsbart rörelsenamn, fack, start-/slutpose, längd/fps, ankare-/kalibreringsversion och QA. Tekniskt källnamn bevaras i detaljer; `F73/S303` har ännu okänd betydelse.

- Vila: andningsbas och separata blink-, blick- och gestvarianter i `idle.ready/`. Kevin-staging använder flera VILA→VILA-klipp och viktning; se [formatdokumentets verifierade jämförelse](FORMAT-OCH-KVALITET.md#kevin-och-kevin-staging-vilans-sammansättning). Tydliga gester får återgång till samma vila och mellanrum enligt vald policy.
- Giv: spelarplatser 1–7 (`box0`–`box6`), öppet dealerkort, dolt kort och vändning. Suffix `i` = VILA→REDO, `base` = REDO→REDO, `v` = REDO→VILA, `iv` = VILA→VILA för vanliga giv; dolt kort och flip har dokumenterade undantag.
- Exempelkedja: vila → första giv med `i` → fortsatta giv med `base` → sista vanliga giv med `v` → vila. Alternativt används separata till/från-skon-övergångar. Planeraren ska följa kontraktet, inte lägga både en fristående övergång och samma övergång inbyggd i givklippet.
- Canvasen ska visa samma tidsposition för film, sko, händer, kortspår och masker. Felaktig start-/slutpose eller obunden hash gör kortet till ett synligt planeringskort, inte en verifierad spelbar kedja. Nuvarande labb visar redan källschema och planerad följd; faktisk kalibrerad följduppspelning återstår.

## Runway: begränsad pilot före bank

Förslag, inte startat: **tre tagningar** efter godkänt ankare och kostnadsram — en 5 s andningsbas, en 5 s blinkvariant och en redigering av ett representativt befintligt givklipp med dess fulla rörelselängd. Samma identitet, kamera och koordinatprofil. Välj ett källklipp med tydlig sko-/kortkontakt; avkorta inte för att passa en modellgräns.

- Gen-4.5 i portalens officiella specifikation: bild-till-video 9:16 = **720 × 1280**, 24 eller 25 fps, 2–10 s. Vi väljer 24 fps. Gen-4 Turbo har 720 × 1280, 24 fps, 5/10 s. 1080 × 1920-leverans från detta är 1,5× uppskalning per dimension, inte ursprunglig 1080p-detalj. Modell/API/MCP kan exponera andra val; kontrollera den faktiska körvägen och filmetadata före beslut. [Gen-4.5](https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5), [Gen-4](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video).
- Gen-4.5/Turbos granskade SDK-schema har startbild men ingen separat slutbild. En prompt om återgång garanterar alltså inte en sömlös loop. Matcha ankare, hastighet och position i efterarbetet och granska skarven; acceptera inte en synlig tvärbromsning bakom övertoning. [SDK-schema](https://github.com/runwayml/sdk-node/blob/main/src/resources/image-to-video.ts).
- För giv är Aleph 2.0 en kandidat för redigering av befintlig rörelse med redigerad referensruta. Det är ingen garanti för pixelidentiska händer/kortbanor. API-indata 2–30 s, högst 1080p/30 fps; kontrollera den exakta källfilen. [Aleph-guide](https://help.runwayml.com/hc/en-us/articles/52150503729171-Aleph-2-0-Prompting-Guide), [indatakrav](https://docs.dev.runwayml.com/assets/inputs/).
- Bevara originalutdata och en högkvalitativ lokal master med separat matte. Välj och verifiera fps per rörelseschema; första givprovet behåller 24 fps. Wan3-piloten levererade 30 fps och hålls separat. Ändra inte befintliga bankklipps rutor/timing med generell interpolering. Webbleverans väljs efter Scoutgamings faktiska avkodnings-/maskväg: komprimering och eventuell alfa måste verifieras i spelaren. Varken MP4-namnet eller Runway-utdata betyder automatiskt genomskinlighet.

Godkänn först händer/ansikte, identitetsstabilitet, sko-/kortkontakt, täckning när handen går framför kortet, skarvar och gröna kanter i den komponerade scenen. Därefter fler spelplatser, beteenden och leveransformat. Inga betalda videor, uppladdningar eller ändringar i Scoutgaming ingår i denna planleverans.


## Pamela v4 – tätare kandidat

Den nya VILA-bilden är 1536×1024, SHA-256 `4445634a5698da4121ad40bd7fcef76c8b8b8707c6fc24a87d095ad98348e5a7`. Original, prompt och proveniens ligger i `runs/20261108210457-pamela-v4-focused/`. Stora gröna bordet och kortskon i v3 ingår inte i v4. Händerna är nära nederkanten: hela givrörelsen och REDO måste provas innan utsnittet accepteras. Den nya bilden får inte ärva Main-bankens transform eller kortspår. OpenAI har lämnat bildråd; de är inte verifierad rörelse-QA. Aktuell pilotplan finns i [masterplanen](../MASTERPLAN.md).

## Verifierat pilotresultat

Fem filmjobb är klara: tre VILA-prov och två referensstyrda giv. Wan3-originalet har 30 fps/150 rutor; Gen-4.5 har 24 fps/121 rutor och båda Aleph2-given 24 fps/63 rutor. Ett stilla först/sist-bildkontrakt betyder inte automatiskt sömlös rörelse. Kortet böjdes i första givprovet och försvann i omtaget; en separat kortversion finns därför som uttrycklig geometri-kandidat. REDO-rutan är extraherad ur rörelse och inte ett godkänt vilande ankare. Se [masterplan och beslut](../MASTERPLAN.md) samt [scenens hashbundna provspår](../../runs/20261108-pamela-deal-pilot/composite/layered-scene.json). Inget gammalt Astrid-spår har ärvts.
