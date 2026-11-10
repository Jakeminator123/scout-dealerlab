# Arbetsläge – 2026-11-08

## Verifierat klart

- GPT:s RAW-konversation är läst 303/303 rader. [Granskningens ämnesingång](../GRANSKNING-UI-VIDEO-OCH-GPT.md) länkar till format/kvalitet, Keystone och studiokarta. Fasta baslinjer och högst två föregående Markdown-versioner bevaras; saktext redigeras när ny evidens ändrar slutsatsen.
- Den lokala Next/React-studion har A/B-filmvyer, tidslinje, materialfilter, rörelsescheman och 36 gemensamma begreppsdefinitioner. Johan är ett pedagogiskt exempel utan egen filmkoppling. Node 24.21.0 via Volta, Next 16.4.5 och React 19.3.1 är verifierade; inga nya paket installerades för denna leverans.
- Källspåret filtrerar nu kandidat A och materialbiblioteket. Referens B kan jämföra andra spår. Alternativa visar 19 filmer och fem bilder; hela katalogen innehåller 27 filmer och 33 bilder. Vyerna använder filhash, dealeridentitet och källspår separat.
- Alternativa Görans verkliga projekt återfanns i `C:/Users/jakem/dev/super-feature-sg/local-studio/blackjack-studio`, projekt `e19d226c-c586-467e-b126-6a9f90e1675e`, revision 103. Samtliga 23 källfiler hashverifierades; 18 kopierades och fem identiska lokala filer återanvändes. [Källkartan](../studio/ALTERNATIV-3D.md) beskriver scenbygget, startfilen och gränserna. `references/alternative-bank.json` bevarar proveniens; 18 klippfack har exakt filkoppling. Rörelse-QA och koordinatkalibrering återstår.
- Studions fontfel berodde på CSP och hantering av Nexts lokala fontrutt. `font-src 'self'` och vidarebefordran av `/__nextjs_font/` är korrigerade. Den kontrollerade fontfilen svarar 200; slutkontroll av lokal och publicerad vy gav inga konsolfel. Bildens ospecificerade 404 kan inte ensam identifiera varje felande resurs.
- Automatisk serveravstängning är införd: sista lokala studioanslutningen startar en 60-sekunders frist. Återanslutning avbryter fristen; minimering stänger inte anslutningen. Aktivt serverarbete får avslutas. Ingen godtycklig Node-process stoppas.

## Gemensam lokal och offentlig granskning

[scout-dealerlab.vercel.app](https://scout-dealerlab.vercel.app) är en offentlig läskopia i det separata projektet `scout-dealerlab`, team `scoutgaming`. Scoutgamings produktionsapp har inte ändrats. Snapshot `public-review-20261108190953`, deployment `dpl_5aXSjjRrgG7NjNfwnqZZu5UmNnMy`, innehålls-ID `aa0bc9ccd78e2ff7872bb058f4cfd5d28a7705e83ec013d1774bb6f389c59a42`.

Webben har samma 60 katalogmaterial, A/B-val, tre spår, schema, ordlista och status. Manifestet innehåller dessutom en bevarad bevisruta. 17 större filmer har komprimerade visningskopior; originalmått, originalhash och visningskopians mått hålls isär. Lokala original har inte skrivits över. Publicerad ZIP: 83 verifierade poster, 63 057 526 byte.

`/agent-context.json` och `/llms.txt` ger versionsmärkt underlag. Länkar mellan lokal och offentlig vy bevarar samma A/B-material. Båda visade samma innehålls-ID vid slutkontrollen. Kör `UPPDATERA-GRANSKNING.cmd` för att förnya webben; lokala ändringar publiceras inte automatiskt. Exporten är en ögonblicksbild. [Delning och cache](DELNING-OCH-CACHE.md) beskriver rutinen.

## Kontroller och bevisgränser

Typkontroll av projektet och den fristående webbklienten är godkänd. Tolv riktade server-/livscykelkontroller passerade, bland annat flera flikar, återanslutning, avstängning och Origin-skydd. Senare metadata- och fontändringar kontrollerades med HTTP och WebView, utan en onödig full testomgång.

Slutkontrollen i WebView bekräftade 19 alternativa filmval, 18 övergångar, exakt koppling från andningsfacket till A, båda Göran-identiteterna och publicerad filmuppspelning. [Sparad studiovy](../../.runtime/studio-goran-review-20261108.png). Anonym webbåtkomst, MP4-byteintervall och 404 för privat `.env.local` är verifierade. Detta är inte full rörelseacceptans eller bildruteexakt A/B-synk.

## Nästa dealer och återstående arbete

[GPT-kedjan](../granskning/GPT-KEDJAN.md) är nästa avgränsade uppdrag. Jakobs stora instruktion och nya källmapp har ännu inte kommit. Utgå från fast kamera och gemensam geometri; skilj panoramats djupintryck från verklig 3D och håll miljöanimationer separata från dealern. Ingen ny dealer eller filmgenerering har startats.

Tre Pamela-stillbilder finns. V3 är faktiskt 916×1717, inte begärda 1080×1920, och saknar verifierade hand-/skokoordinater. Historiska Kevin-/Emil-bankers olika vilobeteenden och suffix får inte slås ihop. Kevins ursprungliga externa inputmanifest och Blankurius jobb-/bildproveniens återstår. Kalibrerade ankare, mask/skugga, fulla vila-/giv-/talprov och integration av det återfunna 3D-scenbygget är inte klara.

UI/UX-sidchatten har levererat en separat lokal admin-/scenprototyp i `app/admin-prototyp/` och `src/admin-prototype/`. Publicering där är simulerad. HTTP-routen är verifierad, men hela prototypen är inte accepterad av huvudagenten. Äldre Scoutgaming-worktree lämnas orörd. `.env.local` är privat; tidigare inloggningsförsök gav 401 medan befintlig WebView-session fungerade. Inga konton har ändrats.

## Överlämning och resurser

HUVUDAGENT 1 förbereder en kompakt handoff till HUVUDAGENT 2 i `references/agent-roles.json`. Ingen efterträdarchatt eller överföring av skrivägarskap har skett. Underlag äldre än 60 minuter ska verifieras före återanvändning, enligt [agentstart](../roller/START.md).

En verifierad labbserver lämnas för granskning på **127.0.0.1:4318**, PID **16752**, Node 24.21.0, startad 2026-11-08 20:09:38 svensk tid. Fem lokala anslutningar fanns vid sista kontrollen. IAB-flik 6 är lokal studio och flik 12 offentlig läskopia. Andra användarflikar lämnas orörda. Använd `STATUS.cmd` för aktuell identitet och `STOPP.cmd` för omedelbart stopp; annars stannar servern efter sista anslutningen och fristen. Den alternativa appens server på port 4323 har inte startats.

Automatisk godkännandegranskning nekade radering av den ofullständiga exporten `exports/public-review-20261108190207` med `blocked by policy`. Den ligger kvar utan publicering; raderingen har inte omförsökts. Även den tidigare nekade testmappen `.runtime/doc-version-check-facddb3ff3f3441791a225ae61c87417` ligger orörd. Inga processer krävs av dessa mappar.

Aktiva underagenter: **0**. Inga genereringsjobb eller långlivade miniprojekt hindrar att chatten stängs: **0 % blockerande arbete kvar**. Detta är inte en färdiggrad för hela studion eller GPT-kedjan; deras återstående funktioner anges ovan.
