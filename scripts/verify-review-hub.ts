import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const receipt=JSON.parse(await readFile('.runtime/public-review-ready.json','utf8'));
assert.equal(receipt.status,'published-and-verified');
const base='https://scout-dealerlab.vercel.app',results:any[]=[];
async function get(url:string){const response=await fetch(base+url,{headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200,url);return Buffer.from(await response.arrayBuffer());}
const bytes=await get('/granskning/manifest.json'),manifest=JSON.parse(bytes.toString());
assert.equal(manifest.snapshot,receipt.snapshot);assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.contentId);
for(const route of['/','/granskning.html','/granskning/starttext.txt','/granskning/nulage.txt','/granskning/katalog.html','/granskning/noder.json','/granskning/lagring.json','/pamela-combined.html','/pamela-bank.html']){await get(route);results.push({route,status:200});}
const media=[manifest.chain,manifest.bank.compact,manifest.bank.zip,...manifest.bank.clips];
let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<media.length){const item=media[cursor++],data=await get(item.url);assert.equal(createHash('sha256').update(data).digest('hex'),item.sha256,item.url);results.push({route:item.url,bytes:data.length,sha256:item.sha256,hashMatches:true});}}));
const range=await fetch(base+manifest.chain.url,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
for(const route of['/.env.local','/private/credentials.json','/src/server.ts']){const response=await fetch(base+route);await response.arrayBuffer();assert.equal(response.status,404,route);results.push({route,status:404});}
const evidence={verifiedAt:new Date().toISOString(),snapshot:receipt.snapshot,deploymentId:receipt.deploymentId,anonymous:true,manifestHashMatches:true,videoRange206:true,verifiedMedia:media.length,results};
await writeFile(receipt.directory+'/published-verification.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({snapshot:evidence.snapshot,anonymous:true,manifestHashMatches:true,videoRange206:true,verifiedMedia:media.length,routes:results.length}));
