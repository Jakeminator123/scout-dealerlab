import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPublicPath,assertPublicText} from './sync-public-repo.ts';

test('public selection excludes credentials, private operations, raw files and traversal',()=>{
  for(const p of ['.env.local','private/key.json','runs/a/job.json','media/a.png','docs/drift/ATKOMST.md','references/provider-accounts.json','references/agent-roles.json','tools/runpod-mcp/start.ts','src/../private/key.ts','src/a\tb.ts'])assert.equal(allowedPublicPath(p),false,p);
  for(const p of ['.env.example','src/server.ts','app/page.tsx','references/work-material.json','docs/drift/PROVISORISK-STRUKTUR.md','scripts/publish-review.ps1'])assert.equal(allowedPublicPath(p),true,p);
});
test('public scan rejects known values, token patterns and signed URLs',()=>{
  assert.throws(()=>assertPublicText('value hidden-secret-value',['hidden-secret-value'],'src/a.ts'));
  assert.throws(()=>assertPublicText('sk-'+ 'x'.repeat(32),[],'src/a.ts'));
  assert.throws(()=>assertPublicText('https://example.com/?token='+ 'x'.repeat(32),[],'src/a.ts'));
  assert.throws(()=>assertPublicText('https'+ '://user:pass@example.com/a',[],'test/server.test.ts'));
});
test('only the inspected negative-test credential fixture is permitted',()=>{
  const fake='https'+'://user:pass@2jzgrf9f6fNlHVTZ.private.blob.vercel-storage.com/clip.mp4'.toLowerCase();
  assert.doesNotThrow(()=>assertPublicText(fake,[],'test/server.test.ts'));
  assert.throws(()=>assertPublicText(fake,[],'src/a.ts'));
  assert.throws(()=>assertPublicText(fake.replace(':pass@',':actual-secret@'),[],'test/server.test.ts'));
});
test('desktop map public selection is exact and excludes environments and local drafts',()=>{
  for(const file of [
    'tools/dealer-map/dealer_map.py','tools/dealer-map/dealer_map_data.py',
    'tools/dealer-map/STARTA-KARTA.cmd','tools/dealer-map/INSTALLERA.cmd',
    'tools/dealer-map/.gitignore','tools/dealer-map/data/dealer-map.json',
    'tools/dealer-map/web/index.html','tools/dealer-map/publishing/check_web_export.py',
    '.github/workflows/dealer-map-pages.yml',
  ])assert.equal(allowedPublicPath(file),true,file);
  for(const file of [
    'tools/dealer-map/.venv/Lib/site-packages/package.py',
    'tools/dealer-map/.venv/pyvenv.cfg','tools/dealer-map/.venv/settings.json',
    'tools/dealer-map/__pycache__/dealer_map.pyc','tools/dealer-map/local-draft.json',
    'tools/dealer-map/private/data.json','tools/dealer-map/new_unreviewed_tool.py',
    '.github/workflows/unreviewed.yml',
  ])assert.equal(allowedPublicPath(file),false,file);
});
