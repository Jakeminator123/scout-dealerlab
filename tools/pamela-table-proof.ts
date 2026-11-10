import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as Three from '../references/card-materials/vendor/three.module.js';
import {sourcePlanePixel,type StageProjection} from '../src/pamela-stage-projection.ts';
import {createPamelaTableLayer,PAMELA_TABLE_VARIANTS,pamelaTableSvg,sourceContactAnchor,tablePointToSource,restrainedTableContact} from '../src/pamela-table-layer.ts';

sharp.concurrency(1);
const suffix=process.argv.find(a=>a.startsWith('--suffix='))?.slice(9);
if(suffix&&!/^[a-z0-9-]+$/.test(suffix))throw Error('Proof suffix must contain only lowercase letters, digits and hyphens');
const folder='runs/20261109-pamela-table-layer'+(suffix?`/${suffix}`:'');
await mkdir(folder,{recursive:true});
const contract=JSON.parse(await readFile('references/pamela-stage-contract.json','utf8'));
const p:StageProjection={width:contract.dealerPlacement.width,sourceWidth:1762,sourceHeight:1174,contactSourceY:contract.dealerPlacement.contactSourceY,depth:contract.dealerPlacement.depth,tableHeight:contract.table.feltHeight+.004,camera:contract.camera.position,cameraTarget:contract.camera.target};
const contacts=contract.contactShadows,layer=createPamelaTableLayer(Three,{table:contract.table,projection:p,contactShadows:contacts});
const digest=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
type GeometryMesh={geometry:{attributes:Record<string,{array:ArrayLike<number>}>;index:null|{array:ArrayLike<number>}};material:{color:{getHexString():string}}};
const geometryState=()=>JSON.stringify((layer.group.children as unknown as GeometryMesh[]).map(m=>({attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([name,a])=>[name,Array.from(a.array)])),index:m.geometry.index?Array.from(m.geometry.index.array):null})));
const baseline=digest(geometryState()),colors:string[]=[],geometryHashes:string[]=[];
for(const variant of PAMELA_TABLE_VARIANTS){layer.setVariant(variant.id);geometryHashes.push(digest(geometryState()));colors.push((layer.group.children[1] as unknown as GeometryMesh).material.color.getHexString());assert.equal(geometryHashes.at(-1),baseline,'Material switch changed geometry');assert.equal(layer.diagnostics().feltPlaneY,contract.table.feltHeight);}
assert.notEqual(colors[0],colors[1]);
const roundTripErrors:number[]=[];
for(const [x,y] of [[0,0],[1762,0],[735,874],[1435,892],[802,1093],[963,1093],[1762,1174]]){
  const actual=tablePointToSource(sourcePlanePixel(x,y,p),p),error=Math.hypot(actual[0]-x,actual[1]-y);roundTripErrors.push(error);assert.ok(error<1e-9,`Source ray drift ${error}`);
}
const anchorErrors=contacts.map((contact:{sourceX:number;sourceY:number})=>{const point=sourceContactAnchor(contact,p,contract.table.feltHeight),pixel=tablePointToSource(point,p);return Math.hypot(pixel[0]-contact.sourceX,pixel[1]-contact.sourceY);});
assert.ok(anchorErrors.every((e:number)=>e<1e-9));
const restrained=contacts.map(restrainedTableContact);for(const c of restrained){assert.ok(c.depth<=.055);assert.ok(c.opacity<=.12);assert.ok(c.width<=1.25);}
layer.setVisible(false);assert.equal(layer.group.visible,false);assert.equal(layer.contactGroup.visible,false);layer.setVisible(true);
const contactState=JSON.stringify(layer.diagnostics().contacts);assert.throws(()=>layer.setContacts([{sourceX:1,sourceY:2,width:Number.NaN,depth:.1,opacity:.1}]));assert.equal(JSON.stringify(layer.diagnostics().contacts),contactState,'Failed update damaged existing contacts');
layer.setContacts(contacts.filter((c:{role:string})=>c.role.includes('shoe')));assert.equal(layer.diagnostics().contacts.length,1);layer.setContacts([]);assert.equal(layer.contactGroup.children.length,0);
const originalTable={...contract.table},mutationLayer=createPamelaTableLayer(Three,{table:originalTable,projection:p});originalTable.feltHeight=200;assert.equal(mutationLayer.diagnostics().feltPlaneY,contract.table.feltHeight);mutationLayer.dispose();
const records=[];
for(const variant of PAMELA_TABLE_VARIANTS){
  const svg=pamelaTableSvg({table:contract.table,projection:p,variant:variant.id,contactShadows:contacts});
  await writeFile(`${folder}/${variant.id}.svg`,svg,{flag:'wx'});
  const png=await sharp(Buffer.from(svg)).png().toBuffer();await writeFile(`${folder}/${variant.id}.png`,png,{flag:'wx'});records.push({file:`${variant.id}.png`,sha256:digest(png)});
  for(const pan of [[-.16,-.07],[.16,.07]]){const shifted=pamelaTableSvg({table:contract.table,projection:p,variant:variant.id,pan,contactShadows:contacts});assert.ok(!/NaN|Infinity/.test(shifted));}
}
const proof={status:'focused-geometry-and-material-proof-passed-not-moving-compositor-acceptance',createdAt:new Date().toISOString(),node:process.version,contractSha256:digest(await readFile('references/pamela-stage-contract.json')),moduleSha256:digest(await readFile('src/pamela-table-layer.ts')),geometryHashes,maxRoundTripErrorPx:Math.max(...roundTripErrors),maxContactAnchorErrorPx:Math.max(...anchorErrors),feltPlaneY:contract.table.feltHeight,contacts:restrained,materialColors:colors,records,sourceMediaModified:false,paidGeneration:false,provenance:'Procedural Three.js geometry and deterministic seeded material grain; no image generation or source editing',limitations:['The SVG is a procedural geometry fixture, not the PBR WebGL output.','Moving dealer mask and card/hand/shoe occlusion require integrated visual QA.','A fixed hand shadow must be omitted during motion unless a frame-specific contact is provided.','Scene scale, relative lighting and depth remain authored, not measured.']};
layer.dispose();layer.dispose();assert.throws(()=>layer.setVariant('emerald-leather'));
await writeFile(`${folder}/proof.json`,JSON.stringify(proof,null,2),{flag:'wx'});
console.log(JSON.stringify({path:`${folder}/proof.json`,maxRoundTripErrorPx:proof.maxRoundTripErrorPx,maxContactAnchorErrorPx:proof.maxContactAnchorErrorPx,geometryUnchanged:geometryHashes.every(h=>h===baseline),variants:PAMELA_TABLE_VARIANTS.length}));
