/** Freeze four source-bound turns and separately labelled seam studies. No network writes. */
import {readFile,writeFile,mkdir,readdir,copyFile,link} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readPamelaCardSceneBank} from '../src/pamela-card-scene-bank.ts';
import {validateCardSceneAtlas} from '../src/pamela-card-scene-calibration.ts';
type Ref={path:string;sha256:string};
const root=process.cwd(),previous='exports/pamela-loop-review-20261109-r14',destination='exports/pamela-loop-review-20261109-r15',out=destination+'/.vercel/output/static';
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),ref=async(p:string):Promise<Ref>=>({path:p,sha256:hash(await readFile(p))});
async function checked(r:Ref){const b=await readFile(r.path);assert.equal(hash(b),r.sha256,'Bound source changed: '+r.path);return b;}
assert.equal(path.basename(root),'snyggare-dealer');assert.equal(process.version,'v24.21.0');
const projectId='prj_mQwHzspK3GrrJA04eFOorFxth0d5',teamId='team_Scxorb9qtZHjNae1YEQnFCaT';
const old=await read(previous+'/receipt.json'),project=await read(previous+'/.vercel/project.json'),pointer=await read('references/public-review.json');
for(const p of [old,pointer]){assert.equal(p.projectId,projectId);assert.equal(p.teamId,teamId);}
assert.equal(project.projectId,projectId);assert.equal(project.orgId,teamId);assert.equal(old.status,'published-and-verified');assert.equal(pointer.deploymentId,old.deploymentId);
const scenes=await readPamelaCardSceneBank();assert.deepEqual(scenes.map(s=>s.id),['C2-P4','C2-P2','C2-P3','C2-P5']);
const catalog=await read('references/pamela-card-scenes.json'),evidences:any[]=[],audits:any[]=[],compatibility:any[]=[];
for(const row of catalog.scenes){
 const e=JSON.parse((await checked(row.evidence)).toString());evidences.push(e);
 if(row.id!=='C2-P4')for(const c of e.code as Ref[]){
  const current=await ref(c.path);if(current.sha256===c.sha256)continue;
  assert.equal(row.id,'C2-P2');assert.equal(c.path,'src/pamela-card-scene-calibration.ts');
  const frozen=path.posix.dirname(row.evidence.path)+'/snapshot/pamela-card-scene-calibration.ts';await checked({path:frozen,sha256:c.sha256});
  const before=(await readFile(frozen,'utf8')).replaceAll('\r\n','\n'),after=(await readFile(c.path,'utf8')).replaceAll('\r\n','\n');
  const added=after.match(/^ \{id:'C2-P(?:3|5)',[^\n]*\n/gm);assert.equal(added?.length,2);
  assert.equal(after.replace(/^ \{id:'C2-P(?:3|5)',[^\n]*\n/gm,''),before,'Only two source allowlist rows may differ from P2 renderer validation');
  compatibility.push({file:c.path,frozenSha256:c.sha256,currentSha256:current.sha256,change:'Two additional source allowlist entries; unchanged P2 validator body. EOL normalized for comparison.'});
 }
 if(row.id==='C2-P3'||row.id==='C2-P5'){
  const auditRef=await ref(path.posix.dirname(row.evidence.path)+'/review-astra.json'),audit=JSON.parse((await checked(auditRef)).toString());
  assert.equal(audit.status,'pass-with-limitations');assert.deepEqual(audit.blockers,[]);assert.ok(audit.provenance.refs.length>=4);
  for(const r of audit.provenance.refs as Ref[])await checked(r);
  assert.ok(audit.provenance.refs.some((r:Ref)=>r.path==='src/pamela-key.ts'));
  audits.push({id:row.id,evidence:auditRef,provenance:audit.provenance});
 }
}
const rest=await read('references/pamela-rest-ready-review.json'),entry=JSON.parse((await checked(rest.entryEvidence)).toString()),seams=JSON.parse((await checked(rest.bridgeSeams)).toString());
assert.equal(seams.frames.length,133);assert.equal(seams.fps,30);assert.equal(seams.retime,false);assert.equal(seams.blend,false);assert.equal(seams.freeze,false);
const bridgeRoot='runs/20261109-pamela-idle-ready-bridge/run-01',nativeRef=await ref(bridgeRoot+'/native-verification.json'),native=JSON.parse((await checked(nativeRef)).toString());
assert.equal(native.passed,true);assert.equal(native.output.sha256,'2df2e054051e85e4200025a8b955e0c871e41d6cf0fc78b59a25d107e941e569');assert.equal(native.observed.frames,90);
const sources=['src/pamela-card-scene-bank-client.tsx','src/pamela-card-scene-bank.ts','src/pamela-card-scene-calibration.ts','src/pamela-combined-stage-client.tsx','src/pamela-card-atlas.ts','src/pamela-p2-card-calibration.ts','src/pamela-p3-card-calibration.ts','src/pamela-p4-card-calibration.ts','src/pamela-p5-card-calibration.ts','src/pamela-two-sided-card.ts','src/pamela-proof-card-designs.ts','src/pamela-key.ts','src/pamela-stage-projection.ts','src/pamela-background-layer.ts','src/pamela-table-layer.ts','src/pamela-contact-calibration.ts','src/pamela-shoe-geometry.ts','src/pamela-idle-source-projection.ts','tools/pamela-four-turns-public-review.ts','tools/pamela-turn-atlas-build.ts','references/pamela-card-scenes.json','references/pamela-rest-ready-review.json','references/pamela-stage-contract.json','references/card-materials/vendor/three.module.js'];
const sourceCode=await Promise.all(sources.map(ref));
const baseline=await Promise.all(['pamela-combined.html','pamela-combined.js','pamela-loop.html','pamela-loop-manifest.json','latest.json','manifest.json'].map(n=>ref(previous+'/.vercel/output/static/'+n)));
await mkdir(destination);await mkdir(destination+'/.vercel');let inherited=0,hardlinks=0;
async function clone(from:string,to:string){await mkdir(to);for(const e of await readdir(from,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());const src=path.join(from,e.name),dst=path.join(to,e.name);if(e.isDirectory())await clone(src,dst);else{assert.ok(e.isFile());if(/\.(mp4|webm|png|jpg|jpeg|zip)$/i.test(e.name)){await link(src,dst);hardlinks++;}else await copyFile(src,dst);inherited++;}}}
await clone(previous+'/.vercel/output',destination+'/.vercel/output');await copyFile(previous+'/.vercel/project.json',destination+'/.vercel/project.json');
const loop=await read(out+'/pamela-loop-manifest.json'),media=loop.media,newMedia:any[]=[];
async function add(p:string,expected:string){
 assert.match(p,/^runs\/[A-Za-z0-9_.\/-]+\.(png|jpg|json|mp4)$/);assert.ok(!p.split('/').some(s=>!s||s==='..'||s.startsWith('.')));
 const b=await checked({path:p,sha256:expected}),publicPath='/files/'+p,existing=media.find((m:any)=>m.publicPath===publicPath);
 if(existing){assert.equal(existing.sha256,expected);assert.equal(hash(await readFile(out+publicPath)),expected);return;}
 await mkdir(path.dirname(out+publicPath),{recursive:true});await writeFile(out+publicPath,b,{flag:'wx'});
 const item={source:p,publicPath,sha256:expected,bytes:b.length};media.push(item);newMedia.push(item);
}
for(const[i,s]of scenes.entries()){const e=evidences[i];for(const f of [s.atlas.source,...s.atlas.pages,...e.assets,e.manifest,...(e.outputs??[])])await add(f.path,f.sha256);}
for(const row of entry.outputs)await add(row.path,row.sha256);
await add(seams.path,seams.sha256);await add(native.output.path,native.output.sha256);
const now=new Date().toISOString(),snapshot='pamela-loop-review-'+now.replace(/\D/g,'');await mkdir(destination+'/source-snapshot');
const supplemental:Ref[]=[rest.entryEvidence,rest.bridgeSeams,nativeRef,...catalog.scenes.map((s:any)=>s.evidence),...audits.flatMap(a=>[a.evidence,...a.provenance.refs])];
for(const c of [...sourceCode,...supplemental]){await checked(c);await copyFile(c.path,destination+'/source-snapshot/'+c.path.replaceAll('/','__'));}
const build=path.resolve(destination,'.build');await mkdir(build);const require=createRequire(import.meta.url),loader=path.join(build,'tsx-loader.cjs');
await writeFile(loader,`const swc=require(${JSON.stringify(require.resolve('next/dist/build/swc'))});module.exports=function(source){return swc.transformSync(source,{filename:this.resourcePath,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code;};`);
const compiledEntry=path.join(build,'combined.tsx'),props={scenes:scenes.map(s=>({...s,publicMode:true,comparisonHref:s.id==='C2-P4'?'/pamela-flip.html':`/pamela-flip-p${s.id.slice(-1)}.html`}))};
await writeFile(compiledEntry,`import{createRoot}from'react-dom/client';import Component from${JSON.stringify(path.resolve('src/pamela-card-scene-bank-client.tsx'))};const initialId=new URLSearchParams(window.location.search).get('id')??undefined;createRoot(document.getElementById('root')!).render(<Component {...${JSON.stringify(props)}} initialId={initialId}/>);`);
const{webpack}=require('next/dist/compiled/webpack/webpack');
await new Promise<void>((resolve,reject)=>{const compiler=webpack({mode:'production',context:root,target:'web',entry:compiledEntry,output:{path:path.resolve(out),filename:'pamela-combined.js',chunkFilename:'pamela-combined-[contenthash].js',publicPath:'/'},devtool:false,optimization:{minimize:false},resolve:{extensions:['.tsx','.ts','.js','.json']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[{loader}]}]},performance:{hints:false}});compiler.run((error:Error|null,stats:any)=>compiler.close((close:Error|null)=>error||close||stats?.hasErrors()?reject(error??close??Error(stats.toString({all:false,errors:true}))):resolve()));});
const shell=(title:string,content:string)=>`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#101714;color:#e7eee7;font:16px/1.5 system-ui}main{max-width:1200px;margin:auto;padding:26px}a{color:#c4dcc9}video{width:100%;background:#080d09;border-radius:12px}nav{display:flex;gap:20px;flex-wrap:wrap}small{color:#b9c9bf}</style></head><body>${content}</body></html>`;
await writeFile(out+'/pamela-combined.html',shell('Pamela · Fyra kalibrerade kortvändningar','<div id="root"></div><script defer src="/pamela-combined.js"></script>'));
for(const seat of [3,5]){
 const s=scenes.find(s=>s.id===`C2-P${seat}`)!,e=evidences[scenes.indexOf(s)],cal=validateCardSceneAtlas(s.atlas),movie=e.outputs.find((m:any)=>m.path.endsWith('/turn-before-after.mp4'));
 assert.equal(e.comparison.startInclusive,cal.edgeFrame-25);assert.equal(e.comparison.endInclusive,cal.frontFrame+25);
 await writeFile(out+`/pamela-flip-p${seat}.html`,shell(`Pamela · Plats ${seat} före/efter`,`<main><nav><a href="/pamela-combined.html?id=C2-P${seat}">Plats ${seat} med scenbyten</a><a href="/pamela-loop.html">Hela rundan</a></nav><h1>Plats ${seat} · kortvändning före och efter</h1><p>Samma källrutor ${e.comparison.startInclusive}–${e.comparison.endInclusive}, 30 fps. Vänster: tidigare framsida genom rörelsen. Mitten: SG fram/bak. Höger: blå baksida och elfenbensframsida.</p><video controls muted playsinline preload="metadata" src="/files/${movie.path}"></video><p>Baksida 0–${cal.edgeFrame-1}, tunn kant ${cal.edgeFrame}–${cal.frontFrame-1}, framsida från ${cal.frontFrame} när motorn tillåter den. Handen ligger framför trycket.</p>${e.outputs.filter((m:any)=>!m.path.endsWith('/turn-before-after.mp4')).map((m:any)=>`<h2>${m.path.endsWith('/sg-classic.mp4')?'SG / klassisk':'Blå / elfenben'} · hela 12 sekunder</h2><video controls muted playsinline preload="metadata" src="/files/${m.path}"></video><p><a href="/files/${m.path}" download>Ladda ned filmen</a></p>`).join('')}<small>Presentationsprov med diagnostiska kort, inte spelresultat. Fina maskkanter, rörelseoskärpa och den dolda kortkonturen återstår att förbättra. Originalskon är kvar på denna plats.</small></main>`),{flag:'wx'});
}
await writeFile(out+'/pamela-idle-ready.html',shell('Pamela · VILA och REDO-skarvar',`<main><nav><a href="/pamela-combined.html">Fyra kortvändningar</a><a href="/pamela-idle-scene.html">VILA med 14 kort</a><a href="/pamela-loop.html">Hela rundan</a></nav><h1>VILA → REDO · rörelsen finns, sista skarven återstår</h1><p>Ny tresekundersbrygga mellan befintlig VILA och första givningen. 90 originalrutor, 30 fps. Grönt underlag gör skillnader i ansikte, hand och ljus synliga.</p><video controls muted playsinline preload="metadata" src="/files/${seams.path}"></video><p>133 rutor med skarvar vid 22 och 112. Utgången har kvarvarande skillnader i ansikte, grepp och ljus. Kandidaten är därför inte aktiverad i hela rundan.</p><p><a href="/files/${native.output.path}" download>Ladda ned den oförändrade tresekunderstagningen</a></p><h2>REDO → VILA · jämför direkt skarv och befintlig inledning</h2>${entry.outputs.map((m:any)=>`<h3>${m.id==='direct-return'?'Före · direkt skarv':'Efter · befintlig viloinledning'}</h3><video controls muted playsinline preload="metadata" src="/files/${m.path}"></video>`).join('')}<p>Ingen övertoning, frysning eller tidsändring. Källbredden 1762 får en kopierad kantpixel på varje sida när den möter 1764; kroppen skalas inte om. Poseförbättring är inte samma sak som en godkänd rörelseskarv.</p></main>`),{flag:'wx'});
const manifest={schemaVersion:3,snapshot,preparedAt:now,status:'review-candidate-not-production-accepted',sources:scenes.map((s,i)=>({id:s.id,source:s.atlas.source,atlas:evidences[i].manifest,verification:s.atlas.verification,shoeGeometry:!!s.shoeAssets,contactCalibration:s.id==='C2-P4'})),independentLayers:['card-front','card-back','room','table','shoe-body'],idleScene:catalog.idleScene,seamStudy:{url:'/pamela-idle-ready.html',original:native.output,seams:{path:seams.path,sha256:seams.sha256},accepted:false},code:sourceCode,audits,compatibility,limitations:['Shoe/contact geometry is source-bound to P4 only','Authored 2.5D geometry; dealer lighting is baked','New bridge exit remains unaccepted; existing complete round remains unchanged','Engine identity and reveal permission remain external; examples use explicit fixtures','Optical reviews are sampled unless the evidence explicitly says otherwise'],productionAccepted:false};
await writeFile(out+'/pamela-combined-manifest.json',JSON.stringify(manifest,null,2));
let overview=await readFile(out+'/pamela-loop.html','utf8');assert.ok(overview.includes('id="kombinerade-lager"'));
overview=overview.replace(/<section id="kombinerade-lager">[\s\S]*?<\/section>/,`<section id="kombinerade-lager"><h2>Nytt · kortvändningar på plats 2, 3, 4 och 5</h2><p>Fyra egna kalibreringar i samma spelare. Byt fram/baksida, rum och bord; plats 4 har även två skokroppar.</p><p><a href="/pamela-combined.html"><strong>Öppna kortvändning och scenbyten →</strong></a> · <a href="/pamela-flip-p3.html">Plats 3 före/efter</a> · <a href="/pamela-flip-p5.html">Plats 5 före/efter</a> · <a href="/pamela-idle-ready.html">Ny VILA → REDO-brygga och återgångsprov</a></p><p class="muted">Fullrundan nedan är bevarad. De nya sidbytena och bryggan är separata granskningskandidater.</p></section>`).replace(/<p\b[^>]*>(?:Snapshot:\s*)?pamela-loop-review-[a-z0-9-]+<\/p>/,`<p id="review-snapshot" class="muted">Snapshot: ${snapshot}</p>`);
await writeFile(out+'/pamela-loop.html',overview);loop.snapshot=snapshot;loop.studies.combinedStage={url:'/pamela-combined.html',manifest:'/pamela-combined-manifest.json',sourceHashes:scenes.map(s=>s.atlas.source.sha256),productionAccepted:false};loop.studies.idleReady={url:'/pamela-idle-ready.html',productionAccepted:false};await writeFile(out+'/pamela-loop-manifest.json',JSON.stringify(loop,null,2));
const latest=await read(out+'/latest.json');delete latest.publishedAt;Object.assign(latest,{snapshot,preparedAt:now,reviewUrl:'/pamela-combined.html',combinedSceneUrl:'/pamela-combined.html',combinedSceneManifest:'/pamela-combined-manifest.json',idleReadyUrl:'/pamela-idle-ready.html',note:'Four source-bound turns. Bridge exit is still under review. R14 retained as rollback. No production acceptance.'});await writeFile(out+'/latest.json',JSON.stringify(latest,null,2));
const top=await read(out+'/manifest.json');Object.assign(top,{snapshot,latestReview:{url:'/pamela-combined.html',manifest:'/pamela-combined-manifest.json',status:'candidate-not-production-accepted'}});await writeFile(out+'/manifest.json',JSON.stringify(top,null,2));
const routes=await read(destination+'/.vercel/output/config.json');routes.routes.unshift({src:'/pamela-(flip-p3|flip-p5|idle-ready).*',headers:{'Cache-Control':'no-cache, max-age=0, must-revalidate'},continue:true});await writeFile(destination+'/.vercel/output/config.json',JSON.stringify(routes));
const bundles=[];for(const n of await readdir(out))if(/^pamela-combined.*\.(js|html)$/.test(n)){const b=await readFile(out+'/'+n);assert.ok(!b.toString().includes(root));bundles.push({path:'/'+n,sha256:hash(b)});}
for(const c of [...sourceCode,...baseline,...supplemental])await checked(c);
const currentPageArtifacts=[];for(const n of ['pamela-combined.html','pamela-combined-manifest.json','pamela-flip-p3.html','pamela-flip-p5.html','pamela-idle-ready.html','pamela-loop.html','pamela-loop-manifest.json','latest.json','manifest.json'])currentPageArtifacts.push({path:'/'+n,sha256:hash(await readFile(out+'/'+n))});
const receipt={status:'prepared-not-uploaded',snapshot,preparedAt:now,destination,previous,sourcePacket:previous,projectId,teamId,projectName:project.projectName,baselineDeployment:old.deploymentId,sourceCode,supplemental,compatibility,combined:{url:'/pamela-combined.html',manifest:'/pamela-combined-manifest.json',sourceHashes:scenes.map(s=>s.atlas.source.sha256)},media,newMedia,bundles,currentPageArtifacts,inherited:{files:inherited,hardlinkedMedia:hardlinks},checks:{sourceSpecificTimingAndLayers:true,noGuardOrOverlapWrites:true,baselineUnchanged:true,sourceSnapshotStable:true,additionalProvenanceBound:true},apiCalls:0,uploaded:false,productionAccepted:false};
await writeFile(destination+'/receipt.json',JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({destination,snapshot,inherited,hardlinks,newMedia:newMedia.length,bundles:bundles.length}));
