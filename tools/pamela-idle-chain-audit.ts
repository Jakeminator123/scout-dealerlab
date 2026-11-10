/** Bounded independent source audit; writes only its new run. No service calls. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
type Ref = { path: string; sha256: string };
const OUT = 'runs/20261110-pamela-idle-chain-audit';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const ref = async (path: string) => ({ path, sha256: hash(await readFile(path)) });
const verified: Ref[] = [];
async function checked(r: Ref) { const b = await readFile(r.path); assert.equal(hash(b), r.sha256, r.path); verified.push(r); return b; }
async function bound(r: Ref) { return JSON.parse((await checked(r)).toString()); }
const save = (p: string, v: unknown) => writeFile(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
assert.equal(process.version, 'v24.21.0'); sharp.concurrency(1);
await mkdir(OUT); await mkdir(`${OUT}/native`); await mkdir(`${OUT}/decoded`);
const registry = await read('references/pamela-two-sided-bank.json');
const bank = await bound(registry.evidence), plan = await bound(bank.plan);
for (const key of ['nativeReview', 'patchNative', 'patchBrowser', 'browserReview']) await checked(registry[key]);
for (const r of plan.scene) await checked(r);
const rest = await read('references/pamela-rest-ready-review.json');
await checked(rest.entryEvidence); await checked(rest.generationPlan); await checked(rest.bridgeSeams);
const overlap = await bound(rest.processedExitCandidate.evidence); await checked(rest.processedExitCandidate.browserReview);
await checked(overlap.sourceEvidence);
const sourceQa = await bound(overlap.sourceEvidence);
for (const r of sourceQa.sourceBindings) await checked(r);
const windowRegistry = await read('references/pamela-idle-window-review.json');
const windows = await bound(windowRegistry.evidence); await checked(windowRegistry.rootReview); await checked(windows.frameMap);
const survey = await read('runs/20261109-pamela-rest-ready-seam-survey/take-01/evidence.json');
for (const id of ['B', 'retreat', 'last']) await checked(survey.sourceBindings.find((r: any) => r.id === id));
const part = await bound(bank.parts[0]); await checked(part.output); await checked(part.source);
await checked(part.selection.evidence); await checked(part.selection.review);
const trim = bank.trimmed[0]; await checked(trim.output);
for (const outer of bank.outer) if (outer.id === 'to-vila') await checked(outer.output);
for (const r of bank.landed.filter((r: any) => r.id.startsWith('C2-'))) await checked(r);
const extracted: any[] = [];
function decode(path: string, start: number, count: number, id: string) {
  execFileSync('ffmpeg', ['-v','error','-nostdin','-n','-threads','1','-i',path,'-vf',`select=between(n\\,${start}\\,${start+count-1})`,'-fps_mode','passthrough','-frames:v',String(count),'-pix_fmt','rgb24','-start_number',String(start),'-threads','1',`${OUT}/decoded/${id}-%04d.png`], { windowsHide: true });
}
decode(trim.output.path, 0, 7, 'actual-trim');
decode(part.output.path, 17, 7, 'actual-full');
type Img = { label: string; path: string; width: number; sha256?: string; };
const sourceFrame = (source: string, frame: number): Img => {
  const r = sourceQa.frames.find((r: any) => r.source === source && r.frame === frame); assert.ok(r);
  return { label: `${source}${frame}`, path: r.path, width: source === 'bank' ? 1762 : 1764, sha256: r.sha256 };
};
const bFrame = (frame: number): Img => {
  const r = survey.frameBindings.B.find((r: any) => r.frame === frame); assert.ok(r);
  return { label: `B${frame}`, path: r.path, width: 1764, sha256: r.pngSha256 };
};
const surveyFrame = (source: string, frame: number): Img => {
  const r = survey.frameBindings[source].find((r: any) => r.frame === frame); assert.ok(r);
  return { label: `${source}${frame}`, path: r.path, width: source === 'B' ? 1764 : 1762, sha256: r.pngSha256 };
};
const sheets: any[] = [];
async function sheet(id: string, imgs: Img[], roi: { left: number; top: number; width: number; height: number }, cols: number) {
  const layers = [], records = [];
  for (const [i, img] of imgs.entries()) {
    if (img.sha256) await checked({ path: img.path, sha256: img.sha256 });
    const path = `${OUT}/native/${id}-${i}.png`, crop = { ...roi, left: roi.left - (img.width === 1762 ? 1 : 0) };
    const meta = await sharp(img.path).metadata(); assert.equal(meta.width, img.width); assert.equal(meta.height, 1174);
    await sharp(img.path).extract(crop).png().toFile(path);
    const r = { ...await ref(path), source: await ref(img.path), label: img.label, crop, noResize: true }; records.push(r);
    const left = i % cols * roi.width, top = Math.floor(i / cols) * (roi.height + 22);
    layers.push({ input: path, left, top: top + 22 }, { input: Buffer.from(`<svg width="${roi.width}" height="22"><rect width="100%" height="100%" fill="#17252d"/><text x="4" y="16" font-size="14" fill="white">${img.label}</text></svg>`), left, top });
  }
  const path = `${OUT}/${id}.png`;
  await sharp({ create: { width: cols * roi.width, height: Math.ceil(imgs.length / cols) * (roi.height + 22), channels: 3, background: '#17252d' } }).composite(layers).png().toFile(path);
  sheets.push({ id, ...await ref(path), records, nativePixels: true });
}
const contact = { left: 1190, top: 590, width: 510, height: 290 }, face = { left: 730, top: 70, width: 290, height: 340 };
await sheet('bridge-contact', [84,85,86,87,88,89].map(f => sourceFrame('bridge', f)), contact, 2);
await sheet('bank-raw-contact', [17,18,19,20,21,22].map(f => sourceFrame('bank', f)), contact, 2);
await sheet('bank-composed-contact', [0,1,2,3,4,5].map(f => ({ label:`trim${f}=source${f+17}`, path:`${OUT}/decoded/actual-trim-${String(f).padStart(4,'0')}.png`, width:1762 })), contact, 2);
await sheet('B-extension-face', Array.from({length:11},(_,i)=>bFrame(316+i)), face, 4);
await sheet('B-loop-face', [...[324,325,326].map(bFrame),...[289,290,291].map(bFrame)], face, 3);
await sheet('B-bridge-face', [...[324,325,326].map(bFrame),...[6,7,8].map(f=>sourceFrame('bridge',f))], face, 3);
await sheet('return-face', [...[87,88,89].map(f=>surveyFrame('retreat',f)),...[0,1,2].map(bFrame),...[20,21,22,305,306,307].map(bFrame)], face, 3);
await sheet('last-bank-retreat-contact', [...[289,290,291].map(f=>surveyFrame('last',f)),...[1,2,3].map(f=>surveyFrame('retreat',f))], contact, 3);
for (let i=0;i<7;i++) {
  const a=`${OUT}/decoded/actual-trim-${String(i).padStart(4,'0')}.png`, b=`${OUT}/decoded/actual-full-${String(i+17).padStart(4,'0')}.png`;
  const ar=await sharp(a).raw().toBuffer(), br=await sharp(b).raw().toBuffer(); let sum=0,max=0,changed=0;
  for(let p=0;p<ar.length;p++){const d=Math.abs(ar[p]-br[p]);sum+=d;max=Math.max(max,d);if(d)changed++;}
  extracted.push({trimFrame:i,sourceFrame:i+17,trim:await ref(a),full:await ref(b),decodedRgbMae:sum/ar.length,decodedRgbMax:max,changedChannels:changed,lossyComparisonNotSourceDifference:true});
}
await save(`${OUT}/evidence.json`, { status:'source-and-native-material-inspection-prepared', tool:await ref('tools/pamela-idle-chain-audit.ts'), selectedBank:registry.evidence, verifiedRefs:verified, sourceBindings:sourceQa.sourceBindings, windows:windowRegistry.clips, trim:trim.interval, firstCardStates:part.records.filter((r:any)=>r.frame>=17&&r.frame<=23).map((r:any)=>({frame:r.frame,states:r.states,sourceRgbSha256:r.sourceRgbSha256,printedRgbSha256:r.printedRgbSha256,outputRgbSha256:r.outputRgbSha256})), extracts:extracted, sheets, operations:{apiCalls:0,newGeneration:0,maximumConcurrentMediaProcesses:1,ownedLongRunningProcesses:0,sharedFilesModified:false}, limitations:['Actual selected trim/full previews are lossy H264; native PNG crop means decoded native pixels, not lossless pre-encoding source scene.','Still inspection does not establish normal-speed optical acceptance.'] });
console.log(JSON.stringify({run:OUT,verifiedRefs:verified.length,sheets:sheets.map(s=>s.id),extracted:extracted.length}));
