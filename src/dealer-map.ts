export type Pose = 'VILA' | 'REDO';
export type MeasurementStatus = 'unknown' | 'proposed' | 'measured' | 'validated' | 'not_applicable';
export type MapAsset = { path: string; sha256: string; width: number; height: number; kind: 'image' | 'video'; fps?: number; frameCount?: number; duration?: number };
export type RelationNode = { id: string; type: 'pose' | 'motion' | 'film' | 'target' | 'track' | 'mask'; label: string; status: 'candidate' | 'missing' | 'unmeasured'; slotId?: string; variant?: string | null; pose?: Pose; sha256?: string };
export type RelationEdge = { from: string; to: string; relation: 'starts' | 'ends' | 'uses' | 'lands' | 'requires'; label: string };
export type MapNode = {
  id: string; label: string; game: 'blackjack' | 'roulette'; kind: string;
  sourceKind: string; playerSeat: number | null; box: number | null;
  poseVariants: Record<string, [Pose, Pose]>; poses: [Pose, Pose] | null;
  productionApproval: 'pending' | 'approved' | 'rejected'; integrationStatus: 'unbound' | 'bound' | 'validated_in_preview' | 'approved_for_runtime';
  measurementStatus: MeasurementStatus; asset: MapAsset | null; assetVariant: string | null; missing: string[];
  mainCatalogStatus: string; graphLayout: { column: number; row: number };
};
export type DealerMap = {
  schema: 'dealerlab-map/1'; generatedAt: string; mainRevision: string; bankId: string;
  mainConnected: false; importedIntoAtlas: false;
  sources: { path: string; sha256: string; role: string }[];
  counts: { blackjack: number; roulette: number; candidateBindings: number; productionAccepted: number };
  coordinateSpaces: { id: string; width: number | null; height: number | null; status: string }[];
  anchors: { id: Pose; asset: MapAsset; points: { id: string; label: string; x: number; y: number; measurementStatus: MeasurementStatus; method: string }[] }[];
  nodes: MapNode[];
  pilot: { slotId: string; variant: string | null; order: number }[];
  targets: { playerSeat: number; box: number; landingQuad: number[][] | null; measurementStatus: MeasurementStatus }[];
  findings: { id: string; label: string; detail: string }[];
  graph: { nodes: RelationNode[]; edges: RelationEdge[] };
};

// This validates a local read projection. It is deliberately not a Main import validator.
export function validateDealerMap(map: DealerMap): string[] {
  const errors: string[] = [];
  if (map.schema !== 'dealerlab-map/1' || map.mainConnected !== false || map.importedIntoAtlas !== false) errors.push('Unexpected projection scope');
  const graphIds = new Set(map.graph?.nodes.map(n => n.id) ?? []);
  if (!map.graph || graphIds.size !== map.graph.nodes.length) errors.push('Invalid relation graph');
  for (const edge of map.graph?.edges ?? []) if (!graphIds.has(edge.from) || !graphIds.has(edge.to)) errors.push('Relation endpoint missing');
  const ids = new Set<string>();
  for (const node of map.nodes) {
    if (ids.has(node.id)) errors.push(`Duplicate slot: ${node.id}`);
    ids.add(node.id);
    if (node.playerSeat !== null && (node.box !== node.playerSeat - 1 || node.playerSeat < 1 || node.playerSeat > 7)) errors.push(`Seat/box mismatch: ${node.id}`);
    for (const poses of [...Object.values(node.poseVariants), ...(node.poses ? [node.poses] : [])]) {
      if (poses.length !== 2 || poses.some(p => p !== 'VILA' && p !== 'REDO')) errors.push(`Invalid pose pair: ${node.id}`);
    }
    if (node.integrationStatus !== 'unbound') errors.push(`Local candidate must not claim runtime binding: ${node.id}`);
    if (node.asset && Object.keys(node.poseVariants).length && (!node.assetVariant || !node.poseVariants[node.assetVariant])) errors.push(`Unqualified pose variant binding: ${node.id}`);
    if (node.productionApproval === 'approved' && (!node.asset || node.missing.length)) errors.push(`Unsupported approval: ${node.id}`);
  }
  const bj = map.nodes.filter(n => n.game === 'blackjack').length, roulette = map.nodes.filter(n => n.game === 'roulette').length;
  if (bj !== 32 || roulette !== 4 || map.counts.blackjack !== bj || map.counts.roulette !== roulette) errors.push('Catalog count mismatch');
  if (map.counts.candidateBindings !== map.nodes.filter(n => n.asset).length || map.counts.productionAccepted !== map.nodes.filter(n => n.productionApproval === 'approved').length) errors.push('Coverage count mismatch');
  for (const asset of [...map.anchors.map(a => a.asset), ...map.nodes.flatMap(n => n.asset ? [n.asset] : [])]) {
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !asset.path.startsWith('runs/') || asset.path.includes('..')) errors.push('Unqualified media identity');
    if (!(asset.width > 0 && asset.height > 0)) errors.push('Missing media dimensions');
  }
  for (const anchor of map.anchors) for (const point of anchor.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > anchor.asset.width || point.y > anchor.asset.height) errors.push(`Point outside source: ${point.id}`);
  }
  for (const target of map.targets) if (target.landingQuad === null && target.measurementStatus !== 'unknown') errors.push(`Missing landing cannot be measured: ${target.box}`);
  for (const step of map.pilot) {
    const node = map.nodes.find(n => n.id === step.slotId);
    if (!node || (step.variant && !node.poseVariants[step.variant])) errors.push(`Invalid pilot step: ${step.slotId}`);
  }
  return errors;
}
