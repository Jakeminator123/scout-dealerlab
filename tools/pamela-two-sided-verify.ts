import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const path='runs/20261109-pamela-two-sided-flip/take-03/evidence.json',bytes=await readFile(path),e=JSON.parse(bytes.toString()),hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
assert.equal(e.records.length,360);assert.equal(e.outputs.length,5);
let protectedChanges=0,outside=0,frontIndependentFrames=0;
for(const r of e.records){assert.equal(r.variants.length,4);for(const v of r.variants){protectedChanges+=v.changedProtectedPixels;outside+=v.changedOutsideCoverage;}
 if(r.frame>=98){const v=(id:string)=>r.variants.find((x:any)=>x.design===id);assert.equal(v('sg-classic').printedRgbSha256,v('blue-classic').printedRgbSha256);assert.equal(v('blue-ivory').printedRgbSha256,v('sg-ivory').printedRgbSha256);frontIndependentFrames++;}
}
assert.equal(protectedChanges,0);assert.equal(outside,0);assert.equal(frontIndependentFrames,262);
// The new exact-edge guard must not change the already inspected native probes.
const before=JSON.parse(await readFile('runs/20261109-pamela-two-sided-flip/take-01/evidence.json','utf8'));
let repeatedNativeProbes=0;for(const r of before.records){const after=e.records[r.frame];for(let i=0;i<2;i++)assert.equal(r.variants[i].printedRgbSha256,after.variants[i].printedRgbSha256);repeatedNativeProbes++;}
for(const output of e.outputs)assert.equal(hash(await readFile(output.path)),output.sha256);
for(const code of e.code)assert.equal(hash(await readFile(code.path)),code.sha256);
const report={status:'local-integration-candidate',evidence:{path,sha256:hash(bytes)},frames:360,designCombinations:4,protectedChanges,outsideCoverageChanges:outside,frontIndependentFrames,repeatedNativeProbes,unitTests:5,apiCalls:0,productionAccepted:false};
await writeFile('runs/20261109-pamela-two-sided-flip/take-03/verification.json',JSON.stringify(report,null,2));
await writeFile('references/pamela-two-sided-review.json',JSON.stringify({schemaVersion:1,...report},null,2));console.log(JSON.stringify(report));
