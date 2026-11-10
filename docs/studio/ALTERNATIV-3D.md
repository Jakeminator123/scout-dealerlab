# Alternativet: Göran och den sammansatta 3D-scenen

**Kompositionen är återfunnen och projektkopplingen är verifierad 2026-11-08.** Den större helkropps-Göran ingår i `Göran · levande blackjack`, projekt `e19d226c-c586-467e-b126-6a9f90e1675e`. Scout-Göran är fortfarande en separat identitet.

## Hitta och starta scenbygget

Den fristående appen ligger i [local-studio/blackjack-studio](C:/Users/jakem/dev/super-feature-sg/local-studio/blackjack-studio/README.md). [STARTA.cmd](C:/Users/jakem/dev/super-feature-sg/local-studio/blackjack-studio/STARTA.cmd:3) kör `node server.ts --port 4323 --creator-dir data/typed-preview` från den mappen. Det finns ingen automatisk webbläsaröppning i startfilen. När just den appens server är igång är projektadressen `http://127.0.0.1:4323/skapa?project=e19d226c-c586-467e-b126-6a9f90e1675e&play=1`.

Denna leverans startar inte scenappen eller någon andra server. Dealerlabbet på 4318 visar dess läskopior, fack och projektbeskrivning. Den färdiga sammansatta 3D-vyn är ännu inte inbyggd i labbet eller den offentliga granskningsytan.

## Verifierad källkedja

| Bevis | Resultat |
|---|---|
| Äldre `extra/insperationsmall-alternativ/standard.json` | Samma projekt-ID, exportrevision 91. Den gamla Desktop/wow-adressen är inaktuell. |
| Aktiv [project.json](C:/Users/jakem/dev/super-feature-sg/local-studio/blackjack-studio/data/typed-preview/e19d226c-c586-467e-b126-6a9f90e1675e/project.json) | Revision 103, 23 medietillgångar: 19 filmer och fyra PNG-bilder. Fristående katalog utan egen Git-branch. |
| VILA-ankare `8fe99408-26c2-4dae-a1e7-bc5324061258.png` | SHA-256 `54224fb918c5cb839554381e468ddbf4fdae64008c537150335ad21660db14a9`, identisk med labbets Göran-referens. |
| Nick `e710c374-c998-4662-8bcd-cfbd267bfcfc.mp4` | SHA-256 `7d55c33b93d6a4fedf01777030e05d8a9b4384dace73daee32f692f0f6822b3e`, identisk med labbets Runway-import. Källmodell `wan3`; nod `idle-nod`, VILA→VILA, `reviewed:false`. |
| Panorama `9e6fcd2e-3dc9-4b93-aefc-dddf4262b78b.png` | SHA-256 `c78d8099a7d6c4c3adb9ab4d357dd37822c12366c9da6c4590d3a2ff59356a2b`, identisk med labbets panorama. |

Originalen ligger under projektmappens `assets/`. Huvudagenten verifierade ovanstående 3/3 filpar själv och importverktyget verifierade 23/23 källfiler mot manifestets hela SHA-256: 100 % av just dessa filbytes, inte 100 % visuell kvalitet. 18 filer kopierades till `media/alternative-project/`; fem befintliga byteidentiska kopior återanvändes. Källorna ändrades inte. [alternative-bank.json](../../references/alternative-bank.json) redovisar varje fil, etikett, källroll, lokalsökväg och källans granskningsflaggor.

## Komposition och kvalitetsgränser

Den aktiva [preview.ts](C:/Users/jakem/dev/super-feature-sg/local-studio/blackjack-studio/experiments/avatar-pilot/preview.ts:283) använder dealer som bildplan med `VideoTexture`, geometriskt bord och kortsko, fotopanorama eller valbar byggd salong. Det är inte en riggad eller rekonstruerad 3D-person. En separat stol och vit dealerbakgrund är inte belagda. Grön inspelningsbakgrund är belagd.

Panoramat ligger på en sfär; det ger inte återvunnet rumsdjup. Den byggda salongen kan ge verklig rumsgeometri. Mätbara hand-, kort- och skokontakter måste ändå kopplas till samma kalibrering. De tio frysta kortkalibreringarna får inte automatiskt kopieras till Main eller ett nytt ankare. Kandidatbilden med stängd mun har annan hash/utsnitt och är ett separat kalibreringsfall.

18 källfack återges i `references/alternative-fullbody.json`, med hashverifierade mediefiler men utan importerad geometri. Bevarade `reviewed`-flaggor är inte ersatta av nya godkännanden. Fulla rörelser, skarvar och kortlandningar återstår att granska. Skogsrum-worktreen är en närliggande referens men har inte fastställts som samma fristående app.

F73/S303 har fortfarande okänd betydelse. Inga rörelse-ID:n eller spelarplatser har härletts från namnen.

## Införande i snyggare-dealer

**Rekommendation, granskad 2026-11-08: bygg en gemensam Scenvy på labbets befintliga server, med fast kamera och utbytbara miljöer.** Scout Gaming är slutmålet. `local-studio` och skrivbordets rumsstudie är enbart läskällor; deras servrar och spelmotorer ingår inte i införandet.

Det första jämförelsesteget finns nu på `/materialprov`: Görans film och de återfunna miljöbilderna kan provas med grönnyckling, proportioner och placering. Panoramorna visas där som beskurna 2D-bilder. Rum, 3D-bord, kortsko och kortgeometri är fortfarande nästa införandesteg; se [masterplanen](../MASTERPLAN.md).

### Vad som faktiskt finns

| Del | Verifierat underlag | Bedömning |
|---|---|---|
| Skog | Panorama 4096×2048, markprojektion, löv och molnljus | Återanvänd bild, material och valbara effekter. Markprojektion är en approximation. |
| Los Angeles och Las Vegas | Två panoramor, vardera 1774×887; digital respektive analog klocka, soluppgång respektive neonljus | Återanvänd som miljöval. Stadsvyn heter Los Angeles i dessa källor. Upplösningen räcker inte till valfri närbild. |
| Görans träkasino | Befintligt panorama 1774×887 och separat miljöfoto finns redan i labbet | Återanvänd befintliga hashbundna filer. Bildens möbler är inbakade; de kan inte flyttas individuellt. |
| Byggd salong | `createSalon`: väggar, golv, träpaneler, fåtöljer, vaser och lampor är separata geometriska objekt | Återanvänd som ett eget rumsläge. Det är en modellerad tolkning, inte rekonstruerat djup från panoramat. |
| Bord och kortsko | `createTable` och `createCardShoe`: geometri, filt/läder/trä/mässing och sju materialkartor | Bra grund. Skons öppning måste få en explicit kontaktpunkt som filmerna faktiskt når. |
| Göran | Videoplan, grönnyckling och ett shaderbaserat djupförslag | Behåll dealer-ID, filhash, fps och bildrutor. Personen har ingen riggad 3D-kropp. |

Källkoden finns i [furniture.ts](../../references/scene-composition/source/scene/furniture.ts:24), [room-profile.ts](../../references/scene-composition/source/experiments/avatar-pilot/room-profile.ts:9) och [panorama-room.ts](../../references/scene-composition/source/scene/panorama-room.ts:7). Den aktiva TypeScript-versionen använder en kameracentrerad sfär för LA/Vegas/egna panoramor. Skrivbordskopians äldre beskrivning av utplattade väggar/golv ska därför inte styra portningen. En sfär ger vyrotation men ingen verklig förflyttningsparallax mellan rummets föremål.

### Föreslagen avgränsad första leverans

1. Lägg till `/scen` på samma port 4318 och en länk från Alternativa-spårets kompositionskort. En gemensam React-komponent under `src/scene/` skapar och avvecklar scenen; den kan senare användas i adminprototypens scenredigering. Befintlig `PlacementEditor` är en 2D-lagerplacerare, inte en 3D-renderer.
2. För över utvalda renderingsfunktioner till lokal TypeScript. Separera bord, rekvisita, rum, dealer, ljus och kortvisning. Börja med Görans VILA, grundloop och en utdelning med befintlig källkalibrering. Jämför träpanoramat med den byggda salongen; lägg sedan till de tre miljövalen utan att ändra dealer eller bord.
3. Inför ett versionsmärkt scenmanifest: dealer-ID, tillgångar med SHA-256, kamerans projektion/position, lagertransformer, bordsmått, skons uttagspunkt och klippets kalibreringsbindning. Bevara meter/Y-upp separat från bildkoordinater. Samma transform ska styra video, mask, händer och kort. Miljöbyte får inte ändra inpassning eller starta om filmen.
4. Låt ett litet renderingsgränssnitt ta emot scen, klipp, uppspelningstid och visningshändelser. Framtida Scout-adapter får läsa motorns auktoritativa händelser. Ingen lokal regelmotor, kortslump, testplånbok, genereringskö eller källappens `/api/creator` flyttas in.

`preview.ts` kan inte importeras rakt av: den läser fasta DOM-ID:n, laddar eget projekt-API, använder globala lyssnare och `postMessage` ([rader 35–60](../../references/scene-composition/source/experiments/avatar-pilot/preview.ts:35)). Rendererägarskap, paus, videoavkodning, avbrutna laddningar och WebGL-resurser behöver anpassas till React-livscykeln. Den kopierade källan använder Three revision 180; labbet deklarerar ännu inget Three-beroende.

Serverändringen begränsas till den uttryckliga Next-routen och tillåtna lokala scenmedier. `references/` ska fortsatt vara referensmaterial. Labbets medielista och filrutt stöder nu AVIF; skogspanoramat visas lokalt. Referens-HTML:s skriptskydd ska inte öppnas för att köra hela källappen ([server.ts](../../src/server.ts:73), [library.ts](../../src/library.ts:9)).

### Kvalitetsgräns före fler klipp eller Scout-integration

- Det finns **10 sparade kortkalibreringar**, men **0 av 18 källfack har `reviewed:true`**. Detta är projektmetadata, inte en bedömning att alla filmer är fel. Bindningen omfattar mediehash, ankare, bord och inpassning ([card-calibration.ts](../../references/scene-composition/source/creator/card-calibration.ts:23)).
- `avatar-depth.ts` använder fasta bildband och färgtrösklar från en tidigare dealer. Det är inte spårad anatomi. Händer, ärmar och kort måste granskas mot bordskanten; grönnyckling blir inte automatiskt en vitbakgrundsmask.
- Görans kontaktark visar olika handvägar. Flytta inte skon per klipp för att dölja fel. Lås först en kameravy och verklig uttagspunkt; välj kompatibelt material eller planera ett senare, avgränsat filmprov.
- Kontrollera hela pilotklippet och skarvarna, bildruta för bildruta vid kontakt/släpp: ljust, mörkt och avsett rum; handocklusion, kortlandning, kontaktskugga, paus/buffring och storleksbyte. Korttid ska följa avkodad videotid, vilket källans `createPresentedFrameClock` redan gör. Valfri sidokamera är inte ett acceptanskrav för en platt dealer.

### Bevarad lokal referens

[Referensmanifestet](../../references/scene-composition/manifest.json) binder **32 kopierade filer, 4 973 183 byte**, till originalens sökvägar och SHA-256. Samtliga 32 kopior matchar källan; tre panoramor och sju materialkartor matchar också mellan rumsstudien och blackjack-studio (**10/10 filpar**). Görans VILA-hash är fortsatt `54224fb918c5cb839554381e468ddbf4fdae64008c537150335ad21660db14a9`.

Granskningen omfattar kod, manifest, bildmetadata och sex bevarade skärmbilder/kontaktark. Miljöbilderna med annan dealer används endast för miljön. Ingen källserver har startats, ingen ny rörelseacceptans har gjorts och ingen scenkod har införts i appen. Referenskopiorna är inte ett körbart paket.

Visuella exempel: [Görans byggda salong](../../references/scene-composition/evidence/goran-3d-salong.jpg), [Görans panorama](../../references/scene-composition/evidence/goran-final-review.png), [Skog](../../references/scene-composition/evidence/forest-3d.png), [Los Angeles](../../references/scene-composition/evidence/la-3d.png), [Las Vegas](../../references/scene-composition/evidence/vegas-3d.png).

### Infört i Materialprov

Panoramor har nu perspektivprojektion med kamerariktning, synfält och dragning. Vanliga bilder har separat zoom och bildförskjutning. Det är ett visningsprov, inte importerad salongsgeometri eller kalibrerad hand-/kortkontakt. Bord A/J3 och två skor finns som hashverifierade, lokala inspektionslager. Astrids darkhall är en helscensbild med inbakat bord och sko; använd den som djup-/ljusreferens, inte som färdigt separat rumslager. [Aktuellt arbetsläge](../MASTERPLAN.md).
