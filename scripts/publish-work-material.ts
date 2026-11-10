/** Publish the already-public current review selection to the dedicated Dealerlab Blob store. */
import assert from 'node:assert/strict';
import {createReadStream} from 'node:fs';
import {readFile, writeFile, stat, mkdir, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {put, head, BlobNotFoundError} from '@vercel/blob';

type Asset = {source:string;sha256:string;bytes:number;kind:string;id?:string};
const root=process.cwd();
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const digest=async(p:string)=>{const h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);return h.digest('hex');};
const target=await read('references/public-review.json');
assert.equal(target.projectId,'prj_mQwHzspK3GrrJA04eFOorFxth0d5');
assert.equal(target.teamId,'team_Scxorb9qtZHjNae1YEQnFCaT');
const review=await read(target.currentExport+'/.vercel/output/static/granskning/manifest.json');
assert.equal(review.snapshot,target.snapshot);
const chain=review.files.find((f:Asset)=>f.source===review.chain.path);
assert.ok(chain,'Missing current chain');
const assets:Asset[]=[chain,review.bank.compact,review.bank.full,...review.bank.clips,review.bank.zip];
assert.equal(assets.length,18,'Review selection changed: inspect before broadening publication');
for(const a of assets){
  assert.match(a.source,/^runs\/[\w./-]+\.(mp4|zip)$/);
  assert.ok(!a.source.split('/').includes('..'));
  assert.match(a.sha256,/^[a-f0-9]{64}$/);
  const abs=path.resolve(root,a.source);assert.ok(abs.startsWith(root+path.sep));
  for(let cur=abs;cur!==path.parse(cur).root;cur=path.dirname(cur))assert.ok(!(await lstat(cur)).isSymbolicLink(),'Linked source');
  assert.equal((await stat(abs)).size,a.bytes);
  assert.equal(await digest(abs),a.sha256,'Changed selected source '+a.source);
}
const plan={schemaVersion:1,project:'snyggare-dealer',snapshot:review.snapshot,files:assets.length,bytes:assets.reduce((n,a)=>n+a.bytes,0),assets};
await mkdir('.runtime',{recursive:true});
await writeFile('.runtime/blob-publication-plan.json',JSON.stringify(plan,null,2));
if(process.argv.includes('--plan')){console.log(JSON.stringify({files:plan.files,bytes:plan.bytes,snapshot:plan.snapshot}));process.exit(0);}

const config=await read('references/blob-storage.json');
assert.equal(config.projectId,target.projectId);assert.equal(config.teamId,target.teamId);assert.equal(config.access,'public');
assert.match(config.storeId,/^store_[a-zA-Z0-9]+$/);
// Isolated credentials pulled from the verified review project. Never read the lab's existing private-store credentials.
const env=parseEnv(await readFile('.runtime/dealerlab-blob.env','utf8'));
if(env.BLOB_STORE_ID)assert.equal(env.BLOB_STORE_ID,config.storeId,'Wrong connected store');
assert.ok(env.VERCEL_OIDC_TOKEN||env.BLOB_READ_WRITE_TOKEN,'Missing publication credential');
const options={access:'public' as const,storeId:config.storeId,oidcToken:env.VERCEL_OIDC_TOKEN,token:env.BLOB_READ_WRITE_TOKEN};
const records:any[]=[];
const dealers=await read('references/dealers.json');
assert.ok(dealers.dealers.some((d:{id:string})=>d.id==='pamela-pilot'));
const result:any={schemaVersion:1,project:'snyggare-dealer',dealerId:'pamela-pilot',snapshot:review.snapshot,storeId:config.storeId,access:'public',originalsRetained:true,files:records};
for(const a of assets){
  const objectPath='objects/'+a.sha256+path.extname(a.source);
  let blob;
  try{blob=await head(objectPath,options);}catch(error){if(!(error instanceof BlobNotFoundError))throw error;}
  if(!blob)blob=await put(objectPath,createReadStream(a.source),{...options,addRandomSuffix:false,allowOverwrite:false,multipart:a.bytes>20*1024*1024,contentType:a.kind==='mp4'?'video/mp4':'application/zip',cacheControlMaxAge:31536000});
  const url=new URL(blob.url);assert.ok(url.hostname.endsWith('.public.blob.vercel-storage.com'));assert.equal(decodeURIComponent(url.pathname),'/'+objectPath);
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});assert.equal(response.status,200);assert.ok(response.body);
  const h=createHash('sha256');let bytes=0;for await(const chunk of response.body){h.update(chunk);bytes+=chunk.length;}
  assert.equal(bytes,a.bytes);assert.equal(h.digest('hex'),a.sha256,'Public Blob bytes differ');
  records.push({...a,url:blob.url,objectPath,verifiedAt:new Date().toISOString()});
  await writeFile('references/work-material.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({verified:records.length,total:assets.length,source:a.source}));
}
result.completedAt=new Date().toISOString();result.bytes=plan.bytes;result.complete=true;
const body=JSON.stringify(result,null,2),indexHash=createHash('sha256').update(body).digest('hex');
const indexPath='indexes/'+indexHash+'.json';
const published=await put(indexPath,body,{...options,addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:31536000});
const response=await fetch(published.url);assert.equal(response.status,200);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),indexHash);
result.publicIndex={url:published.url,sha256:indexHash};
await writeFile('references/work-material.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({complete:true,files:records.length,bytes:plan.bytes,index:published.url}));
