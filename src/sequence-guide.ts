/** A review guide, not a runtime scheduler or a claim that these joins are approved. */
export function sequenceGuideMarkup(): string {
  return `<style>
  .sequence-guide{margin:32px 0;padding:22px;border:1px solid #435348;border-radius:14px;background:#17201b}
  .sequence-guide h2{margin:0 0 10px}.sequence-guide h3{margin:8px 0;color:#ecdfac;font-size:16px}
  .sequence-guide .seq-flow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:18px 0}
  .sequence-guide .seq-node{border:1px solid #506354;border-radius:9px;padding:12px 16px;background:#202d25}
  .sequence-guide .seq-action{flex:1;min-width:155px;text-align:center;background:#29362c}
  .sequence-guide .seq-arrow{color:#b5ccbb}.sequence-guide .seq-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .sequence-guide .seq-label{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#c4b882}
  @media(max-width:650px){.sequence-guide{padding:16px}.sequence-guide .seq-grid{grid-template-columns:1fr}.sequence-guide .seq-node{padding:9px}.sequence-guide .seq-action{min-width:130px}}
  </style><section id="sekvenser" class="sequence-guide" aria-labelledby="sequence-heading">
  <div class="seq-label">Arbetsmetod · första långtagningen prövas</div><h2 id="sequence-heading">Längre tagningar, korta bryggor och valbara rörelser</h2>
  <div class="seq-grid"><div><h3>Vila: en sammanhängande tagning</h3>
  <div class="seq-flow" aria-label="VILA, andning och blick i samma tagning, tillbaka till VILA"><span class="seq-node">VILA</span><span class="seq-arrow" aria-hidden="true">→</span><span class="seq-node seq-action">Andning · blick · andning</span><span class="seq-arrow" aria-hidden="true">→</span><span class="seq-node">VILA</span></div>
  <p>En gemensam tagning tar bort de interna klippbytena. Slutet måste fortfarande passa början när filmen loopas. Samma ankarbild är ett mål, inte ett godkänt resultat.</p>
  <p><strong>Nu genomfört prov:</strong> ett 12-sekunders Wan3-klipp i 1080p, 240 API-krediter, med fem önskade små vilobeteenden och återbesök till VILA. <a href="/langtagning">Se original, rå loop och faktisk bedömning</a>. Fem önskade beteenden är inte fem godkända klipp.</p></div>
  <div><h3>Spel: en rörelse till vald plats</h3>
  <div class="seq-flow" aria-label="REDO, giv till vald plats, tillbaka till REDO"><span class="seq-node">REDO</span><span class="seq-arrow" aria-hidden="true">→</span><span class="seq-node seq-action">Giv till plats N</span><span class="seq-arrow" aria-hidden="true">→</span><span class="seq-node">REDO</span></div>
  <p>Spelet väljer plats och kortvärde. Ett långt prov kan ge användbara delklipp, men varje del måste klara sin egen ingång, utgång, räckvidd och kortkontakt.</p>
  <p><strong>Kort på bordet lever vidare</strong> i ett separat lager. REDO beskriver personens pose; det betyder inte att bordet är tomt.</p></div></div>
  <p><strong>REDO är det gemensamma navet.</strong> Om alla givklipp börjar och slutar med samma fungerande pose och rörelse behövs inte separata övergångar mellan varje boxpar. Kontrollen gäller att ansikte, händer, blick och hastighet faktiskt möts vid REDO. Ett gemensamt namn räcker inte.</p>
  <h3>En brygga är en lokal reparation</h3><p>6–12 rutor vid 30 fps är 0,2–0,4 sekunder. Utgå från de verkliga gränsrutorna och rörelsen runt dem. En övertoning kan ge dubbla konturer; en genererad brygga kan ändra ansiktet. Sök först fungerande klippunkter. Välj sedan ett riktat prov, inte nya bryggor mellan alla klipp.</p>
  <h3>Flera noder kan bli en enkel spellista</h3><p><code>VILA → REDO → giv(4) → giv(1) → VILA</code> kan beskrivas som en ordnad lista över befintliga klipp. Gränserna måste passa i pose, fart, grepp, ljus och masker. Listan får avbrytas vid godkända knutpunkter. Den är inte en ny bank och gör inte klippen automatiskt kompatibla.</p>
  <p class="notice"><strong>Ingen uppmätt bankandel:</strong> en film med sju givningar motsvarar inte automatiskt 30 % av banken. Det pågående första metodprovet gäller vila. Därefter behöver ett avgränsat givprov visa att gemensamt REDO, handkontakt och platsens koordinater håller innan alla sju platser beställs.</p>
  <p><a href="/underlag/sekvensstrategi.json">Provplan, kostnad och kvalitetsgränser</a> · <a href="/nodkarta">Öppna nodernas samband</a> · <a href="/studio">Jämför befintliga skarvprov A/B</a></p>
  </section>
  <section id="gront"><h2>Varför är inte allt grönt samma RGB?</h2>
  <p>Även en jämn grön inbild kan få nya nyanser i en genererad film. Skuggor, kompression och rörelseoskärpa förändrar färgerna. Hår och fingerkanter blandar dessutom grönt med personen. En enda exakt RGB-match skulle lämna många gröna pixlar kvar och ge hårda kanter.</p>
  <p>Friläggningen uppskattar därför genomskinlighet längs kanten och minskar grönt färgspill, samtidigt som hud och mörka kläder skyddas. En ljusare grön bakgrund är inte i sig bättre eller sämre. Den aktuella hänvisningen till ”bild 2” är inte säkert identifierad. <a href="/underlag/gront-och-ljus.json">Läs mätningen och avgränsningen</a>.</p></section>`;
}
