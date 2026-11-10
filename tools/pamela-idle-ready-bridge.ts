/** One bounded Runway bridge, immutable intent before POST, no submission retry. */
import {readFile,writeFile,mkdir,copyFile,open,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const RUN='runs/20261109-pamela-idle-ready-bridge/run-01',PRIVATE='private/runway-idle-ready-bridge/run-01',TOOL='tools/pamela-idle-ready-bridge.ts';
const API='https://api.dev.runwayml.com',VERSION='2024-11-06',PRIOR='8701dcbb-239d-4e60-a887-bd431e90f3d1',PROPOSAL='runs/20261109-pamela-rest-ready-seam-survey/take-01/single-bridge-proposal.json';
const firstSha='bf12fb29eb3e4f137c2f497bcb5418c0c3e9822fa62f549f0d2e0c389cde4021',lastSha='90ee69a06c140e8e0ba86d5036b92ae7fc12b3d5a121ffaf634798e40b99f85c';
const PROMPT="One continuous locked-camera shot of exactly the same Pamela, wardrobe, green background, lighting, table and card shoe shown in the keyframes. Start at the supplied calm resting pose looking forward. Naturally turn her head and gaze down toward the card shoe while the arm and shoulder on the viewer's right move together into the final ready grip. The hand on the viewer's left remains resting at its existing table anchor. Preserve the existing blank card in the shoe mouth: reach its grip without pulling it out or dealing. Match the supplied final head, torso, hand and finger pose with gentle deceleration. No camera movement, cut, new card or changed props. No blink at either endpoint.";
type Ref={path:string;sha256:string};
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex'),now=()=>new Date().toISOString(),read=async(p:string)=>JSON.parse(await readFile(p,'utf8')),ref=async(p:string)=>({path:p,sha256:hash(await readFile(p))});
const json=(o:unknown)=>JSON.stringify(o,null,2),exists=async(p:string)=>{try{await access(p);return true;}catch{return false;}},save=async(p:string,o:unknown)=>writeFile(p,json(o));
async function durable(p:string,data:string|Uint8Array){const f=await open(p,'wx');try{await f.writeFile(data);await f.sync();}finally{await f.close();}}
async function checked(r:Ref){assert.ok(r.path.startsWith('runs/')&&!r.path.split('/').includes('..'));const b=await readFile(r.path);assert.equal(hash(b),r.sha256,'BOUND_FILE_CHANGED');return b;}
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([a-z-]+)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];}));
for(const k of Object.keys(args))assert.ok(['action','plan-sha','confirmed-credits','wallet'].includes(k),'UNKNOWN_ARGUMENT');
async function prepare(){
 const p=await read(PROPOSAL);assert.equal(p.first.sha256,firstSha);assert.equal(p.last.sha256,lastSha);assert.equal(p.durationSeconds,3);assert.equal(p.jobs,1);assert.equal(p.maximumCredits,60);
 const epoch=await read('runs/20261109-pamela-seat-bank/budget-epoch.json');assert.equal(epoch.authorizedCredits,7000);
 const input=[];for(const [position,a]of [['first',p.first],['last',p.last]] as const){await checked(a.source);const bytes=await checked(a),meta=await sharp(bytes).metadata();assert.equal(meta.width,1764);assert.equal(meta.height,1174);assert.ok(bytes.length<5_000_000);input.push({...a,position,path:`${RUN}/anchors/${position}.png`,bytes:bytes.length});}
 await mkdir('runs/20261109-pamela-idle-ready-bridge',{recursive:true});await mkdir(RUN);for(const d of ['anchors','original','snapshot'])await mkdir(RUN+'/'+d);
 await mkdir(PRIVATE,{recursive:true});
 for(const [i,original]of [p.first,p.last].entries())await copyFile(original.path,input[i].path);
 await copyFile(TOOL,RUN+'/snapshot/runner.ts');
 const plan={schemaVersion:1,role:'VILA_B_TO_CURRENT_BANK_REDO',preparedAt:now(),authorization:'Existing explicit full Pamela pipeline/Runway API budget; root-selected one bounded3s pilot. Separate from old idle job02.',provider:{endpoint:API+'/v1/image_to_video',apiVersion:VERSION,credentialName:'RUNWAY_API_KEY',priorTaskId:PRIOR},proposal:await ref(PROPOSAL),budgetEpoch:await ref('runs/20261109-pamela-seat-bank/budget-epoch.json'),model:'wan3',duration:3,ratio:'auto_1080p',audio:false,maximumCredits:60,creditsPerSecond:20,maximumPostAttempts:1,automaticRetries:0,seat:null,expectedWallet:1402,pricingSource:'https://docs.dev.runwayml.com/guides/pricing/',capabilitySource:'https://dev.runwayml.com/learn/wan-3-0-api',pricingVerifiedAt:now(),input,promptText:PROMPT,promptSha256:hash(PROMPT),code:await ref(TOOL),expected:{width:1764,height:1174,frames:90,fps:30,audio:false,seconds:3},integrationAccepted:false};
 await durable(RUN+'/plan.json',json(plan));await durable(RUN+'/state.json',json({state:'PREPARED_NOT_SUBMITTED',taskId:null}));console.log(json({plan:await ref(RUN+'/plan.json'),jobs:1,maximumCredits:60,postAttempts:0}));
}
async function plan(){
 assert.match(args['plan-sha']??'',/^[a-f0-9]{64}$/);assert.equal((await ref(RUN+'/plan.json')).sha256,args['plan-sha'],'PLAN_CHANGED');const p=await read(RUN+'/plan.json');
 assert.equal(p.role,'VILA_B_TO_CURRENT_BANK_REDO');assert.equal(p.provider.endpoint,API+'/v1/image_to_video');assert.equal(p.provider.priorTaskId,PRIOR);assert.equal(p.provider.credentialName,'RUNWAY_API_KEY');assert.equal(p.provider.apiVersion,VERSION);
 assert.equal(p.model,'wan3');assert.equal(p.duration,3);assert.equal(p.ratio,'auto_1080p');assert.equal(p.audio,false);assert.equal(p.maximumCredits,60);assert.equal(p.maximumPostAttempts,1);assert.equal(p.automaticRetries,0);assert.equal(p.promptText,PROMPT);assert.equal(p.promptSha256,hash(PROMPT));assert.equal(p.input.length,2);assert.equal(p.input[0].sha256,firstSha);assert.equal(p.input[1].sha256,lastSha);
 assert.equal((await ref(TOOL)).sha256,p.code.sha256,'SEALED_RUNNER_CHANGED');assert.equal((await ref(RUN+'/snapshot/runner.ts')).sha256,p.code.sha256);await checked(p.proposal);await checked(p.budgetEpoch);for(const a of p.input)await checked(a);
 return p;
}
async function headers(){const key=parseEnv(await readFile('.env.local','utf8')).RUNWAY_API_KEY;assert.ok(key,'LOCAL_API_KEY_MISSING');return{Authorization:`Bearer ${key}`,'X-Runway-Version':VERSION,'Content-Type':'application/json'};}
async function get(route:string,h:Record<string,string>){let r:Response;try{r=await fetch(API+route,{headers:h,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('RUNWAY_READ_FAILED_RETRY_READ_ONLY');}assert.ok(r.ok,'RUNWAY_READ_HTTP_'+r.status);return r.json();}
async function bind(h:Record<string,string>){const [org,t]=await Promise.all([get('/v1/organization',h),get('/v1/tasks/'+PRIOR,h)]);assert.equal(t.id,PRIOR);assert.equal(t.status,'SUCCEEDED');assert.equal(org.creditBalance,1402,'WALLET_CHANGED_REVIEW_BEFORE_SPENDING');return{checkedAt:now(),creditBalance:org.creditBalance,priorTaskId:PRIOR,priorStatus:t.status,organizationId:org.organizationId??org.id??null};}
async function submit(p:any){
 assert.equal(args['confirmed-credits'],'60');assert.equal(args.wallet,'1402');assert.equal((await read(RUN+'/state.json')).state,'PREPARED_NOT_SUBMITTED');assert.equal(await exists(RUN+'/submit-intent.json'),false,'POST_ALREADY_ATTEMPTED_NEVER_RESUBMIT');assert.equal(await exists(RUN+'/task.json'),false);
 const epoch=await read(p.budgetEpoch.path);for(let seat=1;seat<=7;seat++)assert.ok(epoch.jobs.filter((j:any)=>j.seat===seat).length<=10,'SEAT_LIMIT_EXCEEDED');
 const images=[];for(const a of p.input)images.push({position:a.position,uri:'data:image/png;base64,'+(await checked(a)).toString('base64')});
 const body=JSON.stringify({model:p.model,ratio:p.ratio,duration:p.duration,audio:false,promptText:p.promptText,promptImage:images}),wireRequestSha256=hash(body),h=await headers(),wallet=await bind(h);
 await durable(RUN+'/submit-intent.json',json({startedAt:now(),planSha256:args['plan-sha'],wireRequestSha256,maximumCredits:60,maximumPostAttempts:1,noRetryEvenIfUncertain:true,wallet}));
 await save(RUN+'/state.json',{state:'SUBMISSION_STARTED_OUTCOME_UNCERTAIN',taskId:null});
 try{
  let response:Response;try{response=await fetch(API+'/v1/image_to_video',{method:'POST',headers:h,body,redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw Error('SUBMISSION_OUTCOME_UNKNOWN_NO_RETRY');}
  const raw=Buffer.from(await response.arrayBuffer());let data:any;try{data=JSON.parse(raw.toString());}catch{await durable(PRIVATE+'/submission-raw.bin',raw);throw Error('SUBMISSION_RESPONSE_UNKNOWN_NO_RETRY');}
  if(response.ok&&typeof data.id==='string'&&/^[0-9a-f-]{36}$/.test(data.id)){
   await durable(RUN+'/task.json',json({taskId:data.id,receivedAt:now(),planSha256:args['plan-sha'],wireRequestSha256}));
   await save(RUN+'/state.json',{state:'SUBMITTED',taskId:data.id,reservedCredits:60});
  }
  await durable(PRIVATE+'/submission.json',raw);assert.ok(response.ok,'POST_HTTP_'+response.status+'_NO_RETRY');assert.ok(await exists(RUN+'/task.json'),'SUBMISSION_TASK_UNKNOWN_NO_RETRY');
  if(data.estimatedCost?.credits!=null)assert.ok(data.estimatedCost.credits<=60,'REPORTED_COST_EXCEEDS_CAP');
  console.log(json({state:'SUBMITTED',taskId:data.id,reservedCredits:60,maximumAttempts:1}));
 }catch(e){const task=await exists(RUN+'/task.json')?await read(RUN+'/task.json'):null;await save(RUN+'/state.json',{state:task?'SUBMITTED_REQUIRES_RECONCILIATION':'SUBMISSION_OUTCOME_UNKNOWN_NO_RETRY',taskId:task?.taskId??null,maximumCredits:60});throw e;}
}
async function status(p:any){
 const receipt=await read(RUN+'/task.json');assert.equal(receipt.planSha256,args['plan-sha']);assert.match(receipt.taskId,/^[0-9a-f-]{36}$/);
 const state=await read(RUN+'/state.json');if(state.output&&state.nativeVerification){await checked(state.output);await checked(state.nativeVerification);console.log(json(state));return;}
 const h=await headers(),t=await get('/v1/tasks/'+receipt.taskId,h);assert.equal(t.id,receipt.taskId);assert.ok(['PENDING','THROTTLED','RUNNING','SUCCEEDED','FAILED','CANCELLED'].includes(t.status));
 await durable(PRIVATE+'/status-'+now().replace(/\D/g,'')+'.json',json(t));
 const result:any={state:t.status,taskId:t.id,checkedAt:now(),maximumCredits:60,reportedCredits:t.estimatedCost?.credits??null};
 result.costAnomaly=result.reportedCredits!==null&&(!Number.isFinite(result.reportedCredits)||result.reportedCredits<0||result.reportedCredits>60);await save(RUN+'/state.json',result);
 if(t.status==='SUCCEEDED'){
  assert.ok(Array.isArray(t.output)&&t.output.length===1);const url=new URL(t.output[0]);assert.equal(url.protocol,'https:');
  const file=RUN+'/original/pamela-B-to-REDO-wan3-3s.mp4';
  if(!await exists(file)){let response:Response;try{response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(60000)});}catch{throw Error('OUTPUT_DOWNLOAD_READ_FAILED_RETRY_STATUS_ONLY');}assert.ok(response.ok,'OUTPUT_HTTP_'+response.status);const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>1024&&bytes.length<128_000_000);await durable(file,bytes);}
  const output=await ref(file),probe=JSON.parse(execFileSync('ffprobe',['-v','error','-threads','1','-count_frames','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true,timeout:60000}));
  const video=probe.streams.filter((s:any)=>s.codec_type==='video'),audio=probe.streams.filter((s:any)=>s.codec_type==='audio'),v=video[0],observed={width:v?.width,height:v?.height,frames:Number(v?.nb_read_frames),fps:v?.avg_frame_rate,audioStreams:audio.length,seconds:Number(probe.format.duration)};
  const passed=video.length===1&&observed.width===p.expected.width&&observed.height===p.expected.height&&observed.frames===90&&observed.fps==='30/1'&&audio.length===0&&Math.abs(observed.seconds-3)<1/60;
  const proof={taskId:t.id,output,expected:p.expected,observed,passed,originalPreserved:true,transforms:[],integrationAccepted:false,visualQaPending:true};
  if(await exists(RUN+'/native-verification.json'))assert.deepEqual(await read(RUN+'/native-verification.json'),proof,'NATIVE_PROOF_CHANGED');else await durable(RUN+'/native-verification.json',json(proof));
  result.output=output;result.nativeVerification=await ref(RUN+'/native-verification.json');result.state=result.costAnomaly?'ORIGINAL_PRESERVED_COST_RECONCILIATION_REQUIRED':passed?'NATIVE_VERIFIED_PENDING_VISUAL_QA':'ORIGINAL_PRESERVED_NATIVE_MISMATCH';
  // Original and its proof are committed before the optional wallet read. A
  // transient billing read must never discard a successful generation receipt.
  await save(RUN+'/state.json',result);
  try{const org=await get('/v1/organization',h);result.creditBalanceAfter=org.creditBalance;result.walletDifference=1402-org.creditBalance;}catch{result.walletCheckFailed=true;}
  await save(RUN+'/state.json',result);
 }
 console.log(json(result));
}
async function main(){assert.equal(path.basename(process.cwd()),'snyggare-dealer');assert.equal(process.version,'v24.21.0');if(args.action==='prepare')return prepare();const p=await plan();if(args.action==='check'){console.log(json({planSha256:args['plan-sha'],model:p.model,seconds:3,maximumCredits:60,networkCalls:0,state:(await read(RUN+'/state.json')).state}));return;}if(args.action==='submit')return submit(p);if(args.action==='status')return status(p);throw Error('UNKNOWN_ACTION');}
main().catch(e=>{console.error(e instanceof Error?e.message:'BRIDGE_FAILED');process.exitCode=1;});
