import assert from 'node:assert/strict';
import { lstat, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

export type ReviewReference = { path: string; sha256?: string };

/** Applies to source paths and copies nested under an export's static directory. */
export function privateReviewPath(source: string): boolean {
  const value = source.replaceAll('\\', '/');
  return /(?:private|\.env|admin-protot|maud-lab|runpod|wallet|credential|account|ATKOMST|INTEGRATION|agent-roles|handoff)/i.test(value)
    || value.split('/').some(part => /^(?:state(?:[-_.].*)?|submit[-_]?intent(?:[-_.].*)?|budget[^/]*)\.json(?:\.(?:gz|txt))?$/i.test(part));
}

export function publicReviewSource(source: string): boolean {
  return /^(runs|references|docs|src|tools|scripts|gpt-underlag)\//.test(source)
    && !source.includes('\\') && !source.split('/').some(part => !part || part === '..' || part.startsWith('.'))
    && !privateReviewPath(source);
}

/** Return only the field name, never its private value. Cost and task IDs remain public. */
export function privateReviewJsonField(text: string): string | undefined {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return; }
  function inspect(item: unknown): string | undefined {
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (/(?:balance|saldo|wallet|credential|submitintent)/.test(normalized)
        || /^(?:apikey|authtoken|accesstoken|refreshtoken|clientsecret|password|remainingcredits|availablecredits|creditsremaining|creditsavailable)$/.test(normalized)) return key;
      const nested = inspect(child); if (nested) return nested;
    }
  }
  return inspect(value);
}

/** A plain .path string must never overwrite its object's explicit hash. */
export function reviewReferences(value: unknown): ReviewReference[] {
  const found = new Map<string, Set<string>>();
  const remember = (source: string, sha256?: string) => {
    if (!/^(runs|references|docs|src|tools|scripts|gpt-underlag)\//.test(source)
      || !/\.(json|md|txt|ts|tsx|js|css|svg|png|jpg|jpeg|mp4|webm|zip|gz)$/.test(source)) return;
    const hashes = found.get(source) ?? new Set<string>();
    if (sha256 !== undefined) hashes.add(sha256);
    found.set(source, hashes);
  };
  function visit(item: unknown) {
    if (typeof item === 'string') remember(item);
    else if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      if (typeof record.path === 'string') remember(record.path, typeof record.sha256 === 'string' ? record.sha256 : undefined);
      for (const [key, child] of Object.entries(record)) if (key !== 'path' && key !== 'sha256') visit(child);
    }
  }
  visit(value);
  return [...found].flatMap(([source, hashes]) => hashes.size ? [...hashes].map(sha256 => ({ path: source, sha256 })) : [{ path: source }]);
}

export function reviewHashMatches(actual: string, expected: string | undefined, required: boolean, source: string): boolean {
  if (expected === undefined || (/^[a-f0-9]{64}$/.test(expected) && actual === expected)) return true;
  assert.ok(!required, 'Changed selected input ' + source);
  return false;
}

/** Unlink copies only: the owned export must be a distinct child of exports/. */
export async function purgePrivateReviewCopies(workspace: string, ownedExport: string, baselineExport: string): Promise<string[]> {
  const exportsRoot = path.resolve(workspace, 'exports'), owned = path.resolve(workspace, ownedExport);
  assert.equal(path.dirname(owned), exportsRoot, 'Cleanup target must be one owned export');
  assert.notEqual(owned.toLowerCase(), path.resolve(workspace, baselineExport).toLowerCase(), 'Never clean the baseline');
  const staticRoot = path.join(owned, '.vercel', 'output', 'static');
  for (const current of [exportsRoot, owned, path.join(owned, '.vercel'), path.join(owned, '.vercel', 'output'), staticRoot]) {
    const info = await lstat(current); assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe cleanup ancestor');
  }
  const removed: string[] = [];
  async function walk(directory: string) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      assert.ok(!item.isSymbolicLink(), 'Linked export copy');
      const target = path.resolve(directory, item.name), relative = path.relative(staticRoot, target).replaceAll('\\', '/');
      assert.ok(target.startsWith(staticRoot + path.sep), 'Cleanup outside owned static export');
      if (item.isDirectory()) await walk(target);
      else if (item.isFile()) {
        const privateData = !privateReviewPath(relative) && /\.(?:json|txt)$/i.test(item.name) && privateReviewJsonField(await readFile(target, 'utf8'));
        if (privateReviewPath(relative) || privateData) { await unlink(target); removed.push(relative); }
      }
    }
  }
  await walk(staticRoot); return removed;
}
