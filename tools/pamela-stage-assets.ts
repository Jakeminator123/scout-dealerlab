import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {keyPamelaFrame} from '../src/pamela-key.ts';
sharp.concurrency(1);
const out='runs/20261109-pamela-stage';await mkdir(out,{recursive:true});
const source='runs/20261109-pamela-sequence/qa/central-base/frame-001.png';
const room='runs/20261109-pamela-central-composite/scene-assets/pamela-clean-room-v1.png';
const table='runs/20261109-pamela-central-composite/scene-assets-v2/dark-felt-table-native-1762x1174.png';
const raw=await sharp(source).removeAlpha().raw().toBuffer(),key=keyPamelaFrame(raw,1762,1174),rgba=Buffer.alloc(1762*900*4);
for(let p=0;p<1762*900;p++){for(let c=0;c<3;c++)rgba[p*4+c]=key.rgb[p*3+c];rgba[p*4+3]=Math.round(key.alpha[p]*255);}
await sharp(rgba,{raw:{width:1762,height:900,channels:4}}).png().toFile(`${out}/dealer-reference.png`);
await sharp(room).resize(1600,1000,{fit:'cover'}).blur(6).modulate({brightness:.65,saturation:.6}).jpeg({quality:90}).toFile(`${out}/room-reference.jpg`);
await sharp(table).extract({left:500,top:900,width:700,height:230}).resize(1024,512).removeAlpha().jpeg({quality:92}).toFile(`${out}/felt-reference.jpg`);
const records=[];for(const path of [source,room,table,`${out}/dealer-reference.png`,`${out}/room-reference.jpg`,`${out}/felt-reference.jpg`])records.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
await writeFile(`${out}/assets.json`,JSON.stringify({status:'local-stage-study',sourceFrame:0,sourceVideoSha256:'2445bb2ef5122fe558134d582533d277603da72c4b98b6c782be01a5bf06235a',dealer:'Pamela source-bound planar still; source shoe and source lighting remain baked; no new view synthesis',crop:{x:0,y:0,width:1762,height:900},records},null,2));
console.log(`${out}: 3 assets + hash manifest`);
