import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {SYMMETRIC_P1_SOURCE as source,SYMMETRIC_P1_KEYFRAMES,trackSymmetricP1Card,projectNeutralMesh,type SymmetricP1CardFrame} from '../src/pamela-seat1-symmetric-card-track.ts';
import {PAMELA_SG_BACK_SVG} from '../src/pamela-card-surfaces.ts';

const run='runs/20261109-pamela-seat1-symmetric-card-track/take-01/contour-fit-03';
const sourceDirectory='runs/20261109-pamela-seat-bank/retakes/seat-1-symmetric-v2/qa/seat-1/frames';
const sourceVideo='runs/20261109-pamela-seat-bank/retakes/seat-1-symmetric-v2/original/pamela-seat-1-wan3-symmetric-v2.mp4';
const sourceSha256='8402ddfcaabf1356b25b28fc8e7e3ca59121260eee6b188b7bfed431b2af9307';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),tag=(f:number)=>String(f).padStart(4,'0');
sharp.concurrency(1);
await mkdir(run,{recursive:true});await mkdir(run+'/qa',{recursive:true});
if(hash(await readFile(sourceVideo))!==sourceSha256)throw Error('Source identity mismatch');
const guideCenters:[number,number,number][]=[[0,1295,805],[50,1295,805],[60,1285,803],[65,1270,795],[70,1220,805],[75,1180,821],[80,1110,840],[85,1010,840],[90,900,850],[95,780,860],[100,650,865],[105,530,860],[110,430,875],[115,350,890],[120,292,920],[125,245,945],[130,210,975],[135,200,1010],[140,185,1030],[145,180,1032],[150,176,1030],[160,176,1030],[180,176,1030],[190,176,1030],[194,176,1030],[270,176,1030],[359,176,1030]];
if(process.argv.includes('--guides')){
 for(let page=0;page<guideCenters.length;page+=16){const items:{input:Buffer;left:number;top:number}[]=[];for(const[i,[f,x,y]]of guideCenters.slice(page,page+16).entries()){
  const left=Math.max(0,Math.min(1462,Math.round(x-150))),top=Math.max(0,Math.min(914,Math.round(y-130))),source=`${sourceDirectory}/frame-${tag(f)}.png`;
  const lines:string[]=[];for(let xx=Math.ceil(left/50)*50;xx<left+300;xx+=50)lines.push(`<path d="M${xx-left} 0V260"/><text x="${xx-left+2}" y="12">${xx}</text>`);for(let yy=Math.ceil(top/50)*50;yy<top+260;yy+=50)lines.push(`<path d="M0 ${yy-top}H300"/><text x="2" y="${yy-top+12}">${yy}</text>`);
  const grid=Buffer.from(`<svg width="300" height="260"><g stroke="#00b8d0" stroke-width=".5" fill="#09222a" font-size="10">${lines.join('')}</g></svg>`);
  const crop=await sharp(source).extract({left,top,width:300,height:260}).composite([{input:grid}]).png().toBuffer();
  items.push({input:crop,left:(i%4)*300,top:Math.floor(i/4)*284+24},{input:Buffer.from(`<svg width="300" height="24"><rect width="300" height="24" fill="#18212a"/><text x="6" y="17" fill="white" font-size="14">SOURCE ${f}; crop ${left},${top}</text></svg>`),left:(i%4)*300,top:Math.floor(i/4)*284});
 }await sharp({create:{width:1200,height:Math.ceil(Math.min(16,guideCenters.length-page)/4)*284,channels:3,background:'#18212a'}}).composite(items).png().toFile(`${run}/qa/source-guides-${tag(page)}.png`);}
 await writeFile(run+'/source-guide-index.json',JSON.stringify({sourceVideo,sourceSha256,guideCenters,meaning:'Grid is a separate coordinate guide. Originals remain unchanged.'},null,2));
 console.log('Source guides written');
} else {
 const W=source.width,H=source.height,execute=promisify(execFile),all=process.argv.includes('--all'),film=process.argv.includes('--film');
 const critical=[0,50,60,65,70,75,80,85,90,95,100,105,110,115,120,125,130,135,140,145,150,155,160,170,180,185,188,190,191,192,193,194,195,196,210,270,359];
 const requested=process.argv.find(a=>a.startsWith('--frames='))?.slice(9).split(',').map(Number);
 if(requested&&(all||film||!requested.length||requested.some(f=>!Number.isInteger(f)||f<0||f>359)))throw Error('--frames is an explicit inspect-only list of zero-based0..359 indices');
 const indices=all||film?Array.from({length:360},(_,i)=>i):requested??critical;
 for(const folder of ['observed-masks','coverage','paint-support','hand-guards','shoe-paper','paper-rgba','proofs','thumbs','render','snapshot'])await mkdir(`${run}/${folder}`,{recursive:true});
 const codeFiles=['src/pamela-seat1-symmetric-card-track.ts','tools/pamela-seat1-symmetric-card-track.ts','src/pamela-paper-coverage.ts','src/pamela-neutral-card-track.ts','src/pamela-card-surfaces.ts'];
 const protectedFiles=['src/pamela-neutral-card-track.ts','tools/pamela-neutral-card-track.ts','src/pamela-seat7-card-track.ts','tools/pamela-seat7-card-track.ts','src/pamela-paper-coverage.ts'];
 const inputHashes=await Promise.all(codeFiles.map(async path=>({path,sha256:hash(await readFile(path))})));
 const protectedHashes=await Promise.all(protectedFiles.map(async path=>({path,sha256:hash(await readFile(path))})));
 const probe=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',source.path],{windowsHide:true})).stdout);
 assert.equal(probe.streams[0].width,W);assert.equal(probe.streams[0].height,H);assert.equal(probe.streams[0].avg_frame_rate,'30/1');assert.equal(+probe.streams[0].nb_read_frames,360);
 const originalMd5=(await execute('ffmpeg',['-v','error','-nostdin','-threads','4','-i',source.path,'-pix_fmt','rgb24','-threads','4','-f','framemd5','-'],{windowsHide:true,maxBuffer:200000})).stdout.split(/\r?\n/).filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').at(-1)!.trim());assert.equal(originalMd5.length,360);
 const frontSvg='<svg xmlns="http://www.w3.org/2000/svg" width="210" height="294"><g fill="#ad1838" font-family="Arial" font-weight="bold"><text x="13" y="48" font-size="43">3</text><text x="13" y="86" font-size="37">♥</text><text x="79" y="118" font-size="62">♥</text><text x="79" y="185" font-size="62">♥</text><text x="79" y="252" font-size="62">♥</text><g transform="translate(210 294) rotate(180)"><text x="13" y="48" font-size="43">3</text><text x="13" y="86" font-size="37">♥</text></g><text x="86" y="280" font-size="11">P1S</text></g></svg>';
 const frontTexture=await sharp(Buffer.from(frontSvg)).ensureAlpha().raw().toBuffer(),backTexture=await sharp(Buffer.from(PAMELA_SG_BACK_SVG)).ensureAlpha().raw().toBuffer();
 await writeFile(run+'/snapshot/front-3-heart.svg',frontSvg);await writeFile(run+'/snapshot/sg-back.svg',PAMELA_SG_BACK_SVG);
 const label=(s:string,width:number)=>Buffer.from(`<svg width="${width}" height="24"><rect width="100%" height="24" fill="#18212a"/><text x="5" y="17" fill="white" font-size="13">${s}</text></svg>`);
 async function mono(file:string,data:Buffer){assert.equal(data.length,W*H);await sharp(data,{raw:{width:W,height:H,channels:1}}).greyscale().toColourspace('b-w').png().toFile(file);const meta=await sharp(file).metadata(),decoded=await sharp(file).greyscale().raw().toBuffer();assert.equal(meta.channels,1);assert.equal(decoded.length,W*H);assert.ok(decoded.equals(data));return {path:file,sha256:hash(await readFile(file)),decodedChannels:1,decodedBytes:decoded.length};}
 const canonical=trackSymmetricP1Card(await sharp(`${sourceDirectory}/frame-0194.png`).removeAlpha().raw().toBuffer(),194).record;
 async function render(raw:Buffer,track:ReturnType<typeof trackSymmetricP1Card>,texture:Buffer,back:boolean){
  const uv=projectNeutralMesh(track.record.sections),r=track.record.bounds,ink=Buffer.alloc(r.width*r.height*4),out=Buffer.from(raw);
  let coverageNoUv=0;
  for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++){const p=y*W+x,j=((y-r.top)*r.width+x-r.left)*4,u=uv[p*2],v=uv[p*2+1];if(u<0||u>1||v<0||v>1){if(track.coverage[p])coverageNoUv++;if(back&&track.coverage[p]){ink[j]=10;ink[j+1]=11;ink[j+2]=13;ink[j+3]=255;}continue;}const tx=Math.min(209,Math.max(0,Math.round(u*209))),ty=Math.min(293,Math.max(0,Math.round(v*293))),k=(ty*210+tx)*4;for(let c=0;c<4;c++)ink[j+c]=texture[k+c];}
  const sigma=track.record.inkBlurSigmaPx,blurred=await sharp(ink,{raw:{width:r.width,height:r.height,channels:4}}).blur(sigma).raw().toBuffer();
  let changed=0,changedGuard=0,changedOutsideSupport=0,changedShoe=0;
  for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++){const p=y*W+x,j=p*3,k=((y-r.top)*r.width+x-r.left)*4;
   if(track.protectedSkin[p])continue;const a=(back?track.coverage[p]:track.paint[p])/255*blurred[k+3]/255;if(!a)continue;
   // A conservative material tint preserves source illumination; it does not
   // erase the prop or invent background/hidden hand pixels.
   for(let c=0;c<3;c++)out[j+c]=Math.round(raw[j+c]*(1-a)+raw[j+c]*(blurred[k+c]/255)*a);
  }
  for(let p=0;p<W*H;p++){const j=p*3;if(out[j]===raw[j]&&out[j+1]===raw[j+1]&&out[j+2]===raw[j+2])continue;changed++;if(track.protectedSkin[p])changedGuard++;if(!track.mask[p])changedOutsideSupport++;if(track.shoePaper[p])changedShoe++;}
  assert.equal(changedGuard,0);assert.equal(changedOutsideSupport,0);assert.equal(changedShoe,0);
  return {out,diagnostics:{changed,changedGuard,changedOutsideSupport,changedShoe,coverageNoUv,sigma}};
 }
 function encoder(name:string){const path=`${run}/render/${name}.mp4`,child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);const done=once(child,'close');return {path,async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async finish(){child.stdin.end();const[code]=await done;assert.equal(code,0,errors);},abort(){child.stdin.destroy();child.kill();}};}
 if(film){const review=JSON.parse(await readFile(run+'/review.json','utf8'));assert.equal(review.allowDiagnosticMovies,true,'Visual review has not allowed full diagnostic films');assert.equal(review.sourceSha256,sourceSha256);}
 const encoders=film?[encoder('p1-symmetric-front-3-heart-diagnostic'),encoder('p1-symmetric-sg-back-diagnostic')]:[];
 const records:any[]=[];
 try{for(const f of indices){
  const file=`${sourceDirectory}/frame-${tag(f)}.png`,bytes=await readFile(file),raw=await sharp(bytes).removeAlpha().raw().toBuffer();assert.equal(createHash('md5').update(raw).digest('hex'),originalMd5[f]);
  const track=trackSymmetricP1Card(raw,f),observedSections=structuredClone(track.record.sections);if(f>=194)track.record.sections=structuredClone(canonical.sections);
  const [front,back]=await Promise.all([render(raw,track,frontTexture,false),render(raw,track,backTexture,true)]);
  const maskStats={observedSupport:0,coverageArea:0,opaqueCoverage:0,protectedWithinQuad:track.record.skinProtectedPixels};for(let p=0;p<W*H;p++){if(track.mask[p])maskStats.observedSupport++;maskStats.coverageArea+=track.coverage[p]/255;if(track.coverage[p]===255)maskStats.opaqueCoverage++;}
  const record={...track.record,observedSections,renderGeometryLockedAt:f>=194?194:null,sourcePngSha256:hash(bytes),nativeSourceRgbEqual:true,maskStats,front:front.diagnostics,back:back.diagnostics,masks:{} as Record<string,unknown>,paperLayer:null as null|{path:string;sha256:string;decodedChannels:number;sourceRgbIdentity:boolean}};
  if(all){for(const[name,data]of [['observed-masks',track.mask],['coverage',track.coverage],['paint-support',track.paint],['hand-guards',track.protectedSkin],['shoe-paper',track.shoePaper]]as const)record.masks[name]=await mono(`${run}/${name}/frame-${tag(f)}.png`,data);
   const rgba=Buffer.alloc(W*H*4);for(let p=0;p<W*H;p++)if(track.coverage[p]){for(let c=0;c<3;c++)rgba[p*4+c]=raw[p*3+c];rgba[p*4+3]=track.coverage[p];}const path=`${run}/paper-rgba/frame-${tag(f)}.png`;await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toFile(path);assert.ok((await sharp(path).ensureAlpha().raw().toBuffer()).equals(rgba));record.paperLayer={path,sha256:hash(await readFile(path)),decodedChannels:4,sourceRgbIdentity:true};
  }
  if(film){await encoders[0].write(front.out);await encoders[1].write(back.out);}
  else{
   const b=track.record.bounds,pad=24,roi={left:Math.max(0,b.left-pad),top:Math.max(0,b.top-pad),width:Math.min(W-Math.max(0,b.left-pad),b.width+2*pad),height:Math.min(H-Math.max(0,b.top-pad),b.height+2*pad)};
   const panels:{input:Buffer;left:number;top:number}[]=[];for(const[i,[data,channels,title]]of [[raw,3,'ORIGINAL'],[front.out,3,'AUTHORED 3 HEART'],[back.out,3,'AUTHORED SG BACK'],[track.coverage,1,'COVERAGE'],[track.protectedSkin,1,'HAND GUARD']].entries()){const picture=await sharp(data as Buffer,{raw:{width:W,height:H,channels:channels as 1|3}}).extract(roi).png().toBuffer();panels.push({input:picture,left:i*roi.width,top:24},{input:label(`${f}: ${title}`,roi.width),left:i*roi.width,top:0});}
   const proof=await sharp({create:{width:roi.width*5,height:roi.height+24,channels:3,background:'#18212a'}}).composite(panels).png().toBuffer();
   if(critical.includes(f)||requested?.includes(f))await writeFile(`${run}/proofs/native-${tag(f)}.png`,proof);
   if(all){const small=await sharp(proof).resize(600,160,{fit:'contain',background:'#18212a'}).png().toBuffer();await writeFile(`${run}/thumbs/frame-${tag(f)}.png`,small);}
  }
  records.push(record);if(f%30===29||!all&&!film)console.log(JSON.stringify({f,support:maskStats.observedSupport,coverage:Math.round(maskStats.coverageArea),outsideUv:back.diagnostics.coverageNoUv}));
 }if(film)await Promise.all(encoders.map(e=>e.finish()));}catch(e){for(const encoder of encoders)encoder.abort();throw e;}
 for(const file of protectedHashes)assert.equal(hash(await readFile(file.path)),file.sha256,'Protected input changed');
 if(all){for(let start=0;start<360;start+=30){const items=Array.from({length:30},(_,i)=>({input:`${run}/thumbs/frame-${tag(start+i)}.png`,left:(i%3)*600,top:Math.floor(i/3)*160}));await sharp({create:{width:1800,height:1600,channels:3,background:'#18212a'}}).composite(items).png().toFile(`${run}/qa/all-${tag(start)}.png`);}}
 const evidence={source,probe,sourceIndexing:'zero-based',physicalSide:'UNKNOWN',diagnosticChoices:['authored-front-3-heart-P1S','authored-SG-back'],inputHashes,protectedHashes,keyframes:SYMMETRIC_P1_KEYFRAMES,frames:records,nativeSourceRgbEqualFrames:records.length,monoMaskRoundtrips:all?records.length*5:0,decodedMaskBytes:W*H,decodedMaskChannels:1,changedProtectedPixels:records.reduce((s,r)=>s+r.front.changedGuard+r.back.changedGuard,0),changedOutsideSupportPixels:records.reduce((s,r)=>s+r.front.changedOutsideSupport+r.back.changedOutsideSupport,0),changedShoePaperPixels:records.reduce((s,r)=>s+r.front.changedShoe+r.back.changedShoe,0),runtimeAcceptance:false,limits:['Observed contour and chroma-derived coverage are distinct. Coverage never expands support or weakens the inherited skin predicate.','Blank paper cannot establish physical side, hidden material points or rigid 3D UV. Authored UVs and display choices remain explicit.','Post194 render mesh is fixed; every observed source mesh and mask remains separately recorded.','Paper RGBA preserves observed source RGB and baked lighting, including uncertain edge contamination; it is not a clean dealer/background reconstruction.','Hand guard is a conservative warm-pixel guard within the local card ROI, not an anatomical hand segmentation.','Exact RGB checks apply before lossy video encoding.']};
 if(all||!film)await writeFile(`${run}/${all?'tracking':'critical-inspection'}.json`,JSON.stringify(evidence,null,2)+'\n');
 if(film){const movies=[];for(const e of encoders){const p=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',e.path],{windowsHide:true})).stdout);assert.equal(+p.streams[0].nb_read_frames,360);assert.equal(p.streams[0].avg_frame_rate,'30/1');movies.push({path:e.path,sha256:hash(await readFile(e.path)),probe:p});}await writeFile(run+'/movies.json',JSON.stringify({sourceSha256,inputHashes,movies,runtimeAcceptance:false},null,2)+'\n');}
 console.log(JSON.stringify({run,frames:records.length,maskRoundtrips:evidence.monoMaskRoundtrips,changedProtected:evidence.changedProtectedPixels}));
}
