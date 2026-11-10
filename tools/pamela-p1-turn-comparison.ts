/** Preserve the dense native P1 proof as a continuous three-panel comparison. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),proofRef={path:'runs/20261110-pamela-p1-side-calibration/take-01/evidence.json',sha256:'ed81117d47658916925ea9832e17e72d9720c6a08532ef0a928fb5b95207d6c9'};
const checked=async(r:{path:string;sha256:string})=>{const b=await readFile(r.path);assert.equal(hash(b),r.sha256);return b;};
const proof=JSON.parse((await checked(proofRef)).toString()),run='runs/20261110-pamela-p1-turn-comparison/take-01';
await mkdir('runs/20261110-pamela-p1-turn-comparison',{recursive:true});await mkdir(run);await mkdir(run+'/frames');await copyFile('tools/pamela-p1-turn-comparison.ts',run+'/runner.ts');sharp.concurrency(1);
const frames=[];for(let frame=59;frame<=145;frame++){
 const rec=proof.records.find((r:{frame:number})=>r.frame===frame);assert.ok(rec);const b=await checked(rec.panel),m=await sharp(b).metadata();assert.equal(m.width,1280);assert.equal(m.height,252);
 const panels=[];for(const[col,sourceCol]of[0,2,3].entries())panels.push({input:await sharp(b).extract({left:sourceCol*320,top:28,width:320,height:224}).png().toBuffer(),left:col*320,top:28});
 panels.push({input:Buffer.from(`<svg width="960" height="28"><rect width="960" height="28" fill="#17232b"/><text x="8" y="19" fill="white" font-family="Arial" font-size="13">Plats1 ruta${frame} ${rec.side} | Original | SG fram/bak | Blå/elfenben</text></svg>`),left:0,top:0});
 const path=`${run}/frames/frame-${String(frame).padStart(4,'0')}.png`;await sharp({create:{width:960,height:252,channels:3,background:'#17232b'}}).composite(panels).png().toFile(path);frames.push({frame,path,sha256:hash(await readFile(path)),sourcePanel:rec.panel});
}
const path=run+'/p1-two-pass-before-after.mp4';execFileSync('ffmpeg',['-v','error','-nostdin','-n','-framerate','30','-start_number','59','-i',run+'/frames/frame-%04d.png','-frames:v','87','-an','-c:v','libx264','-crf','14','-preset','fast','-threads','1','-pix_fmt','yuv420p','-movflags','+faststart',path],{windowsHide:true});
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',path],{windowsHide:true,encoding:'utf8'}));assert.equal(probe.streams[0].nb_read_frames,'87');assert.equal(probe.streams[0].avg_frame_rate,'30/1');
const output={path,sha256:hash(await readFile(path)),probe};await writeFile(run+'/evidence.json',JSON.stringify({status:'dense-native-two-pass-comparison',sourceProof:proofRef,source:proof.source,interval:{start:59,endExclusive:146,frames:87},sidePolicy:proof.sidePolicy,frames,output,runner:{path:'tools/pamela-p1-turn-comparison.ts',sha256:hash(await readFile('tools/pamela-p1-turn-comparison.ts'))},limits:proof.limitations,productionAccepted:false,newPaidJobs:0},null,2),{flag:'wx'});console.log(JSON.stringify({run,output}));
