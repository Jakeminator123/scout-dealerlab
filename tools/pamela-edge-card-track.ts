import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {EDGE_SOURCES,stableEdgeQuads,trackEdgeCard,edgeSurfaceUv,type EdgeSeat} from '../src/pamela-edge-card-track.ts';
import {seat7Quad} from '../src/pamela-seat7-card-track.ts';
import {type Quad} from '../src/pamela-seat1-symmetric-card-track.ts';
import {PAMELA_SG_BACK_SVG} from '../src/pamela-card-surfaces.ts';
import {diagnosticSvg} from '../src/pamela-c2-card-surfaces.ts';
const seat=Number(process.argv.find(a=>a.startsWith('--seat='))?.slice(7)) as EdgeSeat;
if(seat!==1&&seat!==7)throw Error('Explicit --seat=1 or --seat=7 required');
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7)??'take-01';if(!/^take-\d\d(?:-[a-z0-9-]+)?$/.test(take))throw Error('Invalid take');
const selected=process.argv.find(a=>a.startsWith('--frames='))?.slice(9).split(',').map(Number),film=process.argv.includes('--film');
if(selected&&(film||selected.some(f=>!Number.isInteger(f)||f<0||f>359)))throw Error('Invalid explicit frame probe');
const frames=selected??Array.from({length:360},(_,i)=>i),W=1762,H=1174,source=EDGE_SOURCES[seat],hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),tag=(f:number)=>String(f).padStart(4,'0');
const run=`runs/20261109-pamela-edge-card-track/${take}/p${seat}`;
assert.equal(hash(await readFile(source.path)),source.sha256);sharp.concurrency(1);
const oldP1='runs/20261109-pamela-seat1-symmetric-card-track/take-01/contour-fit-03/tracking.json',oldBytes=await readFile(oldP1),old=JSON.parse(oldBytes.toString());assert.equal(old.source.sha256,EDGE_SOURCES[1].sha256);assert.equal(old.frames.length,360);
const rawQuads:Quad[]=seat===1?old.frames.map((f:any)=>f.quad):Array.from({length:360},(_,f)=>seat7Quad(f));
const quads=stableEdgeQuads(seat,rawQuads),execute=promisify(execFile);
const md5=(await execute('ffmpeg',['-v','error','-i',source.path,'-f','framemd5','-pix_fmt','rgb24','-threads','1','-'],{windowsHide:true,maxBuffer:1024*1024})).stdout.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1)!.trim());assert.equal(md5.length,360);
await mkdir(`runs/20261109-pamela-edge-card-track/${take}`,{recursive:true});await mkdir(run);for(const dir of['qa','proofs','thumbs','render','coverage','hand-guards','reclassified','snapshot'])await mkdir(run+'/'+dir);
const snapshots=[];for(const file of['src/pamela-edge-card-track.ts','tools/pamela-edge-card-track.ts','src/pamela-seat1-symmetric-card-track.ts','src/pamela-seat7-card-track.ts','src/pamela-paper-coverage.ts','src/pamela-card-surfaces.ts','src/pamela-c2-card-surfaces.ts']){const b=await readFile(file);await writeFile(run+'/snapshot/'+file.replaceAll('/','__'),b);snapshots.push({path:file,sha256:hash(b)});}
const front=await sharp(Buffer.from(diagnosticSvg(seat===1?'AC':'7S',`P${seat}-C1`))).resize(210,294).ensureAlpha().raw().toBuffer(),back=await sharp(Buffer.from(PAMELA_SG_BACK_SVG)).ensureAlpha().raw().toBuffer();
const label=(s:string,w:number)=>Buffer.from(`<svg width="${w}" height="24"><rect width="100%" height="100%" fill="#17212a"/><text x="5" y="17" fill="white" font-family="Arial" font-size="13">${s}</text></svg>`);
function encoder(name:string,width=W,height=H){const path=`${run}/render/${name}.mp4`,child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',path],{windowsHide:true,stdio:['pipe','ignore','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);const done=once(child,'close');return{path,async write(b:Buffer){if(!child.stdin.write(b))await once(child.stdin,'drain');},async finish(){child.stdin.end();const[code]=await done;assert.equal(code,0,stderr);},abort(){child.stdin.destroy();if(child.exitCode===null)child.kill();}};}
const encoders=film?[encoder('front'),encoder('back'),encoder('before-after',960,320)]:[],records:any[]=[];
async function render(raw:Buffer,t:ReturnType<typeof trackEdgeCard>,texture:Buffer,previous=false){
 const out=Buffer.from(raw),roi=t.record.bounds,mapped=Buffer.alloc(roi.width*roi.height*4),quad=previous?t.before.record.quad:t.quad;
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
  const [u,v]=edgeSurfaceUv(x+.5,y+.5,quad,previous?t.before.record.sections:t.sections);if(!Number.isFinite(u)||!Number.isFinite(v))continue;
  const tx=Math.round(Math.max(0,Math.min(1,u))*209),ty=Math.round(Math.max(0,Math.min(1,v))*293),j=(ty*210+tx)*4,k=((y-roi.top)*roi.width+x-roi.left)*4;
  for(let c=0;c<4;c++)mapped[k+c]=texture[j+c];
 }
 // Fixed modest blur gives the artwork the observed low-resolution plate's
 // softness without introducing frame-to-frame focus changes.
 const ink=await sharp(mapped,{raw:{width:roi.width,height:roi.height,channels:4}}).blur(.65).raw().toBuffer();
 let changed=0,hand=0,shoe=0,outside=0;
 for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++){
  const p=y*W+x,j=p*3,k=((y-roi.top)*roi.width+x-roi.left)*4,coverage=previous?(t.before as any).coverage??t.before.paint:t.coverage,guard=previous?t.before.protectedSkin:t.guard;
  if(guard[p])continue;const a=coverage[p]/255*ink[k+3]/255;if(!a)continue;
  for(let c=0;c<3;c++)out[j+c]=Math.round(raw[j+c]*(1-a)+raw[j+c]*ink[k+c]/255*a);
  if(out[j]!==raw[j]||out[j+1]!==raw[j+1]||out[j+2]!==raw[j+2]){changed++;if(guard[p])hand++;if(t.before.shoePaper[p])shoe++;if(!(previous?t.before.mask:t.support)[p])outside++;}
 }
 assert.equal(hand,0);assert.equal(shoe,0);assert.equal(outside,0);return {out,checks:{changed,hand,shoe,outside}};
}
try{for(const f of frames){
 const file=`${source.frameDirectory}/frame-${tag(f)}.png`,b=await readFile(file),raw=await sharp(b).removeAlpha().raw().toBuffer();assert.equal(createHash('md5').update(raw).digest('hex'),md5[f]);
 const t=trackEdgeCard(seat,raw,f,quads[f]);const afterFront=await render(raw,t,front),afterBack=await render(raw,t,back),beforeBack=await render(raw,t,back,true);
 const bounds=t.record.bounds,pad=12,left=Math.max(0,bounds.left-pad),top=Math.max(0,bounds.top-pad),crop={left,top,width:Math.min(W-left,bounds.width+2*pad),height:Math.min(H-top,bounds.height+2*pad)};
 const panels:Buffer[]=[];for(const data of[raw,beforeBack.out,afterBack.out])panels.push(await sharp(data,{raw:{width:W,height:H,channels:3}}).extract(crop).resize(320,296,{fit:'contain',background:'#17212a'}).raw().toBuffer());
 const proof=await sharp({create:{width:960,height:320,channels:3,background:'#17212a'}}).composite(panels.map((data,i)=>({input:data,raw:{width:320,height:296,channels:3 as const},left:i*320,top:24})).concat([])).png().toBuffer();
 const annotated=await sharp(proof).composite([{input:label(`P${seat} / ${f}   SOURCE | BEFORE COVERAGE / UV | AFTER (${t.record.warmPaperReclassifiedPixels} warm pixels)`,960),left:0,top:0}]).png().toBuffer();
 const native=await sharp({create:{width:crop.width*3,height:crop.height+24,channels:3,background:'#17212a'}}).composite(await Promise.all([raw,beforeBack.out,afterBack.out].map(async(data,i)=>({input:await sharp(data,{raw:{width:W,height:H,channels:3}}).extract(crop).png().toBuffer(),left:i*crop.width,top:24})))).png().toBuffer();
 if(selected||f%5===0||f>=90&&f<=100||f>=174&&f<=194)await writeFile(`${run}/proofs/native-${tag(f)}.png`,native);
 await writeFile(`${run}/thumbs/frame-${tag(f)}.png`,await sharp(annotated).resize(480,160).png().toBuffer());
 const masks=[];for(const[name,buffer]of[['coverage',t.coverage],['hand-guards',t.guard],['reclassified',t.reclassified]] as const){const path=`${run}/${name}/frame-${tag(f)}.png`;await sharp(buffer,{raw:{width:W,height:H,channels:1}}).png().toFile(path);assert.ok((await sharp(path).greyscale().raw().toBuffer()).equals(buffer));masks.push({type:name,path,sha256:hash(await readFile(path))});}
 if(film){await encoders[0].write(afterFront.out);await encoders[1].write(afterBack.out);await encoders[2].write(await sharp(annotated).removeAlpha().raw().toBuffer());}
 records.push({...t.record,sourcePngSha256:hash(b),sourceRgbEqual:true,beforeQuad:t.before.record.quad,front:afterFront.checks,back:afterBack.checks,masks});if(f%30===29||selected)console.log(JSON.stringify({seat,f,reclassified:t.record.warmPaperReclassifiedPixels}));
 }if(film)await Promise.all(encoders.map(e=>e.finish()));}catch(e){for(const e of encoders)e.abort();throw e;}
 for(let start=0;start<frames.length;start+=24){const page=frames.slice(start,start+24);await sharp({create:{width:1440,height:Math.ceil(page.length/3)*160,channels:3,background:'#17212a'}}).composite(page.map((f,i)=>({input:`${run}/thumbs/frame-${tag(f)}.png`,left:i%3*480,top:Math.floor(i/3)*160}))).png().toFile(`${run}/qa/all-${tag(start)}.png`);}
 const outputs=[];for(const e of encoders){const p=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',e.path],{windowsHide:true})).stdout);assert.equal(p.streams[0].nb_read_frames,'360');assert.equal(p.streams[0].avg_frame_rate,'30/1');outputs.push({path:e.path,sha256:hash(await readFile(e.path)),probe:p});}
for(const s of snapshots)assert.equal(hash(await readFile(s.path)),s.sha256,'Frozen implementation changed during run');
await writeFile(run+'/evidence.json',JSON.stringify({source,seat,createdAt:new Date().toISOString(),records,outputs,snapshots,geometryInput:seat===1?{path:oldP1,sha256:hash(oldBytes)}:'authored P7 source-bound quads',verification:{frames:frames.length,sourceRgbEqual:frames.length,monoRoundtrips:frames.length*3,changedProtectedPixels:0,changedShoePixels:0,changedOutsideSupportPixels:0,reclassifiedWarmPaperPixels:records.reduce((s,r)=>s+r.warmPaperReclassifiedPixels,0)},limits:['Physical side remains UNKNOWN; two full diagnostic alternatives, not an inferred flip','Temporal filtering is authored geometry, not 3D material-point recovery','Changed hand classification requires native-frame visual review','Artwork values are diagnostic, not game results'],visualAccepted:false,productionAccepted:false,newApiJobs:0},null,2));console.log(JSON.stringify({run,frames:frames.length,outputs:outputs.length}));
