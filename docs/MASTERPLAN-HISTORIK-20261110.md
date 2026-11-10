# Historik före avslut av HUVUDAGENT-3

Detta är historiskt underlag, inte aktuell arbetsorder. Läs [aktuell masterplan](MASTERPLAN.md). Bevarad källtext från dokumentversion53; SHA-256 före arkivering: `ab0e2f346b07300c4ebd3f29ad758d7a86fe4ee6491a366edf6a10cccff6a0b0`. Originaltexten följer oförändrad. Relativa länkar behåller samma dokumentkatalog.

---

# Masterplan – ny Pamela-referensbank

Uppdaterad 2026-11-10. Ägare: HUVUDAGENT-3. Arbetsyta: `C:/Users/jakem/dev/super-feature-sg/snyggare-dealer`, lokal Git-gren `jakob/test`. Remote `origin` är det separata publika repot `Jakeminator123/scout-dealerlab`; endast granskningsurval publiceras genom det särskilda flödet. Scoutgaming och båda Kevin-grenarna är läsreferenser. Senaste prioritet är en sammanhängande lokal videobank före inkoppling mot Scout `main`.

## Slutmål och systematik

Jakobs förtydligade slutmål 2026-11-10: i princip ett knapptryck för att skapa en dealer. Det kräver en sammanhängande, återkörbar kedja: beställning → dealer-/nodregister → original och kalibrering → generering och bearbetning → QA och beslut → export. Modellstöd, kostnadstak och sparade task-ID ska förhindra obeställd generering och dubbeldebitering. Scoutmotorn behåller spelbesluten.

Dagens filmer är byggstenar, inte bevis för en färdig automatisk pipeline. Varje vald nod behöver identitet, källhash, tidsbas, kalibrering, lager, bevis och explicit beslut. Granskningsindexet får länka senaste filmer till nod-ID utan att märka dem runtimegodkända. En generisk KORT N→VILA, gemensam kortlayout och kropp/bord-kontakt återstår. Den aktuella prioriteringen nedan ersätter äldre avsnitts formuleringar om nästa arbete. Äldre försöksresultat och källor bevaras som historik.

## Aktuell prioritet: filmkontrakt före integration

Jakobs styrning 2026-11-10: samla de konkurrerande systemen runt nodträdets rörelser och skapa rätt filmer först. **Aktuellt scope är två kort per P1–P7 och tre till dealern: 17 givmål.** Senare utökning följer Scout `main`-grundseriens kortfall; två/tre är ingen blackjackregel eller global maxgräns. Sista given ska kunna gå **direkt från giv-/släppläget till VILA utan att först passera REDO/R**, inklusive Jakobs K5-exempel. Exakt mottagare/kortinstans/ruta ersätter otydliga K5-alias i kontraktet.

Senaste uttryckliga styrningen ersätter den äldre idén om givning utan vändning: **en vanlig öppen givning ska gå BACK vid uttag → synlig fysisk vändning genom EDGE → FRONT vid landning**. Dolt kort och senare REVEAL har separata förlopp. Gul BACK/blå FRONT är tekniska sidmarkörer; i de nya råproven finns de i API-utdata eftersom referensbilderna färgades före beställningen. I äldre Three-prov är samma färger en författad overlay och bevisar ingen fysisk sida. Next/React använder direkt Three.js. Keystones anger önskade ändposer; filmen och skarvgranskningen avgör om övergången faktiskt fungerar.

| Ordning | Leverans | Klart när |
|---|---|---|
| 1 | Korrekt fysisk P1-givning med befintligt kontrakt | BACK→EDGE→FRONT sker genom synlig handleds-/kortrotation, kortet landar direkt på P1 och släpps utan återkontakt. Samma dealer, grön scen och kamera bevaras. Ingen breddning före detta rörelsebevis. |
| 2 | P1 efter C1 respektive C2, med direkt VILA-avslut | Sista given går till VILA utan omväg via REDO. Befintliga källor prövas först; saknad rörelse får en avgränsad genereringsplan. Rätt kort ligger kvar; skarvar, handkontakt, placering och tryck godkänns. Blå/gul overlay på blank källa bevisar bara författad sidpolicy. |
| 3 | Fullfölj den lokala grundserien | P1–P7 C1/C2 och D.C1–D.C3, inklusive de direktreturer och reveal-fall som behövs. Återanvändning av en givfilm kräver eget bevis; saknad rörelse blir ingen tyst reserv. |
| 4 | En återkörbar dealerbeställning | Profiler styr materialval, kostnad, jobb-ID, återupptagning och selektiv omkörning. En andra dealer prövas med egen kalibrering. |
| 5 | Senare separat Scout-integration | Egen bank/profil, kompatibelt format och importerbara spår har verifierats; Scoutmotorn äger fortfarande regler och avslöjanden. |

Verifierat i denna kartläggning: 14/14 valda råkällor och 14/14 bankfilmer matchar sina registrerade SHA-256. De täcker P1–P7 K1/K2 som kandidater, **14/17 = 82,4 % kandidattäckning av givmålen**. Dealerns tre givmål saknar vald film. Det bevarade v1-kontraktet har 19 klipp, alla `raw-reference`/`pending`, och 0 godkända anslutningsgrindar. De nya P1-proven redovisas separat nedan. Kandidattäckning är inte rörelse-/produktionsacceptans eller total färdigprocent.

Den [sammanhållna system- och filmplanen](studio/DEALERS-OCH-PIPELINES.md#gemensamt-filmkontrakt-före-scout-integration) anger filmval, koordinater, källrevisioner, keystones, återanvändning och nästa prov. [Namn och rörelsesträngar](studio/NAMN-OCH-RORELSESTRANGAR.md) styr nya etiketter: C är primärt, K är schemaidentifierat alias, dealerhand och spelarhand hålls isär och REDO/REVEAL skrivs fullt. Befintliga hashbundna fil- och kontrakts-ID:n byter inte namn. Runway-API, lokal WebView och konkreta genereringsplaner har prövats. Material ligger kvar enligt [lagringsstrukturen](drift/PROVISORISK-STRUKTUR.md).

## Verifierad P1-pilot och gemensamt kontrakt, 2026-11-10

`references/pamela-motion-contract-v2.json` är en opt-in-kandidat (`candidate-20261110-v2-r1`), inte aktiv produktionsbank. Den bevarar samtliga 24 tillgångar och 19 äldre handlingar med fullhashar och källintervall, skiljer Scout-fack (`clipSlotId`) från kortplacering (`cardPlacementId`) och beskriver 17 givmål samt de två P1-planerna. `src/dealer-motion-contract.ts` validerar rörelseväg, beständiga kort, reveal och materialupplösning. Scoutmotorn behåller regler, slump, sko, kortidentiteter och tillstånd att avslöja kort.

P1-resultat: **0/2 accepterade direktreturer**. Äldre B-prover är 494 rutor/16,467 s respektive 834 rutor/27,8 s, båda 1764×1174/30 fps. De passerar **inte REDO efter sista släppet**; underkännandet får inte beskrivas som en belagd sådan omväg. Däremot matchar deras B252/B326/B359-ankare inte ursprunglig VILA-keystone. De bevaras som teknisk och historisk evidens via `references/pamela-direct-return-review.json`, utan produktionsacceptans.

| Nytt prov mot ursprunglig VILA-keystone | Beslut och exakt fel |
|---|---|
| P1.C1 canonical take01 | Underkänd: återkontakt med kortet efter släpp i råreturens rutor 5–13. |
| P1.C1 canonical take02 | Underkänd: start i C1-källruta 210 med tydligt lyft hand, men ny återkontakt i råreturens rutor 12–18, motsvarande proof 223–229 / 7,433–7,633 s. Slutposen nås, men textur-/handformsskarv kvarstår till den uttryckligen märkta stillhold-sektionen. |
| P1.C2 canonical | Förberedd, aldrig inskickad. Ingen ny C2-film eller acceptans finns. |

Senaste [C1-proof](../runs/20261110-pamela-direct-return-pilot/review/canonical-c1-retake-02/P1-K1/take-01/P1-canonical-proof.mp4) har **331 rutor, 30 fps, 11,033333 s**, SHA-256 `6028923533a67551e9705abe77b37552bfecd635d225a4c32a24ad64b7123f5c`. Råoriginal, prompt, indata, task-ID, rutkarta och avvisade försök bevaras under `runs/20261110-pamela-direct-return-pilot/`. Sanerat publiceringsunderlag väljs separat; privata körjournaler och interna budgetrester ska inte följa med.

Tolv avslutade WAN3-jobb i denna pilotsvit: fem äldre returer/300 krediter, fyra fysiska givningsprov/400 och tre nya övergångar/120; totalt820 krediter. Inget videojobb kör längre. Interna pilotramar är inte Jakobs maxbelopp. Planer, original, task-ID och terminalkostnader är bevarade; inga automatiska återförsök. Den avvisade imagegen-referensens kostnad är okänd och ingår inte i Runway-summan.

Den nya C1-rörelsen är lokalt accepterad: BACK→EDGE f47–48→FRONT f49, sista kontakt f94 och fri hand f95. Den klipps före extra handsänkning. Hela VILA→P1.C1→VILA består av entry0–58 + giv0–102 + retur0–59 =222 rutor/7,4s; alla avkodade rutor matchar sina råkällor. En liten oförändrad fingerdetaljskillnad finns i skoövergången. Ny C1→sko-brygga:60 rutor, tom hand och ett kvarvarande kort. Båda C2-proven är underkända: första byter bred gul f50→bred blå f51 utan kantpassage; andra byter f66→f67 och visar därefter fel vit/tryckt kortyta under extra vändningar. Kortspår, masker och produktionsacceptans återstår.

Grundgivningar:1/17 med lokalt godkänd rörelse,16/17=94,1% återstår. Hela paketet inklusive övergångar, lager och varianter:80–90% återstår, uttrycklig skattning utan tidsprognos. Historiska14/17 är kandidattäckning och räknas inte som godkänd ny bank.

Varianter enligt Jakobs senaste styrning: Samma handling, mål, start-/slutankare och kortföre/efter. Varje film anger hand och egen QA. Avsiktlig kortjustering har särskild kontaktklass och källrutor; den får aldrig bli en ny givning eller blandas med vanlig retur utan återkontakt. Blick och andra gester får variera inom samma godkända gränser. V2:s valfria MotionVariant validerar dessa krav; olika kontaktklasser delar inte utbytbarhetsgrupp. Ingen slumpmässig väljare eller autoplay är införd. Underkända klipp kan bevaras som variantkandidater men blir inte godkända genom ommärkning.

Nästa leverans är VILA→C1→C2→VILA i samma v2-kontrakt. Förbered en exakt kalibrerad C2-slutreferens med samma hand som den fungerande C1-rörelsen före nästa generering. De två C2-filmerna och AI-bildkandidaten är underkända. Bordets mjuka båge kalibreras separat; samma kontrakt ska därefter styra VILA→C1→C2→VILA. D.C1–D.C3, övriga grundgivningar och produktionslager återstår. Den nya sammahand-slutreferensen ändrade person och geometri och avvisades; befintliga C2-ankare behålls i det korrigerade provet där vändningen sker före handbyte. Parallellt äger chatten ”Kalibrera bordets kortbåge” (01a1c40c-09ca-74c0-96e4-f367d09a0468) ett separat lokalt bord-/utsnittsprov. Huvudagenten äger filmer/kontrakt och publicering. Gårdagens centraloriginals lokala vändning f74–84 bevaras som referens; det är P4-källa, ingen D-film. WAN3 används konsekvent; bästa möjliga modellkvalitet är inte belagd.

`/pamela-sidprov` visar original, blå/gul diagnostik och två slutdesigner. Det skyddade standardläget visar baksidor så länge källans fysiska vändning inte är verifierad. Historisk författad framsida kräver aktivt val. WebView har verifierat C1 och C2, inklusive C2 ruta 119: inga begärda framsidor, tio texturer och GL-fel 0. Äldre 720 källrutor, sex CPU-filmer och sju kontaktark bevaras. De äldre färgöverläggen beskriver författad sidpolicy; fysisk sida förblir UNKNOWN.

Identitetsregistret visar projektrot, dealer-ID, bank/revision, källmanifest och hashbundna ankare. Sex undersökta projektmanifest i `blackjack-studio` belägger ingen Pamela; samband med Dealerlabs Pamela är **okänt**. Göran · Scout Main och Göran · blackjack-studio hålls isär. Naturbord · Liv har en belagd ankarhashkonflikt och får inte automatiskt återanvändas som Pamela.

Granskningssidan uppdateras genom det befintliga filtrerade GitHub-/Vercelflödet. Aktuell publik version ska kontrolleras i `/latest.json`; denna lokala text ensam bevisar ingen publicering. Scout main och Kevin-grenarna är läsreferenser och har inte ändrats. D.C1–D.C3 är fortfarande saknade. 14/17 = 82,4 % beskriver historiska kandidaters måltäckning, inte godkänd givningskvalitet.

`references/pamela-presentation-review.json` samlar checklistan som också visas i `/pamela-sidprov`. Givning/kortvändning, retur efter släpp, kortmaterial och scengeometri är skilda granskningssteg. Overlay skapar ingen fysisk vändning. Handen får täcka kortkanten under greppet; återkontakt efter släpp är ett separat fel. Dolda kort kräver motorns reveal-beslut och källrörelse som visar rätt fysisk sida.

Bakgrunds- och bordsvalen finns i `references/pamela-background-review.json` och `references/pamela-table-review.json`: Jadesalongen, neutralt ljus, smaragd/brun läderkant, källsko och centrerad kamera. Detta är komponerade scenprofiler; råfilmer ska behålla arbetsbakgrunden. Förslag till gemensam layout: en grund båge P1–P7 längs bordets framkant, samma kortstorlek i bordsplanet, konsekvent C1/C2-överlapp och separat D.C1–D.C3-zon närmare Pamela. M-formen är ärvd från separata original och är inget krav för 3D. Nya avstånd/vinklar är inte kalibrerade eller fastställda. Frågan till Browser-GPT finns i `runs/20261110-dealer-map-review/fraga-om-bordslayout.md`. P1-proven använder befintligt P1-läge.

Dealer Map 1.1 har en lokal, läsbar Python-kandidat och offlineförhandsvisning i `runs/20261110-dealer-map-review/`. Originalen i Downloads är orörda. Kandidaten rättar stegnumrering, projektidentitet, DEAL/RETURN-gräns och binder etiketter till den lokala tiodelade DL1-normen inklusive ref. 52 REQUESTED-deskriptorer betyder inte observerade rörelser. Åtta Python-kontroller och HTML-skriptets syntax har verifierats; PySide6-gränssnittet på Windows är inte kört. Labbets råfilsroute blockerar avsiktligt HTML-skript, så dess inaktiva visning är inget funktionstest av offlinefilen.

Filnamnet `pamela-visningsinspelning-b37dbc6cafa9-givning-pan-fran-98.mp4` matchar canvas-/MediaRecorder-exporten av P7 från källruta 98 med författad panorering och sex tidigare kort. De bevarade MP4-exporterna är 1236×832 och uttryckligen inte slutgodkända; omkodning kan ändra bildruteantal. Exakt skrivbordskopia hittades inte och dess hash/operatör är okänd. Detta är ett historiskt visningsprov, inte genererat original, accepterad rörelsebank eller timingbevis.

### Lokalt efter R16: maskkorrigering, P2-sko och separat ny VILA-kedja

Den samlade publika granskningen finns nu på /granskning.html med senaste valda bank och separata VILA-kedja. R16-sidorna är bevarade som historik. Lokalt har C1-P7:s grå skokant och C2-P6:s otäckta vita kortspets korrigerats i ett separat opt-in-steg, src/pamela-refined-bank-card-surfaces.ts. Basadaptern och äldre filmer är byteoförändrade. runs/20261110-pamela-bank-mask-refinements/take-02/review-02.json binder 720 masker, 70 sammanhängande native-rutor och 140 designjämförelser. Hand/prior/outside-union: 0. De två kompletta 12 s-scenfilmerna ligger i runs/20261110-pamela-bank-mask-integration/take-03; alla 720 RGB-källrutor och tidigare kortkärnor kontrolleras. Endast 25 rutor i C1-P7 och 19 rutor i C2-P6 har ändrad komposition. En mask utan pixeländring behåller nu även ursprungliga bounds. Lokalt /pamela-prov?view=mask-correction&id=C1-P7 eller C2-P6, &side=before visar R16.

Den lokala 14-klippsbanken, helrundan och ZIP finns i runs/20261110-pamela-mask-bank/take-01. Tolv klipp, tolv klippta varianter, fyra yttre segment och 14 liggande kortlager återanvänds exakt. Bara två klipp och deras klippta varianter ersätts. Samtliga 9 890 avkodade bildrutor i hel/kompakt jämförs med basen eller avsedd ersättning; 0 ändringar utanför ersättningsintervallen. Format och totaler är oförändrade: 1762×1174, 30 fps, 5 486/4 404 rutor. Den nya banken är lokalt vald efter uppspelning av hela 146,8 s och slutet av 182,87 s-varianten. Publik R16 och dess ZIP är bevarade. Slutkvitto: runs/20261110-pamela-mask-bank/take-01/browser-review/evidence.json.

Lokal ZIP-nedladdning fungerade tidigare inte eftersom servern saknade filtypen. src/pamela-bundle-download.ts tillåter nu endast det valda Pamela-arkivet med matchande paketeringskvitto, bankreferens, storlek och faktisk filhash. HTTP-prov streamade samtliga 68 714 084 byte med rätt SHA, kontrollerade HEAD/range och nekade privata respektive ovalda ZIP-sökvägar. Labbet startades om via sin kontrollkanal efter verifierat stopp och ledig port; ny PID 1256. Maud var avstängd, utan pod eller pågående arbete, före och efter. Ingen Maud-kod ändrades. Preview är kvar; STOPP.cmd är stoppkommandot.

P2 har nu egen skokroppskalibrering i src/pamela-shoe-p2-profile.ts: 360 rutor, två former, uttagsgranskning 28–76 och retur 232–284. Samma 9 940 px kontaktinsats behålls; högst 57 kvarhållna mörka pixlar utanför den redovisas. Shadern binder rätt källidentitet/atlas, medan P3/P5:s GLSL är byteidentisk. Lokal /pamela-prov?view=combined-scene&id=C2-P2 är UI-prov. GPU-kontrollen omfattar nu 47 native-PNG-rutor/97 223 636 pixlar, 0 maskskillnader och 5 negativa nollprov. Kvitton: runs/20261110-pamela-shoe-p2/gpu-review/evidence.json och ui-review/evidence.json. Videodekodningens pixelparitet är fortfarande separat och overifierad. Bytena är källkalibrerade; godtyckliga skoformer och alla tagningar är ännu inte täckta.

Ny separat helkedja: /pamela-prov?view=idle-chain visar 4 319 rutor/143,966667 s, 1764×1174, 30 fps. Två VILA-varianter → bearbetad REDO-ingång → samma 14 givningar → ny retur/VILA. Öppning 197 + bankkropp 4 023 + retur 99 rutor. Samtliga avkodade slutrutor matchar exakt sina avsedda komponenter och PTS går utan luckor i 1/30 s. Bankkroppen är en tidigare omkodad 1764-derivat med centrumkolumnerna bevarade före kodning; själva sammanfogningen är stream copy. Ingen crop, frysning, ändrad källhastighet eller betald generering. references/pamela-idle-chain-review.json binder runs/20261110-pamela-idle-chain/take-01/review.json och film-SHA 9b9f9d84e75ff537e4dadae6ded9755fce38b4aa973f20e76ce32336d02d8dcf. Avstämningsbank och ZIP är inte utbytta.

Korttrycket i den nya öppningens sko följer samma uttryckliga C1-P1/AC-demonstrationssignal som givningen. src/pamela-idle-shoe-card.ts binder källa, frame, RGB, pappersmask och handskydd. take-02 har 182 källrutor × tre materialfall; mörk nekad framsida täcker även varm kontaktskugga utan att måla över naglar. Smal blandpixelrand kvarstår. Returens nästa skokort är neutralt: ingen ny identitet eller revealhändelse uppfinns. Fysisk sida UNKNOWN förblir UNKNOWN.

Ny helkedja granskad i 80 avkodade native-rutor/231 utsnitt vid sju nya skarvar; root 99 utsnitt och Astra 132. Fyra blandrutor i ingång/retur mjukar synligt upp ansikts-/huddetaljer. Ingen osynlig skarv eller slutlig användaracceptans påstås. WebView spelade hela 143,966667 s i 1× till ended=true, utan media-/konsolfel; det är uppspelningsbevis, inte kontinuerlig optisk acceptans. /pamela-prov?view=idle-chain&id=opening respektive opening-direct jämför öppningen; /pamela-prov?view=idle-return-overlap jämför returen. Tidigare /idle-exit är fortfarande separat detaljprov. Se slutkvittot ovan.

Den riktade granskningen av återstående kortsidor omfattade 300/3 240 unika rutor (9,26 %), därav 250 i täta intervall. Inget nytt EDGE/BACK-intervall belades; UNKNOWN gäller fortfarande. Alla aktuella underagentprov kördes med gpt-6-astra/xhigh. Inga nya API-jobb eller externa ändringar i detta steg. Återställning: .runtime/checkpoints/20261110-idle-exit-review-route, 20261110-p2-gpu-scene, 20261110-mask-review-route och 20261110-mask-bank-selection samt P2-agentens shader-snapshot. Preview behålls; STOPP.cmd avslutar den.

### Öppna produktfrågor efter Jakobs avstämning

- Korten ligger i en M-liknande formation därför att källtagningarnas landade silhuetter ärvts. En gemensam sjusitslayout saknas; detta är ett öppet placeringsproblem, inte en avsiktlig slutdesign.
- Endast C2-P1–P5 har författade fram/kant/bak-passager. Nio av fjorton spår visar kontinuerlig framsida. C2-P1:s baksida varar 10 rutor. Blank rekvisita ger ingen bevisad fysisk semantisk sida. Se vald bankplan och src/pamela-bank-card-surfaces.ts.
- Jakobs observerade valörskak är registrerat. Varierande quad/UV eller källgeometri är möjliga orsaker, ännu inte uppmätt rotorsak. Nästa försök ska jämföra kortkontur och tryckankare ruta för ruta.
- Givningsklippen går REDO→REDO. Trimningen prioriterar skarvlikhet och lämnar långa väntningar. Varken äldre banken eller nya helkedjan implementerar valfri KORT N→VILA-förgrening; den nya helkedjan visar bara en komplett rundas retur. Se references/pamela-motion-contract.json och tools/pamela-fourteen-trim.ts.
- Ett friliggande kort kan omriktas i ett separat lager. I den färdiga MP4:n krävs omkomposition. Under grepp måste kortytan, handen och ocklusionen följa tillsammans; det är klart svårare och behöver källspecifik kalibrering. Ingen ny sådan rotation är implementerad här.
- Bakgrund/bord/skobyten fungerar i fyra källbundna interaktiva C2-P2/P3/P4/P5-prov. Pamela-ljuset är inbakat; full kropp/bordsocklusion är uttryckligen olöst. Jakobs upplevelse att hon sitter i bordet är registrerad men inte här optiskt rotorsaksbestämd. Se references/pamela-stage-contract.json.
- Helrundan är renderad MP4. combined-scene använder Next/React och direkt Three.js, inte React Three Fiber. Marker är en separat Three-studie utan gravitation eller dealerintegration. Det är ännu inte en gemensam spelrenderer.
- UI har nio Next-sidor och 41 namngivna view-lägen i /pamela-prov, många historiska. Nästa UI-steg är en ingång: Helrunda / Byt scen / Granska fel, med äldre försök under Historik. Det är rekommenderat, inte genomfört.

Aktuell återstartprioritet finns överst: ett avgränsat P1-prov med överenskommen landningsposition, stabilt korttryck och två direkta VILA-avslut utan omväg via REDO efter sista givningen. Kortvändning är ett separat framtida rörelseval, inte krav på varje givning. Äldre procenttal här avsåg olika demonstratorer och ersätts inte med en ny totalmätning. Externa granskarens cirka 35 % färdiggrad för en generell pipeline är en historisk, osäker skattning på äldre snapshot; den är inte verifierad aktuell arbetsmängd eller tidsprognos.

R16 är publicerad på https://scout-dealerlab.vercel.app/pamela-bank.html. Snapshot pamela-loop-review-20261110001708402, deployment dpl_Fy6SvJiWoHxo3U46ux1JwSt3CVWf. Hela rundan och ZIP finns där; /pamela-combined.html visar rum, bord och skokropp separat. Lokal väg /pamela-prov?view=two-sided-bank, enskild film med &id=C2-P1, oklippt med &length=full. Den ursprungliga centrala vändningen är plats 4, nollbaserat index 3.

**14/14 fullängdsklipp:** varje originalrörelse är 360 rutor/30 fps/12 s. Nya tryck byggs från neutrala original, inte tidigare tryck. Två unika provvärden per plats: AC/KH, 2C/QD, 3S/JH, 4C/10D, 5S/9H, 6C/8D, 7S/AS. Första kortet bevaras under den andra givningen; alla 14 ligger kvar i slutvilan. Export: runs/20261110-pamela-two-sided-bank/take-02. Helrunda 4 404 rutor/146,8 s (SHA f5b0a602fe181661c9b76d380cdb667a6feae655a6a4dccbd61ab2ad1a24d4c6); alla ändhållningar 5 486 rutor/182,8667 s. Rörelsehastigheten är oförändrad. ZIP runs/20261110-pamela-two-sided-bank/take-02/download-bundle/pamela-14-scenklipp.zip, SHA c58252b50c52458a61d07a0e422df99335ba654b73d6598e006c38155e94ec36; 14 MP4 + manifest + LASMIG med bytekontroller, ingen omkodning i ZIP-steget.

| Andra givningen | Författad sidföljd på blank rekvisita |
|---|---|
| P1 | FRONT 0–82 → EDGE 83–103 → BACK 104–113 → EDGE 114–118 → FRONT 119–359 |
| P2 | BACK 0–78 → EDGE 79–88 → FRONT 89–359 |
| P3 | BACK 0–51 → EDGE 52–66 → FRONT 67–359 |
| P4 | BACK 0–97 → EDGE 98 → FRONT 99–359 |
| P5 | BACK 0–87 → EDGE 88–93 → FRONT 94–359 |
| P6/P7 samt första givningen | Sammanhängande framsidesprov; inget dolt sidbyte är bevisat |

Källornas semantiska kortsida är UNKNOWN. Motorn äger kort-ID och frontAllowed, även vid P1:s båda FRONT-intervall. Saknad/nekad/obunden identitet döljer framsidan. src/pamela-bank-card-surfaces.ts tar material och motorbindningar separat; inget slump- eller spelbeslut flyttas hit. P1:s nya före/efter, /pamela-flip-p1.html, visar källrutor 59–145 (87 rutor) som original/SG/blå-elfenben. P2/P3/P5 jämförs på respektive /pamela-flip-pN.html och P4 på /pamela-flip.html. Två designer är visuellt provade; helbanken är exporterad med SG-designen.

**Bevisgräns:** 5 040/5 040 RGB-källrutor verifierade, 0 tryckändringar utanför pappersmask och 0 ändrade tidigare kortkärnpixlar före förlustkodning. Preflight: 117 native-rutor, 234 designrutor, 93 motorgrindfall. Oberoende Astra reproducerade 10 bilder och 15 ytterligare motorfall. Alla 14 landningsriktningar jämförda. Native- och WebView-kvitton ligger i take-02; uppspelning/avkodning är skild från obruten optisk allruteacceptans. Tunna blur-/papperskanter och mindre grepprester finns kvar. Skyddad preview och anonym offentlig hashverifiering finns i exports/pamela-loop-review-20261110-r16.

**Separata skor i R16:** interaktivt C2-P3/P4/P5 har två utbytbara skokroppar. P2 är spärrad i R16; den nya lokala P2-kalibreringen beskrivs ovan. P3/P5 har exakt källidentitet, atlas-bytehash, egna RGB-masker och skydd för händer/papper; inga lånade P4-tider. Kropparna byts, men en 9 940-pixels kontaktinsats vid uttaget och nästa otryckta kort behålls. Helbankens filmer har originalskon; /pamela-shoe.html isolerar skobytena, medan /pamela-combined.html kombinerar kort/rum/bord/sko.

GPU: 30 kritiska native PNG-rutor på P3/P5, 62 057 640 pixlar, 0 över-/underborttagning eller felkodade pixlar, fyra negativa prov med 0 borttagning. Faktisk WebGL2 readPixels med highp 23 bitar; videodekodningens färgparitet är inte uppmätt. CPU mot float32-GLSL omfattar alla 720 rutor. Bevis runs/20261110-pamela-shoe-bank/gpu-preflight/evidence.json, ui-review/evidence.json och modular-review-astra.json. P4:s geometry-hashavvikelse är verifierat endast tre kommentarrader; comment-correction.json länkar fryst kod till aktuell. Lägre GPU-precision behåller originalskon.

Ljus/lager: rum bakom bord; ny sko bakom kvarvarande dealer/hand; korttryck inom pappersmask utanför handskydd. Key framifrån vänster, relativa key 2,2/fill 0,8. Pamela har inspelat ljus. Författad 2,5D med låst kamerariktning och pan ±0,16/0,07 ger begränsad parallax, inte nya kroppsvinklar eller fysisk ombelysning. Byte av höjd/handkontakt kräver ny kalibrering. Inga blockerande fynd i den avgränsade oberoende Astra-granskningen.

**VILA/REDO återstår:** B→B med 14 kort och gratis returkandidat finns kvar på /pamela-idle-scene.html och /pamela-idle-ready.html. Den nya 3 s-bryggan är kandidat men INTE vald i helrundan: utgång 89→bank17 har ansikts-/handtextur, ljus- och greppskillnad. Rekommenderat trimprov B[305,327) → brygga[6,90) → bank[17,38) är 127 rutor; publicerat fullprov 133 rutor. Ingen övertoning, frysning eller tidsändring döljer skarven. Rörelsen är separat accepterad som kandidat, inte sömlös utgång.

Ingen ny betald generering i R16. Senaste brygga: task 29f2f5d9-46a4-4a71-8a6f-82fb7e93d85c, WAN3, 60 krediter, original SHA 2df2e054051e85e4200025a8b955e0c871e41d6cf0fc78b59a25d107e941e569. Kontosaldo hålls i privat driftunderlag. Cirka 7 000 är tidigare totalram, ingen ny ram per chatt. Platsjobb P1=4/P2=2/P3=2/P4=2/P5=2/P6=2/P7=4, tak 10 per plats. Äldre idle-job02 är PREPARED_NOT_SUBMITTED och skickas inte automatiskt.

Nästa arbete följer avstämningsprioriteten ovan. Ingen runtime-/produktionsacceptans. Publik R15 återställning: dpl_ECY8WyPY6y5m6LZFbvDbhiG5zv7K, exports/pamela-loop-review-20261109-r15; R16 och den lokala avstämningsbanken är oförändrade.

## Föregående R12: separata kort- och scenprov

C2-P4 är andra kortet till plats 4 (nollbaserat index 3), källa 67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167. Den befintliga 12-sekunderstagningen har en smal passage f84–98. Nytt lokalt prov: /pamela-prov?view=flip. Två framsidor och två baksidor ger fyra oberoende kombinationer, alla 360 rutor/30 fps/12 s. Baksida f0–97, kant f98, framsida från f99 är ett författat schema på ett blankt original; fysisk sididentitet är inte bevisad av källtryck.

Spelmotorn äger kort-ID och tillåtelse att visa framsidan. src/pamela-two-sided-card.ts slår aldrig upp framsidan när tillåtelse saknas, börjar om från oförändrad otryckt källa och använder separat kortmask, projektiv UV och handskydd. Granskning: runs/20261109-pamela-two-sided-flip/take-03/evidence.json (SHA fabf6f623d2064d3c40111742eb8a53d3f8d532d06bfbdd1c314c1b5e0a2385e), verification.json och browser-review.json. 360 × 4 rutor: 0 ändringar utanför kortmasker/skydd. 262 framside-/kantrutor är pixelidentiska när enbart baksidan byts; 16 nativeprov matchar de redan bildgranskade proven. Fem fokuserade tester passerar. Ny grönreflekterande tunn pappersmask omfattar 2 704 extra pixlar över 15 rutor; cirka 1–2 px kantosäkerhet återstår. Take-02:s felkodade jämförelse är bevarad och inte vald.

/pamela-prov?view=modular-scene visar två rum, två bord och tre skoytskikt på samma C1-P4-rörelse (källa 4e252be2235ce42cec5de9d49b993d0ffed1c029de9890faea6686f46824f87c). Rum/bord/material byts utan att filmen startar om. Bordets plan och geometri är identiska mellan materialval. Skons sidopanel får nytt material, men ursprunglig form, kant och uttag kvarstår; full utbytbar sko är inte levererad. Pamela har inspelat ljus. Relativa ljusprofiler, kamera ±0,16/0,07 och inga fasta handskuggor under rörelse gäller. Moduler och bevis ligger i src/pamela-{background,table,shoe}-layer.ts samt respektive runs/20261109-pamela-*-layer/. Startbild, materialbyten, panorering och spelning till ruta 359 är verifierade i WebView.

Publika R12: /pamela-flip.html och /pamela-modular.html på https://scout-dealerlab.vercel.app. Snapshot pamela-loop-review-20261109220057778; publiceringsbevis i exports/pamela-loop-review-20261109-r12/published-verification.json. R10 bevaras som tidigare publicerad återställningsversion; R11 är lokalt ersatt av R12. Inga nya Runway-jobb eller ändringar i Scout Main/admin, Neon/Render eller Mauds läppsynk ingår. Taket är fortfarande tio betalda klipp per plats.

R12 saknade gemensam kort-/scenspelare och utbytbar skokropp; dessa har nu ett R13-prov ovan. Dold yta, övriga sidbyten och fortsatt VILA/REDO-skarvning återstår. Inga dessa kandidater är produktionsgodkända. Återställningspunkt före denna ändring: .runtime/checkpoints/20261109T-card-scene-layers; tidigare större punkter nedan är bevarade. Begärd preview lämnas öppen, stopp via STOPP.cmd.

## Tidigare helbanksleverans: 14 materialfilmer och hela rundan

**Mål och ansvar:** flera VILA-varianter → REDO → valfri av sju platser → REDO → VILA, med två separata kortinstanser per plats. Labbets ansvar är presentation och metadata. Scoutgamings motor äger kortvärden, slump, sko och spelregler. Följande är kandidater och granskningsprov; ingen produktionsintegration har gjorts.

**Råbank: 14/14 klipp finns.** Första och andra givningen har varsin 360-rutorsfilm per plats, 30 fps/12 s, original bevarade. Nya P1:s förstakälla är 8402ddfcaabf1356b25b28fc8e7e3ca59121260eee6b188b7bfed431b2af9307; gamla för stora P1 är historik. Andrakorten finns i c2/bank-v2-stage-1 och stage-2 under runs/20261109-pamela-seat-bank/. Samtliga 360 rutor och sista60 rutornas två konturer granskades per C2-film. Alla återvänder tomhänt; timing, fingerhåll och returblur varierar. Källa/task-ID/hash står i respektive review.json och completion.json. C2-källan äger sitt aktuella C1 så att det inte dubbleras av ett överlägg.

**Hela rundan med tryck:** runs/20261109-pamela-material-bank/take-03/render/vila-fourteen-materials-trim-exact.mp4, SHA d63f3a6b5efea8b7108374f3882d0751ab6603df96c9509112d551749cd40478. Exakt 4 404 rutor, 30 fps och 146,8 s. VILA → REDO → sju första kort → sju andra kort → VILA. Alla 14 diagnostiska tryck ligger kvar. Oklippt referens: runs/20261109-pamela-material-bank/take-03/render/vila-fourteen-materials-vila.mp4, SHA ac5b88c281e9ffee478f80cbe975fcd42fa578784899c7a93a8bff6f886a9f9b, 5 486 rutor/182,866667 s. Native- och WebView-bevis finns i runs/20261109-pamela-material-bank/take-03/native-review.json och browser-review.json. Båda filmerna har spelats till slut i 1× utan mediafel; det bevisar avkodning, inte obruten visuell acceptans. Mask-, pose- och fram-/baksidesbegränsningar kvarstår.

**14 separata materialfilmer:** runs/20261109-pamela-material-bank/take-03/render/C1-P1.mp4 till C2-P7.mp4 är hela 360-rutors/12 s-scenklipp med två oberoende provvärden per plats. Alla 5 040 källrutor RGB-matchar originalen; 0 tryckändringar utanför pappersmask och 0 ändrade tidigare kortkärnpixlar. ZIP: runs/20261109-pamela-material-bank/take-03/download-bundle/pamela-14-scenklipp.zip, SHA 3c6a77ca62fd2deaf1709dc8246693426f94a1dc5ccae34e0903dfade6a299b3, exakt 14 MP4 + manifest.json + LASMIG.txt. Samtliga ZIP-filer har verifierats med streamade hashkontroller. Detta är presentationstillgångar, inga spelresultat.

**Tempo och före/efter:** de 14 tolvssekunderskällorna behålls kompletta. Hela rundans ändhållningar klipps enligt fryst bildrutemappning: 1 082 rutor/36,07 s (19,72 %) kortare, utan ändrad rörelsehastighet. Tretton interna och fyra yttre skarvar har tidigare separata jämförelser. Små posehopp kvarstår, särskilt retreat→slutvila. Åttarutors toning förkastades på grund av dubbla ansiktskonturer. Den nya helbankens ursprungliga korta sammanfogning hade 2,93 ms tidsdrift; explicit segmentduration gav exakt 30 fps med 4 404/4 404 identiska kodade paket och avkodade rutor. Originalet är bevarat, den valda filen slutar på trim-exact.mp4.

**Kortmasker – aktuellt urval:** samtliga 14 spår är frysta i runs/20261109-pamela-material-bank/take-03/plan.json och dess egna urvalskopia. C1 P2–P6 använder take-07:s stable/source99-paket, C1 P1/P7 edge take-02/take-03. C2 P1 draft02 rättar 15 rutor, 104–118; oberoende kontroll verifierar 0 tryck utanför pappret/skydd och oförändrat C1. Grön reflex i tunt läge, cirka 1–2 px blandkant och otryckt grepp 115–118 återstår. 70 adapterprovrutor passerade före helrendering. Fysisk kortsida är fortsatt UNKNOWN; mörk SG-baksida och faktisk kortvändning är inte godkända.

**Kortspår och tätt papper:** P1:s UV-hopp 96→97/guldram 99 och P7:s varma skugga 174–187/skoläckage är korrigerade i valda spår. En fast UV-kvartsväng för C1 P1–P3 gör att samma kort behåller tryckriktningen i C2-källan; P4–P7 är oförändrade. Före/efter och oberoende kontroll: runs/20261109-pamela-frozen-material-probe/take-05 och orientation-review. Tät grönbelyst papperskärna och verklig blandkant behandlas separat. Take-01/take-02 av helbanken är avbrutna och bevarade. Fysisk gemensam kortskala är ännu inte kalibrerad.

**Författat sidbyte – provbeslut:** runs/20261109-pamela-authored-flip-probe/take-01/review.json stoppar sidbyte i de två undersökta frysta C1-källorna. P1 visar bred yta hela vägen. P7:s smalaste undersökta läge f95 visar fortfarande en tydlig triangel om 1 145 täckta pixlar. Ett dolt byte har inte demonstrerats; SG-diagnostik visar dessutom en kvarvarande vit spets vid f99–104. 32 nativejämförelser ändrar 0 skyddade pixlar och 0 utanför papperet. De bevarade jämförelserna visar separata material, inget infört sidbyte. Ny rörelse eller särskild geometribearbetning behöver ett eget prov.

**Noder och scen:** references/pamela-motion-contract.json revision local-candidates-20261109-r5 har14 källbundna givningar,3 VILA-klipp och2 bryggor;0 saknade mediebindningar,0 runtimegodkända handlingar. Åtta fokuserade kontrakttester passerar, inklusive kvarliggande kort och invalidation vid ändrad hash/skarv. Separat rum,3D-bord med kant och relativa ljusprofiler finns i references/pamela-stage-contract.json. Pan begränsas till±0,16/0,07 scenenheter. Pamela och rum har bakat ljus; detta är författad2,5D, inte fysisk ombelysning eller återvunnen kamerageometri. Ny moving-pan-v2 visar P7 med sex tidigare kort inklusive korrigerade P1. Scenen väljer nu giltig ny källa som standard och väntar på laddad film före spelning/sökning. Reproduktionsstandarder finns i docs/granskning/FORMAT-OCH-KVALITET.md.

**Publikt:** https://scout-dealerlab.vercel.app/pamela-loop.html#fjorton-material visar R10, snapshot pamela-loop-review-20261109211718087. Hela 146,8 s/182,87 s-filmerna, 14 separata 12 s-klipp och ZIP finns där. Deployment och anonym hashverifiering: references/public-review.json och exports/pamela-loop-review-20261109-r10/published-verification.json. Endast scout-dealerlab, prj_mQwHzspK3GrrJA04eFOorFxth0d5 under team_Scxorb9qtZHjNae1YEQnFCaT, är publicerat. Scout main/admin, Neon/Render och Mauds läppsynk är orörda. Äldre prov är märkta som historik.

**Historiskt VILA-prov och återställning:** två 12 s WAN3-klipp planerades; jobb 01 ORIGINAL_PRESERVED_NATIVE_MISMATCH_BLOCKS_INTEGRATION, task 7dfbf7e3-750c-4803-8113-cb355535202d, bevaras. Jobb 02 PREPARED_NOT_SUBMITTED skickades aldrig. Källor och ankare finns i runs/20261109-pamela-idle-anchor-pilot/run-01; faktisk API-kostnadsuppgift för jobb 01 redovisas i beslutet nedan. Materialbankens export gjorde 0 nya API-genereringar. Fem GPT-förfrågningar användes; senaste svaret gällde det äldre 98,87 s-provet. Återställningspunkterna .runtime/checkpoints/20261109T152233Z-before-gpt-browser-rounds och 20261109T195913Z-material-bank-code bevarar 319 respektive 398 Git-synliga filer, index och patchar. Originalmedia ligger separat. Ocommittat betyder ännu inte sparat som Git-commit. Preview stoppas med STOPP.cmd.

**VILA-pilot – beslut:** jobb 01 är bevarat men avvisat som hel B→A-övergång. API-originalet är 1764×1174, 360 rutor/30 fps/12 s, två kolumner bredare än planen. Alla 845 280 ytterkantspixlar är gröna; det bevisar inte att en crop löser geometrin eller anslutningen. Åtta blinkningar och synlig ansikts-/blickskillnad mot slutankare A kvarstår. Root-beslut: runs/20261109-pamela-idle-anchor-pilot/run-01/root-job01-qa.json. Nativegrinden är fortsatt falsk och jobb 02 har inte skickats. API uppgav 240 krediter; kostnadsavstämning bevaras i privat driftunderlag. Ingen ansiktsändring, crop eller automatisk retry har utförts.

**VILA-fönster – separat prov:** zero: källrutor [289,327), 38 rutor/1.267 s, 0 blinkningar; one: källrutor [252,317), 65 rutor/2.167 s, 1 blinkningar. Varje trevarvsfilm har dessutom en originalstartruta för att visa tredje skarven. Fristående B→B-kandidater från verkliga originalrutor, inte godkänd A-anslutning. Nativebredden 1764 kvarstår. Referenser: references/pamela-idle-window-review.json och runs/20261109-pamela-idle-window-probe/take-01/evidence.json. Fulltagningens avvisning och jobb 02:s spärr gäller fortfarande.

## Central V3: kortsidor, bordskant och skarvar

[Ny central kandidat](https://scout-dealerlab.vercel.app/kortkontakt) korrigerar tre verifierade kompositfel: samma framsida målades på båda kortsidorna, grönspill skapade transparenta hål i pappret och V2-bordskanten ritades över kortet. Sidavtalet skiljer BACK/FRONT/UNKNOWN; okända kantlägen bevaras. Nyare kompositor används också för separat kontaktskugga och bålskymning. Saknade kroppspixlar har inte återskapats.

**Samma original och tidslinje:** 520 rutor, 30 fps, 17,33 s. Nativefil 1762×1174 och separat stående 1080×1920. V2 finns kvar. Kort 2 täcker fortfarande kort 1; gröna kanter och komprimerat tryck omkring källruta 76–78, skymd skokontakt och full handmask återstår. Kandidaten är inte produktionsgodkänd.

**VILA → REDO → giv → REDO → VILA:** UI-rutor 1–90 visar approach0–89, 91–267 visar första deal3–179, 268–430 andra deal17–179 och 431–520 retreat0–89. Ruta94 är utdataindex93/3,10s och givkällans ruta6. Approach och retreat är befintliga tresekundersfilmer; ingen extra mikrobrygga finns vid klippbytena. Studion visar fas och källruta från den faktiska tidsmappningen.

**Ändpunkter:** första och sista bilden kommer från olika genereringar och skiljer redan i originalen (ansikts-ROI MAE 7,82/255; inget kvalitetsbetyg). A/B med senare ingång gäller andning/blick och är inte infört i centralen. Kortkorrigeringen löser inte ansiktsskarven.

[SG-spelmarker](https://scout-dealerlab.vercel.app/markermaterial) är ett separat Three-prov med identiskt tvåsidigt SG-tryck, sex valörer, fem kantfärger, avrundning, mikrostruktur och tre ljusprofiler. Ingen insatslogik, fri gravitation eller infogning i dealerfilmen. Inga nya betalda genereringar ingick i kortkorrigeringsomgången.

Nästa steg: granska hela kortvändningen och råskarvarna, därefter sid-/greppkontrakt och C2-placering. Den första längre vilotagningen är nu utförd och redovisas överst.

## SG-kort, grönnyanser och sekvensval

[Kortstudien](https://scout-dealerlab.vercel.app/kortmaterial) har ett separat svart/gult SG-provtryck, tydligare linjer, neutral pappersbas och kontrollerad glans/böjning. Tre ljusprofiler demonstrerar hur samma material färgas av belysningen. Geometri och skuggning använder Three.js; React är studioskalet. Kortet får ingen fri gravitation under ett handstyrt giv och ligger stilla efter landning. Detta är ännu inte kortet i Pamela-filmen.

[Metodskissen](https://scout-dealerlab.vercel.app/scenfinish#sekvenser) skiljer sammanhängande vilotagningar från valbara spelhandlingar. En längre tagning minskar interna klippbyten men måste fortfarande klara slut–start. Sju givningar i tolv sekunder är inte belagt som fungerande eller 30 procent av banken. En enkel nodspellista kan återanvända granskade kanter; pose, fart, grepp, masker och korttillstånd måste mötas. Sex till tolv bryggrutor är en lokal kandidat, inte en generell lösning på identitetsdrift.

**Genomfört första långprov:** den ursprungliga 12-sekundersplanen utvecklades till fem små VILA-beteenden. Aktuellt resultat och budget står överst. Den tidigare planfilen bevaras som historik.

**Grönt är inte ett enda RGB.** Mätt bakgrundspatch: VILA cirka (1,237,46), andning179 (9,222,44), blick0 (0,237,45). Skillnaden finns i källmaterialet; generering och videokodning har inte separerats som orsaker. 0 av 143 948 undersökta opaka ansiktskärnpixlar ändrades av friläggningen. Hänvisningen till bild2 är inte säkert identifierad. [Evidens](../runs/20261109-green-light-audit/evidence.json). GPT-underlag/11 är bevarat som råkälla.

## Sammanhållen studio och konkret skarvprov

[Studion](https://scout-dealerlab.vercel.app/studio) samlar centralgivning, vilosekvens, andning, blick och de två nya skarvproven i en stor scenyta. React 19 med befintlig Next 16-bundler används; inga paket installerades. Tidslinje, rutsteg, uppspelningsläge, desktop/porträtt/råfilm och en infällbar kontrollpanel arbetar mot samma hashbundna filmer. Visningszoom 100–125 % och panorering är en gemensam 2D-transform av filmen; det är inte en ny fysisk kamera. Ingen ljus- eller lagerändring låtsas fungera på den platta filmen. Ljus, lagerbild, kortmaterial och nodkarta har egna tydliga länkar.

Referensen local-studio/blackjack-studio har verklig extruderad bordsgeometri och ett videoplan för dealern. Vi tar med panelgrupper, återställning och kontrollerad kamerahantering. Dess zoom 65–180 % är inte Pamela-godkänd. Panoramarummet är en sfär utan återvunnet rumsdjup; större sidrotation ger inte nya kroppsvinklar. 3D-bord/material kan bli nästa separat kalibrerade komponent; Görans scen förs inte in i huvudspåret som en bieffekt.

**Skarv A/B:** båda är 1762×1174, 30 fps, 60 rutor/2 s. A använder andning150–179 → blick0–29; B använder samma andning → blick12–41. 120/120 avkodade bildrutor matchar sina valda kompositkällor exakt. Ingen toning, frysning, omtimning eller ny betald generering. Kontaktarket visar fortfarande skillnader; B är ett klippningsprov, inte ett godkänt ankarklipp eller en färdig vilopolicy. [Tidsmappning](../runs/20261109-pamela-idle-cut-proof/metadata.json).

## Aktuellt: ljusprov, originalskarv och kortmaterial

[Ljus och skarvbevis](https://scout-dealerlab.vercel.app/scenfinish) visar samma andningsruta 90 med nuvarande ljus eller −0,18 EV. Alpha och kontaktgeometri är identiska. Det kombinerade kantprovet på sex rutor tunnar delalpha utan tydlig förbättring på ljus bakgrund och aktiveras inte. Filmfilerna är oförändrade. Hudens rödkanalsmättnad är 1,4–3,1 % i de klassificerade hudregionerna; detta är inte ett mått på korrekt scenljus.

**Ansiktsskiftet är verifierat:** sekvensruta 369 / 12,30 s är blickruta 9, efter bytet vid 12,00 s. Andning 179 → blick 0 återställer huddetaljer; samma fel syns vid andningsloopen 6 s. Friläggningen ändrar 0 pixlar i den kontrollerade opaka ansiktskärnan. Nästa steg är att pröva bättre klippunkter mot tempo och handkontakt, sedan ett riktat omtag om det behövs. Automatisk ansiktsändring eller mer oskärpa är inte en accepterad lösning.

[Kortmaterialprovet](https://scout-dealerlab.vercel.app/kortmaterial) är en separat Three-modell med fram-/baksida, valörer, tunn kant, mild böjning i luften och diskret glans. Efter landning är den exakt plan och stilla. J/Q/K är typografiska provtryck. Ingen fri gravitation, spelrandomisering, Pamela-handmask eller kontaktintegration ingår. Godkända rörelsespår och handskymning krävs innan den ersätter kortet i filmen.

[Scenprofilen](../references/scene-finish-contract.json) binder kamera, kontakt, friläggning, fast färgprofil, skuggor och export. Detta kan automatiseras med kontrollgrindar; ingen exponering ska pumpas automatiskt mellan rutor. Den fysiska ljusriggen bakom källfilmen är okänd. En ny ljusriktning eller flyttad sko/bordhöjd kräver nytt kontaktprov. En markerbricka är ännu bara ett placeringsförslag och får inte dölja hand-/kortbanan.

GPT-underlag/9 bedömer äldre central v2 från 03:02 svensk tid. Den nya vilokompositen har separat kontaktskugga/bålskymning; råden är inte bevis för samma rektangelfel i den. Synlig paketversion skiljs nu från filmernas hash. Vercel MCP kan läsa Scout Gaming-teamet men gav fortfarande 404 för labbprojektet vid senaste kontroll; publicering via verifierad CLI fungerar. Toolbar innebär ingen automatisk koppling mellan agentchattar.

## Bildyta, lager och små ankarbryggor

Ny läsgranskning: **4/4 aktuella ankare/basbilder och 5/5 aktiva råfilmer** matchar registrerade hashar. **18/18 Pamela-original** i exportpaketet public-review-20261109023124 är byteidentiska med lokala källor; inga av dessa är komprimerade visningskopior. Detta är exportkontroll, inte en ny fullständig HTTP-hämtning av samtliga filmer. Kompositer och stående format är separata derivat. V5 innehåller längre bål, inte dokumenterade ben eller helkropp.

[Lagerbilden](https://scout-dealerlab.vercel.app/scenfinish#lager) visar separata rum/bord/skuggor/kort och dealerfilmens fortfarande inbakade sko. Områdesrektanglarna är en förklarande skiss, inte färdiga pixelmasker. Rumsbilden är 1536×1024 och innehåller golv bakom bordet. Ingen komplett 3D-salong, extra sidovy, djupkarta eller uppmätt ljusrigg finns i huvudspåret. Begränsad gemensam nedskalning kan visa mer av den befintliga bakgrunden men är inte ny vidvinkel; säker maximal utzoomning återstår att prova.

Korta ankarbryggor är möjliga där en faktisk skarv behöver dem. VILA/REDO är gemensamma knutpunkter; vi beställer inte alla klipp-till-klipp-kombinationer. Matcha pose, rörelsehastighet, blick, grepp och kontakt. Redan utdelade kort behåller sitt tillstånd i spelkortslagret. Först prövas bättre klippunkter, därefter ett riktat rörelseprov om det behövs. GPT-underlag/10 avser det nyare 03:31-paketet och är bevarat som råkälla.

Vercelmål: [Scout Gaming / scout-dealerlab](https://vercel.com/scoutgaming/scout-dealerlab), team-ID `team_Scxorb9qtZHjNae1YEQnFCaT`, projekt-ID `prj_mQwHzspK3GrrJA04eFOorFxth0d5`. Projektet är inte scoutgaming.tech. MCP:s projektåtkomst återstår trots att teamläsning fungerar.

## Vila: nya original och första grundsekvens

Två Wan3-filmer är nu producerade från exakt samma VILA-bild som första och sista inmatning. Originalen är **1762×1174, 30 fps**: andning 6 sekunder/180 rutor och nedblick med blinkningar 3 sekunder/90 rutor. 270/270 rutor har översiktsgranskats; ansikte, händer och loopändpunkter har detaljgranskats. Originalens ansiktsdetaljer återställs vid 6 och 12 sekunder i grundsekvensen. Det är ett verifierat kontinuitetsfel; detta är kandidater, inte aktiverat spelinnehåll.

[Öppna viloprovet](https://scout-dealerlab.vercel.app/vila). Där finns separata original, nära kompositer, stående 1080×1920-vy och en 21-sekunders sekvens: **andning → andning → blick → andning**. Den använder 630 rutor utan toning, frysning, interpolation eller ändrad fps. Råa skarvar ligger vid 6/12/15 sekunder och vid 21 sekunder när sekvensen upprepas. Kompositionen behåller den befintliga rummets, bordets och kamerans koordinater. Den nya separata kontaktskuggan och bålskymningen provas på dessa viloklipp; centralgivets v2-filmer är oförändrade.

- Andningsoriginal: SHA-256 `ea74eb1c8724246571600648bf3acfccbadea5a8caf74d8963ba0d56be368049`.
- Blickoriginal: SHA-256 `af76918b478c78859d85733651ec987777e184fbc62dfe6097d4306c2c438564`. Ögonstängning omkring ruta 35–41 och 68–70; tydlig nedblick omkring 42–66. Insticket benämns därför nedblick **med blinkningar**.
- Historisk API-kostnadsuppgift: **180 krediter** för dessa två vilojobb. Faktisk faktura är inte verifierad. Ingen ny OpenAI-API-kostnad i den omgången. Äldre saldo-, reserv- och återstående budgetuppgifter används inte som aktuell beställningsram.
- [Originalgranskning](../runs/20261109-pamela-idle-pilot/review-summary.json) och [komposition/tidslinje](../runs/20261109-pamela-idle-composite/composition.json). Viloskarvar, anslutningen till givkedjan och instickets frekvens ska godkännas före en spelpolicy.

**Kort 2-provet är separat och avvisat som ofullständigt.** 119/180 rutor kunde renderas före en konservativ kompressionsspärr i grön bakgrund vid källruta 119. Det var inte ett observerat bevis på trasig arm. 33,9 % av den ompassade rörelsen återstår ogranskad. Nästa begränsade kontroll skiljer skyddad hand/ärm från bakgrunden men kräver fortsatt positiv lokal geometri överallt. Ingen ytterligare betald film behövs för den diagnosen. Originalens böjda papperskant och övergången vid släpp återstår också. [Exakt beslut och manifest](../runs/20261109-pamela-c2-retarget/retarget-manifest.json).

## Aktuell leverans

**Pamela v5 är identitetsgrunden.** Första sammanhängande kompositen finns nu: VILA → REDO → två centralgiv → VILA. **1762×1174, 30 fps, 520 rutor, 17,33 s.** Samma centralgiv används två gånger. Källkamera, kroppsskala och hela arbetsytan är låsta. Provet är inte en produktionsgodkänd bank.

- [Aktuell offentlig granskning](https://scout-dealerlab.vercel.app/#aktuellt)
- [Nytt referenspaket med ankare och koordinater](../runs/20261109-pamela-reference-kit/reference-kit.json)
- [VILA → REDO-original](../runs/20261109-pamela-reference-kit/original/pamela-vila-till-redo-wan3.mp4)
- [Granskning och ändpunktsmätning](../runs/20261109-pamela-reference-kit/qa/decision.json)
- [Version, tid och lokal källrevision vid publicering](https://scout-dealerlab.vercel.app/latest.json)

Filmen är **1762×1174, 30 fps, 90 rutor, 3 sekunder**. Modell Wan3, task `d13b31d2-3cca-443a-a710-3827df8194c9`, API-kostnadsuppgift 60 krediter. SHA-256 `00efe62636916b79052b4cf9d5fa88ba1ad52c17d531f1dcc86875f94c91084c`. Den bygger på egna Pamela-ankare, utan Astrid-kontrollvideo eller ärvda kortspår.

Kontaktarket visar samtliga 90 rutor; originalrutor 0/30/60/89 är inspekterade. Händer och armbågar syns inom bild i dessa granskningar. Handen når kortet i skon. Detta bevisar **inte** full givräckvidd, korrekt grepp under utdragning eller sömlös anslutning mellan de nya filmerna. RGB-skillnader mot ankaren är dokumenterade, inte omvandlade till ett godkännandebetyg.

## Standard, nodträd och läsbar karta

**Arbetsriktning efter Jakobs förtydligande:** nodmodellens samband är grunden för den nya referensbanken. Admin, Kevin/Emil och andra system får uttryckliga översättningar till den. Befintliga fack-ID:n bevaras som integrationsreferenser. Ord och gruppering skjuts upp; ingen ny Admin-taxonomi införs nu.

Den publika kartan visar nu en **klickbar graf**: startpose → rörelse → slutpose, med linjer till film, målplats, kortspår och handmask. Pilotens kedja och vald rörelse är två vyer av samma data. Klick på rörelse väljer rätt film/posevariant; ett saknat iv-klipp får inte visa base-filmen. Gula noder visar det som saknas eller är omätt. Spelindikatorn avser bara kartans egen spelare.

Grafens data finns i references/dealer-map.json under graph.nodes och graph.edges, härlett av src/dealer-relations.ts. Klickbara pilar är inte bevis på sömlös skarv eller godkänd spelbindning. VILA/REDO efter ett giv kan ha samma handpose men ett annat bordstillstånd.

[Öppna den publika nodkartan](https://scout-dealerlab.vercel.app/nodkarta). Råunderlagen finns oförändrade i `gpt-underlag/5`. Standardens v0.1 och nodträdets v1.0 är två författares dokumentversioner, inte kvalitetsbetyg. Nodträdets evidenssnapshot är äldre än standardens; dokumentnumret avgör inte vilken uppgift som gäller.

Verifierad jämförelse: **36/36 fack-ID:n matchar Main**, 32 blackjack och fyra roulette, varav ett roulettefack är en referensbild. Fem förtydliganden finns i [audit](../references/pamela-standard-audit.json): roulette har utkastbindningar; bildplanen skiljer sig; dokumentens kind är beskrivande; bank-/schemanamn är förslag; variantgränser har olika omfattning.

`references/dealer-map.json` är en härledd lokal läsmodell. `tools/build-dealer-map.ts` kontrollerar källhashar, auditerad katalog och filmhashar. `src/dealer-map.ts` validerar fack, poser, plats/box, mätstatus och bindningsstatus. Samma data driver den klickbara publika kartan. Atlas läser ännu inte detta schema automatiskt; en framtida adapter ska använda projektionen och inte skapa ett andra manuellt register.

Grafens layout är läsordning. Mediekoordinater är hashbundna till sin källa. 1536×1024 är stationsbilden, 1762×1174 filmen, 1920×1080 datorvyn/föreslaget bankplan och 1080×1920 dagens Main-fabrik. Gula hand-/skopunkter i kartan är uppskattningar. Egna synliga kortspår och rörliga masker finns nu i kompositrapporten. Dolda hörn och godkänd banktransform återstår; nodkartans gamla skopunkter är fortfarande uppskattningar. Kartan visar vad som spelas i dess egen granskningsspelare; den övervakar inte live-spel i Main.

## Arbetsfaser och nya parallella prov

En publiceringstid är inte en ny filmversion. Den granskade v2-filmen har SHA-256 `f4ee51b895ec6b3d72ad54ef06ce019d06bfbda8e7e09976d5e7559bce890102` även när masterplanen publiceras igen. Råd från GPT-underlag/8 prövas mot dessa källor och den faktiska koden. Bevarade original ändras aldrig; ett nytt bearbetningsprov får egen fil och hash.

**Det som hålls fast under nästa kontaktprov:** nära kamera, scenens koordinater, befintligt bord/rum och originalfilmernas 30 fps. Detta låser inte fast konstaterade maskfel eller blockerar en bättre kontaktskugga.

| Fas | Konkret prov | Villkor för nästa steg |
|---|---|---|
| Kontakt | Sammanhängande bålskymning och separat hand-/kontaktskugga | Ingen rektangulär patch, inga avklippta svarta ärmar, kontroll på både ljust och mörkt bord. |
| Kort 2 | Begränsad gemensam ompassning av hand, underarm, kort och källskugga medan kortet är i luften | Första kortet ligger kvar. Andra landningen når 65–70 procent överlapp utan glidning efter släpp, dubbelhand eller synlig deformation. Ett tekniskt mask-/spärrfel felsöks först. Riktat rörelseomtag blir aktuellt först om befintlig rörelse inte kan ge trovärdig kontakt. |
| Vila, parallellt | En sexsekunders andningsloop och ett tresekunders blickinstick | VILA → VILA, identitet/kroppsskala/händer/sko bevarade. Rå loopskarv och anslutning till övriga kedjan granskas före aktivering. |
| Material | Kortmodell/material från new-front2 anpassas till godkänd kontakt | Samma kortspår, korrekt fram-/baksida, hud framför kort och läsbara valörer. |
| Utökning | Ytterplatser, större bordsyta och begränsad blick/zoom | Centrala kontakter och utsnitt håller först; Main-integration är fortfarande separat. |

**Kontrollerat ”fusk”:** en lokal bildanpassning kan fungera under rörelsen, särskilt när kortet är kantvänt eller delvis dolt. Greppunkter och fingrar måste följa med. Hela dealern eller det tidigare kortet ska inte flyttas för att kompensera. Ingen extra oskärpa eller övertoning får dölja kontaktfelet i granskningen.

### Kortreferensen från new-front2

Den lokala koden använder Three/Fiber med direkta positions- och rotationsanimationer; kortscenen har ingen gravitations- eller kollisionssimulering. Geometri, texturritning och material är bevarade som hashbundna läskopior i `references/card-materials/new-front2/`. Källmappen saknar Git; v0-chattens innehåll kunde inte läsas. Slutsatserna avser den lokala koden.

Kortets lokala mått är 2,5 × 3,5 × 0,025, med kortplanet i XY. Det är modellkoordinater, inte kalibrerade meter i Pamela-scenen. Material och kortutseende är användbara; korthusets kamera, parallax, slumpdragning och sidlayout importeras inte. En 3D-modell löser inte borttagningen av filmens vita kort eller skymningen från fingrarna. Kontrollerad rörelse efter uppmätta spår prioriteras framför fri fysik.

### Grundloop och instick

Grundloopen är den lugna återkommande andningen. Insticket är en kort avvikelse, här en blick ned och tillbaka, som återvänder till samma VILA. Båda utgår från `pamela-vila-station.png`, SHA-256 `ac2924b76ebab596918fa802b6145628ee805e0b37a04d1117c8dc4f4aae2621`, som första/sista modellbild. Det är ett posekrav, inte bevis för att en genererad skarv redan är sömlös.

Första omgången är genomförd: två Wan3-kandidater, 180 Runway-krediter tillsammans inom den befintliga pilotbudgeten. Faktiska task-ID, kostnadsreservationer, format och QA sparas i `runs/20261109-pamela-idle-pilot/` och pilotens budgetjournal. Inga kandidater blir automatiskt aktiva i Main eller i någon vilopolicy.


## Nästa leverans: bordkontakt, kort 2 och sammanhängande ljus

Jakobs nära datorvy behålls som standard. **Inga nya filmer beställs i denna granskning.** Den nya [placeringsskissen](../runs/20261109-pamela-central-composite/review/c2-layout/overlap-plan.svg) och [koordinatförslaget](../runs/20261109-pamela-central-composite/review/c2-layout/placement-plan.json) är förslag; den publicerade v2-filmen har ännu samma landningspunkt för båda korten.

1. **Bordkontakt först.** Den fyrkantiga kanten är vår rektangulära bålövertäckning x840–1065/y817–837. Den kommer inte från Astrid. Ersätt den med en kontur som skyddar både hud och svarta ärmar. Källans handskugga på grönt försvinner nästan helt vid nycklingen: 3246/3264 kontrollerade pixlar har alfa ≤0,01. Återför eller rekonstruera skuggan i ett separat lager på bordet. Kontrollera vila 000/519, skarven 089/090 och utsträckning 171/185.
2. **Två kort, rena konturer.** Det finns två kortobjekt. Rörligt källkort, ritad kortkant och underliggande kort kan ge intryck av tre kanter. I kompositruta 348 (källruta 98) ligger 556 av 9433 synliga maskpixlar utanför den uppskattade ytan för korttrycket. Mask/tryck måste täcka samma kort, med fingrarna kvar framför. Detta är ett mätt täckningsfel, inte bevis för ett tredje utdelat kort.
3. **Kort 2 med 65–70 procent överlapp.** Förslaget låter första kortet ligga kvar och flyttar andra landningsmålet 46 källpixlar åt höger: **67,6 procent arealöverlapp**. Båda vänstra valörhörnen exponeras. Mät faktisk läsbarhet i desktop och mobil. Den andra handen måste nå det nya målet före släpp; en mask ensam skapar inte rörelsen. Prova avgränsad anpassning bara om greppet håller, annars ett riktat kort-2-klipp inom pilotens kvarvarande mandat. Ingen glidning efter släpp.
4. **Ljusare rum och andra bord.** Samma bordgeometri kan få annat material. En gemensam scenprofil ska binda kamera, kontakthöjd, skoutlopp, ljusriktning, färgtemperatur, ljusstyrka och skuggmjukhet. Prov på ljus, neutral och mörk bakgrund visar kantfel. Inbakad belysning på Pamela och skon kan färgjusteras begränsat; helt annan ljusriktning kräver kompatibelt källmaterial. Annan bordhöjd, vinkel eller sko kräver ny kontaktkalibrering.
5. **Oskärpa och navigation.** Nuvarande rum får samma extra oskärpa över hela lagret (sigma 8). Större avstånd kan få mer oskärpa med djupkarta eller separata när-/mellan-/bakgrundslager. Den nära startvyn ska bestå. Begränsad dragning och zoom ut kan senare visa en utbyggd bordsyta med spelarens egen kant, med gemensam transform för kontakter. Den platta slutfilmen kan inte ge riktig sidovy av Pamela; stora kameravridningar kräver ny geometri eller nytt bildmaterial. Utzoomning måste också hålla alla käll- och maskkanter dolda.

### Vad Astrid och Kevin faktiskt gör

Ny read-only-kontroll 2026-11-09: remote `kevin-staging` är `61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65`; `main` är `e4ea896a197d3b6c006d18d1d7b224419094e51e`. Ingen integration eller ändring av referensprojektet gjordes.

- **Astrid classic:** tidsbundna fingermasker skyddar hela kortlagret, även äldre kort; inte en fullständig separat armbild. [Maskdata](https://github.com/Jakeminator123/scoutgaming/blob/61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65/kevin/croupier-scoutgg/public/dealer-hand-tracks.js#L2), [tillämpning](https://github.com/Jakeminator123/scoutgaming/blob/61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65/kevin/croupier-scoutgg/public/game-cards.js#L149).
- **Astrid2:** `handMatte:false`; shadern tar bort originalkortets yta och bevarar hud. [Val av metod](https://github.com/Jakeminator123/scoutgaming/blob/61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65/kevin/croupier-scoutgg/public/dealers.js#L127), [shader](https://github.com/Jakeminator123/scoutgaming/blob/61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65/kevin/croupier-scoutgg/public/dealer-layer.js#L102).
- **Kort 2:** Kevin använder även programmatisk spridning. Tidigare kort börjar förflyttas ungefär 0,25 s före kontakt och flyttas över 0,5 s. Det är ingen garanti för stillhet efter släpp. [Kortplacering](https://github.com/Jakeminator123/scoutgaming/blob/61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65/kevin/croupier-scoutgg/public/game-cards.js#L75). Vi tar med maskprincipen men inför inte automatisk kortglidning.

Det nya GPT-originalet är bevarat i `gpt-underlag/7`. Det granskar v1 från 02:17 svensk tid. Mobilformat, bordsmaterial, rumsoskärpa och kortglidning ändrades i v2; påpekandena om skuggor, kanter och sammanhängande scenljus är fortfarande relevanta.


## Central komposition och faktisk leverans

**Aktuell korrigering v2:** all efterföljande kortglidning är borttagen. Samma centrala original återanvänds två gånger, på samma fasta landningsyta; andra kortet täcker första. V1:s förflyttningar är ett historiskt, avvisat presentationsförsök.

V2 har bättre lokal kantfriläggning, mörkare oskarp rumsrendering och ett nytt realistiskt mörkt bord som eget transparent lager. Hår/öron förbättras utan att ansiktsinteriören ändras före kodning. Grundmjukhet finns i Wan3-källan: uppmätt 15 400/15 400 ansiktsinteriörpixlar var redan identiska i original och första PNG-komposit.

**Mobil:** separat 1080×1920-film med samma 520 rutor i 30 fps. Dealer, händer, sko och kort projiceras tillsammans med ungefär 0,9× skala och −250/+80 px placering. Kontaktregionen ryms; skons bakände beskärs som i Astrid-referensen. Bakgrund och bord fyller stående scen. Ingen sträckning av personen eller liten desktopfilm i en svart stående ruta.

React-komponenten lämnar den naturliga filmvyn först; alla kontroller, skarvval, skiss och ordlista ligger under. Ingen sidokolumn krymper filmen.

[Spela kompositionen och råskarvarna](https://scout-dealerlab.vercel.app/komposition). [Tidsmappning och proveniens](../runs/20261109-pamela-central-composite/composition.json). [Hashbundna kortspår](../runs/20261109-pamela-central-composite/tracking/card-tracks.json).

Ny ren rumsbakgrund, ett mörkt bord och en sammanhängande bakre bordskant används tillsammans med Pamelas originalfilm. Skon är fortfarande inbakad i filmen; den är låst och dupliceras inte. Den kan ännu inte bytas oberoende. Rummet och V2-bordets material är skapade med inbyggd bildgenerering; exakt modell och kostnad är inte exponerade. Bordets geometriska inpassning och korttrycket är kodstyrda. Det tidigare V1-bordet var helt kodritat.

För varje centralgivsruta finns mask för synligt rörligt kort och kortet i skon: 360 masker för 180 rutor. Granskningen skiljer synliga konturer från dolda, omätta hörn. Korttrycket följer en uppskattad stödyta i rörelsen, med originalkort vid kantvändning. Detta är inte en färdig semantisk handmask eller en accepterad spelbindning.

Efter släppet ligger spelkortet i eget beständigt lager på samma fasta landningsyta. V2 använder ingen förflyttning efter släpp. V1:s sidoglidning bevaras enbart i det tidigare granskningsoriginalet. Kort2 bredvid eller med halvöverlapp är ett separat mask-/rörelseproblem, inte en godkänd ny landning. Slump, kortvärden och spelregler ligger fortsatt utanför labbet.

Källrutor: A0–89 → C3–179 → C17–179 → R0–89. Leveransskarvar: 90, 267 och 430. Ingen frysning, övertoning, hastighetsändring eller fps-konvertering. Färgöverflöd som gav cyanprickar är rättat; de två tidigare felområdena innehåller nu 0 cyanpixlar. Det är en teknisk kontroll, inte rörelseacceptans.

**Kvar:** synliga ansikts-/ljusskillnader vid skarvar, gröngul/trappad hår- och skokant, full hand-/kortskymning och godkänd torso-/bordkontakt. Aktuell kamera är standard. Desktop behåller aktuellt utsnitt; mobil väljer en egen stående projektion. Slutlig spelyta och ytterplatser återstår att godkänna.

Det nya GPT-tillägget är bevarat oförändrat i gpt-underlag/6, med hash. Dess förslag är underlag; Jakobs senaste önskemål om samma nuvarande vy styr detta prov.

## Granskningsvy och kort 2

Den publika /komposition-vyn använder nu samma React-komponent som den lokala Next-routen. Den har stor film, källbyte, ruta för ruta, skarvhopp, tempo för granskning, naturlig desktop, separat stående mobil samt rörelseskiss och ordlista. Den publika kopian innehåller bara komponenten och utvalda tillgångar, ingen lokal API-server. Inga nya beroenden eller shadcnblock är installerade. Lokalservern är fortsatt stoppad; START.cmd/STOPP.cmd gäller om Jakob senare vill återöppna lokal preview.

En separat kort2-pilot finns i [minimikontraktet](../runs/20261109-pamela-central-composite/tracking/c2-pilot/c2-mask-manifest.json). 42 lokala foregroundmasker täcker centralrutor77–118. Fem kontaktbevis visar vad handen/underarmen skymmer. Bredvidplacering ger0% kortöverlapp, −100px ger29,4%, −71px ger49,9%. Dessa är geometriska prov; de godkänner inte nästa korts fysiska kontakt. Svart ärm mot svart torso är inte separat observerad.

Kortets ordningsnummer och placering är egna egenskaper under rörelsen, skilda från start-/slutpose. Exempel box-2-c2 och dealer-c2 är ännu kontraktsexempel utan verifierad målbindning. En mask ändrar skymning; att flytta själva handen eller landningsplatsen kräver ny rörelse eller prövad omprojektion. Kort2-provet är separat från den publicerade kompositfilmen.

Skarvar behövs för spelstyrda val mellan klipp, men de ska vara visuellt kontinuerliga. Samma pose räcker inte om hastighet, ansikte, ljus, sko eller bordets korttillstånd hoppar. Three.js/Fiber kan senare rendera lager, men fysik eller gravitation löser inte denna mätning automatiskt.

## Historiskt centralt prov: tidigare arbetsordning

Avser det äldre centralprovet. Aktuell ordning är filmkontrakt och P1:s två returvägar överst i dokumentet.

1. Granska den renderade centrala kompositionen i rörelse och dess tre råskarvar. Behåll aktuell kamera och hela arbetsytan.
2. Förfina kanter, korttryck och skymning på befintliga filmer. Three.js/Fiber kan senare rendera lagren men ersätter inte uppmätta kortspår eller handmasker.
3. Godkänn beständiga kort, släpp och kontakt genom två på varandra följande givningar. Gör ett riktat omtag bara om befintlig rörelse inte kan fungera.
4. När central kedja fungerar: prova plats 1 och 7, därefter resten av banken. Inga nya betalda jobb startas av nodkartans knappar.

## Nya giv- och återgångsprov

[Filmdata och granskning](../references/pamela-sequence.json). Centralgiv: **1762×1174, 30 fps, 180 rutor, 6 s**, Wan3, task `390ff634-df94-4666-b9bd-8951b2ac686a`, 120 krediter, SHA-256 `2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a`. Återgång: samma mått/fps, **90 rutor, 3 s**, task `d0f9d466-cd29-41ef-a2db-c9783bc78256`, 60 krediter, SHA-256 `81a63227a56531103bd9d86b364442869b72eef0ddd3be65e718f3494ee2147b`.

Alla 270 nya rutor är indexerade i kontaktark. Sju originalrutor i given och fyra i återgången är inspekterade; exakt lista och RGB-ändpunktsmått finns i respektive QA. Given visar utdragning, handbyte, central placering och återgång. **Kortet har böjd/mjuk kant i ruta 84**, och sammanhängande hand-/kortkontakt samt exakta skarvar är inte godkända. Ingen övertoning eller ändfrysning har dolt råmaterialet.

REDO är en handpose, inte ett krav på identisk helscen: given lämnar ett extra kort på bordet. Återgångsoriginalet filmades utan landat kort. Direkt sammanfogning skulle därför få kortet att försvinna. Den nya kompositen behåller därför korten i eget spelkortslager med egna synliga kortmasker. Detta är **inte löst genom att bara lägga ihop filmerna**. Kontakt, full handskymning och skarvar återstår att godkänna före fler bankjobb.

Maud-granskningen visar att det lokala Maud-skriptet gäller läppsynk. Gemensamma hashbundna ankare och rå skarvmätning kan återanvändas som princip. Dess gamla porträttkoordinater, små IoU-bilder och åtta rutors ändtoning är inte acceptansbevis för Pamela. [Maud-audit](../references/maud-pamela-reuse-audit.json).

## Det tidigare återgångsfelet är bekräftat

Jakobs observation stämmer: i den äldre dämpade panoramakompositen hamnar handernas uppmätta hudcentrum cirka **23–24 bildpixlar lägre** efter given. Kompositorn håller samma skala men fryser första respektive sista källrutan i 1,25 sekunder. De två poser som fryses är olika. Direkt loopning återställer därför synligt posen. +33 px-förflyttningen döljer mittglipan mot bordet men rättar inte detta ändpunktsfel.

[QA med metod och skriptbevis](../runs/20261108-pamela-contact-round2/qa/endpoint-review.json). [Första och sista ruta, samma utsnitt](../runs/20261108-pamela-contact-round2/qa/endpoint-first-last.png). Skärmbildernas exakta källrutor är okända; mätningen är gjord på filmfilerna. Filmerna bevaras som historiska, underkända för sömlös återgång. Ingen ny frysning eller övertoning döljer felet i originalen.

## Rörelsekedja och beviskrav

Keystone betyder här en referensbild för en definierad pose. En bild är inte automatiskt ett godkänt rörelseankare: den faktiska filmen måste nå posen med rätt kropp, kamera, sko och händer.

| Steg | Fack | Status / krav |
|---|---|---|
| VILA → REDO | `transition.shoe/to-shoe` | Ny kandidat finns. Blick och hand till kortets plockläge; ingen utdelning. |
| REDO → VILA | `transition.shoe/from-shoe` | Ny 3 s-kandidat. Rå skarv, handform och samma VILA återstår att acceptera. |
| REDO → giv till plats 4 → REDO | `4:base`, `deal.player.centre/box3` | Ny 6 s-kandidat. Kortets form och fingerkontakt, egen spårning och handmask återstår. |
| Giv till plats 1 och 7 | `box0`, `box6` | Verifiera hela armarnas räckvidd tidigt, före övriga platser. |
| Resterande bank | Övriga Main-fack | Först när centralgiv, återgång och ytterlägen fungerar. |

**VILA → REDO slutar avsiktligt i en annan pose.** REDO → giv → REDO måste tillbaka till samma REDO. VILA → giv → VILA måste tillbaka till samma VILA. `posN-i` är en hel giv VILA→REDO, inte en ren förflyttning till skon. `v` innehåller också en giv; `iv` är den fulla VILA→giv→VILA-varianten. [Verifierat Main-kontrakt](../references/main-pilot-contract.json).

## Eget bildplan, händer och lager

VILA- och REDO-bilderna använder 1536×1024. Nya källpixlar och normaliserade koordinater finns i referenspaketet. Skons vita kortyta har mätt omslutande rektangel; den är **inte** fyra kalibrerade perspektivhörn. Handkontaktpunkter är manuella uppskattningar. Landningspunkter för sju platser och 3D-radier är ännu okända.

Den valda v5-bilden bevarar mer bål. De senare arbetsstationsbilderna har åter en antydd grön bordsyta vid midjan. De kan pröva övergången till skon men bevisar inte att valfria bord kan läggas framför kroppen. Det måste lösas tillsammans med faktisk handocklusion och bordskontakt.

Händerna ska finnas i källfilmen genom hela utdelningen. Naturlig skymning bakom sko eller bord är tillåten; avklippning vid filmgränsen är ett fel. Desktop och porträtt ska ha dokumenterade projektioner av samma källa, utan att en tät bild automatiskt förstorar personen i scenen. Full framåträckning och plats 1/7 återstår. En helskärm med grön marginal är inte i sig bevis för tillräcklig rörelseyta.

Kevin/Astrid2 visar en hel dealerfilm, följd kortyta och maskning som behåller fingrar framför ett separat spelkort. Ingen separat genererad armfilm är belagd i de inspekterade renderingsvägarna. Den principen kan användas med våra egna filmer. Identisk kontrollfilm innebär inte identiskt efterarbete eller samma slutkvalitet. [Kodbevis och referensurval](../references/kevin-production-pick.json).

Görans helkropp, byggda salong och panorama är **valbara sidoreferenser**, inte del av aktiv huvudplan eller produktionsgeometri. [Separat 3D-underlag](studio/ALTERNATIV-3D.md). Äldre Pamela/Astrid-försök och Darkhall bevaras som jämförelser. Darkhall innehåller redan bord och sko och är ingen ren rumsbakgrund.

## Vägen in i Scout /studio/snabb

Labbets leverans ska vara en ny versionerad referensbank med filmhashar, poser, egen kamera-/bord-/skogeometri, korthörn per ruta, händelsetider och handmasker. Andra dealers ska kunna genereras utifrån samma kontrakt, men deras faktiska rörelse måste kontrolleras; en gemensam prompt garanterar inte identiska spår.

Det finns en verifierad lucka i dagens importväg: kopieringsläget ärver referensbankens spår; mätläget ger `tracks: {}`; profilimporten avvisar godtyckliga ändringar mot basprofilen. En ny registrerad bank/profil och stödd importväg behövs. Att lägga ett nytt `geometryReferenceId` i dagens request är inte en fungerande lösning. Detta är kartlagt men **inte implementerat** i Main. [Kontrakt och införandepunkter](../references/main-pilot-contract.json).

Main-fabrikens aktuella kontrakt är 1080×1920/24 fps. Det nya 30 fps-originalet behålls. En eventuell adapter får egen hash och tidsmappning; kortspår mäts om mot exakt leveransfil. Ingen tyst konvertering eller återanvändning av Astrid-spår. Spelregler, slump och kortvärden stannar i Scout-motorn.

## Genereringsenhet och pris

Vi har genererat **separata rörelser**, inte en lång film som redan styckats: VILA→REDO 3 s, centralgiv 6 s, REDO→VILA 3 s. Först när råa ändposer, kontakt och scenens korttillstånd fungerar sätts delarna samman. Korta jobb gör omtag av en enskild rörelse möjliga. En längre sekvens kan prövas senare om dess interna klippunkter faktiskt når rätt pose och hastighet; beskärning eller klippning skapar inte saknade ankare.

Verifierad [Runway API-prislista](https://docs.dev.runwayml.com/guides/pricing/) 2026-11-09: Wan3 1080p = **20 krediter/sekund**, 1 kredit = **0,01 USD**, före eventuell skatt och utan omtag eller separat bildarbete.

| Befintligt jobb | Längd | Krediter | USD |
|---|---:|---:|---:|
| VILA → REDO | 3 s | 60 | 0,60 |
| Centralgiv, base | 6 s | 120 | 1,20 |
| REDO → VILA | 3 s | 60 | 0,60 |
| Dessa tre tillsammans | 12 s | 240 | 2,40 |

Original, input, prompt, modell/task-ID, mått, fps, rutantal, hash och granskningsbeslut dokumenteras i respektive runs/. Återstående arbete och acceptanskrav finns här och i references/production-plan.json. Saknad mätning, okänt bildmodellnamn och okänd bildkostnad markeras uttryckligen; dokumentation betyder inte att allt är verifierat.

## Budget, publicering och uppföljning

- Detta avsnitt beskriver äldre pilotomgångar. Deras dåvarande beställningsramar är inte aktuella maxbelopp för den nya P1-piloten; aktuell kostnad och nästa steg står överst i dokumentet.
- Historisk [budgetjournal](../runs/20261108-pamela-deal-pilot/qa/budget-ledger.json): **12 slutförda videogenereringar**, API-kostnadsuppgifter **878 krediter**. Faktura är inte verifierad. Detta är en äldre delsammanställning, inte dagens totalkostnad eller en återstående beställningsram.
- V5, de två stationsankarna och REDO-bilden med ett landat kort skapades med inbyggd bildgenerator. Exakt modell och kostnad exponeras inte och redovisas som okända, inte noll.
- Runway Developer API är produktionsvägen. Pluginanslutningen är separat och behöver inte felsökas vidare för detta uppdrag.
- Efter färdig granskningsomgång publiceras aktuell kandidat, masterplan, original, prompt, modell/task-ID, mått, fps, rutantal, hash och högst tre frågor. Gamla A/B-länkar kan behålla historiska val; använd aktuell startsida eller dess nya jämförelselänkar.
- [GitHub #1235](https://github.com/Jakeminator123/scoutgaming/issues/1235) är gemensam återkopplingstråd. Det finns ingen direktförbindelse till browseragentens chatt eller Windowsfiler. Ange snapshot, filhash och ruta/tid vid återkoppling.

Lokalservern är stoppad enligt Jakob. Publik sida är granskningsytan. Inga genereringar pågår vid denna uppdatering. Ingen uppmätt total färdiggrad eller godkänd komplett sekvens finns ännu.

Råunderlag bevaras i `gpt-underlag/0–5`; omgång 5 innehåller standarden och nodträdet. Äldre planer och försök finns kvar i dokumentversioner och respektive run. [Produktionssteg och kriterier](../references/production-plan.json) beskriver vad som är gjort respektive återstår.
