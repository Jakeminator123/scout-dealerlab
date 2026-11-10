import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dense=process.argv.includes('--dense'),run=`runs/20261109-pamela-two-sided-flip/${dense?'survey-02-dense':'survey-01'}`,W=1762,H=1174;
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
sharp.concurrency(1);await mkdir(run,{recursive:true});
const registry=await read('references/pamela-material-selections.json'),results:any[]=[];
if(process.argv.includes('--grid')){
 const e=await read(registry.entries.find((x:any)=>x.id==='C2-P4').evidence.path),tiles:any[]=[];
 for(const [i,f]of [80,83,84,85,90,95,98,99].entries()){
  const q=e.frames[f].quad,cx=q.reduce((s:number,p:number[])=>s+p[0],0)/4,cy=q.reduce((s:number,p:number[])=>s+p[1],0)/4;
  const roi={left:Math.floor((cx-90)/10)*10,top:Math.floor((cy-60)/10)*10,width:180,height:120};
  let grid='';for(let x=0;x<=180;x+=10)grid+=`<line x1="${x*3}" y1="0" x2="${x*3}" y2="360" stroke="#f0f" opacity=".25"/><text x="${x*3+1}" y="12" fill="cyan" font-size="10">${roi.left+x}</text>`;for(let y=10;y<120;y+=10)grid+=`<line x1="0" y1="${y*3}" x2="540" y2="${y*3}" stroke="#f0f" opacity=".25"/><text x="0" y="${y*3-2}" fill="cyan" font-size="10">${roi.top+y}</text>`;
  const crop=await sharp(e.frames[f].source.path).extract(roi).resize(540,360,{kernel:'nearest'}).composite([{input:Buffer.from(`<svg width="540" height="360">${grid}<text x="420" y="345" fill="yellow" font-size="20">f${f}</text></svg>`)}]).png().toBuffer();tiles.push({input:crop,left:i%2*540,top:Math.floor(i/2)*360});
 }
 await sharp({create:{width:1080,height:1440,channels:3,background:'#17232b'}}).composite(tiles).png().toFile(run+'/coordinates.png');console.log(run+'/coordinates.png');process.exit();
}
for(const id of (dense?['C2-P4']:['C1-P3','C1-P4','C2-P3','C2-P4','central-original'])){
 const old=id==='central-original',sel=registry.entries.find((x:any)=>x.id===id);
 const e=old?await read('runs/20261109-pamela-central-composite/tracking/card-tracks.json'):await read(sel.evidence.path);
 if(!old&&hash(await readFile(sel.evidence.path))!==sel.evidence.sha256)throw Error('Changed selection');
 const nums=dense?Array.from({length:30},(_,i)=>78+i):old?[36,45,53,60,65,70,74,75,76,77,78,79,80,81,84,90,100,118]:[30,40,50,60,70,75,80,85,90,95,100,105,110,115,120,130,140,180];
 const tiles:any[]=[],records:any[]=[];
 for(const [i,f]of nums.entries()){
  const rec=e.frames[f],r=rec.record??rec;
  const path=old?`runs/20261109-pamela-sequence/qa/central-base/frame-${String(f+1).padStart(3,'0')}.png`:id.startsWith('C2')?rec.source.path:`${e.source.frameDirectory}/frame-${String(f).padStart(4,'0')}.png`;
  const bytes=await readFile(path),expected=old?rec.frameSha256:rec.source?.sha256??rec.sourcePngSha256;if(expected&&hash(bytes)!==expected)throw Error('Changed frame');
  const q=old?rec.moving.quadNative:r.quad;
  const b=old?rec.moving.bbox:r.bounds;
  const cx=q?.length?q.reduce((s:number,p:number[])=>s+p[0],0)/q.length:(b?.left??950)+(b?.width??100)/2;
  const cy=q?.length?q.reduce((s:number,p:number[])=>s+p[1],0)/q.length:(b?.top??670)+(b?.height??100)/2;
  const roi={left:Math.round(Math.max(0,Math.min(W-240,cx-120))),top:Math.round(Math.max(0,Math.min(H-240,cy-120))),width:240,height:240};
  tiles.push({input:Buffer.from(`<svg width="240" height="24"><rect width="240" height="24" fill="#17232b"/><text x="5" y="17" fill="white" font-size="14" font-family="Arial">${id} f${f}</text></svg>`),left:i%6*240,top:Math.floor(i/6)*264},{input:await sharp(bytes).extract(roi).png().toBuffer(),left:i%6*240,top:Math.floor(i/6)*264+24});
  records.push({frame:f,path,sha256:hash(bytes),roi,quad:q});
 }
 const sheet=`${run}/${id}.png`;await sharp({create:{width:1440,height:Math.ceil(nums.length/6)*264,channels:3,background:'#17232b'}}).composite(tiles).png().toFile(sheet);
 results.push({id,source:old?{path:'runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4',sha256:'2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a'}:e.source,selection:sel,records,sheet});
}
await writeFile(`${run}/survey.json`,JSON.stringify({results,indexing:'P1..P7 are one-based seats. Central original is center P4, equivalent zero-based index3; mapping to be verified against configuration.',apiCalls:0},null,2));
console.log(JSON.stringify({run,sheets:results.map(r=>r.sheet)}));
