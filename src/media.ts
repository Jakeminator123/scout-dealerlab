import { readFile, writeFile, stat, access, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { list } from '@vercel/blob';
import { catalog, safeFile, fingerprint, outputDirectory, mediaTypes } from './library.ts';
import { maintainPreviewFrames } from './preview-cache.ts';
import { sourceTrack } from './source-tracks.ts';
const execute = promisify(execFile);
const metadataCache = new Map<string,{stamp:string,value:Record<string,unknown>}>();
const pendingInspections = new Map<string,Promise<unknown>>();
const identityHashes = new Map<string,{stamp:string,sha256:string}>();
export async function privateConfig(root:string) {
  try { return parseEnv(await readFile(path.join(root,'.env.local'),'utf8')); }
  catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return {}; throw error; }
}
export async function metadata(root:string, relative:string) {
  const filename=await safeFile(root,relative), info=await stat(filename);
  const stamp=`${info.size}:${info.mtimeMs}`;
  if(metadataCache.get(filename)?.stamp===stamp) return metadataCache.get(filename)!.value;
  let value:Record<string,unknown>={};
  try {
    const {stdout}=await execute('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames,codec_name,pix_fmt:format=duration','-of','json',filename],{windowsHide:true,timeout:15000,maxBuffer:100000});
    const probe=JSON.parse(stdout), video=probe.streams?.[0]??{};
    const [n,d]=String(video.avg_frame_rate??'0/1').split('/').map(Number);
    const isVideo=/\.(mp4|webm|mov)$/i.test(relative);
    value={width:video.width,height:video.height,codec:video.codec_name,pixelFormat:video.pix_fmt,
      ...(isVideo?{fps:d&&n?n/d:undefined,duration:Number(probe.format?.duration)||undefined,frameCount:Number(video.nb_frames)||undefined}:{}),measured:true};
  } catch { value={measured:false,probeError:'Formatmetadata kunde inte läsas.'}; }
  metadataCache.set(filename,{stamp,value}); return value;
}
export async function studioData(root:string,csrfToken:string) {
  const files=await catalog(root);
  let identity:{dealers:{id:string,label:string}[],assetMappings:{path:string,dealerId:string,sha256:string}[]}={dealers:[],assetMappings:[]};
  try {identity=JSON.parse(await readFile(path.join(root,'references/dealers.json'),'utf8'));}catch{}
  const alternative = await readFile(path.join(root,'references/alternative-bank.json'),'utf8').then(JSON.parse).catch(()=>({assets:[]}));
  const assets=[];
  // At most four metadata probes at a time, with reuse while bytes/timestamp are unchanged.
  for(let start=0;start<files.length;start+=4) {
    assets.push(...await Promise.all(files.slice(start,start+4).map(async asset=>{
      let origin=asset.path.startsWith('media/runway/')?'Runway':asset.path.startsWith('media/blob/')?'Vercel Blob':asset.path.startsWith('gpt-underlag/')?'GPT-underlag':asset.path.startsWith('extra/')?'Extra referens':'Lokalt';
      const stage=asset.path.includes('/processed/')?'Bearbetat':asset.path.includes('/export/')?'Export':asset.path.includes('/original/')||asset.path.startsWith('media/runway/')?'Original':'Källmaterial';
      const mapping=identity.assetMappings.find(item=>item.path===asset.path);
      let dealerId='unclassified',dealerLabel='Oklassificerat';
      {
        const file=await safeFile(root,asset.path),info=await stat(file),stamp=`${info.size}:${info.mtimeMs}`;
        let cached=identityHashes.get(file);
        if(cached?.stamp!==stamp){cached={stamp,sha256:createHash('sha256').update(await readFile(file)).digest('hex')};identityHashes.set(file,cached);}
        if(mapping && cached.sha256===mapping.sha256){dealerId=mapping.dealerId;dealerLabel=identity.dealers.find(item=>item.id===dealerId)?.label||dealerId;}
        const bankAsset = alternative.assets.find((item:any)=>item.path===asset.path && item.sha256===cached.sha256);
        return {...asset,displayName:bankAsset?.label || asset.name,origin,stage,dealerId,dealerLabel,sha256:cached.sha256,track:sourceTrack({...asset,dealerId}),...await metadata(root,asset.path)};
      }
    })));
  }
  const {readdir}=await import('node:fs/promises');
  const runs=[];
  for(const id of await readdir(path.join(root,'runs')).catch(()=>[])) {
    if(!/^\d{14}-[a-f0-9]{8}$/.test(id)) continue;
    try {const job=JSON.parse(await readFile(await safeFile(root,`runs/${id}/job.json`),'utf8'));runs.push({id,title:job.title});}catch{}
  }
  let schemes:any[]=[];
  try {schemes=JSON.parse(await readFile(path.join(root,'references/schemes.json'),'utf8')).schemes;}catch{}
  try {schemes.push(JSON.parse(await readFile(path.join(root,'references/alternative-3d.json'),'utf8')));}catch{}
  try {schemes.push(JSON.parse(await readFile(path.join(root,'references/alternative-fullbody.json'),'utf8')));}catch{}
  const env=await privateConfig(root);
  return {assets,schemes,runs,csrfToken,connections:{runway:env.RUNWAY_API_KEY?'API konfigurerat · MCP-lista separat':'MCP-lista',blob:env.BLOB_READ_WRITE_TOKEN?'Privat lager · endast läsning':'Ej konfigurerat',admin:env.UN&&env.PW?'Befintligt konto sparat lokalt':'Ej konfigurerat',mode:'Lokalt'}};
}
export async function inspectAsset(root:string,relative:string) {
  const key=root+'|'+relative;
  if(pendingInspections.has(key)) return pendingInspections.get(key);
  const work=(async()=>{
    const measured=await fingerprint(root,relative), meta=await metadata(root,relative);
    if(!/\.(mp4|webm|mov)$/i.test(relative)) return {asset:measured,metadata:meta,sha256:measured.sha256,posterPath:relative,contactSheetPath:relative};
    const fps=Number(meta.fps), count=Number(meta.frameCount)||Math.round(Number(meta.duration)*fps);
    if(!(fps>0&&count>0)) throw new Error('Kontaktark kräver verifierad bildrutetakt och längd.');
    const folder=`media/analysis/${measured.sha256}`;
    await outputDirectory(root,folder);
    const sheet=`${folder}/contact.jpg`, sampleFrames=[...new Set(Array.from({length:8},(_,i)=>Math.round(i*(count-1)/7)))];
    try {await access(path.join(root,sheet));}catch{
      const filter=`select='${sampleFrames.map(n=>`eq(n\\,${n})`).join('+')}',scale=240:-2,tile=4x2`;
      await execute('ffmpeg',['-v','error','-nostdin','-n','-i',await safeFile(root,relative),'-vf',filter,'-frames:v','1','-q:v','3',path.join(root,sheet)],{windowsHide:true,timeout:45000,maxBuffer:100000});
      await writeFile(path.join(root,folder,'sampling.json'),JSON.stringify({source:relative,sha256:measured.sha256,sampleFrames,fps,exactFrameCount:Boolean(meta.frameCount),purpose:'Overview only. Inspect full-resolution frames and motion for acceptance.'},null,2));
    }
    return {asset:measured,metadata:meta,sha256:measured.sha256,contactSheetPath:sheet,sampleFrames};
  })();
  pendingInspections.set(key,work);
  try{return await work;}finally{pendingInspections.delete(key);}
}
export async function exactFrame(root:string,relative:string,frame:number) {
  if(!Number.isInteger(frame)||frame<0) throw new Error('Ogiltig bildruta');
  const source=await fingerprint(root,relative),meta=await metadata(root,relative);
  const count=Number(meta.frameCount)||Math.ceil(Number(meta.fps)*Number(meta.duration));
  if(!count||frame>=count) throw new Error('Bildrutan ligger utanför klippet');
  const directory=`media/preview-cache/${source.sha256}`;await outputDirectory(root,directory);
  const destination=`${directory}/frame-${frame}.png`;
  try{await access(path.join(root,destination));}catch{
    await execute('ffmpeg',['-v','error','-nostdin','-n','-i',await safeFile(root,relative),'-vf',`select=eq(n\\,${frame})`,'-frames:v','1',path.join(root,destination)],{windowsHide:true,timeout:45000,maxBuffer:100000});
  }
  const retention = await maintainPreviewFrames(root,source.sha256,frame);
  return {path:destination,frame,sourceSha256:source.sha256,metadata:meta,retention};
}
export function validateRemoteUrl(raw:string,sourceType:string,storeId:string) {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')) throw new Error('Endast vanliga HTTPS-medielänkar tillåts');
  const store=storeId.replace(/^store_/,'').toLowerCase();
  const allowed=sourceType==='blob'?[`${store}.private.blob.vercel-storage.com`,`${store}.public.blob.vercel-storage.com`]:sourceType==='runway'?['dnznrvs05pmza.cloudfront.net','d2jqrm6oza8nb6.cloudfront.net']:[];
  if(!allowed.includes(url.hostname.toLowerCase())) throw new Error('Länken tillhör inte verifierat Blob-lager eller Runway-medievärd.');
  return url;
}
export async function remoteAssets(root:string,source:string,cursor?:string) {
  if(source==='runway') {
    try {return JSON.parse(await readFile(path.join(root,'private/runway-assets.json'),'utf8'));}
    catch {return {assets:[],note:'Be Codex uppdatera listan via Runway MCP.'};}
  }
  if(source!=='blob') throw new Error('Okänd källa');
  const env=await privateConfig(root);
  if(!env.BLOB_READ_WRITE_TOKEN) throw new Error('Blob-läsning är inte konfigurerad');
  if(env.BLOB_READ_WRITE_TOKEN.split('_')[3]?.toLowerCase()!==env.LAB_BLOB_STORE_ID?.slice(6).toLowerCase()) throw new Error('Blob-token och projektidentitet stämmer inte överens');
  const result=await list({token:env.BLOB_READ_WRITE_TOKEN,limit:1000,...(cursor?{cursor}:{})});
  return {assets:result.blobs.filter(b=>mediaTypes.has(path.extname(b.pathname).toLowerCase())).map(b=>({id:b.pathname,name:b.pathname,url:b.url,kind:/\.(mp4|webm|mov)$/i.test(b.pathname)?'video':'image',source:'blob',bytes:b.size})),cursor:result.cursor,hasMore:result.hasMore,note:result.hasMore?'Visar en sida av lagret; fler objekt finns.':'Lagrets lista klar.'};
}
export async function importAsset(root:string,input:{sourceType:string,url:string,note?:string}) {
  const env=await privateConfig(root),url=validateRemoteUrl(input.url,input.sourceType,env.LAB_BLOB_STORE_ID||'');
  const originalName=decodeURIComponent(url.pathname.split('/').pop()||'clip');
  const id=createHash('sha256').update(url.origin+url.pathname).digest('hex').slice(0,16);
  const directory=`media/${input.sourceType}/${id}`; await outputDirectory(root,directory);
  const provenanceFile=path.join(root,directory,'source.json');
  try {const existing=JSON.parse(await readFile(provenanceFile,'utf8')); await safeFile(root,existing.path);return existing;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
  const headers:Record<string,string>={'Accept-Encoding':'identity'};
  if(input.sourceType==='blob') {
    if(!env.BLOB_READ_WRITE_TOKEN||env.BLOB_READ_WRITE_TOKEN.split('_')[3]?.toLowerCase()!==env.LAB_BLOB_STORE_ID?.slice(6).toLowerCase()) throw new Error('Blob-nyckeln saknas eller har fel lageridentitet');
    headers.Authorization=`Bearer ${env.BLOB_READ_WRITE_TOKEN}`;
  }
  let response:Response;
  try{response=await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(120000)});}catch{throw new Error('Medielänken kunde inte hämtas');}
  if(!response.ok||!response.body) throw new Error(`Mediekällan svarade ${response.status}. Förnya länken om den har gått ut.`);
  const mime=response.headers.get('content-type')?.split(';')[0]||'';
  if(!mime.startsWith('video/')&&!mime.startsWith('image/')) throw new Error('Källan svarade inte med bild/video');
  const limit=200*1024*1024;
  if(Number(response.headers.get('content-length'))>limit) {await response.body.cancel();throw new Error('Filen överskrider labbets gräns 200 MB per import');}
  const extensions:Record<string,string>={'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'};
  const extension=extensions[mime]; if(!extension) {await response.body.cancel();throw new Error('Medieformatet stöds inte ännu');}
  const name=path.parse(originalName).name.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80)||'clip';
  const relative=`${directory}/${name}${extension}`,partial=path.join(root,directory,'download.part');
  const handle=await open(partial,'wx');const hash=createHash('sha256');let bytes=0;
  try {
    for await(const chunk of response.body) {bytes+=chunk.length;if(bytes>limit)throw new Error('Filen överskrider 200 MB');hash.update(chunk);await handle.writeFile(chunk);}
    await handle.close();await rename(partial,path.join(root,relative));
  } catch(error) {await handle.close();await unlink(partial).catch(()=>{});throw error;}
  const source={path:relative,originalName,source:input.sourceType,sourceUrl:url.origin+url.pathname,importedAt:new Date().toISOString(),sha256:hash.digest('hex'),bytes,note:(input.note||'').slice(0,8000),generationMetadata:'unknown unless supplied by source',cloudWrites:false};
  await writeFile(provenanceFile,JSON.stringify(source,null,2)+'\n',{flag:'wx'});return source;
}
