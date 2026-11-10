/** Native-scale card contact sheets from completed, hash-bound scene proofs. */
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
import sharp,{type OverlayOptions}from'sharp';
const arg=(k:string)=>process.argv.find(a=>a.startsWith(k+'='))?.slice(k.length+1),file=arg('--evidence'),expected=arg('--evidence-sha256');
assert.ok(file&&expected);assert.match(file,/^runs\/20261109-pamela-material-bank\/take-\d\d\/evidence.json$/);
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function checked(r:{path:string;sha256:string}){const b=await readFile(r.path);assert.equal(hash(b),r.sha256);return b;}
const e=JSON.parse((await checked({path:file,sha256:expected})).toString());assert.equal(e.parts.length,14);
const run=file.replace('/evidence.json','/contact-review');await mkdir(run);const samples:any[]=[],sheets=[];
for(const pass of[1,2]){
 const overlays:OverlayOptions[]=[];
 for(let seat=1;seat<=7;seat++){
  const id=`C${pass}-P${seat}`,part=JSON.parse((await checked(e.parts.find((p:any)=>p.id===id))).toString()),track=JSON.parse((await checked(part.selection.evidence)).toString());
  for(const [col,frame]of[60,100,180,350].entries()){
   const proof=part.records[frame].proof;assert.ok(proof);const png=await checked(proof),record=(track.records??track.frames)[frame];let bounds;
   if(pass===1)bounds=record.record?.bounds??record.bounds;
   else{
    const mask=await sharp(await checked(record.mask)).removeAlpha().raw().toBuffer();let left=1762,top=1174,right=-1,bottom=-1;
    for(let y=0;y<1174;y++)for(let x=0;x<1762;x++)if(mask[(y*1762+x)*3+1]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    assert.ok(right>=left&&bottom>=top);bounds={left,top,width:right-left+1,height:bottom-top+1};
   }
   const left=Math.max(0,bounds.left-24),top=Math.max(0,bounds.top-24),roi={left,top,width:Math.min(1762,bounds.left+bounds.width+24)-left,height:Math.min(1174,bounds.top+bounds.height+24)-top};
   const crop=await sharp(png).extract(roi).png().toBuffer(),path=`${run}/${id}-${frame}.png`;await writeFile(path,crop);
   const tile=await sharp(crop).resize(240,196,{fit:'contain',background:'#171c22'}).png().toBuffer();
   const label=Buffer.from(`<svg width="240" height="24"><rect width="100%" height="100%" fill="#171c22"/><text x="8" y="17" fill="white" font-family="Arial" font-size="14">${id} · källa ${frame}</text></svg>`);
   overlays.push({input:label,left:col*240,top:(seat-1)*220},{input:tile,left:col*240,top:(seat-1)*220+24});
   samples.push({id,frame,proof,roi,crop:{path,sha256:hash(crop)},viewScale:'Native ROI, contact-sheet tile may scale to fit; crop file is unscaled'});
  }
 }
 const path=`${run}/C${pass}-cards.png`;await sharp({create:{width:960,height:1540,channels:3,background:'#171c22'}}).composite(overlays).png().toFile(path);sheets.push({path,sha256:hash(await readFile(path))});
}
await writeFile(run+'/evidence.json',JSON.stringify({bank:{path:file,sha256:expected},samples,sheets,tool:{path:'tools/pamela-material-bank-contact.ts',sha256:hash(await readFile('tools/pamela-material-bank-contact.ts'))},scope:'56 selected native card ROIs, not full-motion perceptual acceptance'},null,2));
console.log(JSON.stringify({run,samples:samples.length,sheets}));
