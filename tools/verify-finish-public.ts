import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const target=JSON.parse(await readFile('references/public-review.json','utf8'));
const ready=JSON.parse(await readFile('.runtime/public-review-ready.json','utf8'));
const origin='https://scout-dealerlab.vercel.app';
if(target.publicUrl!==origin||target.projectName!=='scout-dealerlab'||target.teamSlug!=='scoutgaming')throw Error('Wrong review target');
const get=async(p:string)=>{const r=await fetch(new URL(p,origin),{headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error(p+': '+r.status);return r;};
const manifest=await(await get('/manifest.json?verify='+target.snapshot)).json() as any;
const latest=await(await get('/latest.json?verify='+target.snapshot)).json() as any;
if(manifest.snapshot!==target.snapshot||latest.snapshot!==target.snapshot)throw Error('Snapshot mismatch');
const newAssets=manifest.files.filter((f:any)=>/^runs\/20261109-pamela-(finish-study|idle-seams)\//.test(f.sourcePath)&&/\.png$/.test(f.sourcePath));
if(newAssets.length!==6)throw Error('Wrong finish asset count');
const results=[];
for(let i=0;i<newAssets.length;i+=4){
 const batch=await Promise.allSettled(newAssets.slice(i,i+4).map(async(f:any)=>{const b=new Uint8Array(await(await get(f.path)).arrayBuffer());if(sha(b)!==f.sha256||f.publicPreview)throw Error('Image changed '+f.sourcePath);return {source:f.sourcePath,sha256:f.sha256,bytes:b.length,pass:true};}));
 for(const r of batch){if(r.status==='rejected')throw r.reason;results.push(r.value);}
}
for(const p of ['/scenfinish','/kortmaterial','/vila'])if(!(await(await get(p)).text()).includes(target.snapshot))throw Error('Stale page '+p);
const bundle=new Uint8Array(await(await get('/kortmaterial.js')).arrayBuffer());
if(sha(bundle)!==sha(await readFile(ready.staticDirectory+'/kortmaterial.js')))throw Error('Bundle differs');
for(const p of ['pamela-finish.json','pamela-idle-skarvar.json','scenprofil.json','kortmaterial.json'])await get('/underlag/'+p);
const localIdle=JSON.parse(await readFile('runs/20261109-pamela-idle-composite/composition.json','utf8'));
for(const clip of localIdle.clips){const f=manifest.files.find((f:any)=>f.sourcePath===clip.source.path);if(f?.sha256!==clip.source.sha256||f.publicPreview)throw Error('Original changed');}
if(!latest.finish||!latest.cardMaterial)throw Error('Missing current links');
const result={checkedAt:new Date().toISOString(),snapshot:target.snapshot,images:results,bundleSha:sha(bundle),sourceVideosUnchanged:true,originalVideoFullHttpHashes:'Previously verified; unchanged manifest hashes in this publication',ui:'Separate WebView check'};
await writeFile('.runtime/finish-public-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({snapshot:target.snapshot,newImageHttpHashes:results.length,bundleMatches:true,sourceVideosUnchanged:true}));
