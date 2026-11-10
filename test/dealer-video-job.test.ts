import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkJob, hash, statusJob, submitJob, validatePlan, type VideoJobPlan } from '../tools/dealer-video-job.ts';

const priorId = '8701dcbb-239d-4e60-a887-bd431e90f3d1';
const taskId = '12345678-1234-1234-1234-123456789abc';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz8AAAAASUVORK5CYII=', 'base64');
async function fixture(t: any, cap = 300) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dealer-video-job-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root,'runs/pilot/inputs'), { recursive: true });
  await writeFile(path.join(root,'.env.local'), 'RUNWAY_API_KEY=test-placeholder-not-a-secret\n');
  for (const name of ['first','last']) await writeFile(path.join(root,`runs/pilot/inputs/${name}.png`),png);
  const budget = JSON.stringify({ schemaVersion:1, maximumCredits:cap, maximumJobs:5, authorization:'Test-only authority; mocked network' });
  await writeFile(path.join(root,'runs/pilot/budget.json'),budget);
  const plan: VideoJobPlan = { schemaVersion:1, id:'pilot-one', dealerId:'pamela-pilot', role:'direct-return-test', model:'wan3', ratio:'auto_1080p', duration:3, audio:false,
    maximumCredits:60, creditsPerSecond:20, maximumPostAttempts:1, budget:{path:'runs/pilot/budget.json',sha256:hash(budget)},providerPriorTaskId:priorId,
    inputs:['first','last'].map(position=>({position:position as 'first'|'last',path:`runs/pilot/inputs/${position}.png`,sha256:hash(png),width:1,height:1})),
    promptText:'Direct return to rest.',promptSha256:hash('Direct return to rest.'),dependencies:[],expected:{width:1,height:1,fps:30,frames:90},
    modelSupport:{checkedAt:'2026-11-10T03:50:00Z',sources:['https://docs.dev.runwayml.com/guides/pricing/']},productionAccepted:false };
  async function save(value = plan) {
    const relative = `runs/pilot/${value.id}/plan.json`, content = JSON.stringify(value);
    await mkdir(path.dirname(path.join(root,relative)),{recursive:true}); await writeFile(path.join(root,relative),content);
    return { relative, sha:hash(content), plan:value };
  }
  return {root,save,...await save()};
}
function mockedApi(post: (init: RequestInit)=>Promise<Response>) {
  let posts=0, reads=0;
  const fetcher = async (input: any, init: RequestInit = {}) => {
    const url=String(input);
    if(init.method==='POST') { posts++; assert.equal(url,'https://api.dev.runwayml.com/v1/image_to_video'); return post(init); }
    reads++;
    if(url.endsWith('/v1/organization')) return Response.json({creditBalance:1000});
    assert.equal(url,'https://api.dev.runwayml.com/v1/tasks/'+priorId);
    return Response.json({id:priorId,status:'SUCCEEDED'});
  };
  return {fetcher:fetcher as typeof fetch, counts:()=>({posts,reads})};
}

test('check is offline and submit persists exact input request and task ID only once',async t=>{
  const f=await fixture(t); const checked=await checkJob(f.root,f.relative,f.sha);
  assert.equal(checked.networkWrites,0); assert.equal(checked.attempted,false);
  const api=mockedApi(async init=>{
    const intent=JSON.parse(await readFile(path.join(f.root,'runs/pilot/pilot-one/submit-intent.json'),'utf8'));
    const body=JSON.parse(String(init.body)); assert.equal(intent.wireRequestSha256,hash(String(init.body)));
    assert.deepEqual(body.promptImage.map((input:any)=>input.position),['first','last']);
    assert.equal(body.duration,3); assert.equal(body.audio,false);
    return Response.json({id:taskId,estimatedCost:{credits:60}});
  });
  const result=await submitJob(f.root,f.relative,f.sha,api.fetcher);
  assert.equal(result.taskId,taskId); assert.equal(result.state,'SUBMITTED');
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/already attempted/);
  assert.equal(api.counts().posts,1);
  const receipt=JSON.parse(await readFile(path.join(f.root,'runs/pilot/pilot-one/task.json'),'utf8'));
  assert.equal(receipt.planSha256,f.sha);
});

test('unknown submission cannot be retried even when the provider response was lost',async t=>{
  const f=await fixture(t), api=mockedApi(async()=>{throw Error('Connection lost after request');});
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/Connection lost/);
  const state=JSON.parse(await readFile(path.join(f.root,'runs/pilot/pilot-one/state.json'),'utf8'));
  assert.equal(state.state,'SUBMISSION_OUTCOME_UNKNOWN_NO_RETRY');
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/already attempted/);
  assert.equal(api.counts().posts,1);
});

test('a missing task ID retains the reservation and prevents another POST',async t=>{
  const f=await fixture(t), api=mockedApi(async()=>Response.json({status:'accepted'}));
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/Missing task ID/);
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/already attempted/);
  assert.equal(api.counts().posts,1);
  const reservation=JSON.parse(await readFile(path.join(f.root,'runs/pilot/reservations/pilot-one.json'),'utf8'));
  assert.equal(reservation.maximumCredits,60);
});

test('copying the same plan into another folder cannot bypass a prior uncertain POST', async t=>{
  const f=await fixture(t), api=mockedApi(async()=>{throw Error('unknown');});
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/unknown/);
  const copied='runs/pilot/copied-job/plan.json';
  await mkdir(path.dirname(path.join(f.root,copied)),{recursive:true});
  await writeFile(path.join(f.root,copied),await readFile(path.join(f.root,f.relative)));
  await assert.rejects(submitJob(f.root,copied,f.sha,api.fetcher),/already reserved/);
  assert.equal(api.counts().posts,1);
});

test('an unexplained terminal wallet decrease blocks the next job even with a normal task cost',async t=>{
  const f=await fixture(t),api=mockedApi(async()=>Response.json({id:taskId,estimatedCost:{credits:60}}));
  await submitJob(f.root,f.relative,f.sha,api.fetcher);
  const terminalFetch=async(input:any)=>{
    if(String(input).endsWith('/v1/organization')) return Response.json({creditBalance:900});
    assert.equal(String(input),'https://api.dev.runwayml.com/v1/tasks/'+taskId);
    return Response.json({id:taskId,status:'FAILED',cost:{credits:60}});
  };
  const status=await statusJob(f.root,f.relative,f.sha,terminalFetch as typeof fetch);
  assert.equal(status.reportedCredits,60); assert.equal(status.walletDelta,100);
  assert.equal(status.walletDeltaIsNotInvoice,true); assert.equal(status.costAnomaly,true);
  const second=await f.save({...f.plan,id:'pilot-two'});
  await assert.rejects(submitJob(f.root,second.relative,second.sha,api.fetcher),/cost needs reconciliation/);
  assert.equal(api.counts().posts,1);
});

test('a changed input or plan is refused before any API access',async t=>{
  const f=await fixture(t), api=mockedApi(async()=>assert.fail('Unexpected POST'));
  await assert.rejects(submitJob(f.root,f.relative,'0'.repeat(64),api.fetcher),/hash changed/);
  await writeFile(path.join(f.root,'runs/pilot/inputs/first.png'),Buffer.from('changed'));
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/hash changed/);
  assert.deepEqual(api.counts(),{posts:0,reads:0});
});

test('shared cap includes earlier and uncertain reservations',async t=>{
  const f=await fixture(t,60), api=mockedApi(async()=>{throw Error('unknown');});
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/unknown/);
  const second=await f.save({...f.plan,id:'pilot-two'});
  await assert.rejects(submitJob(f.root,second.relative,second.sha,api.fetcher),/credit limit/);
  assert.equal(api.counts().posts,1);
});

test('cost anomaly retains a durable task receipt for reconciliation',async t=>{
  const f=await fixture(t),api=mockedApi(async()=>Response.json({id:taskId,estimatedCost:{credits:61}}));
  const result=await submitJob(f.root,f.relative,f.sha,api.fetcher);
  assert.equal(result.costAnomaly,true); assert.equal(result.taskId,taskId);
  await assert.rejects(submitJob(f.root,f.relative,f.sha,api.fetcher),/already attempted/);
  const second=await f.save({...f.plan,id:'pilot-two'});
  await assert.rejects(submitJob(f.root,second.relative,second.sha,api.fetcher),/cost needs reconciliation/);
  assert.equal(api.counts().posts,1);
});

test('the request cannot silently enlarge cost, change provider model or fake production acceptance',async t=>{
  const f=await fixture(t);
  for(const patch of [{maximumCredits:59},{duration:4},{model:'unknown'},{productionAccepted:true},{maximumPostAttempts:2}]) {
    assert.throws(()=>validatePlan({...f.plan,...patch} as VideoJobPlan));
  }
});
