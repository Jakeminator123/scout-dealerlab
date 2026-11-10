import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const target=await read('references/public-review.json'),report=await read('runs/20261109-pamela-idle-composite/composition.json');
const origin='https://scout-dealerlab.vercel.app';
if(target.publicUrl!==origin||target.projectName!=='scout-dealerlab'||target.teamSlug!=='scoutgaming')throw Error('Wrong public target');
const get=async(p:string)=>{const r=await fetch(new URL(p,origin),{headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error(`${p}: HTTP ${r.status}`);return r;};
const manifest=await (await get('/manifest.json?verify='+target.snapshot)).json() as any;
if(manifest.snapshot!==target.snapshot)throw Error('Snapshot mismatch');
const assets=[...report.clips.flatMap((c:any)=>[c.source,c.native,c.portrait]),report.sequence.native,report.sequence.portrait];
const results=[];
for(let i=0;i<assets.length;i+=4){
 const checked=await Promise.allSettled(assets.slice(i,i+4).map(async(a:any)=>{const file=manifest.files.find((f:any)=>f.sourcePath===a.path);if(!file||file.sha256!==a.sha256||file.publicPreview)throw Error('Published file identity changed: '+a.path);const r=await get(file.path),b=Buffer.from(await r.arrayBuffer()),sha256=createHash('sha256').update(b).digest('hex');if(sha256!==a.sha256)throw Error('Full HTTP hash mismatch: '+a.path);return {path:a.path,url:origin+file.path,sha256,bytes:b.length,pass:true};}));
 for(const r of checked){if(r.status==='rejected')throw r.reason;results.push(r.value);}
}
const [page,client,latest,publicReport]=await Promise.all([get('/vila'),get('/vila.js'),get('/latest.json').then(r=>r.json()) as Promise<any>,get('/underlag/pamela-vila-komposition.json').then(r=>r.json()) as Promise<any>]);
if(!(await page.text()).includes(target.snapshot))throw Error('Page snapshot missing');
if(!(await client.text()).includes('idleData'))throw Error('Missing client');
if(latest.idle?.reviewUrl!=='/vila'||publicReport.sequence.native.sha256!==report.sequence.native.sha256)throw Error('Missing latest idle data');
const verification={checkedAt:new Date().toISOString(),snapshot:target.snapshot,page:'/vila',assets:results,fullHttpHashesVerified:true,sequenceFrames:630,sourceFrames:270,uiPlayback:'separate browser check'};
await writeFile('.runtime/idle-public-verification.json',JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify({snapshot:target.snapshot,verifiedAssets:results.length,fullHttpHashesVerified:true,url:origin+'/vila'}));
