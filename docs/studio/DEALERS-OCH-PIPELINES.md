# Dealeridentiteter och pipelines

Kontrollerat 2026-11-08. Identiteterna bygger på Jakobs uttryckliga identifiering, bifogade bilder, separata adminposter och lokala filhashar. Inga automatiska slutsatser dras av utseende eller ett gemensamt lagringskonto.

| Lokal identitet | Scoutgaming-ID | Spår | Bevis |
|---|---|---|---|
| Göran · Scout Main | `goran` | Ordinarie filmade dealerklipp | Admin: `Göran · vila_andning_01 · 9492f43d`, klipp-ID `fbb08d0c-856c-52ca-a18b-1865866aa64f`. Lokal `goran_vila_grundloop.mp4` har samma hashprefix. Jakobs första bild identifierar dealern. |
| Blankurius · Scout Main | `blankurius` | Snabbstudion, enligt Jakob Utökad | Admin: `Blankurius · vila_andning_01 · 9fe76a9f`, klipp-ID `54c3ff6f-78ae-555e-8fdf-e7309c913d71`. |
| Göran · alternativ helkropp | Inget verifierat | Separat experimentell Runway-pipeline | Jakobs andra bild och granskat Runway-original `893e4e04-f48f-4bf7-8e38-c416de50b033`. 1920 × 1080, 30 fps, 90 rutor, grön bakgrund. |

`references/dealers.json` binder klassificering till exakt lokal SHA-256. Ändrade filer blir oklassificerade tills de granskats igen. Övriga Runway-filer tilldelas inte identitet bara för att de är nya eller har liknande promptnamn.

## Blankurius ursprung

Jakob uppger att Blankurius kom från `https://www.scoutgaming.tech/studio/snabb`, med utökat klippalternativ och en egen bild på vit bakgrund. Detta är **användaruppgift**, inte verifierad jobbproveniens. Jobb-ID, ursprungsbildens hash och eventuell omarbetning till keystonebild saknas ännu.

WebView bekräftade sidan och stegen Foto → Namn och röst → Omfattning → Kör → Granska → Sätt vid bord. Referenskoden `C:/Users/jakem/dev/scoutgaming/apps/studio/lib/snabb/client.mjs` använder `/admin-app/api/jobs/snabb` och kontraktets `grund`/`utokad`. Koden skiljer mellan en ny kedja och påfyllning av en klar Grund-dealer till Utökad. Det styrker att vägen finns, men avgör inte vilket jobb som skapade Blankurius.

En vit bakgrund är inte en kvalitetsstämpel. Keystonegranskningen behöver senare pröva identitet, kamera/perspektiv, händer och anatomi, ljus, silhuett och geometri mot målbilden. Ingen förbättring eller omarbetning har gjorts nu.

## Alternativa system

- **Äldre 3D-scenreferens:** Three.js-scen, panorama och videoplan från `extra/insperationsmall-alternativ`. Inte verifierad som riggad avatar. Se ALTERNATIV-3D.md.
- **Alternativ helkroppspipeline:** den större helkroppsfiguren i Jakobs andra bild. Samma projekt som den äldre 3D-scenreferensen är nu verifierat genom projekt-ID, ankare, panorama och nickfilm. 19 källfilmer finns i blackjack-studio revision 103. Koppling till Scoutgamings kortlogik är inte verifierad. Se `references/alternative-fullbody.json`.
- **Kevin/Emil:** separat referensgren och rörelsedata. Namnlikhet gör inte klipp, mått eller tidsaxlar utbytbara.

De alternativa referenserna ligger under studions tredje flik med separata källscheman. Ingen databaspost eller Blob-fil har flyttats eller ändrats. Gemensamt Blob-lager innebär inte i sig delad logik; någon fullständig granskning av produktionskopplingarna har inte utförts.

## GPT-underlaget

Paketets roll, innehåll och läsgränser finns i [studiokartan](KARTA.md#vad-gpt-mappen-är).

