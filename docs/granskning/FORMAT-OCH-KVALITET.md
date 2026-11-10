# Format, begrepp och kvalitetsgranskning

Läs vid klippnamn, import, rörelsekontrakt och QA. Utbrutet ur granskningsrapport version 2 den 2026-11-08; historiska källor är oförändrade.

## Helbank med tvåsidiga kort: reproduktion

- Aktuell fryst plan är runs/20261110-pamela-two-sided-bank/take-02/plan.json, SHA 0bc91fb10ba7c77fa9ea4b2a121f8c14be9edffeceb19420849fc2753e443223. Skapa alltid ny take med tools/pamela-two-sided-bank-plan.ts; kör preflight före tools/pamela-two-sided-bank-render.ts --plan=<path> --plan-sha256=<sha>. Ändra inga code[]-filer under renderingen. Källor, keying, material, kalibreringar och scenassets binds från start.
- src/pamela-bank-card-surfaces.ts återanvänder C1:s frysta UV/edge-UV och källspecifika C2-kalibreringar. P1 FRONT0–82/EDGE83–103/BACK104–113/EDGE114–118/FRONT119–359. P6/P7 och C1 är sammanhängande framsidesprov, inget påhittat sidbyte. Alla semantiska sidor UNKNOWN. Kort-ID/frontAllowed måste komma från motorn och kontrolleras vid varje materialisering, inklusive båda FRONT-fönstren på P1.
- Preflight testar två designer, saknad/nekad/obunden identitet och tidigare kort. Fullrendering jämför alla 5 040 RGB-källrutor och skyddade kortkärnor; 0 ändringar utanför papper eller i tidigare kortkärna krävs. Granska native turn-intervall, riktning på alla 14 landningar och färdig uppspelning. JPEG/H264 kan inte användas för exakta förlustfria nollpåståenden. Tvåsidigt innebär inte bevisad fysisk sididentitet på blank rekvisita.
- tools/pamela-two-sided-download-bundle.ts --evidence=<path> --evidence-sha256=<sha> --destination=<ny run/download-bundle> verifierar 14 fullängdsklipp och skapar bytebevarande ZIP (16 poster), aldrig ny encoding. references/pamela-two-sided-bank.json väljer evidence, archive och browserReview. Kompakt helrunda är exakt 4 404 rutor, full 5 486, båda 30 fps; explicit concat-duration förhindrar gamla millisekunddriften.
- R16: tools/pamela-bank-shoe-public-review.ts fryser från verifierad R15, aktuell bank, GPU-/UI-/Astra-kvitton och P1-före/efter. Den gör ingen deploy. Preview: tools/pamela-combined-preview-verify.ts --packet=exports/pamela-loop-review-20261110-r16 --base=<inspekterad URL> --deployment=<inspekterat ID>. Publik byteskontroll: tools/verify-pamela-loop-public.ts med samma packet och faktisk produktionsdeployment. Endast scout-dealerlab/team scoutgaming; R15-återställning bevaras.

## Lokala korrigeringar efter R16

- Kortmasker: src/pamela-bank-mask-refinements.ts är separat käll-/framebunden korrigering; src/pamela-refined-bank-card-surfaces.ts ändrar endast rörlig coverage/bounds före basadapterns paint. Kort-ID, sidePolicy, guard, prior, quad/UV och revealbeslut bevaras. P7 får endast minska grå falskt positiv täckning; P6 får växa nära befintligt neutralt papper med absoluta guard/prior-spärrar. Välj take-02/review-02.json som bevis, inte den tidigare kandidaten.
- tools/pamela-bank-mask-integration.ts <proof-path> <proof-sha> skapar två 12 s-filmer i en ny unik run. Den läser basbankens hashbundna part-JSON, inte bara sammanfattningen. take-01 avbröts före media på schemafel. take-02 avvisades för tre oavsiktliga bounds-/blurändringar på f110/115/183 när maskdelta var noll. take-03 bevarar hela ursprungsgeometrin vid noll maskdelta. Käll-RGB och prior-card-core kontrolleras varje ruta. Ny körning kräver nytt outputnamn och ny QA; gamla filmer/ZIP skrivs aldrig över.
- Integrationstest test/pamela-refined-bank-card-surfaces.test.ts kontrollerar båda faktiska felpixlarna, att nekade framsidor inte slår upp en fronttextur samt exakt geometri/tryck på de tre regressionsrutorna. Agentens 3 masktester och native-intervall täcker kompletterande hand-/prior-/gränsfall.
- tools/pamela-mask-bank-assemble.ts --patch=<proof-path> --patch-sha256=<sha> fryser bas/patch-proveniens, jämför alla 720 källhashar och avvisar bildändringar utan maskdelta. Tolv klipp och fyra yttersegment kopieras med exakt hash; bara två trims kodas om. Konkatenering använder duration=frames/30. Alla 5 486 + 4 404 avkodade rutor måste motsvara basen utanför ersättningsintervallen och avsedd komponent inom dem. Befintlig oförändrad tools/pamela-two-sided-download-bundle.ts kontrollerar därefter paketet.
- Nedladdning: src/pamela-bundle-download.ts kräver den aktuella references/pamela-two-sided-bank.json:s bundle och bundleReceipt. Kvitto, bankbindning, arkivstorlek och streamad SHA måste stämma; övriga ZIP-filer får 404. test/pamela-bundle-download.test.ts täcker bland annat ändrat arkiv med samma storlek, ändrat kvitto, annan bank och privat sökväg. HTTP-bevis: runs/20261110-pamela-mask-bank/take-01/browser-review/zip-http-check.json. Befintliga begränsningar för privata filer gäller även fortsättningsvis.
- P2:s sko är separat profil, inte cirkulär import till bankprofilen. Shaderregistret binder P2-atlas 217b58c2…34e32bc och CPU-evidence 9513931d…ac634. Float32-prov täcker alla 360 P2-rutor/56 286 000 ROI-pixlar. GPU-page/server verifierar alla frysta CPU-kodberoenden; klientens krav härleds ur 47 deklarerade rutor och 5 negativa drag, inte gamla hårdkodade 30/4. Aktuellt GPU-bevis finns i runs/20261110-pamela-shoe-p2/gpu-review.
- Temporal överlapp: src/pamela-temporal-join.ts kräver två sammanhängande nativeintervall och använder båda källornas nästa ruta i varje blandruta. Bortfallen duration=overlap/fps ska stå i metadata. tools/pamela-idle-exit-overlap.ts producerar direkt/4/8/12, nativecroppar och kontroll av 14 fasta kort. Fyra är endast kandidat; 12 har verifierad dubbelkontur. En mindre RGB-differens är inte optisk acceptans, och bearbetat material får inte kallas originalrutor eller en bevisat sömlös källskarv.

- Ny VILA-kedja: src/pamela-idle-chain-plan.ts binder B252–326 (75 originalrutor, inte den gamla 65-rutorsloopen), B289–326, bridge6–89 och bankkompakt222–4268. Fyra ingångsmixar förbrukar bridge86–89 + bank222–225; bankkroppen börjar compact226/källruta21. Kroppen slutar retreat69, retur börjar retreat70. Returens B19–22 blandas med B305–308 och fortsätter B309. Slutvilan B289–326 behåller 14 kort. Ingen automatisk återgång till tomt bord.
- tools/pamela-idle-chain-opening.ts kräver förseglat take-02-ytbevis och review-SHA; tools/pamela-idle-chain-bank-body.ts bevarar centrumkolumner utan skalning före ny H264-kodning; tools/pamela-idle-chain-assemble.ts kräver alla tre komponenternas hash/format, frame-exakt karta, alla 4 319 avkodade framehashar och kontinuerliga packet-PTS. tools/pamela-idle-chain-native.ts extraherar 80 slutrutor/231 nativecroppar vid sju skarvar. Gamla försök skrivs aldrig över; ny körning kräver unikt take och ny QA.
- Material: src/pamela-idle-shoe-card.ts låter anroparen bestämma cardId/frontAllowed/displaySide. UNKNOWN eller nekad framsida hämtar aldrig fronttextur. Typkontroll och nio avgränsade tester passerade vid integration. Varma pappersskuggor och ljusa naglar har skilda masker. Skarven får inte marknadsföras som osynlig; kort hudmjukning och blandkanter återstår.
- Slutbevis runs/20261110-pamela-idle-chain/take-01/review.json skiljer mekaniska garantier, 1×-uppspelning, nativegranskning och öppna användarfynd. Det innebär inte valfri KORT N→VILA-runtime, färdiga landningsprofiler, stabiliserad UV eller godkänd kropp/bordsocklusion.

## Samma tagning med dynamiska lager: reproduktion och kontakt

- Använd installerad Volta-Node 24.21.0. node tools/pamela-card-atlas-build.ts --take=NN kräver en ny tvåsiffrig mapp. Verktyget validerar frysta käll-/maskhashar och jämför alla 360 pappersmasker och rörliga quads mot tvåsidiga take-03. Flytta inte pekaren utan ny QA; den valda atlasen är take-03.
- src/pamela-card-atlas.ts ger separata material, exakt projektiv UV och texelcentrum. Masker är nearest/no-mipmap/NoColorSpace/flipY=false. Tryck är linear/no-mipmap/NoColorSpace/flipY=false och blir linjär scenfärg först efter pappersbelysningen. Opak papperstäckning härleds aldrig ur den nya designens ljushet. Uppspelarens decoded mediaTime styr både källvideo och atlasruta.
- Lagerordning: rum bakom bord; ny skokropp på samma källprojektion bakom kvarvarande dealer/hand; korttryck endast inom native-pappersmask och utanför handskydd. Skons borttagning läser original-RGB före färgändring och skyddar kortmasken. Ursprunglig uttagskrage är en uttrycklig kvarvarande kontaktinsats. Skuggor måste följa kontaktkontraktet, inte fasta ovaler under en upplyft hand.
- P3/P5-skobyte: src/pamela-shoe-bank-profile.ts binder alla åtta identitetsfält; shaderbindning kräver dessutom exakt manifest-bytehash. Masken läser originalets RGB på native texelcentrum och skyddar auditad papercoverage; inga tidsgrindar från andra källor. P3/P5 har 9 940 px kvarvarande kontaktinsats. Lägre precision än highp behåller originalskon. P4 behåller separat beviskedja; dess geometry-kommentarkorrigering är dokumenterad utan semantisk kodändring.
- GPU-bevis skiljs åt: CPU/float32-paritet omfattar 720 rutor; faktisk WebGL2 native-PNG readPixels omfattar 30 kritiska rutor/62 057 640 pixlar med 0 maskskillnader och fyra negativa nollprov. /pamela-prov?view=shoe-gpu kör den avgränsade kontrollen. Kvitto runs/20261110-pamela-shoe-bank/gpu-preflight/evidence.json. Videodekodningens RGB-paritet och obruten optisk allruteacceptans är inte bevisade av PNG-kontrollen.
- Neutral ljusstandard: key snett framifrån till vänster, relativ key 2,2/fill 0,8. Rum och bord är separata; Pamela behåller inspelat ljus. Skons ljus/djup är författat. Ingen fysisk omljusning eller ny kameravinkel är belagd. Rotation låst, pan högst ±0,16/0,07 scenenheter; y=876 är en geometrisk vikning, inte ett kontaktbevis.
- Hand-/kortkontakt för C2-P4 kalibreras separat (återanvänd aldrig dessa tider för P2, P3 eller P5): C2 stöd från 180, hand på C2 180–211, okänt 212–217, separerat från 218. Standard behåller källskuggning. Valbar kantskugga högst 1,25 nativepixlar/alfa 0,06/0,05; inga handellipser. Bevis: runs/20261109-pamela-contact-calibration/take-02/proof.json.
- Kör node --test --test-concurrency=4 test/pamela-card-atlas.test.ts test/pamela-two-sided-card.test.ts test/pamela-card-scene-calibration.test.ts och relevant app-typkontroll efter ändringar. WebView ska visa P4 97→98→99, P2 78→79→89, P3 51→52→67 och P5 87→88→94, hand framför kort, nekad/saknad identitet, separata materialval på oförändrad ruta och hela 0–359. Godkänd maskräkning ersätter inte optisk native-granskning; GPU-läsback och allruteacceptans är separata grindar.
- R15: tools/pamela-four-turns-public-review.ts fryser fyra atlaser och separata VILA/REDO-studier från R14. Kräver godkända avgränsade Astra-kvitton för P3/P5 och deras kompletterande provenance.refs. P2:s äldre validerarsnapshot får endast skilja genom de två nya källraderna; själva valideringskoden jämförs exakt efter radslutsnormalisering. Skyddad preview kontrolleras med tools/pamela-combined-preview-verify.ts --packet=exports/pamela-loop-review-20261109-r15 --base=<inspekterad URL> --deployment=<inspekterat ID>. Bara exakt toolbar-suffix tillåts i preview-HTML; publikt alias verifieras byteexakt. Alla nya paket måste få nytt nummer.
- P2: node tools/pamela-p2-atlas-build.ts --take=NN --calibration-evidence=runs/20261109-pamela-p2-card-calibration/take-05/evidence.json --calibration-sha=94ebd4c1c31015a82dca9c81d371b72172aeabbd867c3da105cd5e8b2dbca183. Ny unik take krävs. Side-gate BACK<79, EDGE79..88, FRONT>=89 med överordnad motortillåtelse. Guard-undantag tillåts endast för exakt dokumenterade fria papperspixlar f75/76. Första kortet bevaras.
- P3/P5: node tools/pamela-turn-atlas-build.ts --seat=3|5 --take=NN --calibration-evidence=<hashbundet evidence> --calibration-sha=<SHA>. Välj P3 take-02 eller P5 take-03 som dokumenterad bas. Ny unik take krävs. Varje avvikande handskyddspixel måste matcha guard-corrections.json exakt; första kortet ska vara oförändrat. P3 BACK<52/EDGE52..66/FRONT>=67; P5 BACK<88/EDGE88..93/FRONT>=94.
- Fullrenderns ursprungliga code[] saknade pamela-key.ts och scenplan/assets. Före export krävs review-astra.json med kompletterande hashrefs och snapshots samt exakt listade reproducerade sceneRgbSha256. Framtida builderrevision bör binda dessa från start. Ändra inte fryst render-evidence i efterhand för att dölja luckan.
- Ny brygga: tools/pamela-idle-ready-bridge.ts är sealed till run-01/plan.json. Endast status på redan sparat task-ID är tillåten fortsättning; inga automatiska POST-återförsök. Återgenerering är ett nytt unikt försök med egen budget. Originalet och native-verification.json bevaras även om visuell QA avvisar integrationen. Nuvarande utgång är inte sömlös.
- VILA: src/pamela-idle-source-projection.ts bevarar native 1764-bredd, en pixels överhäng per sida. Canonical1762-kortlager paddas +1 utan skalning. Använd sju C2-par, inte både C1 och C2 för samma redan utdelade kort. Bevis runs/20261109-pamela-idle-scene-proof/take-02; 103 råfönsterrutor och 311 komponerade exportrutor matchar exakt före visningskodning. REDO-in/utgång är separata grindar.
- tools/pamela-combined-public-review.ts skapade frysta R13 från R12 med explicit --shoe-evidence=.../take-04/evidence.json och --shoe-sha256=ad845c9e4bdafa4d647aeda016ae61554eb2935ebcc8556db110c4647cbddd5b. Verktyget vägrar skriva över existerande packet. Nästa export kräver ett nytt numrerat packet. Kontrollera exakt project/team i exportens .vercel/project.json och via vercel project inspect; endast scout-dealerlab. tools/pamela-combined-preview-verify.ts verifierar skyddad preview med befintlig CLI-inloggning. Efter promotion måste den NYA produktionsdeploymenten inspekteras och tools/verify-pamela-loop-public.ts kontrollera aliasets faktiska bytes. Inga Scout-main/DB/Maud-ändringar ingår.

## Föregående prov: två kortsidor och modulär scen

1. Bind dealer, källa och frame-ID innan materialval. P4-C2:s vändning använder endast SHA 67319ed8…0167, 1762×1174, 360 rutor/30 fps. Källorna är otryckta; BACK/EDGE/FRONT är ett författat presentationsschema, inte uppmätt kortidentitet.
2. Motorn levererar slot-ID, kort-ID och frontAllowed. Förbjuden eller okänd framsida ger concealment utan anrop till frontuppslagningen. Baksida, framsida, UV, täckning och handskydd är separata indata. Börja varje rendering från originalets neutrala plåt; använd aldrig tidigare tryckt utdata som nästa materialbas.
3. Ordning: bakgrund → bord → kvarliggande kort → rörligt kort med observerat handskydd → synliga händer/dealer. Projektiv UV följer källgeometrin. Exakt kantläge kräver ingen inverterbar homografi. Alpha och grönreflex är olika saker; nya maskpixlar måste granskas på originalet och är inte automatiskt accepterade.
4. Reproducera lokalt med node tools/pamela-flip-survey.ts --dense och node tools/pamela-two-sided-proof.ts --full --take=NN, där NN är en oanvänd tvåsiffrig mapp. Fyra nativefilmer + 81-rutors förstoring skapas. Varje film måste behålla fps/frame count. Kontrollverktyget tools/pamela-two-sided-verify.ts avser uttryckligen frysta take-03; välj inte en ny fil genom namnbyte. Tester: node --test --test-concurrency=4 test/pamela-two-sided-card.test.ts.
5. Frysta bevis: runs/20261109-pamela-two-sided-flip/take-03/{evidence,verification,browser-review}.json. WebView granskar sidbytet och oberoende materialval; producerade kontrollräkningar ersätter inte optisk kant-/böjningsgranskning. Ingen live-spelmotor är ansluten till provspelaren.
6. Scenmoduler: pamela-background-layer, pamela-table-layer och pamela-shoe-layer. Bordplan och camera-ray-kontakt hålls oförändrade mellan materialval. Key-ljus uppifrån kameravänster [-3,6,4], fill [4,3,2], endast relativa tal. Rum/bord får profilvariation; Pamelas bakade ljus ändras inte. Kamera högst ±0,16/0,07 scenenheter utan orbit. Ingen fast handskugga under rörelse utan korrekt kontaktspår.
7. Skons källhashgrind gäller C1-P4 (4e252be2…f87c). Materialbyten ändrar sidopanelen; form, kant, öppning och nästa kort bevaras. Full fristående sko kräver separat geometrikalibrering, dold bakgrund och hand-/kortocklusion och är ännu inte verifierad.
8. tools/pamela-modular-public-review.ts bygger ett nytt isolerat exportpaket efter evidenshashkontroll. Vercel-destinationen är endast scout-dealerlab, prj_mQwHzspK3GrrJA04eFOorFxth0d5/team_Scxorb9qtZHjNae1YEQnFCaT. Verifiera publicerade bytes med tools/verify-pamela-loop-public.ts efter inspekterad produktionsdeployment. Inga betalda API-klipp behövdes för dessa materialprov; tio-klippsgränsen per plats kvarstår.

## Gemensamma begrepp

| Benämning i labbet | Alias / tekniskt namn | Viktig skillnad |
|---|---|---|
| Vila | `idle`, händelse/fack `idle.ready` | En funktion under väntan; ingen bestämd fil eller REDO-pose. |
| Vilopose | `VILA`, `pose/vila` | Kroppens och händernas ankarposition. Inte hela vilopolicyn. |
| Grundloop – andning | recept `grundloop`, vilopolicyns `base` | Kandidat/recept och roll för en film. Standardloopen har lugn andning och stilla huvud, blick och händer. |
| Vilovariant | beteende, infall, `beteende:*`, `variants` | Exempelvis blinkning, leende eller klia sig. Separat från standardloopen och givvarianterna. |
| Klippomfattning: Grund / Utökad | tier `grund` / `utokad` | Hur många funktioner som framställs, inte kvalitetsnivåer. |
| Givvariant: grundtagning | `base`, inget suffix | Normalt REDO → REDO. Inte samma `base` som vilans grundloop. |
| Identitetsbild | foto, porträtt | Bestämmer utseendet; behöver inte vara geometriskt användbar i spelet. |
| Scenreferens | godkänd helhetsbild | Visar det visuella målet med dealer, bord och rum tillsammans. |
| Ankare: Vila / Redo | `pose/vila`, `pose/redo` | Kalibrerade bilder med fast kamera, skala och arbetsområde. |
| Keystone | används olika i underlaget | Ange alltid vilken bild och vilket steg. Filnamnstolkningen kan ge VILA, men ordet bevisar inte original eller kvalitet. |
| Klippföljd | rörelseschema / sekvens | Ordning och poseövergångar. Inte samma sak som mediefiler eller uppspelningspolicy. |

Håll isär **dealer → klippfack/händelse → recept → tagning/filhash → roll och uppspelningsregel**. Blankurius har ett identifierat viloklipp i admin; hans publicerade policy och specifika genereringsjobb är ännu inte lästa. Gäspning är ett önskat exempel, inte ett här belagt färdigt klipp.

Ett nytt klipp blir inte automatiskt aktivt: publicerad dealerpolicy väljer grundloop och varianter. Automatiska infall väljs vid klippgränser; ett tidigt avbrott i chattvägen är separat beteende. Direkt upprepning av en grundloop är inte generellt spärrad. Källor: [klippguide:118](C:/Users/jakem/dev/scoutgaming/packages/presentation/contracts/dealer-clip-guide.mjs:118), [nivåer:10](C:/Users/jakem/dev/scoutgaming/packages/presentation/contracts/clip-tiers.mjs:10), [vilopolicy:23](C:/Users/jakem/dev/scoutgaming/packages/presentation/runtime/idle-policy.mjs:23), [klippval:155](C:/Users/jakem/dev/scoutgaming/packages/presentation/runtime/live-idle.mjs:155), [avbrott:303](C:/Users/jakem/dev/scoutgaming/packages/presentation/runtime/live-idle.mjs:303).

## Kevin och kevin-staging: vilans sammansättning

Verifierat 2026-11-08 med lokala refs och `git ls-remote`: `kevin=d96c6eb0e8588e50efdb7640dec1a16dd042579c`, `kevin-staging=61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65`, `main=d86a6b47c85f4b1341e4ffe2a7a49f08800bc544`. Grenarna och historiska Astrid ska inte beskrivas som samma konfiguration.

| Källa | Faktiskt upplägg |
|---|---|
| Tidiga Astrid, `fc5f201b…`, README:36–47 | Sex klipp: still, blink, breath, glance, cheek, insulted. Still = andning; breath inkluderar blinkning. README rekommenderar frekvensordning, inte en enda film med alla rörelser. |
| Classic i aktuell staging, `public/media/manifest.json:9–44` | Fem klipp utan separat blink. Urvalsvikter still 40, breath 14, glance 12, cheek 3, insulted 1. |
| Astrid2 i staging, `public/dealers.js:36–103` | Nio VILA→VILA-klipp plus tre väntbitar. Andas/andasb 20/20, djupandetag 8, blickar 6/4/4, huvud 3/3, fingrar 4. Huvudgruppen viktas om till 20 % av urvalsvikten; detta är inte uppmätt speltidsandel. Kevin-grenen har bara huvud, huvudb och fingrar i denna lista. |
| Rotation | Posematchning, fasval och variationsminne styr. Kevin `idle-chain.js:44` kräver tre mellanliggande klipp mellan huvudrörelser, main `idle-rotation.mjs:36` fyra. |

För Pamela föreslås därför mains befintliga **andningsbas plus separata återgående blink-/blick-/gestvarianter**, inte en ändring som smyger in ett nytt blinkbas-kontrakt. Hela viloupplevelsen blir levande även om basreceptet är återhållsamt. Att klia sig eller gäspa ska vara ett eget granskat klipp, inte slumpmässig ny rörelse mitt i givkedjan. Exakta vikter bestäms efter filmgranskning; större rörelser ska vara sällsynta och avbrytningsregler följa kontraktet.

Källor vid verifierad staging: [manifest](https://github.com/Jakeminator123/scoutgaming/blob/61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65/kevin/croupier-scoutgg/public/media/manifest.json#L9), [dealerprofiler](https://github.com/Jakeminator123/scoutgaming/blob/61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65/kevin/croupier-scoutgg/public/dealers.js#L36). Detta är kodkonfiguration, inte verifierad användningsstatistik för en publicerad dealer.
## Poseversioner och namngivning

| Vanliga givklipp | Start → slut | Användning |
|---|---|---|
| inget suffix / `base` | REDO → REDO | Mitt i given |
| `i` | VILA → REDO | Ingång |
| `v` | REDO → VILA | Utgång |
| `iv` | VILA → VILA | Ingång och utgång |
| äldre `u`, `iu` | alias för `v`, `iv` | Posetolkning; inte bevis för samma timing eller kortspår |

Dolt kort har bas REDO → VILA och `i` VILA → VILA; flip har VILA → VILA. `ie` och I/O/IO/OI/II är inte belagda som rörelse-ID i de granskade kontrakten. Ingen egen översättning ska införas. Filnamnet föreslår klassificering; sparat fack, dealer-ID, filhash och QA avgör bindningen. [Namnkontrakt:1](C:/Users/jakem/dev/scoutgaming/packages/presentation/contracts/clip-naming.mjs:1), [undantag:82](C:/Users/jakem/dev/scoutgaming/packages/presentation/contracts/clip-naming.mjs:82).

För pos1 har mains Astrid-fabriksplan `v=63`, `iv=87` rutor. Kevin-materialets direktretur är `v=39`, `iv=63`, medan `u=63`, `iu=87`. Alias bevisar därför inte utbytbarhet. Se [main-plan](C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/references/schemes.json:46403) och [Kevin-metadata:67](C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/gpt-underlag/uppackad-zip-underlag/06_kodreferenser/kevin-staging/kevin/croupier-scoutgg/public/media/dealers/astrid2/v2/meta.json:67).

`F73/S303` bevaras som källnamn. Betydelsen är ännu inte verifierad; de ska inte beskrivas som Blob-ID, pose eller godkännande.

## Pamela: reproducerbara kort-, ljus- och klippregler

Verifierad arbetsordning 2026-11-09. Detta är labbets presentationspipeline; spelmotorn väljer fortfarande kortvärden och spelutfall.

| Del | Regel och faktisk begränsning |
|---|---|
| Original | Bevara varje API-original, FIRST/LAST, prompt, task-ID, filhash och faktisk kostnadsjournal. Nuvarande WAN3-tagningar har 360 rutor, 30 fps, 12 s och 1762×1174. Ny hash innebär ny QA. |
| Klippning | VILA har flera återgående varianter. REDO är givningens gemensamma nod. Två 12-sekundersfilmer ger en skarv i ett 24-sekundersprov, men pose- och ljusmatchning måste granskas separat. Hela rutor och tom retur bevaras; inga osynligt tidssträckta original. |
| Kortyta | Spara synlig pappersyta, handocklusion, UV/nät och kvarliggande kort som olika data. Trycket följer ytans vridning och böjning; dold UV är ett författat antagande. Vit källa bevisar inte fysisk fram/baksida: UNKNOWN får inte tyst bli observerad FRONT eller BACK. |
| Täckning och skugga | Skuggat papper är fortfarande ogenomskinligt. Pappersljus får inte återanvändas direkt som alfa. Dra bara bort grön bakgrund där verklig kantblandning bedöms finnas. Varm handskugga får inte automatiskt bli hudskydd. Svart SG-diagnostik visar sådana luckor tydligare än ett mörkt framtryck på vitt. |
| Två kort | Två oberoende kortinstanser och separata tryck. Dold förskjutning under ett tunt kantläge är tillåten som författad animation, men exakt intervall ska anges och granskas. Geometri/UV/offset låses efter släpp. Skuggan mellan korten klipps mot underkortet; ingen oavsiktlig extra skugga utanför första kortets ytterkant. |
| Pixelkontroller | Kontrollera original-RGB, maskernas verkliga kanalantal, ändringar i skyddad hand/sko och utanför pappersstödet före förlustkomprimering. Noll ändrade skyddspixlar bevisar inte att skyddsmasken är anatomiskt korrekt. Synlig alfayta efter handocklusion är inte samma sak som kortets fysiska area. |
| Ljusriktning | references/pamela-stage-contract.json har relativ key/fill, exponering och separata neutral/varm/sval-profiler. Ljuset påverkar 3D-bordet. Pamela och rummet behåller inspelat ljus; inga uppmätta lux/Kelvin eller fysisk ombelysning påstås. Ny bakgrund ska bedömas mot denna begränsning. |
| Djup och bord | Bord, fysisk kant och bakgrund är separata tillgångar. Den nedre källbilden projiceras på bordet med låst kamerariktning och högst ±0,16/0,07 scenenheter panorering. Det är författad 2,5D. Fysisk skala och återvunnen kamera är ännu okända. Hand/kortkontakt måste granskas både fryst och under rörelse. |
| Kvarliggande kort | Ett kort får inte försvinna när nästa videoklipp börjar. Källbundna fristående kortlager används genom nästa givning, återgång och slutvila. C2-original som redan innehåller C1 kräver explicit ocklusions-/lagerpolicy så samma kort inte ritas dubbelt. |
| Godkännande | Kontaktark för samtliga rutor, relevanta native-rutor, faktisk uppspelning och båda skarvändar granskas mot exporterad hash. En spelare som når slutet bevisar avkodning, inte obruten visuell granskning eller färdig spelintegration. |

Reproducerbara ingångar: tools/pamela-seat-bank.ts → tools/pamela-landed-card-layers.ts → tools/pamela-bank-sequence.ts → tools/pamela-full-loop.ts. tools/pamela-bank-trim.ts sparar heltalsmappningen för tempoklippning; tools/pamela-matched-redo.ts gör en avgränsad skarvjämförelse; tools/pamela-c2-sequence.ts visar två hela tagningar med en skarv. Kortspåren finns i src/pamela-neutral-card-track.ts och src/pamela-seat7-card-track.ts. Den separata svarta täckningsdiagnostiken finns i tools/pamela-black-paper-probe.ts; den är inte en godkänd materialkompositor. Varje verktygs försök, källhashar och begränsningar sparas under runs/. Använd en ny försöksmapp när indata eller algoritm ändras.

### Nativeformat och vila

Ett första/sista bildankare garanterar varken exakta genererade ändposer eller inmatningens pixelbredd. VILA-pilot run-01 gav 1764×1174 från 1762×1174-ankare. Original och avvisad native-verifiering bevaras; visnings-QA får särskilt redovisad padding, aldrig dold skalning. En eventuell härledd crop måste ha egen profil, koordinatöversättning, pixelkontroll och QA. Grön ytterkant ensam bevisar inte korrekt inre geometri.

Bedöm blinkfrekvens och båda anslutningarna separat. Hela B→A-tagningen avvisades, men verkliga korta B→B-fönster kan prövas utan ansiktsändring. Spara slut exklusive, originalens fps och bildrutemappning. Tre varv plus en originalstartruta visar exakt tre skarvar. Förlustfri master jämförs ruta för ruta med källan; komprimerad visningsfilm och normalfartsgranskning hålls separata. Ett bra B→B-prov godkänner inte automatiskt A-noden eller runtime.

### Frysta materialspår och sammanfogning

Förstakortens edge/middle-export och andrakortens track.json är oberoende indataformat. references/pamela-material-selections.json pekar på uttryckligt valda evidens- och granskningshashar. En katalog som bara heter complete är inte ett godkännande. P1:s andra kort använder draft02 som begränsad integrationskandidat. Grön reflex i tunt läge, blandkant och konservativ otryckt greppyta kvarstår vid 104–118; fysisk sida är UNKNOWN.

1. Bevara originalets360 rutor och koppla varje källa till exakt SHA256. Granska källbunden papperskontur, hand, nästa skokort och UV separat.
2. Spara varje rutas frysta coverage och skyddsmasker. Middle-spår har gzip Float32-LE u/v i en angiven native-ROI. C2 har native RGB-mask: röd=C1, grön=C2, blå=hand/skovakt; max(röd,grön) är semantisk pappersyta.
3. src/pamela-frozen-material-track.ts validerar hashbindningar och läser frysta data utan att köra agentens föränderliga geometriprofil. src/pamela-paper-material.ts placerar valda provtryck; spelvärden väljs utanför labbet. Ett tomt kort har ingen observerad tryckt överkant: canonicalUvQuarterTurns väljs en gång per rörelsespår och gäller alla360 rutor. P1–P3:s C1 använder [1−v,u], P4–P7 använder identitet. Samma C1 jämförs vid första källans slut och andra källans start; coverage och handskydd får inte ändras av orienteringen.
4. src/pamela-key-paper.ts skiljer tät papperskärna från verklig grön kantblandning. Vid texturerat material används även original-RGB utan tryck. Strukturell coverage255 betyder inte att en blandad ytterpixel ska bli helt opak eller grön. Neutralt skuggat papper och grönreflekterad ljus kärna ska däremot förbli täta.
5. tools/pamela-material-plan.ts --take=NN fryser alla14 uttryckligen valda spår och en egen hashbunden kopia av urvalsregistret. En ofullständig lista kan inte skapa bankplan. tools/pamela-material-bank.ts tar exakt --plan och --plan-sha256; --preflight provar fem rutor per klipp före helrendering.
6. Kvarliggande C1 hämtas från föregående frysta förstakälla. När platsen får C2 äger dess aktuella källa både C1 och C2; andra sex platser är separata tidigare lager. Efter C2 bevaras det färdiga paret genom senare givningar och VILA.
7. Behåll varje 12 s-export. Helkedjan är 5 486 rutor; valda heltalsintervall från fourteen-trim ger 4 404 rutor utan ändrad rörelsefart. Skriv explicit duration = verifierat bildruteantal/30 för varje concat-segment; avrundad MP4-duration kan ge ackumulerad tidsdrift. Summan, 30 fps, heltalsrutor och slutfil kontrolleras. Regressionen runs/20261109-pamela-material-clock-regression/take-04 verifierar 1 028 rutor, identiska paket och avkodade bilder, exakt DTS och 0 tick drift. Take-03:s äldre korta fil bevaras; trim-exact.mp4 är vald efter separat 4 404-rutors likhetskontroll. Visningsfilmer komprimeras; RGB-/maskkontroller görs före kodning.
8. Granska de faktiska exporterna, skarvar, kortkontakter och UI-uppspelning. tools/pamela-material-download-bundle.ts paketerar endast hash- och fps-verifierade scenklipp i exakt 16 ZIP-poster (14 MP4 + manifest + läsmig), utan omkodning; arkivets innehåll hashverifieras separat. Nytt material, ny mask eller ny kompositorhash ger ny QA. En kandidat med kända restfel får visas tydligt märkt men blir inte runtime- eller produktionsgodkänd.

Kod, inputplan, bildrutehashar, masker, fotometriska begränsningar och beslut bevaras per unik run. Filer skrivs aldrig över för att dölja misslyckanden. De avbrutna materialbankerna take-01 (grön blandkant) och take-02 (kvartsvarv i trycket mellan källor) har egna abortbeslut; nästa försök använder ny mapp. Orienteringsbevis: runs/20261109-pamela-frozen-material-probe/take-05 och orientation-review/review.json. Slutkortsjämförelsen godkänner riktningen, inte automatiskt hela rörelsen.

## Lokala videor: mätt översiktstäckning 100 % (9/9)

ffprobe och kontaktark har granskats för alla nio. **Detta är inte full rörelse-, skarv- eller loopacceptans.**

| Klipp | Codec | Bildplan | fps | Rutor |
|---|---|---:|---:|---:|
| Scout-Göran grundloop / flip | H.264 | 1080 × 1920 | 24 | 120 / 39 |
| Emil andas / pos4-iv | AV1 | 1080 × 1920 | 24 | 73 / 63 |
| idle_breath / idle_still | H.264 | 1080 × 1920 | 24 | 73 / 73 |
| 4da97d9e… | H.264 | 1080 × 1920 | 24 | 73 |
| Importerad lobby-loop | H.264 | 540 × 540 | 24 | 96 |
| Alternativ helkropps-Göran | H.264 | 1920 × 1080 | 30 | 90 |

Alla har MP4-behållare, `yuv420p`, ingen alfa och inget ljudspår. Helscenprover innehåller rum och bord; gröna arbetsklipp måste komponeras före rättvis slutjämförelse. Lobbyfilmen är inte identifierad som Blankurius. Ingen lokalt identifierad Blankurius-film finns att kvalitetsbedöma. Helkropps-Göran är separat från Scout-Göran; anpassning kräver mer än omkodning. [Identitetsregister](C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/references/dealers.json).

## Rättelser i äldre GPT-underlag

| Påstående i äldre underlag | Korrigerad läsning |
|---|---|
| Alla klipp börjar/slutar i VILA, bilaga `(3).md:110`, trots tidigare rättelse på rad 55 | Använd klipptypens VILA/REDO-kontrakt. |
| Samma vila upprepas aldrig direkt, samma bilaga:193 | Policyberoende; grundloopvalet saknar generell sådan spärr. |
| Tätare utsnitt ger fler detaljer utan större filer, samma bilaga:129 | Beskärning tillför inga originalpixlar; nygenerering och komprimering måste jämföras. RAW:253–255 preciserar detta. |
| Blankurius har en egen vald grundloop | Ett viloklipp är identifierat i admin; aktiv publicerad policy är inte verifierad. |
| React/Next kan läggas till senare i labbet | Redan installerat och använt; arbetssättet har rättats. |

Rättelserna ligger här; den historiska [GPT-bilagan](<C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/gpt-underlag/uppackad-zip-underlag/01_original/Inklistrad markdown(3).md>) bevaras.

Keystone-bilder och kalibrering behandlas i [KEYSTONE.md](KEYSTONE.md). Studioarkitektur och GPT-paketets roll finns i [studiokartan](../studio/KARTA.md).
