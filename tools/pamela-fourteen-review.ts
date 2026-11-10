/** Deterministic contact/seam sheets from the exact native composites used in the two passes. */
import{readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import sharp,{type OverlayOptions}from'sharp';
const first='runs/20261109-pamela-bank-sequence/take-03',second='runs/20261109-pamela-c2-bank-sequence/take-01';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const evidence=JSON.parse(await readFile(second+'/evidence.json','utf8'));
if(+evidence.output.probe.streams[0].nb_read_frames!==5040)throw Error('Incomplete combined bank');
const parts=[];for(const root of[first,second])for(let i=0;i<7;i++)parts.push(JSON.parse(await readFile(`${root}/part-${i}.json`,'utf8')));
const native=(part:any,frame:number)=>{const p=part.evidence.find((e:any)=>e.frame===frame)?.compositePng;if(!p)throw Error('Missing native witness');return p;};
const checked=async(p:{path:string;sha256:string})=>{const b=await readFile(p.path);if(hash(b)!==p.sha256)throw Error('Changed native witness');return b;};
const label=(text:string,width:number)=>Buffer.from(`<svg width="${width}" height="28"><rect width="100%" height="100%" fill="#142019"/><text x="8" y="20" font-family="sans-serif" font-size="17" fill="white">${text}</text></svg>`);
const contacts=[],inputs:OverlayOptions[]=[];
for(let seat=1;seat<=7;seat++)for(let pass=0;pass<2;pass++){
 const part=parts[pass*7+seat-1],p=native(part,350),left=pass*704,top=(seat-1)*498;
 inputs.push({input:label(`Plats ${seat} / ${pass+1} kort / kalla350`,704),left,top},{input:await sharp(await checked(p)).resize(704,470).png().toBuffer(),left,top:top+28});contacts.push({seat,ordinal:pass+1,native:p});
}
const contactPath=second+'/qa/all-fourteen-landings.png';await sharp({create:{width:1408,height:3486,channels:3,background:'#142019'}}).composite(inputs).png().toFile(contactPath);
const seamSheets=[],seams=[];
for(let start=0;start<13;start+=7){const items:OverlayOptions[]=[];const count=Math.min(7,13-start);
 for(let i=start;i<start+count;i++){
  const before=native(parts[i],359),after=native(parts[i+1],0),top=(i-start)*358;
  for(const[col,p]of[before,after].entries()){const b=await checked(p),face=await sharp(b).extract({left:650,top:80,width:500,height:330}).png().toBuffer();items.push({input:label(`${i+1} -> ${i+2} / ${col?'AFTER0':'BEFORE359'}`,500),left:col*500,top},{input:face,left:col*500,top:top+28});}
  seams.push({from:{seat:parts[i].job.seat,ordinal:i<7?1:2,frame:359,native:before},to:{seat:parts[i+1].job.seat,ordinal:i+1<7?1:2,frame:0,native:after},bankOutputFrame:(i+1)*360,fullLoopOutputFrame:222+(i+1)*360});
 }
 const file=`${second}/qa/all-redo-seams-${start}.png`;await sharp({create:{width:1000,height:count*358,channels:3,background:'#142019'}}).composite(items).png().toFile(file);seamSheets.push({path:file,sha256:hash(await readFile(file))});
}
await writeFile(second+'/qa/review-sheets.json',JSON.stringify({createdAt:new Date().toISOString(),bank:evidence.output,contacts,contactSheet:{path:contactPath,sha256:hash(await readFile(contactPath))},seams,seamSheets,meaning:'Native pre-encode contact and REDO witnesses; not continuous perceptual or runtime acceptance'},null,2),{flag:'wx'});
console.log(JSON.stringify({contacts:14,seams:13,contactPath,seamSheets}));
