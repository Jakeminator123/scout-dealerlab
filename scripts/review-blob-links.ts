/** Bind an already validated review export to exactly matching, verified Blob copies. */
import {readFile,writeFile,readdir,lstat,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {publicReviewSource} from './review-publication-policy.ts';

type ReviewBlobEntry={source:string;url:string;sha256:string;bytes:number};
type StoredBlobFile=ReviewBlobEntry&{verifiedAt:string};
type BlobIndex={complete:boolean;storeId:string;access:string;files:StoredBlobFile[];publicIndex?:{url:string}};
type BlobConfig={storeId:string;access:string};

function validateIndex(stored:BlobIndex,config:BlobConfig):void {
  assert.equal(stored.complete,true,'Incomplete verified Blob index');
  assert.equal(stored.storeId,config.storeId,'Blob store identity mismatch');
  assert.match(config.storeId,/^store_[A-Za-z0-9]+$/,'Invalid Blob store identity');
  assert.equal(stored.access,'public');assert.equal(config.access,'public');
  assert.ok(Array.isArray(stored.files),'Missing verified Blob files');
}

function verifiedBlobUrl(asset:StoredBlobFile,config:BlobConfig):string {
  assert.equal(typeof asset.source,'string','Invalid Blob source');
  assert.ok(asset.source.length>0&&!/[\\\x00-\x1f:]/.test(asset.source)&&asset.source.split('/').every(p=>p!==''&&p!=='.'&&p!=='..'),'Unsafe Blob source');
  assert.match(asset.sha256,/^[a-f0-9]{64}$/,'Invalid Blob SHA-256');
  assert.ok(Number.isSafeInteger(asset.bytes)&&asset.bytes>=0,'Invalid Blob byte count');
  assert.ok(typeof asset.verifiedAt==='string'&&asset.verifiedAt.length>0&&Number.isFinite(Date.parse(asset.verifiedAt)),'Missing valid Blob verification timestamp');
  const url=new URL(asset.url);
  assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
  assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(url.toString(),asset.url);
  assert.equal(url.hostname,config.storeId.slice('store_'.length).toLowerCase()+'.public.blob.vercel-storage.com','Blob URL belongs to another store');
  assert.equal(url.pathname,'/objects/'+asset.sha256+path.posix.extname(asset.source));
  return asset.url;
}

/** Restore cache entries only; the builder still verifies every retained local file.
 * No fetch or filesystem mutation occurs here. Unknown remote URLs fail closed. */
export async function restoreCachedReviewBlobLinks<T extends ReviewBlobEntry>(entries:readonly T[],referenceRoot=process.cwd()):Promise<T[]> {
  for(const entry of entries)assert.equal(typeof entry.url,'string','Invalid cached review URL');
  const local=(url:string)=>url.startsWith('/')&&!url.startsWith('//');
  if(entries.every(entry=>local(entry.url)))return [...entries];
  const stored:BlobIndex=JSON.parse(await readFile(path.join(referenceRoot,'references/work-material.json'),'utf8'));
  const config:BlobConfig=JSON.parse(await readFile(path.join(referenceRoot,'references/blob-storage.json'),'utf8'));
  validateIndex(stored,config);
  return entries.map(entry=>{
    if(local(entry.url))return entry;
    const asset=stored.files.find(file=>file.source===entry.source&&file.sha256===entry.sha256&&file.bytes===entry.bytes&&file.url===entry.url);
    assert.ok(asset,'Unknown or mismatched cached Blob mapping: '+entry.source);
    verifiedBlobUrl(asset,config);
    return {...entry,url:'/files/'+entry.source.split('/').map(encodeURIComponent).join('/')};
  });
}

/** Repair only source copies in the exact, still-unpublished prepared export.
 * Unlink before exclusive-create: a retained hard link must never modify an original or baseline. */
export async function restorePreparedReviewEvidence(directory:string,entries:readonly ReviewBlobEntry[],workspace=process.cwd()):Promise<string[]> {
  const root=path.resolve(workspace),owned=path.resolve(root,directory),exportsRoot=path.join(root,'exports');
  assert.equal(path.dirname(owned),exportsRoot,'Evidence repair requires one owned export');
  assert.match(path.basename(owned),/^review-hub-\d+$/,'Evidence repair requires a review export');
  const ready=JSON.parse(await readFile(path.join(root,'.runtime/public-review-ready.json'),'utf8'));
  const published=JSON.parse(await readFile(path.join(root,'references/public-review.json'),'utf8'));
  assert.equal(ready.status,'prepared-not-uploaded');assert.equal(ready.uploaded,false);
  assert.equal(path.resolve(root,ready.directory),owned,'Not the currently prepared export');
  assert.equal(typeof published.currentExport,'string','Missing published baseline identity');
  assert.notEqual(owned.toLowerCase(),path.resolve(root,published.currentExport).toLowerCase(),'Never repair a published export');
  const site=path.join(owned,'.vercel/output/static');
  assert.equal(path.resolve(root,ready.staticDirectory),site,'Prepared static root mismatch');
  async function checkedFile(base:string,file:string):Promise<Buffer>{
    const relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),'File leaves its root');
    let current=base;const segments=relative.split(path.sep);
    for(const part of segments.slice(0,-1)){
      const info=await lstat(current);assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Linked evidence ancestor');current=path.join(current,part);
    }
    const parent=await lstat(current);assert.ok(parent.isDirectory()&&!parent.isSymbolicLink(),'Linked evidence parent');
    const info=await lstat(file);assert.ok(info.isFile()&&!info.isSymbolicLink(),'Linked evidence file');
    return readFile(file);
  }
  const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),repairs:{source:string;destination:string;bytes:Buffer}[]=[];
  for(const entry of entries){
    // Only text extensions rewritten by the former implementation can need repair.
    if(!/\.(?:html|js|json|txt)$/i.test(entry.url))continue;
    assert.ok(publicReviewSource(entry.source)&&!/[\x00-\x1f:]/.test(entry.source),'Unsafe evidence source');
    const ext=path.posix.extname(entry.source).toLowerCase(),text=/\.(?:json|md|txt|ts|tsx|js|css|svg)$/.test(ext);
    const expectedUrl=text?'/granskning/kallor/'+entry.source+(/\.(?:json|txt|svg)$/.test(ext)?'':'.txt'):'/files/'+entry.source.split('/').map(encodeURIComponent).join('/');
    assert.equal(entry.url,expectedUrl,'Unexpected evidence copy path');assert.match(entry.sha256,/^[a-f0-9]{64}$/);
    const destination=path.resolve(site,'.'+decodeURIComponent(entry.url));
    assert.ok(destination.startsWith(site+path.sep),'Evidence copy leaves static root');
    const existing=await checkedFile(root,destination);
    if(digest(existing)===entry.sha256){assert.equal(existing.length,entry.bytes,'Evidence byte count mismatch');continue;}
    const original=await checkedFile(root,path.resolve(root,entry.source));
    assert.equal(digest(original),entry.sha256,'Local original differs from expected evidence hash: '+entry.source);
    assert.equal(original.length,entry.bytes,'Local original differs from expected evidence bytes: '+entry.source);
    repairs.push({source:entry.source,destination,bytes:original});
  }
  // Validate all replacements before changing any copy. No source path is a write target.
  for(const repair of repairs){await unlink(repair.destination);await writeFile(repair.destination,repair.bytes,{flag:'wx'});}
  return repairs.map(repair=>repair.source);
}

export async function applyReviewBlobLinks(directory:string,referenceRoot=process.cwd()):Promise<string> {
  const site=path.join(directory,'.vercel/output/static');
  const manifestPath=path.join(site,'granskning/manifest.json');
  const original=await readFile(manifestPath,'utf8');
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const raw=await readFile(path.join(referenceRoot,'references/work-material.json'),'utf8').catch(()=>null);
  if(!raw)return hash(original);
  const stored:BlobIndex=JSON.parse(raw),manifest=JSON.parse(original);
  const config:BlobConfig=JSON.parse(await readFile(path.join(referenceRoot,'references/blob-storage.json'),'utf8'));
  if(!stored.complete)return hash(original);
  validateIndex(stored,config);
  const replacements=new Map<string,string>();
  for(const asset of stored.files){
    const match=manifest.files.find((f:any)=>f.source===asset.source&&f.sha256===asset.sha256&&f.bytes===asset.bytes);
    if(!match||!asset.verifiedAt||!match.url.startsWith('/'))continue;
    replacements.set(match.url,verifiedBlobUrl(asset,config));
  }
  const rewrite=(text:string)=>{for(const [from,to]of replacements)text=text.replaceAll(from,to);return text;};
  async function visit(dir:string):Promise<void>{
    for(const item of await readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,item.name);assert.ok(!(await lstat(file)).isSymbolicLink());
      const relative=path.relative(site,file).replaceAll('\\','/').toLowerCase();
      if(relative==='granskning/kallor'||relative==='files')continue; // Immutable source/evidence and retained media copies.
      if(item.isDirectory())await visit(file);
      else if(/\.(?:html|js|json|txt)$/.test(item.name)){
        const before=await readFile(file,'utf8'),after=rewrite(before);
        if(after!==before)await writeFile(file,after);
      }
    }
  }
  await visit(site);
  const current=JSON.parse(await readFile(manifestPath,'utf8'));
  current.storage={provider:'Vercel Blob',storeId:stored.storeId,verifiedCopies:replacements.size,originalsRetainedLocally:true,index:stored.publicIndex?.url};
  const content=JSON.stringify(current,null,2),contentId=hash(content);
  await writeFile(manifestPath,content);
  for(const file of ['latest.json','manifest.json']){
    const location=path.join(site,file),data=JSON.parse(await readFile(location,'utf8'));
    data.contentId=contentId;await writeFile(location,JSON.stringify(data,null,2));
  }
  return contentId;
}
