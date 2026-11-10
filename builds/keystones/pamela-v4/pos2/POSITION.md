# pos2 — utdelningsmål plats 2

- **Verifierat namn:** `pos2` → `box1`, mål `2`, fack `deal.player.left`.
- **Målpunkt:** landning på gemensamt världskoordinerat bord; x/y/z, målyta och handkontakt är UNKNOWN.
- **Kamera:** En betraktare på plats 2 använder kameravy `seat2`, med vinkel och radie relativt den centrala `seat4`. Värdena är UNKNOWN.
- **Oberoende val:** `seat2` kan observera alla utdelningsmål. `pos2` kan ses från alla planerade kameravyer; mappnamnet väljer inte kamera.
- **Exempel:** `cameraViewpointId=seat2`, `targetPositionId=pos2` betyder att betraktare 2 ser kortet landa på plats 2. Vinkel, radie, kamera och projektion är ännu okända.
- **Källankare:** `pamela-v4-vila-4445634a5698`, dealer `pamela-pilot`, VILA; full hash och original finns i [huvudplanen](../build-plan.json).
- **Status:** planerad; inga platsbilder, klipp eller godkända VILA/REDO-par. Äldre kortspår och tillfällig UI-inpassning får inte ärvas som kalibrering.

Kontrakt: Scout `clip-naming.mjs:114–118` och `engine-signals.json:111–113`; lokalt main `d86a6b47c85f4b1341e4ffe2a7a49f08800bc544`. Se huvudplanens hashbundna evidens.
