import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {calibrateP4CardFrame,P4_NATIVE} from '../src/pamela-p4-card-calibration.ts';
import type {CardAtlasManifest,AtlasCard} from '../src/pamela-card-atlas.ts';
const take=process.argv.find(v=>v.startsWith('--take='))?.slice(7)??'01';assert.match(take,/^\d{2}$/);
const run=`runs/20261109-pamela-card-atlas/take-${take}`,hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex'),read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const evidencePath='runs/20261109-pamela-two-sided-flip/take-03/evidence.json',evidenceBytes=await readFile(evidencePath);
assert.equal(hash(evidenceBytes),'fabf6f623d2064d3c40111742eb8a53d3f8d532d06bfbdd1c314c1b5e0a2385e');
const evidence=JSON.parse(evidenceBytes.toString()),track=await read(evidence.selection.evidence.path);
assert.equal(hash(await readFile(evidence.selection.evidence.path)),evidence.selection.evidence.sha256);
assert.equal(hash(await readFile(track.source.path)),P4_NATIVE.sourceSha256);
const inputs=await read('runs/20261109-pamela-c2-motion-track/take-01/inputs.json'),firstQuad=inputs.jobs.find((j:any)=>j.seat===4).static.quads.c1;
await mkdir('runs/20261109-pamela-card-atlas',{recursive:true});await mkdir(run,{recursive:false});await mkdir(run+'/snapshot');await mkdir(run+'/assets');sharp.concurrency(1);
const code=[];for(const p of ['tools/pamela-card-atlas-build.ts','src/pamela-p4-card-calibration.ts','src/pamela-card-atlas.ts']){const b=await readFile(p);code.push({path:p,sha256:hash(b)});await copyFile(p,run+'/snapshot/'+p.split('/').at(-1));}
const W=P4_NATIVE.width,H=P4_NATIVE.height,S=4096,frames:CardAtlasManifest['frames']=[],buffers:Buffer[]=[Buffer.alloc(S*S)],heights=[0];
let page=0,x=2,y=2,rowHeight=0,totalPixels=0,guardedPixelsWritten=0,overlapPixels=0;
for(let f=0;f<360;f++){
 const rec=track.frames[f],src=await readFile(rec.source.path),maskBytes=await readFile(rec.mask.path);
 assert.equal(hash(src),rec.source.sha256);assert.equal(hash(maskBytes),rec.mask.sha256);
 const raw=await sharp(src).removeAlpha().raw().toBuffer(),mask=await sharp(maskBytes).removeAlpha().raw().toBuffer();
 const calibrated=calibrateP4CardFrame({frame:f,sourceSha256:track.source.sha256,sourceRgb:raw,semanticMaskRgb:mask,movingQuad:rec.quad,firstQuad});
 const paper=new Uint8Array(W*H);for(let p=0;p<W*H;p++)paper[p]=Math.max(calibrated.coverage[0][p],calibrated.coverage[1][p]);
 assert.equal(hash(paper),evidence.records[f].paperSha256,`Frozen paper changed at ${f}`);
 assert.deepEqual(calibrated.quads[1],evidence.records[f].quad);assert.equal(hash(raw),evidence.records[f].sourceRgbSha256);
 const cards:AtlasCard[]=[];
 for(let i=0;i<2;i++){
  const b=calibrated.bounds[i];if(x+b.width+2>S){x=2;y+=rowHeight+4;rowHeight=0;}if(y+b.height+2>S){page++;buffers.push(Buffer.alloc(S*S));heights.push(0);x=2;y=2;rowHeight=0;}
  for(let yy=0;yy<b.height;yy++)for(let xx=0;xx<b.width;xx++){
   const p=(b.top+yy)*W+b.left+xx,coverage=calibrated.guard[p]?0:calibrated.coverage[i][p];
   if(coverage&&calibrated.coverage[1-i][p])overlapPixels++;
   if(coverage&&calibrated.guard[p])guardedPixelsWritten++;
   buffers[page][(y+yy)*S+x+xx]=coverage;if(coverage)totalPixels++;
  }
  cards.push({bounds:b,atlas:{page,left:x,top:y,width:b.width,height:b.height},quad:calibrated.quads[i],side:i===0?'FRONT':calibrated.side});
  heights[page]=Math.max(heights[page],y+b.height+2);x+=b.width+4;rowHeight=Math.max(rowHeight,b.height);
 }
 frames.push({frame:f,cards,sourceRgbSha256:hash(raw),paperSha256:hash(paper)});
 if(f%60===0)console.log(JSON.stringify({frame:f,pages:buffers.length}));
}
assert.equal(guardedPixelsWritten,0);assert.equal(overlapPixels,0);
const pages=[];for(let i=0;i<buffers.length;i++){const p=`${run}/mask-${i}.png`;await sharp(buffers[i].subarray(0,S*heights[i]),{raw:{width:S,height:heights[i],channels:1}}).png().toFile(p);pages.push({path:p,sha256:hash(await readFile(p)),width:S,height:heights[i]});}
// Reuse exact reviewed artwork, independently addressable by engine identity.
const art=async(name:string)=>{const target=`${run}/assets/${name}.png`;await copyFile(`runs/20261109-pamela-two-sided-flip/take-03/assets/${name}.png`,target);return target;};
const artwork={back:{sg:await art('sg-back'),blue:await art('blue-back')},front:{classic:{'4C':await art('classic-4C'),'10D':await art('classic-10D')},ivory:{'4C':await art('ivory-4C'),'10D':await art('ivory-10D')}}};
for(const c of code)assert.equal(hash(await readFile(c.path)),c.sha256,'Code changed during build');
const manifest:CardAtlasManifest={schemaVersion:1,source:track.source,width:W,height:H,fps:30,frames,pages,artwork,verification:{nativeFrames:360,unchangedPaperFrames:360,guardedPixelsWritten,overlapPixels},limitations:['Blank source: semantic side schedule is authored, not inferred from printed faces','Only C2-P4 is calibrated; thin boundary uncertainty remains 1-2 native pixels','Planar per-frame projective UV; no reconstructed hidden card surface']};
await writeFile(run+'/manifest.json',JSON.stringify(manifest));
const assets=[];for(const p of Object.values(artwork.back).concat(...Object.values(artwork.front).map(v=>Object.values(v))))assets.push({path:p,sha256:hash(await readFile(p))});
await writeFile(run+'/evidence.json',JSON.stringify({status:'local-dynamic-atlas-candidate',manifest:{path:run+'/manifest.json',sha256:hash(await readFile(run+'/manifest.json'))},source:track.source,code,assets,pages,totalPaperPixelInstances:totalPixels,verification:manifest.verification,apiCalls:0,productionAccepted:false},null,2));
console.log(JSON.stringify({run,pages:pages.length,dimensions:pages.map(p=>[p.width,p.height]),totalPixels,verification:manifest.verification}));
