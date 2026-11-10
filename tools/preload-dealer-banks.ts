import {fileURLToPath} from 'node:url';
import {profiles,loadBank} from '../src/maud-lab/config.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),[command='--check',id='maud']=process.argv.slice(2);
if(command==='--check'){
 for(const p of await profiles(root)){const bank=await loadBank(root,p.id);console.log(JSON.stringify({dealer:p.id,clips:bank.manifest.source.clips.length,bankBytes:bank.archive.length,sourceFrames:bank.manifest.source.clips.reduce((n:number,c:any)=>n+c.frameCount,0),image:bank.manifest.image,verified:true}));}
}else if(['--start','--preload','--preload-all','--stop','--status'].includes(command)){
 const origin='http://127.0.0.1:4318',status=await fetch(origin+'/api/maud/status').then(r=>r.json());if(!status.csrf)throw Error('Starta labbet med START.cmd först.');
 if(command==='--status')console.log(JSON.stringify(status.gpu));
 else{
  const route=command==='--start'?'gpu/start':command==='--stop'?'gpu/stop':'banks/preload';
  const ids=command==='--preload-all'?(await profiles(root)).map(p=>p.id):[id];
  for(const dealerId of ids){const response=await fetch(origin+'/api/maud/'+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Maud-Csrf':status.csrf},body:JSON.stringify({id:dealerId})});
   const result=await response.json();if(!response.ok)throw Error(result.error);console.log(JSON.stringify(result));}
 }
}else throw Error('Använd --check, --status, --start (GPU 20 min), --preload <dealer-id>, --preload-all eller --stop.');
