export const STORAGE_KEY = 'snyggare-dealer.admin-prototype.v1';
export const DEALERS = { pamela: 'Pamela · lokal pilot', goran: 'Göran · Scout Main' } as const;
export const ROOMS = { lounge: 'Grand Lounge', midnight: 'Midnight Studio', daylight: 'Ljus ateljé' } as const;
export const FELTS = { emerald: 'Skogsgrön', burgundy: 'Bordeaux', navy: 'Midnattsblå', none: 'Utan bordsgrafik' } as const;
export const LIGHTS = { warm: 'Varmt', neutral: 'Neutralt' } as const;
export const CHECKS = { framing: 'Utsnitt och proportioner', contrast: 'Kontrast och läsbarhet', flow: 'Flödet är begripligt' } as const;
export const FEATURES = [
  { id: 'free-scenes', title: 'Skapa en fristående scen', detail: 'Börja med innehållet. Koppla bolag och spelbord först när scenen ska användas.', section: 'editor' },
  { id: 'preview', title: 'En stor förhandsvisning', detail: 'Växla mellan visuell referens och en redigerbar principskiss. Testa desktop och mobil.', section: 'test' },
  { id: 'versions', title: 'Tydliga, sparade versioner', detail: 'Varje version är en ögonblicksbild. Ändringar fortsätter i utkastet.', section: 'versions' },
  { id: 'publication', title: 'Separat publiceringssteg', detail: 'Välj sparad version och mål. Se vad som väntar och vad som används.', section: 'publish' },
  { id: 'review', title: 'Godkänn delar av förslaget', detail: 'Behåll, justera eller välj bort varje förbättring. Exportera ditt beslut.', section: 'review' },
] as const;
export type Section = typeof FEATURES[number]['section'];
export type Placement = { background: string; foreground: string; x: number; y: number; zoom: number; opacity: number };
export type Recipe = { name: string; nameMode?: 'automatic' | 'custom'; dealer: keyof typeof DEALERS; room: keyof typeof ROOMS; felt: keyof typeof FELTS; light: keyof typeof LIGHTS; placement?: Placement };
export function automaticName(recipe: Pick<Recipe, 'dealer' | 'room'>): string {
  return `${recipe.dealer === 'pamela' ? 'Pamela' : 'Göran'} / ${ROOMS[recipe.room]}`;
}
export function nameConflict(recipe: Recipe): boolean {
  const other = recipe.dealer === 'pamela' ? 'Göran' : 'Pamela';
  return recipe.nameMode !== 'automatic' && new RegExp(`(^|[^\\p{L}])${other}([^\\p{L}]|$)`, 'iu').test(recipe.name);
}
export function placementFor(recipe: Recipe): Placement {
  return recipe.placement ?? { background: recipe.dealer === 'pamela' ? 'runs/20261108175519-74d6c57e/original/pamela-scene-reference-v2.png' : 'media/identities/goran-scout-reference.png', foreground: '', x: 0, y: 0, zoom: 100, opacity: 100 };
}
export type CheckId = keyof typeof CHECKS;
export type Checks = Partial<Record<CheckId, 'pass' | 'fail'>>;
export type Version = { id: string; number: number; savedAt: string; note: string; recipe: Recipe; checks: Checks };
export type Scene = { id: string; draft: Recipe; checks: Checks; versions: Version[] };
export type Assignment = { sceneId: string; versionId: string };
export type Target = { id: string; company: string; name: string; active?: Assignment; pending?: Assignment };
export type Decision = { choice: 'keep' | 'change' | 'drop'; note: string };
export type DemoRole = 'admin' | 'editor' | 'viewer';
export type DemoCompany = { id: string; name: string; sceneIds: string[]; members: { id: string; name: string; role: DemoRole }[] };
export type PrototypeState = { schema: 1; scenes: Scene[]; selectedId: string; targets: Target[]; decisions: Record<string, Decision>; companies?: DemoCompany[] };
export function sceneLabel(state: PrototypeState, scene: Scene): string {
  const name = scene.draft.name || 'Namnlös scen';
  return state.scenes.filter(s => s.draft.name === scene.draft.name).length > 1 ? `${name} · scen ${state.scenes.findIndex(s => s.id === scene.id) + 1}` : name;
}

export function makeScene(id: string, name: string, dealer: Recipe['dealer'] = 'pamela'): Scene {
  return { id, draft: { name: name.trim() || automaticName({ dealer, room: 'lounge' }), nameMode: name.trim() ? 'custom' : 'automatic', dealer, room: 'lounge', felt: 'emerald', light: 'warm' }, checks: {}, versions: [] };
}
export function initialState(): PrototypeState {
  return { schema: 1, selectedId: 'pamela-lounge', scenes: [makeScene('pamela-lounge', ''), makeScene('goran-studio', '', 'goran')], targets: [
    { id: 'demo-1', company: 'Exempelbolag', name: 'Blackjack 01' },
    { id: 'demo-2', company: 'Exempelbolag', name: 'Blackjack 02' },
  ], decisions: {} };
}
export function changeDraft(scene: Scene, patch: Partial<Recipe>): Scene {
  const draft = { ...scene.draft, ...patch, ...(patch.dealer && patch.dealer !== scene.draft.dealer ? { placement: undefined } : {}) };
  if (patch.name !== undefined && patch.nameMode === undefined && patch.name !== scene.draft.name) draft.nameMode = 'custom';
  if (draft.nameMode === 'automatic') draft.name = automaticName(draft);
  return JSON.stringify(draft) === JSON.stringify(scene.draft) ? scene : { ...scene, draft, checks: {} };
}
export function saveVersion(scene: Scene, id: string, savedAt: string, note: string): Scene {
  if (!scene.draft.name.trim()) throw new Error('Ge scenen ett namn före sparning.');
  return { ...scene, versions: [...scene.versions, { id, number: scene.versions.length + 1, savedAt, note: note.trim(), recipe: structuredClone(scene.draft), checks: { ...scene.checks } }] };
}
export function restoreVersion(scene: Scene, versionId: string): Scene {
  const version = scene.versions.find(item => item.id === versionId);
  if (!version) throw new Error('Versionen finns inte.');
  return { ...scene, draft: structuredClone(version.recipe), checks: {} };
}
export function restorePreservingDraft(scene: Scene, versionId: string, backupId: string, now: string): Scene {
  if (!scene.versions.some(version => version.id === versionId)) throw new Error('Versionen finns inte.');
  const checksChanged = JSON.stringify(scene.checks) !== JSON.stringify(scene.versions.at(-1)?.checks ?? {});
  const preserved = dirty(scene) || checksChanged ? saveVersion({ ...scene, draft: { ...scene.draft, name: scene.draft.name.trim() || 'Namnlöst utkast' } }, backupId, now, 'Säkerhetskopia före återställning') : scene;
  return restoreVersion(preserved, versionId);
}
export function stageVersion(state: PrototypeState, sceneId: string, versionId: string, targetIds: string[]): PrototypeState {
  if (!state.scenes.find(scene => scene.id === sceneId)?.versions.some(version => version.id === versionId)) throw new Error('Välj en sparad version.');
  if (!targetIds.length || targetIds.some(id => !state.targets.some(target => target.id === id))) throw new Error('Välj minst ett giltigt exempelbord.');
  return { ...state, targets: state.targets.map(target => targetIds.includes(target.id) ? { ...target, pending: { sceneId, versionId } } : target) };
}
export function activatePending(state: PrototypeState, targetId: string): PrototypeState {
  return { ...state, targets: state.targets.map(target => target.id === targetId && target.pending ? { ...target, active: { ...target.pending }, pending: undefined } : target) };
}
export function dirty(scene: Scene): boolean {
  const latest = scene.versions.at(-1);
  return !latest || JSON.stringify(scene.draft) !== JSON.stringify(latest.recipe);
}
export function recipeDifferences(a: Recipe, b: Recipe): string[] {
  return ([...new Set([...Object.keys(a), ...Object.keys(b)])] as (keyof Recipe)[]).filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}
// Reject incompatible local data without silently overwriting the original storage entry.
export function parseState(raw: string): PrototypeState {
  const state: unknown = JSON.parse(raw);
  const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
  const placement = (value: unknown) => value === undefined || (record(value) && typeof value.background === 'string' && typeof value.foreground === 'string' && ['x', 'y', 'zoom', 'opacity'].every(key => Number.isFinite(value[key])) && Math.abs(value.x) <= 4000 && Math.abs(value.y) <= 4000 && value.zoom >= 10 && value.zoom <= 300 && value.opacity >= 0 && value.opacity <= 100);
  const recipe = (value: unknown) => record(value) && typeof value.name === 'string' && (value.nameMode === undefined || ['automatic', 'custom'].includes(value.nameMode)) && Object.hasOwn(DEALERS, value.dealer) && Object.hasOwn(ROOMS, value.room) && Object.hasOwn(FELTS, value.felt) && Object.hasOwn(LIGHTS, value.light) && placement(value.placement);
  const checks = (value: unknown) => record(value) && Object.entries(value).every(([key, result]) => Object.hasOwn(CHECKS, key) && ['pass', 'fail'].includes(result));
  const fail = () => { throw new Error('Sparad prototypdata kan inte läsas. Originalet har behållits. Exportera sessionen för att spara ditt nya arbete.'); };
  if (!record(state) || state.schema !== 1 || !Array.isArray(state.scenes) || !state.scenes.length || !Array.isArray(state.targets) || !record(state.decisions)) return fail();
  for (const scene of state.scenes) {
    if (!record(scene) || typeof scene.id !== 'string' || !recipe(scene.draft) || !checks(scene.checks) || !Array.isArray(scene.versions)) return fail();
    if (!scene.versions.every((v: any, i: number) => record(v) && typeof v.id === 'string' && v.number === i + 1 && typeof v.savedAt === 'string' && Number.isFinite(Date.parse(v.savedAt)) && typeof v.note === 'string' && recipe(v.recipe) && checks(v.checks))) return fail();
    if (new Set(scene.versions.map((v: Version) => v.id)).size !== scene.versions.length) return fail();
  }
  if (new Set(state.scenes.map(s => s.id)).size !== state.scenes.length || !state.scenes.some(s => s.id === state.selectedId)) return fail();
  const assignment = (value: unknown) => value === undefined || (record(value) && state.scenes.some((s: Scene) => s.id === value.sceneId && s.versions.some((v: Version) => v.id === value.versionId)));
  if (!state.targets.every(t => record(t) && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.company === 'string' && assignment(t.active) && assignment(t.pending))) return fail();
  if (new Set(state.targets.map(t => t.id)).size !== state.targets.length) return fail();
  if (!Object.entries(state.decisions).every(([id, d]) => FEATURES.some(f => f.id === id) && record(d) && ['keep', 'change', 'drop'].includes(d.choice) && typeof d.note === 'string')) return fail();
  if (state.companies !== undefined && (!Array.isArray(state.companies) || !state.companies.every(c => record(c) && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.sceneIds) && c.sceneIds.every((id: unknown) => typeof id === 'string' && state.scenes.some((s: Scene) => s.id === id)) && Array.isArray(c.members) && c.members.every((m: unknown) => record(m) && typeof m.id === 'string' && typeof m.name === 'string' && ['admin', 'editor', 'viewer'].includes(m.role))))) return fail();
  const parsed = state as PrototypeState;
  // Only the two unchanged legacy example names are known to have been generated by us.
  return { ...parsed, scenes: parsed.scenes.map(scene => !scene.draft.nameMode && ((scene.id === 'pamela-lounge' && scene.draft.name === 'Pamela / Grand Lounge') || (scene.id === 'goran-studio' && scene.draft.name === 'Göran / Scenstudie')) ? { ...scene, draft: { ...scene.draft, nameMode: 'automatic', name: automaticName(scene.draft) } } : scene) };
}
