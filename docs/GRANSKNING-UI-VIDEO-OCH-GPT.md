# Granskning: UI/UX, klippstandarder och GPT-underlag

Dokumentversion 7 · 2026-11-10. Detta är den stabila ingången. Sakfynd redigeras i rätt ämnesfil när evidens eller beslut ändras; ingen ny rapport eller omläsning krävs per chatt. Baslinjer och högst två föregångare bevaras. Historiska original är oförändrade.

| Behöver du… | Läs |
|---|---|
| Förstå format, vila/grundloop, klippnamn och QA | [Format och kvalitet](granskning/FORMAT-OCH-KVALITET.md) |
| Använda gemensamma kortnamn, hand/sida och rörelsesträngar | [Namn och rörelsesträngar](studio/NAMN-OCH-RORELSESTRANGAR.md) |
| Bedöma eller skapa Keystone/ankare | [Keystone](granskning/KEYSTONE.md) |
| Förstå studion, GPT-mappen och dokumentkartan | [Studiokartan](studio/KARTA.md) |

Den aktuella visuella nodkartan på `/nodkarta` använder samma V2-kontrakt och DL1-etiketter. Återbruksinventeringen i `references/pamela-reuse-review.json` skiljer källbundna bildkoordinater/lager från fysisk sidobservation och godkänd variant.

Aktuellt läge, nästa demonstrationsfilm och kvarstående grindar finns i [masterplanen](MASTERPLAN.md). Äldre försöksbeskrivningar är samlade i [historiken](MASTERPLAN-HISTORIK-20261110.md).

## Slutsats och arbetsordning

Följ GPT-underlagets huvudlinje: **behåll main och den kalibrerade 2,5D-kedjan; godkänn först en hel scen och ett representativt klipp**. Dealer, bord, sko, bakgrund och ljus ska fungera tillsammans. Studion är ett lokalt granskningsverktyg; den flyttar inte Blackjack-regler eller kortvärden från spelmotorn.

1. Spåra bästa original och skilj identitet, scenreferens, ankare och genererad startbild.
2. Lås kamera, arbetsområde, bord och kortgeometri. Jämför samma original genom olika efterarbeten.
3. Godkänn hår, händer, sko, kontaktpunkter och hela VILA/REDO-skarvar i slutscenen.
4. Utöka rörelsebank och export först därefter. En vacker stillbild godkänner inte rörelserna.

## Verifieringsgräns och nästa arbete

Scout-revisioner är historiskt verifierade läsreferenser och ska kontrolleras på nytt inför integration; inga nya Scout-ändringar ingår. Nya Browser-GPT-underlag är hashbevarade i `references/browser-gpt-r03-sources.json`.

Kvar: korrekt C2-kedja, resterande grundgivningar/dealerkort, idle-varianter, slutliga släppankare, utbytbara lager och helfilms-QA. Huvudagenten avslutar nu inför överlämning. `STOPP.cmd` stänger den verifierade lokala previewn.
