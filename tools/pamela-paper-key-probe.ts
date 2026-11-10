import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import sharp from'sharp';
import assert from'node:assert/strict';
import{keyPamelaFrame}from'../src/pamela-key.ts';
import{keyPamelaFrameWithPaper}from'../src/pamela-key-paper.ts';
import{paperCoverage}from'../src/pamela-paper-coverage.ts';
const W=1762,H=1174,run='runs/20261109-pamela-paper-key/take-01',hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const source='runs/20261109-pamela-seat-bank/c2/bank-v2-stage-2/original/pamela-seat-3-wan3-c2-bank-v2.mp4',expected='bce1003fedde8573cfd85470367a16e439d40c230e3f526c5a51a105d151794b';assert.equal(hash(await readFile(source)),expected);
const frames='runs/20261109-pamela-seat-bank/c2/bank-v2-stage-2/qa/seat-3/frames',plan=JSON.parse(await readFile('runs/20261109-pamela-seat-bank/c2/bank-v2-plan/plan.json','utf8')),j=plan.jobs.find((j:any)=>j.seat===3),bs=[j.geometry.c1Native.bounds,j.geometry.c2Native.bounds];
const left=Math.min(...bs.map((b:any)=>b.left))-6,top=Math.min(...bs.map((b:any)=>b.top))-6,right=Math.max(...bs.map((b:any)=>b.left+b.width))+6,bottom=Math.max(...bs.map((b:any)=>b.top+b.height))+6,roi={left,top,width:right-left,height:bottom-top};
await mkdir('runs/20261109-pamela-paper-key',{recursive:true});await mkdir(run);await mkdir(run+'/qa');const records=[];
for(const f of[210,225,238,240,270,300,350,359]){
 const path=`${frames}/frame-${String(f).padStart(4,'0')}.png`,b=await readFile(path),raw=await sharp(b).removeAlpha().raw().toBuffer(),support=Buffer.alloc(W*H),guard=Buffer.alloc(W*H);
 // This probe is confined to the observed unoccluded final-pair region. It does
 // not authorize the same mask for the earlier hand-contact frames.
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const p=y*W+x,k=p*3,r=raw[k],g=raw[k+1],bb=raw[k+2];if(Math.min(r,bb)>150&&r-g<25&&Math.abs(r-bb)<50&&g-Math.max(r,bb)<45)support[p]=255;}
 const cov=paperCoverage(raw,support,guard,W,H).coverage,old=keyPamelaFrame(raw,W,H),fixed=keyPamelaFrameWithPaper(raw,W,H,cov),panels=[];let fullOpacityViolations=0,outsideChanges=0,sourceRgbViolations=0;
 for(let p=0;p<W*H;p++){if(cov[p]===255){if(fixed.alpha[p]!==1)fullOpacityViolations++;for(let c=0;c<3;c++)if(fixed.rgb[p*3+c]!==raw[p*3+c])sourceRgbViolations++;}if(!cov[p]&&(fixed.alpha[p]!==old.alpha[p]||[0,1,2].some(c=>fixed.rgb[p*3+c]!==old.rgb[p*3+c])))outsideChanges++;}
 assert.equal(fullOpacityViolations,0);assert.equal(outsideChanges,0);assert.equal(sourceRgbViolations,0);
 for(const img of[null,old,fixed]){const composite=Buffer.from(raw);if(img)for(let p=0;p<W*H;p++)for(let c=0;c<3;c++)composite[p*3+c]=Math.round(img.rgb[p*3+c]*img.alpha[p]+[17,29,23][c]*(1-img.alpha[p]));panels.push(await sharp(composite,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer());}
 const image=`${run}/qa/frame-${f}.png`;await sharp({create:{width:roi.width*3,height:roi.height,channels:3,background:'#17212a'}}).composite(panels.map((input,i)=>({input,left:i*roi.width,top:0}))).png().toFile(image);
 records.push({frame:f,path,sourcePngSha256:hash(b),image,imageSha256:hash(await readFile(image)),...fixed.verification,fullOpacityViolations,outsideChanges,sourceRgbViolations});
}
await writeFile(run+'/evidence.json',JSON.stringify({source,sourceSha256:expected,records,decision:'bounded unoccluded paper-key repair; in-hand semantic masks supplied separately',sourceEdited:false,wholeFilmVerified:false,code:await Promise.all(['src/pamela-key.ts','src/pamela-key-paper.ts','tools/pamela-paper-key-probe.ts'].map(async path=>({path,sha256:hash(await readFile(path))})))},null,2));console.log(JSON.stringify({run,records}));
