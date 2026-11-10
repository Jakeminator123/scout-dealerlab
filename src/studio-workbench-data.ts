import {segmentsFromTimeline, type WorkbenchClip, type WorkbenchProps, type WorkbenchTimelineFrame} from './studio-workbench/model.ts';
import type {PamelaContinuousIdleReport} from './pamela-continuous-idle-page.ts';
type Media={path:string;sha256:string;width:number;height:number;frameCount:number;fps?:number;duration?:number;durationSeconds?:number};
type Idle={clips:{name:string;label:string;source:Media;native:Media;portrait:Media;proofs:{path:string}[]}[];sequence:{native:Media;portrait:Media}};
type Composite={output:Media;portrait:Media;raw:Media;poster:string;timeline?:WorkbenchTimelineFrame[]};
type Cuts={outputs:(Media&{id:string})[]};
export function studioWorkbenchProps(snapshot:string,paths:Map<string,string>,composition:Composite,idle:Idle,cuts:Cuts,correctedComposition?:Composite,continuous?:PamelaContinuousIdleReport,cardContactV4?:Composite):WorkbenchProps{
 const get=(p:string)=>{const u=paths.get(p);if(!u)throw Error('Missing studio asset '+p);return u;};
 const media=(m:Media)=>({url:get(m.path),sha256:m.sha256,width:m.width,height:m.height,frameCount:m.frameCount,duration:m.duration??m.durationSeconds??m.frameCount/(m.fps??30)});
 const clips:WorkbenchClip[]=[
  {id:'central',label:'Centralgivning · tidigare V2',description:'VILA → REDO → två givningar → VILA. Central v2; kort 2 täcker fortfarande kort 1.',fps:30,native:media(composition.output),portrait:media(composition.portrait),raw:media(composition.raw),poster:get(composition.poster),segments:segmentsFromTimeline(composition.timeline,composition.output.frameCount)},
  {id:'idle-sequence',label:'Vila · sammanhängande prov',description:'Andning → andning → blick → andning. Råa skarvar vid 6, 12 och 15 s; ansiktsåterställning är ännu inte löst.',fps:30,native:media(idle.sequence.native),portrait:media(idle.sequence.portrait),poster:get(idle.clips[0].proofs[0].path)},
  ...idle.clips.map(c=>({id:c.name,label:c.label,description:c.name==='breath'?'Lugn andning, 6 sekunder. Grundloopskandidat med synlig råskarv.':'Nedblick med blinkningar, 3 sekunder. Samma avsedda VILA-ankare.',fps:30,native:media(c.native),portrait:media(c.portrait),raw:media(c.source),poster:get(c.proofs[0].path)})),
  ...cuts.outputs.map((c,i)=>({id:c.id,label:i===0?'Skarv A · ursprunglig':'Skarv B · senare ingång',description:i===0?'2-sekunders prov: andning 150–179 → blick 0–29. Bytet sker vid 1 s.':'2-sekunders kandidat: andning 150–179 → blick 12–41. Ingen toning eller ny generering; ännu inte accepterad.',fps:30,native:media(c)}))
 ];
 const first=clips.findIndex(c=>c.id==='breath');
 if(first>0)clips.unshift(clips.splice(first,1)[0]);
 if(correctedComposition)clips.unshift({id:'central-cardfix',label:'Centralgivning · kortkorrigering',description:'Ny kandidat med korrigerad kortbaksida, alpha och bordskant. Råskarvarna är oförändrade; kort 2 täcker fortfarande kort 1.',fps:30,native:media(correctedComposition.output),portrait:media(correctedComposition.portrait),raw:media(correctedComposition.raw),poster:get(correctedComposition.poster),segments:segmentsFromTimeline(correctedComposition.timeline,correctedComposition.output.frameCount)});
 if(continuous)clips.splice(correctedComposition?1:clips.length,0,
  {id:'idle-continuous',label:'Vila · en tagning 12 s',description:'En obruten 12-sekunderstagning med fem önskade beteenden, inte fem godkända klipp. '+continuous.qa.summary,fps:continuous.output.fps,native:media(continuous.output),portrait:media(continuous.portrait),raw:media(continuous.raw),poster:get(continuous.poster)},
  {id:'idle-continuous-loop',label:'Vila · tre råa loopar',description:'Samma långtagning upprepad tre gånger utan toning. Loopskarven och framtida extraherade klippskarvar behöver granskas. '+continuous.qa.summary,fps:continuous.loopNative.fps,native:media(continuous.loopNative),portrait:media(continuous.loopPortrait),poster:get(continuous.poster)}
 );
 if(continuous?.cutProof)clips.push({id:'idle-cut-proof',label:'Vila · utklippt VILA → blick → VILA',description:continuous.cutProof.summary,fps:continuous.cutProof.native.fps,native:media(continuous.cutProof.native),portrait:media(continuous.cutProof.portrait),poster:get(continuous.poster)});
 if(cardContactV4)clips.unshift({id:'central-contact-v4',label:'Centralgivning · två läsbara kort',description:'Kort 2 placeras +46 px med cirka 67,6 % överlapp. Handen följer kontakten och återgår efter släpp. Förbättrat tryck och SG-kort i skon; 2D-approximation och råa ansiktsskarvar kvar.',fps:30,native:media(cardContactV4.output),portrait:media(cardContactV4.portrait),raw:media(cardContactV4.raw),poster:get(cardContactV4.poster),segments:segmentsFromTimeline(cardContactV4.timeline,cardContactV4.output.frameCount)});
 return {snapshot,clips};
}
