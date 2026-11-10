import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PAMELA_SHOE_BANK_PROFILES,PAMELA_SHOE_BANK_LIMITS,resolvePamelaShoeBankProfile,createPamelaShoeBankRemoval,createPamelaShoeBankGeometrySvg,shoeBankPointInside} from '../src/pamela-shoe-bank-profile.ts';
import {keyPamelaFrame} from '../src/pamela-key.ts';

sharp.concurrency(1);
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([a-z-]+)=(.+)$/.exec(a);assert.ok(m,a);return [m[1],m[2]];}));
const mode=args.mode??'survey',take=args.take??'01',seat=Number(args.seat??3);
assert.match(take,/^\d\d$/);assert.ok(seat===3||seat===5);
const W=1762,H=1174,root='runs/20261110-pamela-shoe-bank',run=`${root}/${mode}-${take}-p${seat}`;
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const ref=async(p:string)=>({path:p,sha256:hash(await readFile(p))});
const selections=await read('references/pamela-material-selections.json');
const selection=selections.entries.find((s:any)=>s.id===`C2-P${seat}`);
assert.equal(selections.project,'snyggare-dealer');assert.equal(selections.dealerId,'pamela');
assert.equal((await ref(selection.evidence.path)).sha256,selection.evidence.sha256);
const track=await read(selection.evidence.path);
assert.equal((await ref(track.source.path)).sha256,track.source.sha256);
await mkdir(root,{recursive:true});await mkdir(run);
if(mode==='survey'){
 const frames=args.frames?args.frames.split(',').map(Number):[0,10,20,30,40,50,60,80,100,140,180,220,260,300,330,359];
 const roi={left:1120,top:580,width:610,height:360},tiles:Buffer[]=[],records:any[]=[];
 for(const f of frames){
  assert.ok(Number.isInteger(f)&&f>=0&&f<360);const r=track.frames[f],b=await readFile(r.source.path);assert.equal(hash(b),r.source.sha256);
  const meta=await sharp(b).metadata();assert.equal(meta.width,W);assert.equal(meta.height,H);
  const path=`${run}/source-${String(f).padStart(3,'0')}.png`;await sharp(b).extract(roi).png().toFile(path);
  const label=Buffer.from(`<svg width="610" height="24"><rect width="610" height="24" fill="#19212a"/><text x="8" y="17" font-family="Arial" font-size="16" fill="white">P${seat} source f${f} | x1120 y580 native crop</text></svg>`);
  tiles.push(await sharp(path).composite([{input:label,left:0,top:0}]).png().toBuffer());records.push({frame:f,source:r.source,crop:await ref(path)});
 }
 const sheets=[];for(let start=0;start<tiles.length;start+=8){const part=tiles.slice(start,start+8),path=`${run}/sheet-${String(start/8).padStart(2,'0')}.jpg`;await sharp({create:{width:1220,height:360*Math.ceil(part.length/2),channels:3,background:'#19212a'}}).composite(part.map((input,i)=>({input,left:i%2*610,top:Math.floor(i/2)*360}))).jpeg({quality:95}).toFile(path);sheets.push(await ref(path));}
 await writeFile(`${run}/survey.json`,JSON.stringify({source:track.source,selection,roi,frames:records,sheets},null,2));
 console.log(JSON.stringify({run,sheets:sheets.map(s=>s.path)}));
}else if(mode==='proof'||mode==='stills'){
 const profile=PAMELA_SHOE_BANK_PROFILES.find(p=>p.identity.clipId===`C2-P${seat}`)!;
 assert.equal(profile.source.sha256,track.source.sha256);assert.deepEqual(profile.track,selection.evidence);
 const inputRefs=[profile.source,profile.track,profile.paperAtlas,profile.paperCalibration];
 for(const r of inputRefs)assert.equal((await ref(r.path)).sha256,r.sha256,r.path);
 const atlas=await read(profile.paperAtlas.path);assert.equal(atlas.source.sha256,profile.source.sha256);assert.equal(atlas.frames.length,360);
 const pageBuffers:Buffer[]=[];for(const page of atlas.pages){assert.equal((await ref(page.path)).sha256,page.sha256);pageBuffers.push(await sharp(page.path).greyscale().raw().toBuffer());inputRefs.push({path:page.path,sha256:page.sha256});}
 const code=[];for(const d of ['assets','qa','masks','snapshot'])await mkdir(`${run}/${d}`);
 for(const p of ['src/pamela-shoe-bank-profile.ts','tools/pamela-shoe-bank-proof.ts','src/pamela-shoe-geometry.ts','src/pamela-key.ts']){code.push(await ref(p));await writeFile(`${run}/snapshot/${p.replaceAll('/','__')}`,await readFile(p));}
 const shapeNames=['compact-wedge','rounded-housing'] as const,textures:Buffer[]=[],assets=[];
 for(const shape of shapeNames){const svg=createPamelaShoeBankGeometrySvg(profile.identity,shape),path=`${run}/assets/${shape}.png`;await writeFile(`${run}/assets/${shape}.svg`,svg);await sharp(Buffer.from(svg)).png().toFile(path);textures.push(await sharp(path).ensureAlpha().raw().toBuffer());assets.push({shape,...await ref(path)});}
 const identityRejections=[];for(const [key,value]of Object.entries({project:'other',dealerId:'other',clipId:'C2-P4',sourceSha256:'0'.repeat(64),width:1764,height:1175,fps:24,frames:359})){
  const invalid={...profile.identity,[key]:value};assert.equal(resolvePamelaShoeBankProfile(invalid),undefined);assert.throws(()=>createPamelaShoeBankGeometrySvg(invalid,'compact-wedge'));identityRejections.push(key);
 }
 const bin='C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin';
 const nativePaths=shapeNames.map(s=>`${run}/${s}-native-360f.mp4`);
 function makeEncoder(){
  // One owned media process, two serially fed native views, at most four threads.
  const p=spawn(`${bin}/ffmpeg.exe`,['-v','error','-nostdin','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W*2}x${H}`,'-framerate','30','-i','pipe:0','-filter_complex_threads','1','-filter_complex',`[0:v]split=2[a][b];[a]crop=${W}:${H}:0:0[compact];[b]crop=${W}:${H}:${W}:0[rounded]`,...nativePaths.flatMap((path,i)=>['-map',i===0?'[compact]':'[rounded]','-an','-c:v','libx264','-crf','15','-preset','fast','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart',path])],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let errors='';p.stderr.on('data',v=>errors+=v);p.stdin.on('error',()=>{});const done=new Promise<void>((resolve,reject)=>{p.once('error',reject);p.once('close',c=>c===0?resolve():reject(Error(errors)));});void done.catch(()=>{});
  return{pid:p.pid,async write(b:Buffer){if(!p.stdin.write(b))await once(p.stdin,'drain');},async finish(){p.stdin.end();await done;},abort(){p.stdin.destroy();if(p.exitCode===null)p.kill();}};
 }
 const encoder=mode==='proof'?makeEncoder():null;
 await writeFile(`${run}/process.json`,JSON.stringify({nodePid:process.pid,nodeVersion:process.version,nodeExecutable:process.execPath,workingDirectory:process.cwd(),mediaWorkerPid:encoder?.pid??null,startedAt:new Date().toISOString(),maximumMediaProcesses:1},null,2));
 const roi={left:1175,top:620,width:530,height:300},records:any[]=[],sheets:any[]=[],denseSheets:any[]=[],sheetTiles:Buffer[]=[],denseTiles:Buffer[]=[];
 const dense=(f:number)=>[profile.observations.extractionReview,profile.observations.returnReview].some(([a,b])=>f>=a&&f<=b);
 const keys=seat===3?[0,32,38,42,46,52,100,184,188,192,200,359]:[0,52,60,68,74,80,180,220,248,252,260,359];
 const frames=mode==='stills'?keys:Array.from({length:360},(_,i)=>i);
 const crop=(raw:Buffer)=>sharp(raw,{raw:{width:W,height:H,channels:3}}).extract(roi).raw().toBuffer();
 async function flush(tiles:Buffer[],kind:string,refs:any[]){if(!tiles.length)return;const path=`${run}/qa/${kind}-${String(refs.length).padStart(2,'0')}.jpg`;await sharp({create:{width:1590,height:Math.ceil(tiles.length/2)*150,channels:3,background:'#19212a'}}).composite(tiles.map((input,i)=>({input,left:i%2*795,top:Math.floor(i/2)*150}))).jpeg({quality:95}).toFile(path);refs.push(await ref(path));tiles.length=0;}
 try{for(const f of frames){
  const rec=track.frames[f],sourceBytes=await readFile(rec.source.path),maskBytes=await readFile(rec.mask.path);assert.equal(hash(sourceBytes),rec.source.sha256);assert.equal(hash(maskBytes),rec.mask.sha256);
  const source=await sharp(sourceBytes).removeAlpha().raw().toBuffer(),semanticMaskRgb=await sharp(maskBytes).removeAlpha().raw().toBuffer();assert.equal(hash(source),atlas.frames[f].sourceRgbSha256);
  const paper=new Uint8Array(W*H);for(const c of atlas.frames[f].cards){const page=atlas.pages[c.atlas.page],data=pageBuffers[c.atlas.page];for(let y=0;y<c.bounds.height;y++)for(let x=0;x<c.bounds.width;x++){const p=(c.bounds.top+y)*W+c.bounds.left+x;paper[p]=Math.max(paper[p],data[(c.atlas.top+y)*page.width+c.atlas.left+x]);}}
  const masks=createPamelaShoeBankRemoval({identity:profile.identity,sourceFrame:f,sourceRgb:source,semanticMaskRgb,paperCoverage:paper});
  for(const k of ['semanticPaperOverlap','atlasPaperOverlap','semanticSkinOverlap','oldRearSilhouetteLeaks'] as const)assert.equal(masks.diagnostics[k],0,`${k} f${f}`);
  const keyed=keyPamelaFrame(source,W,H),before=Buffer.alloc(W*H*3),render=[Buffer.alloc(W*H*3),Buffer.alloc(W*H*3)];
  let sourceSkinRemoved=0,sourcePaperRemoved=0,opaqueSkinChanged=0,opaquePaperChanged=0,retainedBodyOutsideContact=0;
  for(let p=0;p<W*H;p++){
   const i=p*3,y=Math.floor(p/W),x=p%W,a=keyed.alpha[p],r=source[i],g=source[i+1],b=source[i+2];
   const skin=r>75&&r-g>12&&r-b>30,paperAtPixel=paper[p]>0||semanticMaskRgb[i]>0||semanticMaskRgb[i+1]>0;
   if(masks.removeAlpha[p]&&skin)sourceSkinRemoved++;
   if(masks.removeAlpha[p]&&paperAtPixel)sourcePaperRemoved++;
   if(masks.foregroundGuard[p]&&!masks.retainedContact[p]&&!paperAtPixel&&!skin&&Math.max(r,g,b)<105)retainedBodyOutsideContact++;
   const backdrop=y<876?[40,45,48]:[39,70,58];
   for(let c=0;c<3;c++)before[i+c]=Math.round(keyed.rgb[i+c]*a+backdrop[c]*(1-a));
   for(let n=0;n<2;n++){
    const ga=textures[n][p*4+3]/255,sourceAlpha=a*(1-masks.removeAlpha[p]/255);
    for(let c=0;c<3;c++)render[n][i+c]=Math.round(keyed.rgb[i+c]*sourceAlpha+(backdrop[c]*(1-ga)+textures[n][p*4+c]*ga)*(1-sourceAlpha));
    if(a===1&&(render[n][i]!==before[i]||render[n][i+1]!==before[i+1]||render[n][i+2]!==before[i+2])){if(skin)opaqueSkinChanged++;if(paperAtPixel)opaquePaperChanged++;}
   }
  }
  for(const [k,v]of Object.entries({sourceSkinRemoved,sourcePaperRemoved,opaqueSkinChanged,opaquePaperChanged}))assert.equal(v,0,`${k} f${f}`);
  if(encoder){const pair=Buffer.alloc(W*2*H*3);for(let y=0;y<H;y++)for(let n=0;n<2;n++)render[n].copy(pair,(y*W*2+n*W)*3,y*W*3,(y+1)*W*3);await encoder.write(pair);}
  const removalPath=`${run}/masks/removal-${String(f).padStart(3,'0')}.png`,guardPath=`${run}/masks/foreground-${String(f).padStart(3,'0')}.png`;
  await sharp(masks.removeAlpha,{raw:{width:W,height:H,channels:1}}).png().toFile(removalPath);await sharp(masks.foregroundGuard,{raw:{width:W,height:H,channels:1}}).png().toFile(guardPath);
  const crops=[];for(const b of [before,...render])crops.push(await crop(b));const panel=Buffer.alloc(1590*300*3);for(let n=0;n<3;n++)for(let y=0;y<300;y++)crops[n].copy(panel,(y*1590+n*530)*3,y*530*3,(y+1)*530*3);
  const caption=Buffer.from(`<svg width="1590" height="20"><rect width="1590" height="20" fill="#19212a"/><text x="8" y="15" font-family="Arial" font-size="13" fill="white">C2-P${seat} f${f}: SOURCE / COMPACT / ROUNDED | native crop x1175 y620 | source collar retained</text></svg>`);
  if(keys.includes(f)||dense(f))await sharp(panel,{raw:{width:1590,height:300,channels:3}}).composite([{input:caption,left:0,top:0}]).png().toFile(`${run}/qa/native-${String(f).padStart(3,'0')}.png`);
  if(keys.includes(f))for(let n=0;n<2;n++)await sharp(render[n],{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/${shapeNames[n]}-${String(f).padStart(3,'0')}.png`);
  const label=Buffer.from(`<svg width="795" height="15"><rect width="795" height="15" fill="#19212a"/><text x="4" y="12" font-family="Arial" font-size="11" fill="white">P${seat} f${f}: source / compact / rounded</text></svg>`);
  const tile=await sharp(panel,{raw:{width:1590,height:300,channels:3}}).resize(795,150).composite([{input:label,left:0,top:0}]).png().toBuffer();sheetTiles.push(tile);if(sheetTiles.length===24)await flush(sheetTiles,'all',sheets);
  if(dense(f)){denseTiles.push(tile);if(denseTiles.length===12)await flush(denseTiles,'dense',denseSheets);}
  records.push({frame:f,source:rec.source,sourceRgbSha256:hash(source),semanticMask:rec.mask,paperCoverageSha256:hash(paper),removal:await ref(removalPath),foreground:await ref(guardPath),nativeRenderRgbSha256:render.map(hash),sourceSkinRemoved,sourcePaperRemoved,opaqueSkinChanged,opaquePaperChanged,retainedBodyOutsideContact,...masks.diagnostics});
  if(f%30===0||mode==='stills')console.log(JSON.stringify({seat,frame:f,...masks.diagnostics,retainedBodyOutsideContact}));
 }
 if(encoder)await encoder.finish();await flush(sheetTiles,'all',sheets);await flush(denseTiles,'dense',denseSheets);
 }catch(e){encoder?.abort();throw e;}
 const outputs=[];if(encoder)for(const path of nativePaths){const probe=JSON.parse(execFileSync(`${bin}/ffprobe.exe`,['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{encoding:'utf8',windowsHide:true}));assert.equal(probe.streams[0].width,W);assert.equal(probe.streams[0].height,H);assert.equal(probe.streams[0].avg_frame_rate,'30/1');assert.equal(Number(probe.streams[0].nb_read_frames),360);outputs.push({...await ref(path),probe});}
 let differentSilhouettePixels=0;for(let p=0;p<W*H;p++)if((textures[0][p*4+3]>127)!==(textures[1][p*4+3]>127))differentSilhouettePixels++;assert.ok(differentSilhouettePixels>1000);
 for(const r of [...code,...inputRefs])assert.equal((await ref(r.path)).sha256,r.sha256,'Source/code changed during run');
 await writeFile(`${run}/frame-records.json`,JSON.stringify(records));
 const checks={frames:records.length,designs:2,differentSilhouettePixels,identityRejections,maximumMediaProcesses:1,maxSemanticPaperOverlap:Math.max(...records.map(x=>x.semanticPaperOverlap)),maxAtlasPaperOverlap:Math.max(...records.map(x=>x.atlasPaperOverlap)),maxSemanticSkinOverlap:Math.max(...records.map(x=>x.semanticSkinOverlap)),maxSourceSkinRemoved:Math.max(...records.map(x=>x.sourceSkinRemoved)),maxOpaqueSkinChanged:Math.max(...records.map(x=>x.opaqueSkinChanged)),maxOpaquePaperChanged:Math.max(...records.map(x=>x.opaquePaperChanged)),maxOldRearSilhouetteLeaks:Math.max(...records.map(x=>x.oldRearSilhouetteLeaks)),maxRetainedDarkOutsideContact:Math.max(...records.map(x=>x.retainedBodyOutsideContact)),contactInsertPixels:records[0].contactPixels};
 await writeFile(`${run}/evidence.json`,JSON.stringify({status:mode==='proof'?'offline-source-bound-shoe-bank-candidate':'still-diagnostic-only',profile,inputRefs,code,assets,outputs,sheets,denseSheets,frameRecords:await ref(`${run}/frame-records.json`),checks,limitations:PAMELA_SHOE_BANK_LIMITS,apiCalls:0,paidJobs:0,browserGpuVerified:false,productionAccepted:false,ownedMediaWorkerExited:true},null,2));
 console.log(JSON.stringify({run,evidence:await ref(`${run}/evidence.json`),checks}));
}else throw Error('Unknown mode');
