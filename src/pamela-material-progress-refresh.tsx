'use client';
import{useRouter}from'next/navigation';
/** User-controlled refresh of the pending clip index. */
export default function PamelaMaterialProgressRefresh(){
 const router=useRouter();
 return <button type="button" onClick={()=>router.refresh()} style={{padding:'10px 16px',borderRadius:8,background:'#263c31',color:'#e7eee9',border:'1px solid #45634f'}}>Uppdatera exportstatus</button>;
}
