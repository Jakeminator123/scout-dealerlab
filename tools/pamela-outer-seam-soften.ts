/** One bounded eight-frame, premultiplied-alpha retreat-to-VILA overlap. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {keyPamelaFrame} from '../src/pamela-key.ts';

const W=1762,H=1174,FPS=30,N=8,run='runs/20261109-pamela-outer-seam-soften/take-01/complete-matte';
const fullRoot='runs/20261109-pamela-fourteen-full-loop/take-01';
const materialRoot='runs/20261109-pamela-fourteen-material-table/take-01';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const md5=(b:Buffer)=>createHash('md5').update(b).digest('hex');
const execute=promisify(execFile),tag=(n:number)=>String(n).padStart(4,'0');
sharp.concurrency(1);
const fullBytes=await readFile(fullRoot+'/evidence.json'),full=JSON.parse(fullBytes.toString());
assert.equal(hash(fullBytes),'33084f366f7a2fbf343a924de921404f8ae501e9beff5fc28e1914b8fe5fff3b');
const stagePath=materialRoot+'/qa/table-printed.png',stageBytes=await readFile(stagePath);
assert.equal(hash(stageBytes),'307fde007386b482442b732d03eb076e07b30580933b3b1458b43669b1fef4f0');
const materialBytes=await readFile(materialRoot+'/evidence.json'),materials=JSON.parse(materialBytes.toString());
assert.equal(hash(materialBytes),'a27f6764e895d1e7f53af9799933d792aa4968a629eeaccf4d67a653c32a372a');
assert.equal(materials.materials.length,14);
const keyBytes=await readFile('src/pamela-key.ts');
assert.equal(hash(keyBytes),full.snapshots.find((s:any)=>s.path==='src/pamela-key.ts').sha256);
for(const name of ['retreat','breath']){const s=full.sources.find((s:any)=>s.name===name);assert.equal(hash(await readFile(s.path)),s.sha256);}
const stage=await sharp(stageBytes).removeAlpha().raw().toBuffer(),cardSupport=new Uint8Array(W*H);
for(const card of full.landed){const b=await readFile(card.path);assert.equal(hash(b),card.sha256);const a=await sharp(b).ensureAlpha().raw().toBuffer();for(let p=0;p<W*H;p++)if(a[p*4+3])cardSupport[p]=1;}
await mkdir('runs/20261109-pamela-outer-seam-soften',{recursive:true});await mkdir(run);
for(const dir of ['render','layers','qa','snapshot'])await mkdir(run+'/'+dir);
await writeFile(run+'/snapshot/tool.ts',await readFile('tools/pamela-outer-seam-soften.ts'));
await writeFile(run+'/snapshot/pamela-key.ts',keyBytes);
await writeFile(run+'/snapshot/full-loop-evidence.json',fullBytes);
await writeFile(run+'/snapshot/material-table-evidence.json',materialBytes);
type Source='retreat'|'breath';
type Entry={a:Source;af:number;b?:Source;bf?:number;t?:number};
type Layer={rgba:Buffer;sourcePath:string;sourcePngSha256:string;sourceFrame:number;source:Source};
const sourceBindings=new Map<string,Omit<Layer,'rgba'>>();
async function layer(source:Source,frame:number):Promise<Layer>{
 const file=`${fullRoot}/source/${source}/frame-${tag(frame)}.png`,b=await readFile(file);
 const segment=source==='retreat'?'to-vila':'closing-vila';
 assert.equal(hash(b),full.records.find((r:any)=>r.segment===segment&&r.sourceFrame===frame).sourcePngSha256);
 const raw=await sharp(b).removeAlpha().raw().toBuffer(),key=keyPamelaFrame(raw,W,H),rgba=Buffer.alloc(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  // Preserve the complete source matte, including the high rear shoe rim/hair.
  // The independently checked fourteen-card support must remain untouched.
  const p=y*W+x,alpha=Math.round(key.alpha[p]*255);if(!alpha)continue;
  assert.equal(cardSupport[p],0,'Dealer/shoe matte intersects a landed card');
  for(let c=0;c<3;c++)rgba[p*4+c]=key.rgb[p*3+c];rgba[p*4+3]=alpha;
 }
 const binding={source,sourceFrame:frame,sourcePath:file,sourcePngSha256:hash(b)};sourceBindings.set(`${source}:${frame}`,binding);
 return {...binding,rgba};
}
function blend(a:Buffer,b:Buffer,t:number){
 const out=Buffer.alloc(a.length);
 for(let p=0;p<W*H;p++){const j=p*4,aa=a[j+3]/255,ba=b[j+3]/255,alpha=(1-t)*aa+t*ba;if(!alpha)continue;
  out[j+3]=Math.round(alpha*255);for(let c=0;c<3;c++)out[j+c]=Math.round(((1-t)*a[j+c]*aa+t*b[j+c]*ba)/alpha);
 }return out;
}
function composite(rgba:Buffer){
 const rgb=Buffer.from(stage);let outside=0,cards=0;
 for(let p=0;p<W*H;p++){const j=p*4,a=rgba[j+3]/255;if(a)for(let c=0;c<3;c++)rgb[p*3+c]=Math.round(stage[p*3+c]*(1-a)+rgba[j+c]*a);
  for(let c=0;c<3;c++){if(!a&&rgb[p*3+c]!==stage[p*3+c])outside++;if(cardSupport[p]&&rgb[p*3+c]!==stage[p*3+c])cards++;}
 }assert.equal(outside,0);assert.equal(cards,0);return {rgb,outside,cards};
}
const rois={face:{left:720,top:90,width:300,height:330},hands:{left:600,top:700,width:600,height:280},shoe:{left:1180,top:650,width:550,height:340}};
const before:Entry[]=[...Array.from({length:30},(_,i)=>({a:'retreat' as const,af:60+i})),...Array.from({length:30},(_,i)=>({a:'breath' as const,af:22+i}))];
const after:Entry[]=[...Array.from({length:22},(_,i)=>({a:'retreat' as const,af:60+i})),...Array.from({length:N},(_,i)=>({a:'retreat' as const,af:82+i,b:'breath' as const,bf:22+i,t:i/(N-1)})),...Array.from({length:22},(_,i)=>({a:'breath' as const,af:30+i}))];
const records:any[]=[],layers:any[]=[],seamMetrics:any[]=[],outputs:any[]=[];
async function render(name:string,entries:Entry[]){
 const file=`${run}/render/${name}-lossless.mkv`,child=spawn('ffmpeg',['-v','error','-nostdin','-n','-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i','pipe:0','-an','-c:v','ffv1','-level','3','-threads','1','-pix_fmt','bgr0',file],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b);const closed=once(child,'close');let previous:Buffer|undefined;
 try{for(const [f,entry] of entries.entries()){
  const a=await layer(entry.a,entry.af),b=entry.b?await layer(entry.b,entry.bf!):undefined,rgba=b?blend(a.rgba,b.rgba,entry.t!):a.rgba,c=composite(rgba);
  if(!child.stdin.write(c.rgb))await once(child.stdin,'drain');
  records.push({sequence:name,outputFrame:f,...entry,rawRgbSha256:hash(c.rgb),rawRgbMd5:md5(c.rgb),outsideActorChanged:c.outside,cardPixelsChanged:c.cards});
  if(previous){const measures:any={sequence:name,frame:f};for(const [kind,roi] of Object.entries(rois)){let sum=0;for(let y=roi.top;y<roi.top+roi.height;y++)for(let x=roi.left;x<roi.left+roi.width;x++)for(let ch=0;ch<3;ch++)sum+=Math.abs(previous[(y*W+x)*3+ch]-c.rgb[(y*W+x)*3+ch]);measures[kind]=sum/(roi.width*roi.height*3);}seamMetrics.push(measures);}previous=c.rgb;
  if(b){const k=f-22,lp=`${run}/layers/transition-${tag(k)}.png`,encoded=await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toBuffer();await writeFile(lp,encoded);const round=await sharp(encoded).ensureAlpha().raw().toBuffer();assert.ok(round.equals(rgba));layers.push({index:k,path:lp,sha256:hash(encoded),...entry,observedSide:'UNKNOWN',encoding:'straight RGBA8; premultiplied color interpolation'});
   await sharp(c.rgb,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/after-${tag(k)}-full.png`);
   for(const [kind,roi] of Object.entries(rois)){const panels=[];for(const rgb of [composite(a.rgba).rgb,c.rgb,composite(b.rgba).rgb])panels.push(await sharp(rgb,{raw:{width:W,height:H,channels:3}}).extract(roi).png().toBuffer());await sharp({create:{width:roi.width*3,height:roi.height,channels:3,background:'#17212a'}}).composite(panels.map((input,i)=>({input,left:i*roi.width,top:0}))).png().toFile(`${run}/qa/transition-${tag(k)}-${kind}.png`);}
  }
  if(name==='before'&&(f===29||f===30))await sharp(c.rgb,{raw:{width:W,height:H,channels:3}}).png().toFile(`${run}/qa/before-${tag(f)}-full.png`);
 }child.stdin.end();const [code]=await closed;assert.equal(code,0,stderr);
 }catch(e){child.stdin.destroy();if(child.exitCode===null)child.kill();throw e;}
 const decoded=(await execute('ffmpeg',['-v','error','-threads','1','-i',file,'-f','framemd5','-pix_fmt','rgb24','-threads','1','-'],{windowsHide:true,maxBuffer:1024*1024})).stdout.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1)!.trim());
 assert.deepEqual(decoded,records.filter(r=>r.sequence===name).map(r=>r.rawRgbMd5));
 const view=`${run}/render/${name}.mp4`;await execute('ffmpeg',['-v','error','-nostdin','-n','-i',file,'-an','-c:v','libx264','-preset','fast','-crf','14','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart',view],{windowsHide:true});
 for(const p of [file,view]){const probe=JSON.parse((await execute('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',p],{windowsHide:true})).stdout);assert.equal(Number(probe.streams[0].nb_read_frames),entries.length);assert.equal(probe.streams[0].avg_frame_rate,'30/1');outputs.push({path:p,sha256:hash(await readFile(p)),probe,lossless:p===file});}
 console.log(`${name}: ${entries.length} frames; all master RGB MD5s verified`);
}
await render('before',before);await render('after',after);
await writeFile(run+'/frame-map.json',JSON.stringify({fps:FPS,beforeFrames:before.length,afterFrames:after.length,overlapFrames:N,removedTimelineFrames:N,entries:records},null,2)+'\n');
await writeFile(run+'/evidence.json',JSON.stringify({createdAt:new Date().toISOString(),status:'AWAITING_NATIVE_VISUAL_REVIEW',productionAccepted:false,normalSpeedPlaybackReviewed:false,method:'One 8-frame overlap; t=k/7; premultiplied-alpha blend of unwarped source dealer+shoe layers. No optical flow or motion retiming.',sourceFullLoop:{path:fullRoot+'/evidence.json',sha256:hash(fullBytes)},sourceMovies:full.sources.filter((s:any)=>s.name==='retreat'||s.name==='breath'),sourceFrames:[...sourceBindings.values()],stage:{path:stagePath,sha256:hash(stageBytes),independentCardMaterials:14},keySha256:hash(keyBytes),layers,outputs,frameMap:run+'/frame-map.json',metrics:seamMetrics,verification:{frames:records.length,losslessMasterRgbMatches:records.length,outsideActorChanged:0,allFourteenCardSupportChanged:0,rgbaLayerRoundtrips:N},limits:['Two different generated poses are blended; this may create ghosting. No spatial registration was applied.','Only eight transition layers are offered for optional import. This local overlap shortens the demonstration by eight frames; frozen original/full films are unchanged.','Fourteen diagnostic card materials and the room/table are identical outside the dealer/shoe alpha support.','This is not a runtime or normal-speed acceptance.']},null,2)+'\n');
assert.equal(hash(await readFile('src/pamela-key.ts')),hash(keyBytes));assert.equal(hash(await readFile(stagePath)),hash(stageBytes));
console.log(JSON.stringify({run,beforeFrames:before.length,afterFrames:after.length,transitionLayers:layers.length}));
