# Systemguide och frågor till browser-GPT

**Utgå från Main som målkontrakt för Pamela och håll alternativsystemet som ett separat jämförelsespår.** Återanvänd bra källor efter granskning; att en fil finns i banken betyder inte att den ska väljas. Denna guide är beslutsunderlag, inte ett godkännande att publicera eller radera.

## Verifierade fakta att bygga vidare på

Läst lokalt 2026-11-08: Scoutgaming-roten `C:/Users/jakem/dev/scoutgaming`, remote `git@github.com:Jakeminator123/scoutgaming.git`, `main`/`origin/main` = `d86a6b47c85f4b1341e4ffe2a7a49f08800bc544`, `origin/kevin-staging` = `61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65`. Detta är lokala refs, inte en ny kontroll av remote eller drift. Kevin/Emils arbete är läsreferens.

| System | Faktiskt kontrakt | Gräns för återanvändning |
|---|---|---|
| Jakob/Main | Klippkartan räknar 24 fps. Runtime använder profilens fps och exakta tagningar. Tillgänglig fil måste matcha dealer-ID och SHA-256. | Ny Pamela-film är en egen identitet. Astrid-/Paow-profil, fabriksplan och publicerad dealerpolicy är skilda saker. |
| Kevin/Emil | Staging har egna filmer, kortspår, masker och vilorotation. Emils två lokala exempel är 24 fps. Äldre `u/iu` förstås som utgångsposer. | Posalias bevisar inte samma längd: pos1 `v=39`, `iv=63`, `u=63`, `iu=87` rutor. Emils lokala filnamn bevisar inte koppling till en aktuell publicerad profil. |
| Alternativ Göran | Projekt `e19d226c-c586-467e-b126-6a9f90e1675e`, revision 103, dealer `goran-alternativ-helkropp`. Film på bildplan i en Three.js-scen, inte en riggad kropp. | 23 tillgångar, varav 19 filmer och 18 shot-bindningar; **0/18 källshots godkända**. 10 bindningar har källkalibrering, men ingen sådan geometri har importerats till labbets rörelseschema. |

Alternativprojektets metadata anger 1920×1080, 30 fps och CFR för 18/19 filmer; det äldre huvudkli-originalet saknar dessa metadata. Detta är verifierad läsning av sparad metadata, ingen ny ffprobe eller bevis för modellens ursprungliga bildfrekvens. Projektfilens SHA-256 är `97c28d7c997366f2d01af2acfdc61febbc149e5b15cea113df302d73edff9899`. Här har 23/23 lokala bankfiler och 32/32 kopierade scenfiler hashverifierats. Hashparitet är inte visuell acceptans.

## Poser, fack och kamera

| Vanlig giv | Start → slut |
|---|---|
| `i` | VILA → REDO |
| `base` / inget suffix | REDO → REDO |
| `v` | REDO → VILA |
| `iv` | VILA → VILA |

Alla fyra givvarianterna i tabellen innehåller en utdelning. En ren VILA → REDO utan kortgivning är `transition.shoe/to-shoe`, inte `posN-i`. REDO betyder handen vid skon. `idle.ready/` är VILA → VILA trots ordet ready. Separata `to-shoe`/`from-shoe` går mellan dessa poser. Dolt kort är undantag: bas REDO → VILA, `i` VILA → VILA. Flip är VILA → VILA. I/O/IO/OI/II är inte belagda officiella rörelse-ID i de lästa kontrakten.

**Givmål och tittarplats är olika axlar.** Spelarplats 1–7 motsvarar Main `box0–box6`; dealerns öppna/dolda kort är egna fack. Alternativscenens `seat`, orbit och kamera väljer betraktarens vy. En kameraflytt skapar inte ett nytt givklipp och får inte ändra vilket serverägt kort som ges till vilken box. Filmens hand är fortfarande fotograferad från en viss vinkel; en roterad 3D-kamera ger inte automatiskt korrekt ny handgeometri.

## Tid, kortspår och skon

- Originalbildrutor, uppspelningstid och spelets händelseklocka hålls isär. Main räknar klipptid från `frames / profile.fps`, ansluter kompatibla REDO-poser och använder separata tider för kontakt, landning och fri hand. Vilo-loopens lokala varv ersätter inte bordets händelseklocka.
- Kevin-kortspår är relativa till landningscentrum i tagningens egna rutor; inledningens offset måste läggas till. En äldre handocklusionsfunktion samplar uttryckligen vid 24 fps. Alternativscenen använder presenterad videotid (`requestVideoFrameCallback`) och hash-/fpsbunden kalibrering. Tidssynk, kortspår, mask och video måste följa samma fil.
- Mainprofilens Astrid2 `1:v` är **39 rutor**, medan fabriksplanens `pos1-v` är `[24,87)` = **63 rutor**, båda vid 24 fps. Samma namn är alltså inte samma tidskontrakt. Planöverlapp är utsnitt, inte en körordning.
- Omräkning 24→30 görs via tid, inte genom att behålla rutnumret. Exempelvis ruta 22 vid 24 fps ligger vid 0,9167 s, motsvarande 27,5 vid 30 fps. Avrundning, händelsetid och maskintervall måste anges och granskas; inga gamla spår får ärvas tyst.
- Scenens skokropp är dekorativ geometri. `furniture.ts` placerar den vid `(0,60; feltTop+0,005; -0,32)` m, roterad −0,72 rad; mynningen har egen lokal position. Dessa tal bevisar inte att Pamelas fingrar träffar mynningen. Kräv sammanhängande granskning av plock, passage, hand/kort-ocklusion, bordskontakt och släpp i avsedda kameravyer. Klipp inte bort problemet.

## Urval utan radering

[clip-policy.json](../../references/clip-policy.json) är det hashbundna urvalsunderlaget. `keep` betyder bevara som källa; `reuse-candidate` betyder granska för angivet system; `hold` betyder uteslut från automatiskt val tills hindret lösts. **Ingen status aktiverar en fil.** Okända eller ändrade hashar får `hold`.

| Belagt exempel | Beslut |
|---|---|
| Huvudkli `34b51580…`, SHA `6350288c…`, märkt bildartefakt; separat kandidat `4a0e7980…`, SHA `125f3d86…` | Original `hold` som felbevis; kandidat kan granskas. Ingen ny visuell acceptans påstås. |
| Två plats3-filer: `fe2f5d97…`/SHA `4627c5dc…` är obunden; `29a98d32…`/SHA `daa8558f…` har `pos3-iv` | Första `hold`, andra kandidat. Olika bytes; obunden i snapshot betyder inte globalt oanvänd. |
| `e2c95829…`, SHA `98ac7547…`, används både för `posdealer-iv` och `hole-i` | `hold` tills öppet/dolt kort, mål, mask och spelhändelse verifierats separat. Delade bytes kan vara rätt men är inte bevisat. |
| Robotarm/high five och ny alternativ VILA-bild | `hold` tills avsedd funktion respektive ny ankarkalibrering beslutas. |
| Identiska bytes registrerade flera gånger | Dela fysisk tillgång med separata godkända bindningar. Räkna inte samma klipp två gånger i rotationsvikten. Ingen radering ingår. |

## Pamela: 30 fps betyder två olika prov

Den första Gen-4.5-piloten är rapporterad av huvudagenten: task `7c8500a7-41ee-4965-96eb-2b0614693fd6`, 1104×832, **24 fps, 121 rutor, 5,041667 s**, SHA `2f97e12b523c10fd93873fc65bd871b8c3827d1d1b68c1d44819b2cccb9d32e7`. Original: `runs/20261108210457-pamela-v4-focused/original/pamela-v4-vila-gen45-5s.mp4`. Det är inte målkontraktets godkända bildplan eller 30 fps-original.

En separat skapad jämförelsekopia `qa/pamela-v4-vila-preview-30fps.mp4` i samma run duplicerar rutor till 151 rutor/30 fps, alltså **5,033333 s**, cirka 8,333 ms kortare. Originalet behålls. 121/24 × 30 = 151,25: exakt samma totallängd och helt antal CFR-rutor går inte ihop här. Spara tids-/rutmappning och vald slutgräns. Detta provar visning och komposition, inte native-30-rörelse, nya handdetaljer eller Main-kompatibilitet. Ingen interpolerad rörelse ska presenteras som original. Kopians faktiska hash, metadata och rutmappning finns i preview30-provenance.json. Wan3 har dessutom levererat ett separat native-30-original: 1104×832, 150 rutor, 5 sekunder. Det ska inte blandas ihop med denna Gen-4.5-härledning.

Native 30 fps kräver belagt modell-/API-stöd och verifierad originalutdata. Ett API-schema utan fps-val eller ett promptord “30 fps” bevisar inte stödet. Aktuellt mandat prioriterar korrekt formaterad v4-ingång, liten Gen-4.5/Wan3-jämförelse med första/sista ruta, därefter REDO och representativ giv. Guiden utökar inte det mandatet eller kostnadsramen.

## Besvarade designfrågor och nästa prov

Browser-GPT:s svar finns i omgång 3, GRANSKNING.md §5. Arbetsordningen är pos4-iv → i/base/v → pos1/pos7; fast kamera först; behåll givets 24 fps och märk VILA-härledningar uttryckligen. Börja med rimlig inpassning till handbanan, byt källa om kontakten inte går ihop. Alternativbankens hold består. Föreslagna toleranser (cirka 2 px och 1 ruta) är ännu inte uppmätt godkända. De sex ursprungliga frågorna nedan bevaras som referens; aktuell publicering har tre konkreta filmfrågor.

1. Vilken minsta Pamelabank bör prioriteras efter VILA och REDO: en iv-giv för snabb kvalitetsgranskning, eller också en kort i→base→v-kedja för att pröva verklig anslutning? Välj vilka givmål som först fångar största hand-/skorisken; full målplatstäckning krävs fortfarande före spelacceptans.
2. Ska “alternativt 30 fps-prov” nu räcka som tydligt märkt visningskopia, eller måste jämförelsen visa native-30-original? Ange vilket extra kvalitetsbevis det senare skulle ge och vilket modellstöd som faktiskt måste verifieras.
3. Ska första accepterade scenen ha låst kamera eller ett begränsat intervall av tittarvyer? Föreslå gränser och hur sneda vyer ska avslöja bildplanets begränsningar utan att lova en riggad kropp.
4. Vilken geometri ska vara normerande i nästa prov: behållen handbana med skon exakt inpassad, eller omgenererad handbana för vald bord-/skogeometri? Rekommendera en väg och konkreta kontrollrutor för mynning, plock, släpp och ocklusion.
5. Vilka alternativa kandidater bör provas först som teknik-/rörelsereferens, och vilka bör stå kvar på `hold`? Svara per filhash/funktion; anta inte att samma personnamn, u/v-alias eller samma motiv innebär utbytbarhet.
6. Vilka mätbara toleranser ska avgöra en skarv, kortkontakt och tidsavvikelse i just denna scen? Föreslå ett litet granskningsprotokoll med både närbild och slutkomposition; dagens underlag fastställer ännu inga godkända toleranser.

## Källor för faktakontroll

- Main vid SHA ovan: `packages/presentation/contracts/clip-naming.mjs:6–16,82–90`; `apps/studio/lib/clipmap/slots.mjs:14–16,41–78`; `packages/presentation/runtime/filmed-deal-sequence.mjs:78–89`; `filmed-deal-timeline.mjs:30–58,82–114`; `idle-rotation.mjs:34–48`.
- Kevin staging vid SHA ovan: `kevin/croupier-scoutgg/public/media/dealers/astrid2/v2/meta.json` (`frames.1`); `dealer-card-tracks-astrid2.js:1–3`; `dealer-hand-occlusion.js:11–16`; `idle-chain.js:1–10,63–76`.
- Lokalt: [schemes.json](../../references/schemes.json), [alternative-bank.json](../../references/alternative-bank.json), [scenmanifest](../../references/scene-composition/manifest.json). Kopierad `source/creator/card-calibration.ts:23–55,58–100`, `source/experiments/avatar-pilot/video-source.ts:47–56`, `preview.ts:70,86` samt `source/scene/furniture.ts:73–100` under scenreferensen.

Inga nya filmer genererades, omkodades, publicerades eller visuellt godkändes vid denna policygranskning. Ingen ny runtimefunktion infördes.
