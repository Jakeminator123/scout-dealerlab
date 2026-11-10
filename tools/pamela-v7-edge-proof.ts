import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createPamelaCardContactV6Renderer} from '../src/pamela-card-contact-v6.ts';
import {createPamelaCardContactV7Renderer} from '../src/pamela-card-contact-v7.ts';
const take=process.argv.find(x=>x.startsWith('--take='))?.slice(7)??'01';
if(!/^\d{2}$/.test(take))throw Error('unique two digit take required');
const run=`runs/20261109-pamela-v7-edge-proof/take-${take}`,W=1762,H=1174;
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const tracks=JSON.parse(await readFile('runs/20261109-pamela-central-composite/tracking/card-tracks.json','utf8'));
const edges=JSON.parse(await readFile('runs/20261109-pamela-v7-edge-audit/paper-edge-contract.json','utf8'));
await mkdir('runs/20261109-pamela-v7-edge-proof',{recursive:true});await mkdir(run);await mkdir(`${run}/qa`);await mkdir(`${run}/snapshot`);
const snapshots=[];for(const p of ['src/pamela-card-contact-v7.ts','src/pamela-card-mesh-v7.ts','src/pamela-card-shadow-v7.ts','runs/20261109-pamela-v7-edge-audit/paper-edge-contract.json']){
 const bytes=await readFile(p);snapshots.push({path:p,sha256:sha(bytes)});await writeFile(`${run}/snapshot/${p.replaceAll('/','__')}`,bytes);
}
const before=await createPamelaCardContactV6Renderer(),after=await createPamelaCardContactV7Renderer();
const frames=[39,46,53,54,60,73,78,84,97],records=[];
for(const f of frames){
 const filename=`frame-${String(f+1).padStart(3,'0')}.png`,file=`runs/20261109-pamela-sequence/qa/central-base/${filename}`,bytes=await readFile(file);
 const sourceHash=sha(bytes),track=tracks.frames[f];if(sourceHash!==track.frameSha256)throw Error('Source hash mismatch');
 const edge=edges.frames.find((e:any)=>e.sourceFrame===f);if(edge&&edge.frameSha256!==sourceHash)throw Error('Edge binding mismatch');
 const raw=await sharp(bytes).removeAlpha().raw().toBuffer();
 const masks=await Promise.all(['moving','shoe'].map(async kind=>sharp(`runs/20261109-pamela-central-composite/tracking/${kind}-mask/${filename}`).greyscale().raw().toBuffer()));
 const input={raw,clip:'deal' as const,sourceFrame:f,dealOrdinal:0,priorCards:0,mask:masks[0],shoeMask:masks[1],contour:track.moving.contourNative,quad:track.moving.quadNative};
 const [a,b]=[await before(input),await after(input)];
 const oldEvidence=JSON.parse(await readFile('runs/20261109-pamela-local-shoe-proof/take-03/evidence.json','utf8'));
 const roi=oldEvidence.records.find((r:any)=>r.sourceFrame===f).roi;
 const crops=await Promise.all([raw,a.native,b.native].map(data=>sharp(data,{raw:{width:W,height:H,channels:3}}).extract(roi).resize(680,600).png().toBuffer()));
 const label=Buffer.from(`<svg width="2040" height="36"><rect width="100%" height="100%" fill="#17202a"/><text x="10" y="25" font-size="21" fill="white">Ruta ${f}: ORIGINAL | V6 | V7 lokalt kantprov (inte godkänd film)</text></svg>`);
 await sharp({create:{width:2040,height:636,channels:3,background:'#17202a'}}).composite([{input:label,left:0,top:0},...crops.map((input,i)=>({input,left:i*680,top:36}))]).png().toFile(`${run}/qa/comparison-${f}.png`);
 await sharp(b.native,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/after-${f}.png`);
 let headChanged=0;for(let p=0;p<W*480*3;p++)if(a.native[p]!==b.native[p])headChanged++;
 if(headChanged)throw Error('Unrelated upper image changed');
 records.push({sourceFrame:f,sourceHash,headChanged,diagnostics:b.diagnostics});console.log(`V7 frame ${f} ready`);
}
await writeFile(`${run}/evidence.json`,JSON.stringify({status:'diagnostic-awaiting-review',snapshots,records,newPaidJobs:0,notIntegratedIntoPublicOrFullSequence:true},null,2));
