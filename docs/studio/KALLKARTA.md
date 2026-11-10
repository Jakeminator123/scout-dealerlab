# Källkarta: produktion, poser och koordinater

Verifierad lokalt 2026-11-08. Detta är en läskarta och normaliserad referensdata, inte en ny spelmotor, produktimport eller verifiering av drift. Ingen generering, uppladdning eller tjänsteanslutning gjordes.

## Frysta källor

| Källa | Exakt revision | Status vid läsningen |
|---|---|---|
| Scoutgaming `main` | `d86a6b47c85f4b1341e4ffe2a7a49f08800bc544` | Lokal referensrot `C:/Users/jakem/dev/scoutgaming`, remote `git@github.com:Jakeminator123/scoutgaming.git`. |
| `kevin-staging` | `61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65` | Finns som lokalt Git-objekt och som utvalda kopior i underlaget. |
| Claude `ui-rorelse-2-1108` | `2a8ec226e6e80abe24aa258f1767b075e243e1a8` | Worktree med ytterligare ocommittade UI-ändringar. |
| Claude `admin-varianter-1108` | `3f1205fac8c6219b3c8f0c71c7b23df7d4cf4204` | Worktree med ytterligare ocommittade variantändringar. |

Git-källor lästes med `git show <SHA>:<sökväg>`. Underlagets 35 kodkopior kontrollerades mot sina deklarerade SHA-256 i `gpt-underlag/uppackad-zip-underlag/06_kodreferenser/kallor.json`: **35/35 matchade**. Det bevisar kopiornas integritet, inte filmernas kvalitet eller tillgänglighet.

## Produktionsvägar som faktiskt finns

| Väg i main | Belagd roll |
|---|---|
| `services/studio-worker/pipelines/snabblage/lib/dealer.mjs` | Orkestrerar Dealer Factory, kontroll av referensbildens inramning, nyckelbilder, filmblock, grönnormalisering, klippkontroll och leverans. Dess prompt begär att kortpositioner, handkontakt, kamera och rörelse bevaras; prompten är inget kvalitetsbevis. |
| `services/studio-worker/dealer-factory/dealer_factory/pipeline.py` | Hanterar blockjobb och sparade task-ID, nedladdning och export av `filmed_profile.json` samt `filmed_measurement.json`. |
| `services/studio-worker/dealer-factory/dealer_factory/profile.py` | Bygger filmad profil och mätunderlag från bank och producerade tillgångar. |
| `services/studio-worker/pipelines/snabblage/lib/{inramning,ankare,gronenhet,klippkontroll,leverans}.mjs` | Separata ansvar för inpassning, ändankare, färgbehandling, kontroll och leverans. De är produktionssteg att undersöka, inte automatiskt godkända förbättringar för ett nytt försök. |
| `packages/presentation/runtime/filmed-deal-sequence.mjs` | Planerar presentation av redan serverbeslutade händelser. Matchar bland annat start/slutpose, dealer, tillgänglighet och exakt klipphash. Väljer inga kort eller spelregler. |

Ingen kod ovan kördes. Underlagets provplan A/B/C kan användas först när samma tidiga original och efterbehandlingskedja har identifierats. Den separata alternativa mallen i `extra/` är inte en annan verifierad Scoutgaming-produktionsväg.

## Poser, fack och notation

Källor: mains `packages/presentation/contracts/clip-naming.mjs:6–16` och `apps/studio/lib/clipmap/slots.mjs:41–78`.

| Notation | Start → slut | Betydelse |
|---|---|---|
| `base` / inget suffix | REDO → REDO | Mellanliggande vanlig giv. |
| `i` | VILA → REDO | Giv som går in från vila. |
| `v` | REDO → VILA | Giv som återgår till vila. |
| `iv` | VILA → VILA | Giv med både in- och utgång. |
| `transition.shoe/to-shoe` | VILA → REDO | Separat rörelse till skon. |
| `transition.shoe/from-shoe` | REDO → VILA | Separat rörelse från skon. |
| `idle.ready/` | VILA → VILA | Vilofacket, inklusive grundloop. |

**Undantag:** dolt kort har redan REDO → VILA i basversion och VILA → VILA med `i`. Vändning (`flip`) har VILA → VILA. REDO betyder handen vid skon. Namnet `idle.ready` ska inte tolkas som att vilan är REDO.

Kevin-koden använder även äldre `u/iu`. Namntolkningen accepterar dessa som utgångsnotation, men en gammal `u`-fil och en `v`-fil är inte därmed samma bytes eller samma rörelse. De granskade kontrakten belägger **inte** `I/O/IO/OI/II` som officiella rörelse-ID. JSON-filen inför därför ingen gissad översättning. Engelska orden IDLE/READY ska läsas mot källans faktiska VILA/REDO-kontrakt.

Plats 1–7 motsvarar **box0–box6**. Facken är `deal.player.left/box0–1`, `deal.player.centre/box2–4` och `deal.player.right/box5–6`. Dealerns öppna/dolda kort och vändning har egna fack. Ett fack är ett presentationsbehov; det är inte en geometrisk rektangel eller en ny spelplats.

## Fem skilda scheman i JSON

[`references/schemes.json`](../../references/schemes.json) innehåller:

| ID | Omfattning | Bevisgräns |
|---|---|---|
| `main-pose-contract` | 7 generella posövergångar | Kontrakt; inga bestämda mediefiler. |
| `main-astrid2-frozen-profile` | 35 tagningar med kortspår och tidsmetadata | Mains profil fryser i sin tur Kevin `99d6447b76d1bf472bb1e92663e13f375f27ce03`. |
| `main-paow-factory-plan` | 38 skrivbara segment ur 5 block | Planfixtur, kopierad från bankplan 2026-11-07 enligt källkommentaren. |
| `main-astrid2-factory-plan` | 38 skrivbara segment ur 10 block | Samma bevisgräns; inte en kopia av den äldre profilens tagningar. |
| `kevin-staging-astrid2-landings` | 10 landningscentrum med baslängd/landningsruta | Senare `v2/meta.json`; centrum är inte kompletta banor. |

**Blanda inte profil och fabriksplan.** Exempel: äldre profilens `1:v` är 39 rutor, medan fabriksplanens `pos1-v` omfattar `[24,87)`, alltså 63 rutor. De kan inte få samma tidsaxel eller spår utan separat verifiering. Överlappande segment i planerna är avsiktliga utsnitt ur ett block, inte en uppspelningsordning. Segment med `write:false` ingår inte i exportlistan.

## Koordinatrum

| Rum | Belagda värden | Källor och begränsning |
|---|---|---|
| Filmens bildplan | 1080 × 1920, 24 fps | Fryst Astrid-profil: kort 78 × 106, mittpunkter bland annat plats 1 `(110,1025)`, plats 4 `(540,1115)`, dealer `(540,895)`. |
| Kortspår | `q`, `p`, `body`, `paper`, `firstFrame` | Profilens värden bevaras. Fyrhörningar/polygoner är relativa till positionens centrum. `timing.offsetFrames` måste tillämpas för tagningar med inledning. |
| Senare Kevin-mätning | Exempel plats 1 `(108.5,1024.5)`, dealer `(538.6,894.5)` | `meta.json` anger kort 79 × 106 och props med bredd 78–79. Dessa mätvärden ska inte skrivas över med profilens avrundade standardvärden. |
| Bordsgrafik J3 | 2048 × 928 | `packages/presentation/contracts/table-standard.mjs`: kontur i bordspixlar, omräknad till fraktioner av bordsgrafiken. Filmens relingsrad är separat: 737 av 1920. |
| Studio-bord | Normaliserade ankare mot hela bordsgrafiken, inklusive alfamarginal | `apps/studio/lib/coordinates/table-geometry.mjs`; scenmått desktop 1920 × 1080 och mobil 1080 × 1920. Film- och bordspixlar kräver explicit transform. |
| Alternativ mall i `extra/` | Meter, Y upp; filt 0,809 m, reling 0,845 m | `extra/insperationsmall-alternativ/standard.json` och `LAS-MIG.md`; ursprung `C:/Users/jakem/Desktop/wow/blackjack-studio`. Separat källprojekt, inte verifierad Scoutgaming-kalibrering. |

Kevin `table-layout.js` beskriver dynamisk spridning utifrån antal kort och splitthänder. Dess gränser för sko/händer är inte en komplett kamera- eller handkalibrering. Mains `services/game/public/card-presentation/` innehåller ytterligare kort- och handspår för presentation; ingen sådan handmask har antagits passa labbets kandidat.

## Claude-referensernas avgränsning

De fyra jämförda kontraktsområdena — `clip-naming.mjs`, `apps/studio/lib/clipmap/slots.mjs`, `filmed-profiles/` och `filmed-deal-sequence.mjs` — är oförändrade mellan ovanstående main och båda Claude-HEAD. UI-rörelsearbetets ocommittade filer rör bland annat CSS, typsnitt, layout och `packages/ui/motion.css`; detta belägger inget nytt dealer-rörelseschema.

Den separat lästa, ocommittade filen `.worktrees/admin-varianter-1108/apps/admin/components/admin/dealer-slot-variants.mjs` hade SHA-256 `bca6eddc0003ab135abafbc6b89ba3fa44c23f55f16777dd8f14692090ad0480`. Den återinför administrativa alternativ **Slump, Regler, OpenClaw**, prioritet/villkor och flera grundloopar. Kommentaren skiljer uttryckligen dessa alternativ från den filmade givbankens posstyrda tagningar. Detta är ett lokalt arbetsutkast, inte innehåll i fryst HEAD och inte en verifierad driftsättning.

## Datakontrakt och användning

Roten är `{schemaVersion:1, schemes:[...]}`. `from/to` refererar till schemats `states[].id`. `sourceRef`, `sourcePath` och varje `evidence` anger var uppgiften kommer från. `clipKey` är källans nyckel, inte en medieadress.

`coordinateSpace` anger bildplan, enhet, origo och källa. `coordinates.points` innehåller `{id,label,x,y}`, `rects` är tom när inga rektanglar belagts. `track` är null eller bevarade kortspår med källnyckel och tidsrum. `timing` och `card` ger separat tids- respektive storleksmetadata. Inga nya spår eller skalningar är beräknade.

**Alla `assetPath`, `remoteUrl` och `calibration` är null.** Ingen av referensraderna har bundits till en exakt lokal kandidatfil. Rita därför koordinater på ett separat märkt källplan; lägg dem inte automatiskt ovanpå en vald film. Ett registrerat källfilnamn, task-ID, saknad-lista eller hash i en profil bevisar inte att filen finns här. Ny filhash kräver ny kalibrering och QA.

Kontrollen av denna leverans omfattar JSON-läsbarhet, unika schema-/övergångs-ID, giltiga tillståndsreferenser och exakt bevarande av profilerade spår/tider samt planintervall. Inga repositorytester, byggen, genereringsjobb eller molnkontroller ingick.
