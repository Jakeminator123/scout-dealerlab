import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createLabServer } from '../src/server.ts';

test('browser connections protect hidden tabs, reloads and a second tab; the last close stops only this server', async t => {
  const lab = createLabServer(process.cwd(), { autoStopDelayMs: 100 });
  lab.server.listen(0, '127.0.0.1'); await once(lab.server, 'listening');
  const address = lab.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const sessions: ReturnType<typeof get>[] = [];
  t.after(() => { sessions.forEach(session => session.destroy()); lab.server.closeAllConnections(); lab.server.close(); });
  async function open() {
    const request = get(base + '/api/session'); sessions.push(request);
    const [response] = await once(request, 'response'); response.resume();
    assert.equal(response.headers['content-type'], 'text/event-stream'); return request;
  }
  const status = async () => (await fetch(base + '/api/lifecycle')).json();
  assert.equal((await status()).armed, false);
  const first = await open(), second = await open();
  first.destroy(); await delay(160);
  assert.equal(lab.server.listening, true); assert.equal((await status()).connectedTabs, 1);
  second.destroy();
  const replacement = await open(); await delay(160);
  assert.equal(lab.server.listening, true); assert.equal((await status()).scheduledAt, null);
  const closed = once(lab.server, 'close', { signal: AbortSignal.timeout(3000) });
  replacement.destroy(); await closed;
  assert.equal(lab.server.listening, false);
});

test('foreign pages cannot open a session or affect the lifecycle', async t => {
  const lab = createLabServer(process.cwd(), { autoStopDelayMs: 100 });
  lab.server.listen(0, '127.0.0.1'); await once(lab.server, 'listening');
  t.after(() => { lab.server.closeAllConnections(); lab.server.close(); });
  const address = lab.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(base + '/api/session', { headers: { Origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal((await (await fetch(base + '/api/lifecycle')).json()).armed, false);
});
