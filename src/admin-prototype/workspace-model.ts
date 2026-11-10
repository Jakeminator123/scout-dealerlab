import type { Assignment, DemoCompany, DemoRole, PrototypeState } from './model';

export const ROLE_NAMES: Record<DemoRole, string> = { admin: 'Administratör', editor: 'Redaktör', viewer: 'Läsare' };
export function companiesFor(state: PrototypeState): DemoCompany[] {
  return state.companies ?? [...new Set(state.targets.map(t => t.company))].map((name, i) => ({ id: `example-company-${i}`, name, sceneIds: [], members: [] }));
}
export function addCompany(state: PrototypeState, id: string, name: string): PrototypeState {
  const companies = companiesFor(state);
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Skriv bolagets namn.');
  if (companies.some(c => c.name.toLocaleLowerCase('sv') === trimmed.toLocaleLowerCase('sv'))) throw new Error('Ett bolag med det namnet finns redan i mallen.');
  return { ...state, companies: [...companies, { id, name: trimmed, sceneIds: [], members: [] }] };
}
export function setCompanyScenes(state: PrototypeState, companyId: string, sceneIds: string[]): PrototypeState {
  if (sceneIds.some(id => !state.scenes.some(s => s.id === id))) throw new Error('Scenen finns inte.');
  return { ...state, companies: companiesFor(state).map(c => c.id === companyId ? { ...c, sceneIds: [...new Set(sceneIds)] } : c) };
}
export function addMember(state: PrototypeState, companyId: string, id: string, name: string, role: DemoRole): PrototypeState {
  if (!name.trim()) throw new Error('Skriv testmedlemmens namn.');
  return { ...state, companies: companiesFor(state).map(c => c.id === companyId ? { ...c, members: [...c.members, { id, name: name.trim(), role }] } : c) };
}
export function createPartnerTable(state: PrototypeState, companyId: string, role: DemoRole, id: string, name: string, assignment: Assignment): PrototypeState {
  const company = companiesFor(state).find(c => c.id === companyId);
  if (role === 'viewer') throw new Error('Läsarrollen kan inte ändra spelbord i förhandsvisningen.');
  if (!company || !company.sceneIds.includes(assignment.sceneId)) throw new Error('Bolaget har inte fått tillgång till scenen.');
  if (!state.scenes.find(s => s.id === assignment.sceneId)?.versions.some(v => v.id === assignment.versionId)) throw new Error('Välj en sparad scenversion.');
  if (!name.trim()) throw new Error('Ge spelbordet ett namn.');
  if (state.targets.some(t => t.company === company.name && t.name.toLocaleLowerCase('sv') === name.trim().toLocaleLowerCase('sv'))) throw new Error('Spelbordets namn används redan hos bolaget.');
  return { ...state, targets: [...state.targets, { id, company: company.name, name: name.trim(), pending: { ...assignment } }] };
}
