import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDealerMap, type DealerMap } from '../src/dealer-map.ts';
import { dealerMapPage } from '../src/dealer-map-page.ts';
const source = JSON.parse(await readFile(new URL('../references/dealer-map.json', import.meta.url), 'utf8')) as DealerMap;
test('Pamela map keeps slot-specific hole poses and all seven seat identities', () => {
  assert.deepEqual(validateDealerMap(source), []);
  assert.deepEqual(source.nodes.find(n => n.id === 'deal.dealer/dealer-hole')?.poseVariants, { base: ['REDO','VILA'], i: ['VILA','VILA'] });
  assert.deepEqual(source.targets.map(t => [t.playerSeat,t.box,t.landingQuad]), Array.from({length:7}, (_,i)=>[i+1,i,null]));
  assert.equal(source.nodes.find(n=>n.id==='transition.shoe/to-shoe')?.asset?.fps, 30);
  assert.equal(source.mainConnected, false);
  assert.equal(source.nodes.find(n=>n.id==='deal.player.centre/box3')?.assetVariant,'base');
});
test('Projection rejects false measured landings, duplicate slots and unsupported approval', () => {
  const map = structuredClone(source); map.targets[0].measurementStatus='measured'; map.nodes.push(map.nodes[0]);
  map.nodes[0].productionApproval='approved';
  const errors=validateDealerMap(map);
  assert(errors.some(e=>e.includes('Missing landing'))); assert(errors.some(e=>e.includes('Duplicate slot'))); assert(errors.some(e=>e.includes('Unsupported approval')));
});
test('Publication requires every selected original and escapes source text outside HTML', () => {
  assert.throws(()=>dealerMapPage(source,new Map(),'test-snapshot'),/not published/);
  const map=structuredClone(source); map.findings[0].detail='</script><img src=x onerror=alert(1)>';
  const paths=new Map([...map.anchors.map(a=>a.asset),...map.nodes.flatMap(n=>n.asset?[n.asset]:[])].map(a=>[a.path,'/material/'+a.sha256]));
  const html=dealerMapPage(map,paths,'test-snapshot');
  assert(!html.includes('</script><img')); assert(html.includes('\\u003c/script>')); assert(html.includes('nodkarta.js'));
});
test('Graph distinguishes pose contracts from media and does not borrow base for iv', () => {
  const graph=source.graph;
  const base=graph.nodes.find(n=>n.slotId==='deal.player.centre/box3'&&n.variant==='base')!;
  const iv=graph.nodes.find(n=>n.slotId==='deal.player.centre/box3'&&n.variant==='iv')!;
  const media=(id:string)=>graph.nodes.find(n=>n.id===graph.edges.find(e=>e.from===id&&e.relation==='uses')?.to);
  assert.equal(media(base.id)?.sha256,source.nodes.find(n=>n.id===base.slotId)?.asset?.sha256);
  assert.equal(media(iv.id)?.status,'missing'); assert.equal(media(iv.id)?.sha256,undefined);
  assert(graph.edges.some(e=>e.from===base.id&&e.to==='pose:REDO'&&e.relation==='ends'));
  const invalid=structuredClone(source); invalid.graph.edges[0].to='missing-node';
  assert(validateDealerMap(invalid).includes('Relation endpoint missing'));
});
