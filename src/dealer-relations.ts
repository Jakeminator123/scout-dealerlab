import type { DealerMap, MapNode, RelationNode, RelationEdge } from './dealer-map.ts';

// Presentation graph. Connections describe intended contracts, not accepted joins.
export function dealerRelations(slots: MapNode[]): DealerMap['graph'] {
  const nodes: RelationNode[] = ['VILA', 'REDO'].map(pose => ({ id: `pose:${pose}`, type: 'pose', label: pose, pose: pose as 'VILA' | 'REDO', status: 'candidate' }));
  const edges: RelationEdge[] = [];
  const add = (node: RelationNode) => { if (!nodes.some(n => n.id === node.id)) nodes.push(node); };
  for (const slot of slots) {
    const variants = Object.keys(slot.poseVariants);
    for (const variant of variants.length ? variants : [null]) {
      const id = `motion:${slot.id}:${variant ?? 'default'}`;
      const poses = variant ? slot.poseVariants[variant] : slot.poses;
      const asset = variants.length && slot.assetVariant !== variant ? null : slot.asset;
      add({ id, type: 'motion', label: slot.label, status: asset ? 'candidate' : 'missing', slotId: slot.id, variant });
      if (poses) {
        edges.push({ from: `pose:${poses[0]}`, to: id, relation: 'starts', label: 'startpose' });
        edges.push({ from: id, to: `pose:${poses[1]}`, relation: 'ends', label: 'slutpose' });
      }
      const filmId = asset ? `film:${asset.sha256}` : `${id}:film`;
      add({ id: filmId, type: 'film', label: asset ? asset.kind === 'image' ? 'Originalbild' : 'Originalfilm' : 'Film saknas', status: asset ? 'candidate' : 'missing', ...(asset ? { sha256: asset.sha256 } : {}) });
      edges.push({ from: id, to: filmId, relation: 'uses', label: 'använder' });
      if (slot.playerSeat !== null) {
        const targetId = `target:seat-${slot.playerSeat}`;
        add({ id: targetId, type: 'target', label: `Plats ${slot.playerSeat}`, status: 'unmeasured' });
        edges.push({ from: id, to: targetId, relation: 'lands', label: 'landar vid' });
      }
      if (slot.kind === 'deal' || slot.kind === 'reveal' || slot.kind === 'shoe') {
        for (const type of ['track', 'mask'] as const) {
          add({ id: `${id}:${type}`, type, label: type === 'track' ? 'Kortspår / kontakt' : 'Handmask', status: 'missing' });
          edges.push({ from: id, to: `${id}:${type}`, relation: 'requires', label: 'behöver' });
        }
      }
    }
  }
  return { nodes, edges };
}
