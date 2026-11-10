# Arbetssätt

## Utgångsläge, 2026-11-08

Arbetsytan är separat från Scoutgaming och saknar Git-remote. Referenskopian `C:/Users/jakem/dev/scoutgaming` var ren på `main` vid initieringen. GitHub bekräftade samma huvudgrenar som underlaget:

- main: `d86a6b47c85f4b1341e4ffe2a7a49f08800bc544`.
- kevin-staging: `61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65`.

Underlaget innehåller 7 videofiler, 17 JPG/PNG-bilder, sammanställd konversation, provplan samt kodreferenser. Antalet inkluderar bildbevis och säger inget om unika original. Originalets elva länkade Windows-bilder saknas enligt underlagets lista; denna initiering har inte sökt igenom datorn efter dem. `extra/` innehåller också en alternativ geometrimall och bilder från ett annat lokalt projekt. Dessa är referenser, inte redan integrerad Scoutgaming-kod.

## Enkel kedja

1. **Källa:** välj en befintlig film, fastställ ursprung och spara SHA-256. Ändra aldrig källfilen.
2. **Försöksplan:** skapa försök i granskningssidan, ange vad som ändras och välj referens. `job.json` sparas lokalt med källornas metadata. `probeError` betyder att ffprobe inte kunde verifiera formatet.
3. **Original:** befintliga Runway-/Blob-filer kan läsas in via importdialogen. Framtida generering sparas i försökets `original/` med modell, prompt, task-ID, tider och kostnad. Ingen automatisk eller betald generering är aktiverad.
4. **Bearbetning:** spara separata resultat i `processed/`. Ange varje omkodning/transform; aldrig enbart "förbättrad".
5. **Granska:** välj resultatfil och referens i spelarna. Gemensam start är för visuell jämförelse, inte en garanti för bildruteexakt synk. Spara beslut, observation och filhash i `qa/` genom formuläret.
6. **Export:** lägg godkänt material och ifyllt leveransmanifest i `export/`. Scoutgaming-import är ett separat uppdrag.

## Första konkreta provet

Följ `gpt-underlag/uppackad-zip-underlag/03_arbetsplan/02_provplan.md`:

- Samma tidigaste källfilm, kamera, skala och geometri.
- A: utan extra grönnormalisering. B: befintlig kedja. C: separat tidsstabil matte.
- Jämför hår, axlar, fingrar och sko i rörelse på mörk, ljus och slutlig bakgrund.
- Kontrollera kort/hand-kontakt, landning och VILA/REDO-skarvar innan godkännande.

Startytan visar råa filmer. Att välja en helscen som referens komponerar inte automatiskt det gröna dealerlagret över scenen. Maskning och den kalibrerade kompositionsvyn är nästa implementation efter att källkedjan fastställts.

## Teknikval

Studion använder redan TypeScript, Next och React på Node. Versionerna och Volta-pinnen finns i package.json. JSON och vanliga webbmediefiler är överföringsgränsen. Blackjack-reglerna ligger kvar i Scoutgamings spelmotor.

Runway är en molntjänst. "Lokalt först" betyder att verktyg, förberedelser, filer och granskning körs lokalt. Generering via API, plugin eller portal skickar material till Runway och behöver därför ett senare uttryckligt uppdrag med kostnadsram. Ingen kanal aktiveras automatiskt av START.cmd.

## Dokumentation och versioner

`docs/GRANSKNING-UI-VIDEO-OCH-GPT.md` är stabil ingång till ämnesfiler för fynd, ordlista och slutsatser. Redigera relevanta avsnitt vid betydande nya fakta; håll texten sammanhängande och ersätt felaktiga formuleringar. Ingen ny rapport, append-logg eller obligatorisk ändring per chatt. Aktuella användarinstruktioner och verifierade källor går före dokumentet.

Egna `README.md`, `AGENTS.md` och Markdown under `docs/` (inklusive undermappar) har fast baslinje, aktuell version och högst två föregående versioner i `.history/markdown/`. Baslinjen för befintliga dokument är första bevarade läget 2026-11-08, inte en återskapad ursprungshistorik. Räknaren fortsätter trots att äldre mellanversioner gallras; filnamnet för arbetsdokumentet är stabilt.

Förbered hela nästa text under `.runtime/doc-drafts/`, granska den och kör från projektroten:

```powershell
powershell.exe -NoProfile -File scripts/doc-version.ps1 -Path docs/GRANSKNING-UI-VIDEO-OCH-GPT.md -CandidatePath .runtime/doc-drafts/GRANSKNING-UI-VIDEO-OCH-GPT.md
```

Identiskt innehåll ger inget nytt nummer. Om arbetsfilen har ändrats utanför versionsverktyget stoppas bytet så att parallellt arbete inte skrivs över. Bevarat GPT-underlag och `extra/` versionshanteras inte av verktyget.

Ny egen Markdown-fil: skriv färdigt första versionen och kör `powershell.exe -NoProfile -File scripts/doc-version.ps1 -InitializePath docs/<mapp>/<fil>.md`. Det fångar dess fasta baslinje. Vid flytt bevaras historiken enligt [dokumentkartan](../studio/KARTA.md#dokumentens-flytt-och-historik).
