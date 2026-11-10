import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateConfig} from '../src/media.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const variant=process.argv[3]||'baseline';if(!['baseline','rigid','rigid-short','v5-body'].includes(variant))throw Error('Unknown pilot variant.');
const v5=variant==='v5-body';
const suffix=variant==='baseline'||v5?'':`-${variant}`;
const run=v5?'runs/20261108-pamela-v5-body':'runs/20261108-pamela-deal-pilot',folder=path.join(root,run),jobPath=path.join(folder,`aleph2${suffix}.json`);
const privateStem=v5?'pamela-v5-deal':'pamela-deal';
const key=(await privateConfig(root)).RUNWAY_API_KEY;if(!key)throw Error('Missing local API key.');
const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Runway-Version':'2024-11-06'};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const save=(file:string,value:unknown)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
const action=process.argv[2];
await mkdir(path.join(folder,'original'),{recursive:true});
if(action==='submit'){
 const control='media/blob/9c3589bb6b65d52c/5dcb18927d0b92fc481848920f6ea7680cd9eddfd0a398681b6a3f10c028b1ac.mp4';
 const reference=`${run}/input/pamela-${v5?'v5':'v4'}-control-plane.png`;
 const video=await readFile(path.join(root,control)),image=await readFile(path.join(root,reference));
 if(hash(video)!=='5dcb18927d0b92fc481848920f6ea7680cd9eddfd0a398681b6a3f10c028b1ac')throw Error('Control hash mismatch.');
 if(video.length>3500000||image.length>3500000)throw Error('Data URI input limit guard.');
 const plan=JSON.parse(await readFile(path.join(root,'references/production-plan.json'),'utf8'));
 const reserve=84;
 if(plan.budget.knownReservedRunwayCredits+reserve>plan.budget.runwayCredits||plan.budget.videoJobs+1>plan.budget.maxVideoJobs||reserve>plan.budget.maxCreditsPerJob)throw Error('Pilot budget exceeded.');
 const prompt='Replace the blonde dealer with Pamela, the brunette woman in the guidance image: same face, short dark brown hair, black blazer and ivory V-neck blouse, no name badge. Preserve the source video camera, body scale, exact dealing action, arm paths and timing. She starts with both hands resting, reaches toward the card shoe, deals exactly one card to the central player position, then returns both hands to their initial resting pose. Keep the original card shoe and tabletop in their original locations. Maintain accurate hand contact with the shoe and card throughout. Keep the saturated green chroma background and green tabletop. No camera movement, no zoom, no cuts, no extra fingers or extra cards. The image supplies Pamela appearance; the video supplies motion and table geometry.';
 const finalPrompt=v5?'The guidance still defines the exact woman Pamela: preserve her face, age, short brunette hair, black blazer, ivory blouse and body proportions throughout. No beautification, younger face or identity blending. The video supplies only camera, hand paths and timing. Transfer the same single central dealing action and return to the exact starting hand pose. Keep her complete jacket and waist continuous below hand level as in the still, behind her forearms and hands, never a straight torso cutoff. Remove the source table, green rail, card shoe and visible card; preserve the fingers and exact reaching, grasping, sliding and release motion over an invisible table. Uniform saturated green everywhere outside her body. No camera movement, zoom, cuts, floating body parts, extra fingers or extra objects. Keep both hands and elbows inside the frame. The invisible shoe remains at its source camera-right location; preserve that reach.':prompt+(variant==='rigid'?' The playing card is a stiff, rigid, perfectly planar rectangular casino card. Preserve its rectangular shape and source-video trajectory in every frame. It never bends, curls, folds or stretches while held or moved.':variant==='rigid-short'?' The playing card stays stiff, flat and rectangular throughout, preserving its source trajectory. No bending, curling, folding or stretching.':'');
 if(finalPrompt.length>1000)throw Error('Prompt exceeds verified 1000-character API limit; no submission made.');
 const job:any={schemaVersion:1,model:'aleph2',variant,changeFromBaseline:variant==='rigid'?'Only add explicit rigid-card instruction; same source, guidance, camera, action and output format.':null,endpoint:'video_to_video',state:'submission-started',startedAt:new Date().toISOString(),taskId:null,
  expectedMaxCredits:reserve,budgetBefore:plan.budget,outputFormat:'mp4',source:{path:control,sha256:hash(video),width:1080,height:1920,fps:24,frames:63,duration:2.625},
  guidance:{path:reference,sha256:hash(image),width:1080,height:1920,sourceSha256:v5?hash(await readFile(path.join(folder,'original/pamela-v5-body.png'))):'4445634a5698da4121ad40bd7fcef76c8b8b8707c6fc24a87d095ad98348e5a7',transform:{scale:1074/1536,width:1074,height:716,x:3,y:126},status:'provisional-pose-fit-not-calibration'},
  prompt:finalPrompt,decision:'exploratory-motion-transfer-not-production',trackPolicy:'No source card track or frame number inherited. Re-measure generated output.'};
 await writeFile(jobPath,JSON.stringify(job,null,2),{flag:'wx'});
 plan.budget.knownReservedRunwayCredits+=reserve;plan.budget.videoJobs+=1;plan.budget.submissionAttempts=(plan.budget.submissionAttempts||0)+1;await save(path.join(root,'references/production-plan.json'),plan);
 const response=await fetch('https://api.dev.runwayml.com/v1/video_to_video',{method:'POST',headers,signal:AbortSignal.timeout(60000),body:JSON.stringify({model:'aleph2',videoUri:`data:video/mp4;base64,${video.toString('base64')}`,keyframes:[{at:0,uri:`data:image/png;base64,${image.toString('base64')}`}],promptText:finalPrompt,outputFormat:'mp4'})});
 if(!response.ok){await writeFile(path.join(root,'private',`${privateStem}-error${suffix}.txt`),await response.text());job.state='http-error-no-auto-retry';job.httpStatus=response.status;await save(jobPath,job);throw Error(`Runway HTTP ${response.status}; reservation retained; inspect before retry.`);}
 const result=await response.json();if(!result.id)throw Error('No task ID; do not retry.');
 job.taskId=result.id;job.estimatedCost=result.estimatedCost;job.state='submitted';await save(jobPath,job);
 console.log(JSON.stringify({taskId:job.taskId,estimatedCost:job.estimatedCost,reservedCredits:reserve}));
}else if(action==='status'||action==='download'){
 const job=JSON.parse(await readFile(jobPath,'utf8'));if(!/^[\da-z-]+$/i.test(job.taskId||''))throw Error('No durable task ID.');
 const privateFile=path.join(root,'private',`${privateStem}-aleph2${suffix}.json`);
 if(action==='status'){
  const response=await fetch(`https://api.dev.runwayml.com/v1/tasks/${job.taskId}`,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Status HTTP ${response.status}`);
  const task=await response.json();await save(privateFile,task);job.state=task.status;job.checkedAt=new Date().toISOString();await save(jobPath,job);
  console.log(JSON.stringify({taskId:job.taskId,state:task.status,progress:task.progress,failureCode:task.failureCode}));
 }else{
  const task=JSON.parse(await readFile(privateFile,'utf8'));if(task.id!==job.taskId||task.status!=='SUCCEEDED'||task.output?.length!==1)throw Error('No verified single completed output.');
  const url=new URL(task.output[0]);if(url.protocol!=='https:'||!/(?:\.cloudfront\.net|\.runwayml\.com)$/.test(url.hostname))throw Error('Unexpected output host.');
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Download HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.toString('ascii',4,8)!=='ftyp')throw Error('Expected MP4.');
  const output=`${run}/original/pamela-${v5?'v5-':''}pos4-iv-aleph2${suffix}.mp4`;await writeFile(path.join(root,output),bytes,{flag:'wx'});
  job.output={path:output,sha256:hash(bytes),bytes:bytes.length};await save(jobPath,job);console.log(JSON.stringify(job.output));
 }
}else throw Error('Choose submit, status or download.');
