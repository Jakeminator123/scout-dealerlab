# Karta över studion och underlaget

Läs vid orientering eller ändringar i studions arkitektur. Läs andra ämnesfiler först när uppgiften behöver dem; de är inte obligatorisk omläsning för varje meddelande.

| Fråga | Dokument |
|---|---|
| Aktuell leveransordning, numrerat GPT-underlag och Materialprov | [Masterplan](../MASTERPLAN.md) |
| Gemensam riktning och verifieringsgräns | [Granskningsingången](../GRANSKNING-UI-VIDEO-OCH-GPT.md) |
| Ord, synonymer och skillnader mellan systemen | [Terminologi](../terminologi.txt) |
| Gemensamma kortnamn, hand/sida och rörelsesträngar | [Namn och rörelsesträngar](NAMN-OCH-RORELSESTRANGAR.md) |
| Format, vila, grundloop, suffix och QA | [Format och kvalitet](../granskning/FORMAT-OCH-KVALITET.md) |
| Nästa dealer enligt ny GPT-dialog | [GPT-kedjan](../granskning/GPT-KEDJAN.md) |
| Keystone, bildproveniens och nästa bild | [Keystone](../granskning/KEYSTONE.md) |
| Exakta källrevisioner och koordinatkontrakt | [Teknisk källkarta](KALLKARTA.md) |
| Dealeridentiteter och parallella pipelines | [Dealers och pipelines](DEALERS-OCH-PIPELINES.md) |
| Alternativa superfeature-scenens teknik | [Alternativ 3D-scen](ALTERNATIV-3D.md) |
| Provisorisk filstruktur, D-arkiv och Blob | [Provisorisk struktur](../drift/PROVISORISK-STRUKTUR.md) |
| Lokal drift och dokumentversioner | [Arbetssätt](../drift/ARBETSSATT.md) |
| ZIP, delning, sökning och cache | [Delning och cache](../drift/DELNING-OCH-CACHE.md) |
| Fria scener och visuell lagerplacering | [Adminprototyp](ADMIN-PROTOTYP.md) |
| Extern åtkomst, endast vid integrationsarbete | [Åtkomst](../drift/ATKOMST.md), [åtkomstplan](../drift/ATKOMST-PLAN.md), [integrationsgräns](../drift/INTEGRATION.md) |
| RunPod-konton, MCP och läppsynksval | [RunPod och läppsynk](../drift/RUNPOD-OCH-LAPPSYNK.md) |
| Spela Maud, chatta, styra läppsynk och förladda banker | [Mauds testyta](../drift/MAUD-TESTYTA.md) |
| Senaste bevarade arbetsläge | [Status](../drift/STATUS.md) |

Appen ligger i `app/` och `src/`; `references/` innehåller scheman/identiteter, `media/` lokala tillgångar och `runs/` avgränsade försök. Projektrotens `START.cmd` startar labbservern. GPT-paketets `START.cmd` öppnar bara dess statiska `index.html` i standardwebbläsaren.

## Aktuell extern granskning och nodindex

[Samlad granskningsingång](https://scout-dealerlab.vercel.app/granskning.html) samlar senaste VILA-kedjan, vald 14-klippsbank, frågor, nuläge, lagringsinventering och källor. [Materialkatalogen](https://scout-dealerlab.vercel.app/granskning/katalog.html) är grupperad per försök/ämne. /latest.json anger aktuell snapshot, /granskning/manifest.json filhashar och direkta URL:er, /granskning/noder.json korsreferensen till rörelse-ID. /granskning/starttext.txt är Jakobs starttext för en extern GPT-granskare.

Granskningsindexet kopplar valda filmer till noder för läsning; det ersätter inte den äldre nodkartan eller rörelsekontraktet. Main/Atlas är inte inkopplade och ingen runtimeacceptans införs. Filmerna är längre komna än nodintegrationen. R16:s interaktiva scen- och designprov bevaras; den senaste lokala P2-skon finns i käll-/bevismaterialet men dess interaktiva publiceringsvy är fortfarande R16.

Slutmålet är en dealer genom ett sammanhängande, återkörbart flöde som kan startas med ett knapptryck. Krav och kvarvarande steg finns i masterplanen och references/review-brief.json. references/review-storage-audit.json redovisar 46,01 GiB logisk filstorlek i runs: uppackade rutor, mellanrenderingar, masker, filmer och bevis. Detta är inte verifierat frigörbart utrymme och innebär inget raderingsbeslut.

## Lokalt och publikt före/efter-prov

[Publika V6-provet](https://scout-dealerlab.vercel.app/pamela-prov.html) och lokala /pamela-prov visar kortets utdragning, släpp 117→118, liten kontaktskugga och vila→två givningar→vila. Lokalsidan läser runs/20261109-pamela-local-release-proof/report.json. Börja på källruta 39 för ett tydligt före/efter, följ böjningen vid 78–80 och växla mellan 117/118 för släppet. Bildrutesteg, gemensam transport och låg hastighet gör jämförelsen reproducerbar.

V6 använder samma källbundna kortnät och nagelskydd i kortprovet och den fulla sekvensen. Helsekvensen har 926 rutor vid 30 fps och finns liggande/stående; slutvilan behåller två kort. Bleka rörelsekanter, uppskattad 2–4 px osäkerhet vid skon och källornas ansiktsskarvar är kvarvarande begränsningar. Detta äldre centralprov omfattar inte den nyare sjubanken; se avsnittet Rörelsebank och scenlager.

Den publika /studio-sidan länkar till detta avgränsade statiska tillägg. Äldre bibliotek och gransknings-ZIP är bevarade baslinjekopior. latest.json identifierar nu det senaste granskningsprovet och länkar V6 separat. Publik provmetadata finns i /pamela-prov-manifest.json; aktuell deployment och verifiering finns i references/public-review.json och runs/20261109-pamela-public-export-check/. Utvalda originalreferenser är uttryckligen publicerade för granskning; hemligheter, lokal server och adminprototyp ingår inte. Scoutgamings huvudprojekt är separat.

Root-layoutens lokala sessionskanal håller previewn igång. Start: START.cmd; stopp efter avslutad granskning: STOPP.cmd. Den verifierade servern binds till 127.0.0.1:4318. Pågående jobb och agentsessioner måste kontrolleras separat; en dokumentstatus är inte bevis för processägarskap.

## Rörelsebank och scenlager

- /pamela-prov?view=mask-correction&id=C1-P7 eller C2-P6 visar två lokalt korrigerade 12 s-klipp; &side=before visar R16. Den lokala helrundan och ZIP använder dessa två rättningar; tolv andra klipp är byteidentiska med R16. Publik R16 är bevarad.
- /pamela-prov?view=idle-chain är en separat ny 143,97 s VILA→14 kort→VILA-kandidat, 1764×1174. &id=opening eller opening-direct visar öppningen; /pamela-prov?view=idle-return-overlap visar returens direkt/2/4-rutorsprov. Hela kedjan har uppspelnings- och nativebevis men kvarvarande visuella begränsningar. Avstämningsbanken/ZIP är inte utbytta; references/pamela-idle-chain-review.json binder kandidaten.
- UI-status: nio Next-sidor och 41 namngivna view-lägen, inklusive historik. Ingen gemensam trefliksingång är ännu implementerad.
- /pamela-prov?view=idle-exit&id=overlap-4 visar bearbetad fyrarutorsskarv med 14 kort. Direkt/8/12-jämförelser finns; 12 är avvisad för dubbel fingertoppskontur. Ingen slutlig skarvacceptans.
- /pamela-prov?view=combined-scene visar C2-P4, P2, P3 och P5 med separata fram-/baksidor, rum och bord. Publikt /pamela-combined.html (R16); ?id=C2-P3 eller C2-P5 väljer första visningen. Lokalt har P2/P3/P4/P5 egna utbytbara skokroppar; publika R16 behåller P2-originalet. Kontaktinsats kvarstår. references/pamela-card-scenes.json binder varje källas masker, timing och evidence.
- /pamela-prov?view=flip visar fyra 12 s-kombinationer av separat framsida/baksida på C2-P4:s vändning. Samma källa och handmask; publik motsvarighet /pamela-flip.html (R12).
- /pamela-prov?view=modular-scene visar två rum, två bord och tre skoytskikt på C1-P4. Form/uttag bevaras i skoprovet. Publik motsvarighet /pamela-modular.html. Samlad kort-/scenrendering finns nu i R16 ovan; live-motorintegration återstår.

- /pamela-prov?view=two-sided-bank är aktuell helrunda och 14 klipp med fem kalibrerade C2-vändningar. &id=C1-P1 till C2-P7 visar 12 s-klipp, &length=full alla ändhållningar. Publikt /pamela-bank.html med ZIP. references/pamela-two-sided-bank.json binder bevis, ZIP och WebView-granskning.
- /pamela-prov?view=two-sided-p1 visar P1:s två vändningar i samma rörelse, original/SG/blå-elfenben, 87 rutor. Publikt /pamela-flip-p1.html.
- /pamela-prov?view=shoe-gpu kör avgränsad faktisk GPU-PNG-pixeljämförelse på 47 P2/P3/P5-rutor. Videodekodning är en separat verifieringsgräns.
- /pamela-prov?view=material-bank samlar föregående 14 framsidesfilmer. /pamela-prov?view=material-round visar hela 146,8 s-rundan; &length=full visar 182,87 s med ändhållningar. Alla 14 kort ligger kvar genom nästa givning och slutvila.
- /pamela-prov?view=material-clip&id=C1-P1 till C2-P7 visar varje 12 s-scenklipp. Källor, masker, UV och tryckriktningar är hashbundna i vald bank. Fysisk fram-/baksida är UNKNOWN.
- Publikt /pamela-loop.html#fjorton-material samlar R10:s hela filmer, enskilda klipp och ZIP. references/public-review.json anger aktuell deployment. Scoutgaming Main är separat.
- /pamela-prov?view=fourteen-tempo och /fourteen behåller de tidigare vita 146,8 s/182,87 s-proven. /fourteen-seams visar 13 interna skarvar och /fourteen-outer fyra yttre.
- /pamela-prov?view=materials-motion är det äldre provet med sista givningen; /materials är tidigare slutvila. /edge-print&seat=1 respektive seat=7 visar avgränsade före/efter-spår.
- /pamela-prov?view=scene-motion visar separat rum/bord med fysisk kant, ljusprofiler och begränsad panorering. Det är en 2,5D-studie; helscenfilmen bevisar inte utbytbara lager.
- /pamela-prov?view=turn-comparison&id=C2-P2, C2-P3 eller C2-P5 visar förstorade före/efter-klipp. Publikt /pamela-flip-p2.html, /pamela-flip-p3.html och /pamela-flip-p5.html. P3/P5 omfattar 66/57 exakta källrutor.
- /pamela-prov?view=idle-scene&id=zero respektive id=one visar komponerade 1764×1174-vilor med alla 14 kort kvar, 115/196 rutor för tre varv. Publikt /pamela-idle-scene.html. Endast B→B är kandidat; REDO-skarvar granskas separat.
- /pamela-prov?view=idle-ready visar ny 3 s VILA→REDO-brygga med båda skarvarna; sista skarven är inte godkänd. /pamela-prov?view=idle-return&id=direct eller id=prefix jämför gratis returkandidat. Publikt /pamela-idle-ready.html. Helrundan är inte utbytt.
- /pamela-prov?view=idle-window&id=zero respektive id=one visar två nya B→B-fönster i tre varv med rutsteg vid alla skarvar. /pamela-prov?view=idle-anchor&id=01&side=raw visar det avvisade hela 12 s-originalet för format-/rörelsegranskning. Originalet är 1764 pixlar brett, ingen crop är vald och ingen A-anslutning är godkänd.
- /pamela-prov?view=idle-candidates visar tidigare VILA-fönster; /motion visar nodhandlingar och QA-grindar. Den nya VILA-piloten ligger i runs/20261109-pamela-idle-anchor-pilot; ingen runtimeacceptans sker automatiskt.
- Aktuell pipeline: tools/pamela-two-sided-bank-plan.ts → tools/pamela-two-sided-bank-preflight.ts → tools/pamela-two-sided-bank-render.ts → native-/WebView-granskning → tools/pamela-two-sided-download-bundle.ts → tools/pamela-bank-shoe-public-review.ts. Varje försök har egen mapp; äldre materialpipeline bevaras. Se docs/granskning/FORMAT-OCH-KVALITET.md.
- START.cmd och STOPP.cmd styr lokal server. Återanvänd WebView och 127.0.0.1:4318; begärd preview hålls kvar.

## Centralens kortkontakt och spelmarker

`/studio` börjar med den nya centrala kortkorrigeringen och visar fas/källruta ur den faktiska tidsmappningen. `/kortkontakt` visar korrigeringsfilm, kontaktark och råskarvarnas gränser; `/komposition` behåller V2. `/markermaterial` är ett fristående Three-prov för SG-spelmarker, utan spelregler eller dealerintegration. Metadata och kvarvarande fel ligger i respektive hashbundet underlag.

## Kortkontakt V4, långtagning och pipeline

`/kortkontakt-v4` visar C2 vid sidan av C1, uppmätt överlapp, kontaktbilder och kvarvarande begränsningar. `/kortkontakt` behåller V3. `/studio` börjar med V4 och innehåller också ett verkligt utklippt VILA → blick → VILA-prov.

`/langtagning` visar ett nytt 12-sekunders original, samma scen i två format och tre råa loopar. `/studio` har samma filmer i klippvalet. `/pipeline` samlar steg, REDO-nav, status, begrepp och evidenslänkar. Fem önskade beteenden i prompten är inte fem godkända klipp. Källhash och tidsbas binder masker, spår och export till rätt material.

## Vad GPT-mappen är

Nya omgångar följer `gpt-underlag/0`, `1`, `2` och vidare. Omgång 0 är ett index med 90 hashbundna original som ligger kvar på sina befintliga sökvägar; omgång 1 innehåller sex nya orörda råfiler; omgång 2 innehåller återgivet pilotmandat från chatten. Se [index](../../gpt-underlag/INDEX.txt) och masterplanen. Bifogade kodfiler körs inte.

RAW-konversationen är läst **303/303 rader**. Paketet är beslutsunderlag och lokal överlämning med åtta originalbilagor, provplan, kontaktark och 35 kodutdrag; inte en körbar Scoutgaming-kopia. Elva länkade originalbilder saknas enligt [paketbeskrivningen](C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/gpt-underlag/uppackad-zip-underlag/PAKETINFO.json:4).

GPT-agentens huvudlinje är main + Python + kalibrerad 2,5D, separat bakgrund och en godkänd slutscen. Första provet jämför samma original A utan extra grönnormalisering, B med befintlig behandling och C med tidsstabil matte på ljus, mörk och slutlig bakgrund. Gröna hårhack och rekvisitarester är observerade; extra grönbehandling är en misstänkt bidragande orsak, inte fastställd ensam orsak. Slutfilen och skarvarna granskas efter varje byteändring. [RAW:259](C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/gpt-underlag/uppackad-zip-underlag/konversation_RAW.txt:259).

Paketets `01_original/` innehåller media, `02_samtal/` samtalssammanställningar, `03_arbetsplan/` tidigare förslag, `04_bildbevis/` granskningar, `05_referens_Emil/` klippreferenser och `06_kodreferenser/` frysta kodutdrag. Labbet läser materialet men kör inte dess programkod, startfiler eller äldre agentinstruktioner. Råtext, GPT-tolkning och verifierat fynd är skilda bevisnivåer.

## Offentlig studio

`/studio` är den sammanhållna React-arbetsytan för aktuella Pamela-filmer och skarvprov. Stor scen, tidslinje/rutsteg, formatval och infällbar kontrollpanel; gemensam begränsad 2D-visningszoom. `/scenfinish` visar samma-ruta-ljusprov, lagerbild och originalskarvar. `/kortmaterial` är ett separat Three-materialprov med SG-tryck och tre ljusprofiler. `/scenfinish#sekvenser` visar skillnaden mellan sammanhängande tagningar, korta bryggor och nodspellistor; `/scenfinish#gront` förklarar originalens uppmätta grönvariation. Dessa läsvyer publiceras till Scout Gaming / scout-dealerlab; lokalserver behöver inte köras. Original och spelproduktion ändras inte av visningsreglagen.

## Studio: teknik, design och kvarvarande UX

Verifierat lokalt: Node **24.21.0** via Volta, Next **16.4.5**, React **19.3.1**. Node följer projektets pin och Nexts installerade krav `>=20.9.0`; React passar dess peer-intervall. Nexts officiella installationssida anger 16.4.5 och Node 24 finns i LTS-serien. Detta är kompatibilitetskontroll, inte full säkerhetsrevision. [Next](https://nextjs.org/docs/app/getting-started/installation), [Node](https://nodejs.org/en/about/previous-releases).

Utseendet kom från egen lokal CSS, inte en belagd importerad Scout-adminmall. Den första layouten hade många 8–11 px-texter, trånga kolumner och en inspektör som hamnade långt ned i smal WebView. Ramverksversioner löser inte dessa designval. Studion är nu ombyggd till en mörk arbetsyta med två filmvyer och transportreglage i fokus samt sidopanelens flikar Material, Rörelse och Granska. Biblioteket rullar i sin panel; källbevis och geometri fälls ut vid behov. Tom geometri upptar inte en stor canvas. Filval och kalibreringsgränser är bevarade. Typkontroll och faktisk WebView-granskning vid 1227 px är genomförda: uppspelning/paus, panelbyten, materialfilter och bilddialog. [Aktuell vy](../studio-preview.png). Detta är UI-verifiering, inte godkänd filmgeometri.

| UX-fråga | Bedömning / fortsatt krav |
|---|---|
| Begreppen blandas | Använd ordlistan och visa händelse, fil och regel separat. |
| Grundloop och infall | Skilj andning från aktiverade vilovarianter; lova inte osedd policy. |
| Obundna följdkort | Neutral planerad status; lokalt filnamn är inte verifierad bindning. |
| Smal WebView | Läsbar responsiv layout och tydlig väg till rörelseschema/granskning. |
| Flikbyte kontra filmval | A och biblioteket följer valt källspår; B kan jämföra alla spår. Filkoppling till rörelseschema har en separat verifieringsnivå. |

Den separata UI/UX-chatten har levererat en lokal [scen-/adminprototyp](ADMIN-PROTOTYP.md) på `/admin-prototyp`: fria scener, bild-/videoval, bakgrundslager, dra/zoom/X/Y/transparens, uppspelning, versioner och simulerad publicering. Sidchatten rapporterar 18 kontroller och WebView-granskning; huvudchatten har därefter verifierat HTTP 200 efter serveromstart. Friläggning, hashbindning, exakt bordskalibrering/kortspår och verklig publicering återstår. Scope ligger i `app/admin-prototyp/` och `src/admin-prototype/`; samma server på 4318 används.

Källspår filtrerar både A:s filväljare och biblioteket. Alternativa visar den återfunna Göran-bankens 19 filmer; källfacken finns i Rörelse. Ett kompositionskort visar var den separata 3D-appen ligger. Den fulla 3D-kompositionen är ännu inte införd här. Webbgranskning och lokal studio länkar samma val med filhash och synligt innehålls-ID; se delning och cache.

## Materialprov

`/materialprov` visar bild/video A/B med bevarade proportioner och gemensam transport. Dealer, Bakgrund, Bord och Kortsko har egna avsnitt; metadata och manuella anteckningar är hopfällbara. Panorama kan vridas med musen; plan bakgrund kan zoomas/förskjutas. V3/v4 har samma nycklingsläge och provisoriskt matchad ögon-/handhöjd. [Kontrollerad placering](../pamela-matched-framing.png), [filmjämförelse](../pamela-matched-films.png). AI-knappen skickar valda originalbilder, inte den renderade scenen.

Fem Pamela-filmer och en bred scen med separat stelt testkort finns nu. Scenen är en granskbar pilot; full kontaktkalibrering och integration återstår. **Ord & schema → Riktiga klipp / Arbetsläge** visar bindningar och beslut. [Masterplanen](../MASTERPLAN.md) anger aktuella videohashar, budget, fel och länkar till den publicerade kopian. Den offentliga sidan uppdateras efter färdiga granskningsomgångar.

Senaste ändrade fil-/inpassningsgrupp: 6/6 kontroller, appens typkontroll och separat typkontroll av produktionsverktygen passerade. WebView spelade båda breda scenfilmerna till slut; inga nya konsolfel observerades. Tidigare avgränsade API-/livscykelkontroller återanvänds där kod är oförändrad. Detta godkänner kodbeteende och avkodning, inte anatomi eller kortkontakt. Servern och dess filer ägs av HUVUDAGENT 2; adminprototypens scope är separat.
## Interaktiv begreppsvy

Öppna **Ord & schema** i klippstudions övre rad. Johan är ett ändringsbart exempel utan filmkoppling. Klicka på scenens delar, klippkort, fack, filnamnsdelar och start-/slutpose. Vyn jämför Main, Kevin/Emil och alternativspåret utan att anta att timing eller koordinater kan översättas. Sökningen hittar även synonymer som idle och äldre namn.

36 definitioner hämtas från `references/terminology.json`. `node scripts/sync-terminology.ts` skapar den läsbara `docs/terminologi.txt`; uppdatera JSON-källan och generera om texten när ny evidens ändrar ett begrepp. Belagda uppgifter, labbförslag, tvetydigheter och okända namn markeras separat. Diagrammet är schematiskt, inte en kalibrerad dealer.

Typkontroll och WebView-kontroll är genomförda: namnbyte, kort-/poseval, systemjämförelse, synonymsökning, Escape/återöppning samt layout vid 390 CSS-pixlar. [Sparad begreppsvy](../terminologi-preview.png).
## Dokumentens flytt och historik

2026-11-08 delades ämnen upp och egna detaljdokument grupperades. Gamla adresser finns kvar som korta pekare. För de flyttade filerna kopierades hashverifierad baslinje och föregångare till den nya historikplatsen, med bibehållen räknare och `relocatedFrom` i state.json. Originalhistoriken finns kvar för pekarfilen. Uppdelade nya ämnesfiler börjar vid version 1 och anger sin källrapport.

| Tidigare under `docs/` | Nuvarande fil |
|---|---|
| `ARBETSSATT.md` | `docs/drift/ARBETSSATT.md` |
| `ATKOMST.md` | `docs/drift/ATKOMST.md` |
| `ATKOMST-PLAN.md` | `docs/drift/ATKOMST-PLAN.md` |
| `INTEGRATION.md` | `docs/drift/INTEGRATION.md` |
| `STATUS.md` | `docs/drift/STATUS.md` |
| `ALTERNATIV-3D.md` | `docs/studio/ALTERNATIV-3D.md` |
| `DEALERS-OCH-PIPELINES.md` | `docs/studio/DEALERS-OCH-PIPELINES.md` |
| `KALLKARTA.md` | `docs/studio/KALLKARTA.md` |

Historik ligger under `.history/markdown/<dokumentsökväg utan .md>/`. Baslinjer gallras inte. Läs inte gamla snapshots som aktuella instruktioner.


