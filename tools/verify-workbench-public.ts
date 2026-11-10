import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const target=await json('references/public-review.json'),ready=await json('.runtime/public-review-ready.json');
const origin='https://scout-dealerlab.vercel.app';
if(target.publicUrl!==origin||target.teamSlug!=='scoutgaming'||target.projectName!=='scout-dealerlab')throw Error('Unexpected project');
const get=async(p:string)=>{const r=await fetch(new URL(p,origin),{headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error(p+' HTTP '+r.status);return r;};
const page=await(await get('/studio?verify='+target.snapshot)).text();
const match=/<script id="studio-workbench-props" type="application\/json">([\s\S]*?)<\/script>/.exec(page);
if(!match)throw Error('Missing studio data');
const props=JSON.parse(match[1]);
if(props.snapshot!==target.snapshot||props.clips.length!==6)throw Error('Stale or missing clips');
const latest=await(await get('/latest.json')).json() as any;
if(latest.studio?.url!=='/studio'||latest.snapshot!==props.snapshot)throw Error('Latest mismatch');
const bundle=new Uint8Array(await(await get('/studio-workbench.js')).arrayBuffer());
const localBundle=await readFile(ready.staticDirectory+'/studio-workbench.js');
if(sha(bundle)!==sha(localBundle))throw Error('Public bundle differs from export');
const proofs=[];
for(const clip of props.clips.filter((c:any)=>c.id==='a-original-cut'||c.id==='b-trimmed-entry-candidate')){
 const bytes=new Uint8Array(await(await get(clip.native.url)).arrayBuffer());if(sha(bytes)!==clip.native.sha256)throw Error('Cut bytes changed');
 proofs.push({id:clip.id,sha256:sha(bytes),bytes:bytes.length});
}
await get('/underlag/pamela-skarvprov.json');
const verification={checkedAt:new Date().toISOString(),snapshot:props.snapshot,clipCount:props.clips.length,publicBundleSha:sha(bundle),newCutFullHttpHashes:proofs,ui:'Separate browser check required'};
await writeFile('.runtime/workbench-public-verification.json',JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify({snapshot:props.snapshot,clips:props.clips.length,newCutHttpHashes:proofs.length,bundleMatches:true}));
