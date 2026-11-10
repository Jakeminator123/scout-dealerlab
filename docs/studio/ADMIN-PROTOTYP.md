# Lokal adminprototyp – Admin, Scenstudion och Partnerportalen

Leverans 2026-11-08. Fristående UI/UX-mall i Snyggare-Dealer, enligt Jakobs uppdrag. Ingen integration eller publicering i Scoutgaming.

## Designgrund: den faktiskt öppna adminsidan

Efter Jakobs invändning mot den fristående demodesignen utgår startsidan från den aktuella `https://www.scoutgaming.tech/admin/dealers`, läst i befintlig WebView-session 2026-11-08. Där syntes 11 dealers och inga QA-bolag. QA-Norden och Exempelbolag kom från agentens lokala verifiering, inte från Scoutgamings drift eller äldre produktdata.

- Startsidan är nu **Dealers**, med samma grundstruktur: mörk sidomeny, ljusa porträttkort och limefärgad markering. Sökning och filtret **Utan spelbord** fungerar på den lokala läskopian.
- `src/admin-prototype/dealer-reference.json` innehåller tidpunkt, ursprungsadress, dealer-ID och filhash. Elva bilder ligger under `media/admin-reference-20261108/`, tillsammans med `source.json`. De hämtades från tillgångarna i den redan öppna adminsidan. Ingen löpande API- eller databasanslutning finns.
- Ett klick på ett dealerporträtt visar länken till den riktiga dealersidan. Katalogens status är en daterad ögonblicksbild; den ger ingen lokal videobank och ska inte tolkas som verifierad filmkvalitet.
- **Scener** öppnar lokala recept och versioner. Nya scener och all redigering stannar lokalt. Den tidigare Göran-skärmbilden i referensvyn är ersatt med den direkt lästa porträttbilden; sparade recept ändras inte.
- QA-scener och QA-/exempelbolag visas endast efter ett uttryckligt visningsval. De är bevarade, inte raderade. Bolagssidan räknar **lokala bolag** och förklarar var riktiga bolag finns.
- Menylänkar med pil öppnar Scoutgaming. **Partnerportalen** i sidfotens provflöde är fortsatt lokal simulering. Ingen ändring har skrivits till produktionen.
- Nytt UI ligger i `CurrentAdmin.tsx` och `current-admin.css`; scenredigeringen återanvänder befintlig tillståndsmodell och versioner. Inga nya paket installerades.

Typkontroll godkänd. WebView verifierade dealerbilder, sökning, filter, scenöppning och bevarad v1. Vid 390 CSS-pixlar var dokumentbredden 383 px i både dealeröversikt och sceneditor, utan horisontell överströmning. Begärd preview hålls kvar; `STOPP.cmd` stoppar den gemensamma labbservern när granskningen är avslutad.

## Status mot den ursprungliga UI/UX-listan

Den bifogade analysen beskriver både äldre mergar och framtida förslag. Den är inte en leveranslista för denna chatt. Den lokala prototypen täcker delar av förslagen; hela förbättringslistan är inte genomförd. Tidigare ”0 procent kvar” avsåg den senast avgränsade ombyggnaden och ska inte användas som färdiggrad för hela uppdraget.

| Ursprunglig förbättring | Verifierat läge i denna leverans | Kvar |
| --- | --- | --- |
| Skapa scen före bolag/spelbord | Fungerar lokalt med två understödda dealeridentiteter | Koppling till riktiga scenkontrakt och övriga dealers |
| Tydliga namn och utkast/versioner | Automatnamn, egna namn, jämförelse och återställning finns lokalt | Produktionsmodell och låsning av materialets innehållshash |
| Sammanhängande scenflöde | Editor, lokal preview, versionsvy och tilldelningsprov delar samma session | Full provyta för riktiga spelhändelser och produktionspublicering |
| Bolag och Partnerportalen | Klickbar modell och lokal rollförhandsvisning | Verklig serverauktorisering, konton och driftdata |
| Vila, giv, tal och klippbyten i scenen | Vald lokal video kan spelas/pausas/tidssökas | Semantiska provknappar med rätt klippbank, ljud och rörelseskarvar |
| Materialplacering | Dra, zoom, X/Y och opacitet finns lokalt | Friläggning, skugga, uppmätt kalibrering och automatisk passningsbedömning |
| Sparandekonflikt i riktiga editorn | Separat lokal kodpatch finns i Scoutgaming-worktree admin-ux-1108 | Ej integrerad eller publicerad av denna chatt; ny kontroll krävs inför återupptagning |
| Publiceringsomfattning och påverkan | Endast simulerade mål, aktiv/väntande version | Riktigt bolagspaket, full konsekvenslista, rundgräns, kvittens och rollback |
| Animationer från PR 1200 | Inte inkopplade i apparna av denna leverans | Kartlägga och införa önskade animationer selektivt |
| Separata statusar för filer, placering, visuell QA och publiceringsberedskap | Manuella designkontroller finns | Fullständigt verifierat statuskontrakt |
| Visuell grund från nuvarande Admin | Aktuell dealersida granskad; lokalt skal, porträttkort, sökning och filter byggda | Användarens designgodkännande; detta är inte full funktionell integration |

Inga produktionsförbättringar från denna chatt är publicerade. En total procent för hela listan är inte uppmätt och ska inte ersättas med en ny säkerhetssiffra. Nästa funktionsarbete bör utgå från listans kvarstående krav, inte ännu en fristående dashboard.

## Nivå 1, nivå 2 och scenstudions plats

Verifierat 2026-11-08 i den öppna Scoutgaming-sidan och referenscheckouten `C:/Users/jakem/dev/scoutgaming`, HEAD `d86a6b47c85f4b1341e4ffe2a7a49f08800bc544`. Checkoutens paketversioner är inte bevis för exakt vad som är driftsatt.

| Yta | Användare och ansvar | Verifierad adress |
| --- | --- | --- |
| Nivå 1 – Admin | Scoutgamings personal, även utan utvecklarroll. Skapar bolag, ger dem innehåll och hanterar konton. | [Admin](https://www.scoutgaming.tech/admin), [Bolag](https://www.scoutgaming.tech/admin/companies) |
| Nivå 2 – Partnerportalen | Bolagets team. Hanterar sina spelbord, spel/gränser, team och publiceringar. | [Välj bolag](https://www.scoutgaming.tech/partner), därefter `/partner/<bolag>` |
| Nivå 3 – Lobbyn | Spelaren. | `/lobby` |
| Scenstudion (lokal) | Del av det interna arbetsflödet för att skapa och testa scener, före bolagskoppling. | Scener i prototypens meny |

Källor: [TERMINOLOGI.md, rader 7–25](C:/Users/jakem/dev/scoutgaming/docs/TERMINOLOGI.md:7), [ADMIN-NY.md, rader 22–30](C:/Users/jakem/dev/scoutgaming/docs/plans/ADMIN-NY.md:22), [Admin-guidens meny](C:/Users/jakem/dev/scoutgaming/apps/admin/docs/README.md:80). Dessa nivåer är inte Grund/Utökad, som gäller klippomfattning.

**Bolag** är ordet i gränssnittet. `operator` är samma verksamhetsobjekt i kod/databas. **Partner** är inte en extra bolagsnivå i det verifierade underlaget; **Partnerportalen** är bolagets arbetsyta. Samma person kan ha åtkomst till flera bolag. I den riktiga portalen kontrolleras åtkomsten per bolag. Inloggningen som granskades tillhör Scoutgamings personal; den granskningen bevisar inte hur varje begränsad roll faktiskt ser ut.

Dagens separata `/studio` är en skapandeyta för dealers. Den är inte samma sak som denna lokala Scenstudion. Den återanvändbara scenen, ett bolags spelbord och en publicering är också skilda objekt.

### Vad den lokala administrationsmallen nu visar

- **Bolag** i menyn öppnar det lokala administrationsflödet. Skapa ett **lokalt bolag**, välj vilka scener det får använda och lägg till testmedlemmar med tydlig bolagsroll.
- **Förhandsvisa Partnerportalen** behåller valt bolag. Där visas bara bolagets tillåtna scener. Välj uttryckligen en sparad scenversion och skapa ett lokalt spelbord.
- Spelbordet får en väntande version; separat simulerad aktivering flyttar den till aktiv. Samma lokala spelbord används även i scenstudions publiceringsvy, inte ett andra produktregister.
- Rollförhandsvisningen visar Administratör/Redaktör/Läsare. Läsaren har ändringsknappar avstängda. Detta är UI-simulering, inte riktig serverauktorisering.
- Detta är en avgränsad mall för bolag, scener, team och spelbord. Den ersätter inte dagens fullständiga konton, systemadministration, rapporter, integration, pengar eller säkerhetskontroller.
- Allt sparas med samma lokala session och export. Inga inbjudningar skickas och inga riktiga bolag, konton eller spelbord skapas.

### Namn och förväxlingar

Automatiska scennamn följer vald dealer och miljö. Skriver man ett eget namn växlar det till eget namn och bevaras vid dealerbyte. Om ett eget namn nämner den andra dealern visas en varning och ett förslag att använda det automatiska namnet. Sparade versioner ändrar inte namn retroaktivt. De två ursprungliga exempelscenernas oförändrade genererade namn repareras vid inläsning av gammal lokal data; egna namn bevaras.

Likadana scennamn särskiljs med scenummer i listor. Partnerportalens val innehåller scenummer, sparat namn, scenversion och dealer. I den riktiga portalen observerades även två poster som båda hette **Bord A** i materialöversikten. Det är en konkret kvarstående namnrisk där; identitet/variant eller tydlig miniatyr behöver skilja dem åt. Inga sådana produktionsdata har ändrats.

### Teknik och versionsgräns

| | Lokal prototyp | Scoutgamings referenskod |
| --- | --- | --- |
| Node-pin | 24.21.0 | 24.22.2 i apps/admin |
| Next | 16.4.5 | 16.4.5 |
| React | 19.3.1 | 19.3.0 |
| TypeScript | 7.0.2 | 7.0.2 |
| UI | React, egen CSS, befintliga beroenden | Bland annat Radix UI, Lucide, Tailwind, Sonner och Recharts |

Admin och Partnerportalen finns redan i samma Next-app, `apps/admin`. De ska inte antas kräva två nya teknikstackar. Vid implementation bör de befintliga komponenterna återanvändas selektivt efter godkänd UI/UX. Inga nya paket har installerats för denna komplettering. Exakt driftsatt programversion är fortfarande overifierad.

## Öppna och granska

1. Använd `START.cmd` om labbet inte redan kör. `STATUS.cmd` kontrollerar rätt server.
2. Öppna `http://127.0.0.1:4318/admin-prototyp` i Codex WebView. Återanvänd prototypfliken.
3. Skapa en **Ny fristående scen**. Dealer väljs; eget namn är valfritt. Utan eget namn följer namnet dealer och miljö. Inga bolag eller spelbord krävs.
4. Ändra miljö, bordsgrafik och ljus. Ändringar visas i **Scenskiss**. **Referensbild** visar det oförändrade visuella underlaget.
5. **Testa scen**: kontrollera desktop/mobilutsnitt och ange manuell designbedömning. Detta startar inte ett spel eller en videobank.
6. **Spara version**, ändra något, spara igen och jämför under **Versioner**. Återställning sparar först ett ändrat utkast inklusive nya testresultat som säkerhetsversion.
7. **Publicering**: välj en sparad version och lokala exempelbord. Bekräfta simuleringen och prova **Simulera nästa runda**. Aktiv version och väntande version visas separat. Ett väntande byte kan avbrytas.
8. Under **Granska förslaget**: välj **Behåll**, **Justera** eller **Välj bort**, och skriv en kommentar. Tryck på samma val igen för att återgå till obesvarat. Inget val är ett automatiskt implementationstillstånd.
9. **Exportera granskning** sparar hela sessionen som läsbar JSON. Filen innehåller även recept, versioner och simulerade tilldelningar. Återimport finns inte i denna mall.

Preview lämnas öppen för granskning. `STOPP.cmd` stoppar den gemensamma labbservern via dess kontrollkanal; det stoppar både ordinarie labbet och adminprototypen. Stäng inte servern medan någon av dessa granskas. Servern använder endast 127.0.0.1:4318.

## Vad som faktiskt fungerar

- Fria scener och separat utkast per scen, inklusive namnbyte och val utan bordsgrafik.
- Redigerbar schematisk scen, oförändrad fotoreferens, hjälplinjer och två bildformat.
- Manuella designkontroller som nollställs vid receptändring och sparas per version.
- Oföränderliga scenversioner med anteckning, tidsstämpel, fältjämförelse och säker återställning.
- Lokal simulering av versionsbundna tilldelningar, väntande/aktiv version och avbrutet byte.
- Valbar granskning av fem delar, kommentarer, JSON-export och lokal beständig lagring.

Lagringsnyckel: `snyggare-dealer.admin-prototype.v1`, i denna WebViews localStorage för 127.0.0.1:4318. Att rensa webbplatsdata tar bort sessionen. Exportera det du vill bevara. Skadad eller inkompatibel lagring skrivs inte över automatiskt; ett felmeddelande erbjuder export. Samtidiga ändringar från en annan flik stoppar autosparandet tills omladdning. Inga hemligheter eller privata miljövariabler används av prototypen.


### Materialplacering (komplettering)

Under **Placera material** går det att välja lokal bakgrundsbild/video och ett flyttbart bild-/videolager. Det flyttbara lagret filtreras på känd dealeridentitet (Pamela-pilot respektive Göran Scout Main). Bakgrundslistan kan innehålla oklassificerat material; kontrollera det visuellt. Kända andra dealeridentiteter erbjuds inte.

- Dra lagret eller ange X/Y i en referensyta på 1920 × 1080. Nollförskjutning ger centrum 960, 540. Zoom 10–300 procent och opacitet 0–100 procent.
- **Centrera & passa in** återställer centrum, zoom och opacitet. Bildproportionerna bevaras.
- **Spela video**, pausa och sök i tiden. Endast lokalt material, ingen renderings- eller genereringstjänst anropas.
- Materialval och placering sparas per utkast och version. Byte av dealer återställer placeringen så att tidigare material inte följer med automatiskt.
- Detta är visuell jämförelse, inte automatisk friläggning. Grön bakgrund i originalet följer med. Källfilerna lämnas oförändrade.
- Versionerna låser filväg och recept men ännu inte materialets innehållshash. Ändrad källfil kräver ny granskning. Mätvärdena är skisskoordinater, inte verifierade spelbordsankare.

Verifierat i WebView: Görans lokala grundloop (5 s, 1080 × 1920), play/pause/tidssökning, bakgrundsbyte, dragning, numerisk inpassning, återcentrering, sparad version och återläsning efter omladdning. Ett fel där bakgrundsbyte nollställde tidsreglagets längd är rättat. Mobil placering ryms utan horisontell sidöverströmning.

## Versioner och publicering

| Begrepp | Betydelse här | Kvar före verklig integration |
| --- | --- | --- |
| Utkast | Redigerbart lokalt recept | Serverlagring, behörighet och ändringskonflikter |
| Scenversion v1, v2… | Fryst recept och designkontroller, räknat per scen | Beständigt format, materialhashar, referensintegritet |
| Programversion | Koden som driver admin/spelaren | Fastställd målgren, commit och driftsatt version |
| Väntande byte | Lokalt val av sparad version för fiktivt bord | Verkligt publiceringskontrakt och atomisk uppdatering |
| Aktiv version | Resultat efter knappen ”Simulera nästa runda” | Beslut om bytestidpunkt, kvittens från spelare och återställning |

Äldre V2/V3-etiketter kan avse format eller implementation. De är inte samma sak som scenens löpnummer. Prototypen gör inga antaganden om att en lokal checkout motsvarar produktion.

## Avgränsning och svårighet

Separat skiss/klickbar mall: **2/5 i svårighet, skattning**. Verklig integration: **4/5, skattning**. UI-struktur, språk och beslutsflöde går att granska separat och återanvända selektivt. Den simulerade datamodellen bör inte kopieras till produktion utan kontraktsgranskning.

Flera delar av den lokala prototypen är genomförda; hela den ursprungliga UI/UX-listan är inte klar. Se statusmatrisen ovan. Produktionsintegration, verklig rendering och rörelse-QA är inte levererade. Varken den äldre siffran ”40 % återstår” eller senare ”0 % kvar” är en uppmätt färdiggrad för hela listan.

Öppna frågor: målgren och programversion, publiceringsbehörighet, versionsformat, bytestidpunkt, rollback, samtidigt redigerande användare, materialens godkännande, kalibrering, kortspår och komplett rörelsebank.

## Material och ägarskap

- Pamela-referens: `runs/20261108175519-74d6c57e/original/pamela-scene-reference-v2.png`, SHA-256 `ab824acf77ddab4d43359ad5d744f5e7b619859738aca8d660d41a0a4d2be0b4`. Lokal pilotbild, inte verifierad videokomposition eller rörelsebank.
- Göran-referens: `media/identities/goran-scout-reference.png`, SHA-256 `34f939117088e36a9f65d919c7ab1ff12f7a3b5c11eb4b5f6c90eec50e267db6`. Scout Main-identiteten; alternativ Göran används inte.
- Ursprungligt underlag lämnas orört. Skissfiguren är avsiktligt schematisk, inte en ny dealeridentitet.
- Implementationen ligger i `app/admin-prototyp/page.tsx` och `src/admin-prototype/`. `src/server.ts` har endast fått den exakta tillåtna rutten `/admin-prototyp`.
- Samordnat med HUVUDAGENT via Codex meddelanden mellan chattar. Huvudagenten bekräftade att routeändringen och ordnad omstart inte krockade med pågående arbete.
- Inga nya paket, Git-operationer, databasändringar eller betalda genereringar har gjorts för denna prototyp. Den senare designjusteringen läste den öppna Scoutgaming-sidan och dess porträttbilder.

## Verifiering

- Node v24.21.0 verifierad mot package.json/Volta. Next 16.4.5 och React 19.3.1 är befintliga installationer.
- TypeScript `--noEmit --incremental false` kontrollerad.
- Vid kompletteringen av nivå 1/2 passerade 12 riktade prototyp- och arbetsyteprov samt TypeScript. Föregående leverans hade även tio gröna serverkontroller; servern ändras inte i denna komplettering. Kontrollerna omfattar fria scener, versionsisolering, säker återställning, tilldelningar, lagringsvalidering samt att den nya rutten inte öppnar privatfiler.
- WebView: skapa, redigera, utan bordsgrafik, mobilutsnitt, manuella kontroller, v1/v2, jämförelse, återställning och automatisk v3-säkerhetskopia, väntande/aktiv version för ett valt exempelbord, omladdning, granskningsval och export.
- Desktop- och mobilbrytpunkt granskade. Mobil hade först för smal textkolumn i granskningskorten; den korrigerades. Ingen horisontell sidöverströmning uppmätt vid 390 CSS-pixlar.
- QA-material finns i `.runtime/admin-prototype-qa-20261108/`. En separat scen märkt **QA** visar testade versioner; Jakobs fem granskningsbeslut lämnas obesvarade. Exporttestet innehåller tydlig QA-markering, inte ett beslut av Jakob.


Kompletterande UI-verifiering: namn följer dealerbyte; egna namn ger varning vid annan dealer; skapa QA-bolag, ge en scen, lägga till testmedlem, förhandsvisa samma bolag i Partnerportalen, uttryckligt versionsval, skapa och aktivera lokalt spelbord. Läsarrollens ändringsknappar är avstängda. Bildbevis i `.runtime/admin-levels-qa-20261108/`. Dessa är testdata, inte Jakobs godkännande.
