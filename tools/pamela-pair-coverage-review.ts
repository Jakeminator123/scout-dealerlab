import{readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import sharp from'sharp';
import{SEAT7_SOURCE as source,projectNeutralMesh}from'../src/pamela-seat7-card-track.ts';
const root='runs/20261109-pamela-seat7-card-pair',run=root+'/take-03',tracking=JSON.parse(await readFile('runs/20261109-pamela-seat7-card-track/tracking.json','utf8'));
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),rows=[];
for(let f=179;f<=195;f++){
 const tag=String(f).padStart(4,'0'),uv=projectNeutralMesh(tracking.frames[f].sections);
 const [single,before,after]=await Promise.all([`${run}/single-frames/frame-${tag}.png`,`${root}/take-02/pair-frames/frame-${tag}.png`,`${run}/pair-frames/frame-${tag}.png`].map(p=>sharp(p).removeAlpha().raw().toBuffer()));
 const counts=[0,0],maxima=[0,0];
 for(let p=0;p<source.width*source.height;p++){
  if(uv[p*2]<.15||uv[p*2]>.85||uv[p*2+1]<.15||uv[p*2+1]>.85)continue;
  const j=p*3,baseline=(single[j]+single[j+2])/2-single[j+1];
  for(const[k,b]of [before,after].entries()){const bias=(b[j]+b[j+2])/2-b[j+1],delta=bias-baseline;if(bias>3&&delta>3){counts[k]++;maxima[k]=Math.max(maxima[k],delta);}}
 }
 rows.push({frame:f,interiorAddedMagentaBefore:counts[0],interiorAddedMagentaAfter:counts[1],maxIncreaseBefore:maxima[0],maxIncreaseAfter:maxima[1]});
}
const evidence=JSON.parse(await readFile(run+'/evidence.json','utf8'));
const old=await readFile(root+'/take-02/evidence.json');
const report={take:3,createdAt:new Date().toISOString(),decision:'improved-coverage-prototype-not-final',validation:evidence.validation,movies:evidence.movies,colourDiagnostic:{criterion:'UV0.15..0.85, added (R+B)/2-G bias >3 above preserved single-card compositor; diagnostic threshold, not perceptual acceptance',rows},visualReview:{inspectedNativeFrames:[184,187],consecutiveContactSheetRange:[185,199],observations:['Opaque upper-paper shadow remains natural instead of receiving false background recovery','Two printed contours are distinct after release','Fine uneven contact rim remains; upper symbol is occluded by conservative warm-shadow guard during lift'],acceptedAsFinal:false},previousEvidence:{path:root+'/take-02/evidence.json',sha256:hash(old)},limitations:['No physical side or scale approval','Warm shadow/hand classification remains conservative','No continuous normal-speed perceptual acceptance yet']};
await writeFile(run+'/review.json',JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({frames:rows.length,before:rows.reduce((s,r)=>s+r.interiorAddedMagentaBefore,0),after:rows.reduce((s,r)=>s+r.interiorAddedMagentaAfter,0),report:run+'/review.json'}));
