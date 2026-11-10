import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';

export const IMAGE='ghcr.io/jakeminator123/moving-gpu-worker@sha256:92b7562c35abaf1031d89f787ac5a167568476920a2cc181af0b4cd54ccf4247';
export const ACCOUNT='user_3JyugB7zSsnraybCUEBvgJcEdDb';
export const MAX_MINUTES=20,MAX_SPEECH=10,MAX_CHATS=20;
export const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
export const readJson=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
export const keys=async(root:string)=>parseEnv(await readFile(path.join(root,'.env.local'),'utf8'));
export type BankProfile={id:string;label:string;manifest:string;archive:string;receipt:string;source:string;savedVideo:string;warmupAudio:string;voiceId:string;voiceCredential:string};
export async function localFile(root:string,relative:string){
 if(!/^(runs|media)\//.test(relative)||relative.includes('..')||relative.includes('\\')||relative.includes(':'))throw Error('Ogiltig banksökväg.');
 const base=await realpath(root),resolved=await realpath(path.join(base,relative));
 if(!resolved.startsWith(base+path.sep))throw Error('Banken ligger utanför arbetsytan.');return resolved;
}
export async function profiles(root:string):Promise<BankProfile[]>{
 const data=await readJson(path.join(root,'references/lipsync-banks.json'));
 if(data.schemaVersion!==1||!Array.isArray(data.profiles)||!data.profiles.length||data.profiles.length>30)throw Error('Ogiltigt bankregister.');
 return data.profiles;
}
export async function loadBank(root:string,id='maud'){
 const profile=(await profiles(root)).find(p=>p.id===id);if(!profile)throw Error('Dealern finns inte i testregistret.');
 const manifest=await readJson(await localFile(root,profile.manifest));
 const archive=await readFile(await localFile(root,profile.archive)),receipt=await readFile(await localFile(root,profile.receipt));
 const source=await readFile(await localFile(root,profile.source)),binding=manifest.binding;
 if(manifest.image!==IMAGE||binding.dealerId!==id||hash(archive)!==binding.avatarSha256||hash(receipt)!==binding.bankReceiptSha256||hash(source)!==manifest.source.clips[0].sha256)throw Error('Bankens identitet eller filhash har ändrats.');
 return {profile,manifest,archive,receipt,source};
}
export function shortText(value:unknown,max=48){
 if(typeof value!=='string')throw Error('Text saknas.');const text=value.trim().replace(/\s+/g,' ');
 if(!text||text.length>max)throw Error(`Skriv en kort replik, högst ${max} tecken.`);return text;
}
export function frameCount(samples:number){
 if(!Number.isSafeInteger(samples)||samples<=0)throw Error('Ljudet är tomt.');
 const frames=Math.floor((samples+18000)/1000);
 if(frames>63)throw Error('Rösten blev längre än testklippet. Prova en kortare replik, 1–3 ord.');return frames;
}
