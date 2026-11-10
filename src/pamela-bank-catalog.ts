import{readFile}from'node:fs/promises';
import type{StageMotion,StageLandedCard}from'./pamela-stage-projection.ts';
export type BankEntry={seat:number;state:string;attempt:string;taskId:string|null;output:null|{path:string;sha256:string;probe:{streams:Array<{width:number;height:number;avg_frame_rate:string;nb_read_frames:string}>;format:{duration:string}}};reviewPath:string|null;decision:string|null;productionAccepted:boolean};
export type CatalogSeat={seat:number;status:string;file?:string;sha256?:string;review?:string;decision?:string;reviewPath?:string;attempt:string;runtimeAccepted:false};
const safePath=(p:string,extension:string)=>p.startsWith('runs/20261109-pamela-seat-bank/')&&!p.includes('\\')&&!p.split('/').some(s=>!s||s==='..'||s.startsWith('.'))&&p.endsWith(extension);
const motionReviewed=(decision:string|null)=>['continue-with-seat-7','continue-to-exact-middle-batch-review','usable-single-card-motion-candidate','usable-symmetric-single-card-motion-candidate'].includes(decision??'');
export async function readPamelaBankCatalog(){
 const index=JSON.parse(await readFile('runs/20261109-pamela-seat-bank/bank-index.json','utf8'))as{schemaVersion:number;dealerId:string;updatedAt:string;seats:BankEntry[]};
 if(index.schemaVersion!==1||index.dealerId!=='pamela-pilot'||index.seats.length!==7||new Set(index.seats.map(s=>s.seat)).size!==7||index.seats.some(s=>!Number.isInteger(s.seat)||s.seat<1||s.seat>7))throw Error('Invalid Pamela bank identity');
 const seats:CatalogSeat[]=[],motions:StageMotion[]=[];
 for(const s of [...index.seats].sort((a,b)=>a.seat-b.seat)){
  const labels:Record<string,string>={prepared:'förberedd',submitted:'inskickad',PENDING:'köar',RUNNING:'genereras',SUCCEEDED:s.output?'råfilm klar':'klar hos Runway',FAILED:'generering misslyckades',CANCELED:'avbruten'};
  const rejected=s.decision?.startsWith('reject')??false;
  const row:CatalogSeat={seat:s.seat,status:rejected?'underkänt råprov':labels[s.state]??'status kontrolleras',attempt:s.attempt,runtimeAccepted:false};
  if(s.output){if(!safePath(s.output.path,'.mp4')||! /^[a-f0-9]{64}$/.test(s.output.sha256))throw Error('Invalid bank media path/hash');row.file=s.output.path;row.sha256=s.output.sha256;}
  if(s.reviewPath){if(!safePath(s.reviewPath,'.json'))throw Error('Invalid bank review path');row.reviewPath=s.reviewPath;}
  if(s.decision){row.decision=s.decision;row.review=rejected?'Rörelsefelet är dokumenterat. Filmen används inte i scenbanken.':motionReviewed(s.decision)?'Rörelseprov granskat. Material, kortlager och övergångar återstår.':'Granskning pågår.';}
  seats.push(row);
  if(!s.output||!s.reviewPath||rejected||!motionReviewed(s.decision))continue;
  const review=JSON.parse(await readFile(s.reviewPath,'utf8'));
  if(review.sourceSha256!==s.output.sha256)throw Error('Stale source QA for seat '+s.seat);
  const stream=s.output.probe.streams[0];if(stream.width!==1762||stream.height!==1174||stream.avg_frame_rate!=='30/1'||Number(stream.nb_read_frames)!==360)throw Error('Unexpected bank video geometry/timing');
  const isInitialOne=s.output.sha256==='5abd5dd1107d7433c8efc0d95164c2c7af3b2b9703f1123c87f8f02da378bc0b';
  const isSymmetricOne=s.output.sha256==='8402ddfcaabf1356b25b28fc8e7e3ca59121260eee6b188b7bfed431b2af9307';
  const contact=isInitialOne?171:isSymmetricOne?review.observations?.release?.conservativeFullyClearFrame:review.findings?.find((f:{kind:string})=>['observed-contact-and-release','observed-contact-release'].includes(f.kind))?.frames?.at(-1);
  if(isSymmetricOne&&(s.seat!==1||review.productionAccepted!==false||contact!==194))throw Error('Invalid symmetric seat1 raw review');
  if(!Number.isInteger(contact)||contact<0||contact>=360)continue;
  motions.push({file:s.output.path,sha256:s.output.sha256,width:1762,height:1174,fps:30,frames:360,reviewEndFrame:isInitialOne?356:359,contactFrame:contact,label:`Plats ${s.seat} · 12 sekunders råtagning`,provenance:s.reviewPath});
 }
 const landedCards:StageLandedCard[]=[];
 try{
  const layers=JSON.parse(await readFile('runs/20261109-pamela-landed-card-layers/manifest.json','utf8'));
  for(const r of layers.records){
   if(!seats.some(s=>s.seat===r.seat&&s.sha256===r.sourceSha256))continue;
   if(typeof r.layer.path!=='string'||!/^runs\/20261109-pamela-landed-card-layers\/[a-f0-9]{16}\/landed-card\.png$/.test(r.layer.path)||! /^[a-f0-9]{64}$/.test(r.layer.sha256)||r.layer.width!==1762||r.layer.height!==1174)throw Error('Invalid landed layer');
   if(landedCards.some(c=>c.seat===r.seat))throw Error('Duplicate landed layer');
   landedCards.push({seat:r.seat,sourceSha256:r.sourceSha256,file:r.layer.path,sha256:r.layer.sha256});
  }
 }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 return{updatedAt:index.updatedAt,seats,motions,landedCards};
}
