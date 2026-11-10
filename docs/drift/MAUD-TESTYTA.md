# Mauds lokala testyta

Öppna **http://127.0.0.1:4318/maud-test**. Starta labbet med `START.cmd`, kontrollera med `STATUS.cmd` och stäng med `STOPP.cmd`. De använder projektets verifierade Windows PowerShell-startskript och Node 24.21.0. Kör inte samma startskript från en annan PowerShell-variant om dess CIM-tidszon ger fel PID-kontroll.

## Vad du kan styra

1. **Spela Maud / Pausa / Loopa:** visar det verifierade rörliga originalet när Maud delar till box fyra.
2. **Sparat prov · gratis:** spelar den tidigare lokala filmen där hon säger ”Jakob är kung”. Ingen API-generering eller GPU startas.
3. **Chatta:** den befintliga lokala OpenAI-nyckeln används serverside, efter Jakobs uttryckliga val att återanvända den. Modell `gpt-4.1-mini`, testpersonan Maud, högst 20 korta svar per serverprocess. Detta är en ersättare för textsteget; OpenClaw är inte anslutet och dess fulla persona, minne eller verktyg används inte.
4. **Starta GPU:** skapar en separat testpod på Jakobs verifierade RunPod-konto med RTX 4090 och den gemensamma pinnade imagen. Samma bank laddas och värms före användning. Ingen produktion eller befintlig endpoint ändras.
5. **Läs upp / Säg repliken:** låter originalfilmen röra sig under förberedelsen, använder Mauds befintliga ElevenLabs-röst och strömmar munpaket över exakt originalfilm. En ny röst startas först när GPU-jobbet är accepterat. ”Jakob är kung” återanvänder det tidigare ljudet. Andra lyckade röster cachas efter exakt text, röst och modell.
6. **Direkt / Nästa varv av samma klipp:** startar när första 12 munrutor finns, eller väntar till nästa filmstart. Det senare är ett litet köprov med ett upprepat klipp, inte Scoutgamings fullständiga filmkö eller en verifierad mjuk skarv mellan olika filmer.
7. **Avbryt tal:** avbryter överföring, röstgenerering och uppspelning. Sena chatsvar får inte starta en ny replik efter avbrottet. **Stoppa GPU** avslutar bara labbets egen pod.

Filmen är **2,625 s / 63 rutor / 24 fps**. Därför svarar testpersonan med 1–3 ord. Längre ljud avvisas med ett begripligt fel; det kapas inte i hemlighet. En större filmkö behövs för längre samtal.

## Kostnad och avslut

- Ingen GPU startas av att öppna sidan. Text- och röstgenerering kostar när de används; sparad film kräver inga sådana anrop.
- GPU-sessionen har **20 minuters stoppgräns från skapandet**, högst **10 repliker** och ett prisfilter på högst 1 USD/timme plus konservativt diskpåslag. Cirka **0,35 USD** är den beräknade ramen för en full session, inte en leverantörsfaktura eller garanti vid API-avbrott. Kall imagehämtning ingår i tiden.
- En separat, taskägd deadlineprocess försöker avsluta just den registrerade podden även om labbservern kraschar. Den avslutas när podden stoppas. Misslyckad bekräftelse skrivs privat och ska undersökas; ingen annan pod stoppas.
- `STOPP.cmd` försöker avsluta testpodden före labbservern. Sidan kan lämnas öppen för granskning med GPU avstängd. Labbets befintliga session/livscykel används; ingen extra webbserver behövs.
- Ägarskap och tillfällig åtkomst finns i `private/maud-lab/`. Providernycklar kommer enbart från labbets `.env.local`; inga sådana nycklar skickas till webbläsaren eller GPU-podden.

## Image och dealerbank är olika saker

| Del | Vad det är | Hur det delas |
|---|---|---|
| Image | Program, läppsynkmodell och GPU-/Pythonbibliotek. Nuvarande lokala versioner är cirka 20,6 respektive 20,9 GB. | En gemensam version kan användas för alla dealers. Varje worker måste ha sin fungerande runtime. |
| Dealerbank | Källfilmens förberäknade ansikten, masker, latenter och exakta bildrutekartor. | Separat från imagen. Vårt enda Maud-klipp har en bank på **4 754 944 byte**, cirka 4,75 MB. Fler/längre filmer ger större banker. |
| Pod / worker | Den faktiskt hyrda GPU-datorn/processen som kör programmet. | Behåller modell/bank varm under testet. Betalas medan den finns kvar. |
| Endpoint | En adress som tar emot jobb och kan ha workers bakom sig. | Ingen permanent ny serverless-endpoint skapades av detta labb. Testet använder tillfälliga poddar. |
| OpenAI / OpenClaw | Producerar svarets text. | Separat från röst och läppsynk; ingen lokal språkmodell behövs här. |

Vid läsningen 2026-11-09 låg cirka **3,7 GiB** under `/workspace/MuseTalk/models` och **7,4 GiB** i `/workspace/mt-venv`. Det är valda delar av imagen, inte en fullständig lagerinventering. Docker rapporterade totalt 41,69 GB för tre lokala images, nio avslutade containrar och inga körande containrar före det nya UI-provet. ”ACTIVE” i image-tabellen kan betyda att en avslutad container refererar till imagen.

Att flytta modeller till en beständig volym kan göra imagepaketet mindre, men modellfilerna behövs fortfarande någonstans. Att minska imagen förbättrar främst hämtning/kallstart. Den uppmätta varma väntan på cirka 4,54 s i upprepade kontroller kräver en separat kodoptimering. [Docker: vad en image innehåller](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/).

**Disk är inte GPU-minne:** en 20-GB-image behöver inte 20 GB VRAM. Modeller, arbetsbuffertar och aktiva banker bestämmer minnesbehovet under körning. En 4,75-MB-bank betyder inte att själva GPU-programmet bara behöver 4,75 MB.

**Radering:** de lokala images behövs inte för att spela sparade filmer, chatta via OpenAI eller köra denna RunPod-testyta. De behövs för att återköra den tidigare lokala GPU-kedjan utan ny hämtning. Den äldre versionen är en möjlig städkandidat, men bevarade testcontainrar refererar till båda. Inga original, images eller befintliga testcontainrar har raderats. Städa först efter separat beslut om vad som ska bevaras, och mät faktisk frigjord disk efteråt.

## Automatisk förladdning

`references/lipsync-banks.json` är registret över färdiga banker. Det innehåller inga hemligheter. `tools/preload-dealer-banks.ts` kontrollerar dealer-ID, pinnad image, källhash, bankhash och kvitto före användning:

```powershell
node tools/preload-dealer-banks.ts --check
node tools/preload-dealer-banks.ts --status
node tools/preload-dealer-banks.ts --start
node tools/preload-dealer-banks.ts --preload-all
node tools/preload-dealer-banks.ts --stop
```

`--check` är lokal och gratis. `--start` motsvarar den debiterande GPU-knappen med samma gränser. `--preload-all` överför alla registrerade, färdiga banker till den redan startade poddens disk; just nu finns bara Maud. Det bygger ingen ny 20-GB-image per dealer och är **inte** en automatisk förberedare för nya filmer. Modellen värms för Maud vid start. Dagens motor behåller en aktiv dealerbank och laddar om vid bankbyte; flera förladdade filer innebär inte att alla dealers är varma i GPU-minnet.

Nästa steg för 30 klipp/dealer: skapa hashbundna banker när källfilmer ändras, lagra dem separat, förladda rätt bank och först därefter optimera flera bankers minnescache. Den nyare `op:prep`-koden finns i Scoutgaming, men ingår inte i november-6-imagen som jämförelseprovet använder. Ingen ny image har byggts eller publicerats här.

## Vad från Kevin/Emil som är användbart

- Prioritera repliken som snart ska visas; välj en lämplig kommande film och bind exakt klipp/ruta.
- Kasta gamla kartversioner och sena paket när filmplanen ändras. Labbet har nu avbrott och skydd mot sena chatsvar; generell omplanering återstår.
- Återanvänd samma ljud och föredra en worker med rätt bank. Labbet återanvänder exakt röstljud; flera workers och val mellan dem återstår.
- Behåll kroppen/korten från originalet och lägg bara munlagret över rätt bildruta. Det används redan i detta prov.
- Förvärm GPU medan textmodellen svarar. Här sker grunduppvärmningen med startknappen; per-replikens TTS överlappar workerns kontroller. Tidigareläggning av dessa kontroller under OpenAI/OpenClaw-svaret är ännu en möjlig optimering.

Referenser och skillnader mellan main och kevin-staging finns i [RunPod-kartan](RUNPOD-OCH-LAPPSYNK.md) och [köprovet](TESTA-KOAD-LAPPSYNK.md). Ingen Kevin-/Emil-branch har kopierats in eller ändrats.

## Verifiering av testytan 2026-11-09

Testat i Codex WebView: originalfilm, paus, sparad film, verkligt OpenAI-svar, ny ElevenLabs-röst, strömmad läppsynk på den rörliga filmen, nästa filmvarv, avbrott och ny replik efter avbrott. OpenAI är anslutet; OpenClaw är fortfarande ett framtida textinlopp.

| Prov | Färdig text → talstart | Extra väntan på filmstart | Saknade munrutor / tappade videorutor | Största ljud-/bildklockavvikelse |
|---|---:|---:|---:|---:|
| Hela chatkedjan, ”Vem är kung?” → ”Jakob är kung.” | 5,698 s | 0,0002 s | 0 / 0 | 4,89 ms |
| Senaste direktprov efter omladdning, slutlig spelare | 5,782 s | 0,0001 s | 0 / 0 | 5,47 ms |
| Senaste prov vid nästa filmvarv, slutlig spelare | 8,299 s | 2,395 s | 0 / 0 | 8,53 ms |

Chatmodellens svar tog separat **0,62 s** i hela chatprovet; den första fristående chatkontrollen tog 1,10 s. Den nya rösten tog **0,532 s** inklusive lokal konvertering och kostade enligt ElevenLabs **11 krediter**. TTS arbetade medan GPU:n gjorde sina kontroller. Munrenderaren behöver därefter det färdiga ljudet. De två senaste fulla proven gav 52/52 munrutor och högst 50,1 ms mellan presenterade rutor under tal på denna skärm. Talstart beräknas från ljudklockan och ljudfilens början, inte från en mikrofon.

**Startavvikelser är bevarade:** totalt åtta fullföljda UI-prov och två avsiktliga avbrott. Tre av de fullföljda proven registrerade en tappad videoruta. Två tidiga prov direkt efter sidomladdning hade 97–109 ms klockavvikelse. Spelaren ändrades så originalet spelar under förberedelsen och ljudet binds efter att `play()` är klar. Därefter registrerade ett prov fortfarande en tappad startruta men bara 8,85 ms avvikelse; de två senaste proven hade noll tappade rutor. Detta är inte ett bevis på felfri långtidsdrift. Visuell fonem-/maskacceptans och flera dealerfilmer återstår. UI:t markerar uppmätta tidsavvikelser för granskning.

Slutligt avbrottsprov fick inget första munpaket och startade inget tal; okänd talstart visas som streck. Kontroller: **18/18 avgränsade tester**, projektets TypeScript-kontroll och separat strikt kontroll av server/GPU-verktygen passerade. De omfattar bland annat avvisat GPU-jobb före TTS, avbrott av ljudarbete, källhashar, lokal åtkomst och skydd mot att sen städning skriver över en ny GPU-session.

Råmätningar: [körmappen](../../runs/maud-lab-1794189051641/), dess `talk-*/browser.json`, `result.json` och `audio.json`. [Skärmbild från köprovet](../../runs/maud-lab-1794189051641/ui-queue-proof.png). De tidigare lokala och separata molnproven finns i [LYCKAD-LIPSYNK-LOKALT](LYCKAD-LIPSYNK-LOKALT.md).

Testpodden `0dwjt6plcx3e0f` avslutades 02:03:33 UTC; ett nytt RunPod-läsanrop bekräftade **404**. Dess deadlineprocess är avslutad. GPU-kostnadens konservativa skattning för just UI-sessionen är **0,193 USD**, inte en faktura. Labbets preview lämnas till användaren, med GPU avstängd; stäng den med `STOPP.cmd`. Inga andra RunPod-resurser, images eller originalfiler ändrades eller raderades.
