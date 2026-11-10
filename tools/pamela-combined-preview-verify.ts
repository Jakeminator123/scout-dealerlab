import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const packet=process.argv.find(a=>a.startsWith('--packet='))?.slice(9)??'exports/pamela-loop-review-20261109-r13',base=process.argv.find(a=>a.startsWith('--base='))?.slice(7);
const deploymentId=process.argv.find(a=>a.startsWith('--deployment='))?.slice(13);assert.match(deploymentId??'',/^dpl_[A-Za-z0-9]+$/);
assert.match(packet,/^exports\/pamela-loop-review-202611(?:09-r(?:13|14|15)|10-r16)$/);
assert.ok(base&&/^https:\/\/scout-dealerlab-[a-z0-9]+-scoutgaming\.vercel\.app$/.test(base));
const r=JSON.parse(await readFile(packet+'/receipt.json','utf8'));assert.equal(r.projectId,'prj_mQwHzspK3GrrJA04eFOorFxth0d5');assert.equal(r.teamId,'team_Scxorb9qtZHjNae1YEQnFCaT');
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),checks:Array<{path:string;status:number;sha256:string;receivedSha256:string;verifiedToolbarSuffix:boolean}>=[];
const savedRoot=packet+'/preview-check/'+new Date().toISOString().replace(/\D/g,'');await mkdir(savedRoot,{recursive:true});
const items=[...r.bundles.filter((b:any)=>b.path.endsWith('.js')),...r.currentPageArtifacts,...r.newMedia.map((m:any)=>({path:m.publicPath,sha256:m.sha256}))];let next=0;
await Promise.all(Array.from({length:4},async()=>{for(;;){const index=next++;if(index>=items.length)return;const item=items[index];
 assert.match(item.path,/^\/[A-Za-z0-9_.\/-]+$/);
 const saved=path.resolve(savedRoot,String(index)+'.bin');assert.ok(!saved.includes("'"));
 // The installed CLI supplies existing deployment protection credentials. No
 // protection setting or secret is exposed, stored in this report, or changed.
 // This CLI's curl forwards --scope to curl.exe; rely on the already inspected
 // exact project.json (team+project IDs checked above), with an explicit URL.
 for(let attempt=1;attempt<=2;attempt++){
  try{await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`& vercel curl '${item.path}' --deployment '${base}' -- --silent --show-error --fail --output '${saved}'`],{cwd:path.resolve(packet),windowsHide:true});break;}
  catch(error){if(attempt===2)throw error;console.log(JSON.stringify({retryRead:item.path,attempt:2}));}
 }
 const bytes=await readFile(saved),receivedSha256=hash(bytes);let verifiedToolbarSuffix=false,sourceBytes=bytes;
 if(item.path.endsWith('.html')&&receivedSha256!==item.sha256){
  const expected=await readFile(packet+'/.vercel/output/static'+item.path),suffix=Buffer.from(`<script async data-explicit-opt-in="true" data-deployment-id="${deploymentId}" src="https://vercel.live/_next-live/feedback/feedback.js"></script>`);
  assert.deepEqual(bytes,Buffer.concat([expected,suffix]),'Only the exact inspected deployment toolbar suffix is permitted');sourceBytes=expected;verifiedToolbarSuffix=true;
 }
 assert.equal(hash(sourceBytes),item.sha256,item.path);checks.push({path:item.path,status:200,sha256:item.sha256,receivedSha256,verifiedToolbarSuffix});
}}));
await writeFile(packet+'/preview-verification.json',JSON.stringify({base,deploymentId,checkedAt:new Date().toISOString(),snapshot:r.snapshot,savedRoot,checks},null,2));console.log(JSON.stringify({base,verifiedHashes:checks.length,toolbarSuffixes:checks.filter(c=>c.verifiedToolbarSuffix).length,snapshot:r.snapshot}));
