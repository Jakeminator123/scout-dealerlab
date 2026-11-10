/** Local Pamela bank pilot. Paid work requires a separate hash-bound approval file.
 * --dry-run [--middle|--retake-7] [--verify-api] | --submit|--status|--download --seat=1..7 [--retake-7] | --self-test
 * Outer probes first, then five separately approved middle seats. No retry or activation.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { parseEnv, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

type Json = Record<string, any>;
type Seat = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const root = fileURLToPath(new URL('../', import.meta.url));
const run = 'runs/20261109-pamela-seat-bank';
const owner = 'pamela-seat-bank-epoch-20261109';
const source = 'runs/20261109-pamela-reference-kit/original/pamela-redo-station.png';
const sourceHash = 'a9dd4882d84da1cc6f0fb3258d0fbd6d81fddac5a7f78efdaa225d6f9538576d';
const priorTaskId = '8701dcbb-239d-4e60-a887-bd431e90f3d1';
const priorJournal = 'runs/20261108-pamela-deal-pilot/qa/budget-ledger.json';
const ledgerPath = `${run}/budget-epoch.json`;
const endpoint = 'https://api.dev.runwayml.com';
const apiVersion = '2024-11-06';
const outerSeats: Seat[] = [1, 7];
const middleSeats: Seat[] = [2, 3, 4, 5, 6];
const seats: Seat[] = [1, 2, 3, 4, 5, 6, 7];
const cost = 240;
const retake7 = process.argv.includes('--retake-7');
const endCard7 = process.argv.includes('--end-card-7');
const middleEnd = process.argv.includes('--middle-end-card');
const c2Pilot = process.argv.includes('--c2-1');
const c2Key = 'seat-1-c2-feasibility-v1';
// Executed by its isolated, hash-pinned attempt tool; recognized here for shared accounting only.
const symmetric1Key = 'seat-1-symmetric-v2';
const c2Stage1Keys = ['seat-1-c2-bank-v2', 'seat-7-c2-bank-v2'];
const c2Stage2Keys = [2, 3, 4, 5, 6].map(seat => `seat-${seat}-c2-bank-v2`);
const c2Run = `${run}/c2/${c2Key}`;
const c2AnchorsPath = 'runs/20261109-pamela-seat1-two-card/generation-anchors-v4/anchors.json';
const c2AnchorsHash = 'c046f1b56133e0061b24d99dcd242412864799fe2a45f85ba3f7aad27bedef5e';
const c2FirstHash = 'bf403c1cc401c88449e7a391c9d9cccb647cbadb1733e726d6c75291aad8682f';
const c2LastHash = '648be48d8a48d428095f3ee6de7978053717be98c4e8f00612c3469cd72e85b1';
const c2PlanHash = 'b9ee6b05c7770c06109e285b8ab0100701021b9229f9da64ca86120c7ff64dc8';
const c2RequestHash = 'fae25e5c0a08da5b9ed04fda01d419202b03fb97e0d66a36e87d980fb288bc57';
const middleEndRun = `${run}/batches/middle-end-card-v1`;
const middleEndHashes: Partial<Record<Seat, string>> = {
  2: 'b2a539d9806d5da7fc62c5dbcd713b99b8e282508df847b11cb0d6de8f6c6fcf',
  3: '0cb440fefe3254d5ce81834c9783be06ecc72383494b2bc298e21164c0284098',
  4: 'c412b2670b7176f360ff92fa2026f61513a8e70ade7d80bc26f297bae14f64be',
  5: '6eb90397e8a9a0132c70039fe8f4ce3d664eadb147c4ab33bc8a6782bc4b81e4',
  6: 'f4ab152b6d1e821f5252fb7e0127eaad80d3aedf0730a9fef8c460cb5c679957',
};
const retakeKey = 'seat-7-first-only-v2';
const endCardKey = 'seat-7-end-card-v3';
const endCardImage = `${run}/retakes/${endCardKey}/pamela-redo-seat-7-end-v2.png`;
const endCardHash = '3ab98d8d9433f5a4bc78c27fcd66e19846dc30e8756607dfd42600c9e5bc44c7';
const endCardProof = `${run}/retakes/${endCardKey}/end-anchor-proof-v2.json`;
const attemptKey = (seat: Seat) => c2Pilot && seat === 1 ? c2Key : seat === 7 && endCard7 ? endCardKey : retake7 && seat === 7 ? retakeKey : `seat-${seat}`;
const attemptRun = (seat: Seat) => c2Pilot && seat === 1 ? c2Run : middleEnd && middleSeats.includes(seat) ? middleEndRun : seat === 7 && (retake7 || endCard7) ? `${run}/retakes/${attemptKey(seat)}` : run;
const rowKey = (row: Json) => row.attemptKey ?? `seat-${row.seat}`;
const directions = {
  1: { x: .14, y: .79, description: 'far viewer-left outer area', slot: 'deal.player.left/box0', targetStatus: 'observed approximate landing center in outer probe; not calibrated' },
  2: { x: .26, y: .83, description: 'viewer-left, between the far-left edge and the center-left area', slot: 'deal.player.left/box1', targetStatus: 'requested image coordinate, not measured' },
  3: { x: .38, y: .87, description: 'center-left, slightly left of the dealer centerline', slot: 'deal.player.centre/box2', targetStatus: 'requested image coordinate, not measured' },
  4: { x: .50, y: .89, description: 'center, straight forward toward the viewer', slot: 'deal.player.centre/box3', targetStatus: 'requested image coordinate, not measured' },
  5: { x: .62, y: .87, description: 'center-right, slightly right of the dealer centerline', slot: 'deal.player.centre/box4', targetStatus: 'requested image coordinate, not measured' },
  6: { x: .74, y: .83, description: 'viewer-right, below the shoe and inward from the far-right edge', slot: 'deal.player.right/box5', targetStatus: 'requested image coordinate, not measured' },
  7: { x: .86, y: .79, description: 'far viewer-right outer area, below and outward from the shoe', slot: 'deal.player.right/box6', targetStatus: 'direction requested by existing outer probe; exact center unverified' },
} as const;
const planPath = (seat: Seat) => `${attemptRun(seat)}/${middleSeats.includes(seat) ? 'middle-plan' : 'plan'}.json`;
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const absolute = (file: string) => path.resolve(root, file);
const jobPath = (seat: Seat) => `${attemptRun(seat)}/seat-${seat}.json`;
const requestPath = (seat: Seat) => `${attemptRun(seat)}/seat-${seat}.request.json`;
const taskPath = (seat: Seat) => `${attemptRun(seat)}/seat-${seat}.task-id.json`;
const approvalPath = (seat: Seat) => `${attemptRun(seat)}/seat-${seat}.approval.json`;
const read = async (file: string): Promise<Json> => JSON.parse(await readFile(absolute(file), 'utf8'));
const exists = (file: string) => stat(absolute(file)).then(() => true).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return false; throw error; });
function writeTarget(file: string) {
  const target = absolute(file), boundary = absolute(run) + path.sep;
  if (!target.startsWith(boundary)) throw Error('Write escaped the owned run');
  return target;
}
async function atomic(file: string, value: unknown) {
  const target = writeTarget(file), temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, json(value), { flag: 'wx' }); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
}
async function fixed(file: string, bytes: string | Buffer) {
  if (await exists(file)) {
    if (sha(await readFile(absolute(file))) !== sha(bytes)) throw Error(`Existing artifact differs; preserve it: ${file}`);
  } else await writeFile(writeTarget(file), bytes, { flag: 'wx' });
}
async function locked<T>(action: () => Promise<T>) {
  await mkdir(absolute(run), { recursive: true });
  const lock = `${run}/budget.lock`, token = json({ owner, pid: process.pid, nonce: randomUUID(), startedAt: new Date().toISOString() });
  await writeFile(writeTarget(lock), token, { flag: 'wx' });
  try { return await action(); }
  finally { if (await readFile(absolute(lock), 'utf8') === token) await rm(writeTarget(lock)); }
}
function authoredPrompt(seat: Seat) {
  const text = `One uninterrupted 12-second take from a completely stationary tripod camera. FIRST and LAST have the same framing. Keep the entire reference dealer, her head and both hands fully in view at the original scale throughout the action. Preserve her identity, black blazer and ivory blouse. Keep the black shoe, bright chroma-green background AND tabletop fixed in the original screen positions; only the natural dealing movement changes. No zoom, pan, tilt, crop, close-up, reframing or camera movement. [0-1s] Hold the FIRST REDO pose. [1-4s] The hand touching the shoe draws ONE rigid plain-white poker-size card, about 63 by 88 millimeters, and carries it toward far IMAGE RIGHT. [4-5s] Lay it flat exactly where the separate white card is visible in the LAST image: center about 90 percent image width from LEFT and 88 percent image height from TOP, below and outward from the shoe, farther right than seat 6. Preserve the complete card and hand inside the fixed original frame. [5-6s] Open all fingers and lift the entire EMPTY hand clear, leaving visible green separation between every fingertip and the card. [6-9s] Return that visibly EMPTY hand to the original REDO position beside the shoe without touching the dealt card again. [9-12s] Hold the LAST reference pose with the dealt card still motionless on the table. Never retrieve, lift, erase, cover or return the placed card. The shoe and its white front insert remain unchanged; every visible card surface stays plain unprinted white without ranks, suits, text, pictures or colored artwork. The tabletop and background remain the original flat bright chroma green with constant lighting. One complete deal, natural anatomy, fixed camera and full dealer visible throughout.`;
  if (seat === 7) return text;
  const target = directions[seat];
  return text.replace('far IMAGE RIGHT', `player seat ${seat}: ${target.description}`).replace('center about 90 percent image width from LEFT and 88 percent image height from TOP, below and outward from the shoe, farther right than seat 6', `center about ${Math.round(target.x * 100)} percent image width from LEFT and ${Math.round(target.y * 100)} percent image height from TOP; this is the distinct seat-${seat} position entirely on the green tabletop`);
}
function prompt(seat: Seat) {
  if (c2Pilot) { if (seat !== 1) throw Error('C2 pilot is seat1 only'); return c2Prompt(); }
  if (endCard7 && seat === 7 || middleEnd && middleSeats.includes(seat)) return authoredPrompt(seat);
  if (retake7 && seat === 7) return `One continuous locked-camera 12-second dealer take. Preserve the reference woman, black blazer, ivory blouse, hair, scale, fixed black shoe and lighting. The ENTIRE background and ENTIRE tabletop remain the same bright saturated chroma green throughout, including the first moving frame. [0-1s] Hold the reference REDO pose. [1-4s] The hand touching the shoe draws ONE rigid plain-white poker-size card, about 63 by 88 millimeters with 5:7 face-on width-to-height proportions. Carry it far toward IMAGE RIGHT to the lower-right player position. Aim for the card center at 90 percent of image width measured from the LEFT and 88 percent of image height measured from the TOP. This is farther RIGHT than the 74-percent-width position for seat 6. Place it entirely on the green tabletop below and outward from the shoe, never inside or on the shoe. Keep the complete card inside the frame, with its right edge left of the 98-percent-width line. [4-5s] Lay the card flat once. [5-6s] OPEN and release every finger. Lift the WHOLE empty hand clear of the card so a visible green gap separates all fingertips from the card; pause briefly with this clear separation. [6-9s] Return the visibly EMPTY hand directly to its original REDO position beside the shoe. The dealt card stays motionless at the far-right landing position. [9-12s] Settle in REDO. The placed white card remains fully visible and untouched through the final frame. Do not pick it up, retrieve it, return it to the shoe, cover it again or make it disappear. Its face stays unprinted white without ranks, suits, text or artwork. Preserve physical card size, whole hands, natural anatomy and fixed camera.`;
  if (middleSeats.includes(seat)) {
    const target = directions[seat];
    return `One continuous locked-camera 12-second dealer movement plate. Preserve the reference woman, black blazer, ivory blouse, hair, scale, fixed shoe and lighting. The entire visible background AND tabletop stay the same bright saturated chroma green throughout, including the first moving frame. [0-1s] Hold the supplied REDO pose. [1-5s] The hand already touching the shoe draws exactly one rigid standard poker-size card, 63 by 88 millimeters, with a plain unprinted white face. Its face-on width-to-height proportion is approximately 5:7; the long edge is about one palm length. Preserve the card's physical size and straight edges as perspective changes. Deal it to player seat ${seat}: ${target.description}. Aim for the center of the card at ${Math.round(target.x * 100)} percent of image width from the LEFT and ${Math.round(target.y * 100)} percent of image height from the TOP. This is one distinct position, not a sweep across multiple seats. Keep fingers and the whole card inside the frame with continuous believable fingertip contact. The card remains unmarked, with no ranks, suits, pictures, text or colored artwork. [5-6s] Lay it flat once and release every finger clearly. [6-9s] Return the empty dealing hand directly to the original shoe position; the other hand stays near its original rest. [9-12s] Settle into the supplied final REDO pose. Any disappearance of the released card happens only after complete hand separation. The final image is a dealer-layer pose target, not persistent table-card state. Natural movement, one deal, stationary camera and shoe.`;
  }
  const target = seat === 1 ? 'far IMAGE-LEFT player area, away from the shoe' : 'far IMAGE-RIGHT player area, below and outward from the shoe';
  return `One continuous locked-camera 12-second dealer movement plate. Preserve the reference woman, black blazer, ivory blouse, hair, scale, fixed shoe and lighting. The entire visible background AND tabletop stay the same bright saturated chroma green throughout, including the first moving frame. [0-1s] Hold the supplied REDO pose. [1-5s] The hand already touching the shoe draws exactly one rigid rectangular card with an unprinted plain white face, then deals it to the ${target}, safely inside the frame. Its white surface stays unmarked, with no ranks, suits, pictures, text or colored artwork. Keep the whole hand, fingers and card visible with continuous believable fingertip contact. [5-6s] Lay the card flat once and release all fingers clearly. [6-9s] Return the empty dealing hand directly to the original shoe position; the other hand stays near its original resting spot. [9-12s] Settle into the supplied final REDO pose. Preserve the full reach and complete release before returning. Any disappearance of the released card must happen only after the hand is fully separated from it. The final image is a dealer-layer pose target, not persistent table-card state. Natural unhurried movement, one deal, stationary camera and shoe.`;
}
async function input(seat?: Seat) {
  if (c2Pilot) {
    if (seat !== 1) throw Error('C2 pilot is seat1 only');
    const manifestBytes = await readFile(absolute(c2AnchorsPath));
    if (sha(manifestBytes) !== c2AnchorsHash) throw Error('Frozen C2 anchor manifest changed');
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const first = await readFile(absolute(manifest.first.path)), last = await readFile(absolute(manifest.last.path));
    if (manifest.first.sha256 !== c2FirstHash || manifest.last.sha256 !== c2LastHash || sha(first) !== c2FirstHash || sha(last) !== c2LastHash) throw Error('C2 anchor bytes changed');
    for (const bytes of [first, last]) {
      const metadata = await sharp(bytes).metadata();
      if (metadata.width !== 1536 || metadata.height !== 1024 || metadata.format !== 'png') throw Error('C2 image metadata changed');
    }
    const uri = `data:image/png;base64,${first.toString('base64')}`, lastUri = `data:image/png;base64,${last.toString('base64')}`;
    if (Buffer.byteLength(uri) > 5_000_000 || Buffer.byteLength(lastUri) > 5_000_000) throw Error('C2 encoded input exceeds limit');
    return { uri, lastUri, bytes: first.length, width: 1536, height: 1024 };
  }
  const bytes = await readFile(absolute(source));
  if (sha(bytes) !== sourceHash) throw Error('Pamela source hash changed');
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== 1536 || metadata.height !== 1024 || metadata.format !== 'png') throw Error('Pamela source format changed');
  const uri = `data:image/png;base64,${bytes.toString('base64')}`;
  if (Buffer.byteLength(uri) > 5_000_000) throw Error('Input exceeds the encoded 5MB limit');
  let lastUri: string | undefined;
  if (endCard7 || middleEnd) {
    if (middleEnd && (!seat || !middleSeats.includes(seat))) throw Error('Select an exact middle end anchor');
    const lastPath = middleEnd ? `${middleEndRun}/seat-${seat}/pamela-redo-seat-${seat}-end.png` : endCardImage;
    const lastHash = middleEnd ? middleEndHashes[seat!] : endCardHash;
    const last = await readFile(absolute(lastPath)), meta = await sharp(last).metadata();
    if (sha(last) !== lastHash || meta.width !== 1536 || meta.height !== 1024 || meta.format !== 'png') throw Error('Authored end anchor changed');
    lastUri = `data:image/png;base64,${last.toString('base64')}`;
    if (Buffer.byteLength(lastUri) > 5_000_000) throw Error('End anchor exceeds encoded limit');
  }
  return { uri, lastUri, bytes: bytes.length, width: metadata.width, height: metadata.height };
}
function body(seat: Seat, uri: string, lastUri?: string) {
  const authoredLast = c2Pilot && seat === 1 || endCard7 && seat === 7 || middleEnd && middleSeats.includes(seat);
  if (authoredLast && !lastUri) throw Error('Distinct authored last image is required');
  return { model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, promptText: prompt(seat), promptImage: retake7 && seat === 7 ? [{ position: 'first', uri }] : [{ position: 'first', uri }, { position: 'last', uri: authoredLast ? lastUri! : uri }] };
}
async function headers() {
  const key = parseEnv(await readFile(absolute('.env.local'), 'utf8')).RUNWAY_API_KEY;
  if (!key) throw Error('Local lab Runway credential unavailable');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Runway-Version': apiVersion };
}
async function responseJson(response: Response): Promise<Json> {
  if (!response.ok) throw Error(`Runway HTTP ${response.status}; no automatic retry`);
  const value = await response.text();
  if (value.length > 128_000) throw Error('Unexpected response size');
  return JSON.parse(value);
}
async function verifyProvider(required = 0, suppliedHeaders?: Awaited<ReturnType<typeof headers>>) {
  const prior = await read('runs/20261109-pamela-seat-pilot-plan/seat-1.json');
  if (prior.taskId !== priorTaskId || prior.model !== 'wan3' || prior.duration !== 12) throw Error('Known Pamela account binding changed');
  const requestHeaders = suppliedHeaders ?? await headers();
  const [organization, task] = await Promise.all(['/v1/organization', `/v1/tasks/${priorTaskId}`].map(async route => responseJson(await fetch(endpoint + route, { headers: requestHeaders, redirect: 'error', signal: AbortSignal.timeout(30_000) }))));
  if (task.id !== priorTaskId || task.status !== 'SUCCEEDED') throw Error('Account cannot access the exact prior Pamela task');
  if (!Number.isFinite(organization.creditBalance) || organization.creditBalance < required) throw Error('Live API balance cannot cover this job');
  const limits = organization.tier?.models?.wan3;
  return { checkedAt: new Date().toISOString(), endpoint, apiVersion, credentialSource: 'local lab .env.local / RUNWAY_API_KEY', creditBalance: organization.creditBalance, organizationId: organization.organizationId ?? organization.id ?? null, priorTask: { id: task.id, status: task.status }, modelLimits: { model: 'wan3', maxConcurrentGenerations: Number.isSafeInteger(limits?.maxConcurrentGenerations) ? limits.maxConcurrentGenerations : null, maxDailyGenerations: Number.isSafeInteger(limits?.maxDailyGenerations) ? limits.maxDailyGenerations : null }, connectorUsed: false, identityLimit: 'Verified through exact prior Pamela task; API does not return a project ID here.' };
}
function validateConcurrency(ledger: Json, binding: Json, approval: Json, seat: Seat) {
  const terminal = ['SUCCEEDED', 'FAILED', 'CANCELLED'], activeStates = ['submitted', 'PENDING', 'THROTTLED', 'RUNNING'];
  const active = ledger.jobs.filter((item: Json) => !terminal.includes(item.state));
  if (active.some((item: Json) => !activeStates.includes(item.state) || !item.taskId)) throw Error('An uncertain submission must be reconciled before further paid requests');
  const requested = middleSeats.includes(seat) ? approval.maxConcurrentOwnedTasks ?? 1 : 1;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > 3) throw Error('Owned concurrency approval must be between one and three');
  const provider = binding.modelLimits?.maxConcurrentGenerations;
  const maximum = Math.min(requested, Number.isSafeInteger(provider) && provider > 0 ? provider : 1);
  if (active.length >= maximum) throw Error('Owned concurrency limit reached; refresh terminal tasks before another submission');
  return { ownedActiveBefore: active.length, ownedMaximum: maximum, providerMaximum: provider ?? null, otherAccountActiveTasks: 'unknown; provider queues apply' };
}
function validateLedger(ledger: Json, add = 0, addingSeat: Seat = 1, addingKey = attemptKey(addingSeat)) {
  if (ledger.owner !== owner || ledger.authorizedCredits !== 7000 || ledger.pilotCapCredits !== 480 || ledger.pilotMaxJobs !== 2 || !Array.isArray(ledger.jobs)) throw Error('Budget epoch identity or limits changed');
  let credits = 0, outerCredits = 0, middleCredits = 0, retakeCredits = 0, endCardCredits = 0, c2Credits = 0, symmetric1Credits = 0, c2Stage1Credits = 0, c2Stage2Credits = 0, outerJobs = 0, middleJobs = 0, retakeJobs = 0, endCardJobs = 0, c2Jobs = 0, symmetric1Jobs = 0, c2Stage1Jobs = 0, c2Stage2Jobs = 0;
  const seen = new Set<string>();
  for (const item of ledger.jobs) {
    const key = rowKey(item);
    if (!seats.includes(item.seat) || seen.has(key) || ![ `seat-${item.seat}`, ...(item.seat === 7 ? [retakeKey, endCardKey] : []), ...(item.seat === 1 ? [c2Key, symmetric1Key] : []), `seat-${item.seat}-c2-bank-v2` ].includes(key) || !Number.isSafeInteger(item.reservedCredits) || item.reservedCredits < cost) throw Error('Invalid or duplicate budget entry');
    seen.add(key); credits += item.reservedCredits;
    if (c2Stage1Keys.includes(key)) { c2Stage1Credits += item.reservedCredits; c2Stage1Jobs++; }
    else if (c2Stage2Keys.includes(key)) { c2Stage2Credits += item.reservedCredits; c2Stage2Jobs++; }
    else if (key === symmetric1Key) { symmetric1Credits += item.reservedCredits; symmetric1Jobs++; }
    else if (key === c2Key) { c2Credits += item.reservedCredits; c2Jobs++; }
    else if (key === endCardKey) { endCardCredits += item.reservedCredits; endCardJobs++; }
    else if (key === retakeKey) { retakeCredits += item.reservedCredits; retakeJobs++; }
    else if (outerSeats.includes(item.seat)) { outerCredits += item.reservedCredits; outerJobs++; }
    else { middleCredits += item.reservedCredits; middleJobs++; }
  }
  if (addingKey === c2Key && addingSeat !== 1) throw Error('C2 budget is seat1 only');
  if (c2Stage1Credits > 480 || c2Stage1Jobs > 2 || c2Stage1Keys.includes(addingKey) && (addingKey !== `seat-${addingSeat}-c2-bank-v2` || c2Stage1Credits + add > 480 || seen.has(addingKey) && add > 0)) throw Error('C2 stage1 budget exhausted or wrong seat');
  if (c2Stage2Credits > 1200 || c2Stage2Jobs > 5 || c2Stage2Keys.includes(addingKey) && (addingKey !== `seat-${addingSeat}-c2-bank-v2` || c2Stage2Credits + add > 1200 || seen.has(addingKey) && add > 0)) throw Error('C2 stage2 budget exhausted or wrong seat');
  if (symmetric1Credits > 240 || symmetric1Jobs > 1 || addingKey === symmetric1Key && (addingSeat !== 1 || symmetric1Credits + add > 240 || symmetric1Jobs + (add ? 1 : 0) > 1)) throw Error('Symmetric seat1 retake budget exhausted or wrong seat');
  const retakeAdd = addingKey === retakeKey ? add : 0, endCardAdd = addingKey === endCardKey ? add : 0, c2Add = addingKey === c2Key ? add : 0, symmetric1Add = addingKey === symmetric1Key ? add : 0, c2Stage1Add = c2Stage1Keys.includes(addingKey) ? add : 0, c2Stage2Add = c2Stage2Keys.includes(addingKey) ? add : 0, outerAdd = !retakeAdd && !endCardAdd && !c2Add && !symmetric1Add && !c2Stage1Add && !c2Stage2Add && outerSeats.includes(addingSeat) ? add : 0, middleAdd = !c2Stage2Add && middleSeats.includes(addingSeat) ? add : 0;
  if (credits + add > ledger.authorizedCredits || outerCredits + outerAdd > ledger.pilotCapCredits || outerJobs + (outerAdd ? 1 : 0) > ledger.pilotMaxJobs || middleCredits + middleAdd > 1200 || middleJobs + (middleAdd ? 1 : 0) > 5 || retakeCredits + retakeAdd > 240 || retakeJobs + (retakeAdd ? 1 : 0) > 1 || endCardCredits + endCardAdd > 240 || endCardJobs + (endCardAdd ? 1 : 0) > 1 || c2Credits + c2Add > 240 || c2Jobs + (c2Add ? 1 : 0) > 1) throw Error('Stage or epoch budget exhausted');
  if (ledger.jobs.some((item: Json) => item.reservedCredits > cost)) throw Error('A prior job exceeded the expected cost; reconcile before continuation');
  return { reservedCredits: credits, pilotRemainingCredits: 480 - outerCredits, middleStageRemainingCredits: 1200 - middleCredits, retakeRemainingCredits: 240 - retakeCredits, endCardRemainingCredits: 240 - endCardCredits, c2RemainingCredits: 240 - c2Credits, authorizedRemainingCredits: 7000 - credits, attempts: ledger.jobs.length };
}
async function prepare(online: boolean) {
  const image = await input();
  await locked(async () => {
    const jobs = [];
    for (const seat of outerSeats) {
      const bytes = json(body(seat, image.uri));
      await fixed(requestPath(seat), bytes);
      await fixed(`${run}/seat-${seat}.prompt.txt`, prompt(seat) + '\n');
      jobs.push({ seat, requestPath: requestPath(seat), requestSha256: sha(bytes), promptSha256: sha(prompt(seat)), model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, maxCredits: cost, source: { path: source, sha256: sourceHash, width: image.width, height: image.height, bytes: image.bytes }, firstLast: 'identical-unmodified-source', mirrored: false });
    }
    const plan = { schemaVersion: 1, owner, dealerId: 'pamela-pilot', endpoint: `${endpoint}/v1/image_to_video`, apiVersion, status: 'two-probe-candidate-only', productionAccepted: false, jobs,
      budget: { authorizedEpochCredits: 7000, liveBalanceRequiredPerSubmit: true, pilotCredits: 480, pilotJobs: 2, perJobCredits: cost, previousJournalIsHistoricalOnly: true },
      execution: { order: [1, 7], separateRootApprovalPerRequestHash: true, secondRequiresFirstOutputReview: true, automaticRetry: false, automaticPolling: false, exactOriginalPreserved: true, dedicatedUploadApiUsed: false, imageLeavesMachineOnlyOnSubmit: true },
      interpretation: { purpose: 'Dealer movement source for a separate alpha layer and independently persistent game cards.', fullSceneAccepted: false, endpointConflict: 'The identical last image has no landed card. Late prop disappearance is possible. It is unacceptable during fingertip contact; release must be complete before any disappearance.', symmetry: 'Never mirror: shoe is viewer-right and the original anatomical dealing hand must stay consistent.', wardrobe: 'Source black blazer and ivory blouse preserved, not an all-black replacement.', sourceCard: 'White unprinted center with a thin dark/gold border already present in the anchor; no invented ranks/suits/artwork requested.', calibratedLandingQuad: 'unknown; these are directional outer-seat probes, not calibrated seven-seat deliverables' },
      qa: ['Inspect frame 0 and frame 1 independently for tabletop color change.', 'Review every frame of pickup, contact, reach and release; do not sample away a failure.', 'Inspect the complete last 2 seconds and first/last seam for pose, light, velocity and card/hand separation.', 'Preserve original fps/frame count; no morph, crossfade, freeze-frame or retiming used to hide failures.', 'Hash-bound dealer alpha, card mask/track and persistent independent card must be reviewed before acceptance.'],
      officialEvidence: { checkedAt: '2026-11-09', inputs: 'https://docs.dev.runwayml.com/assets/inputs/', pricing: 'https://docs.dev.runwayml.com/guides/pricing/', modelGuide: 'https://dev.runwayml.com/learn/wan-3-0-api', supported: 'WAN3 first/last keyframes; 2-30 seconds; 1080p=20 credits/second; references cannot mix with keyframes' } };
    await fixed(`${run}/plan.json`, json(plan));
    if (online) {
      const binding = await verifyProvider();
      await atomic(`${run}/provider-binding.json`, binding);
      if (!(await exists(ledgerPath))) {
        const old = await readFile(absolute(priorJournal));
        await fixed(`${run}/previous-budget-snapshot.json`, old);
        await fixed(ledgerPath, json({ schemaVersion: 1, owner, createdAt: new Date().toISOString(), authorization: 'Root relayed the latest direct user authorization: approximately 7000 API credits available for the Pamela goal; this supersedes old 4000/16 limits. Separate root approval remains required for these exact probes.', authorizedCredits: 7000, pilotCapCredits: 480, pilotMaxJobs: 2, openingBalance: binding.creditBalance, openingBinding: binding, liveBalanceGuard: true, historicalJournal: { path: priorJournal, sha256: sha(old), copiedTo: `${run}/previous-budget-snapshot.json`, oldReservationsTransferred: false }, jobs: [] }));
      }
    }
    const totals = await exists(ledgerPath) ? validateLedger(await read(ledgerPath)) : null;
    await atomic(`${run}/dry-run.json`, { checkedAt: new Date().toISOString(), sourceVerified: true, exactRequestsWritten: true, onlineReadOnly: online, paidJobsStartedByDryRun: 0, totals });
    console.log(json({ status: 'dry-run-complete', plan: `${run}/plan.json`, jobs: jobs.map(({ seat, requestSha256 }) => ({ seat, requestSha256 })), totalCredits: 480, totals, paidJobsStarted: 0 }));
  });
}
async function prepareMiddle(online: boolean) {
  const image = await input();
  await locked(async () => {
    const mapBytes = await readFile(absolute('references/dealer-map.json')), map = JSON.parse(mapBytes.toString('utf8'));
    const mapping = seats.map(seat => {
      const node = map.nodes.find((item: Json) => item.playerSeat === seat), target = map.targets.find((item: Json) => item.playerSeat === seat);
      if (node?.id !== directions[seat].slot || target?.box !== seat - 1) throw Error('Canonical seat ordering changed');
      return { seat, box: seat - 1, ...directions[seat], normalizedImageOrigin: 'top-left', calibratedLandingQuad: target.landingQuad, measured: false, includedInThisBatch: middleSeats.includes(seat) };
    });
    const jobs = [];
    for (const seat of middleSeats) {
      const bytes = json(body(seat, image.uri));
      await fixed(requestPath(seat), bytes); await fixed(`${run}/seat-${seat}.prompt.txt`, prompt(seat) + '\n');
      jobs.push({ seat, requestPath: requestPath(seat), requestSha256: sha(bytes), promptSha256: sha(prompt(seat)), model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, maxCredits: cost, source: { path: source, sha256: sourceHash, width: image.width, height: image.height, bytes: image.bytes }, firstLast: 'identical-unmodified-source', mirrored: false, target: mapping.find(item => item.seat === seat) });
    }
    const plan = { schemaVersion: 1, owner, dealerId: 'pamela-pilot', stage: 'middle-seats-2-through-6', status: 'prepared-not-approved-for-submission', productionAccepted: false, endpoint: `${endpoint}/v1/image_to_video`, apiVersion, jobs, mapping,
      budget: { authorizedEpochCredits: 7000, liveBalanceRequiredPerSubmit: true, thisBatchJobs: 5, thisBatchCredits: 1200, perJobCredits: cost, fullSevenSeatCredits: 1680, exactRootApprovalPerJobStillRequired: true },
      execution: { order: [2, 3, 4, 5, 6], submitOneAtATime: true, twoOuterProbesMustHaveCompletedFirst: true, duplicateExistingSeatForbidden: true, automaticRetry: false, automaticPolling: false },
      anchors: { first: source, last: source, sha256: sourceHash, sourceBytesUnmodified: true, existingOuterRequestsPreserved: true, identicalEndCardConflict: 'The generated card can disappear at the clean final frame; independent persistent cards and a hand mask remain required.' },
      geometry: { ordering: 'Seat 1 is viewer-left; seat 7 is viewer-right. Seat numbers never mean anatomical left/right. Shoe stays image-right.', mappingSource: 'references/dealer-map.json', mappingSha256: sha(mapBytes), targetsAreRequestedNotMeasured: true, allTargetsNeedPostGenerationCalibration: true, physicalCardRequest: '63x88mm poker-size, approximately 5:7 face-on width:height. Perspective is expected to change visible proportions; dimensions cannot be proven from one uncalibrated view.' },
      preservation: { oldCentralV6: 'Preserved untouched as a separate older candidate; this stage creates a new uniform seat-4 take.', olderBudgetJournal: 'Preserved; no old reservation transferred', originals: 'All generated original outputs retained with hashes' },
      reproducibility: { exactRequestsAndHashesSaved: true, modelPixelDeterminism: 'unknown; no verified seed control is used', pathsAndFrameIndicesMustBindToOutputHash: true },
      officialEvidence: { checkedAt: '2026-11-09', inputs: 'https://docs.dev.runwayml.com/assets/inputs/', pricing: 'https://docs.dev.runwayml.com/guides/pricing/', modelGuide: 'https://dev.runwayml.com/learn/wan-3-0-api' } };
    await fixed(`${run}/middle-plan.json`, json(plan));
    let binding = null;
    if (online) { binding = await verifyProvider(); await atomic(`${run}/provider-binding.json`, binding); }
    const totals = validateLedger(await read(ledgerPath));
    await atomic(`${run}/middle-dry-run.json`, { checkedAt: new Date().toISOString(), sourceVerified: true, exactRequestsWritten: true, onlineReadOnly: online, paidJobsStartedByDryRun: 0, totals, observedBalance: binding?.creditBalance ?? null });
    console.log(json({ status: 'middle-dry-run-complete', plan: `${run}/middle-plan.json`, planSha256: sha(json(plan)), jobs: jobs.map(({ seat, requestSha256, target }) => ({ seat, requestSha256, target })), thisBatchCredits: 1200, fullSevenSeatCredits: 1680, observedBalance: binding?.creditBalance ?? null, paidJobsStarted: 0 }));
  });
}
async function prepareRetake(online: boolean) {
  const seat: Seat = 7, image = await input(), location = attemptRun(seat);
  await locked(async () => {
    await mkdir(absolute(location), { recursive: true });
    const prior = await read(`${run}/seat-7.json`), priorReview = await readFile(absolute(`${run}/qa/seat-7/review.json`));
    if (prior.taskId !== '561bc600-46b2-4e7b-9a46-1cf960c4802a' || !prior.output?.sha256 || JSON.parse(priorReview.toString('utf8')).decision !== 'reject-finished-deal-card-is-retrieved') throw Error('Retake lacks the known failed-motion evidence');
    const bytes = json(body(seat, image.uri));
    await fixed(requestPath(seat), bytes); await fixed(`${location}/seat-7.prompt.txt`, prompt(seat) + '\n');
    const entry = { seat, attemptKey: retakeKey, requestPath: requestPath(seat), requestSha256: sha(bytes), promptSha256: sha(prompt(seat)), model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, maxCredits: cost, source: { path: source, sha256: sourceHash, width: image.width, height: image.height, bytes: image.bytes }, firstLast: 'first-only-no-final-anchor', mirrored: false };
    const plan = { schemaVersion: 1, owner, dealerId: 'pamela-pilot', status: 'prepared-single-first-only-retake', productionAccepted: false, endpoint: `${endpoint}/v1/image_to_video`, apiVersion, jobs: [entry], budget: { authorizedEpochCredits: 7000, maxThisAttemptCredits: 240, maxAttempts: 1, possibleSevenSeatTotalIncludingRejectedAttempt: 1920, liveBalanceGuard: true }, replaces: { taskId: prior.taskId, outputSha256: prior.output.sha256, reviewPath: `${run}/qa/seat-7/review.json`, reviewSha256: sha(priorReview), originalPreserved: true }, target: { x: .90, y: .88, normalizedOrigin: 'top-left', rightEdgeMaximum: .98, comparedToSeat6X: .74, status: 'requested-not-calibrated' }, behavior: { completeFingerReleaseRequired: true, emptyReturnRequired: true, dealtCardMustPersistToLastFrame: true, noEndImageConflict: true, endPoseOnlyPromptedNotGuaranteed: true }, execution: { automaticRetry: false, sequentialPaidPost: true, separateHashApproval: true, middleSeatsRemainPaused: true } };
    await fixed(`${location}/plan.json`, json(plan));
    const binding = online ? await verifyProvider() : null;
    if (binding) await atomic(`${run}/provider-binding.json`, binding);
    const ledger = await read(ledgerPath);
    validateLedger(ledger, ledger.jobs.some((item: Json) => rowKey(item) === retakeKey) ? 0 : cost, seat);
    await atomic(`${location}/dry-run.json`, { checkedAt: new Date().toISOString(), paidJobsStarted: 0, sourceVerified: true, observedBalance: binding?.creditBalance ?? null });
    console.log(json({ status: 'retake-dry-run-complete', plan: `${location}/plan.json`, planSha256: sha(json(plan)), ...entry, promptText: prompt(seat), observedBalance: binding?.creditBalance ?? null, paidJobsStarted: 0 }));
  });
}
async function prepareEndCard(online: boolean) {
  const seat: Seat = 7, image = await input(), location = attemptRun(seat);
  await locked(async () => {
    const priorLocation = `${run}/retakes/${retakeKey}`, prior = await read(`${priorLocation}/seat-7.json`);
    const reviewPath = `${priorLocation}/qa/seat-7/review.json`, review = await readFile(absolute(reviewPath));
    if (prior.taskId !== 'd4fa9ce6-daf6-45a8-9240-1f9efc162614' || prior.state !== 'SUCCEEDED' || JSON.parse(review.toString('utf8')).decision !== 'reject-camera-reframes-dealer-and-redo-out-of-view') throw Error('End-card attempt requires the exact failed camera evidence');
    const proofBytes = await readFile(absolute(endCardProof)), proof = JSON.parse(proofBytes.toString('utf8'));
    if (proof.last.sha256 !== endCardHash || proof.first.sha256 !== sourceHash || proof.pixelProof.outsideRoiChangedPixels !== 0 || proof.pixelProof.outsideRoiMaxChannelDelta !== 0) throw Error('Authored end anchor pixel proof failed');
    const bytes = json(body(seat, image.uri, image.lastUri));
    await fixed(requestPath(seat), bytes); await fixed(`${location}/seat-7.prompt.txt`, prompt(seat) + '\n');
    const entry = { seat, attemptKey: endCardKey, requestPath: requestPath(seat), requestSha256: sha(bytes), promptSha256: sha(prompt(seat)), model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, maxCredits: cost, source: { path: source, sha256: sourceHash, width: image.width, height: image.height, bytes: image.bytes }, last: proof.last, firstLast: 'original-first-authored-persistent-card-last', mirrored: false };
    const plan = { schemaVersion: 1, owner, dealerId: 'pamela-pilot', status: 'prepared-single-authored-end-card-pilot', productionAccepted: false, endpoint: `${endpoint}/v1/image_to_video`, apiVersion, jobs: [entry], budget: { authorizedEpochCredits: 7000, maxThisAttemptCredits: 240, maxAttempts: 1, possibleSevenSeatTotalIncludingTwoRejectedAttempts: 2160, liveBalanceGuard: true }, replaces: { taskId: prior.taskId, outputSha256: prior.output.sha256, reviewPath, reviewSha256: sha(review), originalPreserved: true }, endAnchor: { kind: proof.kind, proofPath: endCardProof, proofSha256: sha(proofBytes), builderSha256: sha(await readFile(absolute(`${location}/build-end-anchor.ts`))), lastSha256: endCardHash, targetQuad: proof.authoredGeometry.targetQuad, normalizedCenter: proof.authoredGeometry.normalizedCenter, pixelProof: proof.pixelProof, measuredCalibration: false, visuallyApprovedByRoot: true }, behavior: { noCameraMotionOrCrop: true, fullDealerVisibleEveryFrame: true, completeFingerReleaseRequired: true, emptyReturnRequired: true, dealtCardMustPersistToLastFrame: true, allCardAndShoeInsertSurfacesStayUnprinted: true, identicalDealerAndShoePixelsAtAnchors: true }, rationale: { firstLastEmpty: 'Prior attempt retrieved the landed card.', firstOnly: 'Prior attempt released card but reframed camera and hid REDO.', current: 'Same dealer framing at both anchors, with a physically retained dealt-card state only in LAST. This is a hypothesis to test, not a guaranteed fix.' }, execution: { automaticRetry: false, sequentialPaidPost: true, exactRequestAndPlanApprovalStillRequired: true, middleSeatsRemainPaused: true } };
    await fixed(`${location}/plan.json`, json(plan));
    const binding = online ? await verifyProvider() : null;
    if (binding) await atomic(`${run}/provider-binding.json`, binding);
    const ledger = await read(ledgerPath);
    validateLedger(ledger, ledger.jobs.some((item: Json) => rowKey(item) === endCardKey) ? 0 : cost, seat);
    await atomic(`${location}/dry-run.json`, { checkedAt: new Date().toISOString(), paidJobsStarted: 0, anchorsVerified: true, observedBalance: binding?.creditBalance ?? null });
    console.log(json({ status: 'end-card-dry-run-complete', plan: `${location}/plan.json`, planSha256: sha(json(plan)), ...entry, promptText: prompt(seat), observedBalance: binding?.creditBalance ?? null, paidJobsStarted: 0 }));
  });
}
async function middleGate() {
  const location = `${run}/retakes/${endCardKey}`, job = await read(`${location}/seat-7.json`);
  const reviewPath = `${location}/qa/seat-7/review.json`, bytes = await readFile(absolute(reviewPath)), review = JSON.parse(bytes.toString('utf8'));
  if (job.taskId !== '68abe40d-9412-4cbd-bb2e-fe8145316da4' || job.state !== 'SUCCEEDED' || !job.output?.sha256 || review.taskId !== job.taskId || review.sourceSha256 !== job.output.sha256 || review.conditionalMiddleBatchGatePassed !== true || review.decision !== 'continue-to-exact-middle-batch-review') throw Error('Passing exact seat-7 v3 motion review is required');
  return { taskId: job.taskId, outputSha256: job.output.sha256, reviewPath, reviewSha256: sha(bytes), decision: review.decision, productionAccepted: false };
}
async function prepareAuthoredMiddle(online: boolean) {
  await locked(async () => {
    const gate = await middleGate(), jobs = [];
    const mapBytes = await readFile(absolute('references/dealer-map.json')), map = JSON.parse(mapBytes.toString('utf8'));
    for (const seat of middleSeats) {
      const node = map.nodes.find((item: Json) => item.playerSeat === seat), target = map.targets.find((item: Json) => item.playerSeat === seat);
      if (node?.id !== directions[seat].slot || target?.box !== seat - 1) throw Error('Canonical seat ordering changed');
      const image = await input(seat), proofPath = `${middleEndRun}/seat-${seat}/end-anchor-proof.json`, proofBytes = await readFile(absolute(proofPath)), proof = JSON.parse(proofBytes.toString('utf8'));
      if (proof.last.sha256 !== middleEndHashes[seat] || proof.first.sha256 !== sourceHash || proof.pixelProof.outsideRoiChangedPixels !== 0 || proof.pixelProof.outsideRoiMaxChannelDelta !== 0) throw Error('Middle end anchor proof changed');
      const bytes = json(body(seat, image.uri, image.lastUri));
      await fixed(requestPath(seat), bytes); await fixed(`${middleEndRun}/seat-${seat}.prompt.txt`, prompt(seat) + '\n');
      jobs.push({ seat, attemptKey: `seat-${seat}`, attemptLabel: `seat-${seat}-end-card-v1`, requestPath: requestPath(seat), requestSha256: sha(bytes), promptSha256: sha(prompt(seat)), model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, maxCredits: cost, source: { path: source, sha256: sourceHash, width: image.width, height: image.height, bytes: image.bytes }, last: proof.last, firstLast: 'original-first-authored-persistent-card-last', mirrored: false, target: { ...directions[seat], box: seat - 1, normalizedImageOrigin: 'top-left', authoredCenter: proof.authoredGeometry.normalizedCenter, authoredQuad: proof.authoredGeometry.targetQuad, measuredCameraCalibration: false, calibratedLandingQuad: target.landingQuad }, endAnchorProof: { path: proofPath, sha256: sha(proofBytes), pixelProof: proof.pixelProof } });
    }
    const plan = { schemaVersion: 1, owner, dealerId: 'pamela-pilot', stage: 'middle-seats-2-through-6-authored-end-card-v1', status: 'prepared-awaiting-new-exact-root-approval', productionAccepted: false, endpoint: `${endpoint}/v1/image_to_video`, apiVersion, jobs, passingSeat7: gate,
      budget: { authorizedEpochCredits: 7000, perJobCredits: 240, thisBatchCredits: 1200, thisBatchJobs: 5, epochTotalAfterBatchIncludingRejectedAttempts: 2160, liveBalanceRequiredPerSubmit: true },
      execution: { order: [2, 3, 4, 5, 6], sequentialPaidPostsAndDurableTaskIds: true, maximumOwnedConcurrencyIfExplicitlyApproved: 3, providerConcurrencyMustBeRechecked: true, automaticRetry: false, duplicateExistingSeatForbidden: true, newRequestAndPlanHashApprovalRequired: true },
      authoredGeometry: { mappingSource: 'references/dealer-map.json', mappingSha256: sha(mapBytes), builder: `${middleEndRun}/build-end-anchors.ts`, builderSha256: sha(await readFile(absolute(`${middleEndRun}/build-end-anchors.ts`))), kind: 'authored-geometric-endpoints-not-measured-camera-calibration', firstPixelsOutsideEachCardRoiPreserved: true, generatedLandingsRequireSeparateMeasurement: true },
      requestedBehavior: { cardsPerClip: 1, persistentWhiteCard: true, cameraLockedAndFullDealerVisible: true, handReleaseThenEmptyReturn: true, bothDealerAnchorsRedo: true, noSecondCardJob: true },
      preservation: { olderMiddleFirstLastPlan: `${run}/middle-plan.json`, previousFailedSeat7Originals: 'preserved', oldCentralV6: 'preserved separately', historicalBudget: 'not modified' },
      acceptance: 'Pilot raw bank only. Every original needs frame QA; matte, card layer, hand occlusion, geometry and seams remain separate gates.' };
    await fixed(`${middleEndRun}/middle-plan.json`, json(plan));
    const binding = online ? await verifyProvider() : null;
    if (binding) await atomic(`${run}/provider-binding.json`, binding);
    const totals = validateLedger(await read(ledgerPath));
    await atomic(`${middleEndRun}/dry-run.json`, { checkedAt: new Date().toISOString(), anchorsVerified: true, paidJobsStarted: 0, totals, observedBalance: binding?.creditBalance ?? null });
    await bankIndex();
    console.log(json({ status: 'authored-middle-dry-run-complete', plan: `${middleEndRun}/middle-plan.json`, planSha256: sha(json(plan)), jobs: jobs.map(({ seat, requestSha256, target, last }) => ({ seat, requestSha256, center: target.authoredCenter, lastSha256: last.sha256 })), thisBatchCredits: 1200, passingSeat7: gate, paidJobsStarted: 0 }));
  });
}
function c2Prompt() {
  return `One uninterrupted 12-second take from a completely stationary tripod camera. FIRST already contains ONE plain-white card C1 on the far IMAGE-LEFT tabletop. LAST contains that same unmoved C1 with ONE additional separate card C2 laid partly on top. Preserve the whole reference dealer, head, both hands, black blazer, ivory blouse, shoe, original scale and framing. Keep the entire background AND tabletop bright saturated chroma green with fixed lighting. No zoom, pan, tilt, crop or reframing. [0-1s] Hold FIRST in REDO. The existing C1 stays absolutely fixed in position, orientation, size and shape for the entire take. [1-4s] The hand touching the shoe draws exactly ONE new rigid unprinted white card C2 and carries it across to the far IMAGE-LEFT existing card. [4-5s] Lower C2 flat onto the table-card plane, partly over C1, matching the two-card overlap in LAST. Match C2 to C1's apparent card dimensions and planar orientation. C2 is displaced slightly toward IMAGE RIGHT and UP relative to C1: about 40 pixels right and 19 pixels up on the supplied1536x1024 image, equivalent to46 right and22 up on the1762x1174 video grid. Its center is about16.3 percent of image width from LEFT and77.4 percent of image height from TOP. Keep the lower card's left end and lower long edge visibly exposed so two distinct cards remain readable. Do not move, resize, bend, fuse or retrieve C1. [5-6s] Release every finger from C2 and lift the complete EMPTY hand clear, with a visible gap between fingertips and both cards. [6-9s] Return the visibly EMPTY hand directly to its original REDO position at the shoe. Leave both cards untouched. [9-12s] Hold LAST in REDO. Both separate white cards remain motionless and visible through the final frame. Never erase, retrieve, lift or merge either placed card. Every card and the shoe's front insert stays plain unprinted white, without ranks, suits, text, pictures or colored artwork. Natural hand anatomy, continuous believable contact during placement, full dealer and complete cards inside the locked frame throughout.`;
}
async function prepareC2(online: boolean) {
  await locked(async () => {
    const manifestBytes = await readFile(absolute(c2AnchorsPath));
    if (sha(manifestBytes) !== c2AnchorsHash) throw Error('Frozen C2 anchor manifest changed');
    const anchors = JSON.parse(manifestBytes.toString('utf8'));
    if (anchors.first.sha256 !== c2FirstHash || anchors.last.sha256 !== c2LastHash || anchors.productionAccepted !== false || anchors.apiGenerationStarted !== false || anchors.geometry.transform.authoredC2OffsetNative.join(',') !== '46,-22') throw Error('C2 anchor identity or authored offset changed');
    const images = [];
    for (const [position, reference, expected] of [['first', anchors.first, c2FirstHash], ['last', anchors.last, c2LastHash]] as const) {
      const bytes = await readFile(absolute(reference.path)), metadata = await sharp(bytes).metadata();
      if (sha(bytes) !== expected || metadata.width !== 1536 || metadata.height !== 1024 || metadata.format !== 'png') throw Error(`C2 ${position} image changed`);
      const uri = `data:image/png;base64,${bytes.toString('base64')}`;
      if (Buffer.byteLength(uri) > 5_000_000) throw Error('C2 encoded image exceeds limit');
      images.push({ position, uri });
    }
    const request = { model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, promptText: c2Prompt(), promptImage: images };
    const bytes = json(request), requestFile = `${c2Run}/seat-1.request.json`;
    await mkdir(absolute(c2Run), { recursive: true });
    await fixed(requestFile, bytes); await fixed(`${c2Run}/seat-1.prompt.txt`, c2Prompt() + '\n');
    const entry = { seat: 1, ordinal: 2, attemptKey: c2Key, requestPath: requestFile, requestSha256: sha(bytes), promptSha256: sha(c2Prompt()), model: 'wan3', ratio: 'auto_1080p', duration: 12, audio: false, maxCredits: cost, first: anchors.first, last: anchors.last };
    const plan = {
      schemaVersion: 1, owner, dealerId: 'pamela-pilot', status: 'prepared-awaiting-exact-root-approval', purpose: 'feasibility-only', productionAccepted: false,
      endpoint: `${endpoint}/v1/image_to_video`, apiVersion, jobs: [entry],
      budget: { authorizedEpochCredits: 7000, thisAttemptCredits: 240, maximumJobs: 1, liveBalanceGuardRequiredBeforePost: true, reserveInSharedEpochBeforePost: true },
      anchors: { manifest: { path: c2AnchorsPath, sha256: c2AnchorsHash }, firstCardAlreadyPresent: true, additionalCardInLast: 1, authoredOffsetNative: [46, -22], authoredOffsetAnchor: anchors.geometry.transform.authoredC2OffsetAnchor, authoredCardCenters: anchors.geometry.target, physicalCalibration: 'unknown', rootVisuallyReviewedForPilot: true },
      limitations: { seat1ApparentCardArea: 'approximately9514alpha pixels versus approximately5400 for seats2-7; supplied comparison, not a physical-size calibration', cardDimensionsAccepted: false, materialAccepted: false, fullC2BankAccepted: false, runtimeAccepted: false, existingFirstCardBankPreserved: true },
      requiredQa: ['locked camera and bright-green frame0/1', 'C1 remains fixed throughout', 'one new C2 with continuous hand contact', 'two separate persistent card contours at authored overlap', 'complete release followed by empty return to REDO', 'both cards present through all final60frames', 'anatomy and contact inspection at native resolution'],
      execution: { automaticRetry: false, duplicateAttemptForbidden: true, sequentialPaidPost: true, maximumOwnedActiveTasks: 1, requestAndPlanHashApprovalRequired: true, taskJournal: `${c2Run}/seat-1.json`, taskReceipt: `${c2Run}/seat-1.task-id.json`, budgetLedger: ledgerPath, approvalPath: `${c2Run}/seat-1.approval.json`, preparationDoesNotAuthorizeSubmit: true },
    };
    await fixed(`${c2Run}/plan.json`, json(plan));
    const totals = validateLedger(await read(ledgerPath));
    if (totals.authorizedRemainingCredits < cost) throw Error('Epoch cannot cover the proposed C2 pilot');
    const binding = online ? await verifyProvider(cost) : null;
    if (binding) { await atomic(`${run}/provider-binding.json`, binding); await atomic(`${c2Run}/balance-preparation.json`, binding); }
    await atomic(`${c2Run}/dry-run.json`, { checkedAt: new Date().toISOString(), anchorsVerified: true, paidJobsStarted: 0, totals, observedBalance: binding?.creditBalance ?? null });
    console.log(json({ status: 'c2-feasibility-prepared-only', plan: `${c2Run}/plan.json`, planSha256: sha(json(plan)), requestSha256: entry.requestSha256, anchorManifestSha256: c2AnchorsHash, observedBalance: binding?.creditBalance ?? null, paidJobsStarted: 0, promptText: c2Prompt() }));
  });
}
async function bankIndex() {
  if (c2Pilot) return; // C2 feasibility is never an update to the frozen first-card bank.
  const entries = [];
  for (const seat of seats) {
    const location = seat === 1 ? run : seat === 7 ? `${run}/retakes/${endCardKey}` : middleEndRun;
    const attempt = seat === 1 ? 'seat-1-first-last' : seat === 7 ? endCardKey : `seat-${seat}-end-card-v1`;
    const file = `${location}/seat-${seat}.json`, reviewPath = `${location}/qa/seat-${seat}/review.json`;
    const job = await exists(file) ? await read(file) : null, review = await exists(reviewPath) ? await read(reviewPath) : null;
    const output = job?.output?.path && job?.output?.sha256 && job.output.probe ? { path: job.output.path, sha256: job.output.sha256, probe: { streams: job.output.probe.streams.map((stream: Json) => ({ width: stream.width, height: stream.height, avg_frame_rate: stream.avg_frame_rate, nb_read_frames: stream.nb_read_frames })), format: { duration: job.output.probe.format.duration } } } : null;
    entries.push({ seat, state: job?.state ?? (await exists(`${location}/seat-${seat}.request.json`) ? 'prepared' : 'not-prepared'), attempt, taskId: job?.taskId ?? null, output, reviewPath: review ? reviewPath : null, decision: review?.decision ?? null, productionAccepted: false });
  }
  const file = `${run}/bank-index.json`;
  if (await exists(file) && json((await read(file)).seats) === json(entries)) return;
  await atomic(file, { schemaVersion: 1, updatedAt: new Date().toISOString(), dealerId: 'pamela-pilot', seats: entries });
}
async function checkedJob(seat: Seat) {
  const plan = await read(planPath(seat)), entry = plan.jobs?.find((item: Json) => item.seat === seat);
  if (plan.owner !== owner || !entry || entry.model !== 'wan3' || entry.duration !== 12 || entry.maxCredits !== cost) throw Error('Prepared job identity changed');
  if (c2Pilot && (seat !== 1 || entry.ordinal !== 2 || entry.attemptKey !== c2Key || plan.purpose !== 'feasibility-only' || sha(await readFile(absolute(planPath(seat)))) !== c2PlanHash || entry.requestSha256 !== c2RequestHash)) throw Error('Exact approved C2 plan/request identity changed');
  const image = await input(seat), bytes = await readFile(absolute(requestPath(seat)));
  if (sha(bytes) !== entry.requestSha256 || bytes.toString('utf8') !== json(body(seat, image.uri, image.lastUri))) throw Error('Prepared request/source/prompt changed');
  return { entry, bytes };
}
function validateApproval(approval: Json, entry: Json) {
  if (approval.approved !== true || approval.approvedBy !== 'root' || approval.owner !== owner || approval.seat !== entry.seat || approval.requestSha256 !== entry.requestSha256 || approval.maxCredits !== cost || approval.endpointConflictAcknowledged !== true || !Number.isFinite(Date.parse(approval.approvedAt))) throw Error('Separate root approval for this exact payload is missing');
}
async function checkedApproval(entry: Json) {
  const approval = await read(approvalPath(entry.seat)); validateApproval(approval, entry);
  if (c2Pilot) {
    if (approval.attemptKey !== c2Key || approval.purpose !== 'feasibility-only' || approval.planSha256 !== c2PlanHash || approval.requestSha256 !== c2RequestHash || approval.anchorManifestSha256 !== c2AnchorsHash || approval.firstSha256 !== c2FirstHash || approval.lastSha256 !== c2LastHash || approval.maximumJobs !== 1 || approval.maxConcurrentOwnedTasks !== 1) throw Error('Root approval must bind the exact single C2 feasibility plan and anchors');
    return approval;
  }
  if (middleSeats.includes(entry.seat)) {
    if (approval.middleBankPlanSha256 !== sha(await readFile(absolute(planPath(entry.seat))))) throw Error('Root approval does not bind to the exact five-seat batch plan');
    for (const seat of outerSeats) { const job = await read(jobPath(seat)); if (job.state !== 'SUCCEEDED' || !job.output?.sha256) throw Error('Complete and download both outer probes before middle seats'); }
    if (middleEnd) {
      const proofPath = `${middleEndRun}/seat-${entry.seat}/end-anchor-proof.json`;
      const gate = await middleGate();
      if (approval.passingSeat7ReviewSha256 !== gate.reviewSha256 || approval.endAnchorSha256 !== middleEndHashes[entry.seat as Seat] || approval.endAnchorProofSha256 !== sha(await readFile(absolute(proofPath)))) throw Error('Middle approval must bind to passing v3 motion QA and the exact authored end anchor');
    }
  }
  if (entry.seat === 7 && endCard7) {
    const location = `${run}/retakes/${retakeKey}`, prior = await read(`${location}/seat-7.json`), priorReview = await readFile(absolute(`${location}/qa/seat-7/review.json`));
    if (approval.replacesTaskId !== prior.taskId || approval.priorReviewSha256 !== sha(priorReview) || approval.endAnchorSha256 !== endCardHash || approval.endAnchorProofSha256 !== sha(await readFile(absolute(endCardProof))) || approval.endCardPlanSha256 !== sha(await readFile(absolute(planPath(7))))) throw Error('Approval must bind to the exact failed camera take, authored end image, proof and plan');
  } else if (entry.seat === 7 && retake7) {
    const prior = await read(`${run}/seat-7.json`), priorReview = await readFile(absolute(`${run}/qa/seat-7/review.json`));
    if (approval.replacesTaskId !== prior.taskId || approval.priorReviewSha256 !== sha(priorReview)) throw Error('Retake approval must bind to the exact rejected prior take');
  } else if (entry.seat === 7) {
    const first = await read(jobPath(1)), review = approval.firstProbeReview;
    if (!first.output?.sha256 || first.state !== 'SUCCEEDED' || !review || review.taskId !== first.taskId || review.outputSha256 !== first.output.sha256 || review.decision !== 'continue-with-seat-7') throw Error('Second probe requires a review of the exact first output');
    if (typeof review.qaPath !== 'string' || !absolute(review.qaPath).startsWith(absolute(run) + path.sep) || !/^[a-f0-9]{64}$/.test(review.qaSha256) || sha(await readFile(absolute(review.qaPath))) !== review.qaSha256) throw Error('First-probe QA evidence changed or is missing');
  }
  return approval;
}
async function record(ledger: Json, job: Json) {
  const row = ledger.jobs.find((item: Json) => rowKey(item) === rowKey(job));
  if (!row || row.requestSha256 !== job.requestSha256 || row.taskId && row.taskId !== job.taskId) throw Error('Durable reservation identity mismatch');
  Object.assign(row, { state: job.state, taskId: job.taskId ?? null, reservedCredits: Math.max(cost, Number(job.estimatedCost?.credits ?? cost)), checkedAt: new Date().toISOString() });
  await atomic(jobPath(job.seat), job); await atomic(ledgerPath, ledger); await bankIndex();
}
async function submit(seat: Seat) {
  await locked(async () => {
    const { entry, bytes } = await checkedJob(seat), approval = await checkedApproval(entry), ledger = await read(ledgerPath);
    validateLedger(ledger, cost, seat);
    if (ledger.jobs.some((item: Json) => rowKey(item) === attemptKey(seat)) || await exists(jobPath(seat)) || await exists(taskPath(seat))) throw Error('This exact attempt was already started; use status, never resubmit');
    const historical = await readFile(absolute(priorJournal));
    if (sha(historical) !== ledger.historicalJournal.sha256) throw Error('Historical journal changed after epoch creation; reconcile concurrent generation first');
    const requestHeaders = await headers(), binding = await verifyProvider(cost, requestHeaders);
    const concurrency = validateConcurrency(ledger, binding, approval, seat);
    await atomic(`${run}/provider-binding.json`, binding);
    await fixed(`${attemptRun(seat)}/seat-${seat}.balance-before.json`, json(binding));
    const job: Json = { ...entry, attemptKey: attemptKey(seat), owner, state: 'submission-started', submittedAt: new Date().toISOString(), taskId: null, approvalSha256: sha(json(approval)), balanceBefore: binding.creditBalance, concurrency, productionAccepted: false };
    ledger.jobs.push({ seat, attemptKey: attemptKey(seat), requestSha256: entry.requestSha256, state: job.state, taskId: null, reservedCredits: cost, submittedAt: job.submittedAt });
    // Journal and attempt receipt must both be durable BEFORE the sole paid POST.
    await atomic(ledgerPath, ledger); await fixed(jobPath(seat), json(job));
    try {
      const response = await fetch(`${endpoint}/v1/image_to_video`, { method: 'POST', headers: requestHeaders, body: bytes.toString('utf8'), redirect: 'error', signal: AbortSignal.timeout(60_000) });
      job.httpStatus = response.status;
      if (!response.ok) { job.state = 'http-error-no-retry'; throw Error(`Runway HTTP ${response.status}; reservation retained`); }
      const result = await responseJson(response);
      if (typeof result.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(result.id)) throw Error('Task ID missing; outcome uncertain, never resubmit');
      // Task ID saved before status polling, budget changes or any other API call.
      await fixed(taskPath(seat), json({ taskId: result.id, receivedAt: new Date().toISOString(), requestSha256: entry.requestSha256 }));
      job.taskId = result.id; job.state = 'submitted';
      if (result.estimatedCost != null) {
        if (!Number.isSafeInteger(result.estimatedCost.credits) || result.estimatedCost.credits < 0) throw Error('Invalid provider estimate; reconcile task before continuation');
        job.estimatedCost = { credits: result.estimatedCost.credits };
      }
      await record(ledger, job);
      console.log(json({ seat, state: job.state, taskId: job.taskId, expectedCredits: cost, apiEstimatedCost: job.estimatedCost ?? null, balanceBefore: binding.creditBalance }));
    } catch (error) {
      if (!['http-error-no-retry', 'submitted'].includes(job.state)) job.state = 'submission-outcome-uncertain-no-retry';
      await record(ledger, job); throw error;
    }
  });
}
async function refresh(seat: Seat) {
  const receipt = await read(taskPath(seat)), job = await read(jobPath(seat)), ledger = await read(ledgerPath);
  if (!/^[a-f0-9-]{36}$/i.test(receipt.taskId) || receipt.requestSha256 !== job.requestSha256 || job.taskId && job.taskId !== receipt.taskId) throw Error('Task receipt identity mismatch');
  const task = await responseJson(await fetch(`${endpoint}/v1/tasks/${receipt.taskId}`, { headers: await headers(), redirect: 'error', signal: AbortSignal.timeout(30_000) }));
  if (task.id !== receipt.taskId || !['PENDING', 'THROTTLED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(task.status)) throw Error('Task identity/status mismatch');
  Object.assign(job, { taskId: receipt.taskId, state: task.status, checkedAt: new Date().toISOString() });
  if (typeof task.failureCode === 'string') job.failureCode = task.failureCode;
  await record(ledger, job); return { job, task };
}
async function download(seat: Seat) {
  const { job, task } = await refresh(seat), file = `${attemptRun(seat)}/original/pamela-seat-${seat}-wan3-${c2Pilot ? 'c2-feasibility-v1' : middleEnd ? 'end-card-v1' : endCard7 ? 'end-card-v3' : retake7 ? 'first-only-v2' : 'first-last'}.mp4`;
  if (task.status !== 'SUCCEEDED' || !Array.isArray(task.output) || task.output.length !== 1) throw Error('No single completed video is available');
  if (await exists(file)) {
    if (job.output?.sha256 !== sha(await readFile(absolute(file)))) throw Error('Existing output differs or lacks provenance; preserve it');
  } else {
    const url = new URL(task.output[0]);
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !/(^|\.)(cloudfront\.net|runwayml\.com)$/.test(url.hostname)) throw Error('Unexpected output host');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw Error(`Output download HTTP ${response.status}`);
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 150_000_000) { await reader.cancel(); throw Error('Output exceeds bounded download'); } chunks.push(next.value); }
    const bytes = Buffer.concat(chunks);
    await mkdir(absolute(`${attemptRun(seat)}/original`), { recursive: true });
    // Save expected bytes/hash before writing so a partial file is distinguishable.
    job.output = { path: file, sha256: sha(bytes), bytes: bytes.length }; await atomic(jobPath(seat), job);
    await fixed(file, bytes);
  }
  if (!job.output.probe) {
    const ffprobe = 'C:/Users/jakem/AppData/Local/Programs/CroupierTestTools/ffmpeg-9.0.1-essentials_build/bin/ffprobe.exe';
    const { stdout } = await promisify(execFile)(ffprobe, ['-v', 'error', '-threads', '1', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', absolute(file)], { windowsHide: true, maxBuffer: 16000 });
    job.output.probe = JSON.parse(stdout); await atomic(jobPath(seat), job);
  }
  const binding = await verifyProvider();
  await atomic(`${run}/provider-binding.json`, binding);
  if (!(await exists(`${attemptRun(seat)}/seat-${seat}.balance-after.json`))) await fixed(`${attemptRun(seat)}/seat-${seat}.balance-after.json`, json(binding));
  await bankIndex();
  return { ...job.output, balanceAfter: binding.creditBalance };
}
async function selfTest() {
  const blank = { owner, authorizedCredits: 7000, pilotCapCredits: 480, pilotMaxJobs: 2, jobs: [] };
  assert.equal(validateLedger(blank, cost).pilotRemainingCredits, 480);
  const one = { ...blank, jobs: [{ seat: 1, reservedCredits: cost, state: 'submission-outcome-uncertain-no-retry' }] };
  assert.equal(validateLedger(one, cost).reservedCredits, cost); // Uncertain attempt keeps its money.
  assert.throws(() => validateLedger({ ...blank, jobs: [{ seat: 1, reservedCredits: cost }, { seat: 1, reservedCredits: cost }] }));
  assert.throws(() => validateLedger({ ...blank, authorizedCredits: 962 })); // Observed balance must not replace authorization.
  assert.throws(() => validateLedger({ ...one, jobs: [{ seat: 1, reservedCredits: 241 }] }));
  assert.throws(() => validateLedger({ ...one, jobs: [...one.jobs, { seat: 7, reservedCredits: cost }] }, cost));
  assert.equal(validateLedger({ ...one, jobs: [...one.jobs, { seat: 7, reservedCredits: cost }] }, cost, 2).middleStageRemainingCredits, 1200);
  const complete = { ...blank, jobs: seats.map(seat => ({ seat, reservedCredits: cost })) };
  assert.equal(validateLedger(complete).reservedCredits, 1680);
  assert.throws(() => validateLedger(complete, cost, 3));
  const withRetake = { ...complete, jobs: [...complete.jobs, { seat: 7, attemptKey: retakeKey, reservedCredits: cost }] };
  assert.equal(validateLedger(withRetake).reservedCredits, 1920);
  assert.throws(() => validateLedger(withRetake, cost, 7, retakeKey));
  assert.throws(() => validateLedger({ ...blank, jobs: [{ seat: 6, attemptKey: retakeKey, reservedCredits: cost }] }));
  const withEndCard = { ...withRetake, jobs: [...withRetake.jobs, { seat: 7, attemptKey: endCardKey, reservedCredits: cost }] };
  assert.equal(validateLedger(withEndCard).reservedCredits, 2160);
  assert.throws(() => validateLedger(withEndCard, cost, 7, endCardKey));
  assert.throws(() => validateLedger({ ...blank, jobs: [{ seat: 2, attemptKey: endCardKey, reservedCredits: cost }] }));
  assert.equal(validateLedger(withEndCard, cost, 1, c2Key).reservedCredits, 2160);
  const withC2 = { ...withEndCard, jobs: [...withEndCard.jobs, { seat: 1, attemptKey: c2Key, reservedCredits: cost, state: 'submission-outcome-uncertain-no-retry' }] };
  assert.equal(validateLedger(withC2).reservedCredits, 2400);
  assert.equal(validateLedger(withC2).c2RemainingCredits, 0);
  assert.throws(() => validateLedger(withC2, cost, 1, c2Key));
  assert.throws(() => validateLedger(withEndCard, cost, 2, c2Key));
  assert.throws(() => validateLedger({ ...blank, jobs: [{ seat: 7, attemptKey: c2Key, reservedCredits: cost }] }));
  assert.equal(new Set(seats.map(seat => directions[seat].x)).size, 7);
  assert.ok(seats.every((seat, index) => index === 0 || directions[seat].x > directions[seats[index - 1]].x));
  const twoRunning = { jobs: [2, 3].map(seat => ({ seat, state: 'RUNNING', taskId: 'test' })) }, provider = { modelLimits: { maxConcurrentGenerations: 5 } }, concurrentApproval = { maxConcurrentOwnedTasks: 3 };
  assert.equal(validateConcurrency(twoRunning, provider, concurrentApproval, 4).ownedMaximum, 3);
  assert.throws(() => validateConcurrency({ jobs: [...twoRunning.jobs, { state: 'submitted', taskId: 'test' }] }, provider, concurrentApproval, 5));
  assert.throws(() => validateConcurrency(twoRunning, {}, concurrentApproval, 4));
  assert.throws(() => validateConcurrency({ jobs: [{ state: 'submission-outcome-uncertain-no-retry' }] }, provider, concurrentApproval, 4));
  const entry = { seat: 1, requestSha256: 'a'.repeat(64) }, approval = { approved: true, approvedBy: 'root', owner, seat: 1, requestSha256: entry.requestSha256, maxCredits: cost, endpointConflictAcknowledged: true, approvedAt: new Date().toISOString() };
  validateApproval(approval, entry);
  assert.throws(() => validateApproval({ ...approval, requestSha256: 'b'.repeat(64) }, entry));
  assert.throws(() => validateApproval({ ...approval, approved: false }, entry));
  assert.throws(() => writeTarget(`${run}/../outside.json`));
  assert.equal(body(1, 'test').promptImage[0].uri, body(1, 'test').promptImage[1].uri);
  const lockProof = await locked(async () => { await assert.rejects(locked(async () => 'unexpected'), { code: 'EEXIST' }); return true; });
  assert.equal(lockProof, true);
  const withSymmetric1 = { ...withC2, jobs: [...withC2.jobs, { seat: 1, attemptKey: symmetric1Key, reservedCredits: cost, state: 'submission-outcome-uncertain-no-retry' }] };
  assert.equal(validateLedger(withSymmetric1).reservedCredits, 2640);
  assert.throws(() => validateLedger(withSymmetric1, cost, 1, symmetric1Key));
  assert.throws(() => validateLedger({ ...blank, jobs: [{ seat: 7, attemptKey: symmetric1Key, reservedCredits: cost }] }));
  assert.equal(validateLedger(withC2, cost, 1, symmetric1Key).reservedCredits, 2400);
  const withStage1 = { ...withSymmetric1, jobs: [...withSymmetric1.jobs, ...[1,7].map(seat => ({ seat, attemptKey: `seat-${seat}-c2-bank-v2`, reservedCredits: cost, state: 'RUNNING' }))] };
  assert.equal(validateLedger(withStage1).reservedCredits, 3120);
  assert.throws(() => validateLedger(withStage1, cost, 1, c2Stage1Keys[0]));
  assert.throws(() => validateLedger({ ...blank, jobs: [{ seat: 2, attemptKey: c2Stage1Keys[0], reservedCredits: cost }] }));
  assert.throws(() => validateLedger({ ...blank, jobs: [{ seat: 2, attemptKey: 'seat-3-c2-bank-v2', reservedCredits: cost }] }));
  assert.equal(validateLedger(withSymmetric1, cost, 7, c2Stage1Keys[1]).reservedCredits, 2640);
  const withStage2 = { ...withStage1, jobs: [...withStage1.jobs, ...middleSeats.map(seat => ({ seat, attemptKey: `seat-${seat}-c2-bank-v2`, reservedCredits: cost, state: 'RUNNING' }))] };
  assert.equal(validateLedger(withStage2).reservedCredits, 4320);
  assert.equal(validateLedger(withStage1, cost, 2, c2Stage2Keys[0]).reservedCredits, 3120);
  assert.throws(() => validateLedger(withStage2, cost, 2, c2Stage2Keys[0]));
  assert.throws(() => validateLedger(withStage1, cost, 1, c2Stage2Keys[0]));
  assert.throws(() => validateLedger({ ...withStage2, jobs: [...withStage2.jobs, withStage2.jobs.at(-1)] }));
  await atomic(`${run}/c2/bank-v2-stage-2/bank-accounting-self-test.json`, { checkedAt: new Date().toISOString(), passed: 47, networkCalls: 0, paidJobsStarted: 0, checks: 'Previous42 groups plus bounded C2 P2-P6 stage1200 accounting, full-bank4320, duplicate/wrong-seat rejection; stage1 preserved' });
  console.log(json({ status: 'self-test-passed', checks: 47, networkCalls: 0, paidJobsStarted: 0 }));
}
async function main() {
  if (process.versions.node !== '24.21.0') throw Error('Use the project-pinned Node 24.21.0');
  const args = process.argv.slice(2), modes = args.filter(value => ['--dry-run', '--submit', '--status', '--download', '--self-test', '--index'].includes(value));
  if (modes.length !== 1 || args.some(value => !['--dry-run', '--submit', '--status', '--download', '--self-test', '--index', '--verify-api', '--middle', '--retake-7', '--end-card-7', '--middle-end-card', '--c2-1', ...seats.map(seat => `--seat=${seat}`)].includes(value))) throw Error('Use --dry-run [--middle|--retake-7|--end-card-7|--middle-end-card|--c2-1] [--verify-api] | --submit|--status|--download --seat=1..7 [--retake-7|--end-card-7|--middle-end-card] | --self-test | --index');
  if ([retake7, endCard7, middleEnd, c2Pilot, args.includes('--middle')].filter(Boolean).length > 1) throw Error('Select only one explicit stage');
  if (modes[0] === '--index') { if (args.length !== 1) throw Error('Index takes no other flags'); await locked(bankIndex); console.log('Public-safe bank index refreshed'); return; }
  if (modes[0] === '--self-test') { if (args.length !== 1) throw Error('Self-test takes no other flags'); await selfTest(); return; }
  if (modes[0] === '--dry-run') { if (args.some(value => value.startsWith('--seat='))) throw Error('Dry-run prepares one complete stage'); if (c2Pilot) await prepareC2(args.includes('--verify-api')); else if (middleEnd) await prepareAuthoredMiddle(args.includes('--verify-api')); else if (endCard7) await prepareEndCard(args.includes('--verify-api')); else if (retake7) await prepareRetake(args.includes('--verify-api')); else if (args.includes('--middle')) await prepareMiddle(args.includes('--verify-api')); else await prepare(args.includes('--verify-api')); return; }
  const seatArgs = args.filter(value => value.startsWith('--seat='));
  if (seatArgs.length !== 1 || args.includes('--verify-api') || args.includes('--middle')) throw Error('Exactly one seat is required');
  const seat = Number(seatArgs[0].slice(7)) as Seat;
  if (c2Pilot && seat !== 1) throw Error('C2 feasibility is seat1 only');
  if ((retake7 || endCard7) && seat !== 7) throw Error('The bounded retake is for seat 7 only');
  if (middleEnd && !middleSeats.includes(seat)) throw Error('The authored middle stage covers seats 2-6 only');
  if (modes[0] === '--submit') await submit(seat);
  else await locked(async () => {
    if (modes[0] === '--download') console.log(json({ seat, output: await download(seat) }));
    else { const { job } = await refresh(seat); console.log(json({ seat, taskId: job.taskId, state: job.state, checkedAt: job.checkedAt })); }
  });
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
