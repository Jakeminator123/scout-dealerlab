import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { createReadStream } from 'node:fs';
import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { safeFile, byteRange, createExperiment, saveReview } from './library.ts';
import { studioData, inspectAsset, exactFrame, remoteAssets, importAsset } from './media.ts';
import { browserLifecycle } from './browser-lifecycle.ts';
import { reviewContext, llmOverview, reviewDocuments } from './review-context.ts';
import { reviewMaterial } from './material-review.ts';
import { createMaudLab } from './maud-lab/service.ts';
import { checkedPamelaBundle } from './pamela-bundle-download.ts';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const href = (value: string) => '/files/' + value.split('/').map(encodeURIComponent).join('/');
const types: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };

export function createLabServer(root: string, options: { shutdownToken?: string; autoStopDelayMs?: number; nextHandler?: (req: IncomingMessage, res: ServerResponse) => Promise<void> } = {}) {
  const instanceId = randomUUID();
  const startedAt = new Date().toISOString();
  const formToken = randomBytes(24).toString('hex');
  const shutdownToken = options.shutdownToken ?? randomBytes(32).toString('hex');
  const maudLab = createMaudLab(root, formToken);
  const connections = new Set<Socket>();
  let activeWork = 0;
  function stop() { void maudLab.stop().catch(error => console.error('Maud-GPU: avstängning behöver kontrolleras.')).finally(() => { server.close(); server.closeAllConnections(); for (const socket of connections) socket.destroy(); }); }
  const lifecycle = browserLifecycle(options.autoStopDelayMs ?? 0, stop, () => activeWork > 0);
  const csrf = `<input type="hidden" name="csrf" value="${formToken}">`;
  const layout = (body: string) => `<!doctype html><html lang="sv"><meta charset="utf-8"><title>Dealerstudio</title><body>${body}</body></html>`;
  function respond(res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8') { res.writeHead(status, { 'Content-Type': type }); res.end(body); }
  async function readForm(req: IncomingMessage) {
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 20000) throw new Error('Formuläret är för stort'); }
    const params = new URLSearchParams(body);
    if (params.get('csrf') !== formToken) throw new Error('Ladda om sidan före sparning');
    return Object.fromEntries(params);
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Preserve Origin on same-origin HTML POSTs; no-referrer makes browsers send Origin: null.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    const nonce = randomBytes(16).toString('base64');
    const csp = `default-src 'none'; img-src 'self' data:; media-src 'self'; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}' 'unsafe-eval'; connect-src 'self' ws://127.0.0.1:4318; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
    res.setHeader('Content-Security-Policy', csp);
    const address = server.address();
    const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 4318}`;
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return respond(res, 403, 'Otillåten avsändare', 'text/plain; charset=utf-8');
    const holdsServer = req.method === 'POST' || /^\/api\/(inspect|frame|remote)(?:\?|$)/.test(req.url || '');
    if (holdsServer) activeWork++;
    try {
      const url = new URL(req.url ?? '/', origin);
      if (await maudLab.handle(req, res, url)) return;
      if (req.method === 'GET' && url.pathname === '/api/session') { lifecycle.connect(res); return; }
      if (req.method === 'GET' && ['/pamela-bord', '/pamela-bord-runtime.js'].includes(url.pathname)) {
        const artifact = 'runs/20261110-pamela-bordskalibrering/take-04';
        if (url.pathname.endsWith('.js')) return respond(res, 200, await readFile(path.join(root, artifact, 'build/table.js'), 'utf8'), 'text/javascript; charset=utf-8');
        const document = (await readFile(path.join(root, artifact, 'index.html'), 'utf8'))
          .replace('src="build/table.js"', 'src="/pamela-bord-runtime.js"')
          .replace('href="binding.json"', `href="/files/${artifact}/binding.json"`)
          .replace('href="assets-v2/media.json"', `href="/files/${artifact}/assets-v2/media.json"`)
          .replace('href="README.txt"', `href="/files/${artifact}/README.txt"`);
        return respond(res, 200, document);
      }
      if (req.method === 'GET' && url.pathname === '/api/lifecycle') return respond(res, 200, JSON.stringify(lifecycle.status()), 'application/json');
      if (req.method === 'GET' && url.pathname === '/agent-context.json') return respond(res, 200, JSON.stringify({ ...await reviewContext(root), page: url.searchParams.get('page') || 'studio' }), 'application/json; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/llms.txt') return respond(res, 200, llmOverview(await reviewContext(root)), 'text/plain; charset=utf-8');
      if (req.method === 'GET' && url.pathname.startsWith('/files/references/') && reviewDocuments.some(doc => '/files/' + doc.source === url.pathname)) return respond(res, 200, await readFile(path.join(root, url.pathname.slice(7)), 'utf8'), 'application/json; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/health') return respond(res, 200, JSON.stringify({ app: 'snyggare-dealer', root, pid: process.pid, instanceId, startedAt }), 'application/json');
      if (req.method === 'GET' && url.pathname === '/api/studio') return respond(res, 200, JSON.stringify(await studioData(root, formToken)), 'application/json; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/inspect') return respond(res, 200, JSON.stringify(await inspectAsset(root, url.searchParams.get('path') || '')), 'application/json; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/frame') return respond(res, 200, JSON.stringify(await exactFrame(root, url.searchParams.get('path') || '', Number(url.searchParams.get('frame')))), 'application/json; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/remote') return respond(res, 200, JSON.stringify(await remoteAssets(root, url.searchParams.get('source') || '', url.searchParams.get('cursor') || undefined)), 'application/json; charset=utf-8');
      if (req.method === 'POST' && url.pathname === '/api/material-review') {
        const form = await readForm(req);
        return respond(res, 200, JSON.stringify(await reviewMaterial(root, [form.a || '', form.b || form.a || ''])), 'application/json; charset=utf-8');
      }
      if (req.method === 'POST' && url.pathname === '/imports') {
        const form = await readForm(req);
        const imported = await importAsset(root, { sourceType: form.sourceType || '', url: form.url || '', note: form.note || '' });
        res.writeHead(303, { Location: `/?imported=${encodeURIComponent(imported.path)}` }); return res.end();
      }
      if (req.method === 'POST' && url.pathname === '/api/shutdown') {
        if (req.headers['x-dealer-control'] !== shutdownToken) return respond(res, 403, 'Fel kontrollnyckel', 'text/plain');
        respond(res, 200, 'Servern stängs', 'text/plain; charset=utf-8');
        setImmediate(stop);
        return;
      }
      if (['GET', 'HEAD'].includes(req.method ?? '') && url.pathname.startsWith('/files/')) {
        const relative = decodeURIComponent(url.pathname.slice(7));
        const isZip = path.extname(relative).toLowerCase() === '.zip';
        const type = isZip ? 'application/zip' : types[path.extname(relative).toLowerCase()];
        if (!type) return respond(res, 404, 'Filtypen visas inte', 'text/plain');
        let filename;
        try { filename = isZip ? await checkedPamelaBundle(root, relative) : await safeFile(root, relative); } catch { return respond(res, 404, 'Filen finns inte i materialytan', 'text/plain'); }
        const size = (await stat(filename)).size;
        let range;
        try { range = byteRange(req.headers.range, size); } catch { res.setHeader('Content-Range', `bytes */${size}`); return respond(res, 416, 'Ogiltigt intervall', 'text/plain'); }
        // Reference HTML can display local media and styling, but cannot execute scripts or send forms.
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'");
        if (isZip) res.setHeader('Content-Disposition', 'attachment; filename="pamela-14-scenklipp.zip"');
        res.writeHead(range ? 206 : 200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': range ? range.end - range.start + 1 : size, ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}) });
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(filename, range ?? {});
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/experiments') {
        const form = await readForm(req);
        const job = await createExperiment(root, { title: form.title ?? '', source: form.source ?? '', reference: form.reference ?? '', note: form.note ?? '' });
        res.writeHead(303, { Location: `/?run=${job.id}&saved=plan` }); return res.end();
      }
      if (req.method === 'POST' && url.pathname === '/reviews') {
        const form = await readForm(req);
        await saveReview(root, { runId: form.runId ?? '', asset: form.asset ?? '', decision: form.decision ?? '', note: form.note ?? '' });
        res.writeHead(303, { Location: `/?run=${encodeURIComponent(form.runId)}&saved=review` }); return res.end();
      }
      if (options.nextHandler && (url.pathname === '/' || url.pathname === '/admin-prototyp' || url.pathname === '/materialprov' || url.pathname === '/komposition' || url.pathname === '/studio' || url.pathname === '/pamela-prov' || url.pathname === '/pamela-sidprov' || url.pathname === '/pamela-returer' || url.pathname === '/maud-test' || url.pathname.startsWith('/_next/') || (url.pathname.startsWith('/__nextjs_font/') && url.pathname.endsWith('.woff2')))) {
        req.headers['content-security-policy'] = csp;
        req.headers['x-nonce'] = nonce;
        await options.nextHandler(req, res); return;
      }
      if (req.method !== 'GET' || url.pathname !== '/') return respond(res, 404, 'Sidan finns inte', 'text/plain; charset=utf-8');
      respond(res, 200, layout('<p>Dealerstudions lokala API</p>' + csrf));
    } catch (error) {
      if (req.url?.startsWith('/api/')) return respond(res, 400, JSON.stringify({ error: error instanceof Error ? error.message : 'Okänt fel' }), 'application/json; charset=utf-8');
      respond(res, 400, layout(`<h1>Kunde inte slutföra</h1><p>${escape(error instanceof Error ? error.message : 'Okänt fel')}</p><a href="/">Tillbaka till arbetsytan</a>`));
    } finally { if (holdsServer) activeWork--; }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)); });
  server.on('close', () => lifecycle.dispose());
  return { server, instanceId, startedAt, shutdownToken };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
  const port = 4318;
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  const next = (await import('next')).default;
  const nextApp = next({ dev: true, dir: root, hostname: '127.0.0.1', port });
  await nextApp.prepare();
  const lab = createLabServer(root, { nextHandler: nextApp.getRequestHandler(), autoStopDelayMs: 60000 });
  lab.server.on('close', () => { void nextApp.close().finally(() => process.exit(0)); });
  lab.server.on('error', (error: NodeJS.ErrnoException) => { console.error(error.code === 'EADDRINUSE' ? 'Port 4318 används redan. Ingen annan process stoppades.' : error.message); process.exitCode = 1; });
  lab.server.listen(port, '127.0.0.1', async () => {
    try {
      // Runtime files are private control data, outside every served material root.
      // The actual directory is prepared by the launcher (or here for npm start).
      const { mkdir, realpath } = await import('node:fs/promises');
      await mkdir(path.join(root, '.runtime'), { recursive: true });
      if (await realpath(path.join(root, '.runtime')) !== path.join(await realpath(root), '.runtime')) throw new Error('Oväntad runtime-sökväg');
      const state = { app: 'snyggare-dealer', root, pid: process.pid, parentPid: process.ppid, executable: process.execPath, script: fileURLToPath(import.meta.url), port, instanceId: lab.instanceId, startedAt: lab.startedAt, shutdownToken: lab.shutdownToken };
      const temporaryState = path.join(root, `.runtime/server-${lab.instanceId}.tmp`);
      await writeFile(temporaryState, JSON.stringify(state, null, 2), { flag: 'wx' });
      await rename(temporaryState, path.join(root, '.runtime/server.json'));
      console.log(`Snyggare dealer: http://127.0.0.1:${port} · PID ${process.pid}`);
    } catch (error) { console.error((error as Error).message); lab.server.close(); process.exitCode = 1; }
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { lab.server.close(); lab.server.closeIdleConnections(); });
}
