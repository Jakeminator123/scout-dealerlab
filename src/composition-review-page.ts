import { createPamelaCompositionProps, type PamelaCompositionReport } from './components/pamela-composition/model.ts';
import {reviewVersionMarkup} from './review-version.ts';
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Public read-only React entry; the same component is used by the local Next route. */
export function compositionReviewPage(report: PamelaCompositionReport, paths: Map<string,string>, snapshot: string) {
 const get = (source: string) => {const url=paths.get(source);if(!url)throw Error(`Missing composition evidence: ${source}`);return url;};
 const props=createPamelaCompositionProps(report,get,snapshot);
 props.nodeMapHref='/nodkarta?slot=deal.player.centre%2Fbox3';
 props.evidence=[
  {label:'Nytt ljusprov och skarvdiagnos',href:'/scenfinish'},
  {label:'Fristående 3D-kortmaterial',href:'/kortmaterial'},
  {label:'Nya andningsloopen och blickinsticket',href:'/vila'},
  {label:'Masterplan',href:'/underlag/masterplan.txt'},
  {label:'Nästa kort 2 · skiss med 67,6 % överlapp',href:'/underlag/pamela-kort2-overlapp.svg'},
  {label:'Kort 2 · föreslagen geometri, ännu inte filmad',href:'/underlag/pamela-kort2-plan.json'},
  {label:'Tidsmappning och proveniens',href:'/underlag/pamela-komposition.json'},
  {label:'Kortspår per ruta',href:'/underlag/pamela-kortspor.json'},
  {label:'Alla 360 kortmasker',href:'/underlag/pamela-synliga-masker.zip'},
  {label:'Maskgranskning',href:'/underlag/pamela-masker-qa.json'},
  {label:'Kort 2 · arm-/handmask och kontrakt',href:'/underlag/pamela-kort2-mask.json'},
  {label:'Kort 2 · visuellt kontaktbevis',href:get('runs/20261109-pamela-central-composite/tracking/c2-pilot/proofs/c2-proof-098.png')},
  {label:'Bredvid / 30 % / 50 % överlapp',href:get('runs/20261109-pamela-central-composite/tracking/c2-pilot/proofs/placement-variants.png')},
  {label:'Ny bakgrund · proveniens',href:'/underlag/pamela-rum-proveniens.json'},
  {label:'Ny bakgrund · prompt',href:'/underlag/pamela-rum-prompt.txt'},
  {label:'Nytt bord · proveniens',href:'/underlag/pamela-bord-proveniens.json'},
  {label:'Bildkvalitet · källa och friläggning',href:'/underlag/pamela-bildkvalitet.txt'},
  {label:'Stående vy · kontaktområdet',href:'/underlag/pamela-portrait-kontakt.json'},
 ];
 const serialized=JSON.stringify(props).replace(/</g,'\\u003c');
 return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Pamela · Kompositionsstudion</title><style>body{margin:0;background:#101617;color:#e6e9e2;font-family:system-ui,sans-serif}</style></head><body><div style="max-width:1714px;margin:auto;padding:8px 24px">${reviewVersionMarkup(snapshot,`Central komposit v2 · ${report.output.sha256.slice(0,12)}`)}</div><div id="composition-root"><p>Laddar kompositionsstudion… <a style="color:#c5dbc8" href="${esc(get(report.output.path))}">Öppna filmen direkt</a></p></div><noscript><p>Kontrollerna behöver JavaScript. <a href="${esc(get(report.output.path))}">Komposit i full upplösning</a> · <a href="/underlag/masterplan.txt">Masterplan</a></p></noscript><script id="composition-props" type="application/json">${serialized}</script><script defer src="/komposition-react.js"></script></body></html>`;
}
