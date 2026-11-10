import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
let input = '';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
for await (const chunk of process.stdin) { input += chunk; if (/[\r\n]/.test(input)) break; }
if (process.stdin.isTTY) process.stdin.setRawMode(false);
const login = JSON.parse(input);
if (typeof login.UN !== 'string' || typeof login.PW !== 'string' || !login.UN || !login.PW) throw new Error('Both fields required');
let previous: Record<string,string> = {};
for (const name of ['.env', '.env.local']) {
  try { Object.assign(previous, parseEnv(await readFile(path.join(root,name),'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
delete previous.SCOUTGAMING_ADMIN_USER; delete previous.SCOUTGAMING_ADMIN_PASSWORD;
Object.assign(previous, {UN:login.UN,PW:login.PW});
const destination = path.join(root,'.env.local');
const temporary = path.join(root,'.runtime/env-transfer.tmp');
const serialized = '# Privat för detta lokala projekt. Aldrig Git, loggar eller klientkod.\n' + Object.entries(previous).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n';
await writeFile(temporary,serialized,{mode:0o600});
await rename(temporary,destination);
const verified=parseEnv(await readFile(destination,'utf8'));
if (Object.keys(previous).some(key=>verified[key]!==previous[key])) throw new Error('Transfer verification failed');
try { await unlink(path.join(root,'.env')); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
console.log('Verified single private .env.local; previous .env removed. No credentials printed.');
