import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
const exec=promisify(execFile),run='runs/20261109-pamela-reference-kit';
const sha=async(file:string)=>createHash('sha256').update(await readFile(file)).digest('hex');
const vila=`${run}/original/pamela-vila-station.png`,redo=`${run}/original/pamela-redo-station.png`;
const image=await sharp(vila).removeAlpha().raw().toBuffer({resolveWithObject:true});
if(image.info.width!==1536||image.info.height!==1024)throw Error('Anchor canvas changed');
const bounds={left:1536,top:1024,right:0,bottom:0};let whitePixels=0;
for(let y=620;y<780;y++)for(let x=1040;x<1220;x++){
  const n=(y*1536+x)*image.info.channels,[r,g,b]=image.data.subarray(n,n+3);
  if(Math.min(r,g,b)>190&&Math.max(r,g,b)-Math.min(r,g,b)<35){whitePixels++;bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}
}
if(whitePixels<1000)throw Error('Blank reference card could not be located');
const point=(x:number,y:number)=>({x,y,u:x/1536,v:y/1024});
const result:any={schemaVersion:1,id:'pamela-workspace-v1',updatedAt:new Date().toISOString(),status:'new-reference-candidate-not-production-bank',
  purpose:'Egen referensuppsättning för nya dealers i Scout /studio/snabb. Kevin är ett separat projekt som bara används för jämförelse. Göran, salongen och panoramat ingår inte i detta paket.',
  identity:{dealerId:'pamela-pilot',base:'runs/20261108-pamela-v5-body/original/pamela-v5-body.png',baseSha256:await sha('runs/20261108-pamela-v5-body/original/pamela-v5-body.png'),userFeedback:'Jakob beskrev denna nya bild som svinbra; det är inte acceptans av senare filmer eller kamerakalibrering.'},
  sourcePlane:{width:1536,height:1024,camera:'locked',units:'source pixels plus normalized coordinates',worldUnits:'unknown; not 3D calibration'},
  generation:{provider:'built-in image_gen',exactModel:'not exposed',costUsd:null,originalOutputsPreserved:true,vilaPrompt:`${run}/vila-prompt.txt`,redoPrompt:`${run}/redo-prompt.txt`},
  anchors:[{id:'VILA',path:vila,sha256:await sha(vila),meaning:'Händer i vilopose; blicken framåt.'},{id:'REDO',path:redo,sha256:await sha(redo),meaning:'Blick mot sko; vänster hand vid det vita kortets övre kant. Kortet kvar i skon.'}],
  geometry:{shoe:{reference:'Fixed black shoe in both anchors',blankCardWhiteRegion:{...bounds,whitePixels,method:'RGB threshold in fixed shoe ROI; bounding box, not calibrated card corners'},outletCentre:point((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2),readyFingerContact:{...point(1130,668),method:'manual visual estimate in REDO; verify in motion'},newCoordinates:true},
    vilaHands:[{...point(665,741),method:'manual visual estimate'},{...point(847,741),method:'manual visual estimate'}],
    sourceMargins:{foreground:'Green space below and beside hands is reserved for motion. VILA→REDO does not certify the later full forward or outer-seat reach.',futureDealingTargets:'not calibrated; no invented 7-seat radii or world coordinates'},
    torso:'This workstation plate has an implied green tabletop at the waist. Complete-body v5 original is preserved separately. A foreground hand mask/table occlusion and longer reach proof remain necessary; these two plates do not prove replaceable tables.'},
  formats:{native:'New generated motion uses measured native dimensions and fps, not assumed old Astrid timing.',desktop:{width:1920,height:1080,sourceFit:'contain',scale:1080/1024,offset:[150,0],purpose:'Review projection only; preserves entire source frame.'},portrait:{width:1080,height:1920,sourceFit:'width, no crop',scale:1080/1536,offset:[0,120],purpose:'Proposed source-plane adapter, not accepted Main runtime geometry.'},mainTarget:{width:1080,height:1920,fps:24,status:'Requires explicit derivative, new hash and timing/track QA before import.'}},
  sequence:[{id:'to-shoe',from:'VILA',to:'REDO',mainSlot:'transition.shoe/to-shoe',status:'first motion trial'},{id:'deal-N',from:'REDO',to:'REDO',mainTake:'N:base',status:'next; central seat 4 / box3 first'},{id:'from-shoe',from:'REDO',to:'VILA',mainSlot:'transition.shoe/from-shoe',status:'not generated'},{id:'iv-N',from:'VILA',to:'VILA',mainTake:'N:iv',status:'optional complete-deal variant, not an idle'}],
  seats:Array.from({length:7},(_,i)=>({playerSeat:i+1,box:i,landingAnchor:null,status:'future calibration; not generated'})),
  futurePipeline:{referencePreset:'new explicit bank/profile pair; not an extra request property on current API',contract:'references/main-pilot-contract.json',referenceMethod:'references/kevin-production-pick.json',inheritAstridTracks:false,mainWrites:false,mergeAuthorized:false},
  paidVideoJobsThisStage:1,taskId:'d13b31d2-3cca-443a-a710-3827df8194c9',maxCreditsThisStage:60};
const job=JSON.parse(await readFile(`${run}/wan3ready.json`,'utf8'));
if(job.output){
  const probe=JSON.parse((await exec('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration','-of','json',job.output.path],{windowsHide:true})).stdout).streams[0];
  if(await sha(job.output.path)!==job.output.sha256)throw Error('Output hash mismatch');
  const [n,d]=probe.r_frame_rate.split('/').map(Number);
  result.clip={...job.output,width:probe.width,height:probe.height,fps:n/d,frameCount:Number(probe.nb_read_frames),duration:Number(probe.duration),from:'VILA',to:'REDO',mainSlot:'transition.shoe/to-shoe',taskId:job.taskId,model:job.model,apiCreditEstimate:60,accepted:false};
}
await mkdir(`${run}/qa`,{recursive:true});
await writeFile(`${run}/reference-kit.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({id:result.id,anchors:result.anchors.map((a:any)=>({id:a.id,sha256:a.sha256})),blankCardBounds:bounds,clip:result.clip||null}));
