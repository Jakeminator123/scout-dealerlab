import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(root, 'references/terminology.json'), 'utf8'));
const status: Record<string, string> = { verified: 'Verifierat begrepp', 'lab-proposal': 'Labbets UI-benämning', ambiguous: 'Flera betydelser', unknown: 'Inte verifierat' };
const text = ['TERMINOLOGI – SCOUT GAMING OCH DET LOKALA DEALERLABBET', `Kontrollerat ${data.verifiedAt}. Källrevision: ${data.sourceRevision}.`, '', 'Ordlistan beskriver sakerna. Den ger inga rättigheter och kör ingen kod.', 'Admin, Partnerportalen och Lobbyn är målgruppsnivåer. Grund/Utökad gäller klippomfattning.', '', ...data.terms.flatMap((term: { label: string; aliases: string[]; description: string; status: string }) => [term.label.toUpperCase(), `Andra namn / kodnamn: ${term.aliases.join(', ')}`, term.description, `Status: ${status[term.status] ?? term.status}`, '']), 'KÄLLOR', ...data.sources.map((source: string) => `- ${source}`), '', 'UNDERHÅLL', 'Gemensamt innehåll finns i references/terminology.json och används också av studions interaktiva begreppsvy.', 'Ändra berörda definitioner när verifierad kod eller beslut ändras; kör node scripts/sync-terminology.ts för denna textfil.', 'Begreppen ersätter inte den kanoniska ordlistan i Scoutgaming. Produktionskod och lagrade kodnamn byts inte av labbet.', ''].join('\n');
await writeFile(path.join(root, 'docs/terminologi.txt'), text);
console.log(`Updated docs/terminologi.txt: ${data.terms.length} terms.`);
