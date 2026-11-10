/** Verify that exact concat durations repaired only timestamps, not pictures. */
import{readFile,writeFile}from'node:fs/promises';
import{execFile}from'node:child_process';import{promisify}from'node:util';
import{createHash}from'node:crypto';import assert from'node:assert/strict';
const execute=promisify(execFile),run='runs/20261109-pamela-material-bank/take-03',hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const paths=[run+'/render/vila-fourteen-materials-trim.mp4',run+'/render/vila-fourteen-materials-trim-exact.mp4'];
const results=await Promise.all(paths.map(async(path,index)=>{
 const packets=JSON.parse((await execute('ffprobe',['-v','error','-select_streams','v:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts,dts,duration,data_hash','-of','json',path],{windowsHide:true,maxBuffer:4000000})).stdout).packets;
 assert.equal(packets.length,4404);
 const {stdout}=await execute('ffmpeg',['-v','error','-nostdin','-threads','1','-i',path,'-map','0:v:0','-an','-fps_mode','passthrough','-pix_fmt','yuv420p','-threads','1','-f','framemd5','-'],{windowsHide:true,maxBuffer:2000000});
 await writeFile(run+'/clock-repair/'+(index?'after':'before')+'.framemd5',stdout,{flag:'wx'});
 const md5=stdout.split(/\r?\n/).filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').at(-1)!.trim());assert.equal(md5.length,4404);
 return{path,sha256:hash(await readFile(path)),packets,md5};
}));
assert.deepEqual(results[0].md5,results[1].md5,'Decoded frame order/content changed');
assert.deepEqual(results[0].packets.map((p:any)=>p.data_hash),results[1].packets.map((p:any)=>p.data_hash),'Encoded video packets changed');
const correctedPts=results[1].packets.map((p:any)=>+p.pts).sort((a:number,b:number)=>a-b);assert.ok(correctedPts.every((pts:number,i:number)=>pts===i*512));
assert.ok(results[1].packets.every((p:any,i:number)=>+p.dts===(i-2)*512&&+p.duration===512));
const beforePts=results[0].packets.map((p:any)=>+p.pts).sort((a:number,b:number)=>a-b),maxDriftTicks=Math.max(...beforePts.map((p:number,i:number)=>Math.abs(p-i*512)));
const verification={original:{path:results[0].path,sha256:results[0].sha256},corrected:{path:results[1].path,sha256:results[1].sha256},decodedFramesEqual:4404,encodedPacketHashesEqual:4404,correctedPtsExact:true,correctedDtsAndDurationExact:true,timeBase:'1/15360',ticksPerFrame:512,originalMaxDriftTicks:maxDriftTicks,originalMaxDriftSeconds:maxDriftTicks/15360,repair:'Explicit per-segment duration = frame count / 30; stream-copy, no resample or re-encode',segments:{path:run+'/clock-repair/segments.json',sha256:hash(await readFile(run+'/clock-repair/segments.json'))},concatList:{path:run+'/clock-repair/exact-durations.ffconcat',sha256:hash(await readFile(run+'/clock-repair/exact-durations.ffconcat'))},methodReference:'https://ffmpeg.org/ffmpeg-formats.html#concat',tool:{path:'tools/pamela-material-clock-verify.ts',sha256:hash(await readFile('tools/pamela-material-clock-verify.ts'))}};
await writeFile(run+'/clock-repair/verification.json',JSON.stringify(verification,null,2),{flag:'wx'});console.log(JSON.stringify(verification));
