import{mkdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{execFileSync}from'node:child_process';
import sharp from'sharp';
import{keyPamelaFrame}from'../src/pamela-key.ts';
import{readPamelaBankCatalog}from'../src/pamela-bank-catalog.ts';
sharp.concurrency(1);
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),root='runs/20261109-pamela-landed-card-layers',bank=await readPamelaBankCatalog();await mkdir(root,{recursive:true});
const records=[];
for(const motion of bank.motions){
 const seat=bank.seats.find(s=>s.file===motion.file)!.seat,dir=`${root}/${motion.sha256.slice(0,16)}`,recordPath=dir+'/record.json';
 try{const record=JSON.parse(await readFile(recordPath,'utf8'));if(record.sourceSha256!==motion.sha256||hash(await readFile(record.layer.path))!==record.layer.sha256)throw Error('Layer identity mismatch');records.push(record);continue;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(hash(await readFile(motion.file))!==motion.sha256)throw Error('Source hash changed');await mkdir(dir,{recursive:true});
 const sourceFrame=350,framePath=dir+'/source-0350.png';
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-n','-i',motion.file,'-vf',`select=eq(n\\,${sourceFrame})`,'-frames:v','1',framePath],{stdio:'pipe',windowsHide:true});
 const W=motion.width,H=motion.height,ranges:Record<number,[number,number]>={1:[0,.24],2:[.16,.36],3:[.28,.48],4:[.40,.60],5:[.52,.72],6:[.64,.84],7:[.80,1]};
 const [x0,x1]=ranges[seat],roi={left:Math.floor(x0*W),top:Math.floor(.74*H),width:Math.floor(x1*W)-Math.floor(x0*W),height:H-Math.floor(.74*H)};
 const rgb=await sharp(framePath).extract(roi).removeAlpha().raw().toBuffer(),count=roi.width*roi.height,core=new Uint8Array(count),seen=new Uint8Array(count);
 for(let p=0;p<count;p++){const i=p*3,r=rgb[i],g=rgb[i+1],b=rgb[i+2];core[p]=Number(r>=155&&g>=155&&b>=145&&Math.max(r,g,b)-Math.min(r,g,b)<=65&&g-Math.max(r,b)<35);}
 let largest:number[]=[];
 for(let start=0;start<count;start++){if(!core[start]||seen[start])continue;const queue=[start];seen[start]=1;
  for(let at=0;at<queue.length;at++){const p=queue[at],x=p%roi.width,y=Math.floor(p/roi.width);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=roi.width||yy<0||yy>=roi.height)continue;const q=yy*roi.width+xx;if(core[q]&&!seen[q]){seen[q]=1;queue.push(q);}}}
  if(queue.length>largest.length)largest=queue;
 }
 if(largest.length<500||largest.length>30000)throw Error(`Unreliable landed paper component for seat${seat}: ${largest.length}`);
 const support=new Uint8Array(count);for(const p of largest){const x=p%roi.width,y=Math.floor(p/roi.width);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<roi.width&&yy>=0&&yy<roi.height)support[yy*roi.width+xx]=1;}}
 const keyed=keyPamelaFrame(rgb,roi.width,roi.height),rgba=Buffer.alloc(W*H*4);let alphaPixels=0,minX=W,minY=H,maxX=0,maxY=0;
 for(let p=0;p<count;p++){if(!support[p]||keyed.alpha[p]<=.012)continue;const x=p%roi.width+roi.left,y=Math.floor(p/roi.width)+roi.top,q=(y*W+x)*4;for(let c=0;c<3;c++)rgba[q+c]=keyed.rgb[p*3+c];rgba[q+3]=Math.round(keyed.alpha[p]*255);alphaPixels++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
 const layerPath=dir+'/landed-card.png';await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toFile(layerPath);
 await sharp(rgba,{raw:{width:W,height:H,channels:4}}).extract({left:Math.max(0,minX-12),top:Math.max(0,minY-12),width:Math.min(W-1,maxX+12)-Math.max(0,minX-12)+1,height:Math.min(H-1,maxY+12)-Math.max(0,minY-12)+1}).flatten({background:'#244e39'}).png().toFile(dir+'/card-on-felt-color.png');
 const record={schemaVersion:1,seat,source:motion.file,sourceSha256:motion.sha256,sourceFrame,sourceFramePng:{path:framePath,sha256:hash(await readFile(framePath))},layer:{path:layerPath,sha256:hash(await readFile(layerPath)),width:W,height:H,alphaPixels,bounds:{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1}},sourceWhiteCorePixels:largest.length,roi,contactFrame:motion.contactFrame,productionAccepted:false,purpose:'Static independent landed-card layer for a rehearsal compositor. No card value, RNG or game state.',limits:['Native blank source paper, not final card artwork','Mask edge and inferred alpha require visual review','No physical card size calibration','Source lighting remains baked; ground shadow intentionally excluded']};
 await writeFile(recordPath,JSON.stringify(record,null,2),{flag:'wx'});records.push(record);
}
await writeFile(root+'/manifest.json',JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),bankUpdatedAt:bank.updatedAt,records,productionAccepted:false},null,2));
console.log(JSON.stringify({layers:records.length,seats:records.map(r=>({seat:r.seat,alphaPixels:r.layer.alphaPixels,bounds:r.layer.bounds}))}));
