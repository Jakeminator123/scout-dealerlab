/** Bind an already validated review export to exactly matching, verified Blob copies. */
import {readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function applyReviewBlobLinks(directory:string):Promise<string> {
  const site=path.join(directory,'.vercel/output/static');
  const manifestPath=path.join(site,'granskning/manifest.json');
  const original=await readFile(manifestPath,'utf8');
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const raw=await readFile('references/work-material.json','utf8').catch(()=>null);
  if(!raw)return hash(original);
  const stored=JSON.parse(raw),manifest=JSON.parse(original);
  const config=JSON.parse(await readFile('references/blob-storage.json','utf8'));
  if(!stored.complete)return hash(original);
  assert.equal(stored.storeId,config.storeId);assert.equal(stored.access,'public');
  const replacements=new Map<string,string>();
  for(const asset of stored.files){
    const match=manifest.files.find((f:any)=>f.source===asset.source&&f.sha256===asset.sha256&&f.bytes===asset.bytes);
    if(!match||!asset.verifiedAt||!match.url.startsWith('/'))continue;
    const url=new URL(asset.url);
    assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
    assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(url.toString(),asset.url);
    assert.ok(url.hostname.endsWith('.public.blob.vercel-storage.com'));
    assert.equal(url.pathname,'/objects/'+asset.sha256+path.extname(asset.source));
    replacements.set(match.url,asset.url);
  }
  const rewrite=(text:string)=>{for(const [from,to]of replacements)text=text.replaceAll(from,to);return text;};
  async function visit(dir:string):Promise<void>{
    for(const item of await readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,item.name);assert.ok(!(await lstat(file)).isSymbolicLink());
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
