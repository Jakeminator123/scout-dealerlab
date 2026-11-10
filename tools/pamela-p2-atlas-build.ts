import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {calibrateP2CardFrame,P2_NATIVE,P2_SIDE_POLICY} from '../src/pamela-p2-card-calibration.ts';
import {renderTwoSidedCards,type CardTexture,type CardSurface} from '../src/pamela-two-sided-card.ts';
import {keyPamelaFrame} from '../src/pamela-key.ts';
import {proofCardFrontSvg} from '../src/pamela-proof-card-designs.ts';
import {validateCardSceneAtlas} from '../src/pamela-card-scene-calibration.ts';
import type {CardAtlasManifest,AtlasCard} from '../src/pamela-card-atlas.ts';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([a-z-]+)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];})),take=args.take??'01';assert.match(take,/^\d{2}$/);
const proofPath=args['calibration-evidence'],proofSha=args['calibration-sha'];assert.match(proofPath??'',/^runs\/20261109-pamela-p2-card-calibration\/take-\d{2}\/evidence\.json$/);assert.match(proofSha??'',/^[a-f0-9]{64}$/);
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex'),read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),ref=async(p:string)=>({path:p,sha256:hash(await readFile(p))});
assert.equal((await ref(proofPath)).sha256,proofSha);const proof=await read(proofPath);
assert.equal(proof.source.sha256,P2_NATIVE.sourceSha256);
for(const file of ['src/pamela-p2-card-calibration.ts','src/pamela-two-sided-card.ts'])assert.equal((await ref(file)).sha256,proof.code.find((c:{path:string})=>c.path===file)?.sha256,'Calibration proof code changed');
assert.equal(proof.verification.changedProtectedPixels,0);assert.equal(proof.verification.changedOutsideCoverage,0);assert.equal(proof.verification.firstCoverageChanges,0);
const registry=await read('references/pamela-material-selections.json'),selection=registry.entries.find((x:any)=>x.id==='C2-P2'),track=await read(selection.evidence.path);assert.equal((await ref(selection.evidence.path)).sha256,selection.evidence.sha256);assert.equal((await ref(track.source.path)).sha256,P2_NATIVE.sourceSha256);
const inputs=await read('runs/20261109-pamela-c2-motion-track/take-01/inputs.json'),job=inputs.jobs.find((j:any)=>j.seat===2),firstQuad=job.static.quads.c1;
const run=`runs/20261109-pamela-p2-atlas/take-${take}`,W=1762,H=1174,S=4096;
await mkdir('runs/20261109-pamela-p2-atlas',{recursive:true});await mkdir(run);for(const d of ['snapshot','assets','render','comparison'])await mkdir(run+'/'+d);sharp.concurrency(1);
const code=[];for(const p of ['tools/pamela-p2-atlas-build.ts','src/pamela-p2-card-calibration.ts','src/pamela-two-sided-card.ts','src/pamela-proof-card-designs.ts','src/pamela-card-atlas.ts','src/pamela-card-scene-calibration.ts']){code.push(await ref(p));await copyFile(p,run+'/snapshot/'+p.split('/').at(-1));}
await copyFile(proofPath,run+'/snapshot/calibration-evidence.json');
const artwork:CardAtlasManifest['artwork']={back:{},front:{classic:{},ivory:{}}},art=new Map<string,CardTexture>(),assets:any[]=[];
for(const name of ['sg','blue']){const p=`${run}/assets/${name}-back.png`;await copyFile(`runs/20261109-pamela-two-sided-flip/take-03/assets/${name}-back.png`,p);artwork.back[name]=p;art.set(p,{id:name+'-back',width:252,height:352,rgb:await sharp(p).removeAlpha().raw().toBuffer()});assets.push(await ref(p));}
for(const style of ['classic','ivory'])for(const value of ['2C','QD']){const p=`${run}/assets/${style}-${value}.png`;await sharp(Buffer.from(proofCardFrontSvg(value,style==='ivory'))).removeAlpha().png().toFile(p);artwork.front[style][value]=p;art.set(p,{id:style+'-'+value,width:252,height:352,rgb:await sharp(p).removeAlpha().raw().toBuffer()});assets.push(await ref(p));}
const scenePlan=await read('runs/20261109-pamela-bank-sequence/take-03/plan.json'),sceneAssets=scenePlan.jobs[0].scene;for(const s of sceneAssets)assert.equal((await ref(s.path)).sha256,s.sha256);
const room=await sharp(sceneAssets[0].path).resize(W,H,{fit:'contain',background:'#24201d'}).removeAlpha().blur(8).modulate({brightness:.58,saturation:.65}).toBuffer();
const stage=await sharp(room).composite([{input:await readFile(sceneAssets[1].path)}]).removeAlpha().raw().toBuffer();
function encoder(file:string,w:number,h:number){const p=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pix_fmt','rgb24','-s',`${w}x${h}`,'-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','15','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',file],{windowsHide:true,stdio:['pipe','ignore','pipe']});let err='';p.stderr.on('data',b=>err+=b);p.stdin.on('error',()=>{});const done=once(p,'close');return{async write(b:Uint8Array){if(!p.stdin.write(b))await once(p.stdin,'drain');},async finish(){p.stdin.end();const[c]=await done;assert.equal(c,0,err);},abort(){p.stdin.destroy();if(p.exitCode===null)p.kill();}};}
const designs=[{id:'sg-classic',back:'sg',front:'classic'},{id:'blue-ivory',back:'blue',front:'ivory'}],encoders=designs.map(d=>encoder(`${run}/render/${d.id}.mp4`,W,H));
const pagesRaw=[Buffer.alloc(S*S)],pageHeights=[0],frames:CardAtlasManifest['frames']=[],records:any[]=[];let page=0,x=2,y=2,row=0,totalAdded=0,unchangedPaperFrames=0,guardedPixelsWritten=0,overlapPixels=0;
try{for(let f=0;f<360;f++){
 const rec=track.frames[f],sourceBytes=await readFile(rec.source.path),maskBytes=await readFile(rec.mask.path);assert.equal(hash(sourceBytes),rec.source.sha256);assert.equal(hash(maskBytes),rec.mask.sha256);
 const raw=await sharp(sourceBytes).removeAlpha().raw().toBuffer(),mask=await sharp(maskBytes).removeAlpha().raw().toBuffer(),cal=calibrateP2CardFrame({frame:f,sourceSha256:P2_NATIVE.sourceSha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad});
 const paper=new Uint8Array(W*H),oldPaper=new Uint8Array(W*H),released=new Set<number>((cal as typeof cal&{releasedGuardPixels?:number[]}).releasedGuardPixels??[]);let firstChanges=0,guardChanges=0;
 for(let p=0;p<W*H;p++){if(cal.coverage[0][p]!==mask[p*3])firstChanges++;if(cal.guard[p]!==mask[p*3+2]){guardChanges++;assert.ok((f===75||f===76)&&released.has(p)&&mask[p*3+2]>0&&cal.guard[p]===0&&cal.coverage[1][p]>0,'Unreported foreground correction');}paper[p]=Math.max(cal.coverage[0][p],cal.coverage[1][p]);oldPaper[p]=Math.max(mask[p*3],mask[p*3+1]);}
 assert.equal(firstChanges,0);assert.equal(guardChanges,released.size);
 if(hash(paper)===hash(oldPaper))unchangedPaperFrames++;totalAdded+=cal.added;
 const cards:AtlasCard[]=[];for(let i=0;i<2;i++){
  const b=cal.bounds[i];if(x+b.width+2>S){x=2;y+=row+4;row=0;}if(y+b.height+2>S){page++;pagesRaw.push(Buffer.alloc(S*S));pageHeights.push(0);x=2;y=2;row=0;}
  for(let yy=0;yy<b.height;yy++)for(let xx=0;xx<b.width;xx++){const p=(b.top+yy)*W+b.left+xx,a=cal.guard[p]?0:cal.coverage[i][p];if(a&&cal.guard[p])guardedPixelsWritten++;if(a&&cal.coverage[1-i][p])overlapPixels++;pagesRaw[page][(y+yy)*S+x+xx]=a;}
  cards.push({bounds:b,atlas:{page,left:x,top:y,width:b.width,height:b.height},quad:cal.quads[i],side:i===0?'FRONT':cal.side});pageHeights[page]=Math.max(pageHeights[page],y+b.height+2);x+=b.width+4;row=Math.max(row,b.height);
 }
 const keyed=keyPamelaFrame(raw,W,H),base=Buffer.from(stage);for(let p=0;p<W*H;p++){const a=keyed.alpha[p],k=p*3;for(let c=0;c<3;c++)base[k+c]=Math.round(stage[k+c]*(1-a)+keyed.rgb[k+c]*a);}
 const variants=[],painted:Buffer[]=[];
 for(const [i,design]of designs.entries()){
  const layers:CardSurface[]=cal.coverage.map((coverage,slot)=>({presentation:{slotId:`seat-2.card-${slot+1}`,physicalSide:slot===0?'FRONT':cal.side,engine:{cardId:slot===0?'2C':'QD',frontAllowed:true},back:art.get(artwork.back[design.back])!,front:id=>art.get(artwork.front[design.front][id])!},coverage,guard:cal.guard,quad:cal.quads[slot],bounds:cal.bounds[slot]}));
  const paintedCard=renderTwoSidedCards(raw,W,H,layers),out=Buffer.from(base);let outside=0,protectedChanges=0;
  for(let p=0;p<W*H;p++){const k=p*3,changed=paintedCard.rgb[k]!==raw[k]||paintedCard.rgb[k+1]!==raw[k+1]||paintedCard.rgb[k+2]!==raw[k+2];if(changed&&!paper[p])outside++;if(changed&&cal.guard[p])protectedChanges++;if(paper[p]&&!cal.guard[p]){const a=Math.max(keyed.alpha[p],paper[p]/255);for(let c=0;c<3;c++)out[k+c]=Math.round(stage[k+c]*(1-a)+paintedCard.rgb[k+c]*a);}}
  assert.equal(outside,0);assert.equal(protectedChanges,0);await encoders[i].write(out);painted.push(out);variants.push({id:design.id,printedRgbSha256:hash(paintedCard.rgb),sceneRgbSha256:hash(out),outside,protectedChanges,states:paintedCard.states});
 }
 if(f>=54&&f<=114){const old=await sharp(rec.output.path).removeAlpha().raw().toBuffer(),before=Buffer.from(base);for(let p=0;p<W*H;p++)if(oldPaper[p]){const k=p*3,a=Math.max(keyed.alpha[p],oldPaper[p]/255);for(let c=0;c<3;c++)before[k+c]=Math.round(stage[k+c]*(1-a)+old[k+c]*a);}
  const q=cal.quads[1],cx=q.reduce((a,p)=>a+p[0],0)/4,cy=q.reduce((a,p)=>a+p[1],0)/4,roi={left:Math.max(0,Math.min(W-240,Math.round(cx-120))),top:Math.max(0,Math.min(H-240,Math.round(cy-120))),width:240,height:240},panels=[];
  for(const[i,b]of [before,...painted].entries())panels.push({input:await sharp(b,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(480,480,{kernel:'nearest'}).png().toBuffer(),left:i*480,top:24});
  panels.push({input:Buffer.from(`<svg width="1440" height="24"><rect width="1440" height="24" fill="#17232b"/><text x="8" y="17" fill="white" font-family="Arial" font-size="14">Plats 2 ruta ${f} ${cal.side} | FORE: endast framsida | EFTER: SG | EFTER: bla/elfenben</text></svg>`),left:0,top:0});await sharp({create:{width:1440,height:504,channels:3,background:'#17232b'}}).composite(panels).removeAlpha().png().toFile(`${run}/comparison/frame-${String(f-54).padStart(3,'0')}.png`);
 }
 frames.push({frame:f,cards,sourceRgbSha256:hash(raw),paperSha256:hash(paper)});records.push({frame:f,side:cal.side,added:cal.added,releasedGuardPixels:[...released],source:rec.source,mask:rec.mask,variants});if(f%60===0)console.log(JSON.stringify({frame:f,totalAdded}));
}for(const e of encoders)await e.finish();}catch(e){encoders.forEach(x=>x.abort());throw e;}
const pages=[];for(let i=0;i<pagesRaw.length;i++){const p=`${run}/mask-${i}.png`;await sharp(pagesRaw[i].subarray(0,S*pageHeights[i]),{raw:{width:S,height:pageHeights[i],channels:1}}).png().toFile(p);pages.push({...await ref(p),width:S,height:pageHeights[i]});}
assert.equal(guardedPixelsWritten,0);assert.equal(overlapPixels,0);
const manifest:CardAtlasManifest={schemaVersion:1,source:track.source,width:W,height:H,fps:30,frames,pages,artwork,verification:{nativeFrames:360,unchangedPaperFrames,guardedPixelsWritten,overlapPixels},limitations:['C2-P2 only; blank source semantic identity is UNKNOWN','Authored BACK<79 EDGE79..88 FRONT>=89, engine permission overrides front','Source-bound ribbon74..88; proven free-tip guard errors75/76 corrected and individually recorded; C1 preserved','No P4 shoe/contact calibration may be reused on P2']};validateCardSceneAtlas(manifest);
await writeFile(run+'/manifest.json',JSON.stringify(manifest));await writeFile(run+'/frame-records.json',JSON.stringify(records));
execFileSync('ffmpeg',['-v','error','-nostdin','-n','-framerate','30','-i',run+'/comparison/frame-%03d.png','-an','-c:v','libx264','-preset','fast','-crf','15','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',run+'/render/turn-before-after.mp4'],{windowsHide:true});
const outputs=[];for(const id of [...designs.map(d=>d.id),'turn-before-after']){const p=`${run}/render/${id}.mp4`,probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',p],{encoding:'utf8',windowsHide:true}));assert.equal(probe.streams[0].avg_frame_rate,'30/1');assert.equal(Number(probe.streams[0].nb_read_frames),id==='turn-before-after'?61:360);outputs.push({...await ref(p),probe});}
for(const c of code)assert.equal((await ref(c.path)).sha256,c.sha256,'Code changed during run');assert.equal((await ref(proofPath)).sha256,proofSha,'Calibration proof changed');
await writeFile(run+'/evidence.json',JSON.stringify({status:'local-source-bound-two-sided-candidate',source:track.source,selection,calibration:{path:proofPath,sha256:proofSha},sidePolicy:P2_SIDE_POLICY,manifest:await ref(run+'/manifest.json'),frameRecords:await ref(run+'/frame-records.json'),code,assets,pages,outputs,verification:{...manifest.verification,totalAdded,renderedVariants:720,outsideCoverageChanges:0,protectedChanges:0},apiCalls:0,productionAccepted:false},null,2));
console.log(JSON.stringify({run,frames:360,outputs:outputs.length,totalAdded,unchangedPaperFrames}));
