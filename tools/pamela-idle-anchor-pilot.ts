/** Exact plan-01 runner. No service/credential access for check or dry-run.
 * Required: --plan=PATH --plan-sha=SHA --action=dry-run|check|bind|submit-job=01|submit-job=02|poll
 * Online: --wallet-min=N --wallet-max=N. Submit also: --confirmed-credits-per-second=20.
 * Job02 also: --root-qa=PATH --root-qa-sha=SHA. Poll also: --job=01|02.
 * One immutable submit marker per job; never retries a POST, releases its reserve,
 * auto-continues job02, publishes, or changes another run/budget/contract.
 */
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, open, readFile, realpath, rename, rm, stat} from 'node:fs/promises';
import {execFile, spawn} from 'node:child_process';
import {parseEnv, promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

type Json = Record<string, any>;
type JobId = '01' | '02';
type Ref = {path:string; sha256:string};
type PlanJob = {id:string; role:string; seconds:number; fps:number; expectedFrames:number; maximumCredits:number; maximumSubmissionAttempts:number; automaticRetries:number; anchors:(Ref & {position:string; node:string})[]; prompt:Ref; requestTemplate:Ref};
type Plan = Json & {jobs:PlanJob[]};
type PreparedJob = {id:JobId; role:string; prompt:string; input:(Ref & {position:string; node:string; bytes:number})[]; requestMetadata:Ref};
type Manifest = {schemaVersion:1; owner:string; run:string; plan:Ref; runner:Ref; jobs:PreparedJob[]; maximumCredits:480; maximumPosts:2; automaticRetries:0; createdAt:string};
type Reservation = {job:JobId; id:string; credits:240; at:string; taskId:string|null; reportedCredits:number|null};
type Ledger = {schemaVersion:1; owner:string; planSha256:string; limitCredits:480; maxCreditsPerJob:240; blockedReason:string|null; reservations:Reservation[]};
type JobState = {schemaVersion:1; job:JobId; planSha256:string; requestMetadataSha256:string; state:string; taskId:string|null; httpStatus?:number; output?:Ref & {bytes:number}; nativeVerification?:Ref; nativePassed?:boolean; reportedCredits?:number; checkedAt?:string; integrationAccepted:false};
const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const PLAN='runs/20261109-pamela-idle-anchor-pilot/plan-01/plan.json';
const PLAN_SHA='8f17ca0bed015202ed22cf1d24424d8658159d6dc8961bbc5049e372a1d287ae';
const RUN='runs/20261109-pamela-idle-anchor-pilot/run-01';
const OWNER='pamela-idle-anchor-pilot-plan-01';
const API='https://api.dev.runwayml.com', API_VERSION='2024-11-06';
const PRIOR_TASK='8701dcbb-239d-4e60-a887-bd431e90f3d1';
const SHA=/^[a-f0-9]{64}$/, UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ids:JobId[]=['01','02'];
const execute=promisify(execFile), now=()=>new Date().toISOString();
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
class PilotError extends Error { readonly code:string; constructor(code:string){super(code);this.code=code;} }
function requireThat(value:unknown,code:string):asserts value {if(!value)throw new PilotError(code);}
function relative(value:string){const rel=path.relative(ROOT,path.resolve(ROOT,value));requireThat(rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel),'PATH_OUTSIDE_LOCAL_CHECKOUT');return rel.split(path.sep).join('/');}
function abs(value:string){return path.join(ROOT,relative(value));}
async function local(value:string){const candidate=abs(value), resolved=await realpath(candidate), base=await realpath(ROOT);requireThat(resolved.toLowerCase().startsWith(base.toLowerCase()+path.sep),'SYMLINK_OUTSIDE_LOCAL_CHECKOUT');return candidate;}
async function exists(file:string){try{await stat(abs(file));return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
async function bytes(file:string){return readFile(await local(file));}
async function read<T>(file:string):Promise<T>{return JSON.parse((await bytes(file)).toString('utf8')) as T;}
async function reference(file:string):Promise<Ref>{return {path:relative(file),sha256:digest(await bytes(file))};}
async function checked(ref:Ref){requireThat(typeof ref.path==='string'&&SHA.test(ref.sha256),'BAD_FILE_REFERENCE');const data=await bytes(ref.path);requireThat(digest(data)===ref.sha256,'BOUND_FILE_HASH_CHANGED');return data;}
async function durable(file:string,data:Buffer|string){requireThat(relative(file).startsWith(RUN+'/'),'WRITE_OUTSIDE_OWNED_RUN');const parent=path.dirname(file);await local(parent);requireThat((await realpath(abs(parent))).toLowerCase()===path.join(await realpath(ROOT),relative(parent)).toLowerCase(),'OWNED_WRITE_PARENT_IS_REDIRECTED');const handle=await open(abs(file),'wx');try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}}
async function fixed(file:string,data:Buffer|string){if(await exists(file)){requireThat(digest(await bytes(file))===digest(data),'EXISTING_ARTIFACT_DIFFERS');}else await durable(file,data);}
async function atomic(file:string,value:unknown){const temporary=file+'.'+randomUUID()+'.tmp';try{await durable(temporary,json(value));await rename(abs(temporary),abs(file));}finally{await rm(abs(temporary),{force:true});}}
async function locked<T>(action:()=>Promise<T>){
 await local(path.dirname(RUN));if(!(await exists(RUN)))await mkdir(abs(RUN));await local(RUN);requireThat((await realpath(abs(RUN))).toLowerCase()===path.join(await realpath(ROOT),RUN).toLowerCase(),'OWNED_RUN_IS_REDIRECTED');
 const lock=RUN+'/runner.lock', token=json({owner:OWNER,pid:process.pid,startedAt:now(),nonce:randomUUID()});
 await durable(lock,token); // A crash leaves a lock for manual ownership review; never auto-break it.
 try{return await action();}finally{if((await bytes(lock)).toString('utf8')===token)await rm(abs(lock));}
}
function cli(){
 const args:Record<string,string>={};
 for(const arg of process.argv.slice(2)){const match=/^--([a-z-]+)=(.+)$/.exec(arg);requireThat(match&&!Object.hasOwn(args,match[1]),'USE_EXPLICIT_UNIQUE_NAME_VALUE_ARGUMENTS');args[match[1]]=match[2];}
 const allowed=['plan','plan-sha','action','wallet-min','wallet-max','confirmed-credits-per-second','job','root-qa','root-qa-sha'];
 requireThat(Object.keys(args).every(k=>allowed.includes(k)),'UNKNOWN_ARGUMENT');
 requireThat(args.plan&&relative(args.plan)===PLAN&&args['plan-sha']===PLAN_SHA,'EXACT_PLAN_PATH_AND_SHA_REQUIRED');
 requireThat(['dry-run','check','bind','submit-job=01','submit-job=02','poll'].includes(args.action),'EXPLICIT_ACTION_REQUIRED');
 if(args.action==='poll')requireThat(ids.includes(args.job as JobId),'POLL_REQUIRES_JOB_01_OR_02');else requireThat(!args.job,'JOB_ARGUMENT_ONLY_FOR_POLL');
 if(args.action!=='submit-job=02')requireThat(!args['root-qa']&&!args['root-qa-sha'],'ROOT_QA_ARGUMENTS_ONLY_FOR_JOB02');
 if(!args.action.startsWith('submit-job='))requireThat(!args['confirmed-credits-per-second'],'PRICE_CONFIRMATION_ONLY_FOR_SUBMIT');
 if(['dry-run','check'].includes(args.action))requireThat(!args['wallet-min']&&!args['wallet-max'],'OFFLINE_ACTION_HAS_NO_WALLET_ARGUMENTS');
 return args;
}
async function validatePlan():Promise<Plan>{
 const planBytes=await bytes(PLAN);requireThat(digest(planBytes)===PLAN_SHA,'PLAN_HASH_CHANGED');const plan=JSON.parse(planBytes.toString('utf8')) as Plan;
 requireThat(plan.schemaVersion===2&&plan.project==='snyggare-dealer'&&plan.dealerId==='pamela'&&plan.status==='PREPARED_ONLY_AWAITING_ROOT_DECISION','WRONG_PLAN_IDENTITY');
 const p=plan.selectedProposal;requireThat(p.generations===2&&p.secondsPerGeneration===12&&p.model==='wan3'&&p.ratio==='auto_1080p'&&p.audio===false&&p.maximumCredits===480&&p.maximumCreditsPerJob===240&&p.quotedCreditsPerSecond===20&&p.maximumSubmissionAttempts===2&&p.automaticRetries===0,'PLAN_LIMITS_CHANGED');
 requireThat(plan.provider.endpoint===API+'/v1/image_to_video'&&plan.provider.apiVersion===API_VERSION&&plan.provider.credentialName==='RUNWAY_API_KEY'&&plan.provider.priorTaskId===PRIOR_TASK,'PROVIDER_BINDING_CHANGED');
 const prior=JSON.parse((await checked(plan.provider.priorTaskReceipt)).toString('utf8')) as Json;
 requireThat(prior.taskId===PRIOR_TASK&&prior.model==='wan3'&&prior.duration===12,'PRIOR_LOCAL_TASK_BINDING_CHANGED');
 requireThat(plan.jobs.length===2,'EXACTLY_TWO_JOBS_REQUIRED');
 for(let index=0;index<2;index++){
  const job=plan.jobs[index];requireThat(job.id===(index===0?'01-closing-transition':'02-canonical-idle')&&job.seconds===12&&job.fps===30&&job.expectedFrames===360&&job.maximumCredits===240&&job.maximumSubmissionAttempts===1&&job.automaticRetries===0,'JOB_SPEC_CHANGED');
  requireThat(job.anchors.length===2&&job.anchors[0].position==='first'&&job.anchors[1].position==='last','FIRST_LAST_REQUIRED');
  const prompt=(await checked(job.prompt)).toString('utf8').trim();const request=JSON.parse((await checked(job.requestTemplate)).toString('utf8')) as Json;
  requireThat(prompt.length>0&&prompt.length<=5000&&request.model==='wan3'&&request.ratio==='auto_1080p'&&request.duration===12&&request.audio===false&&request.promptText===prompt,'EXACT_REQUEST_CHANGED');
  requireThat(Array.isArray(request.promptImage)&&request.promptImage.length===2,'EXACT_REQUEST_IMAGES_CHANGED');
  for(let i=0;i<2;i++){
   const a=job.anchors[i],expectedNode=index===0&&i===0?'VILA_B':'VILA_A';requireThat(a.node===expectedNode&&request.promptImage[i].position===a.position&&request.promptImage[i].uri===`$${expectedNode}_NATIVE_PNG_DATA_URI`,'ANCHOR_NODE_CHANGED');
   const data=await checked(a), source=plan.anchors.find((v:Json)=>v.node===a.node);requireThat(source&&source.path===a.path&&source.sha256===a.sha256&&source.sourceDecodePixelExact===true,'ANCHOR_PROVENANCE_CHANGED');
   requireThat(data.length<=3_500_000,'ANCHOR_EXCEEDS_BOUNDED_INPUT');const m=await sharp(data).metadata();requireThat(m.format==='png'&&m.width===1762&&m.height===1174&&(m.pages??1)===1,'ANCHOR_NATIVE_FORMAT_CHANGED');
   requireThat(digest(await sharp(data).removeAlpha().raw().toBuffer())===source.sourceFrame.rgbSha256,'ANCHOR_DECODE_CHANGED');
  }
 }
 return plan;
}
function metadata(job:PreparedJob){return {model:'wan3',ratio:'auto_1080p',duration:12,audio:false,promptText:job.prompt,promptSha256:digest(job.prompt),promptImage:job.input.map(a=>({position:a.position,node:a.node,path:a.path,sha256:a.sha256,bytes:a.bytes})),expectedFrames:360,expectedFps:30,expectedWidth:1762,expectedHeight:1174,quotedCreditsPerSecond:20,maximumCredits:240,dataUrisPersisted:false};}
async function prepare(plan:Plan):Promise<Manifest>{
 for(const folder of ['inputs','jobs','original','provider-private','qa']){const p=RUN+'/'+folder;if(!(await exists(p)))await mkdir(abs(p));await local(p);}
 await fixed(RUN+'/plan.json',await bytes(PLAN));
 const jobs:PreparedJob[]=[];
 for(let i=0;i<2;i++){
  const id=ids[i],entry=plan.jobs[i],inputs:PreparedJob['input']=[];
  for(const a of entry.anchors){const data=await checked(a),target=RUN+'/inputs/'+a.node+'.png';await fixed(target,data);inputs.push({...await reference(target),position:a.position,node:a.node,bytes:data.length});}
  const promptBytes=await checked(entry.prompt),prompt=promptBytes.toString('utf8').trim();await fixed(RUN+'/jobs/'+id+'.prompt.txt',promptBytes);
  const job:PreparedJob={id,role:entry.role,prompt,input:inputs,requestMetadata:{path:RUN+'/jobs/'+id+'.request-metadata.json',sha256:''}};
  await fixed(job.requestMetadata.path,json(metadata(job)));job.requestMetadata=await reference(job.requestMetadata.path);jobs.push(job);
 }
 const manifestPath=RUN+'/manifest.json';let manifest:Manifest;
 if(await exists(manifestPath)){
  manifest=await read<Manifest>(manifestPath);requireThat(manifest.owner===OWNER&&manifest.run===RUN&&manifest.plan.sha256===PLAN_SHA&&manifest.plan.path===RUN+'/plan.json'&&manifest.maximumCredits===480&&manifest.maximumPosts===2&&manifest.automaticRetries===0,'RUN_IDENTITY_CHANGED');
  requireThat(json(manifest.jobs)===json(jobs)&&manifest.runner.path==='tools/pamela-idle-anchor-pilot.ts','FROZEN_RUN_INPUTS_CHANGED');await checked(manifest.runner);
 }else{
  manifest={schemaVersion:1,owner:OWNER,run:RUN,plan:await reference(RUN+'/plan.json'),runner:await reference('tools/pamela-idle-anchor-pilot.ts'),jobs,maximumCredits:480,maximumPosts:2,automaticRetries:0,createdAt:now()};
  await fixed(manifestPath,json(manifest));
 }
 if(!(await exists(RUN+'/budget.json')))await fixed(RUN+'/budget.json',json({schemaVersion:1,owner:OWNER,planSha256:PLAN_SHA,limitCredits:480,maxCreditsPerJob:240,blockedReason:null,reservations:[]} satisfies Ledger));
 for(const job of jobs)if(!(await exists(statePath(job.id))))await fixed(statePath(job.id),json({schemaVersion:1,job:job.id,planSha256:PLAN_SHA,requestMetadataSha256:job.requestMetadata.sha256,state:'PREPARED_NOT_SUBMITTED',taskId:null,integrationAccepted:false} satisfies JobState));
 await fixed(RUN+'/root-job01-qa.example.json',json({schemaVersion:1,reviewedBy:'root',approved:false,decision:'pending-review',reviewedAt:null,planSha256:PLAN_SHA,job01:{taskId:null,outputSha256:null,nativeVerificationSha256:null,requestMetadataSha256:jobs[0].requestMetadata.sha256},nativeEndpointReviewPassed:false,identityReviewPassed:false,evidence:[{path:'REPLACE_WITH_ACTUAL_LOCAL_QA_EVIDENCE',sha256:'REPLACE_WITH_SHA256'}],runtimeAccepted:false}));
 await loadLedger();for(const job of jobs)await loadState(job);
 return manifest;
}
const statePath=(id:JobId)=>RUN+'/jobs/'+id+'.state.json';
const intentPath=(id:JobId)=>RUN+'/jobs/'+id+'.submit-once.json';
const taskPath=(id:JobId)=>RUN+'/jobs/'+id+'.task-id.json';
async function loadState(job:PreparedJob){const s=await read<JobState>(statePath(job.id));requireThat(s.schemaVersion===1&&s.job===job.id&&s.planSha256===PLAN_SHA&&s.requestMetadataSha256===job.requestMetadata.sha256&&s.integrationAccepted===false&&(!s.taskId||UUID.test(s.taskId)),'JOB_RECEIPT_CHANGED');return s;}
async function loadLedger(){const b=await read<Ledger>(RUN+'/budget.json');requireThat(b.schemaVersion===1&&b.owner===OWNER&&b.planSha256===PLAN_SHA&&b.limitCredits===480&&b.maxCreditsPerJob===240&&(b.blockedReason===null||typeof b.blockedReason==='string')&&Array.isArray(b.reservations)&&b.reservations.length<=2,'BUDGET_IDENTITY_CHANGED');const seen=new Set<string>();for(const r of b.reservations){requireThat(ids.includes(r.job)&&!seen.has(r.job)&&r.id===OWNER+'-'+r.job&&Number.isFinite(Date.parse(r.at))&&r.credits===240&&(!r.taskId||UUID.test(r.taskId))&&(r.reportedCredits===null||Number.isFinite(r.reportedCredits)&&r.reportedCredits>=0),'INVALID_BUDGET_RESERVATION');seen.add(r.job);}return b;}
function wallet(args:Record<string,string>){const min=Number(args['wallet-min']),max=Number(args['wallet-max']);requireThat(args['wallet-min']!==undefined&&args['wallet-max']!==undefined&&Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min&&max<=1_000_000_000,'EXPLICIT_REASONABLE_WALLET_RANGE_REQUIRED');return {min,max};}
async function headers(){const key=parseEnv(await readFile(await local('.env.local'),'utf8')).RUNWAY_API_KEY;requireThat(typeof key==='string'&&key.length>0,'LOCAL_LAB_RUNWAY_API_KEY_REQUIRED');return {Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Runway-Version':API_VERSION};}
type Headers = Awaited<ReturnType<typeof headers>>;
async function fetchSafe(url:string|URL,options:RequestInit){try{return await fetch(url,options);}catch{throw new PilotError('NETWORK_OUTCOME_UNKNOWN_NO_POST_RETRY');}}
async function responseBytes(response:Response,maximum=128_000){requireThat(response.body,'EMPTY_RESPONSE_BODY');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;requireThat(size<=maximum,'RESPONSE_EXCEEDS_LIMIT');chunks.push(n.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}return Buffer.concat(chunks);}
function object(data:Buffer):Json {let value:unknown;try{value=JSON.parse(data.toString('utf8'));}catch{throw new PilotError('INVALID_JSON_RESPONSE');}requireThat(value&&typeof value==='object'&&!Array.isArray(value),'INVALID_OBJECT_RESPONSE');return value as Json;}
async function get(route:string,h:Headers){const response=await fetchSafe(API+route,{headers:h,redirect:'error',signal:AbortSignal.timeout(30_000)});requireThat(response.ok,'PROVIDER_GET_HTTP_'+response.status);return object(await responseBytes(response));}
async function bind(args:Record<string,string>,h:Headers,required:number){
 const range=wallet(args),org=await get('/v1/organization',h),prior=await get('/v1/tasks/'+PRIOR_TASK,h);
 requireThat(prior.id===PRIOR_TASK&&prior.status==='SUCCEEDED','EXACT_PRIOR_PAMELA_TASK_NOT_ACCESSIBLE');
 const balance=org.creditBalance;requireThat(typeof balance==='number'&&Number.isFinite(balance)&&balance>=0&&balance<=1_000_000_000&&balance>=range.min&&balance<=range.max&&balance>=required,'LIVE_WALLET_OUTSIDE_EXPECTED_RANGE_OR_INSUFFICIENT');
 const orgId=org.organizationId??org.id??null;requireThat(orgId===null||typeof orgId==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(orgId),'UNEXPECTED_ORGANIZATION_ID');
 if(await exists(RUN+'/provider-binding.json')){const old=await read<Json>(RUN+'/provider-binding.json');requireThat(old.priorTask.id===PRIOR_TASK&&old.organizationId===orgId,'ACCOUNT_BINDING_CHANGED');}
 const result={checkedAt:now(),endpoint:API,apiVersion:API_VERSION,credentialSource:'local lab .env.local / RUNWAY_API_KEY',credentialValuesPersisted:false,organizationId:orgId,projectId:null,creditBalance:balance,expectedWallet:range,requiredCredits:required,priorTask:{id:PRIOR_TASK,status:'SUCCEEDED'},identityLimit:'Exact prior Pamela task verifies credential continuity; project ID remains unknown.',connectorUsed:false};
 await atomic(RUN+'/provider-binding.json',result);return result;
}
// Raw API bytes may contain signed URLs. Preserve them unchanged inside CurrentUser DPAPI;
// the readable receipt contains only SHA/size/status. No raw URL/token reaches a manifest/log.
async function protect(data:Buffer):Promise<Buffer>{
 requireThat(process.platform==='win32','WINDOWS_DPAPI_REQUIRED_FOR_PRIVATE_RAW_METADATA');
 const command="$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); $r=[Security.Cryptography.ProtectedData]::Unprotect($p,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); if([Convert]::ToBase64String($r) -cne [Convert]::ToBase64String($b)){exit 2}; [Console]::Out.Write([Convert]::ToBase64String($p))";
 return new Promise((resolve,reject)=>{const child=spawn(path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['pipe','pipe','pipe']});const output:Buffer[]=[];let count=0,settled=false;const timer=setTimeout(()=>{child.kill();fail();},15_000);function fail(){if(!settled){settled=true;clearTimeout(timer);reject(new PilotError('PRIVATE_METADATA_ENCRYPTION_FAILED'));}}child.on('error',fail);child.stdin.on('error',fail);child.stdout.on('data',(b:Buffer)=>{count+=b.length;if(count>400_000){child.kill();fail();}else output.push(b);});child.stderr.resume();child.on('close',code=>{if(settled)return;if(code!==0){fail();return;}settled=true;clearTimeout(timer);const text=Buffer.concat(output).toString('ascii').trim();if(!/^[A-Za-z0-9+/]+={0,2}$/.test(text)){reject(new PilotError('PRIVATE_METADATA_ENCRYPTION_FAILED'));return;}resolve(Buffer.from(text,'base64'));});child.stdin.end(data.toString('base64'));});
}
async function privateRaw(id:JobId,kind:string,data:Buffer,httpStatus:number){const stem=RUN+'/provider-private/'+id+'-'+kind+'-'+Date.now()+'-'+randomUUID(),encrypted=await protect(data);await durable(stem+'.dpapi.bin',encrypted);const receipt={path:stem+'.dpapi.bin',encryptedSha256:digest(encrypted),rawSha256:digest(data),rawBytes:data.length,httpStatus,encoding:'Windows DPAPI CurrentUser; decrypted bytes equal original HTTP body',rawUrlsLogged:false};await durable(stem+'.json',json(receipt));return receipt;}
async function validateRootQa(args:Record<string,string>,manifest:Manifest){
 requireThat(args['root-qa']&&args['root-qa-sha']&&SHA.test(args['root-qa-sha']),'HASH_BOUND_ROOT_QA_REQUIRED_FOR_JOB02');
 const qaPath=relative(args['root-qa']);requireThat(qaPath.startsWith(RUN+'/')&&!qaPath.endsWith('.example.json'),'ROOT_QA_MUST_BE_LOCAL_TO_THIS_RUN');
 const qaBytes=await checked({path:qaPath,sha256:args['root-qa-sha']}),qa=object(qaBytes),first=await loadState(manifest.jobs[0]);
 requireThat(first.state==='NATIVE_VERIFIED_PENDING_ROOT_QA'&&first.nativePassed===true&&first.taskId&&first.output&&first.nativeVerification,'JOB01_NATIVE_RESULT_REQUIRED');
 await checked(first.output);await checked(first.nativeVerification);
 requireThat(qa.schemaVersion===1&&qa.reviewedBy==='root'&&qa.approved===true&&qa.decision==='allow-job-02'&&qa.planSha256===PLAN_SHA&&Number.isFinite(Date.parse(qa.reviewedAt)),'ROOT_QA_DECISION_INVALID');
 requireThat(qa.job01?.taskId===first.taskId&&qa.job01.outputSha256===first.output.sha256&&qa.job01.nativeVerificationSha256===first.nativeVerification.sha256&&qa.job01.requestMetadataSha256===manifest.jobs[0].requestMetadata.sha256,'ROOT_QA_RESULT_BINDING_CHANGED');
 requireThat(qa.nativeEndpointReviewPassed===true&&qa.identityReviewPassed===true&&Array.isArray(qa.evidence)&&qa.evidence.length>0,'ROOT_NATIVE_ENDPOINT_EVIDENCE_REQUIRED');
 for(const evidence of qa.evidence)await checked(evidence as Ref);
 const target=RUN+'/jobs/02.root-job01-qa.json';await fixed(target,qaBytes);return reference(target);
}
async function submit(id:JobId,args:Record<string,string>,manifest:Manifest){
 requireThat(args['confirmed-credits-per-second']==='20','ROOT_PRICE_CONFIRMATION_20_CREDITS_PER_SECOND_REQUIRED');wallet(args);
 const job=manifest.jobs[ids.indexOf(id)],state=await loadState(job),ledger=await loadLedger();
 requireThat(state.state==='PREPARED_NOT_SUBMITTED'&&!state.taskId&&!ledger.reservations.some(r=>r.job===id)&&!(await exists(intentPath(id)))&&!(await exists(taskPath(id))),'POST_ALREADY_ATTEMPTED_OR_UNCERTAIN_NEVER_RESUBMIT');
 requireThat(ledger.blockedReason===null&&ledger.reservations.every(r=>r.reportedCredits===null||r.reportedCredits<=240)&&ledger.reservations.length*240+240<=480,'BUDGET_LIMIT_OR_PREVIOUS_COST_EXCEEDED');
 const rootQa=id==='02'?await validateRootQa(args,manifest):null;
 if(id==='01')requireThat(ledger.reservations.length===0,'JOB01_MUST_BE_FIRST');
 else requireThat(ledger.reservations.length===1&&ledger.reservations[0].job==='01'&&ledger.reservations[0].taskId,'JOB01_RESERVATION_REQUIRED');
 const images=[];for(const a of job.input)images.push({position:a.position,uri:'data:image/png;base64,'+(await checked(a)).toString('base64')});
 const body=JSON.stringify({model:'wan3',ratio:'auto_1080p',duration:12,audio:false,promptText:job.prompt,promptImage:images});
 const requestSha256=digest(body),h=await headers(),binding=await bind(args,h,id==='01'?480:240);
 // Preflight the private metadata mechanism before spending; stores only an encrypted harmless marker.
 await privateRaw(id,'encryption-preflight',Buffer.from('local preservation preflight; no API response'),0);
 const reservation:Reservation={job:id,id:OWNER+'-'+id,credits:240,at:now(),taskId:null,reportedCredits:null};
 const intent={schemaVersion:1,job:id,planSha256:PLAN_SHA,requestMetadataSha256:job.requestMetadata.sha256,wireRequestSha256:requestSha256,reservationId:reservation.id,credits:240,rootConfirmedCreditsPerSecond:20,rootQa,binding,startedAt:reservation.at,maximumPostAttempts:1,noRetryEvenIfUncertain:true};
 await durable(intentPath(id),json(intent)); // Immutable duplicate barrier, BEFORE reservation and sole POST.
 ledger.reservations.push(reservation);await atomic(RUN+'/budget.json',ledger);
 state.state='SUBMISSION_STARTED_OUTCOME_UNCERTAIN';await atomic(statePath(id),state);
 try{
  const response=await fetchSafe(API+'/v1/image_to_video',{method:'POST',headers:h,body,redirect:'error',signal:AbortSignal.timeout(60_000)});state.httpStatus=response.status;
  const raw=await responseBytes(response);let result:Json|null=null;
  if(response.ok){try{result=object(raw);requireThat(typeof result.id==='string'&&UUID.test(result.id),'SUBMISSION_TASK_ID_MISSING_OUTCOME_UNKNOWN');}catch{await privateRaw(id,'unidentified-submission',raw,response.status);throw new PilotError('SUBMISSION_TASK_ID_MISSING_OUTCOME_UNKNOWN');}
   // Save returned task ID durably before encryption, polling or any further API request.
   await durable(taskPath(id),json({taskId:result.id,receivedAt:now(),planSha256:PLAN_SHA,requestMetadataSha256:job.requestMetadata.sha256,wireRequestSha256:requestSha256}));state.taskId=result.id;reservation.taskId=result.id;state.state='SUBMITTED';
  }else state.state='HTTP_ERROR_NO_RETRY';
  if(result?.estimatedCost!=null){const value=result.estimatedCost.credits;if(typeof value!=='number'||!Number.isFinite(value)||value<0)ledger.blockedReason='PROVIDER_COST_INVALID_RECONCILE';else{reservation.reportedCredits=value;state.reportedCredits=value;if(value>240)ledger.blockedReason='PROVIDER_COST_EXCEEDS_CAP';}}
  await atomic(statePath(id),state);await atomic(RUN+'/budget.json',ledger);await privateRaw(id,'submission',raw,response.status);
  requireThat(response.ok,'POST_HTTP_'+response.status+'_NO_RETRY');
  requireThat(ledger.blockedReason===null,'PROVIDER_COST_INVALID_OR_EXCEEDS_CAP_STOP_CONTINUATION');
  console.log(json({job:id,state:state.state,taskId:state.taskId,reservedCredits:ledger.reservations.length*240,maximumCredits:480,automaticRetries:0}));
 }catch(error){if(!state.taskId&&state.state!=='HTTP_ERROR_NO_RETRY')state.state='SUBMISSION_OUTCOME_UNKNOWN_NO_RETRY';await atomic(statePath(id),state).catch(()=>{});await atomic(RUN+'/budget.json',ledger).catch(()=>{});throw error;}
}
async function verifyNative(id:JobId,state:JobState){
 requireThat(state.output,'OUTPUT_RECEIPT_REQUIRED');await checked(state.output);
 const target=RUN+'/jobs/'+id+'.ffprobe.raw.json';let raw:Buffer;
 if(await exists(target))raw=await bytes(target);else{
  try{const result=await execute('ffprobe',['-v','error','-threads','1','-count_frames','-show_streams','-show_format','-of','json',await local(state.output.path)],{windowsHide:true,timeout:60_000,maxBuffer:128_000});raw=Buffer.from(result.stdout);await durable(target,raw);}catch{state.state='ORIGINAL_PRESERVED_NATIVE_PROBE_FAILED';state.nativePassed=false;await atomic(statePath(id),state);throw new PilotError('NATIVE_FFPROBE_FAILED_ORIGINAL_PRESERVED');}
 }
 const probe=object(raw),video=Array.isArray(probe.streams)?probe.streams.filter((s:Json)=>s.codec_type==='video'):[],audio=Array.isArray(probe.streams)?probe.streams.filter((s:Json)=>s.codec_type==='audio'):[];
 const v=video[0]??{},duration=Number(probe.format?.duration);
 const passed=video.length===1&&audio.length===0&&v.width===1762&&v.height===1174&&v.avg_frame_rate==='30/1'&&v.r_frame_rate==='30/1'&&Number(v.nb_read_frames)===360&&Math.abs(duration-12)<1/60;
 const proof={schemaVersion:1,taskId:state.taskId,output:state.output,ffprobe:await reference(target),expected:{width:1762,height:1174,fps:30,frames:360,seconds:12,audio:false},observed:{width:v.width,height:v.height,averageFrameRate:v.avg_frame_rate,nominalFrameRate:v.r_frame_rate,frames:Number(v.nb_read_frames),seconds:duration,audioStreams:audio.length},passed,originalUnchanged:true,transforms:[],integrationAccepted:false,visualQaPending:true};
 const proofPath=RUN+'/jobs/'+id+'.native-verification.json';await fixed(proofPath,json(proof));state.nativeVerification=await reference(proofPath);state.nativePassed=passed;state.state=passed?'NATIVE_VERIFIED_PENDING_ROOT_QA':'ORIGINAL_PRESERVED_NATIVE_MISMATCH_BLOCKS_INTEGRATION';await atomic(statePath(id),state);requireThat(passed,'NATIVE_MISMATCH_ORIGINAL_PRESERVED_NO_INTEGRATION');
}
async function download(id:JobId,task:Json,state:JobState){
 const receiptPath=RUN+'/jobs/'+id+'.output-receipt.json',file=RUN+'/original/pamela-'+id+'-wan3.mp4';
 if(await exists(receiptPath)){
  const saved=await read<Json>(receiptPath);requireThat(saved.taskId===state.taskId&&saved.output?.path===file&&SHA.test(saved.output.sha256),'OUTPUT_IDENTITY_CHANGED');state.output=saved.output;
  if(await exists(file)){await checked(saved.output);await atomic(statePath(id),state);await verifyNative(id,state);return;}
 }
 requireThat(Array.isArray(task.output)&&task.output.length===1&&typeof task.output[0]==='string','SINGLE_OUTPUT_REQUIRED');let url:URL;try{url=new URL(task.output[0]);}catch{throw new PilotError('INVALID_OUTPUT_URL');}
 requireThat(url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&/(^|\.)(cloudfront\.net|runwayml\.com)$/.test(url.hostname),'OUTPUT_HOST_NOT_ALLOWED');
 const response=await fetchSafe(url,{redirect:'error',signal:AbortSignal.timeout(120_000)});requireThat(response.ok,'OUTPUT_DOWNLOAD_HTTP_'+response.status);const data=await responseBytes(response,150_000_000);
 const output={path:file,sha256:digest(data),bytes:data.length};await fixed(receiptPath,json({taskId:state.taskId,output,downloadedBytesPreserved:true}));await fixed(file,data);state.output=output;await atomic(statePath(id),state);await verifyNative(id,state);
}
async function poll(id:JobId,args:Record<string,string>,manifest:Manifest){
 wallet(args);const job=manifest.jobs[ids.indexOf(id)],state=await loadState(job),ledger=await loadLedger();
 requireThat(await exists(taskPath(id)),'NO_DURABLE_TASK_ID_DO_NOT_RESUBMIT');const receipt=await read<Json>(taskPath(id)),intent=await read<Json>(intentPath(id));
 requireThat(UUID.test(receipt.taskId)&&receipt.planSha256===PLAN_SHA&&intent.planSha256===PLAN_SHA&&intent.job===id&&intent.credits===240&&receipt.requestMetadataSha256===job.requestMetadata.sha256&&receipt.wireRequestSha256===intent.wireRequestSha256&&(!state.taskId||state.taskId===receipt.taskId),'TASK_ID_RECEIPT_CHANGED');
 const reservation=ledger.reservations.find(r=>r.job===id);requireThat(reservation&&(!reservation.taskId||reservation.taskId===receipt.taskId),'RESERVATION_MISSING_OR_CHANGED');state.taskId=receipt.taskId;reservation.taskId=receipt.taskId;
 const h=await headers();await bind(args,h,0);const response=await fetchSafe(API+'/v1/tasks/'+receipt.taskId,{headers:h,redirect:'error',signal:AbortSignal.timeout(30_000)});
 const raw=await responseBytes(response);await privateRaw(id,'task',raw,response.status);requireThat(response.ok,'POLL_HTTP_'+response.status);const task=object(raw);
 requireThat(task.id===receipt.taskId&&['PENDING','THROTTLED','RUNNING','SUCCEEDED','FAILED','CANCELLED'].includes(task.status),'TASK_ID_OR_STATUS_CHANGED');
 if(task.estimatedCost!=null){const cost=task.estimatedCost.credits;if(typeof cost!=='number'||!Number.isFinite(cost)||cost<0)ledger.blockedReason='PROVIDER_COST_INVALID_RECONCILE';else{reservation.reportedCredits=Math.max(reservation.reportedCredits??0,cost);state.reportedCredits=reservation.reportedCredits;if(reservation.reportedCredits>240)ledger.blockedReason='PROVIDER_COST_EXCEEDS_CAP';}}
 state.state=task.status;state.checkedAt=now();await atomic(statePath(id),state);await atomic(RUN+'/budget.json',ledger);
 if(task.status==='SUCCEEDED')await download(id,task,state);
 console.log(json({job:id,taskId:state.taskId,state:state.state,output:state.output??null,nativePassed:state.nativePassed??null,nativeVerification:state.nativeVerification??null,reportedCredits:reservation.reportedCredits,integrationAccepted:false,automaticRetries:0}));
 requireThat(ledger.blockedReason===null,'PROVIDER_COST_INVALID_OR_EXCEEDS_CAP_STOP_CONTINUATION');
}
async function main(){
 const args=cli();sharp.concurrency(1);const plan=await validatePlan();
 await locked(async()=>{
  const manifest=await prepare(plan);
  if(['check','dry-run'].includes(args.action)){console.log(json({action:args.action,plan:{path:PLAN,sha256:PLAN_SHA},run:RUN,jobs:manifest.jobs.map(j=>({id:j.id,role:j.role,requestMetadata:j.requestMetadata})),reservedCredits:(await loadLedger()).reservations.length*240,maximumCredits:480,thisInvocation:{networkCalls:0,credentialReads:0,uploads:0,postAttempts:0}}));return;}
  if(args.action==='bind'){wallet(args);const ledger=await loadLedger(),required=480-ledger.reservations.length*240;console.log(json(await bind(args,await headers(),required)));return;}
  if(args.action==='poll'){await poll(args.job as JobId,args,manifest);return;}
  await submit(args.action.slice(-2) as JobId,args,manifest);
 });
}
try{await main();}catch(error){console.error(json({error:error instanceof PilotError?error.code:'LOCAL_IO_OR_PARSE_FAILURE_INSPECT_DURABLE_RECEIPTS',run:RUN,noAutomaticRetry:true}));process.exitCode=1;}
