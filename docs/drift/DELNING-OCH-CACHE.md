# Delning, textsökning och förhandsvisningar

## Offentlig granskning

[scout-dealerlab.vercel.app](https://scout-dealerlab.vercel.app) är en separat, offentlig läsyta utan inloggning. Jakob godkände detta 2026-11-08. Projektet `scoutgaming/scout-dealerlab` är skilt från Scoutgamings produktionsapp. Exakta projekt-/team-ID:n och senaste verifierade deploy finns i `references/public-review.json`.

Sidan innehåller spårfiltrerad A/B-granskning, källscheman, ordlista, verklig funktionsstatus, GPT-konversationen och ett ZIP-paket. Aktuella antal och storlekar finns i manifestet. `manifest.json` visar källsökväg, format och filhash. Varje version är en statisk ögonblicksbild med interaktiva läsverktyg. Större filmer komprimeras för webbgranskning till högst 1280×720; original sparas lokalt. Levererad filhash och originalhash skiljs åt. Visningskopior är inte pixel-QA av original. Originalnamn och verifieringsgränser bevaras; Johan är ett pedagogiskt exempel och Pamela v3 är ännu inte kalibrerad. Sidan publicerar inget spelinnehåll.

Kör `UPPDATERA-GRANSKNING.cmd` för att bygga och publicera en ny kopia på samma adress. scripts/build-review-hub.ts utgår från senast verifierade export, aktuella val i references/pamela-two-sided-bank.json och references/pamela-idle-chain-review.json samt references/review-brief.json. Det samlar nuläge, frågor, noder, filmer och källförteckning på /granskning.html. /latest.json anger snapshot; /granskning/starttext.txt är den kopierbara instruktionen för extern GPT. Sajten är versionspublicerad, inte automatisk spegling av lokala ändringar. Kommandot granskar filhashar, länkar och hemligheter samt publicerar förbyggda statiska filer till det låsta granskningsprojektet. Aktuellt klipp-ZIP inkluderas med verifierad hash. En deployment förbereds utan domänbyte; dess snapshot hämtas innan den promoveras. Oförändrade binärfiler återanvänds genom hårdlänkar lokalt. Äldre publicerade sidor och paket bevaras som historik. Det startar ingen server eller bevakningsloop. Vid deployfel ska senaste deploy kontrolleras innan återförsök. Kommandot måste rapportera READY och verifiera den publika versionens snapshot-ID.

Exporten använder en bestämd dokumentlista och studions materialkatalog. `.env*`, `private/`, kontouppgifter, interna åtkomstdokument, adminprototypens kod och lokala serverfunktioner följer inte med. Textkontrollen stoppar kända hemliga värden samt vanliga nyckel-/signaturmönster utan att visa matchningen. Framtida nytt material i katalogen omfattas vid nästa uttryckliga publicering. `noindex` hindrar inte åtkomst; alla som hittar adressen kan läsa och ladda ned.

Verifierat 2026-11-08 utan inloggning: startsida, manifest, ordlista, bild och ZIP ger HTTP 200; MP4 stöder byteintervall (206). Försök att hämta `.env.local` och en privat kontosökväg ger 404. Scoutgamings produktionsprojekt har inte ändrats.

## Större lokalt granskningspaket

`EXPORTERA-GPT.cmd` skapar en separat mapp och ZIP under `exports/` med bredare dokumentation, GPT-original, källreferenser, material, Pamela-försök och en lokal A/B-översikt. `LAS-MIG-FORST.md` ger granskningsfrågor och skiljer källmaterial från instruktioner. Manifestet innehåller storlekar, SHA-256, källrevision och anpassade länkar. Varje ZIP-medlems hash verifieras. Färdiga paket skrivs inte över eller raderas automatiskt.

Det större lokala paketet saknar hemliga filer men innehåller mer driftinformation än den offentliga kopian. Publicera därför genom `UPPDATERA-GRANSKNING.cmd`, inte genom att ladda upp hela projektmappen eller det äldre lokala paketet.

## Selektiv sökning

- `.gitignore` behåller skyddet mot att råmaterial och privata filer råkar hamna i Git.
- `.rgignore` gör textkällor under `gpt-underlag/`, `extra/`, `media/` och `runs/` sökbara men utesluter video, ZIP, byggcache och genererade rutor. RAW-konversation och job.json hittas; privata filer och videofiler listas inte.
- Arbetsytans sökinställningar utesluter filtyper och cache i stället för hela `runs/` och `media/`. Metadata, prompter och beslut behålls.
- `.cursorignore` följer samma avgränsning. Cursors faktiska index har inte byggts om eller mätts här. Ingen kredit-/tokenbesparing påstås. Explicit vald media kan fortfarande läsas av studion och verktygen. [Cursors dokumentation](https://prod.cursor.com/docs/reference/ignore-file).

## Automatisk cachegräns

`references/media-retention.json` är aktiverad (`enabled: true`): behåll normalt **20 rutor per original**. Bara rutor som är minst **60 minuter gamla** kan raderas. Detta är ett lokalt standardval inom Jakobs önskemål om rimlig retention.

Städningen körs när en ruta begärs och omfattar endast registrerade, återskapbara filer under `media/preview-cache/<källhash>/`. Ingen timer eller separat process behövs. Oförändrad filhash och säkra sökvägar krävs. De senaste N, färska rutor, `pinnedFrames` och sökvägar citerade i docs/references/runs skyddas. Gränsen är därför mjuk när bevis behöver sparas.

Originalfilmer, genererade originalbilder, ankare, prompter, granskningsbeslut, kontaktark, äldre `media/analysis/` och okända filer omfattas inte. Fem avgränsade kontroller verifierar rotation, torrkörning och skydd mot ändrade, färska, oregistrerade eller länkade mål. API verifierade aktiv policy med N=20; inga befintliga filer behövde raderas. Policyändring kräver ingen omstart.

## Gemensam kontext mellan lokal studio och webben

`/agent-context.json` och `/llms.txt` bygger på samma materialregister, terminologi och granskningsdokument. Varje material har stabilt original-ID (SHA-256); varje underlag har ett innehålls-ID. Den lokala studion visar om detta innehåll redan har publicerats eller om lokala ändringar återstår. Uppgiften uppdateras vid sidfokus och minst varje minut medan fliken är öppen. Det är en jämförelse med senast verifierad publicering, inte en direktkoppling till Scoutgamings produktion.

Länken ”Samma material på webben” bär valt spår och A/B-hashar. Webbsidan länkar tillbaka till motsvarande lokala sökvägar. Ett saknat klipp eller ett annat innehålls-ID markeras; en gammal publicerad kopia framställs inte som aktuell lokal data. JSON-elementet `studio-context` redovisar just sidans val. Adminprototypens status är uttryckligen delvis färdig; bolag, partner och spelpublicering är simulering.

## Stängning av lokala studioflikar

Servern på 4318 har en anslutning per öppen studioflik, även adminprototypen. När den sista anslutningen stängs väntar servern 60 sekunder och avslutar sig själv. Omladdning eller en ny flik under respiten avbryter stoppet. Minimering eller byte till en annan flik startar ingen nedräkning. Pågående import/granskningsarbete får slutföras. Hård nätverks- eller webbläsarkrasch upptäcks först när anslutningen faktiskt bryts.

Flera webbläsare eller gamla studioflikar kan hålla servern vid liv. `/api/lifecycle` visar antal anslutningar och eventuell stopptid, utan kontrollnyckel. `STOPP.cmd` finns kvar för uttrycklig avstängning; `START.cmd` behövs för att starta igen. Den publika Vercel-sidan påverkas inte av lokal stängning.
## Rekommenderad lagring och väg till en körbar dealerbeställning

Den ursprungliga rekommendationen nedan är från tre avgränsade granskningar 2026-11-10. Beslut, aktuell fysisk struktur, genomförd arkivering och Blob-kvitton finns nu i [Provisorisk struktur](PROVISORISK-STRUKTUR.md). Granskningssidan är fortsatt en versionsbestämd kopia.

### Verifierad disk och materialmängd

| Volym | Identifiering | Totalt | Ledigt vid kontroll 03:16 CET |
|---|---|---:|---:|
| C: | PNY CS1030, SSD/NVMe, NTFS | 464,40 GiB | 11,52 GiB / 2,5 % |
| D: | Kingston SKC3000S1024G, SSD/NVMe, NTFS | 953,87 GiB | 679,47 GiB / 71,2 % |

Båda rapporterades Healthy/Online. Ingen USB-disk identifierades; fysisk montering, uppmätt hastighet och separat backup är inte verifierade. D: är förstahandsval för arbetsmaterial med denna kapacitet. Ingen ytterligare arbetsdisk behöver köpas för nuvarande mängd. En separat extern HDD kan fungera som säkerhetskopia; aktiv rendering och många små bildfiler passar på befintlig SSD. En flytt är inte en backup.

Inventeringen i `references/review-storage-audit.json` omfattar 86 516 filer och 46,015 GiB logisk storlek under `runs`. PNG står för 36,597 GiB (79,5 %), MP4 för 4,848 GiB (10,5 %) och MKV för 2,784 GiB (6,1 %). Många försök behåller samtidigt källfilm, uppackade rutor, masker, renderbilder och tidigare utkast. Cachepolicyn ovan gäller bara `media/preview-cache`, inte dessa arbetsfiler.

Ett avgränsat jämförelseprov av 360 rutor i två seat-6-utkast hittade 352 identiska och 8 olika filer, sammanlagt cirka 0,700 GiB identiskt innehåll. Detta bevisar inte att hela mappar är onödiga eller hur mycket fysisk disk som kan frigöras. Äldre och nya exporter delar delvis data via hårdlänkar; summerade mappstorlekar överdriver då fysisk användning. Rensning kräver klassning av original, bevis, valda resultat och återskapbar cache samt kontroll av alla referenser.

### Placering och ansvar

| Del | Föreslagen plats | Vad som lagras |
|---|---|---|
| Kod och dokument | Befintligt Git-repo | `src`, `tools`, `scripts`, `docs`, små `references`-manifest |
| Arbetsmaterial | D: under en konfigurerad materialrot | Original, körningar, mellanresultat, bevis och exportpaket |
| Publicerad granskning | Vercel UI och vald publik objektlagring | Litet index/dokument och hashbundna länkar till utvalda bilder/filmer |
| Säkerhetskopia | Oberoende disk eller privat backuptjänst | Original, genererade original, manifest och oersättliga bevis; provad återläsning |

Första molnval är [Vercel Blob](https://vercel.com/docs/vercel-blob/public-storage) för utvalda publika granskningsfiler, eftersom granskningsprojektet redan använder Vercel. En separat publik butik för Dealerlab har nu skapats; se references/blob-storage.json. Den tidigare privata källbutiken är separat och orörd. [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) är ett alternativ om stora nedladdningsvolymer blir avgörande, men tillför ett separat konto och integration. Jämför lagring, leverans och anrop tillsammans; dagens 46 GiB motiverar inte ensamt en ny leverantör. Privata original och backup ska hållas åtskilda från den publika ytan.

Föreslagen struktur, ännu inte skapad:

```text
Git-repot/
  docs/studio/KARTA.md             ansvar och samband
  docs/drift/DELNING-OCH-CACHE.md   lagring, backup, retention och publicering
  references/                     beställningar, noder och små materialmanifest
  src/ tools/ scripts/            körning, validering och export

D:/dealerlab-data/snyggare-dealer/
  dealers/<dealer-id>/runs/<run-id>/
    originals/                    bevarade källor och genererade original
    work/                         återskapbara rutor och mellanresultat
    evidence/                     QA, utvalda rutor och beslut
    outputs/                      valda slutresultat
  exports/<snapshot-id>/          verifierbara granskningspaket
  cache/                          registrerad, återskapbar cache

Publik objektlagring/
  objects/<sha256>.<ext>           oföränderliga leveransfiler
```

Manifesten ska vara den maskinläsbara sanningen; dokumenten beskriver regler och ägarskap. Varje fil behöver projekt, dealer-ID, run-ID, roll, assetId, originalhash, leveranshash, bytes, format/fps/rutor, källa, modell/task-ID när känt, beslut och logisk sökväg/objekt-URI. Nod-ID länkar till dessa material-ID:n. Nodkarta och granskningsindex härleds från samma manifest. Ett nodträd är en beroendegraf; alla filer behöver inte ligga i en mapp per nod.

Den fysiska roten, exempelvis D:/dealerlab-data, ska ligga i separat lokal lagringskonfiguration, inte spridas som absoluta sökvägar genom verktyg och dokument. Saknad proveniens förblir okänd. Nuvarande verktyg antar delvis dagens sökvägar; inför därför en gemensam sökvägsresolver och prova en körning innan någon flytt. `runs` och `exports` måste för närvarande ligga på samma volym eftersom exportbyggaren använder hårdlänkar. Ingen junction eller blind flytt föreslås som genväg.

### Bedömning av målet med ett knapptryck

| Mått | Skattning | Tolkning |
|---|---:|---|
| Komplexitet | 8/10 | 10 är svårast; geometri, grepp, ocklusion och rörelseskarvar kräver källspecifik kalibrering |
| Sammanhållning | 4/10 | 10 är bäst; starka filhashar finns men register, verktyg och senaste filmer är inte fullt samordnade |
| Automatiseringsmognad | cirka 30 % | En stödd dealer ska kunna gå från versionsstyrd beställning till validerad export utan ny specialkod, med återupptagning och visuell acceptans |

Detta är arkitekturbedömningar, inte uppmätt arbetstid eller en leveransprognos. Den senaste VILA-kedjan saknas fortfarande i äldre rörelseregister; kontraktsvalidatorn är Pamela-specifik och bankverktyg innehåller daterade/platsspecifika beroenden. Det är därför inte korrekt att säga att allt redan styrs av nodträdet.

Minsta genomförandeordning:

1. Samordna beställning, noder och material i ett gemensamt versionsstyrt kontrakt. Knyt även senaste VILA-kedjan till det. Behåll spelregler, sko och slump i Scoutmotorn.
2. Lägg en tunn körledare runt befintliga verktyg. Spara status och task-ID, återanvänd oförändrade resultat med hash, återuppta avbrutna steg och tillämpa befintlig kostnadsram innan betald generering.
3. Lägg gemensamma kvalitetskrav på tidsbas, geometri, handocklusion, skarvar och export. Bevisa hela kedjan med ett platsprov innan en större bank.

Knappen kan sedan starta denna beställning. Den kan inte i sig garantera ett godkänt visuellt resultat eller ta bort behovet av kvalitetskontroll.
