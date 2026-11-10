/** Add the complete selected material bank to an immutable isolated lab packet. */
import{readFile,writeFile,mkdir,readdir,copyFile,link}from'node:fs/promises';
import{constants}from'node:fs';
import{createHash}from'node:crypto';
import path from'node:path';
import assert from'node:assert/strict';
const arg=(name:string)=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1),previous=arg('--previous'),destination=arg('--destination'),evidencePath=arg('--evidence'),expected=arg('--evidence-sha256'),bundlePath=arg('--bundle'),bundleExpected=arg('--bundle-sha256');
assert.match(previous??'',/^exports\/pamela-loop-review-[a-z0-9-]+$/);assert.match(destination??'',/^exports\/pamela-loop-review-[a-z0-9-]+$/);assert.notEqual(previous,destination);assert.match(evidencePath??'',/^runs\/20261109-pamela-material-bank\/take-\d\d\/evidence.json$/);assert.match(expected??'',/^[a-f0-9]{64}$/);
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),oldReceipt=JSON.parse(await readFile(previous+'/receipt.json','utf8')),bytes=await readFile(evidencePath!);assert.equal(hash(bytes),expected);const e=JSON.parse(bytes.toString());
assert.equal(oldReceipt.status,'published-and-verified');assert.equal(oldReceipt.projectId,'prj_mQwHzspK3GrrJA04eFOorFxth0d5');assert.equal(oldReceipt.teamId,'team_Scxorb9qtZHjNae1YEQnFCaT');assert.equal(e.verification.sourceRgbEqualFrames,5040);assert.equal(e.verification.printedOutsidePaperChanges,0);assert.equal(e.verification.priorCardCoreChanges,0);assert.equal(e.parts.length,14);assert.equal(e.verification.trimmedFrames,4404);
assert.ok(bundlePath&&bundleExpected,'Explicit verified bundle receipt and SHA256 required');const bundleBytes=await readFile(bundlePath);assert.equal(hash(bundleBytes),bundleExpected);const bundle=JSON.parse(bundleBytes.toString());assert.equal(bundle.status,'verified');assert.deepEqual(bundle.evidence,{path:evidencePath,sha256:expected});assert.equal(bundle.verification.clips,14);assert.equal(bundle.verification.archiveEntries,16);assert.equal(bundle.verification.streamedZipHashesMatch,true);
const nativeReviewPath=evidencePath!.replace('/evidence.json','/native-review.json'),browserReviewPath=evidencePath!.replace('/evidence.json','/browser-review.json'),nativeReviewBytes=await readFile(nativeReviewPath),browserReviewBytes=await readFile(browserReviewPath),nativeReview=JSON.parse(nativeReviewBytes.toString()),browserReview=JSON.parse(browserReviewBytes.toString());assert.deepEqual(nativeReview.bank,{path:evidencePath,sha256:expected});assert.equal(nativeReview.decision,'INTEGRATION_CANDIDATE_WITH_LIMITATIONS');assert.deepEqual(browserReview.bank,nativeReview.bank);for(const key of ['full','compact']){assert.equal(browserReview[key].ended,true);assert.equal(browserReview[key].error,null);assert.equal(browserReview[key].rate,1);assert.equal(browserReview[key].sha256,e[key].sha256);}
const snapshot='pamela-loop-review-'+new Date().toISOString().replace(/\D/g,''),output=destination+'/.vercel/output/static';
await mkdir(destination!);await mkdir(destination+'/.vercel');
// Previous export media are frozen. Share their immutable bytes with hard links;
// HTML, JSON and executable bundles are independent copies before any mutation.
async function clone(source:string,target:string){await mkdir(target);for(const item of await readdir(source,{withFileTypes:true})){assert.ok(!item.isSymbolicLink(),'No linked export directories');const from=path.join(source,item.name),to=path.join(target,item.name);if(item.isDirectory())await clone(from,to);else if(/\.(mp4|png|jpe?g|webp)$/i.test(item.name))await link(from,to);else await copyFile(from,to,constants.COPYFILE_EXCL);}}
await clone(previous+'/.vercel/output',destination+'/.vercel/output');await copyFile(previous+'/.vercel/project.json',destination+'/.vercel/project.json',constants.COPYFILE_EXCL);
const manifestPath=output+'/pamela-loop-manifest.json',manifest=JSON.parse(await readFile(manifestPath,'utf8'));
async function copy(source:string,expectedHash?:string){assert.match(source,/^runs\/[A-Za-z0-9_./-]+\.(mp4|png|json|zip)$/);assert.ok(!source.split('/').some(p=>p==='..'||p.startsWith('.')));const b=await readFile(source),sha256=hash(b);if(expectedHash)assert.equal(sha256,expectedHash);const existing=manifest.media.find((m:any)=>m.source===source);if(existing){assert.equal(existing.sha256,sha256);return existing.publicPath;}const publicPath='/files/'+source;await mkdir(path.dirname(output+publicPath),{recursive:true});await writeFile(output+publicPath,b,{flag:'wx'});manifest.media.push({source,publicPath,sha256,bytes:b.length});return publicPath;}
const full=await copy(e.full.path,e.full.sha256),compact=await copy(e.compact.path,e.compact.sha256),evidence=await copy(evidencePath!,expected),parts:{id:string;file:string;sha256:string;evidence:string}[]=[];
for(const part of e.parts){const partBytes=await readFile(part.path);assert.equal(hash(partBytes),part.sha256,'Part evidence changed');const p=JSON.parse(partBytes.toString());assert.equal(p.records.length,360);assert.ok(p.records.every((r:any)=>r.sourceRgbEqual&&r.changedPriorCorePixels===0&&r.changedOutsidePaperPixels===0));parts.push({id:part.id,file:await copy(part.output.path,part.output.sha256),sha256:part.output.sha256,evidence:await copy(part.path)});}
const bundleUrl=await copy(bundle.archive.path,bundle.archive.sha256),bundleReceipt=await copy(bundlePath!,bundleExpected),nativeReviewUrl=await copy(nativeReviewPath,hash(nativeReviewBytes)),browserReviewUrl=await copy(browserReviewPath,hash(browserReviewBytes));
const last=JSON.parse(await readFile(e.parts.at(-1).path,'utf8')),posterRef=last.records.find((r:any)=>r.frame===350).proof,poster=await copy(posterRef.path,posterRef.sha256);
manifest.snapshot=snapshot;manifest.studies.materialBank={full,compact,evidence,parts,poster,bundle:bundleUrl,bundleReceipt,nativeReview:nativeReviewUrl,playbackReview:browserReviewUrl,frames:4404,fps:30,materials:14,acceptedAsFinal:false,selectedLimitations:e.selectedLimitations};
const limitationsText=e.selectedLimitations.map((l:{id:string;limitation:string})=>l.id+': '+l.limitation).join(' ').replace(/[&<>"]/g,(c:string)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
function updateReviewHtml(html:string,section:string,snapshot:string){
 assert.match(snapshot,/^pamela-loop-review-[a-z0-9-]+$/);
 // Exported sections are flat. Remove previous generated copies before inserting
 // the current bank, including duplicates left by an earlier exporter version.
 for(const id of ['fjorton-material','historiska-prov']){
  const pattern=new RegExp(`<section\\b[^>]*\\sid=(["'])${id}\\1[^>]*>[\\s\\S]*?<\\/section>`,'g');
  html=html.replace(pattern,match=>{assert.ok(!/<section\b/i.test(match.slice(match.indexOf('>')+1)),'Nested generated section is unsupported');return'';});
 }
 const anchor='<section id="sista-givningen-material">';
 assert.equal(html.split(anchor).length,2,'Expected one preserved last-deal section');
 const history='<section id="historiska-prov"><h2>Historik · bevarade äldre arbetsprov</h2><p>Avsnitten nedan visar tidigare filer och deras dåvarande granskning. Fel, arbetsplaner och antal godkända prov gäller just dessa versioner. Den aktuella materialbanken ovan har separat evidens och är fortfarande en granskningskandidat.</p></section>';
 html=html.replace(anchor,section+history+anchor)
  .replace('href="#fjorton-kortare">Senaste hela filmen','href="#fjorton-material">Senaste hela filmen');
 function historical(id:string,replacements:ReadonlyArray<readonly[string,string]>){
  const marker=`<section id="${id}">`,start=html.indexOf(marker),end=html.indexOf('</section>',start)+10;
  assert.ok(start>=0&&end>start&&html.indexOf(marker,start+marker.length)===-1,`Expected one historical section: ${id}`);
  let fragment=html.slice(start,end);assert.ok(!/<section\b/.test(fragment.slice(marker.length)),`Nested historical section: ${id}`);
  for(const [before,after]of replacements)fragment=fragment.replace(before,after);
  html=html.slice(0,start)+fragment+html.slice(end);
 }
 historical('sista-givningen-material',[
  ['Sista givningen · 14 olika korttryck i scenen','Äldre delprov · sista givningen med 14 korttryck'],
  ['Detta är ett fungerande integrationsprov för sista givningen.','Detta är det bevarade äldre integrationsprovet för sista givningen.'],
  ['Övriga tretton rörliga tryckspår färdigställs separat.','Övriga rörelser ingår nu i hela materialprovet ovan.'],
 ]);
 historical('fjorton-kortare',[
  ['Senaste hela rörelseprovet · 14 kort på 146,8 sekunder','Tidigare rörelseprov · vita råkort på 146,8 sekunder'],
 ]);
 historical('nya-kortspar',[
  ['Plats 1 och 7 · korttryck före och efter','Äldre materialjämförelse · plats 1 och 7'],
  ['Första och andra kortet över alla sju platser färdigställs som separata materialspår.','Här bevaras de äldre separata materialproven. Den aktuella samlade materialbanken visas ovan.'],
 ]);
 historical('papper-ny-mask',[
  ['Papper med grön färgreflex ska förbli tätt','Äldre maskprov · papper med grön färgreflex'],
  ['Reparationen är kontrollerad i åtta fria kortrutor och ska införas i nästa komposit; den är inte inbakad i filmen ovan.','Reparationen kontrollerades i åtta fria kortrutor. Bilden visar det då separata korrigeringsprovet; den äldre råkortsfilmen har bevarats utan denna reparation.'],
 ]);
 historical('vila-fjorton',[
  ['<h2>VILA → två givningar till alla sju → VILA</h2>','<h2>Äldre råkortsfilm · VILA → två givningar till alla sju → VILA</h2>'],
  ['Vita kortytor är rörelsereferenser; unika tryck och maskfinish är fortfarande under arbete.','Vita kortytor är rörelsereferenser. Filmen bevarar det äldre tillståndet före den samlade materialbanken ovan; dess tidigare maskfinish och råkort har inte ändrats.'],
 ]);
 historical('fjorton-korttryck',[
  ['14 separata korttryck · materialprov i VILA','Äldre materialprov · 14 korttryck i VILA'],
  ['trycken är ännu inte införda i hela utdelningsfilmen ovan.','trycken ingår inte i den bevarade äldre råkortsfilmen.'],
 ]);
 historical('fortsatta-prov',[
  ['<h2>Separata arbetsprov</h2>','<h2>Historik · separata arbetsprov</h2>'],
  ['Proven nedan visar tidigare varianter och pågående korrigeringar. De är kontrollerade lokalt men inte slutgodkända av browseragenten.','Proven nedan bevarar tidigare varianter och korrigeringsförsök. De kontrollerades lokalt men var inte slutgodkända av browseragenten; bedömningarna gäller dessa äldre filer.'],
 ]);
 historical('kortmasker-kvar',[
  ['Kortmasker · förbättringar och kvarvarande fel','Äldre middle-spår take-06 · bevarade maskfel'],
  ['Alla 1 800 rutor i plats 2–6 har kontrollerats. 0 av 5 hela tryckfilmer klarar ännu granskningen:','I granskningen av äldre middle-spår take-06 kontrollerades alla 1 800 rutor i plats 2–6. Då klarade 0 av 5 hela tryckfilmer granskningen:'],
  ['Därför visas råfilmerna som rörelseprov.','Detta resultat gäller de bevarade äldre filmerna; den aktuella materialbanken ovan har separat evidens.'],
 ]);
 const snapshotPattern=/<p\b[^>]*>(?:Snapshot:\s*)?pamela-loop-review-[a-z0-9-]+<\/p>/g;
 assert.equal([...html.matchAll(snapshotPattern)].length,1,'Expected one visible review snapshot');
 html=html.replace(snapshotPattern,`<p id="review-snapshot" class="muted">Snapshot: ${snapshot}</p>`);
 const ids=[...html.matchAll(/\sid=(["'])(.*?)\1/g)].map(match=>match[2]);
 assert.equal(ids.filter(id=>id==='fjorton-material').length,1,'Expected one current material bank');
 assert.equal(new Set(ids).size,ids.length,'Duplicate HTML ids in review export');
 return html;
}
const section=`<section id="fjorton-material"><h2>Hela rundan · två olika kort till alla sju</h2><video controls muted playsinline preload="metadata" poster="${poster}" src="${compact}"></video><p>VILA → REDO → sju första kort → sju andra kort → VILA. Alla fjorton tryck följer med från handen till bordet och ligger kvar under nästa givning. 146,8 sekunder, oförändrad rörelsehastighet.</p><p><strong>Granskningskandidat:</strong> ${limitationsText} Små grepp-/skuggkanter och posehopp återstår. Framsidestrycken är diagnostiska; mörk SG-baksida och fysisk kortvändning är inte slutgodkända.</p><p><a href="${compact}" download>Ladda ned hela rundan · 146,8 s</a> · <a href="${full}" download>Alla ändhållningar · 182,87 s</a> · <a href="${evidence}">Källor och verifiering</a></p><p><a href="${bundleUrl}" download><strong>Ladda ned alla 14 separata scenklipp · ZIP</strong></a> (${(bundle.archive.bytes/1024/1024).toFixed(1)} MB)</p><details><summary>Visa alla 14 separata 12-sekundersfilmer</summary><table style="width:100%;text-align:left"><thead><tr><th>Plats</th><th>Första kortet</th><th>Andra kortet</th></tr></thead><tbody>${[1,2,3,4,5,6,7].map(seat=>`<tr><td style="padding:14px 0">Plats ${seat}</td>${[1,2].map(pass=>{const p=parts.find(p=>p.id===`C${pass}-P${seat}`)!;return`<td><a href="${p.file}">Spela 12 sekunder</a> · <a href="${p.file}" download>Ladda ned</a></td>`;}).join('')}</tr>`).join('')}</tbody></table></details></section>`;
const html=updateReviewHtml(await readFile(output+'/pamela-loop.html','utf8'),section,snapshot);await writeFile(output+'/pamela-loop.html',html);await writeFile(manifestPath,JSON.stringify(manifest,null,2));
const latest=JSON.parse(await readFile(output+'/latest.json','utf8'));latest.snapshot=snapshot;latest.publishedAt=new Date().toISOString();latest.materialBank='/pamela-loop.html#fjorton-material';await writeFile(output+'/latest.json',JSON.stringify(latest,null,2));
const receipt={...oldReceipt,status:'prepared-not-uploaded',snapshot,media:manifest.media,materialBank:{evidencePath,sha256:expected,frames:4404,materials:14},sourcePacket:previous,preparerCodeSha256:hash(await readFile('tools/pamela-material-public-review.ts'))};delete receipt.deploymentId;delete receipt.verifiedAt;await writeFile(destination+'/receipt.json',JSON.stringify(receipt,null,2));await copyFile('tools/pamela-material-public-review.ts',destination+'/material-export-source.ts',constants.COPYFILE_EXCL);console.log(JSON.stringify({destination,snapshot,media:manifest.media.length}));

