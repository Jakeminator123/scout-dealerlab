import test from 'node:test';
import assert from 'node:assert/strict';
import {bankPhysicalSide,validateBankSidePolicy,bankPresentation,type BankSurfaceSelection} from '../src/pamela-bank-card-surfaces.ts';
import {presentedCardMaterial} from '../src/pamela-two-sided-card.ts';
import {P1_SIDE_POLICY} from '../src/pamela-p1-side-calibration.ts';
const policy:BankSurfaceSelection['sidePolicy']={...P1_SIDE_POLICY,segments:P1_SIDE_POLICY.segments.map(s=>({...s})),basis:{path:'proof.json',sha256:'a'.repeat(64)}};
test('two passes retain front permission gates before and after the hidden face',()=>{
 validateBankSidePolicy(policy,P1_SIDE_POLICY.sourceSha256);
 assert.deepEqual([82,83,103,104,113,114,118,119].map(f=>bankPhysicalSide(policy,f)),['FRONT','EDGE','EDGE','BACK','BACK','EDGE','EDGE','FRONT']);
 const back={id:'back',width:1,height:1,rgb:new Uint8Array([0,0,0])},front={...back,id:'KH',rgb:new Uint8Array([255,0,0])},materials={back,front:new Map([['KH',front]])};
 for(const f of [82,119]){
  const p=(signal?:{cardId:string|null;frontAllowed:boolean})=>presentedCardMaterial(bankPresentation('C2-P1',bankPhysicalSide(policy,f),materials,signal));
  assert.equal(p({cardId:'KH',frontAllowed:true}).texture,front);
  for(const s of [undefined,{cardId:'KH',frontAllowed:false},{cardId:null,frontAllowed:true},{cardId:'UNKNOWN',frontAllowed:true}])assert.equal(p(s).side,'CONCEALED');
  assert.equal(p({cardId:'KH',frontAllowed:true}).side,'FRONT');assert.equal(p({cardId:'KH',frontAllowed:false}).texture,back,'revocation cannot reuse previously allowed art');
 }
});
test('source mismatches, gaps, overlaps and missing final coverage fail',()=>{
 assert.throws(()=>validateBankSidePolicy(policy,'b'.repeat(64)));
 for(const mutate of [(s:any[])=>{s[1].start++;},(s:any[])=>{s[1].start--;},(s:any[])=>{s.at(-1).end=359;},(s:any[])=>{s[0].side='UNKNOWN';}]){
  const p=structuredClone(policy);mutate(p.segments);assert.throws(()=>validateBankSidePolicy(p,policy.sourceSha256));
 }
 assert.throws(()=>bankPhysicalSide(policy,360));assert.throws(()=>bankPhysicalSide(policy,82.5));
});
