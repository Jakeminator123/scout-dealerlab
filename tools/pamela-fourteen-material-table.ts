/** Fourteen independent diagnostic materials in the final VILA. No claim about in-hand tracks. */
import{readFile,writeFile,mkdir}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawn,execFileSync}from'node:child_process';
import{once}from'node:events';
import assert from'node:assert/strict';
import sharp from'sharp';
import{keyPamelaFrame}from'../src/pamela-key.ts';
const W=1762,H=1174,hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),root='runs/20261109-pamela-fourteen-full-loop/take-01',surfacePath='runs/20261109-pamela-c2-card-surfaces/take-01/surfaces.json';
const surfaceSha=process.argv.find(a=>a.startsWith('--surfaces-sha256='))?.slice('--surfaces-sha256='.length);if(!surfaceSha||!/^[a-f0-9]{64}$/.test(surfaceSha))throw Error('Explicit frozen --surfaces-sha256 required');
const surfaceBytes=await readFile(surfacePath);assert.equal(hash(surfaceBytes),surfaceSha);const surfaces=JSON.parse(surfaceBytes.toString()),fullBytes=await readFile(root+'/evidence.json'),full=JSON.parse(fullBytes.toString());
assert.equal(full.verification.frames,5486);assert.equal(surfaces.results.length,7);assert.equal(hash(await readFile('src/pamela-key.ts')),full.snapshots.find((s:any)=>s.path==='src/pamela-key.ts').sha256);
const stageBytes=await readFile(root+'/qa/stage-fourteen-cards.png'),blank=await sharp(stageBytes).removeAlpha().raw().toBuffer(),printed=Buffer.from(blank),inkSupport=new Uint8Array(W*H),materials=[];
for(const seat of surfaces.results){
 const pair=full.landed.find((p:any)=>p.seat===seat.seat);assert.equal(pair.sourceSha256,seat.source.sha256);assert.equal(hash(await readFile(seat.sourceFrame.path)),seat.sourceFrame.sha256);assert.equal(seat.frame,350);
 const pairBytes=await readFile(pair.path);assert.equal(hash(pairBytes),pair.sha256);const pairRgba=await sharp(pairBytes).ensureAlpha().raw().toBuffer();assert.equal(seat.layers.length,2);
 for(const layer of seat.layers){const bytes=await readFile(layer.ink.path);assert.equal(hash(bytes),layer.ink.sha256);const{data:rgba,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,W);assert.equal(info.height,H);let pixels=0,softPairPixels=0;
  // The preliminary green key can soften opaque green-tinted paper. Containment
  // uses its nonzero support, not an illumination-dependent opacity threshold.
  for(let p=0;p<W*H;p++){const a=rgba[p*4+3]/255;if(!a)continue;assert.ok(pairRgba[p*4+3]>0,'Ink leaves the exact frozen pair support');if(pairRgba[p*4+3]<=250)softPairPixels++;assert.equal(inkSupport[p],0,'Independent materials overlap');inkSupport[p]=1;pixels++;for(let c=0;c<3;c++)printed[p*3+c]=Math.round(printed[p*3+c]*(1-a)+rgba[p*4+c]*a);}
  materials.push({seat:seat.seat,card:layer.card,diagnosticValue:layer.diagnosticValue,ink:layer.ink,pixels,softPairPixels});
 }
}
assert.equal(new Set(materials.map(m=>m.diagnosticValue)).size,14);assert.equal(materials.length,14);
const run='runs/20261109-pamela-fourteen-material-table/take-01';await mkdir('runs/20261109-pamela-fourteen-material-table',{recursive:true});await mkdir(run);for(const dir of['render','qa','snapshot'])await mkdir(run+'/'+dir);
await writeFile(run+'/snapshot/surfaces.json',surfaceBytes);await writeFile(run+'/snapshot/full-loop-evidence.json',fullBytes);await writeFile(run+'/snapshot/pamela-fourteen-material-table.ts',await readFile('tools/pamela-fourteen-material-table.ts'));
for(const[name,data]of[['blank',blank],['printed',printed]]as const)await sharp(data,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/table-${name}.png`);
const output=run+'/render/fourteen-unique-materials-vila.mp4',child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','14','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart',output],{windowsHide:true,stdio:['pipe','ignore','pipe']});let error='';child.stderr.on('data',b=>error+=b);const done=once(child,'close'),records=[];
try{for(let f=22;f<157;f++){
 const source=`${root}/source/breath/frame-${String(f).padStart(4,'0')}.png`,b=await readFile(source),sourceRecord=full.records.find((r:any)=>r.segment==='closing-vila'&&r.sourceFrame===f);assert.equal(hash(b),sourceRecord.sourcePngSha256);
 const raw=await sharp(b).removeAlpha().raw().toBuffer(),key=keyPamelaFrame(raw,W,H),before=Buffer.allocUnsafe(raw.length),after=Buffer.allocUnsafe(raw.length);let outsideChanges=0,occludedInk=0;
 for(let p=0;p<W*H;p++){const a=key.alpha[p];if(inkSupport[p]&&a>0)occludedInk++;for(let c=0;c<3;c++){before[p*3+c]=Math.round(blank[p*3+c]*(1-a)+key.rgb[p*3+c]*a);after[p*3+c]=Math.round(printed[p*3+c]*(1-a)+key.rgb[p*3+c]*a);if(!inkSupport[p]&&before[p*3+c]!==after[p*3+c])outsideChanges++;}}
 assert.equal(hash(before),sourceRecord.outputRgbSha256,'Blank baseline differs from frozen full loop');assert.equal(outsideChanges,0);assert.equal(occludedInk,0,'Actor overlaps material; need moving hand mask');
 if(!child.stdin.write(after))await once(child.stdin,'drain');records.push({sourceFrame:f,outputFrame:f-22,sourcePngSha256:hash(b),baselineRgbSha256:hash(before),outputRgbSha256:hash(after),outsideChanges,occludedInk});
 if(f===22||f===156){for(const[name,data]of[['before',before],['after',after]]as const)await sharp(data,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/${name}-${f}.png`);}
 }child.stdin.end();const[code]=await done;if(code!==0)throw Error(error);
}catch(e){child.stdin.destroy();if(child.exitCode===null)child.kill();throw e;}
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',output],{encoding:'utf8',windowsHide:true}));assert.equal(probe.streams[0].nb_read_frames,'135');assert.equal(probe.streams[0].avg_frame_rate,'30/1');assert.equal(hash(await readFile(surfacePath)),surfaceSha,'Surface manifest changed during render');
await writeFile(run+'/evidence.json',JSON.stringify({createdAt:new Date().toISOString(),status:'independent-material-study-not-full-dealing-render',sourceSurfaces:{path:surfacePath,sha256:surfaceSha},sourceFullLoop:{path:root+'/evidence.json',sha256:hash(fullBytes)},output:{path:output,sha256:hash(await readFile(output)),probe},materials,records,verification:{independentMaterials:14,uniqueDiagnosticValues:14,frames:135,outsideInkChanged:0,actorOverInk:0,baselineRgbMatchedFrames:135},limitations:['Final VILA material demonstration only; in-hand and contact tracks are separate unfinished work','Authored diagnostic values, not game results or final card designs','Native source paper, lighting and contact shadow retained; no physical calibration claim'],productionAccepted:false,newPaidJobs:0},null,2));console.log(JSON.stringify({run,frames:135,materials:14}));
