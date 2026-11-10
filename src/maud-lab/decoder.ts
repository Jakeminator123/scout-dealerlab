// TypeScript port of the Scout decoder used by the measured Maud pilot.
export function splitUnits(bytes:Uint8Array){
 if(!bytes.length||bytes.length>2*1024*1024)throw Error('Fel storlek på munpaket.');
 const nals:{at:number;type:number}[]=[];
 for(let i=0;i+3<bytes.length;i++){
  if(bytes[i]||bytes[i+1])continue;
  const head=bytes[i+2]===1?i+3:bytes[i+2]===0&&bytes[i+3]===1?i+4:-1;
  if(head<0)continue;if(head>=bytes.length)throw Error('Ogiltigt videopaket.');nals.push({at:i,type:bytes[head]&31});i=head;
 }
 if(nals[0]?.at!==0||nals[0]?.type!==9)throw Error('Videopaketets start saknas.');
 const units:{data:Uint8Array;key:boolean}[]=[];
 for(let i=0;i<nals.length;){let end=i+1;while(end<nals.length&&nals[end].type!==9)end++;
  const group=nals.slice(i,end);if(!group.some(n=>n.type===1||n.type===5))throw Error('Munrutan saknas.');
  units.push({data:bytes.subarray(nals[i].at,nals[end]?.at??bytes.length),key:group.some(n=>n.type===5)});i=end;
 }
 if(!units[0]?.key||units.length>12)throw Error('Fel paketindelning.');return units;
}
export async function decodeChunk(bytes:Uint8Array){
 if(typeof VideoDecoder!=='function')throw Error('WebCodecs saknas i webbläsaren.');
 const units=splitUnits(bytes),frames:VideoFrame[]=[];let error:Error|undefined,terminal=false;
 const decoder=new VideoDecoder({output(frame){if(terminal)frame.close();else frames.push(frame);},error(cause){error=cause;}});
 const timer=setTimeout(()=>{error=Error('Videopaketet kunde inte avkodas.');if(decoder.state!=='closed')decoder.close();},5000);
 try{
  decoder.configure({codec:'avc1.42E01F',optimizeForLatency:true});
  units.forEach((u,i)=>decoder.decode(new EncodedVideoChunk({type:u.key?'key':'delta',timestamp:Math.round(i*1e6/24),data:u.data})));
  await decoder.flush();if(error)throw error;frames.sort((a,b)=>a.timestamp-b.timestamp);
  if(frames.length!==units.length||frames.some((f,i)=>f.displayWidth!==256||f.displayHeight!==512||f.timestamp!==Math.round(i*1e6/24)))throw Error('Munrutornas format stämmer inte.');return frames;
 }catch(e){frames.forEach(f=>f.close());throw e;}finally{terminal=true;clearTimeout(timer);if(decoder.state!=='closed')decoder.close();}
}
