import{readFile}from'node:fs/promises';
export type C2Candidate={seat:number;status:'pending'|'raw-candidate'|'needs-work';reason?:string;reviewPath?:string;source?:{path:string;sha256:string};taskId?:string;contactFrame?:number;clearHandFrame?:number;redoFrame?:number;limitations?:string[]};
export async function readPamelaC2Catalog():Promise<C2Candidate[]>{
 const result:C2Candidate[]=[];
 for(let seat=1;seat<=7;seat++){
  const stage=seat===1||seat===7?1:2,reviewPath=`runs/20261109-pamela-seat-bank/c2/bank-v2-stage-${stage}/qa/seat-${seat}/review.json`;
  let r;try{r=JSON.parse(await readFile(reviewPath,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;result.push({seat,status:'pending'});continue;}
  if(r.seat!==seat||r.source?.probe?.streams?.[0]?.nb_read_frames!=='360'||r.source?.probe?.streams?.[0]?.avg_frame_rate!=='30/1'||!/^[a-f0-9]{64}$/.test(r.source?.sha256??''))throw Error('Invalid C2 source for seat '+seat);
  if(r.decision!=='usable-c2-motion-candidate'){result.push({seat,status:'needs-work',reason:String(r.decision),reviewPath});continue;}
  result.push({seat,status:'raw-candidate',reviewPath,source:{path:r.source.path,sha256:r.source.sha256},taskId:r.taskId,contactFrame:r.findings.c2Contact.nativeContactFrame,clearHandFrame:r.findings.c2Contact.clearHandNativeFrame,redoFrame:r.findings.emptyReturn.settledRedoNativeFrame,limitations:r.limitations});
 }
 return result;
}
