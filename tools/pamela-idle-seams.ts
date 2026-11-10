import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {keyPamelaFrame} from '../src/pamela-key.ts';
const W=1762,H=1174,run='runs/20261109-pamela-idle-seams',src='runs/20261109-pamela-idle-pilot/qa';
await mkdir(run,{recursive:true});
type Roi={left:number;top:number;width:number;height:number};
const rois:Record<string,Roi>={face:{left:746,top:69,width:298,height:321},eyes:{left:805,top:200,width:130,height:45},hands:{left:619,top:745,width:482,height:172},shoe:{left:1182,top:631,width:522,height:269}};
const ids=[['breath',179],['glance',0],['glance',9],['glance',89],['breath',0]] as const;
const frames=await Promise.all(ids.map(async([name,frame])=>{const path=`${src}/${name}/frame-${String(frame+1).padStart(3,'0')}.png`,bytes=await readFile(path);return {name,frame,path,sha256:createHash('sha256').update(bytes).digest('hex'),rgb:await sharp(bytes).removeAlpha().raw().toBuffer()};}));
function stats(a:Buffer,b:Buffer,r:Roi){
 let sum=0,n=0,exact=0;for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++)for(let c=0;c<3;c++){const p=(y*W+x)*3+c,d=Math.abs(a[p]-b[p]);sum+=d;n++;if(d===0)exact++;}return {meanAbsRgbDifference:sum/n,exactComponentFraction:exact/n};
}
function registration(a:Buffer,b:Buffer,r:Roi){
 let best={dx:0,dy:0,meanAbsRgbDifference:Infinity};
 for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
  let sum=0,n=0;for(let y=r.top;y<r.top+r.height;y+=3)for(let x=r.left;x<r.left+r.width;x+=3)for(let c=0;c<3;c++){sum+=Math.abs(a[(y*W+x)*3+c]-b[((y+dy)*W+x+dx)*3+c]);n++;}
  if(sum/n<best.meanAbsRgbDifference)best={dx,dy,meanAbsRgbDifference:sum/n};
 }return {...best,meaning:'Best integer image-patch match within ±8 px; not anatomical landmarks or an identity score'};
}
const comparisons=[];
for(const [ai,bi,name] of [[0,1,'12s-cut'],[1,2,'first-0.3s-of-glance'],[3,4,'15s-cut'],[0,4,'6s-breath-loop']] as const){
 const a=frames[ai],b=frames[bi];comparisons.push({id:name,a:{name:a.name,frame:a.frame},b:{name:b.name,frame:b.frame},regions:Object.entries(rois).map(([id,roi])=>({id,roi,...stats(a.rgb,b.rgb,roi),translation:registration(a.rgb,b.rgb,roi)}))});
}
const panels=[];
for(let i=0;i<3;i++){
 const f=frames[i],roi=rois.face,img=await sharp(f.rgb,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer();
 const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="298" height="40"><rect width="298" height="40" fill="#17201b"/><text x="12" y="26" font-family="Arial" font-size="15" fill="white">${['Andning: sista rutan (359)','Blick: första rutan (360)','Blick: din ruta (369)'][i]}</text></svg>`);
 panels.push({input:label,left:i*298,top:0},{input:img,left:i*298,top:40});
}
await sharp({create:{width:894,height:361,channels:3,background:'#111'}}).composite(panels).png().toFile(`${run}/12s-face-originals.png`);
const keyCore=frames.slice(0,3).map(f=>{
 const key=keyPamelaFrame(f.rgb,W,H),r=rois.face;let opaque=0,changed=0;
 for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++){const p=y*W+x,i=p*3;if(f.rgb[i+1]-Math.max(f.rgb[i],f.rgb[i+2])<8&&key.alpha[p]===1){opaque++;if(key.rgb[i]!==f.rgb[i]||key.rgb[i+1]!==f.rgb[i+1]||key.rgb[i+2]!==f.rgb[i+2])changed++;}}
 return {clip:f.name,frame:f.frame,opaqueCorePixels:opaque,changedOpaqueCorePixels:changed};
});
const report={schemaVersion:1,createdAt:new Date().toISOString(),sourceSequence:'runs/20261109-pamela-idle-composite/render/pamela-idle-andning-blick-native-v1.mp4',userFrame:{outputFrame:369,time:12.3,clip:'glance',sourceFrame:9},joins:[{outputFrame:180,time:6,from:'breath179',to:'breath0'},{outputFrame:360,time:12,from:'breath179',to:'glance0'},{outputFrame:450,time:15,from:'glance89',to:'breath0'}],sources:frames.map(({rgb,...f})=>f),comparisons,keyCore,proof:`${run}/12s-face-originals.png`,conclusion:'Two independently generated originals differ at the 12s cut. The keyed opaque facial core is unchanged. The composite does not animate scale/position; no C2 warp was applied. Differences are present before compositing.',limitations:['Pixel differences and patch registration do not establish physical pose or identity quality.','Source green boundaries contribute to full-face ROI metrics. Native eyes and hands must be reviewed separately.','Do not hide an unaccepted seam using a whole-face crossfade; motion and anatomy need controlled matching.']};
await writeFile(`${run}/inspection.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({userFrame:report.userFrame,keyCore,comparisons:comparisons.map(c=>({id:c.id,regions:c.regions.map(r=>({id:r.id,mae:r.meanAbsRgbDifference,dx:r.translation.dx,dy:r.translation.dy}))}))}));
