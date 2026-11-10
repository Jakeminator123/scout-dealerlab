'use client';
import {useState,type ComponentProps} from 'react';
import PamelaCombinedStage from './pamela-combined-stage-client.tsx';
type Scene=ComponentProps<typeof PamelaCombinedStage>&{id:string;label:string};
export default function PamelaCardSceneBank({scenes,initialId}:{scenes:Scene[];initialId?:string}){
 const [id,setId]=useState(initialId&&scenes.some(s=>s.id===initialId)?initialId:scenes[0].id),scene=scenes.find(s=>s.id===id)!;
 return <><nav style={{background:'#20372b',color:'#e4eee6',padding:'12px max(20px,calc((100vw - 1500px)/2))',font:'15px system-ui'}}><label>Tagning och plats <select aria-label="Tagning och plats" style={{marginLeft:14,padding:8,background:'#2b4032',color:'#edf4ee',border:'1px solid #728574',borderRadius:6}} value={id} onChange={e=>setId(e.target.value)}>{scenes.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label><span style={{marginLeft:18,fontSize:12}}>{scenes.length} källbundna kortvändningsprov · egna masker per tagning</span><a style={{marginLeft:18,color:"#c4dcc9"}} href={scene.publicMode?"/pamela-idle-scene.html":"/pamela-prov?view=idle-scene"}>VILA med alla 14 kort →</a></nav><PamelaCombinedStage key={id} {...scene}/></>;
}
