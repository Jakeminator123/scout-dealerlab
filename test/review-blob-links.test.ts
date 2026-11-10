import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {link,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {applyReviewBlobLinks,restoreCachedReviewBlobLinks,restorePreparedReviewEvidence} from '../scripts/review-blob-links.ts';

const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const contents=Buffer.from('retained local review media');
const source='runs/pilot/kort blå.mp4',sha256=hash(contents),bytes=contents.length;
const localUrl='/files/'+source.split('/').map(encodeURIComponent).join('/');
const url=`https://teststore.public.blob.vercel-storage.com/objects/${sha256}.mp4`;
const config={storeId:'store_TestStore',access:'public'};
const file={source,sha256,bytes,url,verifiedAt:'2026-11-10T09:00:00.000Z'};
const stored={complete:true,storeId:config.storeId,access:'public',files:[file]};

async function fixture(t:{after:(fn:()=>Promise<void>)=>void}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'dealer-blob-refresh-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('dealer-blob-refresh-'));await rm(root,{recursive:true,force:true});});
  const directory=path.join(root,'exports/review-hub-20261110000000000'),site=path.join(directory,'.vercel/output/static');
  async function put(name:string,value:unknown){await mkdir(path.dirname(name),{recursive:true});await writeFile(name,Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value));}
  await put(path.join(root,'references/work-material.json'),stored);
  await put(path.join(root,'references/blob-storage.json'),config);
  await put(path.join(root,'references/public-review.json'),{currentExport:'exports/review-hub-20261109000000000'});
  await put(path.join(root,'.runtime/public-review-ready.json'),{directory,staticDirectory:site,status:'prepared-not-uploaded',uploaded:false});
  await put(site+decodeURIComponent(localUrl),contents);
  return{root,directory,site,put};
}

test('published Blob cache restores local URLs for refresh hash checks and can publish again',async t=>{
  const {root,directory,site,put}=await fixture(t);
  const entry={source,sha256,bytes,url:localUrl,kind:'mp4',originalSha256:sha256};
  await put(path.join(site,'granskning/manifest.json'),{files:[entry]});
  await put(path.join(site,'latest.json'),{});await put(path.join(site,'manifest.json'),{});
  await put(path.join(site,'index.html'),`<video src="${localUrl}"></video>`);
  await applyReviewBlobLinks(directory,root);
  const published=JSON.parse(await readFile(path.join(site,'granskning/manifest.json'),'utf8'));
  assert.equal(published.files[0].url,url);
  const restored=await restoreCachedReviewBlobLinks(published.files,root);
  assert.deepEqual(restored,[entry]);assert.equal(published.files[0].url,url,'Do not mutate the cached input');
  // This is the builder's existing post-render local-content gate, previously ENOENT.
  for(const e of restored){const b=await readFile(site+decodeURIComponent(e.url));assert.equal(hash(b),e.sha256);assert.equal(b.length,e.bytes);}
  await put(path.join(site,'granskning/manifest.json'),{...published,files:restored});
  await applyReviewBlobLinks(directory,root);
  const republished=JSON.parse(await readFile(path.join(site,'granskning/manifest.json'),'utf8'));
  assert.equal(republished.files[0].url,url);assert.equal(republished.storage.verifiedCopies,1);
});

test('mismatched source, hash, byte count or URL cannot reuse a verified mapping',async t=>{
  const {root}=await fixture(t);
  for(const patch of[{source:'runs/another.mp4'},{sha256:'a'.repeat(64)},{bytes:bytes+1},{url:url+'?download=1'},{url:'https://unknown.example/clip.mp4'},{url:'//unknown.example/clip.mp4'}]){
    const entry={...file,...patch};await assert.rejects(restoreCachedReviewBlobLinks([entry],root),/Unknown or mismatched cached Blob mapping/);
    assert.deepEqual(entry,{...file,...patch});
  }
});

test('verification metadata and store identity are mandatory even for an exact cache match',async t=>{
  const {root,put}=await fixture(t);
  for(const patch of[{verifiedAt:''},{verifiedAt:'not-a-date'},{source:'../escaped.mp4'},{url:`https://otherstore.public.blob.vercel-storage.com/objects/${sha256}.mp4`}]){
    const changed={...file,...patch};await put(path.join(root,'references/work-material.json'),{...stored,files:[changed]});
    await assert.rejects(restoreCachedReviewBlobLinks([changed],root));
  }
  for(const patch of[{complete:false},{storeId:'store_OtherStore'},{access:'private'}]){
    await put(path.join(root,'references/work-material.json'),{...stored,...patch});await assert.rejects(restoreCachedReviewBlobLinks([file],root));
  }
});

test('local entries require no Blob index; corrupt retained media still fails the existing hash gate',async t=>{
  const {root,site,put}=await fixture(t);
  const local={source,sha256,bytes,url:localUrl};
  assert.deepEqual(await restoreCachedReviewBlobLinks([local],path.join(root,'no-reference-directory')),[local]);
  const restored=await restoreCachedReviewBlobLinks([file],root);
  await put(site+decodeURIComponent(localUrl),'corrupted media');
  assert.throws(()=>assert.equal(hash('corrupted media'),restored[0].sha256));
  assert.notEqual(hash(await readFile(site+decodeURIComponent(restored[0].url))),restored[0].sha256);
});

test('Blob rewriting preserves hash-bound evidence JSON and text plus local media',async t=>{
  const {root,directory,site,put}=await fixture(t);
  const body=JSON.stringify({videoUrl:localUrl,verified:true}),evidenceSource='runs/pilot/browser-result.json';
  const evidenceUrl='/granskning/kallor/'+evidenceSource;
  const evidence={source:evidenceSource,url:evidenceUrl,sha256:hash(body),bytes:Buffer.byteLength(body)};
  await put(path.join(root,evidenceSource),body);await put(site+evidenceUrl,body);
  await put(path.join(site,'granskning/kallor/docs/probe.md.txt'),`Example media ${localUrl}`);
  await put(path.join(site,'files/runs/pilot/evidence.json'),body);
  await put(path.join(site,'granskning/manifest.json'),{files:[{...file,url:localUrl},evidence]});
  await put(path.join(site,'latest.json'),{});await put(path.join(site,'manifest.json'),{});
  await put(path.join(site,'index.html'),`<video src="${localUrl}"></video>`);
  await applyReviewBlobLinks(directory,root);
  assert.equal(hash(await readFile(site+evidenceUrl)),evidence.sha256);
  assert.equal(await readFile(path.join(site,'files/runs/pilot/evidence.json'),'utf8'),body);
  assert.equal(await readFile(path.join(site,'granskning/kallor/docs/probe.md.txt'),'utf8'),`Example media ${localUrl}`);
  assert.equal(await readFile(path.join(site,'index.html'),'utf8'),`<video src="${url}"></video>`);
  assert.equal(hash(await readFile(site+decodeURIComponent(localUrl))),sha256);
  assert.deepEqual(await restorePreparedReviewEvidence(directory,[evidence],root),[]);
});

test('refresh repairs only the owned copy after original hash validation and preserves linked baseline',async t=>{
  const {root,directory,site,put}=await fixture(t);
  const source='runs/pilot/browser-result.json',body=JSON.stringify({videoUrl:localUrl});
  const corrupted=body.replace(localUrl,url),e={source,url:'/granskning/kallor/'+source,sha256:hash(body),bytes:Buffer.byteLength(body)};
  const original=path.join(root,source),destination=site+e.url;
  const baseline=path.join(root,'exports/review-hub-20261109000000000/.vercel/output/static',e.url);
  await put(original,body);await put(baseline,corrupted);await mkdir(path.dirname(destination),{recursive:true});await link(baseline,destination);
  assert.deepEqual(await restorePreparedReviewEvidence(directory,[e],root),[source]);
  assert.equal(await readFile(destination,'utf8'),body);assert.equal(await readFile(original,'utf8'),body);
  assert.equal(await readFile(baseline,'utf8'),corrupted,'Repair must not overwrite a linked baseline');
  assert.deepEqual(await restorePreparedReviewEvidence(directory,[e],root),[]);
});

test('refresh refuses stale originals, unexpected paths, published exports and uploaded work',async t=>{
  const {root,directory,site,put}=await fixture(t);
  const source='runs/pilot/browser-result.json',body=JSON.stringify({videoUrl:localUrl});
  const e={source,url:'/granskning/kallor/'+source,sha256:hash(body),bytes:Buffer.byteLength(body)};
  const destination=site+e.url;await put(destination,'damaged');await put(path.join(root,source),'changed original');
  await assert.rejects(restorePreparedReviewEvidence(directory,[e],root),/Local original differs/);
  assert.equal(await readFile(destination,'utf8'),'damaged');
  await put(path.join(root,source),body);
  await assert.rejects(restorePreparedReviewEvidence(directory,[{...e,url:'/granskning/kallor/runs/wrong.json'}],root),/Unexpected evidence copy path/);
  await assert.rejects(restorePreparedReviewEvidence(directory,[{...e,source:'runs/pilot/state.json'}],root),/Unsafe evidence source/);
  await put(path.join(root,'references/public-review.json'),{currentExport:directory});
  await assert.rejects(restorePreparedReviewEvidence(directory,[e],root),/Never repair a published export/);
  await put(path.join(root,'references/public-review.json'),{currentExport:'exports/review-hub-20261109000000000'});
  await put(path.join(root,'.runtime/public-review-ready.json'),{directory,staticDirectory:site,status:'prepared-not-uploaded',uploaded:true});
  await assert.rejects(restorePreparedReviewEvidence(directory,[e],root));
  assert.equal(await readFile(destination,'utf8'),'damaged');
});
