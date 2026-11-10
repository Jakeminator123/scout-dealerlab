# Karta över studion och underlaget

Detta är en ämnesingång, inte en löpande provjournal. Aktuell arbetsordning och acceptans finns i [masterplanen](../MASTERPLAN.md); aktuellt agentägarskap i `references/agent-roles.json`. En gammal rapport, mapp eller fil med ordet ”aktuell” blir inte en aktiv källa genom sitt namn.

## Samma kontrakt, flera vyer

| Ansvar | Aktiv källa eller ingång |
|---|---|
| Identitet | `references/dealers.json`; projekt, dealer-ID och filhash. |
| Rörelser, tillgångar, ankare och QA | `references/pamela-motion-contract-v2.json` och `src/dealer-motion-contract.ts`. V1 bevaras som migrationsreferens. |
| DL1-format | [Namn och rörelsesträngar](NAMN-OCH-RORELSESTRANGAR.md). |
| Genererade DL1-krav | `tools/dealer-motion-labels.ts` → `references/pamela-motion-labels-review.json`. REQUESTED är inte observerad rörelse. |
| Visuell nodkarta | `src/dealer-node-review.ts` och motsvarande page/client; [publik vy](https://scout-dealerlab.vercel.app/nodkarta). |
| Nya fysiska filmprov | `references/pamela-physical-deal-review.json`; äldre returprov har separat historisk pekare. |
| Återbrukskandidater | `references/pamela-reuse-review.json`; källbundna filmer, lager, koordinater och uttrycklig QA-gräns. |
| Geometri och inpassning | [Källkarta](KALLKARTA.md), `references/pamela-stage-contract.json` och källbundna kalibrerings-/QA-manifest. |
| Samlad publik granskning | [Granskningssidan](https://scout-dealerlab.vercel.app/granskning.html); `latest.json` anger verkligt publicerad snapshot. |

Nodkartan har samma rörelser och strängkrav som kontraktsunderlaget. Historisk graf med 205 objekt/281 relationer är en separat katalogreferens. Ingen av dessa vyer är inkopplad i Scoutmotorn. Katalogfack, kortmål, fysisk kortsida och tillåtelse att visa valör ska hållas isär.

## Filmväg och kortlayout

Varje korts släppunkt ska ha två möjligheter: direkt VILA med kvarliggande bordskort, eller en godkänd fortsättning via REDO. REDO är gemensam skarv när exempelvis bara P1 och P4 ska få kort; oanvända platser spelas inte. Ett långt original kan bidra med flera exakta rutintervall, men varje skarv och direktretur måste ha eget bevis.

Kortens centrum och rotation i bordsplanet hör till samma versionsbundna layout. Mobil/desktop ändrar hela kompositionens kamera/utsnitt, inte varje korts fysiska landning. Kalibrerade bildkoordinater är inte automatiskt 3D-koordinater. Öppen givning kräver verklig BACK→EDGE→FRONT-rörelse; en overlay eller ett färgbyte skapar inte vändningen.

## Ämnen som läses vid behov

| Fråga | Ingång |
|---|---|
| Identiteter, systemkedja och Scout-gräns | [Dealers och pipelines](DEALERS-OCH-PIPELINES.md) |
| Format, bildrutor och kvalitetsgränser | [Format och kvalitet](../granskning/FORMAT-OCH-KVALITET.md), [Keystone](../granskning/KEYSTONE.md) |
| Terminologi | `references/terminology.json` → [genererad ordlista](../terminologi.txt) |
| Lokal server och dokumentversioner | [Arbetssätt](../drift/ARBETSSATT.md) |
| Arkiv, material och publicering | [Provisorisk struktur](../drift/PROVISORISK-STRUKTUR.md), [Delning och cache](../drift/DELNING-OCH-CACHE.md) |
| Separat alternativ 3D-scen | [Alternativ 3D](ALTERNATIV-3D.md) |
| Lokal scen-/adminprototyp | [Adminprototyp](ADMIN-PROTOTYP.md) |

## Historiska prov och bevarade källor

R16, äldre `/pamela-prov?view=...`, `pamela-loop`, `pamela-bank` och `pamela-combined` är material-/UI-prov med egna begränsningar. De får bidra med verifierade tillgångar, men är inte parallella auktoriteter för den nya banken. Den historiska [långfilmen](https://scout-dealerlab.vercel.app/granskning.html#filmer) har 14 spelarkort och en kapitellinje; den saknar dealerns tre kort och godkänd fysisk vändning för hela serien.

### Vad GPT-mappen är

`gpt-underlag/` och `extra/` bevarar användarens källor, samtal, bilder och frysta kodutdrag. Läs rätt källa när en sakfråga kräver den. Kör inte gamla startfiler eller inför gamla instruktioner automatiskt. Tidigare ingångars fulltext är hashbevarad i `.runtime/archive/huvudagent-3-node-map-20261110/manifest.json` och enligt dokumentens versionsrutin. Exakta äldre provvägar kan hämtas där utan att hela historiken laddas vid agentstart.

Aktiv export ska i nästa förenklingssteg byggas ur uttryckligen valda beroenden. Nuvarande publiceringskopia är fortfarande bred och innehåller ärvd historik; original, QA och fungerande historiklänkar får inte raderas för att få ett lägre filantal.
