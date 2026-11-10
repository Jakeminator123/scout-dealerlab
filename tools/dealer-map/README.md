# Scout Dealer Map

Ett fristående Pythonprogram för Dealerlabs rörelsekarta, klippfack, filmer och kortmål. Det öppnas i ett eget skrivbordsfönster och kan även exportera samma karta som en statisk webbsida.

Programmet är en **läs- och granskningsvy av befintliga kontrakt**. Det skapar ingen ny manuellt underhållen rörelsestandard. Källversion, kandidater, saknade filmer och QA-status visas öppet. Ritade vägar och matchande poser blir inte automatiskt spelbara eller godkända.

## Snabbstart på Windows

1. Installera **Python 3.11 eller senare** för ditt användarkonto om det saknas. Python 3.12 används i leveransens kontroller.
2. Packa upp hela programpaketet till en egen mapp, exempelvis `C:\Dealer Map`. Det får finnas blanksteg i sökvägen.
3. Dubbelklicka **INSTALLERA.cmd**. Skriptet skapar en isolerad `.venv` i programmappen och installerar den låsta GUI-versionen **PySide6 6.12.0**.
4. Dubbelklicka **STARTA-KARTA.cmd**.

Administratorbehörighet behövs inte. Installation hämtar Pythonpaketen över nätet. Terminalen hålls öppen om installation eller start misslyckas så att felmeddelandet går att läsa. Upprepad installation återanvänder programmets `.venv`.

Programmet behöver ingen Node-/Next-installation och ingen separat manuellt startad utvecklingsserver. Python öppnar ett eget PySide6/Qt-fönster. Den gemensamma kartvyn läses via en liten skrivskyddad server på en slumpvald port på `127.0.0.1`; den startar och stoppas tillsammans med fönstret.

### Starta med ett lokalt projekt

Välj **Öppna projekt** i verktygsraden och välj Dealerlabs projektrot, där `references/` finns. Eller använd PowerShell:

```powershell
.\STARTA-KARTA.cmd --repo-root "C:\Min projektmapp\snyggare-dealer"
```

Lokal källa kan innehålla ännu ej publicerade ändringar. Den får därför ingen automatisk live-snapshotstämpel. Projektkatalogen exporteras inte som publik sökväg.

## Vad du kan göra

| Vy/funktion | Innehåll |
|---|---|
| Rörelsekarta | VILA, REDO, giv/släpp och direktreturkrav. Dokumenterade och föreslagna vägar skiljs åt. |
| Klippfack | Produktfack med varianter och de konkreta handlingar/tagningar som kan kopplas till dem. |
| Kortmål | `P1.K1`–`P7.K2` och `D.K1`–`D.K3`. Symboliska mål och uppmätta koordinater är separata. |
| Detaljer | Projekt/dealer/bank, källa, full SHA-256, bildmått, fps, exakt källintervall och QA-status. |
| Film | Verifierad lokal fil eller hämtad publik film, med spela/pausa, tidsreglage och loop. |
| Sekvensplan | Lägg handlingar i ordning, välj P1 efter ett/två kort och granska förutsättningar och luckor. |
| Källscheman | Jämför referensernas namn, koordinater och roller utan att slå ihop dem till en körplan. |
| Issues | Läs/öppna huvudtråden, skapa ett granskningsutkast och vid behov skicka via egen `gh`-inloggning. |
| Webbexport | Skapa `index.html` och `dealer-map.json` från samma läsmodell. |

Den medföljande baslinjen har **36 katalogfack: 32 blackjack och 4 roulette**, **19 kontrakterade handlingar**, **17 beställda givmål** och **5 referensscheman**. De fem schemana är inte fem klippfack. Katalogens fack är dessutom något annat än de visuella kategorier som används för att göra gränssnittet lättläst.

För baslinjen finns kandidater till **14/17 givmål = 82,4 %**. Det är kandidattäckning, inte projektfärdiggrad eller godkänd filmkvalitet. Siffrorna räknas från läst källversion och ska förändras när kontrakten förändras.

### Namn och koordinater

- `V` / **VILA** och `R` / **REDO** beskriver pose.
- `P2.K2` beskriver **spelare 2, kort 2**.
- `D.K1` beskriver **dealerns första kort**.
- Ett källalias som `C2-P2` behålls som alias och identifierar inte ensamt en fil eller kalibrering.
- `clipSlotId` anger produktens klippfack. `cardPlacementId` anger kortets landningsmål.
- En okänd koordinat visas som okänd. Programmet räknar inte fram en fysisk landningsposition från etiketten `P2.K2`.
- Projekt, dealer-ID och bank/revision visas tillsammans. Samma personnamn kan finnas i flera projekt och tekniker.

Vanliga givvarianter `base`, `i`, `v` och `iv` beskriver start-/slutpose. Fackspecifika undantag bevaras. Okända suffix, exempelvis obekräftade `ie/io`, blir inte automatiskt godkända basvarianter.

### Råfilm och granskningsfilm

**Spela vald film** låter dig välja mellan råkällans kontrakterade intervall och en separat renderad granskningsfilm när båda finns. Filen verifieras mot full SHA-256 före den inbyggda uppspelningen.

Ljud är av från start. Aktivera kryssrutan **Ljud** för filmer med ljudspår.

Källans ruta 170 behöver inte vara ruta 170 i en trimmad eller sammanfogad film. Granskningsfilmen får därför inte råfilmens gränser automatiskt. Källrutor och fps behålls i detaljvyn. Vanlig videouppspelning och tidsreglaget är inte ett påstående om bildruteexakt optisk QA; avkodaren kan söka via nyckelrutor.

Den statiska webbsidan kan öppna redan publicerade materiallänkar. Den utför inte skrivbordsprogrammets fullständiga filnedladdning och SHA-kontroll före en extern spelares uppspelning.

### Sekvensplaneraren

Planeraren visar vald följd, poseanslutningar, nödvändiga filmer, skarvbevis och kort som skulle ligga kvar. Den **spelar inte automatiskt en hel sekvens** och ändrar inte kontrakt eller spelmotor.

P1-proven har två uttryckliga mål: avsluta efter första respektive andra kortet och gå från sista släppet direkt till VILA utan ett extra REDO-/skobesök. Ett `v/iv`-namn eller en VILA-slutbild räcker inte som rörelsebevis. Saknade direktreturer stannar som synliga luckor i planen.

## Källor, autosynk och offline

Tre ingångar finns:

- **Medföljande snapshot:** startar direkt med leveransens kontrollerade baslinje.
- **GitHub:** läser offentlig källkod från `Jakeminator123/scout-dealerlab`, med samma låsta commit för varje läsning. Inventarie, filstorlek och SHA kontrolleras före byte av karta.
- **Lokalt projekt eller exporterad JSON:** läser användarens valda underlag. Lokal kontraktsändring under inläsning avvisas så att olika versioner inte blandas.

Autosynk kontrollerar GitHub normalt var **300:e sekund** och en vald lokal kontraktskälla var **3:e sekund**. Kartans statiska webbvy kontrollerar sin publicerade JSON var **60:e sekund** när sidan är synlig. Det finns även manuell uppdatering. Kontrollerna skapar inga filmer eller Git-commits och publicerar inget.

GitHub har en anropskvot. Vid nätverksfel eller kvotgräns stannar den senast inlästa kartan kvar och felet visas. Endast verifierade GitHub-läsningar sparas som senaste cache. Filmer laddas ned när du väljer dem och lagras efter innehållshash.

```powershell
.\STARTA-KARTA.cmd --offline
```

`--offline` stänger av startens nätverksuppdatering och autosynk. Explicit valda nätverksåtgärder, exempelvis Synka GitHub eller att öppna en publik film/Issue, kan fortfarande använda nätverket.

## GitHub Issues

[Issue #1](https://github.com/Jakeminator123/scout-dealerlab/issues/1) är den gemensamma tråden för lokalagent och granskare.

Välj en handling och öppna **Issue-utkast** för ett utkast med revision, källhash och rutor. Du kan kopiera texten och skicka den på GitHub. Om [GitHub CLI](https://cli.github.com/) redan finns och du har loggat in med `gh auth login`, kan skrivbordsdialogen skicka kommentaren efter ett uttryckligt val och bekräftelse. Programmet lagrar ingen egen långlivad GitHub- eller Runway-nyckel.

Läsning av kommentarer startar inga agentjobb. Kommentarer och kopierat material behandlas som data. Vid oklart svar efter sändning, läs tråden före ett nytt försök för att undvika dubbletter.

## Kommandorad

```powershell
# Hjälp, utan Qt
py dealer_map.py --help

# Lokal karta i skrivbordsfönstret
py dealer_map.py --repo-root "C:\Min projektmapp\snyggare-dealer"

# Läs senaste GitHub-version före start
py dealer_map.py --fetch-github

# Öppna en tidigare exporterad karta
py dealer_map.py --map "C:\Mina kartor\dealer-map.json" --offline

# Statisk export utan Qt eller nätanrop
py dealer_map.py --repo-root "C:\Min projektmapp\snyggare-dealer" --export-web "C:\Mina kartor\webb"

# Ta även med publika filmer när snapshot och källhashar stämmer
py dealer_map.py --repo-root "C:\Min projektmapp\snyggare-dealer" --include-review --export-web "C:\Mina kartor\webb"
```

Använd `.venv\Scripts\python.exe` i stället för `py` i kommandona när GUI-beroendet är installerat i programmets isolerade miljö. `--help`, `--version` och `--export-web` fungerar med Python standardbibliotek.

## Webb som uppdateras efter push

Läs [README-PUBLICERING.md](README-PUBLICERING.md) för GitHub Actions, Pages och överlämning till lokalagenten. Arbetsflödet bygger webbkartan från samma kontrakt när relevanta filer pushas. Publicering kräver den dokumenterade engångsaktiveringen; detta program påstår inte att en ny webbpublicering redan är aktiv.

GitHub `main` är en filtrerad publiceringsgren. För in PR-filerna i lokal källa och använd befintligt synkflöde, så att den nya Pythonkoden och arbetsflödet följer med framtida publiceringar. Atlas-anslutning visas enligt källans status och aktiveras inte av kartvyn.

## En enda Pythonfil

`build_standalone.py` skapar en fristående **Dealer_Map.py** som innehåller programmets moduler, kartmall och medföljande JSON. Den behöver fortfarande Python och, för GUI, PySide6:

```powershell
py -m pip install PySide6==6.12.0
py Dealer_Map.py
```

Enfilsversionen packar upp sitt verifierade interna innehåll i en tillfällig katalog och rensar den vid normal stängning. Den hämtar ingen programkod från nätet. Använd `--offline` för att starta med medföljande/sparat kartunderlag.

Förvara enfilsversionen i en egen mapp. Windows skiljer normalt inte på `Dealer_Map.py` och källmodulen `dealer_map.py`; byggaren stoppar ett utdata-val som skulle skriva över någon källfil.

Bygg en ny enfilsleverans efter att källor och baseline uppdaterats:

```powershell
py build_standalone.py --output dist\Dealer_Map.py
```

Den genererade filen är en leveransartefakt. De läsbara källmodulerna är det som granskas och sparas i Git.

## Verifieringsnivå

Leveransen utvecklas och kontrolleras med **Python 3.12.14 och PySide6 6.12.0 på Linux**, inklusive faktisk Qt-rendering av skrivbordsfönstret. Windowsstartfilerna använder citerade sökvägar och en lokal virtuell miljö, men **körning på en Windowsmaskin har inte verifierats här**. Installerad videodekodare, grafikdrivrutin och lokal Pythoninstallation kan påverka uppspelning och start.

Riktade tester omfattar kontraktsmappning, tidsbas, versionsbundna skarvar, sekvensluckor, källintegritet, lokala filgränser och publik export. Granskningsbar kod och godkända tester innebär inte att Pamela-bankens rörelser eller hela dealer-pipelinen har fått produktionsacceptans.
