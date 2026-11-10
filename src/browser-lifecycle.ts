import type { ServerResponse } from 'node:http';

/** A live SSE connection survives hidden/minimized tabs; only disconnection starts the grace period. */
export function browserLifecycle(delayMs: number, stop: () => void, busy: () => boolean = () => false) {
  const clients = new Set<ServerResponse>();
  let armed = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let scheduledAt: string | null = null;
  function cancel() { if (deadline) clearTimeout(deadline); deadline = undefined; scheduledAt = null; }
  function schedule(delay = delayMs) {
    cancel();
    if (!delayMs || !armed || clients.size) return;
    scheduledAt = new Date(Date.now() + delay).toISOString();
    deadline = setTimeout(() => {
      deadline = undefined;
      if (clients.size) return;
      if (busy()) { schedule(1000); return; }
      stop();
    }, delay);
    deadline.unref();
  }
  return {
    connect(res: ServerResponse) {
      armed = true; cancel(); clients.add(res);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`event: connected\ndata: ${JSON.stringify({ autoStop: delayMs > 0, graceSeconds: delayMs / 1000 })}\n\n`);
      const heartbeat = setInterval(() => res.write(': still connected\n\n'), 15000);
      heartbeat.unref();
      res.on('close', () => { clearInterval(heartbeat); clients.delete(res); schedule(); });
    },
    status: () => ({ enabled: delayMs > 0, connectedTabs: clients.size, armed, graceSeconds: delayMs / 1000, scheduledAt }),
    dispose() { armed = false; cancel(); for (const client of clients) client.end(); clients.clear(); },
  };
}
