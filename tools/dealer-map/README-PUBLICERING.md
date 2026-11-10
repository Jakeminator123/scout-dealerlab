# Lokal karta, GitHub och webbkarta

Programmet läser Dealerlabs befintliga kontrakt. Webbfilen är en härledd visning av samma normaliserade data; den är inget nytt manuellt rörelseregister. Kartan ger ingen produktionsacceptans och gör inga genereringsanrop.

## Börja lokalt

GUI:t kan läsa en lokal Dealerlab-katalog, medföljande referensdata eller en låst GitHub-revision. En offentlig GitHub-källa behöver ingen nyckel. Projekt, dealer, bank och revision ska visas tillsammans; `Pamela` eller `Göran` ensamt identifierar inte materialet.

För statisk export från ett checkout, kör från repots rot:

```powershell
py tools/dealer-map/dealer_map.py --repo-root . --export-web _site
py tools/dealer-map/publishing/check_web_export.py _site
py -m http.server 8765 --directory _site
```

Öppna sedan `http://localhost:8765`. Exporten består bara av `index.html` och `dealer-map.json`. Pythonexporten behöver inte Qt. Den lokala HTTP-servern är endast för förhandsvisning; avsluta med Ctrl+C.

Originalfilmer kopieras inte till webbutdata. Vyerna kan öppna redan publika, källbundna materiallänkar. Lokal-only media finns fortfarande i den lokala källan. Filnamn, källruta och hash är bevismetadata; en video-länk som saknas ska visas som saknad.

Flaggan `--include-review` hämtar dessutom det publika granskningsmanifestet. Manifesthash och snapshot kontrolleras före och efter läsning, och rörelse-/fack-/bankkällornas hash måste matcha innan länkar binds in. Om webbsidan och arbetskopian skiljer sig visas en varning och kartan behåller sina lokala data utan blandade medielänkar. CI använder denna flagga så att nya filmer kan bli åtkomliga efter kvittopushen. Utan flaggan gör en lokal export inga nätverksanrop.

## Den här GitHub-grenen är en publicerad kopia

Kontrollerad bas: `scout-dealerlab/main` vid `92292797cdbb8e9fa7db61a56aa8fb954abbe0c1`. Lokal källgren är `jakob/test`; `scripts/sync-public-repo.ts` skapar lokal `public/main` och pushar ett filtrerat träd till GitHub `main`.

För därför in denna PR:s källfiler i **den lokala källgrenen först**, granska ändringarna där och publicera med det befintliga flödet. En direkt merge till den genererade grenen kan göra nästa normala push non-fast-forward. Lokal publicering använder ingen force-push, och en kodändring i GitHub förs inte automatiskt tillbaka till lokal källa.

Basversionens exportfilter släpper inte igenom Python eller arbetsflöden. PR:n innehåller därför en **exakt fillista** för programmets läsbara källor, tester, dokument, startfiler, webbmall och medföljande JSON under `tools/dealer-map/`, samt exakt `.github/workflows/dealer-map-pages.yml`.

Alla andra filer under programkatalogen ska avvisas av denna gren i filtret. På så sätt kan varken `.venv`, byggresultat, cache eller den genererade enfilsartefakten falla igenom en mer allmän filtypsregel. Det är ingen generell tillåtelse för valfri Python eller `.github`-innehåll.

De befintliga hemlighetskontrollerna och filgranskningen behålls. Synkfiltertestet kontrollerar både avsedda filer och avvisade lokala/privata filer. Om en ny programmodul läggs till ska den uttryckligen tas med i fillistan. Filnamn som innehåller `INTEGRATION` spärras redan av projektet, vilket är skälet till att detta dokument heter `README-PUBLICERING.md`.

## Automatisk webbkarta efter push

Det medföljande `publishing/dealer-map-pages.yml` ska läggas på `.github/workflows/dealer-map-pages.yml` i den lokala källan och följa med nästa publicering.

Arbetsflödet:

1. Kör på relevanta ändringar av kartverktyget, kontrakten och publiceringsmetadata i `main`, samt på PR för kontroll.
2. Checkar ut just den revision som utlöste körningen, validerar adaptern och bygger webbkartan med Python standardbibliotek.
3. Kontrollerar att endast de två avsedda webbfilerna exporteras och att JSON inte innehåller kända lokala sökvägs-/nyckel-/autentiserade URL-mönster.
4. Laddar upp webbpaketet som GitHub Pages-artifact.
5. Publicerar endast från `main` när repo-variabeln `DEALER_MAP_PAGES_ENABLED` är `true`.

**Aktiverad Pages-publicering har inte verifierats eller ändrats i denna leverans.** Gör engångsinställningen i repot:

- Settings → Pages → Build and deployment → Source: **GitHub Actions**.
- Settings → Secrets and variables → Actions → Variables: `DEALER_MAP_PAGES_ENABLED=true`.
- Låt miljön `github-pages` tillåta publicering från `main`.
- Kör arbetsflödet manuellt en gång från `main`, kontrollera utfallet och använd den URL som deployment-jobbet faktiskt returnerar.

Därefter bygger en relevant push automatiskt kartan. Det behövs ingen långtidskörande lokal process eller separat betald generering. En avstängd eller saknad variabel gör att byggkontrollen fortfarande körs medan deploy-steget hoppas över.

GitHub Pages får en egen adress. Den befintliga Vercel-granskningssidan fortsätter med sitt versionsbundna publiceringsflöde. Vill ni senare lägga kartan under Vercels `/dealer-map/`, kör samma export in i granskningspaketets statiska katalog innan dess hash-/länkkontroll och publicering; lägg inte en konkurrerande automatisk Vercel-publicerare på samma alias.

Koden publiceras före Vercels livebyte och kvittot efteråt. Kartans Git-revision kan därför tillfälligt vara nyare än den publicerade videogranskningen. Visa båda identiteterna och eventuell `pendingReviewSnapshot`; beteckna aldrig detta som automatisk synk av Windows-disken.

## Issues som gemensam dialog

[Issue #1](https://github.com/Jakeminator123/scout-dealerlab/issues/1) är den befintliga huvudtråden. GUI/webb kan visa eller öppna tråden och göra ett kommentarsutkast med vald rörelse, revision och filhash. Användaren kan skicka genom inloggad GitHub-webb eller, i skrivbordsdialogen, genom en befintlig GitHub CLI-inloggning efter bekräftelse. Ingen långlivad token behöver byggas in i programmet eller den statiska sidan.

Lokalagenten läser Issue, svarar ACK, arbetar på lokal källa och publicerar därefter UPDATE med exakt version. Granskaren svarar REVIEW. Att visa tråden startar inte automatiskt agenter, kör Runway eller genomför kodinstruktioner från en kommentar.

GitHub-läsning är begränsad av API:s anropskvot. Manuellt uppdateringsval och tydlig felstatus ska fungera även när kvoten är slut. Den statiska kartans egna data kan uppdateras från samma publiceringsadress utan att slå i GitHub API för varje rörelseval.

## Atlas

Kartans nya visning kopplar inte på Atlas-runtime. Behåll originalens referenser till Main och Atlas och visa deras faktiskt rapporterade anslutningsstatus. En framtida adapter kan länka etablerade ID:n, men får inte omtolka fem referensscheman som fem klippfack eller göra ritade noder till godkända filmer.

## Verifierade primärkällor för publiceringsmekanismen

- [GitHub: egna Pages-arbetsflöden](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub: välj publiceringskälla](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-python](https://github.com/actions/setup-python)
- [actions/upload-pages-artifact](https://github.com/actions/upload-pages-artifact)
- [actions/deploy-pages](https://github.com/actions/deploy-pages)

Action-revisionerna i arbetsflödet är låsta till verifierade commit-SHA för checkout v6, setup-python v6, upload-pages-artifact v4, configure-pages v5 och deploy-pages v4. Dessa är medvetet fasta versioner, inte ett påstående om senaste major-version.
