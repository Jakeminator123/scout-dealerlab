# Nästa prov: läppsynk på en köad Maud-film

**Enkel kö med samma klipp genomförd; två olika filmer återstår.** [Mauds testyta](MAUD-TESTYTA.md) spelar originalet under förberedelsen och kan vänta på nästa filmvarv. Slutprovet gav 8,299 s till talstart inklusive 2,395 s väntan på filmstart, 52/52 munrutor och noll tappade videorutor. Det är inte den fullständiga, versionsstyrda kön med box-fyra-film och vilofilm nedan. OpenAI är inkopplat som textkälla; OpenClaw återstår. [RunPod-mätningen](LYCKAD-LIPSYNK-LOKALT.md) är klar: 3/3 korta Maud-prov utan saknade munrutor, 5,52–5,73 s till talstart. Cirka 4,54 s är upprepad modellkontroll/hastighetsmätning; pröva återanvändning och mät om före val av köbuffert. Ingen produktionsändring eller ytterligare betald körning följer automatiskt av detta dokument.

## Uppdrag för nästa agent

Arbeta endast i `snyggare-dealer`. Använd Scoutgaming som läsreferens. Behåll spelregler och kortutfall i spelmotorn.

1. Välj Mauds verifierade box-fyra-film och en verifierad vilofilm. Lås dealer-ID, video-ID, filhash och 24-fps-rutor. Förbered bankerna en gång.
2. Visa en lokal kö med dessa två filmer. När OpenClaws färdiga text kommer, starta TTS och kontrollen av rätt varm worker samtidigt. Prova först med samma text som tidigare: ”Jakob är kung”.
3. Välj en kommande, ännu inte startad köplats som ger tillräckligt försprång. Med nuvarande uppmätta kod räcker inte en ensam box-fyra-film på 2,625 s som försprång; välj från faktisk färdigtid och uppmätt marginal, inte alltid nästa klipp. Lås en versionsmärkt karta över exakt klipp och bildruta. Anpassa munbilderna till kartan; flytta inte kortens tider eller filmens geometri.
4. Starta ljud och munlager på gemensam tidslinje först när den inledande bufferten finns. Om svar eller film blir inaktuella: kasta den gamla kartan och dess munpaket. Använd inte en mask från en närliggande bildruta.
5. Mät text → första hörbara ljud, första paket, buffert, saknade munrutor, tappade videorutor och ljud/bild-avvikelse. Prova också ett sent svar och ett avbrutet/bytt klipp. Spara fördröjningar separat från GPU-körtid.

Godkänt första prov kräver rätt källrutor, inga saknade munpaket under tal och ingen förskjutning av hand/kort. Visuell bedömning av mun och huvudrörelse krävs separat. Ett kort lyckat klipp bevisar inte långvarig belastning eller flera samtidiga dealers.

## Befintligt stöd – verifierat 2026-11-09

| Referens | Användbart | Begränsning |
|---|---|---|
| Main `d86a6b47c85f4b1341e4ffe2a7a49f08800bc544` | GPU-förvärmning medan modellen svarar; parallell TTS på varm session; exakt film-/munkarta; ”Svara under nästa utdelning”. | Den knappen köar frågan. Frågan skickas först när nästa utdelning börjar. Det är inte en generell sökning efter lämplig kommande film för ett redan färdigt svar. |
| kevin-staging `61612e8f4d9d6ca66b9d57b90a47fc76f7c4cb65` | Närmaste visningstid först; omplanering från första återstående ruta; återanvänt ljud hos samma worker; förkastade gamla kartversioner. | Annat drift-/sessionskontrakt. Ingen direkt kopiering till main eller env-ändring gör integrationen färdig. |

Kodställen i läsreferensen: `services/game/public/player-chat-controller.mjs`, `services/game/public/app.mjs`, `services/game/speech/generated/generated-speech-chat.mjs`, `services/game/speech/moving/moving-speech-deal-plan.mjs`. Kevin-spåret: `kevin/croupier-scoutgg/server/rorlig-lipsync.mjs` på den angivna grenen.

Pröva först en worker och en replik. Fler workers används för samtidiga jobb. En andra beräkningskanal på samma GPU kräver uppmätt kapacitet; Kevin-koden använder 50 rutor/s som villkor för en andra brådskande replik. Det talet är kodens tröskel, inte vår uppmätta prestanda.
