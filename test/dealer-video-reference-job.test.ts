import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReferencePayload, checkJob, hash, statusJob, submitJob, validatePlan, type VideoJobPlan } from '../tools/dealer-video-reference-job.ts';

const priorId = '8701dcbb-239d-4e60-a887-bd431e90f3d1', taskId = '12345678-1234-1234-1234-123456789abc';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=', 'base64');
const video = execFileSync('ffmpeg', ['-v','error','-nostdin','-f','lavfi','-i','color=c=green:s=16x16:r=30','-frames:v','6','-an','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-f','mp4','-movflags','frag_keyframe+empty_moov','pipe:1'], { windowsHide:true });
async function fixture(t: any) {
  const prefix = path.join(os.tmpdir(), 'dealer-video-reference-test-'), root = await mkdtemp(prefix);
  t.after(async () => { assert.ok(path.resolve(root).startsWith(path.resolve(prefix))); await rm(root, { recursive:true, force:true }); });
  await mkdir(path.join(root,'runs/pilot/inputs'),{recursive:true}); await mkdir(path.join(root,'tools'));
  await writeFile(path.join(root,'.env.local'),'RUNWAY_API_KEY=test-placeholder\n');
  for (const name of ['one','two']) await writeFile(path.join(root,`runs/pilot/inputs/${name}.png`),png);
  await writeFile(path.join(root,'runs/pilot/inputs/reference.mp4'),video);
  const runner = await readFile(new URL('../tools/dealer-video-reference-job.ts', import.meta.url));
  await writeFile(path.join(root,'tools/dealer-video-reference-job.ts'),runner);
  const budget = JSON.stringify({schemaVersion:1,maximumCredits:120,maximumJobs:1,authorization:'Mocked test only'});
  await writeFile(path.join(root,'runs/pilot/budget.json'),budget);
  const prompt = 'Image 1 is the initial scene; Image 2 is the landing target. Video 1 is a single wrist turn.';
  const plan: VideoJobPlan = {schemaVersion:1,id:'reference-one',dealerId:'pamela-pilot',role:'physical-turn-test',mode:'reference',model:'wan3',ratio:'auto_1080p',duration:6,audio:false,
    maximumCredits:120,creditsPerSecond:20,maximumPostAttempts:1,budget:{path:'runs/pilot/budget.json',sha256:hash(budget)},providerPriorTaskId:priorId,
    inputs:['one','two'].map(n=>({path:`runs/pilot/inputs/${n}.png`,sha256:hash(png),width:1,height:1})),
    referenceVideos:[{path:'runs/pilot/inputs/reference.mp4',sha256:hash(video),mimeType:'video/mp4',width:16,height:16,fps:30,frames:6,seconds:0.2}],
    promptText:prompt,promptSha256:hash(prompt),dependencies:[{path:'tools/dealer-video-reference-job.ts',sha256:hash(runner)}],expected:{width:16,height:16,fps:30,frames:180},
    modelSupport:{checkedAt:'2026-11-10T07:00:00Z',sources:['https://docs.dev.runwayml.com/openapi.json']},productionAccepted:false};
  async function save(p=plan,folder=p.id) {const relative=`runs/pilot/${folder}/plan.json`,bytes=JSON.stringify(p);await mkdir(path.dirname(path.join(root,relative)),{recursive:true});await writeFile(path.join(root,relative),bytes);return {relative,sha:hash(bytes)};}
  return {root,plan,save,...await save()};
}
function api(post:(init:RequestInit)=>Promise<Response>) {
  let posts=0,reads=0;
  const fetcher=async(input:any,init:RequestInit={})=>{const url=String(input);if(init.method==='POST'){posts++;assert.equal(url,'https://api.dev.runwayml.com/v1/image_to_video');return post(init);}reads++;if(url.endsWith('/v1/organization'))return Response.json({creditBalance:1000});assert.equal(url,'https://api.dev.runwayml.com/v1/tasks/'+priorId);return Response.json({id:priorId,status:'SUCCEEDED'});};
  return {fetcher:fetcher as typeof fetch,counts:()=>({posts,reads})};
}

test('reference payload omits all keyframe positions and rejects mixed mode or altered bytes',async t=>{
  const f=await fixture(t),p=buildReferencePayload(f.plan,[png,png],[video]);
  assert.deepEqual(p.promptImage.map(x=>Object.keys(x)),[['uri'],['uri']]);
  assert.equal(p.referenceVideos[0].type,'video');assert.ok(p.referenceVideos[0].uri.startsWith('data:video/mp4;base64,'));
  const mixed=structuredClone(f.plan);Object.assign(mixed.inputs[0],{position:'first'});assert.throws(()=>validatePlan(mixed),/omit position/);
  assert.throws(()=>buildReferencePayload(f.plan,[png,png],[Buffer.from('changed')]),/Video reference hash changed/);
  assert.throws(()=>validatePlan({...f.plan,mode:'keyframe'} as any));
});

test('offline reference verification checks actual video hash before any API request',async t=>{
  const f=await fixture(t);assert.equal((await checkJob(f.root,f.relative,f.sha)).networkWrites,0);
  await writeFile(path.join(f.root,'runs/pilot/inputs/reference.mp4'),Buffer.from('changed'));
  const mock=api(async()=>assert.fail('POST is forbidden'));
  await assert.rejects(submitJob(f.root,f.relative,f.sha,mock.fetcher),/hash changed/);assert.deepEqual(mock.counts(),{posts:0,reads:0});
});

test('intent and reservation precede the only POST; unknown result cannot be retried or copied',async t=>{
  const f=await fixture(t),mock=api(async init=>{
    const intent=JSON.parse(await readFile(path.join(f.root,'runs/pilot/reference-one/submit-intent.json'),'utf8'));
    const reservation=JSON.parse(await readFile(path.join(f.root,'runs/pilot/reservations/reference-one.json'),'utf8'));
    assert.equal(intent.wireRequestSha256,hash(String(init.body)));assert.equal(reservation.maximumCredits,120);
    assert.equal(reservation.planSha256,f.sha);throw Error('Simulated lost response');
  });
  await assert.rejects(submitJob(f.root,f.relative,f.sha,mock.fetcher),/lost response/);
  await assert.rejects(submitJob(f.root,f.relative,f.sha,mock.fetcher),/already attempted/);
  const copy=await f.save(f.plan,'copy');await assert.rejects(submitJob(f.root,copy.relative,copy.sha,mock.fetcher),/already reserved/);
  assert.equal(mock.counts().posts,1);
  const state=JSON.parse(await readFile(path.join(f.root,'runs/pilot/reference-one/state.json'),'utf8'));assert.equal(state.state,'SUBMISSION_OUTCOME_UNKNOWN_NO_RETRY');
});

test('task ID is durable and native mismatch preserves the unscaled original',async t=>{
  const f=await fixture(t),mock=api(async()=>Response.json({id:taskId,estimatedCost:{credits:120}}));
  const submitted=await submitJob(f.root,f.relative,f.sha,mock.fetcher);assert.equal(submitted.taskId,taskId);
  const receipt=JSON.parse(await readFile(path.join(f.root,'runs/pilot/reference-one/task.json'),'utf8'));assert.equal(receipt.taskId,taskId);assert.equal(receipt.planSha256,f.sha);
  const fetcher=async(input:any)=>{const url=String(input);if(url.endsWith('/v1/organization'))return Response.json({creditBalance:880});if(url.endsWith('/v1/tasks/'+taskId))return Response.json({id:taskId,status:'SUCCEEDED',cost:{credits:120},output:['https://test.cloudfront.net/result.mp4']});assert.equal(url,'https://test.cloudfront.net/result.mp4');return new Response(video);};
  const status=await statusJob(f.root,f.relative,f.sha,fetcher as typeof fetch);
  assert.equal(status.state,'ORIGINAL_PRESERVED_NATIVE_MISMATCH');assert.equal(status.reportedCredits,120);assert.equal(status.costAnomaly,false);
  assert.equal(hash(await readFile(path.join(f.root,'runs/pilot/reference-one/original.mp4'))),hash(video));
  const proof=JSON.parse(await readFile(path.join(f.root,'runs/pilot/reference-one/native-verification.json'),'utf8'));assert.equal(proof.passed,false);assert.deepEqual(proof.transforms,[]);
});
