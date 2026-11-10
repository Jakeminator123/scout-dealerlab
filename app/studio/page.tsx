import {readFile} from 'node:fs/promises';
import path from 'node:path';
import StudioWorkbench from '../../src/studio-workbench/StudioWorkbench.tsx';
import {WORKBENCH_CSS} from '../../src/studio-workbench/styles.ts';
import {studioWorkbenchProps} from '../../src/studio-workbench-data.ts';
export const dynamic='force-dynamic';
export const metadata={title:'Pamela · Studio'};
export default async function StudioPage(){
 const read=async(p:string)=>JSON.parse(await readFile(path.join(process.cwd(),p),'utf8'));
 const readOptional=async(p:string)=>{try{return await read(p);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}};
 const [composition,idle,cuts,selection,correctedComposition,continuous,cardContactV4]=await Promise.all([
  read('runs/20261109-pamela-central-composite/composition.json'),
  read('runs/20261109-pamela-idle-composite/composition.json'),
  read('runs/20261109-pamela-idle-cut-proof/metadata.json'),
  read('references/public-selection.json'),
  readOptional('runs/20261109-pamela-card-side-proof/composition.json'),
  readOptional('runs/20261109-pamela-continuous-idle/composition.json'),
  readOptional('runs/20261109-pamela-card-contact-v4/composition.json')
 ]);
 const paths=new Map<string,string>((selection.media as string[]).map(p=>[p,'/files/'+p.split('/').map(encodeURIComponent).join('/')]));
 if(correctedComposition)for(const p of [correctedComposition.output.path,correctedComposition.portrait.path,correctedComposition.raw.path,correctedComposition.poster] as string[])paths.set(p,'/files/'+p.split('/').map(encodeURIComponent).join('/'));
 if(continuous)for(const p of [continuous.output.path,continuous.portrait.path,continuous.raw.path,continuous.loopNative.path,continuous.loopPortrait.path,continuous.poster] as string[])paths.set(p,'/files/'+p.split('/').map(encodeURIComponent).join('/'));
 if(continuous?.cutProof)for(const p of [continuous.cutProof.native.path,continuous.cutProof.portrait.path] as string[])paths.set(p,'/files/'+p.split('/').map(encodeURIComponent).join('/'));
 if(cardContactV4)for(const p of [cardContactV4.output.path,cardContactV4.portrait.path,cardContactV4.raw.path,cardContactV4.poster] as string[])paths.set(p,'/files/'+p.split('/').map(encodeURIComponent).join('/'));
 const props=studioWorkbenchProps('Lokal arbetskopia',paths,composition,idle,cuts,correctedComposition,continuous,cardContactV4);
 return <><style>{WORKBENCH_CSS}</style><StudioWorkbench {...props}/></>;
}
