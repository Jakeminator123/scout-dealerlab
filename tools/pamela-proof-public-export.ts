import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile,lstat,mkdir,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='exports/public-review-20261109043726';
const REPORT='runs/20261109-pamela-local-release-proof/report.json';
const PROJECT='prj_mQwHzspK3GrrJA04eFOorFxth0d5',TEAM='team_Scxorb9qtZHjNae1YEQnFCaT';
type KeyFrame={frame:number;label:string;description?:string};
type Comparison={before:string;after:string;frames:number;fps:number;startSourceFrame:number;title?:string;description?:string;keyFrames?:KeyFrame[]};
export type ProofReport={title:string;status:string;limitations:string[];contact?:Comparison;shoe?:Comparison;sequence?:{native:string;portrait?:string;frames:number;fps:number;seams?:{atSeconds:number;label:string}[]};evidence?:{sheet?:string;shoeSheet?:string;shadowSheet?:string}};
type Media={role:string;sourcePath:string;path:string;sha256:string;bytes:number};
const execute=promisify(execFile);
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const esc=(text:unknown)=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const inside=(parent:string,child:string)=>{const rel=path.relative(parent,child);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
export function checkPublicText(text:string,label:string){
 if(/\bsk-(?:proj-|live-)?[A-Za-z0-9_-]{28,}|\bgh[pousr]_[A-Za-z0-9]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))throw Error(`Possible credential: ${label}`);
 for(const match of text.matchAll(/https?:\/\/[^\s"'<>`]+/g)){
  let u:URL;try{u=new URL(match[0]);}catch{continue;}
  if(u.username||u.password||[...u.searchParams].some(([k,v])=>/^(?:token|_jwt|signature|X-Amz-Signature)$/i.test(k)&&v.length>15))throw Error(`Authenticated URL: ${label}`);
 }
}
export function validateProofReport(value:unknown,requireShoe=true):ProofReport{
 if(!value||typeof value!=='object')throw Error('Missing report');
 const r=value as ProofReport;
 if(typeof r.title!=='string'||typeof r.status!=='string'||!Array.isArray(r.limitations)||r.limitations.some(x=>typeof x!=='string'))throw Error('Invalid report text');
 if(requireShoe&&!r.shoe)throw Error('report.shoe is not ready; no package created');
 if(!r.shoe&&!r.contact&&!r.sequence)throw Error('No review media');
 for(const [id,c] of [['shoe',r.shoe],['contact',r.contact]] as const){if(!c)continue;
  if(typeof c.before!=='string'||typeof c.after!=='string'||!Number.isInteger(c.frames)||c.frames<1||!Number.isFinite(c.fps)||c.fps<=0||!Number.isInteger(c.startSourceFrame)||c.startSourceFrame<0)throw Error(`Invalid comparison: ${id}`);
  for(const k of c.keyFrames??[])if(!Number.isInteger(k.frame)||k.frame<c.startSourceFrame||k.frame>=c.startSourceFrame+c.frames||typeof k.label!=='string')throw Error(`Invalid keyframe: ${id}`);
 }
 if(r.sequence&&(!Number.isInteger(r.sequence.frames)||r.sequence.frames<1||!Number.isFinite(r.sequence.fps)||r.sequence.fps<=0||typeof r.sequence.native!=='string'))throw Error('Invalid sequence');
 return r;
}
export function selectedMedia(r:ProofReport){
 const items:{role:string;sourcePath:string}[]=[];
 for(const [id,c] of [['shoe',r.shoe],['contact',r.contact]] as const)if(c){items.push({role:`${id}.before`,sourcePath:c.before},{role:`${id}.after`,sourcePath:c.after});}
 if(r.sequence){items.push({role:'sequence.native',sourcePath:r.sequence.native});if(r.sequence.portrait)items.push({role:'sequence.portrait',sourcePath:r.sequence.portrait});}
 if(r.evidence?.sheet)items.push({role:'evidence.sheet',sourcePath:r.evidence.sheet});
 if(r.evidence?.shoeSheet)items.push({role:'evidence.shoeSheet',sourcePath:r.evidence.shoeSheet});
 if(r.evidence?.shadowSheet)items.push({role:'evidence.shadowSheet',sourcePath:r.evidence.shadowSheet});
 for(const i of items){const p=i.sourcePath.replace(/\\/g,'/'),parts=p.split('/');
  if(!p.startsWith('runs/')||parts.some(x=>!x||x.startsWith('.')||x.includes(':')||/^(?:private|original|input)$/i.test(x))||!parts.some(x=>['render','qa','frames'].includes(x))||! /\.(?:mp4|webm|png|jpe?g|webp)$/i.test(p))throw Error(`Only rendered review media permitted: ${i.role}`);
 }
 return items;
}
async function safeLocal(relative:string){
 const full=path.resolve(ROOT,relative);if(!inside(ROOT,full))throw Error('Path outside workspace');
 let cursor=ROOT;for(const component of path.relative(ROOT,full).split(path.sep)){cursor=path.join(cursor,component);if((await lstat(cursor)).isSymbolicLink())throw Error('Linked input path');}
 if(!inside(await realpath(ROOT),await realpath(full)))throw Error('Resolved input outside workspace');return full;
}
async function fileHash(file:string){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
async function walk(dir:string,prefix=''):Promise<string[]>{
 const files:string[]=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Linked baseline asset');const rel=prefix?`${prefix}/${e.name}`:e.name;
  if(e.name.startsWith('.env')||/^(private|functions|server)$/i.test(e.name))throw Error(`Forbidden packet entry: ${rel}`);
  if(e.isDirectory())files.push(...await walk(path.join(dir,e.name),rel));else if(e.isFile())files.push(rel);else throw Error('Unsupported file entry');
 }return files.sort();
}
export function renderProofPage(r:ProofReport,media:Media[]){
 const url=(role:string)=>{const item=media.find(m=>m.role===role);if(!item)throw Error(`Missing public media: ${role}`);return item.path;};
 const groups=([['shoe',r.shoe,39,'Skon – före och efter'],['contact',r.contact,117,'Kortsläpp – före och efter']] as const).filter(x=>x[1]);
 const sections=groups.map(([id,c0,start,title])=>{const c=c0!;const initial=Math.max(c.startSourceFrame,Math.min(c.startSourceFrame+c.frames-1,start));const keys=c.keyFrames??(id==='contact'?[{frame:117,label:'117 – före övergången'},{frame:118,label:'118 – efter övergången'}]:[{frame:39,label:'39 – första jämförelsen'}]);
  return `<section class="comparison" data-start="${c.startSourceFrame}" data-count="${c.frames}" data-fps="${c.fps}" data-initial="${initial}"><h2>${esc(c.title??title)}</h2>${c.description?`<p>${esc(c.description)}</p>`:''}<div class="pair"><figure><figcaption>Före</figcaption><video preload="metadata" playsinline src="${esc(url(id+'.before'))}"></video></figure><figure><figcaption>Efter</figcaption><video preload="metadata" playsinline src="${esc(url(id+'.after'))}"></video></figure></div><div class="controls"><button data-play>Spela båda</button><button data-step="-1">−1 ruta</button><button data-step="1">+1 ruta</button><label>Hastighet <select data-rate><option value="1">1×</option><option value="0.5">0,5×</option><option value="0.25">0,25×</option></select></label><output aria-live="polite"></output></div><div class="controls">${keys.filter(k=>k.frame>=c.startSourceFrame&&k.frame<c.startSourceFrame+c.frames).map(k=>`<button data-frame="${k.frame}" title="${esc(k.description??'')}">${esc(k.label)}</button>`).join('')}</div><p class="note">Synkad tidsposition vid 1×, 0,5× och 0,25×. Bildrutesteg pausar båda filmerna. Endast renderade jämförelsefiler ingår här.</p>${id==='contact'?'<p><strong>Ruta 117/118:</strong> I den tidigare versionen växlade det böjda, delvis täckta kortet till en fast plan yta här. Jämför tryck, silhuett och fingrar på båda sidor av gränsen. Efter-versionen är ett lokalt korrigeringsprov, inte ett bevis för fysisk 3D eller godkända skarvar.</p>':''}</section>`;
 }).join('');
 const seq=r.sequence?`<section><h2>Vila → två giv → vila</h2><p>Slutvilan behåller två kort. Filmen loopas inte tillbaka till tomt bord.</p><video id="sequence" controls playsinline preload="metadata" src="${esc(url('sequence.native'))}"></video><div class="controls"><button data-sequence-src="${esc(url('sequence.native'))}">Liggande</button>${r.sequence.portrait?`<button data-sequence-src="${esc(url('sequence.portrait'))}">Stående</button>`:''}${(r.sequence.seams??[]).map(s=>`<button data-seam="${s.atSeconds}">${esc(s.label)}</button>`).join('')}</div></section>`:'';
 const images=media.filter(m=>m.role.startsWith('evidence.')).map(m=>`<details${m.role==='evidence.shadowSheet'?' open':''}><summary>${m.role==='evidence.shadowSheet'?'Skugga: tidigare / mindre / ingen tillagd skugga':'Visa bildrutebevis'}</summary><img loading="lazy" src="${esc(m.path)}" alt="Bildrutor för jämförelse av Pamela-provet"></details>`).join('');
 return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self'; media-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(r.title)}</title><style>body{margin:auto;max-width:1400px;padding:24px;background:#111a20;color:#edf2f4;font:17px/1.5 system-ui}a{color:#a8dcff}section{padding:18px 0;border-top:1px solid #4b5960;margin-top:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{font-weight:700}video,img{max-width:100%;width:100%;background:#080d10;max-height:75vh;object-fit:contain}.controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0}button,select{font:inherit;border:1px solid #677985;border-radius:6px;padding:9px 12px;background:#23343f;color:#fff}button{cursor:pointer}.note{color:#bdcbd2}#sequence{max-height:75vh}@media(max-width:650px){body{padding:14px}.pair{grid-template-columns:1fr}}</style><script src="/pamela-prov.js" defer></script></head><body><nav><a href="/studio">← Studion</a> · <a href="/">Alla underlag</a> · <a href="/pamela-prov-manifest.json">Filhashar och publiceringsomfattning</a></nav><h1>${esc(r.title)}</h1><p>${esc(r.status)}</p><ul>${r.limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${sections}${seq}${images}<p class="note">Den äldre nedladdningsfilen granskningspaket.zip innehåller föregående snapshot. Detta avgränsade tillägg finns på sidan och i dess separata manifest.</p></body></html>`;
}
export const playbackScript=`'use strict';
for(const box of document.querySelectorAll('.comparison')){
 const videos=[...box.querySelectorAll('video')],master=videos[0],other=videos[1],fps=Number(box.dataset.fps),start=Number(box.dataset.start),count=Number(box.dataset.count),output=box.querySelector('output'),button=box.querySelector('[data-play]');let tick=0;
 const frame=()=>Math.min(count-1,Math.max(0,Math.floor(master.currentTime*fps+0.001)));
 const label=()=>{output.textContent='Källruta '+(start+frame());button.textContent=master.paused?'Spela båda':'Pausa båda';};
 const pause=()=>{videos.forEach(v=>v.pause());cancelAnimationFrame(tick);label();};
 const seek=f=>{pause();const local=Math.max(0,Math.min(count-1,f-start)),time=(local+0.25)/fps;videos.forEach(v=>{if(v.readyState>=1)v.currentTime=time;});label();};
 const sync=()=>{if(master.paused)return;const d=other.currentTime-master.currentTime;if(Math.abs(d)>0.025)other.currentTime=master.currentTime;label();tick=requestAnimationFrame(sync);};
 let initialized=false;const initialize=()=>{if(!initialized&&videos.every(v=>v.readyState>=1)){initialized=true;seek(Number(box.dataset.initial));}};videos.forEach(v=>v.addEventListener('loadedmetadata',initialize,{once:true}));initialize();
 videos.forEach(v=>v.addEventListener('error',()=>{pause();output.textContent='Filmen kunde inte läsas.';}));
 button.addEventListener('click',async()=>{if(!master.paused){pause();return;}if(frame()>=count-1)seek(start);other.currentTime=master.currentTime;try{await Promise.all(videos.map(v=>v.play()));sync();}catch{pause();output.textContent='Tryck Spela för att försöka igen.';}});
 for(const b of box.querySelectorAll('[data-step]'))b.addEventListener('click',()=>seek(start+frame()+Number(b.dataset.step)));
 for(const b of box.querySelectorAll('[data-frame]'))b.addEventListener('click',()=>seek(Number(b.dataset.frame)));
 box.querySelector('[data-rate]').addEventListener('change',e=>{videos.forEach(v=>v.playbackRate=Number(e.target.value));});
 master.addEventListener('timeupdate',label);master.addEventListener('ended',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});label();
}
const seq=document.querySelector('#sequence');if(seq){for(const b of document.querySelectorAll('[data-seam]'))b.addEventListener('click',()=>{seq.pause();seq.currentTime=Number(b.dataset.seam);});for(const b of document.querySelectorAll('[data-sequence-src]'))b.addEventListener('click',()=>{const t=seq.currentTime;seq.pause();seq.src=b.dataset.sequenceSrc;seq.addEventListener('loadedmetadata',()=>{seq.currentTime=Math.min(t,seq.duration);},{once:true});});}
`;
export async function exportProof(options:{out?:string;checkOnly?:boolean;allowMissingShoe?:boolean}={}){
 if(options.allowMissingShoe&&!options.checkOnly)throw Error('--allow-missing-shoe requires --check-only; an incomplete proof cannot be exported');
 const reportFile=await safeLocal(REPORT),reportBytes=await readFile(reportFile),r=validateProofReport(JSON.parse(reportBytes.toString()),!options.allowMissingShoe);checkPublicText(JSON.stringify(r),'report');
 const baseline=await safeLocal(BASE),baseOutput=await safeLocal(BASE+'/.vercel/output'),baseStatic=await safeLocal(BASE+'/.vercel/output/static');
 const bindingBytes=await readFile(await safeLocal(BASE+'/.vercel/project.json')),binding=JSON.parse(bindingBytes.toString());
 await safeLocal(BASE+'/.vercel/output/config.json');
 if(binding.projectId!==PROJECT||binding.orgId!==TEAM||binding.projectName!=='scout-dealerlab')throw Error('Wrong baseline project binding');
 const outputNames=await readdir(baseOutput);if(outputNames.some(n=>n!=='config.json'&&n!=='static'))throw Error('Baseline is not static-only');
 const baseFiles=await walk(baseStatic),media:Media[]=[];
 for(const item of selectedMedia(r)){
  const file=await safeLocal(item.sourcePath),s=await lstat(file);if(!s.isFile())throw Error('Media is not a file');
  if(/\.(mp4|webm)$/i.test(file)){
   const parsed=JSON.parse((await execute('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames:format=duration','-of','json',file],{windowsHide:true,maxBuffer:4000})).stdout),stream=parsed.streams?.[0],contract=item.role.startsWith('shoe.')?r.shoe:item.role.startsWith('contact.')?r.contact:r.sequence;
   if(!stream||!contract)throw Error('Missing video metadata or contract');const [n,d]=stream.avg_frame_rate.split('/').map(Number);
   if(Math.abs(n/d-contract.fps)>0.0001||Math.abs(Number(parsed.format.duration)-contract.frames/contract.fps)>1/contract.fps||stream.nb_frames&&stream.nb_frames!=='N/A'&&Number(stream.nb_frames)!==contract.frames)throw Error(`Media timing mismatch: ${item.role}`);
  }
  const sha256=await fileHash(file);media.push({...item,path:`/pamela-prov-media/${sha256}${path.extname(file).toLowerCase()}`,sha256,bytes:s.size});
 }
 const html=renderProofPage(r,media);checkPublicText(html,'new page');checkPublicText(playbackScript,'new script');
 const baseManifest=JSON.parse(await readFile(path.join(baseStatic,'manifest.json'),'utf8'));
 if(baseManifest.snapshot!=='public-review-20261109043726')throw Error('Unexpected baseline snapshot');
 const id='pamela-proof-'+new Date().toISOString().replace(/[-:.TZ]/g,''),out=path.resolve(ROOT,options.out??`exports/${id}`),exportsRoot=path.join(ROOT,'exports');
 if(!inside(exportsRoot,out)||out===baseline||inside(baseline,out))throw Error('Output must be a new sibling beneath exports');
 let parent=path.dirname(out);while(inside(ROOT,parent)){try{if((await lstat(parent)).isSymbolicLink())throw Error('Linked output parent');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}parent=path.dirname(parent);}
 try{await lstat(out);throw Error('Output already exists; refusing overwrite');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 // Inspect every inherited text asset, not only new report content. Never read .env.
 for(const rel of baseFiles)if(/\.(?:html|js|json|txt|md|css|svg)$/i.test(rel))checkPublicText(await readFile(path.join(baseStatic,rel),'utf8'),rel);
 const staticDirectory=path.join(out,'.vercel/output/static');
 if(options.checkOnly)return {status:'validated-not-created',directory:out,staticDirectory,baseline:BASE,baseFiles:baseFiles.length,media,reportSha256:hash(reportBytes),projectId:PROJECT,teamId:TEAM,uploaded:false};
 await mkdir(staticDirectory,{recursive:true});
 const inherited=[];
 for(const rel of baseFiles){const src=path.join(baseStatic,rel),dest=path.join(staticDirectory,rel);await mkdir(path.dirname(dest),{recursive:true});await copyFile(src,dest);const sha256=await fileHash(src);if(sha256!==await fileHash(dest))throw Error('Inherited copy hash mismatch');inherited.push({path:'/'+rel,sha256});}
 await writeFile(path.join(out,'.vercel/project.json'),bindingBytes);
 for(const m of media){const dest=path.join(staticDirectory,m.path.slice(1));await mkdir(path.dirname(dest),{recursive:true});await copyFile(await safeLocal(m.sourcePath),dest);if(await fileHash(dest)!==m.sha256)throw Error('Selected media changed during export');}
 const writes:Record<string,string>={'pamela-prov.html':html,'pamela-prov.js':playbackScript};
 const banner='<nav aria-label="Nytt Pamela-prov" style="padding:12px;background:#173d50;color:white"><a style="color:white;font:600 16px system-ui" href="/pamela-prov.html">Nytt Pamela-prov: sko, kortsläpp och sammanhängande sekvens</a></nav>';
 for(const rel of ['studio.html','index.html']){const old=await readFile(path.join(staticDirectory,rel),'utf8');if(!/<body\b[^>]*>/i.test(old))throw Error(`No body in ${rel}`);writes[rel]=old.replace(/<body\b[^>]*>/i,m=>m+banner);}
 const changes=[];
 for(const [rel,text] of Object.entries(writes)){checkPublicText(text,rel);await writeFile(path.join(staticDirectory,rel),text);changes.push({path:'/'+rel,beforeSha256:inherited.find(f=>f.path==='/'+rel)?.sha256??null,afterSha256:hash(text)});}
 const config=JSON.parse(await readFile(path.join(baseOutput,'config.json'),'utf8'));if(config.version!==3)throw Error('Unexpected output version');
 config.routes=[{src:'/pamela-prov(?:\\.html|\\.js|-manifest\\.json)?',headers:{'Cache-Control':'no-cache, max-age=0, must-revalidate'},continue:true},{src:'/pamela-prov',dest:'/pamela-prov.html'},...(config.routes??[])];
 const configText=JSON.stringify(config);await writeFile(path.join(out,'.vercel/output/config.json'),configText);
 const manifest={schemaVersion:1,snapshot:id,createdAt:new Date().toISOString(),projectId:PROJECT,teamId:TEAM,baselineSnapshot:baseManifest.snapshot,sourceReport:{path:REPORT,sha256:hash(reportBytes)},scope:'Rendered comparisons and sequence only. Source excerpts, originals, private files and server code are excluded from this addition. Inherited snapshot files remain unchanged except declared pages and main manifest.',sourceFieldsOmitted:['contact.source','shoe.source'],media,changes,configChange:{path:'.vercel/output/config.json',beforeSha256:await fileHash(path.join(baseOutput,'config.json')),afterSha256:hash(configText)},inheritedFiles:inherited,legacyZip:{path:'/granskningspaket.zip',unchanged:true,containsSnapshot:baseManifest.snapshot},verification:{staticOnly:true,inheritedHashesVerified:true,patternCredentialCheck:true,environmentFilesRead:false,renderedPlaybackNotYetBrowserVerified:true},uploaded:false};
 baseManifest.snapshot=id;baseManifest.proofUpdate={manifest:'/pamela-prov-manifest.json',baselineSnapshot:manifest.baselineSnapshot,sourceReportSha256:manifest.sourceReport.sha256};
 baseManifest.files??=[];baseManifest.files.push(...media.map(m=>({path:m.path,sourcePath:m.sourcePath,sha256:m.sha256,bytes:m.bytes,delivery:'byte-identical-rendered-review-copy'})));
 const mainManifestText=JSON.stringify(baseManifest,null,2)+'\n';checkPublicText(mainManifestText,'main manifest');await writeFile(path.join(staticDirectory,'manifest.json'),mainManifestText);
 changes.push({path:'/manifest.json',beforeSha256:inherited.find(f=>f.path==='/manifest.json')!.sha256,afterSha256:hash(mainManifestText)});
 const manifestText=JSON.stringify(manifest,null,2)+'\n';checkPublicText(manifestText,'proof manifest');await writeFile(path.join(staticDirectory,'pamela-prov-manifest.json'),manifestText);
 // Recheck all protected inherited files after edits and the source report after copying.
 const changed=new Set(['/studio.html','/index.html','/manifest.json']);for(const f of inherited)if(!changed.has(f.path)&&await fileHash(path.join(staticDirectory,f.path.slice(1)))!==f.sha256)throw Error('Undeclared inherited file mutation');
 if(hash(await readFile(reportFile))!==hash(reportBytes))throw Error('Report changed while building; package is not ready');
 const finalFiles=await walk(path.join(out,'.vercel/output'));if(finalFiles.some(f=>f.startsWith('functions/')))throw Error('Unexpected functions');
 const receipt={status:'ready-not-uploaded',directory:out,staticDirectory,manifest:path.join(staticDirectory,'pamela-prov-manifest.json'),snapshot:id,projectId:PROJECT,teamId:TEAM,mediaCount:media.length,changedInheritedFiles:[...changed],addedFiles:['/pamela-prov.html','/pamela-prov.js','/pamela-prov-manifest.json',...new Set(media.map(m=>m.path))],legacyZipUpdated:false,uploaded:false};
 await writeFile(path.join(out,'proof-export-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),allowed=new Set(['--out','--check-only','--allow-missing-shoe']);for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw Error('Unknown argument');if(args[i]==='--out'&&!args[++i])throw Error('Missing --out value');}
 const at=args.indexOf('--out');console.log(JSON.stringify(await exportProof({out:at>=0?args[at+1]:undefined,checkOnly:args.includes('--check-only'),allowMissingShoe:args.includes('--allow-missing-shoe')}),null,2));
}
