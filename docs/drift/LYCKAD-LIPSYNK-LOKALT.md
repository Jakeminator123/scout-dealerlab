# LYCKAD LIPSYNK LOKALT – Maud delar till box fyra

Verifierat 2026-11-08 på Jakobs Windows-dator, WSL Ubuntu och NVIDIA RTX 3060 med 12 GB VRAM.

**Lyckat tekniskt prov:** Maud säger ”Jakob är kung” samtidigt som hon rör huvudet och delar ett kort till box fyra. En färdig film och separata strömmade munpaket finns. **Direkt läppsynk under spel är inte färdigverifierad:** den varma motorn nådde 13,8 munrutor/s, under filmens 24 fps och produktionsworkerns gräns på 30 rutor/s. Slutlig visuell acceptans är fortfarande obesvarad. **Uppdatering 2026-11-09:** tre separata RunPod-prov med varm RTX 4090 lyckades i webbläsaren: 5,52–5,73 s till talstart och inga saknade munrutor. Se molnmätningen nedan; den är inte en verifiering av OpenClaw eller produktionens serverless-kö.

## Testa själv

[Mauds lokala testyta](MAUD-TESTYTA.md) på `http://127.0.0.1:4318/maud-test` kopplar nu OpenAI → ElevenLabs → samma rörliga Maud-film. Slutligt direktprov: 5,782 s till talstart; prov vid nästa filmvarv: 8,299 s inklusive 2,395 s köväntan. Båda utan saknade munrutor eller tappade videorutor. Tidiga startavvikelser, avbrott, testgränser och råkvitton är dokumenterade i guiden. Ingen ny språkmodell eller dealerunik 20-GB-image behövs. OpenClaw och full filmkö återstår. Testets GPU är avstängd; preview stängs med `STOPP.cmd`.

## Resultatet och hur lång tid det tog

[Spela provfilmen](../../runs/maud-box4-jakob-20261108-01/maud-box4-jakob-ar-kung-review.mp4) · [Originalet](../../runs/maud-box4-jakob-20261108-01/maud-box4-source.mp4) · [Ansiktsjämförelse, original överst](../../runs/maud-box4-jakob-20261108-01/face-review-comparison.jpg)

| Mätt steg | Tid | Vad mätningen omfattar |
|---|---:|---|
| Förbereda ett nytt källklipp | **63,854 s** | Container-/processstart, ansiktsspårning, masker, bildrepresentationer och färgkorrigering. 63/63 ansikten hittades. Inre förberedarens egen timer: 44,4 s. |
| Skapa rösten | **1,225 s** | Ett ElevenLabs-anrop, 13 tecken, 1,439625 s ljud. Providern rapporterade 10 krediter. |
| Skapa färdig provfilm från befintlig förberedelse | **68,148 s** | Kall process, modelladdning, ljudanalys, muninferens, blandning, kodning samt extra jämförelsefilm. |
| Därav rå muninferens i filmprovet | **4,19 s** | 52 munrutor, 12,4 rutor/s. Inte hela exporten. |
| Skapa munpaket med uppvärmd strömmotor | **3,770 s** | Samma replik, 52 munrutor i fem H.264-paket; 13,8 rutor/s. Ljudet fanns redan. Ingen färdig helfilms-MP4 eller nätöverföring till webbläsare ingår. |
| Första munpaketet, varm motor | **1,053 s** | Från motorns replikanrop. Exkluderar TTS, modellstart och väntan hos RunPod. |
| Starta och värma strömmotorn | **61,3 s** | Modell, avatar och två interna uppvärmnings-/mätkörningar enligt motorns logg. Separat benchmarkprocess tog totalt 95,371 s inklusive start och mätning. |

För en helt ny film motsvarar förberedelse + TTS + kall export **cirka 133 sekunders summerat körarbete**, ungefär 2 minuter 13 sekunder. Installation, hämtning av stödmodeller, manuella mellanrum, granskning och felsökning ingår inte. Det är inte ett uppmätt sammanhängande 133-sekundersanrop.

Förberedelsen återanvänds för nya repliker över **exakt samma källfilm**. Ändrad film/hash kräver ny förberedelse och QA. 68,148 s och 3,770 s kommer från olika utmatningsvägar; skillnaden får inte beskrivas som en uppmätt procentuell optimering av samma MP4-export.

Tidsunderlag: [result.json](../../runs/maud-box4-jakob-20261108-01/result.json), [TTS-tid](../../runs/maud-box4-jakob-20261108-01/tts-audio.json), [strömmotorns logg](../../runs/maud-box4-jakob-20261108-01/benchmark.log), [beslut](../../runs/maud-box4-jakob-20261108-01/decision.json).

## RunPod med varm Maud-cache – mätt 2026-11-09

**3/3 korta uppspelningar lyckades utan saknade munrutor eller tappade videorutor.** Samma film, förberedda bank och pinnade worker-image kördes på en tillfällig RTX 4090 i Jakobs konto, EUR-IS-2. Detta är den oförändrade serverless-handlern i SDK:s API-läge på en vanlig pod. RunPods serverless-kö, produktionens endpoint och OpenClaws textgenerering ingår inte i mätningen.

| Mätt | Ny TTS | Återanvänt ljud 1 | Återanvänt ljud 2 |
|---|---:|---:|---:|
| Färdig text → beräknad hörbar talstart | **5,726 s** | **5,626 s** | **5,523 s** |
| TTS inklusive lokal PCM-konvertering | 0,811 s | 0 s | 0 s |
| Färdig text → första munpaket i webbläsaren | 5,457 s | 5,351 s | 5,265 s |
| Själva genereringen av 52 munrutor | 1,211 s | 1,115 s | 1,104 s |
| Genereringstakt | 42,9 fps | 46,6 fps | 47,1 fps |
| Mottagna munrutor | 52/52 | 52/52 | 52/52 |
| Saknade munrutor / tappade videorutor | 0 / 0 | 0 / 0 | 0 / 0 |
| Största uppmätta avvikelse mellan ljud- och videoklocka | 8,39 ms | 8,32 ms | 8,38 ms |

Talstart beräknas från webbläsarens `AudioContext.getOutputTimestamp()` och ljudets RMS-onset. Ingen mikrofon mätte högtalarutgången. Filmens 24-fps-tidslinje styr varje hashbundet munlager; startbufferten var 12 munrutor, tyst försprång 220 ms. Bildrutornas största presentationsintervall var 50,1–50,2 ms på denna skärm. Detta stöder jämn uppspelning i de tre korta proven, inte långtidslast eller slutlig bedömning av fonem/utseende. Visuell acceptans är fortfarande **false**.

### Varför tar starten ändå omkring 5,6 sekunder?

Alla tre körningar rapporterar **modelCache: hit**. Trots det gör dagens worker om två steg för varje replik:

- Modellfilernas innehållskontroll: **2,912–2,932 s**.
- Ett nytt syntetiskt hastighetstest: **1,616–1,639 s**.

Dessa steg tar tillsammans cirka **4,54 s** per svar. TTS kördes samtidigt: ljudet var klart 1,045 s efter texten, medan workern blev redo efter 4,855 s. Att återanvända ljudet tog därför inte bort huvuddelen av startväntan. Ljudberoende muninferens börjar först när PCM finns och workern är redo.

**Nästa optimering:** pröva att behålla verifieringen för oförändrade, pinnade modellfiler under workerns livstid och återanvända en giltig hastighetsmätning för samma varma bank. Ny image, ändrade filer, ny bank eller fel ska utlösa relevanta kontroller igen. Dessa kontroller har inte stängts av i provet. **1–2 sekunders talstart är ett arbetsmål/skattning**, inte ett uppmätt resultat; en separat A/B-mätning behövs. Fler workers angriper samtidighet/kö, inte denna upprepade väntan.

### Reproducerbarhet, kostnad och avslut

- Verktyg: `tools/runpod-pilot.ts`, `tools/runpod-pilot/relay.ts`, `player.ts`, `bootstrap.ts` och `summarize.ts`. Körningen använder en privat lokal nyckelkälla; inga provider-nycklar skickas till testpodden eller webbläsaren.
- Körmapp: `runs/maud-runpod-warm-20261109-04/`. [Mätkvitto](../../runs/maud-runpod-warm-20261109-04/summary.json), [webbläsarbevis](../../runs/maud-runpod-warm-20261109-04/browser-proof.png), [avslutad pod](../../runs/maud-runpod-warm-20261109-04/cleanup.json). Rå H.264-paket, bildrutekartor, ljud och varje delmätning är bevarade. Ingen ny helfilms-MP4 renderades av molnpaketen.
- Röst: samma Maud/Sanna-röst, `ELEVENLABS_SCOUT_API_KEY`, `eleven_multilingual_v2`, seed 20261108. Ett nytt TTS-anrop kostade **10 krediter**. De två följande proven återanvände detta ljud. Alla tre har PCM-SHA-256 `4f67deea0b6292e5ec35e79c55a996f9c7fca2840a9b7aae79309dd347048d10`.
- Kall infrastrukturstart: **309,6 s**, därefter **36,1 s** för första kompletta uppvärmningsjobbet. Dessa tider ingår inte i den varma talstarten ovan.
- Tre tidigare infrastrukturförsök är bevarade: imagehämtning hann inte klart, extern WebSocket-anslutning misslyckades, respektive banköverföring avvisades. Ingen ny TTS eller GPU-läppsynk utfördes där. Det lyckade försöket krävde två fungerande anropsvägar före uppladdning; `/logs` gav först 404 och sedan 200 efter 4,3 s. Exakt orsak hos proxyn är inte fastställd. Lokal transport, hashkontroll och TLS verifierades separat utan GPU.
- **Samlad uppskattad övre GPU-kostnad: 0,419 USD** för samtliga fyra försök, inom provramen 1 USD. Beräknat från reserverad tid och angiven timkostnad inklusive diskpåslag; inte en fakturaverifiering. Det lyckade försöket står för cirka 0,102 USD.
- Alla fyra egna testpoddar avslutades och gav därefter HTTP 404. Testservern på 4322 stoppades via `POST /shutdown`; processens exit och frigjorda portar 4322–4324 verifierades. CPU-testcontainern är avslutad, testfliken stängd. Studion på 4318, andra projekt, källmedia och de två stora images lämnades kvar.

Kötestet är beskrivet i [TESTA-KOAD-LAPPSYNK.md](TESTA-KOAD-LAPPSYNK.md) och är **inte genomfört**. Inga produktionsinställningar ändrades.


## Identitet och bevarat material

| Del | Värde |
|---|---|
| Arbetsyta | `C:/Users/jakem/dev/super-feature-sg/snyggare-dealer` |
| Körmapp | `runs/maud-box4-jakob-20261108-01/` |
| Referenskod | `Jakeminator123/scoutgaming`, läst SHA `d86a6b47c85f4b1341e4ffe2a7a49f08800bc544` |
| Dealer och tagning | `maud`, `4:v`, media-ID `e33b05ad-d036-504f-bb29-bca987458da2` |
| Box | Etikett ”Maud · pos4-v”, intern situation `box3`. Dealer Factory räknar `int(target)-1`; detta är box fyra i mänsklig numrering. |
| Källfilm | H.264, 1080×1920, 24 fps, 63 bildrutor, 2,625 s, inget originalljud. |
| Källa | Scoutgamings produktionsregister och privata Blob-lager `scoutgaming-main-media`, `store_2JzgrF9f6fNlHVTZ`. Endast läsning. |
| Källa SHA-256 | `ccdf1d9dce39b833bb4570200db4ac11c3d6e31e31a90ca728048c9ad8b31d89` |
| Granskningsfilm SHA-256 | `7d462aed182fc6094fa66eed1123fe92c671616b375345d4ce184f5274c908c6` |
| GPU-image | `sha256:92b7562c35abaf1031d89f787ac5a167568476920a2cc181af0b4cd54ccf4247` |
| Röst | ElevenLabs `Maud (Sanna, sv)`, ID `aSLKtNoVBZlxQEMsnGL2`, modell `eleven_multilingual_v2` |
| Röstnyckel | Servervariabel `ELEVENLABS_SCOUT_API_KEY` i labbets privata `.env.local`. Nyckelvärdet ingår inte i dokument eller körmanifest. |

[Registerpost och proveniens](../../runs/maud-box4-jakob-20261108-01/source-record.json) binder dealer, tagning, databasrevision, Blob-sökväg, filstorlek och hash. Mauds äldre femsekunders viloklipp/bank användes inte som ersättning för givklippet.

## Nuvarande implementation

Detta är en lokal, avgränsad användning av Scoutgamings befintliga MuseTalk-baserade renderer, inte en ny språkmodell och inte en installerad livefunktion i labbet.

1. **Hämta rätt film:** [tools/maud-box4-pilot.ts](../../tools/maud-box4-pilot.ts) läser uttryckligen labbets `.env.local`, hämtar det verifierade privata Blob-objektet och kontrollerar hash och byteantal. Referensprojektets env läses inte automatiskt.
2. **Skapa tal:** samma TypeScript-verktygs steg `tts` gör ett enda ElevenLabs-anrop med texten ”Jakob är kung”, rätt Maud-röst och fast seed. Försöket sparas före anropet och request-ID sparas efter svar. Inga automatiska TTS-omförsök. MP3 konverterades till PCM WAV, 24 kHz mono, 16 bit.
3. **Förbered varje originalruta:** den oförändrade `vendor/rorlig.py forbered` i den befintliga imagen använder MediaPipe och MuseTalk för ansiktsposition, blandningsmask, VAE-latent och färgkorrigering. Resultaten ligger i `prep/work/maud-box4-source/`.
4. **Rendera film:** `vendor/rorlig.py rendera` får källvideo, WAV, `--start 0` och `--jamfor`. Den skapar munbilder från det verkliga ljudet och blandar dem i de motsvarande originalrutorna. Receptet använder 24 fps, FP16, batch 16 och ansiktsmodellens 256×256-rutor; kroppen/kortgivningen kommer från originalfilmen.
5. **Bevara färgvisningen:** rå utdata finns kvar. En separat `*-review.mp4` skapades med stream copy där färgmetadata återställdes till källans ospecificerade värden. Renderarens explicita BT.709-tagg ändrade annars den synliga grundfärgen i jämförelsearket. Ingen ny bild-/ljudkodning gjordes i detta steg. Detta är ett dokumenterat källspecifikt steg, ingen generell färgpolicy för alla filmer.
6. **Mät verkliga munpaket:** verktygets `bank`-steg kopierar källfilm och förberedelse till `avatars/maud/` med exakt rutkarta. Den lokala banken är en fristående mätbank, inte en signerad/publicerad produktionsbank. `vendor/motor.py` värmer modellen två gånger och genererar sedan repliken med kartan `[["clip-e33b05ad-d036-504f-bb29-bca987458da2",0,52]]`. Fem paket och deras rut-/rektangelmetadata finns i `stream/`.
7. **QA:** verktygets `qa`-steg kontrollerar upplösning, fps, 63 rutor, ljud-/bildlängd, filhash och ljudplacering. Uppmätt ljudstart är 220 ms efter videostart, enligt renderarens recept, med vågformskorrelation 0,99998. Det bevisar ljudets placering, inte att varje fonem visuellt är perfekt synkat.

Alla GPU-körningar använde fyra CPU-kärnor och högst 10 GB container-RAM. Beräkningscontainrarna körde utan nätverk och utan API-nycklar. En separat paketinstallation hade nätåtkomst för de hashbundna beroendena. Ingen moln-GPU användes.

### Det som behövde kompletteras lokalt

Imagen från 6 november saknade `preprocessing_mp` och MediaPipe för nya filmer. Den byggdes inte om och ersattes inte. Ett lokalt överlägg lades i körmappen:

- Oförändrad `preprocessing_mp.py` och låsfiler från den angivna Scoutgaming-revisionen.
- `absl-py 2.3.1`, `flatbuffers 25.9.23`, `mediapipe 0.10.31`, `sounddevice 0.5.3`.
- Tre hashkontrollerade förberedelsemodeller, totalt **103 878 630 byte**, enligt [prep-support.json](../../runs/maud-box4-jakob-20261108-01/prep-support.json).
- Det fungerande paketmålet heter `deps-root/`; `PYTHONPATH=/work/deps-root:/work/support`. Stödmodellernas kataloger monterades läsbart under `/workspace/MuseTalk/models/`.
- Förberedelseutdata styrs med `PREP=/work/prep`. `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS` och `MKL_NUM_THREADS` sattes till 4. Originalkodens laddning använde `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1`.
- För strömmätningen användes `AVATAR_DIR=/work/avatars`, `PYTHONPATH=/opt/moving-worker`, `TRADAR=4`. Oförändrade standardvärden var 12 rutor per munpaket och 30 rutor/s som livegräns.

Den första förberedelsen saknade modulen. Den första paketinstallationen misslyckades vid kopiering av Windows-filmetadata som containeranvändaren; ett separat mål med root inne i containern fungerade. Försöken och loggarna är bevarade. De två cirka 20 GB stora images är också bevarade; de behövde inte båda laddas eller byggas om för detta prov.

### Återanvändning

TypeScript-verktyget har stegen `source`, `tts`, `prep-support`, `bank`, `benchmark` och `qa`. Det är bundet till denna provmapp och vägrar skriva över tidigare originalresultat. Förberedelse och filmexport kördes separat via Docker; verktyget är inte en fullständig generell startknapp för hela kedjan.

Nästa försök ska få en ny körmapp och egna containernamn. Återanvänd ljudet och hashbunden förberedelse när deras innehåll är oförändrat. Ny TTS-generering behövs inte för att spela eller jämföra det här resultatet. Se [konton, MCP och gemensam endpoint](RUNPOD-OCH-LAPPSYNK.md) för driftkopplingar.

## Optimering: vad som är belagt och vad som återstår att mäta

**Bedömning:** att förberäkna ansiktet per videoruta och sedan generera munnen från ljudet är en rimlig arkitektur för detta krav. MuseTalk dokumenterar själv förberedelse en gång och återanvändning för nya ljud. Det gör inte just denna implementation till bevisad ”best practice” eller snabbast möjliga lösning. Projektets publicerade realtidsresultat gäller en V100 och kan inte överföras direkt till RTX 3060. [MuseTalks officiella README](https://github.com/TMElyralab/MuseTalk#inference)

| Prioritet | Åtgärd | Förväntad effekt och bevisgräns |
|---|---|---|
| 1 | Behåll modell, bank och uppvärmning laddade under spel | Undviker omstart för varje svar. Den varma mätningen visar att munpaketen kan skapas på sekunder. En lika varm helfilms-MP4-export har inte mätts. |
| 2 | Återanvänd exakt samma films förberedelse | De cirka 64 sekunderna ska inte betalas per ny replik. Masker och latenter finns redan. Bytt källhash kräver ny förberedelse. |
| 3 | Strömma munpaket och ljud med gemensam tidslinje | Spel behöver inte vänta på en komplett helfilms-export eller koda en jämförelsefilm. Vår strömmätning använder redan munpaket; bytet löser därför inte ensamt dess 13,8 fps. En kort buffert kan dölja en del starttid men ökar fördröjningen och löser inte långvarigt för låg takt. |
| 4 | Profilera och prova batchstorlek, `torch.compile` och minneslayout | Kan påverka GPU-tid och första paketet. Mindre batch kan minska väntan men sänka genomströmningen. Kompilering kan ge extra starttid/minne. **Ingen hastighetsvinst är mätt här.** FP16 används redan. |
| 5 | Jämför samma bank/ljud på starkare RunPod-GPU | Mest direkt sätt att pröva större beräkningsmarginal. Exakt fart och kostnad måste mätas; välj inte bara störst VRAM. Genomfört på RTX 4090 enligt molnmätningen ovan. |
| 6 | Separera gemensam modell från dealerbankernas cache | Dagens cache stänger motorn vid dealer-/bankbyte. En gemensam endpoint behöver även ändrad session/dränering så att en dealers avstängning inte stoppar andra. Ingen sådan ombyggnad är genomförd. |

PyTorch beskriver kompilering för att slå ihop beräkningar och `channels_last` för vissa bildmodeller. Det är underlag för ett avgränsat A/B-prov, ingen garanti för MuseTalks pinnade miljö. [PyTorch Performance Tuning Guide](https://docs.pytorch.org/tutorials/recipes/recipes/tuning_guide.html)

RunPod kan hålla aktiva workers varma, vilket minskar kallstarter men debiteras även mellan jobb. Endpointens uppstart och modellens dealerbyte är skilda frågor; en varm container garanterar inte att rätt bank ligger laddad. [RunPod endpoint-inställningar](https://docs.runpod.io/serverless/endpoints/endpoint-configurations)

**Beräknat från mätningen:** 24/13,8 ≈ 1,74, alltså cirka **74 % högre takt** krävs för att matcha filmens 24 fps. För nuvarande 30-fps-gräns behövs cirka **117 % högre takt** (2,17×). Detta är ett beräknat behov, inte en utlovad optimeringsvinst.

Nästa rimliga jämförelse är samma källhash och ljudhash, förvärmd modell, en ändring åt gången, mätning av första paket/uthållig takt/minne och granskning av samma huvudrörelser. Nyckeländringar kan inte i sig fördubbla beräkningshastigheten.

## Avgränsning och status

- Genomfört: rörlig lokal provfilm, Mauds röst, alla originalrutor bevarade, sparade munpaket, verifierade hashvärden och avgränsade tidsmätningar.
- Inte verifierat: OpenClaw till tal/munlager i labbet, flera samtidiga dealers, gemensam produktionsendpoint eller slutlig visuell acceptans.
- Alla åtta taskägda testcontainrar avslutades efter provet. Originalmedia, stödmaterial, loggar och båda images bevarades. Ingen ny server eller bakgrundsloop startas av denna dokumentation.
- ”Testjobben har avslutats” beskriver datorns processer. Det betyder inte att samtalet ska stängas, att projektet är färdigt eller att fortsatt arbete stoppas.

Källfiler och råmätningar ovan är facit. Detta dokument beskriver den lyckade lokala demonstrationen och dess begränsningar; det ersätter inte visuell QA eller en framtida liveacceptans.

