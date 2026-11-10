# Provisorisk projektstruktur – Snyggare dealer

Beslutad inriktning 2026-11-10. Lokal arbetsyta: `C:/Users/jakem/dev/super-feature-sg/snyggare-dealer`. Detta dokument beskriver dagens praktiska uppdelning; det är inte ett påstående att den framtida generella dealerpipen är färdig.

## Identitet och ansvar

- Lokalt projekt: **Snyggare dealer**, paket `snyggare-dealer-local`, lokal Git-gren `jakob/test`. Remote `origin` pekar på det separata publika GitHub-repot `Jakeminator123/scout-dealerlab`. Arbetsgrenen `jakob/test` behålls lokalt; den filtrerade publiceringsgrenen `public/main` synkas till GitHub `main`.
- Publik granskningsyta: Vercel-projekt **scout-dealerlab**, team **scoutgaming**. Exakta ID:n och publicerad version finns i `references/public-review.json`.
- Scoutgamings huvudrepo är en läsreferens. Detta projekt skapar presentationstillgångar och metadata; spelregler, sko och slump stannar i Scoutmotorn.
- Den publika webbsidan visar en verifierad ögonblicksbild. Lokala ändringar kräver en ny uttrycklig publicering för att bli synliga där.

## Var materialet ska finnas

| Klass | Plats | Regel |
|---|---|---|
| Kod, beställningar, nod- och filregister | Projektets Git: `src/`, `tools/`, `scripts/`, `references/` | Små, versionsstyrda filer som beskriver och styr arbetet |
| Struktur, kvalitet och arbetsinstruktioner | Projektets Git: `docs/` | Detta dokument är strukturingång; `docs/studio/KARTA.md` beskriver funktionerna |
| Aktivt arbetsmaterial och original | Tills vidare `media/` och `runs/` på C: | Behåll sökvägar som aktuell kod, granskning och kalibrering behöver |
| Återställbart, avställt arbetsmaterial | `D:/dealerlab-archive/snyggare-dealer/<batch>/` | Exakt filurval, hashkontrollerad kopia och manifest före borttagning från C: |
| Aktuella valda granskningsfiler | Separat publik Blob-butik för Dealerlab | Oföränderliga hashadresser; endast avsett publikt arbetsmaterial |
| Oberoende säkerhetskopia | Separat disk eller privat backuptjänst | Återläsning ska provas; D-arkivering ensam är ingen säkerhetskopia efter att C-kopian tagits bort |

Alla filtyper omfattas av begreppet arbetsmaterial: filmer, bilder, masker, kalibrering, prompter, metadata och bevis. Blob betyder inte att hela arbetskopian ska publiceras. `.env*`, `private/`, kontouppgifter och lokala serverfunktioner ska aldrig ingå i publik lagring.

## Praktisk struktur

```text
C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/
  app/ src/ tools/ scripts/       program och körverktyg
  references/                    identiteter, val, kontrakt och små manifest
  docs/                          struktur, instruktioner och kvalitetskrav
  media/                         original och aktiv lokal cache
  runs/<run-id>/                 aktiva försök, original, valda resultat och bevis
  exports/<snapshot-id>/         aktuella verifierade publiceringspaket
  private/                       lokala hemligheter; utanför Git/publicering

D:/dealerlab-archive/snyggare-dealer/<batch>/
  manifest.json                  ursprunglig sökväg, SHA-256, storlek och status
  files/runs/...                 arkiverade filer med bevarad relativ sökväg
  files/exports/...              arkiverade, avställda paket

Publik Blob-butik för Dealerlab/
  objects/<sha256>.<ext>          oföränderliga utvalda arbetsfiler
```

## Arkivering och återställning

”Slask” är här en praktisk benämning på avställda eller återskapbara mellanresultat – inte ett bevis att innehållet saknar värde. Original och enda kopian av ett granskningsbevis får inte klassas som slask enbart på filnamn, ålder eller storlek.

1. Välj namngivna filer efter kontroll mot aktuella materialval, publiceringsmanifest, kodberoenden och pågående processer. Osäkra filer lämnas kvar.
2. Kopiera till D: med bevarad relativ sökväg. Verifiera varje kopia med SHA-256 och kontrollera att källfilen inte ändrades under kopieringen.
3. Skriv arkivmanifestet innan något tas bort. Kontrollera både källa och arkiv igen före borttagning från C:.
4. Ta endast bort de verifierade, namngivna C-filerna. Ingen allmän rekursiv rensning av `runs/`, `exports/` eller projektroten.
5. Återställ genom manifestet. Arkivet ska finnas kvar och en avvikande befintlig fil får inte skrivas över.

Verktyg: `node scripts/archive-work-material.ts copy <plan.json>`, därefter `prune <manifest.json>`. Återställ en fil eller batch med `restore <manifest.json> [relativ-filsökväg]`. Exakta genomförda batcher registreras i `references/storage-archives.json`.

Hårdlänkar gör att mappstorlekar inte kan summeras som fysiskt upptagen disk. Borttagning av en länk frigör inte nödvändigtvis några datablock. Före/efter-ledigt utrymme redovisas separat från flyttad logisk filstorlek; andra processer kan också påverka ledigt utrymme.

## Filvägar, noder och framtida knapptryck

Manifest ska vara den maskinläsbara sanningen; dokument beskriver reglerna. Koppla varje material-ID till projekt, dealer-ID, run-ID, roll, originalhash, leveranshash, storlek, format/fps/bildrutor, källa, känt modell/task-ID och beslut. Ange lokalt arbetsläge, arkivmanifest och publik objekt-URL separat. Okänd proveniens ska förbli okänd.

Nodträdet beskriver beroenden och arbetssteg. Det ska referera till material-ID:n; varje fil behöver inte få en egen nod eller mapp. Nodkarta och granskningsindex bör senare härledas från samma kontrakt. Absoluta datorberoende rötter ska samlas i lokal lagringskonfiguration när verktygen får en gemensam sökvägsresolver. En generell flytt av aktiva `runs/` till D: görs först när dessa beroenden fungerar; dagens exporter använder hårdlänkar och behöver samma volym som sina aktiva källor.

Minsta väg mot ”några rader och ett knapptryck”: gemensam dealerbeställning/materialkontrakt → återupptagbar körledare med sparad status och task-ID → gemensamma kvalitetskontroller → verifierad export. Börja med ett platsprov. Visuell acceptans och beslutad kostnadsram för generering ingår även när starten automatiseras.

## Genomförandestatus

Verifierat 2026-11-10T03:01:55.790Z: 9470 filer, 9.371 GiB logiskt, kopierades och SHA-256-verifierades på D: innan C-kopiorna togs bort. Exakt förteckning: references/storage-archives.json och D:/dealerlab-archive/snyggare-dealer/20261110-slask-02/manifest.json. Originalfilmer, aktiva materialval och publicerade exportbaser behölls. Ett första arkivförsök stoppade säkert efter metadataändring; dess 528 partiella D-kopior har jämförts mot det kompletta arkivet och städats bort. Kvittona behålls; inga C-filer raderades i det försöket.

Blob: 18 valda arbetsfiler (337957087 byte), butik store_76fWcWipNdC0aLAD, offentlig åtkomst, region arn1, ansluten endast till scout-dealerlab/production. Innehållet har hämtats anonymt och hashverifierats. references/blob-storage.json anger anslutning, references/work-material.json filhashar och direkta adresser. Befintliga privata Blob-källor och projektets .env.local ändrades inte. Ingen ny generell dealerpipeline implementerades.
