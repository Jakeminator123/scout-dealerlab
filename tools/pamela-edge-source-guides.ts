import {mkdir,readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {SYMMETRIC_P1_SOURCE as p1} from '../src/pamela-seat1-symmetric-card-track.ts';
import {SEAT7_SOURCE as p7} from '../src/pamela-seat7-card-track.ts';
const run='runs/20261109-pamela-edge-card-track/source-guides';
await mkdir(run,{recursive:true});
for(const [seat,source,frames,region] of [
 [1,p1,[92,93,94,95,96,97,98,99,100],{left:540,top:710,width:420,height:240}],
 [7,p7,[155,160,165,170,175,180,184,187,188],{left:1470,top:920,width:210,height:200}],
] as const){
 const images=[];
 for(const [i,frame] of frames.entries()){
  const path=`${source.frameDirectory}/frame-${String(frame).padStart(4,'0')}.png`;
  const metadata=await sharp(path).metadata();if(metadata.width!==1762||metadata.height!==1174)throw Error('Unexpected dimensions');
  const grid=Buffer.from(`<svg width="${region.width}" height="${region.height}"><g font-size="10" font-family="Arial" fill="#00b6e8" stroke="#00b6e8" stroke-width=".4">${Array.from({length:Math.ceil(region.width/25)},(_,i)=>{const x=Math.ceil(region.left/25)*25+i*25-region.left;return `<path d="M${x} 0V${region.height}"/><text x="${x+2}" y="12" stroke="none">${region.left+x}</text>`;}).join('')}${Array.from({length:Math.ceil(region.height/25)},(_,i)=>{const y=Math.ceil(region.top/25)*25+i*25-region.top;return `<path d="M0 ${y}H${region.width}"/><text x="2" y="${y+12}" stroke="none">${region.top+y}</text>`;}).join('')}</g></svg>`);
  const picture=await sharp(await readFile(path)).extract(region).composite([{input:grid}]).png().toBuffer();
  const label=Buffer.from(`<svg width="${region.width}" height="22"><rect width="100%" height="100%" fill="#18212a"/><text x="4" y="16" fill="white" font-size="13">P${seat}: ${frame}</text></svg>`);
  images.push({input:picture,left:(i%3)*region.width,top:Math.floor(i/3)*(region.height+22)+22},{input:label,left:(i%3)*region.width,top:Math.floor(i/3)*(region.height+22)});
 }
 await sharp({create:{width:region.width*3,height:(region.height+22)*3,channels:3,background:'#18212a'}}).composite(images).png().toFile(`${run}/p${seat}-native-grid.png`);
}
await writeFile(run+'/purpose.txt','Native source crops and coordinate guides. No source pixels or production media altered.');
