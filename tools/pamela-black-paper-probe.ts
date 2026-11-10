import{mkdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import sharp from'sharp';
import{SEAT7_SOURCE as source,trackSeat7Card,projectNeutralMesh}from'../src/pamela-seat7-card-track.ts';
import{PAMELA_SG_BACK_SVG}from'../src/pamela-card-surfaces.ts';
import{paperCoverage}from'../src/pamela-paper-coverage.ts';
const run='runs/20261109-pamela-black-paper-probe/take-01',W=source.width,H=source.height,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
await mkdir(run,{recursive:false});await mkdir(run+'/qa');
if(hash(await readFile(source.path))!==source.sha256)throw Error('Source changed');
sharp.concurrency(1);
const texture=await sharp(Buffer.from(PAMELA_SG_BACK_SVG)).removeAlpha().raw().toBuffer(),rows=[];
const frames=[50,65,75,85,90,95,100,105,110,150,184,187,188];
const label=(s:string,w:number)=>Buffer.from(`<svg width="${w}" height="28"><rect width="100%" height="100%" fill="#19232d"/><text x="8" y="20" fill="white" font-family="Arial" font-size="15">${s}</text></svg>`);
for(const f of frames){
 const file=`${source.frameDirectory}/frame-${String(f).padStart(4,'0')}.png`,bytes=await readFile(file),raw=await sharp(bytes).removeAlpha().raw().toBuffer();
 const t=trackSeat7Card(raw,f),uv=projectNeutralMesh(t.record.sections),c=paperCoverage(raw,t.mask,t.protectedSkin,W,H),before=Buffer.from(raw),after=Buffer.from(raw);
 let missingUv=0,protectedChanges=0,outsideChanges=0,changed=0;
 const {left,top,width,height}=t.record.bounds;
 for(let y=top;y<top+height;y++)for(let x=left;x<left+width;x++){
  const p=y*W+x,j=p*3;if(!t.mask[p]||t.protectedSkin[p])continue;
  let u=uv[p*2],v=uv[p*2+1],inside=u>=0&&u<=1&&v>=0&&v<=1;
  const oldA=inside&&u>.04&&u<.96&&v>.04&&v<.96?t.paint[p]/255:0;
  if(!inside){let best=Infinity,nearest=-1;for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;const q=yy*W+xx,d=dx*dx+dy*dy;
   if(uv[q*2]>=0&&d<best){best=d;nearest=q;}
  }if(nearest<0){missingUv++;continue;}u=uv[nearest*2];v=uv[nearest*2+1];}
  const tx=Math.max(0,Math.min(209,Math.round(u*209))),ty=Math.max(0,Math.min(293,Math.round(v*293))),k=(ty*210+tx)*3;
  const light=Math.min(1.05,(raw[j]+raw[j+1]+raw[j+2])/(3*245)),a=c.coverage[p]/255;
  // Difference compositing keeps the observed background contribution at edges.
  // An estimated white-paper radiance is replaced by the dark authored material.
  const neutral=(raw[j]+raw[j+2])/2;
  for(let channel=0;channel<3;channel++){
   before[j+channel]=Math.round(raw[j+channel]*(1-oldA)+texture[k+channel]*light*oldA);
   after[j+channel]=Math.max(0,Math.min(255,Math.round(raw[j+channel]+a*(texture[k+channel]*light-neutral))));
  }
 }
 for(let p=0;p<W*H;p++)if(after[p*3]!==raw[p*3]||after[p*3+1]!==raw[p*3+1]||after[p*3+2]!==raw[p*3+2]){changed++;if(t.protectedSkin[p])protectedChanges++;if(!t.mask[p]||t.shoePaper[p])outsideChanges++;}
 if(protectedChanges||outsideChanges)throw Error('Protected source pixel changed');
 const crop={left:Math.max(0,left-15),top:Math.max(0,top-15),width:Math.min(W-left+15,width+30),height:Math.min(H-top+15,height+30)};
 const panels=await Promise.all([raw,before,after].map(b=>sharp(b,{raw:{width:W,height:H,channels:3}}).extract(crop).resize(360,330,{fit:'contain',background:'#102018'}).png().toBuffer()));
 const output=`${run}/qa/frame-${String(f).padStart(4,'0')}.png`;
 await sharp({create:{width:1080,height:358,channels:3,background:'#19232d'}}).composite([...panels.map((input,i)=>({input,left:i*360,top:28})),{input:label(`SOURCE ${f} | CONSERVATIVE SG DEMO | FULL PAPER COVERAGE DEMO`,1080),left:0,top:0}]).png().toFile(output);
 rows.push({frame:f,sourcePngSha256:hash(bytes),output,outputSha256:hash(await readFile(output)),changed,protectedChanges,outsideChanges,missingUv,opaquePixels:c.opaquePixels,edgePixels:c.edgePixels});
}
await writeFile(run+'/evidence.json',JSON.stringify({source,frames:rows,acceptedAsFinal:false,side:'UNKNOWN',authoredSide:'BACK on every sampled frame for a coverage diagnostic; not an inferred flip sequence',limitations:['Source support and finger guard remain conservative appearance classifiers','No temporal blur or final material acceptance','Lighting/coverage is only estimated from the chroma source; no recovered physical material'],toolSha256:hash(await readFile('tools/pamela-black-paper-probe.ts')),coverageSha256:hash(await readFile('src/pamela-paper-coverage.ts'))},null,2));
console.log(JSON.stringify({frames:frames.length,protectedChanges:0,outsideChanges:0,run}));
