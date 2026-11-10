import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ACCOUNT,IMAGE,keys} from './config.ts';
export type PodOwner={id:string|null;name:string;image:string;token:string;createdAt:number;expiresAt:number;hourlyRate:number;directory:string;terminatedAt?:string;watchdogPid?:number};
export const ownerFile=(root:string)=>path.join(root,'private/maud-lab/active-pod.json');
export async function saveOwner(root:string,owner:PodOwner){await mkdir(path.dirname(ownerFile(root)),{recursive:true});const current=owner.terminatedAt?await readOwner(root):null;if(!current||current.createdAt<=owner.createdAt)await writeFile(ownerFile(root),JSON.stringify(owner,null,2));await writeFile(path.join(root,owner.directory,'owner.json'),JSON.stringify({...owner,token:undefined},null,2));}
export async function runpod(root:string,route:string,method='GET',body?:unknown){
 const key=(await keys(root)).RUNPOD_JAKOB_API_KEY;if(!key)throw Error('Jakobs RunPod-nyckel saknas.');
 const response=await fetch('https://api.runpod.io/v2'+route,{method,headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000),redirect:'error'});
 if(response.status===404)return null;
 if(!response.ok)throw Error('RunPod svarade HTTP '+response.status+'.');return response.json().catch(()=>null);
}
export async function assertAccount(root:string){
 const key=(await keys(root)).RUNPOD_JAKOB_API_KEY;
 const r=await fetch('https://api.runpod.io/graphql',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({query:'query { myself { id } }'}),signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!r.ok||(await r.json()).data?.myself?.id!==ACCOUNT)throw Error('RunPod-kontot stämmer inte med labbets Jakob-profil.');
}
export async function stopOwnedPod(root:string,owner:PodOwner){
 if(owner.terminatedAt)return;
 await assertAccount(root);
 if(!owner.id){
  const listed=await runpod(root,'/pods');const matches=(Array.isArray(listed)?listed:listed?.pods??[]).filter((p:any)=>p.name===owner.name&&p.image===IMAGE);
  if(matches.length>1)throw Error('Flera poddar matchar testets namn. Ingen stoppades.');if(matches[0])owner.id=matches[0].id;
 }
 if(owner.id){const current=await runpod(root,'/pods/'+owner.id);
  if(current){if(current.name!==owner.name||current.image!==IMAGE||!owner.name.startsWith('snyggare-maudlab-'))throw Error('Testpoddens ägare stämmer inte.');await runpod(root,'/pods/'+owner.id,'DELETE');}
  if(await runpod(root,'/pods/'+owner.id)!==null)throw Error('RunPod har inte bekräftat avstängningen.');
 }
 owner.terminatedAt=new Date().toISOString();await saveOwner(root,owner);
 await writeFile(path.join(root,owner.directory,'cleanup.json'),JSON.stringify({podId:owner.id,terminatedAt:owner.terminatedAt,verificationHttp:owner.id?404:null,costUpperEstimateUsd:(Date.now()-owner.createdAt)/3600000*owner.hourlyRate},null,2));
}
export async function readOwner(root:string):Promise<PodOwner|null>{try{return JSON.parse(await readFile(ownerFile(root),'utf8'));}catch(e:any){if(e.code==='ENOENT')return null;throw e;}}
