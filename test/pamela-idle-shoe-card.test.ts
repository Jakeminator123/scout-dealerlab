import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {openIdleShoeCardSurfaces,IDLE_SHOE_CARD_SOURCES,type IdleShoeSourceId} from '../src/pamela-idle-shoe-card.ts';
const apiPromise=openIdleShoeCardSurfaces();
const solid=(id:string,r:number,g:number,b:number)=>({id,width:1,height:1,rgb:Uint8Array.of(r,g,b)});
async function input(sourceId:IdleShoeSourceId,frame:number){const api=await apiPromise,r=api.refs.get(`${sourceId}:${frame}`)!;return{sourceId,sourceSha256:IDLE_SHOE_CARD_SOURCES[sourceId].sha256,frame,originalRGB:await sharp(r.path).removeAlpha().raw().toBuffer()};}
test('only the frozen 1764-wide original and reviewed frame windows may supply geometry',async()=>{
 const api=await apiPromise,s=await input('B',0);assert.equal(api.refs.size,182);
 assert.throws(()=>api.geometryFrame({...s,sourceSha256:IDLE_SHOE_CARD_SOURCES.bridge.sha256}),/Another source/);
 for(const frame of [23,251,327,-1,.5])assert.throws(()=>api.geometryFrame({...s,frame}),/Unreviewed/);
 assert.throws(()=>api.geometryFrame({...s,originalRGB:new Uint8Array(1762*1174*3)}),/1764/);
 const changed=Buffer.from(s.originalRGB);changed[0]^=1;assert.throws(()=>api.geometryFrame({...s,originalRGB:changed}),/exact neutral/);
 assert.throws(()=>api.geometryFrame({...s,frame:1}),/exact neutral/);
});
test('unknown side, missing identity and front denial never fetch face artwork',async()=>{
 const api=await apiPromise,g=api.geometryFrame(await input('bridge',89)),back=solid('back',32,60,170),front=()=>{throw Error('Forbidden front lookup');};
 for(const p of [{displaySide:'UNKNOWN' as const,cardId:'explicit-id',frontAllowed:true},{displaySide:'FRONT' as const,cardId:null,frontAllowed:true},{displaySide:'FRONT' as const,cardId:'explicit-id',frontAllowed:false},{displaySide:'BACK' as const,cardId:'explicit-id',frontAllowed:true}]){
  const r=await api.paint(g,{slotId:'caller-slot',...p,back,front});assert.equal(r.states[0].physicalSide,'UNKNOWN');assert.equal(r.states[0].textureId,'back');
  assert.equal(r.verification.changedOutsidePaperPixels,0);assert.equal(r.verification.changedProtectedPixels,0);
 }
});
test('replaceable designs retain exact outside/foreground pixels and the same source matte',async()=>{
 const api=await apiPromise;
 for(const [id,frame]of [['B',0],['B',326],['bridge',6],['bridge',58],['bridge',74],['bridge',89]]as const){
  const g=api.geometryFrame(await input(id,frame)),back=solid('back',10,25,80),outputs=[];
  for(const t of [solid('front-a',5,7,9),solid('front-b',200,70,30)]){let calls=0;const out=await api.paint(g,{slotId:'caller-slot',displaySide:'FRONT',cardId:'caller-id',frontAllowed:true,back,front:id=>{assert.equal(id,'caller-id');calls++;return t;}});assert.equal(calls,1);outputs.push(out);}
  assert.deepEqual(outputs[0].paper,outputs[1].paper);assert.notEqual(outputs[0].verification.printedRgbSha256,outputs[1].verification.printedRgbSha256);
  for(let p=0;p<g.coverage.length;p++)if(!g.coverage[p]||g.guard[p])for(let c=0;c<3;c++)for(const out of outputs)assert.equal(out.printed[p*3+c],g.original[p*3+c]);
  assert.ok(g.measurements.paperPixels>3300);for(const [x,y]of g.quad){const[u,v]=g.uvAt(x,y);assert.ok(Number.isFinite(u)&&Number.isFinite(v));}
  if(id==='bridge'&&frame===89){const finger=769*1764+1298;assert.ok(g.guard[finger],'Observed fingertip must be protected');assert.equal(g.coverage[finger],0);}
 }
});
test('paint rejects mutation of the retained neutral source or matte',async()=>{
 const api=await apiPromise,g=api.geometryFrame(await input('B',0)),p={slotId:'caller',displaySide:'BACK' as const,cardId:null,frontAllowed:false,back:solid('back',1,2,3),front:()=>{throw Error('No lookup');}};
 g.original[0]^=1;await assert.rejects(api.paint(g,p),/Neutral plate mutated/);g.original[0]^=1;
 g.coverage[0]=255;await assert.rejects(api.paint(g,p),/Paper mask mutated/);
});
test('pale nail highlights stay protected while the separate warm paper shadow receives ink',async()=>{
 const api=await apiPromise,back=solid('black',0,0,0);
 for(const [frame,x,y]of [[68,1332,756],[70,1328,759]]as const){
  const g=api.geometryFrame(await input('bridge',frame)),p=y*1764+x;assert.equal(g.coverage[p],0);assert.equal(g.guard[p],255);
  const r=await api.paint(g,{slotId:'caller',displaySide:'UNKNOWN',cardId:null,frontAllowed:false,back,front:()=>{throw Error('No lookup');}});
  assert.deepEqual(r.printed.subarray(p*3,p*3+3),g.original.subarray(p*3,p*3+3));
 }
 const g=api.geometryFrame(await input('bridge',73)),p=784*1764+1316;assert.equal(g.coverage[p],255,'Observed paper shadow is opaque paper');assert.equal(g.guard[p],0);
 const r=await api.paint(g,{slotId:'caller',displaySide:'UNKNOWN',cardId:null,frontAllowed:false,back,front:()=>{throw Error('No lookup');}});assert.deepEqual([...r.printed.subarray(p*3,p*3+3)],[0,0,0]);
});
