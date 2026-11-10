# Webbvy för Dealer Map

`web/index.html` visar samma normaliserade, versionsbundna kartdata som Python-programmet. Källkontrakten är auktoritet; denna HTML-fil är en läsvy. Den skapar inga nya rörelser, ändrar ingen QA och startar inga genereringsjobb.

## Innehåll

- Rörelsekarta med kontraktets VILA/REDO-vägar och separat märkt direktreturkrav.
- Produktfack, posevarianter och valda handlingar.
- 17 givmål med notation som `P2.K2`, samt uttryckligt okända målkoordinater.
- Separata referensscheman och deras ursprung.
- Granskningsstatus, spårbarhet och läsning av publika Issue-kommentarer.
- Sökning, kategorifilter, detaljpanel och kopierbart granskningsunderlag.

Grafens layout och bordets positioner är schematiska. De är inte uppmätta mediekoordinater. Källrutor för råfilm tillämpas aldrig automatiskt på en separat granskningsfilm.

## Köra webbversionen

Exportera webbpaketet från Python-programmet. Paketet består av `index.html` och `dealer-map.json`. Det har inga CDN- eller byggverktygsberoenden.

För lokal webbläsarvisning kan paketmappen serveras med Python:

```text
python -m http.server 8107 --bind 127.0.0.1
```

Öppna sedan `http://127.0.0.1:8107`. Direkt öppning av HTML-filen fungerar också när en normaliserad kartfil väljs med **Öppna kartfil**. Webbläsare tillåter normalt inte automatisk JSON-hämtning från `file:`.

## Uppdatering

När fliken är synlig kontrollerar webbversionen sin exporterade JSON var 60:e sekund. Endast en ny deklarerad källversion byts in automatiskt. Versionsnyckeln omfattar commit, snapshot, granskningsmanifestets hash, publicerings-/paritetsstatus, inventariehash och de individuella källhasharna när de finns. Därmed kan även en ändrad lokal arbetskopia ha en annan källversion trots samma Git-HEAD.

En manuellt importerad JSON-fil pausar automatisk webbhämtning. **Uppdatera** hämtar däremot uttryckligen webbexporten igen. Vid nätverksfel behålls den redan inlästa kartan.

## Koppling till Python-fönstret

Tre läs-/uppdateringsfunktioner är tillgängliga för den inbyggda webbvyn:

- `window.dealerMapReload(manual=true)`: hämta aktuell JSON och bevara filter och val. Använd `false` för automatisk omladdning; den respekterar manuellt importerad kartfil.
- `window.dealerMapSelection()`: `{actionId, slotId, placementId, action}`.
- `window.dealerMapModel()`: det normaliserade kartobjekt som faktiskt visas.

Inga tokens skickas till JavaScript. Issue-inlägg görs via programmets separata, uttryckliga överlämning eller genom att användaren öppnar GitHub. Webbversionens kommentarsläsning använder publikt GitHub-API och visar ett begripligt fel vid anropsbegränsning.

## Fristående offlineförhandsvisning

En separat förhandsvisningsfil kan bära sin normaliserade metadata i:

```html
<script type="application/json" id="embedded-map">…</script>
```

Den inbäddade kartan används **bara när HTML-filen öppnas lokalt via `file:`**. Den märks OFFLINE, automatisk hämtning stängs av och alla fem vyer fungerar utan en Python-installation eller JSON-fil bredvid. Filmer och GitHub-länkar kräver fortfarande nätåtkomst. Knappen **Öppna kartfil** kan ersätta underlaget med en ny normaliserad JSON.

På HTTP/HTTPS ignoreras inbäddad data; den vanliga webbexporten fortsätter läsa `dealer-map.json`. Webbexportens tvåfilsformat ändras alltså inte. Vid skapandet av offlinefilen ska metadata först passera `public_model`, och tecknet `<` måste JSON-escapas till `\u003c` innan innehållet placeras i script-elementet.

Qt WebEngine-testet verifierade filöppning, samtliga fem vyer, avstängd automatisk hämtning och **0 fetch-anrop** under offlinevisning. Samma HTML serverad över HTTP ignorerade inbäddad data och hämtade normalt `./dealer-map.json`.

## Verifiering

JavaScript-syntax och funktionella kontroller har körts mot verklig normaliserad projektdata: alla fem vyer, 36 fack, 19 handlingar, 17 givmål, sökning/filter, källversionbyte, bevarad version vid saknad proveniens, separata mediereferenser och säker återgivning av text/URL:er.

Det inbyggda PySide6/Qt WebEngine-fönstret har också startats och granskats visuellt i Linux byggmiljö. Tretton körda UI-kontroller passerade, inklusive alla fem flikar, sökning efter P2.K2, fackval, D.K3:s saknade geometri, JSON-import, skydd mot automatisk överskrivning och ny granskningsproveniens under samma Git-commit. Desktopvyn har ingen horisontell överströmning och visar hela direktreturkravet. Kontrollen använde lokal testdata för versionsbytet och inga externa navigationer eller Issue-inlägg. Windows-uppspelning och dess codecs behöver verifieras på användarens dator.
