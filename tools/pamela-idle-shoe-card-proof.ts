import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {openIdleShoeCardSurfaces,IDLE_SHOE_CARD_SOURCES} from '../src/pamela-idle-shoe-card.ts';
import {openBankCardSurfaces} from '../src/pamela-bank-card-surfaces.ts';
const ROOT='runs/20261110-pamela-idle-shoe-card';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const bridge=await read('runs/20261109-pamela-idle-ready-bridge/run-01/qa/take-01/evidence.json');
const idle=await read('runs/20261109-pamela-idle-anchor-review/job01-width-mismatch-01/numeric.json');
await mkdir(ROOT,{recursive:true});
const crop={left:1225,top:733,width:135,height:140};
const sets=[{id:'B',frames:[0,6,12,18,22,252,268,284,300,316,326]},
 {id:'bridge',frames:[6,16,26,36,46,50,54,58,62,66,70,74,78,82,86,87,88,89]}];
for(const set of sets){
 const tiles=[];for(const frame of set.frames){
  const r=set.id==='B'?idle.frames.find((r:any)=>r.frame===frame):bridge.frames.find((r:any)=>r.source===set.id&&r.frame===frame);
  const bytes=await readFile(r.path);if(hash(bytes)!==(r.pngSha256??r.sha256))throw Error('Source hash mismatch');
  const im=await sharp(bytes).extract(crop).resize(crop.width*3,crop.height*3,{kernel:'nearest'}).png().toBuffer();
  const label=Buffer.from(`<svg width="405" height="28"><rect width="405" height="28" fill="#fff"/><text x="8" y="20" font-size="19">${set.id} ${frame}; native x1225 y733, 3x</text></svg>`);
  const tile=await sharp({create:{width:405,height:448,channels:3,background:'#fff'}}).composite([{input:label,top:0,left:0},{input:im,top:28,left:0}]).png().toBuffer();tiles.push(tile);
 }
 const cols=3,rows=Math.ceil(tiles.length/cols);
 await sharp({create:{width:405*cols,height:448*rows,channels:3,background:'#ddd'}}).composite(tiles.map((input,i)=>({input,left:i%cols*405,top:Math.floor(i/cols)*448}))).png().toFile(`${ROOT}/native-${set.id}.png`);
}
if(process.argv.includes('--survey-only')){console.log(JSON.stringify({survey:ROOT}));process.exit(0);}
const take=process.argv.find(x=>x.startsWith('--take='))?.split('=')[1];assert.match(take??'',/^\d\d$/,'Supply a new --take=NN');
const out=`${ROOT}/take-${take}`;await mkdir(out,{recursive:false});await mkdir(`${out}/masks`);await mkdir(`${out}/crops`);
const ref=async(path:string)=>({path,sha256:hash(await readFile(path))});
const checked=async(r:{path:string;sha256:string})=>{const b=await readFile(r.path);assert.equal(hash(b),r.sha256);return b;};
const selected=await read('references/pamela-two-sided-bank.json'),bankEvidence=JSON.parse((await checked(selected.evidence)).toString());
const plan=JSON.parse((await checked(bankEvidence.plan)).toString());
const api=await openIdleShoeCardSurfaces(),bank=await openBankCardSurfaces(plan.selections.find((s:any)=>s.id==='C1-P1'));
const signal=plan.engineFixture.signals.find((s:any)=>s.slotId==='C1-P1');assert.ok(signal);
const loadTexture=async(r:any)=>{const{data,info}=await sharp(await checked(r)).removeAlpha().raw().toBuffer({resolveWithObject:true});return{rgb:data,width:info.width,height:info.height,id:r.sha256};};
const designs=[];for(const d of plan.designs)designs.push({id:d.id,front:await loadTexture(plan.artwork.front[d.front][signal.cardId]),back:await loadTexture(plan.artwork.back[d.back])});
const variants=[...designs.map(d=>({...d,allowed:true})),{...designs[0],id:'front-denied',allowed:false}];
const records:any[]=[],images=new Map<string,Buffer>();
const png=async(raw:Uint8Array,channels:1|3)=>sharp(raw,{raw:{width:1764,height:1174,channels}}).png().toBuffer();
const contactCrop={left:1230,top:748,width:124,height:118};
for(const [key,r]of api.refs){
 const sourceId=key.split(':')[0] as 'B'|'bridge',bytes=await checked(r),raw=await sharp(bytes).removeAlpha().raw().toBuffer();
 const geometry=api.geometryFrame({sourceId,sourceSha256:IDLE_SHOE_CARD_SOURCES[sourceId].sha256,frame:r.frame,originalRGB:raw});
 const prefix=`${sourceId}-${String(r.frame).padStart(4,'0')}`,masks:any={};
 for(const type of ['coverage','guard']as const){const path=`${out}/masks/${prefix}-${type}.png`;await writeFile(path,await png(geometry[type],1));masks[type]=await ref(path);}
 const row:any={sourceId,sourceSha256:geometry.sourceSha256,frame:r.frame,source:r,quad:geometry.quad,canonicalUvQuarterTurns:1,physicalSide:'UNKNOWN',masks,measurements:geometry.measurements,variants:[]};
 const nativeCrop=await sharp(raw,{raw:{width:1764,height:1174,channels:3}}).extract(contactCrop).png().toBuffer();images.set(`${prefix}/native`,nativeCrop);
 const overlay=Buffer.from(raw);for(let y=contactCrop.top;y<contactCrop.top+contactCrop.height;y++)for(let x=contactCrop.left;x<contactCrop.left+contactCrop.width;x++){const p=y*1764+x,j=p*3;if(geometry.coverage[p]){overlay[j]=0;overlay[j+1]=220;overlay[j+2]=240;}else if(geometry.guard[p]){overlay[j]=255;overlay[j+1]=0;overlay[j+2]=255;}}
 images.set(`${prefix}/mask`,await sharp(overlay,{raw:{width:1764,height:1174,channels:3}}).extract(contactCrop).png().toBuffer());
 for(const variant of variants){let frontLookups=0;const result=await api.paint(geometry,{slotId:signal.slotId,displaySide:'FRONT',cardId:signal.cardId,frontAllowed:variant.allowed,back:variant.back,front:()=>{frontLookups++;return variant.front;}});
  assert.equal(frontLookups,variant.allowed?1:0);assert.equal(result.verification.changedOutsidePaperPixels,0);assert.equal(result.verification.changedProtectedPixels,0);
  const cropPng=await sharp(result.printed,{raw:{width:1764,height:1174,channels:3}}).extract(contactCrop).png().toBuffer();images.set(`${prefix}/${variant.id}`,cropPng);
  const path=`${out}/crops/${prefix}-${variant.id}.png`;await writeFile(path,cropPng);row.variants.push({id:variant.id,states:result.states,frontLookups,verification:result.verification,crop:await ref(path)});
 }
 records.push(row);
}
const sheets:any[]=[];
async function sheet(name:string,frames:{key:string;label:string}[],variant:string){
 const tiles=[];for(const f of frames){const before=images.get(`${f.key}/native`)!,after=images.get(`${f.key}/${variant}`)!;
  const label=Buffer.from(`<svg width="496" height="26"><rect width="496" height="26" fill="white"/><text x="6" y="18" font-size="16">${f.label}: ${name==='exit'?'printed bridge':'native'} | ${variant}, 2x</text></svg>`);
  tiles.push(await sharp({create:{width:496,height:262,channels:3,background:'#fff'}}).composite([{input:label,top:0,left:0},{input:await sharp(before).resize(248,236,{kernel:'nearest'}).toBuffer(),top:26,left:0},{input:await sharp(after).resize(248,236,{kernel:'nearest'}).toBuffer(),top:26,left:248}]).png().toBuffer());
 }
 const path=`${out}/${name}-${variant}.png`;await sharp({create:{width:1488,height:Math.ceil(tiles.length/3)*262,channels:3,background:'#ddd'}}).composite(tiles.map((input,i)=>({input,left:i%3*496,top:Math.floor(i/3)*262}))).png().toFile(path);sheets.push(await ref(path));
}
const contact=records.filter(r=>r.sourceId==='bridge'&&r.frame>=44).map(r=>({key:`bridge-${String(r.frame).padStart(4,'0')}`,label:`bridge${r.frame}`}));
for(let i=0;i<contact.length;i+=12)for(const variant of [...variants.map(v=>v.id),'mask'])await sheet(`contact-${String(i/12+1).padStart(2,'0')}`,contact.slice(i,i+12),variant);
const overview=[['B',0],['B',22],['B',252],['B',284],['B',305],['B',326],['bridge',6],['bridge',28],['bridge',43]].map(([id,f])=>({key:`${id}-${String(f).padStart(4,'0')}`,label:`${id}${f}`}));
for(const variant of [...variants.map(v=>v.id),'mask'])await sheet('overview',overview,variant);
// Compare the actual selected H264 trim and freshly materialized original C1
// source17..20. They are intentionally separate: encoded pixels are not proof
// of lossless material equality. No source is silently aligned or retimed.
const audit=await read('runs/20261110-pamela-idle-chain-audit/evidence.json');
const trim=bankEvidence.trimmed.find((r:any)=>r.id==='C1-P1');await checked(trim.output);
const exits:any[]=[];
for(let n=0;n<4;n++){
 const f=17+n,native=await bank.geometryFrame(f),variant=designs[0],materials={back:variant.back,front:new Map([[signal.cardId,variant.front]])};
 const printed=await bank.paint(native,materials,new Map([[signal.slotId,signal]]));
 const renderPath=`runs/20261110-pamela-idle-chain-audit/decoded/actual-trim-${String(n).padStart(4,'0')}.png`;
 const decodedRef=audit.extracts?.find((r:any)=>r.frame===n)?.trim??audit.extracts?.[n]?.trim;assert.ok(decodedRef?.sha256,'Need audited actual trim PNG');assert.equal(hash(await readFile(renderPath)),decodedRef.sha256);
 const actual=await sharp(renderPath).extract({left:contactCrop.left-1,top:contactCrop.top,width:contactCrop.width,height:contactCrop.height}).png().toBuffer();
 const source=await sharp(native.original,{raw:{width:1762,height:1174,channels:3}}).extract({left:contactCrop.left-1,top:contactCrop.top,width:contactCrop.width,height:contactCrop.height}).png().toBuffer();
 const material=await sharp(printed.printed,{raw:{width:1762,height:1174,channels:3}}).extract({left:contactCrop.left-1,top:contactCrop.top,width:contactCrop.width,height:contactCrop.height}).png().toBuffer();
 images.set(`exit-${n}/native`,images.get(`bridge-${String(86+n).padStart(4,'0')}/sg-classic`)!);images.set(`exit-${n}/actual-trim`,actual);images.set(`exit-${n}/bank-material`,material);images.set(`exit-${n}/bank-source`,source);
 exits.push({bridgeFrame:86+n,bankSourceFrame:f,actualTrimFrame:n,actualTrim:decodedRef,bankVerification:printed.verification,bankStates:printed.states});
}
for(const variant of ['actual-trim','bank-material','bank-source'])await sheet('exit',exits.map((e,n)=>({key:`exit-${n}`,label:`bridge${e.bridgeFrame} | C1-P1 ${e.bankSourceFrame}`})),variant);
const evidence={schemaVersion:1,status:'native-review-required',createdAt:new Date().toISOString(),apiCalls:0,mediaProcesses:0,productionAccepted:false,
 sources:IDLE_SHOE_CARD_SOURCES,selectedBank:await ref('references/pamela-two-sided-bank.json'),bankEvidence:selected.evidence,bankPlan:bankEvidence.plan,
 sourceContract:{physicalSide:'UNKNOWN',callerSupplies:['slotId','displaySide','cardId','frontAllowed','back','front'],bankComparisonSignal:signal,bankPresentationSide:'FRONT',bankCanonicalUvQuarterTurns:1},
 code:await Promise.all(['src/pamela-idle-shoe-card.ts','src/pamela-paper-material.ts','src/pamela-two-sided-card.ts','src/pamela-bank-card-surfaces.ts','tools/pamela-idle-shoe-card-proof.ts'].map(ref)),
 counts:{sourceFrames:records.length,materialFrames:records.length*variants.length},records,sheets,exits,
 limitations:['Blank source cannot establish semantic front/back or next card identity.','Native paper/gold/skin mixed pixels are conservatively excluded; coverage threshold is source-specific.','The bank uses strip UV and a different native silhouette. Texture presence and orientation are not pixel-identical or optical seam acceptance.','No full-scene, GPU or H264 lossless parity is claimed.']};
await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({evidence:await ref(`${out}/evidence.json`),counts:evidence.counts}));
