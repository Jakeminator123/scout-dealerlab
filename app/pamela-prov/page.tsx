import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import PamelaMaterialProgressRefresh from '../../src/pamela-material-progress-refresh.tsx';
import path from 'node:path';
import PamelaProofClient, { type PamelaProofReport } from '../../src/pamela-proof-client.tsx';
import PamelaMotionLab from '../../src/pamela-motion-lab-client.tsx';
import {validateMotionContract,type MotionContract} from '../../src/pamela-motion-contract.ts';
import{readPamelaBankCatalog}from'../../src/pamela-bank-catalog.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pamela · Lokalt före/efter-prov' };

export default async function PamelaProofPage({searchParams}: {searchParams?: Promise<{view?: string;seat?:string;side?:string;id?:string;length?:string}>}) {
  const params=await searchParams,view=params?.view;
  if(view==='idle-chain'){
    const {default:Client}=await import('../../src/pamela-idle-chain-review-page.tsx');
    return <Client id={params?.id}/>;
  }
  if(view==='idle-return-overlap'){
    const {default:Client}=await import('../../src/pamela-idle-return-overlap-review-page.tsx');
    return <Client id={params?.id}/>;
  }
  if(view==='mask-correction'){
    const {default:Client}=await import('../../src/pamela-mask-refinement-review-page.tsx');
    return <Client id={params?.id} side={params?.side}/>;
  }
  if(view==='idle-exit'){
    const {default:Client}=await import('../../src/pamela-idle-exit-review-page.tsx');
    return <Client id={params?.id}/>;
  }
  if(view==='shoe-gpu'){
    const {default:Client}=await import('../pamela-shoe-gpu/page.tsx');
    return <Client/>;
  }
  if(view==='two-sided-p1'){
    const e=JSON.parse(await readFile('runs/20261110-pamela-p1-turn-comparison/take-01/evidence.json','utf8')),movie=e.output;
    if(e.sourceProof.sha256!=='ed81117d47658916925ea9832e17e72d9720c6a08532ef0a928fb5b95207d6c9'||e.interval.frames!==87||createHash('sha256').update(await readFile(movie.path)).digest('hex')!==movie.sha256)throw Error('P1 turn comparison changed');
    const {default:Client}=await import('../../src/pamela-sequence-review-client.tsx');
    return <Client proof={{file:movie.path,sha256:movie.sha256,frames:87,fps:30,hasIdle:false,title:'Plats 1 · två vändningar i samma rörelse',intro:'Källrutor 59–145 utan tidsändring. Vänster: neutralt original. Mitten: SG. Höger: blå baksida och elfenbensframsida. Välj 0,25× för den korta baksidespassagen.',landmarks:[{label:'Första kantläget · 83',frame:24},{label:'Baksida · 104',frame:45},{label:'Andra kantläget · 114',frame:55},{label:'Framsida igen · 119',frame:60}],notes:'Framsida → kant → baksida → kant → framsida. Sidnamnen är författade på blank rekvisita. Handmasken bevaras; cirka 1–2 pixlars blandkant och skyddad greppyta återstår vid 115–118.'}}/>;
  }
  if(view==='two-sided-bank'){
    const {default:Client}=await import('../../src/pamela-two-sided-bank-page.tsx');
    return <Client id={params?.id} length={params?.length}/>;
  }
  if(view==='combined-scene'){
    const [{default:Client},{readPamelaCardSceneBank}]=await Promise.all([import('../../src/pamela-card-scene-bank-client.tsx'),import('../../src/pamela-card-scene-bank.ts')]);
    return <Client scenes={await readPamelaCardSceneBank()} initialId={params?.id}/>;
  }
  if(view==='turn-comparison'){
    const registry=JSON.parse(await readFile('references/pamela-card-scenes.json','utf8')),entry=registry.scenes.find((s:{id:string})=>s.id===params?.id);
    if(!entry||!['C2-P2','C2-P3','C2-P5'].includes(entry.id))throw Error('Unknown turn comparison');
    const bytes=await readFile(entry.evidence.path);if(createHash('sha256').update(bytes).digest('hex')!==entry.evidence.sha256)throw Error('Turn evidence changed');
    const e=JSON.parse(bytes.toString()),movie=e.outputs.find((o:{path:string})=>o.path.endsWith('/turn-before-after.mp4'));
    const {validateCardSceneAtlas}=await import('../../src/pamela-card-scene-calibration.ts'),atlasBytes=await readFile(e.manifest.path);if(createHash('sha256').update(atlasBytes).digest('hex')!==e.manifest.sha256)throw Error('Turn atlas changed');
    const calibration=validateCardSceneAtlas(JSON.parse(atlasBytes.toString())),start=calibration.edgeFrame-25,end=calibration.frontFrame+25,frames=end-start+1;
    if(calibration.id!==entry.id||!movie||Number(movie.probe.streams[0].nb_read_frames)!==frames||movie.probe.streams[0].avg_frame_rate!=='30/1'||createHash('sha256').update(await readFile(movie.path)).digest('hex')!==movie.sha256)throw Error('Turn comparison changed');
    const {default:Client}=await import('../../src/pamela-sequence-review-client.tsx');
    return <><a style={{display:'block',padding:20}} href={`/pamela-prov?view=combined-scene&id=${entry.id}`}>← Till plats {calibration.seat} med utbytbara kort och scen</a><Client proof={{file:movie.path,sha256:movie.sha256,frames,fps:30,hasIdle:false,title:`Plats ${calibration.seat} · kortvändning före och efter`,intro:`Samma källrutor ${start}–${end}. Vänster: tidigare framsida genom hela rörelsen. Mitten: SG. Höger: blå baksida och elfenbensframsida. Utsnittet följer kortet.`,landmarks:[{label:`Källruta ${calibration.edgeFrame-7}`,frame:18},{label:`Kantläge ${calibration.edgeFrame}`,frame:25},{label:`Framsida ${calibration.frontFrame}`,frame:calibration.frontFrame-start}],notes:`Två tryckdesigner på den befintliga tagningen. Handmask och sidtiming är kalibrerade för plats ${calibration.seat}. Små motion-blur- och maskkanter återstår.`}}/></>;
  }
  if(view==='idle-scene'){
    const catalog=JSON.parse(await readFile('references/pamela-card-scenes.json','utf8')),bytes=await readFile(catalog.idleScene.path);if(createHash('sha256').update(bytes).digest('hex')!==catalog.idleScene.sha256)throw Error('Idle scene evidence changed');
    const e=JSON.parse(bytes.toString()),row=e.outputs.find((o:{id:string})=>o.id===(params?.id==='one'?'one':'zero')),movie=row.sceneThreeTurns.preview;
    if(e.source.sha256!=='5cc9b0cd7604262a4859140f08bfdb36c96cf51828d7b0caa0cf5fa02248633c'||createHash('sha256').update(await readFile(movie.path)).digest('hex')!==movie.sha256)throw Error('Idle scene changed');
    const {default:Client}=await import('../../src/pamela-sequence-review-client.tsx'),frames=row.id==='zero'?115:196,n=row.id==='zero'?38:65;
    return <><nav style={{display:'flex',gap:18,padding:20}}><a href="/pamela-prov?view=combined-scene">Kortvändning och scenbyten</a><a href="/pamela-prov?view=idle-scene&id=zero">VILA utan blinkning</a><a href="/pamela-prov?view=idle-scene&id=one">VILA med blinkning</a></nav><Client proof={{file:movie.path,sha256:movie.sha256,frames,fps:30,hasIdle:true,title:`VILA · ${row.id==='zero'?'utan':'med'} blinkning · 14 kort kvar`,intro:'Tre varv av ett kort vilofönster ur samma tagning. Pamela, alla källkolumner och 30 fps är bevarade. De fjorton tidigare provkorten ligger kvar på det separata bordet.',landmarks:[{label:'Start',frame:0},{label:'Första skarven',frame:n},{label:'Andra skarven',frame:n*2}],notes:'Lokal B→B-kandidat. Anslutningen till REDO granskas separat och är ännu inte godkänd. Ingen ny generering; originalets fina maskkanter kvarstår.'}}/></>;
  }
  if(view==='idle-return'){
    const selected=JSON.parse(await readFile('references/pamela-rest-ready-review.json','utf8')),bytes=await readFile(selected.entryEvidence.path);if(createHash('sha256').update(bytes).digest('hex')!==selected.entryEvidence.sha256)throw Error('Return evidence changed');
    const e=JSON.parse(bytes.toString()),row=e.outputs.find((o:{id:string})=>o.id===(params?.id==='direct'?'direct-return':'B-prefix-return'));
    if(!row||createHash('sha256').update(await readFile(row.path)).digest('hex')!==row.sha256)throw Error('Return preview changed');
    const {default:Client}=await import('../../src/pamela-sequence-review-client.tsx');
    return <><nav style={{display:'flex',gap:18,padding:20}}><a href="/pamela-prov?view=idle-return&id=direct">Före · direkt skarv</a><a href="/pamela-prov?view=idle-return&id=prefix">Efter · befintlig viloinledning</a><a href="/pamela-prov?view=idle-scene">VILA i scenen</a></nav><Client proof={{file:row.path,sha256:row.sha256,frames:row.frames.length,fps:30,hasIdle:true,title:params?.id==='direct'?'Återgång till VILA · direkt skarv':'Återgång till VILA · befintlig inledning',intro:'Originalrutor vid normal hastighet. Grönt underlag gör ansikte, händer och ljus lättare att jämföra. Ingen övertoning, mellangenerering eller tidsändring.',landmarks:[{label:'Start',frame:0},...row.joins.map((f:number,i:number)=>({label:`Skarv ${i+1}`,frame:f}))],notes:'Granskningskandidat. Den nya inledningen minskar posehoppet men ansiktstextur och skarvhastighet bedöms separat. Ingen runtimeacceptans följer automatiskt av lägre bilddifferens.'}}/></>;
  }
  if(view==='idle-ready'){
    const selected=JSON.parse(await readFile('references/pamela-rest-ready-review.json','utf8')),bytes=await readFile(selected.bridgeSeams.path);if(createHash('sha256').update(bytes).digest('hex')!==selected.bridgeSeams.sha256)throw Error('Bridge seam evidence changed');
    const e=JSON.parse(bytes.toString());if(e.frames.length!==133||e.fps!==30||e.retime||e.blend||e.freeze||createHash('sha256').update(await readFile(e.path)).digest('hex')!==e.sha256)throw Error('Bridge seam preview changed');
    const {default:Client}=await import('../../src/pamela-sequence-review-client.tsx');
    return <><nav style={{display:'flex',gap:18,padding:20}}><a href="/pamela-prov?view=idle-return&id=prefix">Återgång till VILA</a><a href="/pamela-prov?view=idle-scene">VILA med 14 kort</a><a href="/pamela-prov?view=combined-scene">Kortvändning och scenbyten</a></nav><Client proof={{file:e.path,sha256:e.sha256,frames:133,fps:30,hasIdle:true,title:'VILA → REDO · ny rörelsebrygga',intro:'Slutet av VILA, tre sekunders ny rörelse och början av första givningen. Originalgeometri och 30 fps är bevarade. De två skarvarna är markerade.',landmarks:[{label:'Start',frame:0},{label:'In i bryggan',frame:22},{label:'Ut till givningen',frame:112}],notes:'Granskningskandidat. Utgången har kvarvarande skillnader i ansikte, grepp och ljus. Denna brygga är ännu inte aktiverad i hela rundan. Ingen övertoning, frysning eller tidsändring.'}}/></>;
  }
  if(view==='flip'){
    const selected=JSON.parse(await readFile('references/pamela-two-sided-review.json','utf8')),bytes=await readFile(selected.evidence.path);
    if(createHash('sha256').update(bytes).digest('hex')!==selected.evidence.sha256)throw Error('Card flip evidence changed');
    const evidence=JSON.parse(bytes.toString());if(evidence.seatNumber!==4||evidence.cardOrdinal!==2||evidence.source.sha256!=='67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167')throw Error('Flip source identity changed');
    const clips=[];for(const id of ['sg-classic','blue-ivory','sg-ivory','blue-classic','turn-before-after']){
      const item=evidence.outputs.find((o:{path:string})=>o.path.endsWith('/'+id+'.mp4'));
      if(!item||!/^runs\/20261109-pamela-two-sided-flip\/take-\d\d\/render\/[a-z-]+\.mp4$/.test(item.path)||item.probe.streams[0].avg_frame_rate!=='30/1'||Number(item.probe.streams[0].nb_read_frames)!==(id==='turn-before-after'?81:360))throw Error('Invalid flip clip');
      if(createHash('sha256').update(await readFile(item.path)).digest('hex')!==item.sha256)throw Error('Flip clip changed');clips.push({id,file:item.path,sha256:item.sha256});
    }
    const {default:Client}=await import('../../src/pamela-two-sided-review-client.tsx');return <Client clips={clips.filter(c=>c.id!=='turn-before-after')} comparison={clips.find(c=>c.id==='turn-before-after')!} evidence={selected.evidence.path}/>;
  }
  if(view==='modular-scene'){
    const [{default:Client},{default:contract}]=await Promise.all([import('../../src/pamela-modular-stage-client.tsx'),import('../../references/pamela-stage-contract.json')]);
    const bank=await readPamelaBankCatalog(),motion=bank.motions.find(m=>m.sha256==='4e252be2235ce42cec5de9d49b993d0ffed1c029de9890faea6686f46824f87c');
    if(!motion)throw Error('Calibrated P4 motion is missing');
    if(createHash('sha256').update(await readFile(motion.file)).digest('hex')!==motion.sha256)throw Error('Calibrated scene source changed');
    return <Client contract={contract} motion={motion} motionOptions={bank.motions} landedCards={bank.landedCards}/>;
  }
  if(view==='idle-window'){
    let selected;try{selected=JSON.parse(await readFile('references/pamela-idle-window-review.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return <main style={{padding:28}}><h1>VILA-fönstren granskas</h1><a href="/pamela-prov?view=material-round">Visa hela givningsrundan</a></main>;}
    const evidenceBytes=await readFile(selected.evidence.path);
    if(createHash('sha256').update(evidenceBytes).digest('hex')!==selected.evidence.sha256)throw Error('Idle window evidence changed');
    const clip=selected.clips.find((c:{id:string})=>c.id===params?.id)??selected.clips[0];
    if(!clip||!/^runs\/20261109-pamela-idle-window-probe\/take-\d\d\/.*\.mp4$/.test(clip.movie.path)||!Number.isInteger(clip.windowFrames)||clip.windowFrames<1||clip.frames!==clip.windowFrames*3+1||clip.fps!==30)throw Error('Invalid idle window review binding');
    const windowEvidence=JSON.parse(evidenceBytes.toString()).outputs.find((o:{id:string})=>o.id===clip.id);
    if(!windowEvidence||windowEvidence.threeTurns.preview.path!==clip.movie.path||windowEvidence.threeTurns.preview.sha256!==clip.movie.sha256||windowEvidence.threeTurns.frames!==clip.frames||windowEvidence.window.frames!==clip.windowFrames)throw Error('Idle window selection differs from evidence');
    if(createHash('sha256').update(await readFile(clip.movie.path)).digest('hex')!==clip.movie.sha256)throw Error('Idle window movie changed');
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    return <><nav style={{padding:24,display:'flex',gap:24}}>{selected.clips.map((c:{id:string;title:string})=><a key={c.id} href={'/pamela-prov?view=idle-window&id='+encodeURIComponent(c.id)}>{c.title}</a>)}</nav><PamelaSequenceReview proof={{file:clip.movie.path,sha256:clip.movie.sha256,frames:clip.frames,fps:30,hasIdle:false,title:clip.title+' · tre varv',intro:`Ett ${(clip.windowFrames/30).toFixed(2)} sekunders utsnitt ur det nya 12-sekundersoriginalet, upprepat tre gånger. Blinkningar per varv: ${clip.blinksPerCycle}. En extra startruta visar även den tredje skarven.`,landmarks:[{label:'Början',frame:0},{label:'Skarv 1',frame:clip.windowFrames},{label:'Skarv 2',frame:clip.windowFrames*2},{label:'Skarv 3',frame:clip.windowFrames*3}],notes:'Fristående B→B-prov med originalrutor och direkt klippning. Nativebredden är fortfarande 1764 pixlar. Ingen ansiktsbearbetning, toning eller tidsändring. Anslutningen till den andra viloposen A och spelintegration är ännu inte godkända.'}}/></>;
  }
  if(view==='idle-anchor'){
    const id=params?.id==='02'?'02':'01',run='runs/20261109-pamela-idle-anchor-pilot/run-01';
    const planBytes=await readFile(run+'/plan.json');
    if(createHash('sha256').update(planBytes).digest('hex')!=='8f17ca0bed015202ed22cf1d24424d8658159d6dc8961bbc5049e372a1d287ae')throw Error('Idle pilot plan changed');
    const state=JSON.parse(await readFile(`${run}/jobs/${id}.state.json`,'utf8'));
    const nav=<nav style={{padding:24,display:'flex',gap:24,flexWrap:'wrap'}}><a href="/pamela-prov?view=idle-anchor&id=01">Ny VILA-övergång</a><a href="/pamela-prov?view=idle-anchor&id=02">Ny vilovariant</a><a href="/pamela-prov?view=material-bank">Alla 14 givningar</a></nav>;
    const rawRequested=params?.side==='raw';
    if(!state.output||(!state.nativePassed&&!rawRequested))return <>{nav}<main style={{padding:28}}><h1>VILA-provet förbereds</h1><p>{state.state==='PREPARED_NOT_SUBMITTED'?'Den andra filmen körs efter granskning av den första.':'Filmen visas när originalet är färdigt och formatkontrollerat.'}</p>{state.output&&!state.nativePassed?<p><a href={`/pamela-prov?view=idle-anchor&id=${id}&side=raw`}>Granska originalets formatavvikelse</a></p>:null}<PamelaMaterialProgressRefresh/></main></>;
    if(state.output.path!==`${run}/original/pamela-${id}-wan3.mp4`)throw Error('Unexpected idle pilot output');
    const bytes=await readFile(state.output.path),verificationBytes=await readFile(state.nativeVerification.path);
    if(createHash('sha256').update(bytes).digest('hex')!==state.output.sha256||createHash('sha256').update(verificationBytes).digest('hex')!==state.nativeVerification.sha256)throw Error('Idle pilot file changed');
    const verified=JSON.parse(verificationBytes.toString());
    const widthMismatch=rawRequested&&!verified.passed&&verified.expected.width===1762&&verified.observed.width===1764&&verified.observed.height===1174&&verified.observed.audioStreams===0;
    if((!verified.passed&&!widthMismatch)||verified.taskId!==state.taskId||verified.output.sha256!==state.output.sha256||verified.observed.frames!==360||verified.observed.averageFrameRate!=='30/1')throw Error('Idle pilot format is not verified for this review');
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    return <>{nav}{widthMismatch?<p style={{padding:'0 28px',color:'#f0c77d'}}>Formatgranskning: originalet är 1764 × 1174, två kolumner bredare än ankaret. Integrationen är spärrad; filmen visas i sitt oförändrade originalformat.</p>:null}<PamelaSequenceReview proof={{file:state.output.path,sha256:state.output.sha256,frames:360,fps:30,hasIdle:true,title:id==='01'?'Ny VILA-övergång · 12 sekunder':'Ny vilovariant · 12 sekunder',intro:id==='01'?'Från slutet av återgången till den gemensamma viloposen inför nästa givning.':'Ett sammanhängande viloprov med samma målbild vid början och slutet.',landmarks:[{label:'Början',frame:0},{label:'Efter 1 s',frame:30},{label:'Mitten',frame:180},{label:'Före slut',frame:330},{label:'Sista rutan',frame:359}],notes:'Grönt arbetsoriginal för kontroll av ansikte, händer och vilopos. Sömlöshet bedöms mot båda intilliggande klippen; formatkontrollen är ingen visuell slutacceptans.'}}/></>;
  }
  if(view==='material-bank'||view==='material-clip'||view==='material-round'){
    const registry=JSON.parse(await readFile('references/pamela-material-selections.json','utf8'));
    const selected=registry.entries.filter((e:{status:string})=>e.status==='integration-candidate');
    let full=null;try{const selectedBank=JSON.parse(await readFile('references/pamela-material-bank.json','utf8')),bytes=await readFile(selectedBank.evidence.path);if(createHash('sha256').update(bytes).digest('hex')!==selectedBank.evidence.sha256)throw Error('Selected material bank changed');full=JSON.parse(bytes.toString());if(full.verification.trimmedFrames!==4404||full.verification.distinctMaterials!==14||full.parts.length!==14)throw Error('Incomplete material bank');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    let renderedParts:any[]=full?.parts??[];
    if(!full)try{
      const pointer=JSON.parse(await readFile('references/pamela-material-render.json','utf8')),bytes=await readFile(pointer.plan.path);
      if(createHash('sha256').update(bytes).digest('hex')!==pointer.plan.sha256)throw Error('Active material plan changed');
      const plan=JSON.parse(bytes.toString());if(plan.project!=='snyggare-dealer'||plan.dealerId!=='pamela'||!/^runs\/20261109-pamela-material-bank\/take-\d\d$/.test(plan.run))throw Error('Unexpected active material plan');
      renderedParts=(await Promise.all(selected.map(async(entry:any)=>{try{const p=JSON.parse(await readFile(plan.run+'/'+entry.id+'.json','utf8'));if(p.records.length!==360||p.selection.evidence.sha256!==entry.evidence.sha256||(p.selection.canonicalUvQuarterTurns??0)!==(entry.canonicalUvQuarterTurns??0))return null;return{id:entry.id,output:p.output};}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}}))).filter(Boolean);
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(view==='material-round'){
      if(!full)return <main style={{padding:28}}><h1>Hela materialrundan sammanfogas</h1><a href="/pamela-prov?view=material-bank">Visa de separata filmerna</a></main>;
      const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
      const uncut=params?.length==='full',movie=uncut?full.full:full.compact,frames=uncut?5486:4404;
      const landmarks=[{label:'VILA',frame:0},{label:'Till REDO',frame:135},{label:'Första givningen',frame:222},{label:'Till VILA',frame:uncut?5262:4180},{label:'Alla 14 ligger kvar',frame:uncut?5351:4269}];
      return <><p style={{padding:'12px 28px'}}><a href="/pamela-prov?view=material-bank">Alla klipp</a> · <a href="/pamela-prov?view=material-round">Kortare pauser · 146,8 s</a> · <a href="/pamela-prov?view=material-round&length=full">Alla ändhållningar · 182,87 s</a></p><PamelaSequenceReview proof={{file:movie.path,sha256:movie.sha256,frames,fps:30,hasIdle:true,title:'Hela rundan · två kort till alla sju',intro:uncut?'Alla 14 tolvssekundersklipp med hela ändhållningar, plus VILA och övergångar. Två olika provtryck per plats ligger kvar genom hela rundan.':'14 separata 12-sekunderskällor är klippta vid ändhållningarna. Rörelsen spelas i normal hastighet. Två olika provtryck per plats ligger kvar genom hela rundan.',landmarks,notes:'Sammanfogad granskningskandidat. Små maskkanter och posehopp återstår. Provtrycken är presentation, inga spelresultat. Mörk baksida och fysisk kortvändning är inte slutgodkända.'}}/></>;
    }
    if(view==='material-clip'){
      const entry=selected.find((e:{id:string})=>e.id===params?.id);
      if(!entry)return <main style={{padding:28}}><h1>Detta kortspår granskas fortfarande</h1><a href="/pamela-prov?view=material-bank">Visa alla platser</a></main>;
      const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx'),e=JSON.parse(await readFile(entry.evidence.path,'utf8')),part=renderedParts.find((p:{id:string})=>p.id===entry.id),movie=part?.output??(entry.kind==='c2'?e.movies[0]:e.outputs.find((m:{path:string})=>m.path.endsWith('.mp4')));
      if((e.records??e.frames).length!==360)throw Error('Incomplete selected material clip');
      return <><a style={{display:'block',padding:20,color:'#b8d7c3'}} href="/pamela-prov?view=material-bank">← Alla kortspår</a><PamelaSequenceReview proof={{file:movie.path,sha256:movie.sha256,frames:360,fps:30,hasIdle:false,title:`${entry.id.startsWith('C1')?'Första':'Andra'} kortet · plats ${entry.id.at(-1)}`,intro:part?'Hela 12-sekundersklippet i den separata scenen, med samma korttryck och riktning som i hela rundan. Tidigare kort ligger kvar på bordet.':'Råprov före scenintegrationen. Den gröna bakgrunden visar källans konturer; P1–P3 får korrigerad tryckriktning i den sammanfogade filmen.',landmarks:[{label:'REDO',frame:0},{label:'Ur skon',frame:60},{label:'Vridning',frame:100},{label:'6 sekunder',frame:180},{label:'8 sekunder',frame:240},{label:'REDO igen',frame:350}],notes:'Granskad integrationskandidat. Små vita/blur-kanter finns kvar. Vita framsidesmaterial är demonstrationen; detta innebär inte att en mörk baksida eller fysisk kortvändning är slutgodkänd.'}}/></>;
    }

    const link=(id:string)=>{const entry=registry.entries.find((e:{id:string})=>e.id===id);return entry.status==='integration-candidate'?<a href={`/pamela-prov?view=material-clip&id=${id}`}>{renderedParts.some((p:{id:string})=>p.id===id)?'Spela färdigt scenklipp · 12 s':'Visa råprov · 12 s'}</a>:<span>Granskas</span>;};
    return <main style={{maxWidth:1080,margin:'0 auto',padding:28,color:'#e7eee9'}}><a href="/pamela-prov?view=fourteen-tempo">Hela rörelseprovet</a><h1>Kortfilmer · alla sju platser</h1><p>{selected.length} av 14 kortspår har granskade integrationskandidater. Alla 14 råfilmer är färdiga. Trycket följer pappret; fina kantfel och skarvar bedöms separat.</p>{selected.filter((e:{previewOnly?:boolean})=>e.previewOnly).map((e:{id:string;limitation:string})=><p key={e.id} style={{color:"#f0c77d"}}><strong>Begränsat prov · {e.id}:</strong> {e.limitation}</p>)}{full?<><h2>Hela rundan med korttryck</h2><p><a href="/pamela-prov?view=material-round">Öppna hela filmen med uppspelning och rutsteg</a></p><video style={{width:'100%'}} src={'/files/'+full.compact.path} controls muted playsInline preload="metadata"/><p><a href={'/files/'+full.compact.path} download>Ladda ned hela rundan · 146,8 s</a></p><p>Sammanfogad kandidat. Mask-, pose- och sidväxlingsbegränsningar finns kvar.</p></>:<><p><strong>{renderedParts.length} av 14 scenklipp är exporterade.</strong> Hela rundan exporteras och granskas innan den visas här.</p><PamelaMaterialProgressRefresh/></>}<table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><thead><tr><th>Plats</th><th>Första kortet</th><th>Andra kortet</th></tr></thead><tbody>{[1,2,3,4,5,6,7].map(seat=><tr key={seat}><td style={{padding:'18px 0'}}>Plats {seat}</td><td>{link(`C1-P${seat}`)}</td><td>{link(`C2-P${seat}`)}</td></tr>)}</tbody></table><p><a href="/pamela-prov?view=materials-motion">Sista givningen med alla 14 kort i scenen</a> · <a href="/pamela-prov?view=scene-motion">Interaktiv scen</a></p></main>;
  }
  if(view==='materials-motion'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    let e;try{e=JSON.parse(await readFile('runs/20261109-pamela-textured-c2-scene/take-01/evidence.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return <main style={{padding:28}}><h1>Rörliga kortmaterial sammanfogas</h1><a href="/pamela-prov?view=fourteen-tempo">Visa hela grundrundan</a></main>;}
    if(e.verification.frames!==360||e.verification.independentMaterials!==14||e.verification.priorCardCoreChanged!==0||e.verification.protectedChanges!==0)throw Error('Invalid moving material integration');
    return <PamelaSequenceReview proof={{file:e.output.path,sha256:e.output.sha256,frames:360,fps:30,hasIdle:false,title:'14 kort i scenen · sista givningen',intro:'Plats 7 får sitt andra kort med två separata provtryck. Tolv tidigare kort ligger kvar på de andra platserna. Här är rörliga kortmaterial och den korrigerade pappersmasken sammanfogade med Pamela, bord och bakgrund.',landmarks:[{label:'REDO',frame:0},{label:'Ur skon',frame:60},{label:'Vridning',frame:90},{label:'Kontakt',frame:180},{label:'Släppt',frame:206},{label:'Alla 14 kort',frame:350}],notes:'Detta är hela sista 12-sekundershandlingen, inte hela rundans fjorton rörliga materialspår. Framsidorna är valda för demonstrationen; fysisk fram/baksidesväxling återstår. Finger-/papperskanter och den allmänna grönmasken är fortsatt kandidater.'}}/>;
  }
  if(view==='fourteen-tempo'||view==='fourteen-seams'||view==='fourteen-outer'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    const e=JSON.parse(await readFile('runs/20261109-pamela-fourteen-trim/take-01/evidence.json','utf8'));
    if(e.outputFrames!==4404||e.decodedPixelEquality.changedFrames!==0||e.sources.full.sha256!=='04e87ed67176399567136ab36ac289fbf3042e131fc0d8a823dc829a2630dd4c')throw Error('Invalid fourteen-trim evidence');
    const comparison=view!=='fourteen-tempo',outer=view==='fourteen-outer',movie=comparison?e.comparisons[outer?1:0]:e.selectedPreview;
    let cursor=222;const nodes=e.intervals.map((s:{id:string;startInclusive:number;endExclusive:number})=>{const p={label:s.id.replace('C1-','Första · ').replace('C2-','Andra · '),frame:cursor};cursor+=s.endExclusive-s.startInclusive;return p;});
    return <PamelaSequenceReview proof={{file:movie.path,sha256:movie.sha256,frames:comparison?(outer?240:780):4404,fps:30,hasIdle:!comparison,title:comparison?(outer?'VILA och REDO · fyra yttre skarvar':'Hela rundan · tretton skarvar före och efter'):'Hela rundan · 14 kort med kortare pauser',intro:comparison?'Vänster: råkedjans klippunkt. Höger: valda originalrutor med bättre matchad pose. Två sekunder per skarv.':'182,87 → 146,80 sekunder: alla fjorton utdelningar, två kort per plats och slutvilan är kvar. Stilla ändhållningar har klippts bort på hela rutor; rörelsehastigheten är oförändrad.',landmarks:comparison?Array.from({length:outer?4:13},(_,i)=>({label:`Skarv ${i+1}`,frame:i*60})):[{label:'VILA',frame:0},...nodes,{label:'Till VILA',frame:cursor},{label:'Slutvila',frame:4269}],notes:'Förlustfri master: 4404 rutor exakt matchade mot källkedjan. Visningsfilmen är komprimerad. Små ansiktslägeshopp återstår, särskilt sista bryggan till VILA. Det dokumenterade maskhålet på plats 3 finns kvar vid 101,6 s i denna frysta grundfilm; en separat pappersmaskkorrigering är under integration. Korttrycken läggs in i nästa steg.'}}/>;
  }
  if(view==='edge-print'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    const seat=params?.seat==='7'?7:1,choice=params?.side==='front'?0:params?.side==='back'?1:2;
    const take=seat===7?'take-03':'take-02';
    let e;try{e=JSON.parse(await readFile(`runs/20261109-pamela-edge-card-track/${take}/p${seat}/evidence.json`,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return <main style={{padding:28}}><h1>Plats {seat} · nytt kortspår exporteras</h1><a href="/pamela-prov?view=fourteen">Visa hela grundrundan</a></main>;}
    const movie=e.outputs[choice];if(e.verification.sourceRgbEqual!==360||e.verification.changedOutsideSupportPixels!==0||+movie.probe.streams[0].nb_read_frames!==360)throw Error('Invalid edge-seat study');
    return <><nav style={{padding:20,background:'#142019',display:'flex',gap:24,flexWrap:'wrap'}}>{[1,7].map(s=><a key={s} style={{color:'#bfd8c7'}} href={`/pamela-prov?view=edge-print&seat=${s}`}>Plats {s} · jämförelse</a>)}<a style={{color:'#bfd8c7'}} href={`/pamela-prov?view=edge-print&seat=${seat}&side=front`}>Framsida</a><a style={{color:'#bfd8c7'}} href={`/pamela-prov?view=edge-print&seat=${seat}&side=back`}>SG-baksida</a></nav><PamelaSequenceReview proof={{file:movie.path,sha256:movie.sha256,frames:360,fps:30,hasIdle:false,title:`Plats ${seat} · ${choice===2?'kortspår före och efter':choice===1?'SG-baksida':'separat framsida'}`,intro:choice===2?'Vänster: råfilm. Mitten: tidigare mask och hörnspår. Höger: den nya kandidaten. Samma provtryck och bildrutor används i jämförelsen.':'Hela 12-sekundersfilmen med ett separat provmaterial. Papper, händer och skugga kommer från originalet.',landmarks:[{label:'Början',frame:0},{label:'Ur skon',frame:65},{label:'Vridning',frame:95},{label:'96',frame:96},{label:'97',frame:97},{label:'Hand över kort',frame:174},{label:'Skugga · 184',frame:184},{label:'Släppt',frame:seat===1?194:188},{label:'REDO',frame:300}],notes:seat===7?'Den varma skuggan i ruta 174–187 skiljs från handen så att trycket kan ligga kvar. Detta är en ny kandidat; framsida och baksida är alternativa material, inte en fastställd fysisk sidväxling. Jämförelsen använder samma renderer med gammal respektive ny mask.':'Hörnspåret är tidsfiltrerat genom förflyttningen för att minska tryckets hopp vid 96→97. Böjning från observerade kortkanter behålls. Materialens fysiska sida är inte fastställd; ljusa kontaktränder återstår att granska.'}}/></>;
  }
  if(view==='tempo-current'||view==='seams-current'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    const e=JSON.parse(await readFile('runs/20261109-pamela-bank-trim/take-02/evidence.json','utf8')),comparison=view==='seams-current',movie=comparison?e.comparison:e.selectedPreview;
    if(e.selectedFrames!==2405||e.decodedFrameEquality.changedFrames!==0||e.sources.bank.sha256!=='d2cffa713d37546088950f07a2cc4e0ef9c44f396bac8b12eec235020b307b16')throw Error('Unexpected selected trim proof');
    let cursor=222;const seats=e.intervals.map((s:{seat:number;startInclusive:number;endExclusive:number})=>{const point={label:`Plats ${s.seat}`,frame:cursor};cursor+=s.endExclusive-s.startInclusive;return point;});
    return <PamelaSequenceReview proof={{file:movie.path,sha256:movie.sha256,frames:comparison?360:2405,fps:30,hasIdle:!comparison,title:comparison?'Sex REDO-skarvar · före och efter':'Sju platser · kortare REDO-pauser',intro:comparison?'Vänster: klipp mellan råfilmernas yttersta rutor. Höger: valda originalrutor med bättre matchad pose. Varje tvåsekundersdel visar en skarv.':'Första givningen inklusive VILA: 98,87 → 80,17 sekunder. Originalhastigheten är kvar; 18,7 sekunder ändhållningar har klippts bort.',landmarks:comparison?e.comparison.seams.map((s:{fromSeat:number;toSeat:number;outputStart:number})=>({label:`Plats ${s.fromSeat} → ${s.toSeat}`,frame:s.outputStart})):[{label:'VILA',frame:0},...seats,{label:'Till VILA',frame:cursor}],notes:'Detta gäller första givningen och nya plats 1, inte hela 14-kortsrundan. Små ansiktslägeshopp återstår. Ingen övertoning är vald. Den förlustfria mastern har 2405 exakt källmatchade rutor; denna mindre visningsfilm är komprimerad.'}}/>;
  }
  if(view==='materials'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    const e=JSON.parse(await readFile('runs/20261109-pamela-fourteen-material-table/take-01/evidence.json','utf8'));
    if(e.verification.independentMaterials!==14||e.verification.outsideInkChanged!==0||+e.output.probe.streams[0].nb_read_frames!==135)throw Error('Invalid fourteen-material proof');
    return <PamelaSequenceReview proof={{file:e.output.path,sha256:e.output.sha256,frames:135,fps:30,hasIdle:false,title:'14 separata korttryck · slutvila',intro:'Två olika provtryck per plats, med separata övre och undre kortytor. Papperskonturer, ljus och den lilla skuggan mellan korten kommer från samma original.',landmarks:[{label:'Början',frame:0},{label:'Mitten',frame:67},{label:'Slutet',frame:134}],notes:'Detta 4,5-sekundersprov gäller slutvilan. Värdena är författade exempel, inga spelresultat. Trycken är ännu inte införda genom hela utdelningsrörelsen. 135 rutor matchar den vita basfilmen utanför trycket; ingen överlappning med Pamela.'}}/>;
  }
  if(view==='fourteen'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    let e;try{e=JSON.parse(await readFile('runs/20261109-pamela-fourteen-full-loop/take-01/evidence.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return <main style={{padding:28,background:'#142019',color:'white'}}><h1>Rundan med 14 kort sammanfogas</h1><p>Alla 14 råklipp är klara. Den kompletta filmen visas här när export och kontroll är färdiga.</p><a style={{color:'#bfd8c7'}} href="/pamela-prov?view=c2-bank">Granska andrakortsklippen under tiden</a></main>;}
    if(+e.output.probe.streams[0].nb_read_frames!==5486||e.output.probe.streams[0].avg_frame_rate!=='30/1')throw Error('Unexpected fourteen-card proof timing');
    return <PamelaSequenceReview proof={{file:e.output.path,sha256:e.output.sha256,frames:5486,fps:30,hasIdle:true,title:'Hela rundan · två kort till alla sju',intro:'VILA → REDO → första kortet till plats 1–7 → andra kortet till plats 1–7 → VILA. Alla fjorton källklipp är 12 sekunder långa och originalpauserna är kvar.',landmarks:[{label:'VILA',frame:0},{label:'Till REDO',frame:135},...Array.from({length:14},(_,i)=>({label:`${i<7?'Första':'Andra'} · plats ${i%7+1}`,frame:222+i*360})),{label:'Till VILA · 14 kort kvar',frame:5262},{label:'Slutvila · 14 kort kvar',frame:5351}],notes:'Sammanhängande rörelseprov, 182,87 s. De tidigare korten bevaras under följande utdelningar och slutvilan. Vita råytor, varierande timing, grönmask och direkta REDO-skarvar återstår att färdigställa. Två synliga konturer per plats innebär ännu inte två färdiga kortmaterial. Filmen återställs inte automatiskt till ett tomt bord.'}}/>;
  }
  if(view==='p1-print'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    const e=JSON.parse(await readFile('runs/20261109-pamela-seat1-symmetric-card-track/take-01/selected-pass.json','utf8')),back=params?.side==='back',m=e.movies[back?1:0];
    if(e.source.sha256!=='8402ddfcaabf1356b25b28fc8e7e3ca59121260eee6b188b7bfed431b2af9307'||+m.probe.streams[0].nb_read_frames!==360)throw Error('P1 artwork source mismatch');
    return <><nav style={{padding:20,background:'#142019',display:'flex',gap:24}}><a style={{color:'#bfd8c7'}} href="/pamela-prov?view=p1-print">3♥ · framsidesprov</a><a style={{color:'#bfd8c7'}} href="/pamela-prov?view=p1-print&side=back">SG · baksidesprov</a></nav><PamelaSequenceReview proof={{file:m.path,sha256:m.sha256,frames:360,fps:30,hasIdle:false,title:`Nya plats 1 · ${back?'SG-baksida':'3♥'}`,intro:'Ett valt provtryck följer den nya kortytan under hela 12-sekundersfilmen. Framsida och baksida är alternativa materialprov; filmens fysiska kortsida är inte fastställd.',landmarks:[{label:'Start',frame:0},{label:'Utdrag · 65',frame:65},{label:'Grepp · 85',frame:85},{label:'Före riskrutan · 96',frame:96},{label:'Efter riskrutan · 97',frame:97},{label:'Framför handen · 105',frame:105},{label:'Släpp · 194',frame:194},{label:'REDO · 270',frame:270}],notes:'360 källrutor och 1800 enkanalsmasker kontrollerade; skyddade originalpixlar är oförändrade. Ljus fingerrand och osäker tryckriktning vid 96→97 återstår. Detta är inte en godkänd fysisk sidväxling eller färdig spelhandling.'}}/></>;
  }
  if(view==='c2-bank'){
    const {readPamelaC2Catalog}=await import('../../src/pamela-c2-bank-catalog.ts');
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    const candidates=await readPamelaC2Catalog(),seat=Number(params?.seat??1),selected=candidates.find(c=>c.seat===seat)??candidates[0];
    return <><nav style={{padding:20,background:'#142019',color:'white',display:'flex',gap:24,flexWrap:'wrap'}}>{candidates.map(c=><a key={c.seat} style={{color:'#bfd8c7'}} href={'/pamela-prov?view=c2-bank&seat='+c.seat}>Plats {c.seat} · {c.status==='raw-candidate'?'råfilm klar':'under arbete'}</a>)}</nav>{selected.source?<PamelaSequenceReview proof={{file:selected.source.path,sha256:selected.source.sha256,frames:360,fps:30,hasIdle:false,title:`Andra kortet · plats ${selected.seat}`,intro:'Ett nytt 12-sekunders API-original. Första kortet ligger redan på bordet; Pamela lägger nästa kort och återvänder tomhänt till REDO.',landmarks:[{label:'Start med C1',frame:0},{label:'Kontakt',frame:selected.contactFrame!},{label:'Fri hand',frame:selected.clearHandFrame!},{label:'Tillbaka i REDO',frame:selected.redoFrame!},{label:'Två kort kvar',frame:350}],notes:'Rå rörelsekandidat. Korttryck, skarvar och separata hand- och kortmasker återstår. Två vita konturer är inte bevis för två färdiga, utbytbara kortlager.'}}/>:<main style={{padding:28,background:'#142019',color:'white'}}>Andrakortsklippet för plats {selected.seat} är ännu inte färdiggranskat. <a style={{color:'#bfd8c7'}} href="/pamela-prov?view=round">Visa första givningen till alla sju.</a></main>}</>;
  }
  if(view==='symmetry'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    const e=JSON.parse(await readFile('runs/20261109-pamela-seat1-symmetry-comparison/take-01/evidence.json','utf8'));
    if(Number(e.output.probe.streams[0].nb_read_frames)!==360||e.output.probe.streams[0].avg_frame_rate!=='30/1')throw Error('Unexpected symmetry proof timing');
    return <PamelaSequenceReview proof={{file:e.output.path,sha256:e.output.sha256,frames:360,fps:30,hasIdle:false,title:'Plats 1 · tydligare före och efter',intro:'Vänster: det tidigare stora och avlånga kortet. Höger: ny 12-sekunders tagning med kortstorlek och landning matchade mot plats 7.',landmarks:[{label:'Start',frame:0},{label:'Nedsläpp',frame:190},{label:'Fri hand',frame:194},{label:'Jämför korten',frame:350}],notes:'Två olika genererade tagningar, med samma scen och originalhastighet. Skillnaden gäller kortets form, storlek och placering; även Pamelas rörelse skiljer sig. Fysisk kalibrering, korttryck, maskkanter och slutliga skarvar återstår.'}}/>;
  }
  if(view==='c2-sequence'||view==='seam'||view==='pair'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    if(view==='pair'){
      const r=JSON.parse(await readFile('runs/20261109-pamela-seat7-card-pair/take-03/review.json','utf8'));
      const m=r.movies.find((m:{path:string})=>m.path.endsWith('seat7-one-versus-pair-native-roi.mp4'));
      if(!m)throw Error('Missing pair comparison');
      return <PamelaSequenceReview proof={{file:m.path,sha256:m.sha256,frames:131,fps:30,hasIdle:false,title:'Ett kort → två under vridningen',intro:'Plats 7: vänster visar ett kort, höger visar två separata kortytor. Förskjutningen sker när kortet nästan är kantställt.',landmarks:[{label:'Före vridningen',frame:0},{label:'Tunnaste läget · 95',frame:15},{label:'Kontakt · 150',frame:70},{label:'Släpp · 188',frame:108},{label:'Fri hand · 210',frame:130}],notes:'Nytt täckningsprov: de uppmätta rosa fläckarna i pappersskuggan är borta. En fin ojämn kontaktrand återstår, och handskyddet döljer delar av trycket under lyftet. Kortytan är låst efter ruta 188; skyddade originalpixlar är oförändrade. Inte slutgodkänt.'}}/>;
    }
    const isC2=view==='c2-sequence';
    const e=JSON.parse(await readFile(isC2?'runs/20261109-pamela-c2-sequence/take-01/evidence.json':'runs/20261109-pamela-matched-redo/take-01/evidence.json','utf8'));
    const expected=isC2?720:90;
    if(Number(e.output.probe.streams[0].nb_read_frames)!==expected||e.output.probe.streams[0].avg_frame_rate!=='30/1')throw Error('Unexpected study timing');
    return <PamelaSequenceReview proof={{file:e.output.path,sha256:e.output.sha256,frames:expected,fps:30,hasIdle:false,title:isC2?'Två 12-sekundersfilmer · en skarv':'REDO-skarv · före och efter',intro:isC2?'Tidigare plats 1: första kortet → REDO → andra kortet → REDO. Två kompletta tagningar på samma bord, med en enda skarv vid 12 sekunder. Den gamla större kortgeometrin är kvar i detta strukturprov.':'Vänster: tidigare klipp. Mitten: bättre matchade poser. Höger: samma matchning med fyra rutors övertoning.',landmarks:isC2?[{label:'Första givningen',frame:0},{label:'Före skarven',frame:359},{label:'Efter skarven',frame:360},{label:'Andra kortets kontakt',frame:558},{label:'Andra släppet',frame:574},{label:'Två kort i REDO',frame:630}]:[{label:'Start',frame:0},{label:'Före skarven',frame:42},{label:'Skarv · 1,5 s',frame:45},{label:'Efter skarven',frame:48}],notes:isC2?'Detta provar strukturen med två tagningar. Kortens mått, tryck, maskkanter och skarvens utseende återstår; inga kortvärden eller spelregler är inbyggda.':'Skarven ligger vid 1,5 sekunder och gäller den tidigare plats 1-tagningen. Bättre pose minskar ansiktshoppet; fyra rutors övertoning mjukar upp det ytterligare. Kortlagret ligger kvar oförändrat. Nya kedjan har inte denna skarv.'}}/>;
  }
  if(view==='c2'||view==='tempo'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    if(view==='c2'){
      const r=JSON.parse(await readFile('runs/20261109-pamela-seat-bank/c2/seat-1-c2-feasibility-v1/qa/seat-1/review.json','utf8'));
      return <PamelaSequenceReview proof={{file:r.source,sha256:r.sourceSha256,frames:360,fps:30,hasIdle:false,title:'Ett andra kort till plats 1',intro:'Tidigare plats 1, före symmetriomtaget: ett 12-sekunders API-prov där första kortet ligger kvar medan Pamela lägger ett andra kort och återvänder tomhänt.',landmarks:[{label:'REDO med första kortet',frame:0},{label:'Nytt kort',frame:90},{label:'Kontakt',frame:198},{label:'Fri hand',frame:214},{label:'Tillbaka i REDO',frame:270}],notes:'Rörelsen fungerar som referens. Kortmått, tryck, maskkanter och slutlig skarv är ännu inte godkända. Detta är ett separat andrakortsprov, inte en beställd hel bank.'}}/>;
    }
    const e=JSON.parse(await readFile('runs/20261109-pamela-bank-trim/take-01/evidence.json','utf8')),p=JSON.parse(await readFile('runs/20261109-pamela-bank-trim/take-01/plan.json','utf8'));
    return <PamelaSequenceReview proof={{file:e.output.path,sha256:e.output.sha256,frames:2148,fps:30,hasIdle:true,title:'Hela kedjan med kortare REDO-pauser',intro:'Tidigare sjugivning före plats 1-omtaget: 71,60 sekunder, 27,27 sekunder kortare genom att klippa stilla ändhållningar. Rörelserna har samma hastighet.',landmarks:p.segments.map((s:{id:string;outputStart:number})=>({label:s.id.startsWith('seat-')?'Plats '+s.id.slice(5):s.id==='opening-vila'?'VILA':s.id==='closing-vila'?'Slutvila':s.id==='to-redo'?'Till REDO':'Till VILA',frame:s.outputStart})),notes:'Tempokandidat: hela kortdrag, släpp och tom återgång är bevarade. Plats 1 → 2 har ett tydligt ansiktshopp vid 12,43 s; matchande REDO-poser granskas separat. Kortmått och grönmask återstår.'}}/>;
  }
  if(view==='round'){
    const {default: PamelaSequenceReview}=await import('../../src/pamela-sequence-review-client.tsx');
    let evidence,hasIdle=false;
    try{evidence=JSON.parse(await readFile('runs/20261109-pamela-full-loop/take-02/evidence.json','utf8'));hasIdle=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;evidence=JSON.parse(await readFile('runs/20261109-pamela-bank-sequence/take-03/evidence.json','utf8'));}
    const frames=Number(evidence.output.probe.streams[0].nb_read_frames),fps=30;
    if(frames!==(hasIdle?2966:2520)||evidence.output.probe.streams[0].avg_frame_rate!=='30/1')throw Error('Unexpected round proof timing');
    return <PamelaSequenceReview proof={{file:evidence.output.path,sha256:evidence.output.sha256,frames,fps,hasIdle,intro:'Ny grundkedja med omgjord plats 1: kortstorleken matchar nu bättre mot övriga platser. Alla sju kort ligger kvar när Pamela återgår till VILA.',notes:'Granskningsprov med originalens pauser. Korttryck, grönmask och skarvar är ännu inte slutgodkända. Andra kortet till varje plats byggs separat; detta är första givningen.'}}/>;
  }
  if (view === 'idle-candidates') {
    const {default: PamelaIdleCandidates}=await import('../../src/pamela-idle-candidates-client.tsx');
    const report=JSON.parse(await readFile('runs/20261109-pamela-idle-loop-fit/review.json','utf8'));
    return <PamelaIdleCandidates candidates={report.candidates}/>;
  }
  if (view === 'scene-motion') {
    const [{default: PamelaStageClient},{default: contract},{default: motion}]=await Promise.all([import('../../src/pamela-stage-client.tsx'),import('../../references/pamela-stage-contract.json'),import('../../references/pamela-stage-motion.json')]);
    const bank=await readPamelaBankCatalog();
    return <PamelaStageClient contract={contract} motion={motion} motionOptions={bank.motions} landedCards={bank.landedCards}/>;
  }
  if (view === 'scene') {
    const {default: PamelaStagePage} = await import('../pamela-scen/page.tsx');
    return <PamelaStagePage />;
  }
  if (view === 'motion') {
    const contract=JSON.parse(await readFile(path.join(process.cwd(),'references/pamela-motion-contract.json'),'utf8')) as MotionContract;
    const errors=validateMotionContract(contract);
    if(errors.length)throw Error('Motion contract invalid: '+errors.join('; '));
    return <PamelaMotionLab contract={contract}/>;
  }
  let report: PamelaProofReport | null = null;
  try {
    report = JSON.parse(await readFile(path.join(process.cwd(), 'runs/20261109-pamela-local-release-proof/report.json'), 'utf8')) as PamelaProofReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (report) {
    const {seats}=await readPamelaBankCatalog();
    report.seatPilot = {seats,budgetNote:'Första piloten: 12 sekunder per råtagning. Jakob har utökat Runway-ramen till tillgängliga cirka 7 000 krediter; nya prov görs stegvis med separat kostnadsjournal och granskning före större serier.'};
    report.shadowCandidate = {image:'runs/20261109-pamela-shadow-v7/take-01/qa/contact-sheet-1x.png',description:'Mitten visar en liten skugga från överkortet enbart på underkortet. Ingen ny skugga läggs vid första kortets ytterkant. Detta är ett separat bildprov; filmerna ovan visar fortfarande V6.'};
  }
  return <PamelaProofClient report={report} />;
}

