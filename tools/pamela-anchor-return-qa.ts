import sharp from 'sharp';
import path from 'node:path';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile),root=process.cwd(),base='runs/20261109-pamela-continuous-idle',planPath=`${base}/qa-plan.json`;
const readJson=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const plan=await readJson(planPath);
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const input=arg('--input')??plan.input.plannedPath,out=arg('--out')??`${base}/qa`,expectedSha=arg('--expected-sha');
const outputRoot=path.resolve(out),allowedRoot=path.resolve(`${base}/qa`);
if(outputRoot!==allowedRoot&&!outputRoot.startsWith(allowedRoot+path.sep))throw Error('QA output must stay inside the owned continuous-idle/qa directory');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sourceBytes=await readFile(input),sourceSha256=hash(sourceBytes);
if(expectedSha&&sourceSha256!==expectedSha.toLowerCase())throw Error('Source hash differs from the supplied identity');
if(hash(await readFile(plan.input.anchorPath))!==plan.input.anchorSha256)throw Error('VILA anchor bytes changed');
const {stdout}=await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames,codec_name,pix_fmt:format=duration','-of','json',input],{windowsHide:true,maxBuffer:5000});
const probe=JSON.parse(stdout),s=probe.streams[0],rate=s.avg_frame_rate.split('/').map(Number),fps=rate[0]/rate[1],W=s.width,H=s.height,count=Number(s.nb_read_frames);
if(!Number.isFinite(fps)||fps<=0||!Number.isInteger(count)||count<3)throw Error('Unusable decoded timing metadata');
if(Math.abs((W/H)/(1762/1174)-1)>.01)throw Error('Different source aspect ratio: review native ROI placement before running this calibration');
await mkdir(out,{recursive:true});
const extractionPath=`${out}/extraction.json`,old=await readJson(extractionPath).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;});
if(old&&old.sourceSha256!==sourceSha256)throw Error('Existing QA directory belongs to different source bytes; use a new --out under qa');
const extraction={input,sourceSha256,width:W,height:H,fps,frameCount:count,frameConvention:'frame-001.png = source index0',originalsChanged:false};
await writeFile(extractionPath,JSON.stringify({...extraction,status:'in-progress'},null,2)+'\n');
const fp=(f:number)=>`${out}/frame-${String(f+1).padStart(3,'0')}.png`;
const frameFilesExist=(await Promise.all(Array.from({length:count},(_,f)=>stat(fp(f)).then(v=>v.size>0,()=>false)))).every(Boolean);
if(!frameFilesExist)await execute('ffmpeg',['-v','error','-nostdin','-i',input,'-map','0:v:0','-fps_mode','passthrough','-threads','4','-y',`${out}/frame-%03d.png`],{windowsHide:true,maxBuffer:5000});
await writeFile(extractionPath,JSON.stringify({...extraction,status:'complete',nativeFramePattern:`${out}/frame-%03d.png`},null,2)+'\n');
console.log(`EXTRACTION COMPLETE: ${count} native frames at ${out}/frame-%03d.png`);
type Roi={left:number;top:number;width:number;height:number};
const rois=Object.fromEntries(Object.entries(plan.comparison.roisAtReferenceCanvas as Record<string,Roi>).map(([k,r])=>[k,{left:Math.round(r.left*W/1762),top:Math.round(r.top*H/1174),width:Math.round(r.width*W/1762),height:Math.round(r.height*H/1174)}])) as Record<string,Roi>;
function crop(raw:Buffer,r:Roi){const b=Buffer.alloc(r.width*r.height*3);for(let y=0;y<r.height;y++)raw.copy(b,y*r.width*3,((r.top+y)*W+r.left)*3,((r.top+y)*W+r.left+r.width)*3);return b;}
function mae(a:Buffer,b:Buffer){let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;}
function skinCentre(b:Buffer,r:Roi){let n=0,sx=0,sy=0;for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const i=(y*r.width+x)*3,red=b[i],g=b[i+1],blue=b[i+2];if(red>95&&red>g*1.12&&g>blue*1.07){n++;sx+=x+r.left;sy+=y+r.top;}}return {pixels:n,x:n?sx/n:null,y:n?sy/n:null};}
const distance=(a:ReturnType<typeof skinCentre>,b:ReturnType<typeof skinCentre>)=>a.x!==null&&a.y!==null&&b.x!==null&&b.y!==null?Math.hypot(a.x-b.x,a.y-b.y):null;
function faceGradient(b:Buffer,r:Roi){const g=new Float32Array((r.width-1)*(r.height-1)*2);let j=0;const l=(i:number)=>.2126*b[i]+.7152*b[i+1]+.0722*b[i+2];for(let y=0;y<r.height-1;y++)for(let x=0;x<r.width-1;x++){const i=(y*r.width+x)*3;g[j++]=l(i+3)-l(i);g[j++]=l(i+r.width*3)-l(i);}return g;}
const floatMae=(a:Float32Array,b:Float32Array)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;};
const measurements:any[]=[],thumbs:Buffer[]=[],nativeRegions=new Map<number,Record<string,Buffer>>();
let anchor:Record<string,Buffer>|undefined,previous:Record<string,Buffer>|undefined,anchorGradient:Float32Array|undefined,anchorCentres:Record<string,ReturnType<typeof skinCentre>>|undefined,previousCentres:Record<string,ReturnType<typeof skinCentre>>|undefined;
for(let f=0;f<count;f++){
  const raw=await sharp(fp(f)).removeAlpha().raw().toBuffer(),regions=Object.fromEntries(Object.entries(rois).map(([name,r])=>[name,crop(raw,r)])),gradient=faceGradient(regions.face,rois.face);
  const centres=Object.fromEntries(['face','leftHand','rightHand'].map(k=>[k,skinCentre(regions[k],rois[k])]));anchor??=regions;anchorGradient??=gradient;anchorCentres??=centres;
  const regionMetrics=Object.fromEntries(Object.keys(rois).map(k=>[k,{rgbMaeToAnchor:mae(regions[k],anchor![k]),rgbMaeToPrevious:previous?mae(regions[k],previous[k]):null}]));
  const poseProxy=Object.fromEntries(Object.keys(centres).map(k=>[k,{...centres[k],distanceFromFirstPixels:distance(centres[k],anchorCentres![k]),speedPixelsPerSecond:previousCentres?((distance(centres[k],previousCentres[k])??NaN)*fps):null}]));
  measurements.push({frame:f,time:f/fps,regions:regionMetrics,faceGradientMaeToAnchor:floatMae(gradient,anchorGradient),poseProxy});
  nativeRegions.set(f,regions);thumbs.push(await sharp(raw,{raw:{width:W,height:H,channels:3}}).resize(240,160,{fit:'contain',background:'#111'}).jpeg({quality:78}).toBuffer());previous=regions;previousCentres=centres;
  if(f%60===0)console.log(`QA metrics ${f}/${count}`);
}
const windowStats=(f:number)=>{const values=measurements.slice(Math.max(1,f-3),Math.min(count,f+4));return {from:Math.max(0,f-3),to:Math.min(count-1,f+3),meanAdjacentFaceMae:values.reduce((n,v)=>n+v.regions.face.rgbMaeToPrevious,0)/values.length,meanAdjacentHandsMae:values.reduce((n,v)=>n+v.regions.hands.rgbMaeToPrevious,0)/values.length,maxLeftHandSpeed:Math.max(...values.map(v=>v.poseProxy.leftHand.speedPixelsPerSecond??0)),maxRightHandSpeed:Math.max(...values.map(v=>v.poseProxy.rightHand.speedPixelsPerSecond??0))};};
const candidates=plan.desiredReturns.filter((r:any)=>r.seconds<count/fps).map((r:any)=>{
  const from=Math.max(1,Math.round((r.seconds-.65)*fps)),to=Math.min(count-2,Math.round((r.seconds+.65)*fps));
  const ranked=measurements.slice(from,to+1).map(m=>{const w=windowStats(m.frame),pose=['face','leftHand','rightHand'].reduce((n,k)=>n+(m.poseProxy[k].distanceFromFirstPixels??1000),0);return {frame:m.frame,searchDistance:pose+.15*(m.regions.face.rgbMaeToAnchor+m.regions.hands.rgbMaeToAnchor)+w.meanAdjacentFaceMae+w.meanAdjacentHandsMae};}).sort((a,b)=>a.searchDistance-b.searchDistance);
  const best=ranked[0];return {after:r.after,requestedSeconds:r.seconds,searchRange:[from,to],frame:best.frame,time:best.frame/fps,alternatives:ranked.slice(0,3),measurement:measurements[best.frame],movementWindow:windowStats(best.frame),visualStatus:'unreviewed-not-a-confirmed-return',cutAccepted:false};
});
const svgLabel=(items:{text:string;x:number;y:number}[],width:number,height:number)=>Buffer.from(`<svg width="${width}" height="${height}">${items.map(i=>`<rect x="${i.x}" y="${i.y}" width="240" height="22" fill="#171717"/><text x="${i.x+5}" y="${i.y+16}" fill="white" font-family="Arial" font-size="12">${i.text}</text>`).join('')}</svg>`);
const contactSheets=[];for(let start=0;start<count;start+=60){const batch=thumbs.slice(start,start+60),width=1440,height=Math.ceil(batch.length/6)*182,overlays=batch.map((input,i)=>({input,left:i%6*240,top:Math.floor(i/6)*182+22})),labels=batch.map((_,i)=>({text:`${start+i} | ${((start+i)/fps).toFixed(2)}s`,x:i%6*240,y:Math.floor(i/6)*182}));overlays.push({input:svgLabel(labels,width,height),left:0,top:0});const p=`${out}/all-frames-${String(start).padStart(3,'0')}.jpg`;await sharp({create:{width,height,channels:3,background:'#171717'}}).composite(overlays).jpeg({quality:88}).toFile(p);contactSheets.push({path:p,from:start,to:start+batch.length-1,allFramesIncluded:true});}
async function regionSheet(name:string,rows:number[][],region:string){const r=rois[region],cols=Math.max(...rows.map(v=>v.length)),width=cols*r.width,height=rows.length*(r.height+24),overlays:any[]=[];for(let row=0;row<rows.length;row++)for(let col=0;col<rows[row].length;col++){const f=rows[row][col],image=await sharp(nativeRegions.get(f)![region],{raw:{width:r.width,height:r.height,channels:3}}).png().toBuffer();overlays.push({input:image,left:col*r.width,top:row*(r.height+24)+24});const text=Buffer.from(`<svg width="${r.width}" height="24"><text x="5" y="17" fill="white" font-family="Arial" font-size="13">${f} | ${(f/fps).toFixed(3)}s</text></svg>`);overlays.push({input:text,left:col*r.width,top:row*(r.height+24)});}const p=`${out}/${name}.png`;await sharp({create:{width,height,channels:3,background:'#171717'}}).composite(overlays).png().toFile(p);return p;}
const returnRows=candidates.map((c:any)=>[-6,-3,0,3,6].map(d=>Math.max(0,Math.min(count-1,c.frame+d))));
const returnFaceSheet=returnRows.length?await regionSheet('return-face-native',returnRows,'face'):null;
const returnHandSheet=returnRows.length?await regionSheet('return-hands-native',returnRows.map((r:number[])=>[r[1],r[2],r[3]]),'hands'):null;
const loopSheet=await regionSheet('first-last-face-native',[[count-3,count-2,count-1,0,1,2]],'face');
const boundaries=[0,...candidates.map((c:any)=>c.frame),count-1].filter((v,i,a)=>i===0||v>a[i-1]);
const segmentCandidates=boundaries.slice(0,-1).map((from,i)=>{const to=boundaries[i+1],a=nativeRegions.get(from)!,b=nativeRegions.get(to)!;return {from,to,durationSeconds:(to-from+1)/fps,faceRgbMaeAtEnds:mae(a.face,b.face),handsRgbMaeAtEnds:mae(a.hands,b.hands),startMovement:windowStats(from),endMovement:windowStats(to),status:'search-proposal-only',accepted:false};});
const result={schemaVersion:1,createdAt:new Date().toISOString(),status:'numerical-and-image-evidence-prepared-native-motion-review-required',source:{path:input,sha256:sourceSha256,width:W,height:H,fps,frameCount:count,duration:count/fps,codec:s.codec_name,pixelFormat:s.pix_fmt,originalUnchanged:hash(await readFile(input))===sourceSha256},conditioningAnchor:plan.input,plan:{path:planPath,sha256:hash(await readFile(planPath))},tool:{path:'tools/pamela-anchor-return-qa.ts',sha256:hash(await readFile('tools/pamela-anchor-return-qa.ts'))},nativeFramePattern:`${out}/frame-%03d.png`,frameConvention:'zero-based indices; filename001 means source index0',rois,measurementMeaning:plan.comparison.limitations,searchDistanceMeaning:'Weighted pose-colour-centroid distance, image difference and local frame difference used only to choose review frames. Not a quality score or cut acceptance.',contactSheets,returnFaceSheet,returnHandSheet,loopSheet,endpoint:measurements.at(-1),candidates,segmentCandidates,measurements,acceptedSegments:[],realTimePlaybackReviewed:false};
await writeFile(`${out}/anchor-return-analysis.json`,JSON.stringify(result,null,2)+'\n');
await writeFile(`${out}/visual-review.json`,JSON.stringify({sourceSha256,status:'awaiting-native-review',candidates:candidates.map((c:any)=>({frame:c.frame,after:c.after,pose:null,gaze:null,faceDetail:null,handsContact:null,velocityCompatible:null,cutAccepted:false,note:''})),firstLastLoop:null,actualDistinctBehaviours:null,acceptedSegments:[],realTimePlaybackReviewed:false},null,2)+'\n');
await writeFile(`${out}/inspection.json`,JSON.stringify({schemaVersion:1,checkedAt:new Date().toISOString(),film:result.source,input:{path:plan.input.anchorPath,sha256:plan.input.anchorSha256},status:'original-extracted-awaiting-native-visual-and-motion-review',usableVariants:null,usableVariantsMeaning:'Unknown until actual behaviours, return pose and motion at each proposed cut are visually assessed. Five requested return windows never count as five accepted variants.',nativeFramePattern:result.nativeFramePattern,frameNumbering:result.frameConvention,allFramesIncluded:true,contactSheets,returnFaceSheet,returnHandSheet,loopSheet,analysisPath:`${out}/anchor-return-analysis.json`,visualReviewPath:`${out}/visual-review.json`,summary:'Native source frames and comparable pose/appearance/contact evidence prepared. No segment, loop or endpoint return accepted automatically.',productionAccepted:false,activated:false,originalUnchanged:result.source.originalUnchanged},null,2)+'\n');
console.log(JSON.stringify({source:result.source,candidates:candidates.map((c:any)=>({after:c.after,frame:c.frame,time:c.time})),endpoint:result.endpoint.regions,analysis:`${out}/anchor-return-analysis.json`},null,2));
