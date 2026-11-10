# Namn och rörelsesträngar

Norm för ny dokumentation och synliga etiketter, beslutad med Jakob och synkad med HUVUDAGENT-3 den 2026-11-10. DL1 är implementerat för granskning i tools/dealer-motion-labels.ts med parser, serialisering och hashbunden ref-upplösning. V2-kontraktet äger rörelserna; genererade DL1-krav och nodvyn är projektioner. Detta är inte en aktiverad Scout-runtimeadapter.

## Ord och identiteter

| Begrepp | Regel |
|---|---|
| Kortmål | `P1.C2` betyder spelarplats 1, kort 2 i den aktuella handen. `D.C3` betyder dealerns tredje kort. Positiva heltal utan inledande nollor. Namnregeln sätter ingen global kortgräns. |
| C och K | C är primärt i nya etiketter. K är alias för kortnummer endast i ett identifierat källschema. Ett äldre katalogfack med C/K behöver egen tolkning. |
| Dealerhand | Fältet `hand` har värdena L, R, BOTH eller UNKNOWN och avser dealerns anatomiska hand. Kamerans spegling sparas separat. BOTH betyder samtidig användning. Ett byte L→R kräver ett fasbundet handspår. |
| Spelarhand | Motorns `handId` och kontraktets `layoutHandId` identifierar spelhand respektive layoutgren. De har annan betydelse än dealerhandens L/R. Split behöver en separat hand-/grenbindning. |
| Handling och pose | Skriv `action=REVEAL` och `pose=REDO` eller `pose=VILA` fullt. Ett ensamt R är tvetydigt. SHOE anger skon som fysisk källa, medan REDO anger en pose. |
| Fysisk kortsida | FRONT, BACK, EDGE eller UNKNOWN, relativt kameran. FRONT är kortets tryckta framsida. Synlig valör och motorns tillstånd att avslöja den är separata frågor. |
| Synlighet | VISIBLE, PARTIAL, OCCLUDED, OUT_OF_FRAME eller UNKNOWN. Separata fält för uttag och landning. Ett skymt kort behöver eget sidbevis för att få annan sida än UNKNOWN. |
| Saknat eller irrelevant | UNKNOWN betyder att fältet är relevant men saknar ett verifierat, entydigt värde i projektionen. För hand kan orsaken vara en okänd hand eller en känd sekvens som saknar konstant hand. Underlaget skiljer dessa fall. NOT_APPLICABLE används när egenskapen saknar mening för handlingen, exempelvis uttag och landning under tomhandsretur. |
| Olika ID:n | `clipSlotId` är katalogfack, `cardPlacementId` faktiskt kortmål, motion-/klipp-ID en rörelseidentitet och nod/pose en position eller övergångspunkt. SHA-256 identifierar tillgångens bytes. Behåll varje identitet separat. |

Motorn äger kort-ID, valör, regler och reveal-tillstånd. `landingSide=FRONT`, en filmsträng eller en overlayfärg ger aldrig tillstånd att visa valören. Dagens V2 använder `engine.frontAllowed`; ett framtida namn som `revealAllowed` kräver en uttrycklig adapter.

Användarspråk som ”öppet/stängt kort” måste först preciseras till fysisk sida eller motorns reveal-tillstånd. Observationsfält får endast fyllas med källhash, källruta/rutintervall, metod och granskning. Önskad rörelse och observerad rörelse lagras separat. Blå/gul overlay är författad sidpolicy tills motsvarande fysiska sida har belagts.

## DL1 och dess bundna underlag

En DL1-sträng är en deterministisk projektion av ett strukturerat beskrivningsobjekt. Objektet innehåller projektionen och bundna referenser till källschema/revision, projekt/dealer/bank, rörelse-ID, käll- och leveranshashar, poser, board-state, QA samt eventuella sid- och handspår. Granskningsobjektet är implementerat utanför V2-schemat; det ersätter inte dess rörelse- och QA-kontrakt.

Fältet `ref` identifierar objektet i ett medföljande manifest. Där binds ID:t till exakt objektsökväg och SHA-256. Samma ID får förekomma högst en gång i manifestets projektrevision. Beskrivningsobjektet anger `intent=REQUESTED|OBSERVED` och källschemats revision. Strängen måste läsas tillsammans med manifestet för att bära proveniens och mening. Exempel-ID:n nedan är hypotetiska och saknar bindning till verkliga filmer.

```text
DL1|action=<action>|target=<target>|hand=<hand>|from=<node>|to=<node>|pickupSide=<side>|landingSide=<side>|pickupVisibility=<visibility>|landingVisibility=<visibility>|ref=<id>
```

| Del | Tillåtna värden och hantering |
|---|---|
| Version och ordning | Exakt DL1 och fältordningen ovan. Alla tio fält krävs, även vid okänt värde. Inga valfria strängfält i DL1. |
| Tecken | ASCII, skiftlägeskänsligt, en rad, inga blanksteg. `\|` och `=` är avskiljare. Escape-sekvenser och URL-kodning stöds inte. |
| action | DEAL, RETURN eller REVEAL. Andra handlingar behöver en separat versionsändring. |
| target | `P<n>.C<n>`, `D.C<n>`, NONE eller UNKNOWN. `<n>` följer `[1-9][0-9]*`. DEAL/REVEAL kräver ett konkret mål. RETURN får ha ett kontextmål, NONE eller UNKNOWN. |
| hand | L, R, BOTH eller UNKNOWN. Vid UNKNOWN anger underlaget `handSummaryReason` som UNOBSERVED eller PHASE_DEPENDENT. PHASE_DEPENDENT kräver ett bundet handspår som bevarar den kända sekvensen. |
| from och to | SHOE, REDO, VILA, UNKNOWN, ett konkret kortmål eller `<kortmål>.RELEASE`. RELEASE är en etikett vars exakta källruta och ACTION_BOUNDARY binds i underlaget. |
| side | FRONT, BACK, EDGE, UNKNOWN eller NOT_APPLICABLE. |
| visibility | VISIBLE, PARTIAL, OCCLUDED, OUT_OF_FRAME, UNKNOWN eller NOT_APPLICABLE. |
| ref | `[a-z][a-z0-9.-]{0,63}`. Filvägar, externa URL:er och hemligheter hör hemma utanför detta fält. |

Semantiska regler för DL1

- DEAL anger `to=target`; pickup och landing beskriver kortets faktiska uttag respektive landning. De fyra kortfälten får använda UNKNOWN men inte NOT_APPLICABLE.
- REVEAL anger `from=target` och `to=target`. Pickup-/landingfälten beskriver här början och slutet av kortmanipulationen på platsen. En motorstyrd texturändring utan fysisk manipulation får ingen sådan filmsträng.
- RETURN betyder tomhandsretur. Samtliga fyra pickup-/landingfält ska vara NOT_APPLICABLE. Kortets kvarliggande tillstånd binds som board-state/precondition. Om from anger ett kortmåls RELEASE måste target ange samma kortmål.
- `to=VILA` anger slutpunkten. Egenskapen `returnMode=direct` kräver belagd väg från släpp till VILA med tidsbundna poser. Ändpunkterna ensamma bevisar ingen direktretur.
- RETURN-strängens target är kontext. V2 kräver `cardPlacementId=null` för returklipp. En framtida adapter ska använda separat `contextCardPlacementId` i beskrivningsobjektet och bevara V2-regeln.
- BACK→FRONT anger endast två sidvärden. En fysisk vändning kräver ett källhashbundet sidspår över hela rutintervallet med metod och synlighet. Handbyte behöver motsvarande handspår. Antal sådana spår ska inte döljas genom fler kombinationssuffix.

## Exempel och gränser

Alla giltiga strängar nedan är hypotetiska beställningar med `intent=REQUESTED`. L/R, sidor och synlighet är exempelvärden. De innebär ingen verifierad etikett eller acceptans för Pamela. Ref-ID:n måste bindas innan en sträng används operativt.

```text
DL1|action=DEAL|target=P1.C1|hand=L|from=SHOE|to=P1.C1|pickupSide=BACK|landingSide=BACK|pickupVisibility=VISIBLE|landingVisibility=VISIBLE|ref=ex01
DL1|action=DEAL|target=P7.C2|hand=R|from=SHOE|to=P7.C2|pickupSide=BACK|landingSide=BACK|pickupVisibility=PARTIAL|landingVisibility=VISIBLE|ref=ex02
DL1|action=DEAL|target=D.C3|hand=UNKNOWN|from=SHOE|to=D.C3|pickupSide=UNKNOWN|landingSide=FRONT|pickupVisibility=UNKNOWN|landingVisibility=VISIBLE|ref=ex03
DL1|action=DEAL|target=P1.C2|hand=L|from=SHOE|to=P1.C2|pickupSide=UNKNOWN|landingSide=BACK|pickupVisibility=OCCLUDED|landingVisibility=VISIBLE|ref=ex04
DL1|action=DEAL|target=P1.C2|hand=R|from=SHOE|to=P1.C2|pickupSide=BACK|landingSide=FRONT|pickupVisibility=VISIBLE|landingVisibility=VISIBLE|ref=ex05
DL1|action=RETURN|target=P1.C2|hand=L|from=P1.C2.RELEASE|to=VILA|pickupSide=NOT_APPLICABLE|landingSide=NOT_APPLICABLE|pickupVisibility=NOT_APPLICABLE|landingVisibility=NOT_APPLICABLE|ref=ex06
DL1|action=REVEAL|target=D.C1|hand=R|from=D.C1|to=D.C1|pickupSide=BACK|landingSide=FRONT|pickupVisibility=VISIBLE|landingVisibility=VISIBLE|ref=ex07
DL1|action=DEAL|target=P1.C1|hand=UNKNOWN|from=SHOE|to=P1.C1|pickupSide=BACK|landingSide=BACK|pickupVisibility=PARTIAL|landingVisibility=VISIBLE|ref=ex08
DL1|action=DEAL|target=P1.C1|hand=BOTH|from=SHOE|to=P1.C1|pickupSide=BACK|landingSide=BACK|pickupVisibility=PARTIAL|landingVisibility=VISIBLE|ref=ex09
```

- ex01/ex02 visar vänster respektive höger dealerhand. ex03 visar D.C3 utan generell gräns på tre kort.
- ex04 har dolt uttag och okänd fysisk sida. ex05 beställer fysisk BACK→FRONT-vändning och behöver ett komplett sidspår för observation/acceptans.
- ex06 beställer direkt tomhandsretur. Underlaget måste belägga den direkta vägen och kvarliggande bordskort.
- ex07 beskriver fysisk manipulation. Spelmotorns separata reveal-händelse avgör när valören får visas.
- ex08 kan avse en splitgren eller ett L→R-byte bara när respektive hand-/grenidentitet och fasbundet handspår är bundet. Dagens generella stöd för dessa fall är ej verifierat. ex09 avser samtidig användning av båda händerna.
- K-aliasexempel i ett uttryckligen identifierat V2-kortmålsschema är `P1.K2` → `P1.C2`. Original-ID:t sparas i aliasposten. `P1-K2` och `C2-P1` kräver egna, identifierade äldre scheman.
- Otillåtet exempel är `DL1|action=R|target=P1.C2|...`. R får användas som höger hand endast i handfältet. Avkortningen `...` är också ogiltig strängsyntax.

Round-trip-gränsen är `parse(serialize(projection)) = projection`. Varje giltigt exempel har tio unika fält i fast ordning och ett explicit värde per fält. Om projektionen återskapas som dessa tio strängvärden och serialiseras i samma ordning blir strängen identisk. Likheten omfattar projektionen. Återläsning av hela beskrivningsobjektet kräver det hashverifierade manifestet och dess referenser. Parser och granskningsgenerator finns i tools/dealer-motion-labels.ts; någon runtimekoppling följer inte av detta.

Parser och adapter ska avvisa fel version, fel ordning, saknade/extra/dubbla fält, tomma värden, fel skiftläge, whitespace, escape-sekvenser, otillåtna tecken, mål med noll eller inledande nollor, råa K-alias i kanonisk DL1, tvetydigt R/V, olika DEAL-mål/to, REVEAL med olika mål/from/to, RETURN med kortfält som saknar NOT_APPLICABLE samt RELEASE som pekar på annat kortmål. Strängsyntax och operativ validering är två steg. Operativ användning kräver dessutom en entydig ref-bindning, korrekt SHA-256, källschema, intent och de evidensspår handlingen behöver. Okända fält ska inte tyst tappas bort.

## Alias och stegvis migration

Varje aliaspost behöver `sourceSchema`, `sourceRevision`, `originalId`, `canonicalId`, `aliasVersion` och projekt/dealer/bank. En aliaslista får endast användas inom dess deklarerade källschema. Globala K→C-ersättningar skulle blanda ihop kortnummer och katalogfack. Originalfilnamn, task-ID:n, hashbundna manifest och råunderlag behåller sina identiteter.

| Befintlig yta | Verifierat nuläge | Föreslagen senare ändring och ansvar |
|---|---|---|
| `references/pamela-motion-contract-v2.json` | Kortmål och motion-bindningar använder K. Kandidat, ej aktivt produktionsval. | Granskningsgeneratorn projekterar identifierade V2-mål till C. Original-ID och källschema bevaras; gör ingen global K-ersättning. |
| `src/dealer-motion-contract.ts` | Skiljer katalogfack, kortmål och spelhand. RETURN kräver null i cardPlacementId. SideTrack har fysiska sidor och metod. | Huvudagenten bedömer adapter och separata kontext-, synlighets- och handspår. Ingen dokumentregel får antas vara en redan implementerad validator. |
| `references/pamela-card-side-review.json` | observedPhysicalSide är UNKNOWN; policyMethod är authored. | Behåll gränsen mellan observation och önskemål. Bind nytt sidbevis först efter ny QA. |
| `references/pamela-presentation-review.json` | C är primärt i synliga etiketter; 14/17 givmål har kandidater. | Huvudagenten håller acceptans och etiketter aktuella. |
| `docs/MASTERPLAN.md`, `docs/studio/DEALERS-OCH-PIPELINES.md` | Äldre K-exempel och historiska underlag finns kvar. | Huvudagenten länkar normen och preciserar vilka exempel som är historiska. |
| `docs/studio/KARTA.md`, ämnesingången | Hänvisning till denna norm. | Dokumentationsansvarig underhåller ingångarna. |
| tools/dealer-motion-labels.ts | Parser, serialisering och hashbunden REQUESTED-projektion finns; testfilen verifierar format och referenser. | Runtimeval, observerade handspår och fulla produktionsgrindar kräver separat verifiering. |

Inför normen först i ny förklarande text och etiketter. Lägg därefter ett schemaidentifierat adapterlager runt äldre data, verifiera projektion och referenser, och migrera konsumenter var för sig. Versionsbyte av kontrakt kräver egen QA och överenskommet skrivansvar.

## Aktuell bevisgräns och källor

Aktuella filmval och acceptans läses från references/pamela-motion-contract-v2.json, references/pamela-physical-deal-review.json och masterplanen. Den äldre kortsidegranskningens authored-policy gäller endast dess egna källor. Nyare fysisk P1-film får inte ärva äldre status, geometri eller masker. Löpande jobbstatus hör inte hemma i namnnormen. Granskningssträngar är fortsatt REQUESTED tills motsvarande observationer och QA binds uttryckligen.

Kevin/Emil-proveniens hålls separat. `kevin` och `kevin-staging` betecknar Git-grenar i `Jakeminator123/scoutgaming`, medan `kevin/croupier-scoutgg/` är en paketväg i en gren. Dokumentera gren, paket, fryst revision och dealerbank var för sig. Emils omnämnande i README belägger inte varje MP4:s ursprung. Saknad proveniens anges som okänd.

Lokala källor för reglernas tekniska gränser är [V2-typer och validering](../../src/dealer-motion-contract.ts), [V2-kandidaten](../../references/pamela-motion-contract-v2.json), [kortsidegranskningen](../../references/pamela-card-side-review.json) och [presentationsgranskningen](../../references/pamela-presentation-review.json). Äldre källrevisioner finns i [källkartan](KALLKARTA.md).
