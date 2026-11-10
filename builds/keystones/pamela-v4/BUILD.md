# Pamela V4 — underlag för framtida platsvyer

**Status: förberedelse klar; 0 nya vinklar eller filmer genererade. Kalibrering: UNKNOWN.**

- `original/pamela-vila-focused-v4.png` är en byteidentisk kopia av källkandidaten, 1536 × 1024. SHA-256: `4445634a5698da4121ad40bd7fcef76c8b8b8707c6fc24a87d095ad98348e5a7`. Originalet i `runs/` är orört.
- `provenance.json` binder projektet `snyggare-dealer`, dealern `pamela-pilot` och exakt filhash till bevarad prompt och jobbmetadata.
- `build-plan.json` är huvudplanen. Okända mätvärden är `null` och status `UNKNOWN`; planen har ingen runtime-bindning.

## Två oberoende val

| Val | Betydelse | Exempel |
|---|---|---|
| `cameraViewpointId` | Var betraktaren/kameran sitter | `seat2` |
| `targetPositionId` | Var kortet delas ut | `pos4` = `box3` |

Mapparna `pos1/`–`pos7/` är **utdelningsmål**, enligt Scouts verifierade namnkontrakt. De är inte sju genererade kameraperspektiv. En betraktare på plats 2 ska kunna se utdelning till alla relevanta mål, från en vinkel och radie relativt mittplats 4. Exakta vinklar, radier, kamerahöjder och blickpunkter är okända.

Alla vyer måste använda ett gemensamt bord i världskoordinater och samma verkliga landningspunkter. Samma punkt får olika bildkoordinater från olika kameror. Scouts skärmkoordinater och frysta Astrid2-spår är inte 3D-mått för Pamela.

## Nästa steg

Lås bord/version, kalibrera mittvyn och bildens koppling till den, mät vald sidovy och målpunkt, säkra VILA/REDO samt händer/sko/kort. Välj därefter en uttrycklig kombination av vy och mål för ett begränsat prov. Ingen komplett 7 × 7-bank är beställd av denna plan.

Den bevarade V4-bilden bevisar inte kalibrerad `seat4`. Provisorisk UI-inpassning, promptens önskade proportioner och äldre bankvärden är inte mätdata. Separata vinklar kräver eget källunderlag och QA; bilden ska inte kopieras eller speglas till falska platsbilder.

## Återanvändning

`templates/build-plan.template.json` är en bildfri mall för nästa keystone. Fyll ny projekt-/dealeridentitet, källfil, hash, mått och proveniens; mät dess egen geometri. Återanvänd struktur och verifierad namngivning, inte Pamelas identitet, tillgångar eller kalibrering. Originalkopian finns bara i `original/`; positionsmapparna innehåller anteckningar.
