/**
 * Local, explicit-file archive. No recursive source deletion and no automatic prune.
 *
 * node scripts/archive-work-material.ts copy <plan.json>
 * node scripts/archive-work-material.ts prune <archive-batch/manifest.json>
 * node scripts/archive-work-material.ts restore <archive-batch/manifest.json> [runs/relative-file]
 *
 * manifest.json is immutable after a successful copy. status.json records progress;
 * an interrupted operation may leave it "running". Missing sources are reported as
 * alreadyAbsent, never counted as bytes deleted by this invocation.
 */
import { createHash, randomUUID } from 'node:crypto';
import { constants, type BigIntStats } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink, link } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRODUCTION_ROOTS = Object.freeze({
  sourceRoot: 'C:/Users/jakem/dev/super-feature-sg/snyggare-dealer',
  archiveRoot: 'D:/dealerlab-archive/snyggare-dealer',
});
export type ArchiveRoots = { sourceRoot: string; archiveRoot: string };
export type ArchivePlan = ArchiveRoots & {
  schemaVersion: 1; project: 'snyggare-dealer'; batchId: string;
  files: { path: string; reason: string }[];
};
type Fingerprint = { size: number; mtimeNs: string; ctimeNs: string; dev: string; ino: string };
export type ArchivedFile = {
  path: string; reason: string; archivePath: string; sha256: string;
  source: Fingerprint; archive: Fingerprint; copyStatus: 'verified';
};
export type ArchiveManifest = ArchiveRoots & {
  schemaVersion: 1; kind: 'dealerlab-work-material-archive'; project: 'snyggare-dealer';
  batchId: string; createdAt: string; completedAt: string; copyStatus: 'complete';
  plan: { path: string; sha256: string }; fileCount: number; logicalBytes: number;
  files: ArchivedFile[];
};
type OperationStatus = {
  state: 'not-started' | 'running' | 'complete' | 'failed';
  phase?: string; processed: number; verified: number; logicalBytes: number;
  deleted: number; deletedBytes: number; restored: number; restoredBytes: number;
  alreadyAbsent: number; alreadyPresent: number; error?: string; lastPath?: string;
};
type BatchStatus = {
  schemaVersion: 1; project: 'snyggare-dealer'; batchId: string; updatedAt: string;
  manifestSha256: string | null; totalFiles: number; totalLogicalBytes: number;
  copy: OperationStatus; prune: OperationStatus; restore: OperationStatus;
};
type Progress = { operation: string; processed: number; totalFiles: number; logicalBytes: number };
type Options = {
  onProgress?: (progress: Progress) => void;
  /** Deterministic race injection for temporary-root tests; never supplied by the CLI. */
  afterCopyForTest?: (source: string, destination: string) => Promise<void>;
};
const emptyOperation = (): OperationStatus => ({
  state: 'not-started', processed: 0, verified: 0, logicalBytes: 0,
  deleted: 0, deletedBytes: 0, restored: 0, restoredBytes: 0, alreadyAbsent: 0, alreadyPresent: 0,
});
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function fail(message: string): never { throw new Error(message); }
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const key = (p: string) => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
const samePath = (a: string, b: string) => key(a) === key(b);
const within = (root: string, candidate: string) => {
  const relative = path.relative(key(root), key(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const snapshot = (s: BigIntStats): Fingerprint => {
  if (!s.isFile() || !Number.isSafeInteger(Number(s.size))) fail('Expected a regular file with a safe byte count');
  return { size: Number(s.size), mtimeNs: String(s.mtimeNs), ctimeNs: String(s.ctimeNs), dev: String(s.dev), ino: String(s.ino) };
};
const equalFingerprint = (a: Fingerprint, b: Fingerprint) =>
  a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs && a.dev === b.dev && a.ino === b.ino;
const sameIdentity = (a: Fingerprint, b: Fingerprint) => a.dev === b.dev && a.ino === b.ino;
const sameSource = (a: Fingerprint, b: Fingerprint) =>
  sameIdentity(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs;
const identityKey = (f: Fingerprint) => `${f.dev}:${f.ino}`;
function expectFingerprint(actual: Fingerprint, expected: Fingerprint, file: string) {
  if (!equalFingerprint(actual, expected)) fail(`File changed (identity/size/mtime/ctime): ${file}; actual=${JSON.stringify(actual)}; expected=${JSON.stringify(expected)}`);
}
function validateBatchId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) fail('Invalid batchId');
}
export function validateRelativeFile(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^(runs|exports)\//.test(value) || /[\\\x00-\x1f<>:"|?*]/.test(value)) fail('Unsafe relative file path');
  for (const part of value.split('/')) {
    if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || part.toLowerCase() === 'private' || part.toLowerCase().startsWith('.env') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) fail(`Protected or unsafe relative file path: ${value}`);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object');
  return value as Record<string, unknown>;
}
function validateRootFields(value: Record<string, unknown>, roots: ArchiveRoots) {
  if (value.schemaVersion !== 1 || value.project !== 'snyggare-dealer') fail('Unsupported project/schemaVersion');
  for (const name of ['sourceRoot', 'archiveRoot'] as const) {
    if (typeof value[name] !== 'string' || !path.isAbsolute(value[name]) || !samePath(value[name], roots[name])) fail(`Unexpected ${name}`);
  }
  validateBatchId(value.batchId);
}
export function validatePlan(value: unknown, roots: ArchiveRoots = PRODUCTION_ROOTS): ArchivePlan {
  const plan = object(value); validateRootFields(plan, roots);
  if (!Array.isArray(plan.files) || !plan.files.length) fail('Plan must name at least one file');
  const seen = new Set<string>();
  const files = plan.files.map(raw => {
    const file = object(raw); validateRelativeFile(file.path);
    if (typeof file.reason !== 'string' || !file.reason.trim()) fail(`Missing reason: ${file.path}`);
    if (seen.has(file.path.toLowerCase())) fail(`Duplicate file: ${file.path}`);
    seen.add(file.path.toLowerCase());
    return { path: file.path, reason: file.reason };
  });
  return { schemaVersion: 1, project: 'snyggare-dealer', sourceRoot: path.resolve(roots.sourceRoot), archiveRoot: path.resolve(roots.archiveRoot), batchId: plan.batchId as string, files };
}
function validateFingerprint(value: unknown): Fingerprint {
  const f = object(value);
  if (!Number.isSafeInteger(f.size) || (f.size as number) < 0 || !['mtimeNs', 'ctimeNs', 'dev', 'ino'].every(k => typeof f[k] === 'string' && /^-?\d+$/.test(f[k] as string))) fail('Invalid file fingerprint');
  return f as Fingerprint;
}
function validateManifest(value: unknown, roots: ArchiveRoots): ArchiveManifest {
  const raw = object(value), plan = validatePlan(raw, roots);
  if (raw.kind !== 'dealerlab-work-material-archive' || raw.copyStatus !== 'complete' || raw.fileCount !== plan.files.length || typeof raw.completedAt !== 'string' || !Number.isFinite(Date.parse(raw.completedAt))) fail('Manifest is not a completed archive');
  const files = (raw.files as unknown[]).map((entry, i) => {
    const f = object(entry), source = validateFingerprint(f.source), archive = validateFingerprint(f.archive);
    if (f.copyStatus !== 'verified' || typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256) || typeof f.archivePath !== 'string' || f.archivePath !== `files/${plan.files[i].path}` || archive.size !== source.size) fail('Invalid archived file record');
    return { ...plan.files[i], archivePath: f.archivePath, sha256: f.sha256, source, archive, copyStatus: 'verified' as const };
  });
  const total = files.reduce((sum, f) => sum + f.source.size, 0);
  if (!Number.isSafeInteger(total) || raw.logicalBytes !== total) fail('Manifest byte count does not match its files');
  return { ...(raw as ArchiveManifest), ...plan, files };
}

/** Check every existing component, including ancestors above the configured root. */
async function safePath(absolute: string, kind: 'file' | 'directory' | 'any', allowMissing = false): Promise<BigIntStats | null> {
  absolute = path.resolve(absolute);
  const root = path.parse(absolute).root, parts = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = -1; index < parts.length; index++) {
    if (index >= 0) current = path.join(current, parts[index]);
    let info: BigIntStats;
    try { info = await lstat(current, { bigint: true }); }
    catch (error) { if (allowMissing && isMissing(error)) return null; throw error; }
    if (info.isSymbolicLink()) fail(`Symlink/junction refused: ${current}`);
    const last = index === parts.length - 1;
    if ((!last || kind === 'directory') && !info.isDirectory()) fail(`Expected directory: ${current}`);
    if (last && kind === 'file' && !info.isFile()) fail(`Expected regular file: ${current}`);
    if (!samePath(await realpath(current), current)) fail(`Redirected filesystem path refused: ${current}`);
    if (last) return info;
  }
  return null;
}
async function directories(directory: string) {
  const absolute = path.resolve(directory), root = path.parse(absolute).root;
  let current = root;
  await safePath(root, 'directory');
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!await safePath(current, 'directory', true)) {
      await safePath(path.dirname(current), 'directory');
      try { await mkdir(current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      await safePath(current, 'directory');
    }
  }
}
async function stableHash(file: string, expected?: Fingerprint): Promise<{ sha256: string; fingerprint: Fingerprint }> {
  const before = snapshot((await safePath(file, 'file'))!);
  if (expected) expectFingerprint(before, expected, file);
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    expectFingerprint(snapshot(await handle.stat({ bigint: true })), before, file);
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
    let count = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead)); count += bytesRead;
    }
    if (count !== before.size) fail(`File size changed while reading: ${file}`);
    expectFingerprint(snapshot(await handle.stat({ bigint: true })), before, file);
    expectFingerprint(snapshot((await safePath(file, 'file'))!), before, file);
    return { sha256: hash.digest('hex'), fingerprint: before };
  } finally { await handle.close(); }
}
async function readJson(file: string) {
  const before = snapshot((await safePath(file, 'file'))!);
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    expectFingerprint(snapshot(await handle.stat({ bigint: true })), before, file);
    const bytes = await handle.readFile();
    expectFingerprint(snapshot(await handle.stat({ bigint: true })), before, file);
    expectFingerprint(snapshot((await safePath(file, 'file'))!), before, file);
    let value: unknown;
    try { value = JSON.parse(bytes.toString('utf8')); }
    catch { fail(`Invalid JSON file: ${file}`); } // Do not expose input text in parser errors.
    return { value, sha256: sha256(bytes) };
  } finally { await handle.close(); }
}
async function writeExclusive(file: string, bytes: string) {
  await safePath(path.dirname(file), 'directory');
  if (await safePath(file, 'any', true)) fail(`Refusing to overwrite: ${file}`);
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await safePath(file, 'file');
}
async function writeStatus(file: string, status: BatchStatus) {
  status.updatedAt = new Date().toISOString();
  await safePath(file, 'file', true);
  const temporary = path.join(path.dirname(file), `.status-${randomUUID()}.tmp`);
  await writeExclusive(temporary, JSON.stringify(status, null, 2) + '\n');
  await safePath(file, 'file', true);
  await safePath(temporary, 'file');
  await rename(temporary, file);
}
async function withLock<T>(batch: string, command: string, action: () => Promise<T>): Promise<T> {
  await safePath(batch, 'directory');
  const file = path.join(batch, '.operation.lock');
  await writeExclusive(file, JSON.stringify({ pid: process.pid, command, startedAt: new Date().toISOString() }) + '\n');
  const owned = snapshot((await safePath(file, 'file'))!);
  try { return await action(); }
  finally {
    const now = snapshot((await safePath(file, 'file'))!);
    if (!sameIdentity(owned, now)) fail(`Operation lock changed; left untouched: ${file}`);
    await unlink(file);
  }
}

/** Exposed roots are for isolated tests. The CLI always uses PRODUCTION_ROOTS. */
export function createArchiver(roots: ArchiveRoots = PRODUCTION_ROOTS, options: Options = {}) {
  roots = { sourceRoot: path.resolve(roots.sourceRoot), archiveRoot: path.resolve(roots.archiveRoot) };
  if (samePath(roots.sourceRoot, roots.archiveRoot) || within(roots.sourceRoot, roots.archiveRoot) || within(roots.archiveRoot, roots.sourceRoot)) fail('Source and archive roots must be separate');
  const sourcePath = (relative: string) => { validateRelativeFile(relative); return path.join(roots.sourceRoot, ...relative.split('/')); };
  const archivePath = (batch: string, relative: string) => { validateRelativeFile(relative); return path.join(batch, 'files', ...relative.split('/')); };
  const progress = (operation: string, processed: number, totalFiles: number, logicalBytes: number) => {
    if (processed % 1000 === 0 || processed === totalFiles) options.onProgress?.({ operation, processed, totalFiles, logicalBytes });
  };
  async function copyVerified(source: string, destination: string, expected: Fingerprint, onCreated?: (fingerprint: Fingerprint) => void) {
    expectFingerprint(snapshot((await safePath(source, 'file'))!), expected, source);
    await directories(path.dirname(destination));
    if (await safePath(destination, 'any', true)) fail(`Refusing to overwrite: ${destination}`);
    const input = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let hash: string;
    try {
      expectFingerprint(snapshot(await input.stat({ bigint: true })), expected, source);
      await safePath(path.dirname(destination), 'directory');
      const output = await open(destination, 'wx', 0o600);
      try {
        onCreated?.(snapshot(await output.stat({ bigint: true })));
        const digest = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
        let count = 0;
        while (true) {
          const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          digest.update(buffer.subarray(0, bytesRead)); count += bytesRead;
          let offset = 0;
          while (offset < bytesRead) {
            const { bytesWritten } = await output.write(buffer, offset, bytesRead - offset, null);
            if (!bytesWritten) fail(`Short write: ${destination}`);
            offset += bytesWritten;
          }
        }
        await output.sync();
        if (count !== expected.size) fail(`Source size changed while copying: ${source}`);
        expectFingerprint(snapshot(await input.stat({ bigint: true })), expected, source);
        hash = digest.digest('hex');
      } finally { await output.close(); }
    } finally { await input.close(); }
    await options.afterCopyForTest?.(source, destination);
    const original = await stableHash(source, expected), archived = await stableHash(destination);
    if (original.sha256 !== hash || archived.sha256 !== hash || archived.fingerprint.size !== expected.size) fail(`Copy SHA256 verification failed: ${source}`);
    return { sha256: hash, fingerprint: archived.fingerprint };
  }
  function manifestLocation(input: string) {
    const absolute = path.resolve(input), relative = path.relative(roots.archiveRoot, absolute).split(path.sep);
    if (relative.length !== 2 || relative[1] !== 'manifest.json' || !within(roots.archiveRoot, absolute)) fail('Manifest must be archiveRoot/<batchId>/manifest.json');
    validateBatchId(relative[0]);
    return { absolute, batchId: relative[0], batch: path.dirname(absolute) };
  }
  async function loadComplete(input: string) {
    const location = manifestLocation(input), json = await readJson(location.absolute);
    const manifest = validateManifest(json.value, roots);
    if (manifest.batchId !== location.batchId) fail('Manifest batchId/location mismatch');
    const statusPath = path.join(location.batch, 'status.json'), status = (await readJson(statusPath)).value as BatchStatus;
    if (!status || status.schemaVersion !== 1 || status.project !== 'snyggare-dealer' || status.batchId !== manifest.batchId || status.manifestSha256 !== json.sha256 || status.copy?.state !== 'complete') fail('Missing or mismatched completed-copy status');
    await safePath(roots.sourceRoot, 'directory');
    return { ...location, manifest, statusPath, status };
  }
  async function checkArchive(batch: string, file: ArchivedFile) {
    const result = await stableHash(archivePath(batch, file.path));
    if (result.sha256 !== file.sha256 || result.fingerprint.size !== file.source.size) fail(`Archive does not match manifest: ${file.path}`);
    return result.fingerprint;
  }
  async function checkSource(file: ArchivedFile, requireOriginalMetadata: boolean) {
    const source = sourcePath(file.path);
    const present = await safePath(source, 'file', true);
    if (!present) return null;
    const current = snapshot(present);
    // Unlinking a hardlink changes the inode's ctime but not its file content or
    // mtime. Always hash again before accepting that metadata-only difference.
    if (requireOriginalMetadata && !sameSource(current, file.source)) fail(`File changed (identity/size/mtime): ${file.path}`);
    const result = await stableHash(source, current);
    if (result.sha256 !== file.sha256 || result.fingerprint.size !== file.source.size) fail(`Source does not match manifest; refusing overwrite/deletion: ${file.path}`);
    return result.fingerprint;
  }
  async function copy(planInput: string) {
    const planPath = path.resolve(planInput), json = await readJson(planPath), plan = validatePlan(json.value, roots);
    await safePath(roots.sourceRoot, 'directory');
    const planned: { path: string; reason: string; source: Fingerprint }[] = [];
    let totalLogicalBytes = 0;
    for (const file of plan.files) {
      const source = snapshot((await safePath(sourcePath(file.path), 'file'))!);
      totalLogicalBytes += source.size;
      if (!Number.isSafeInteger(totalLogicalBytes)) fail('Unsafe total byte count');
      planned.push({ ...file, source });
      progress('copy-preflight', planned.length, plan.files.length, totalLogicalBytes);
    }
    await directories(roots.archiveRoot);
    const batch = path.join(roots.archiveRoot, plan.batchId);
    await safePath(batch, 'directory', true);
    await mkdir(batch); // Exclusive batch creation. A failed batch is never silently reused.
    return withLock(batch, 'copy', async () => {
      const statusPath = path.join(batch, 'status.json'), manifestPath = path.join(batch, 'manifest.json');
      const status: BatchStatus = { schemaVersion: 1, project: 'snyggare-dealer', batchId: plan.batchId, updatedAt: '', manifestSha256: null, totalFiles: planned.length, totalLogicalBytes, copy: { ...emptyOperation(), state: 'running' }, prune: emptyOperation(), restore: emptyOperation() };
      await writeStatus(statusPath, status);
      const files: ArchivedFile[] = [], createdAt = new Date().toISOString();
      try {
        for (const file of planned) {
          status.copy.lastPath = file.path;
          const result = await copyVerified(sourcePath(file.path), archivePath(batch, file.path), file.source);
          files.push({ ...file, archivePath: `files/${file.path}`, archive: result.fingerprint, sha256: result.sha256, copyStatus: 'verified' });
          status.copy.processed++; status.copy.verified++; status.copy.logicalBytes += file.source.size;
          progress('copy', files.length, planned.length, status.copy.logicalBytes);
          if (files.length % 1000 === 0) await writeStatus(statusPath, status);
        }
        // Hashes were checked independently during copy. Detect subsequent writes,
        // replacements or disappearance without reading the whole archive again.
        status.copy.phase = 'sealing'; await writeStatus(statusPath, status);
        let sealed = 0, sealedBytes = 0;
        for (const file of files) {
          expectFingerprint(snapshot((await safePath(sourcePath(file.path), 'file'))!), file.source, file.path);
          expectFingerprint(snapshot((await safePath(archivePath(batch, file.path), 'file'))!), file.archive, file.path);
          sealedBytes += file.source.size;
          progress('copy-seal', ++sealed, files.length, sealedBytes);
        }
        const manifest: ArchiveManifest = { ...plan, kind: 'dealerlab-work-material-archive', createdAt, completedAt: new Date().toISOString(), copyStatus: 'complete', plan: { path: planPath, sha256: json.sha256 }, fileCount: files.length, logicalBytes: totalLogicalBytes, files };
        const text = JSON.stringify(manifest, null, 2) + '\n';
        await writeExclusive(manifestPath, text);
        const saved = await readJson(manifestPath);
        if (saved.sha256 !== sha256(Buffer.from(text))) fail('Written manifest verification failed');
        status.manifestSha256 = saved.sha256; status.copy.state = 'complete';
        await writeStatus(statusPath, status);
        return { manifestPath, fileCount: files.length, logicalBytes: totalLogicalBytes, copyStatus: 'complete' };
      } catch (error) {
        status.copy.state = 'failed'; status.copy.error = String((error as Error).message);
        await writeStatus(statusPath, status); throw error;
      }
    });
  }
  async function prune(manifestInput: string) {
    const location = manifestLocation(manifestInput);
    return withLock(location.batch, 'prune', async () => {
      const { manifest, status, statusPath, batch } = await loadComplete(manifestInput);
      const current: OperationStatus = status.prune = { ...emptyOperation(), state: 'running', phase: 'preflight' };
      await writeStatus(statusPath, status);
      try {
        // A mismatch anywhere in the batch aborts before the first source deletion.
        const verified: { source: Fingerprint | null; archive: Fingerprint }[] = [];
        let checkedBytes = 0;
        let nextIndex = 0, completed = 0;
        const checks = await Promise.allSettled(Array.from({ length: Math.min(4, manifest.files.length) }, async () => {
          while (nextIndex < manifest.files.length) {
            const index = nextIndex++, file = manifest.files[index];
            verified[index] = { archive: await checkArchive(batch, file), source: await checkSource(file, true) };
            checkedBytes += file.source.size;
            progress('prune-preflight', ++completed, manifest.fileCount, checkedBytes);
          }
        }));
        for (const check of checks) if (check.status === 'rejected') throw check.reason;
        current.phase = 'deleting'; await writeStatus(statusPath, status);
        const unlinkedIdentities = new Set<string>();
        for (const [index, file] of manifest.files.entries()) {
          current.lastPath = file.path;
          const checked = verified[index];
          // Full SHA256 preflight plus unchanged inode/size/mtime/ctime at deletion.
          // A new or changed file after preflight is never treated as the old file.
          expectFingerprint(snapshot((await safePath(archivePath(batch, file.path), 'file'))!), checked.archive, file.path);
          const present = await safePath(sourcePath(file.path), 'file', true);
          if (!present) current.alreadyAbsent++;
          else {
            if (!checked.source) fail(`Source appeared after preflight: ${file.path}`);
            let beforeDelete = snapshot(present);
            if (!equalFingerprint(beforeDelete, checked.source)) {
              if (!unlinkedIdentities.has(identityKey(checked.source)) || !sameSource(beforeDelete, checked.source)) fail(`File changed after prune preflight: ${file.path}`);
              // Only an inode already unlinked by this invocation may take this
              // path. Rehash its surviving named hardlink; never ignore ctime.
              const rechecked = await stableHash(sourcePath(file.path), beforeDelete);
              if (rechecked.sha256 !== file.sha256) fail(`Hardlink changed after prune preflight: ${file.path}`);
              beforeDelete = rechecked.fingerprint;
              expectFingerprint(snapshot((await safePath(archivePath(batch, file.path), 'file'))!), checked.archive, file.path);
            }
            expectFingerprint(snapshot((await safePath(sourcePath(file.path), 'file'))!), beforeDelete, file.path);
            await unlink(sourcePath(file.path));
            unlinkedIdentities.add(identityKey(beforeDelete));
            current.deleted++; current.deletedBytes += file.source.size;
            if (await safePath(sourcePath(file.path), 'file', true)) fail(`Source reappeared after deletion: ${file.path}`);
          }
          current.processed++; current.verified++; current.logicalBytes += file.source.size;
          progress('prune', current.processed, manifest.fileCount, current.deletedBytes);
          if (current.processed % 1000 === 0) await writeStatus(statusPath, status);
        }
        current.state = 'complete'; await writeStatus(statusPath, status);
        return { manifestPath: location.absolute, ...current };
      } catch (error) {
        current.state = 'failed'; current.error = String((error as Error).message);
        await writeStatus(statusPath, status); throw error;
      }
    });
  }
  async function restore(manifestInput: string, relativeFile?: string) {
    if (relativeFile !== undefined) validateRelativeFile(relativeFile);
    const location = manifestLocation(manifestInput);
    return withLock(location.batch, 'restore', async () => {
      const { manifest, status, statusPath, batch } = await loadComplete(manifestInput);
      const selected = relativeFile === undefined ? manifest.files : manifest.files.filter(f => f.path === relativeFile);
      if (!selected.length) fail('Requested file is not present in manifest');
      const current: OperationStatus = status.restore = { ...emptyOperation(), state: 'running', phase: 'preflight' };
      await writeStatus(statusPath, status);
      try {
        for (const file of selected) { await checkArchive(batch, file); await checkSource(file, false); }
        current.phase = 'restoring'; await writeStatus(statusPath, status);
        for (const file of selected) {
          current.lastPath = file.path;
          const archive = await checkArchive(batch, file);
          if (await checkSource(file, false)) current.alreadyPresent++;
          else {
            const destination = sourcePath(file.path);
            await directories(path.dirname(destination));
            const temporary = path.join(path.dirname(destination), `.archive-restore-${randomUUID()}.part`);
            let ownedTemporary: Fingerprint | undefined;
            try {
              const result = await copyVerified(archivePath(batch, file.path), temporary, archive, created => { ownedTemporary = created; });
              if (result.sha256 !== file.sha256) fail(`Restore hash mismatch: ${file.path}`);
              await safePath(destination, 'file', true); await safePath(temporary, 'file');
              // Hard-link publication is atomic and refuses an existing destination.
              await link(temporary, destination);
              const restored = await stableHash(destination);
              if (restored.sha256 !== file.sha256) fail(`Published restore hash mismatch: ${file.path}`);
              current.restored++; current.restoredBytes += file.source.size;
            } finally {
              if (ownedTemporary) {
                const present = await safePath(temporary, 'file', true);
                if (present) {
                  if (!sameIdentity(snapshot(present), ownedTemporary)) fail(`Restore temporary file changed; left untouched: ${temporary}`);
                  await unlink(temporary);
                }
              }
            }
          }
          current.processed++; current.verified++; current.logicalBytes += file.source.size;
          progress('restore', current.processed, selected.length, current.restoredBytes);
          if (current.processed % 1000 === 0) await writeStatus(statusPath, status);
        }
        current.state = 'complete'; await writeStatus(statusPath, status);
        return { manifestPath: location.absolute, ...current };
      } catch (error) {
        current.state = 'failed'; current.error = String((error as Error).message);
        await writeStatus(statusPath, status); throw error;
      }
    });
  }
  return { copy, prune, restore };
}

export async function main(args = process.argv.slice(2)) {
  const [command, input, relativeFile] = args;
  if (!input || !['copy', 'prune', 'restore'].includes(command) || args.length > (command === 'restore' ? 3 : 2)) fail('Usage: archive-work-material.ts copy <plan> | prune <manifest> | restore <manifest> [relativePath]');
  if (process.platform !== 'win32') fail('Production archive CLI requires the configured Windows drives');
  const archiver = createArchiver(PRODUCTION_ROOTS, { onProgress: p => process.stderr.write(`${p.operation}: ${p.processed}/${p.totalFiles} files, ${p.logicalBytes} logical bytes\n`) });
  const result = command === 'copy' ? await archiver.copy(input) : command === 'prune' ? await archiver.prune(input) : await archiver.restore(input, relativeFile);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`Archive refused/failed: ${(error as Error).message}\n`); process.exitCode = 1; });
}
