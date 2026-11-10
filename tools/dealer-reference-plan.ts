/** Prepare one offline Gen-4 Image review plan from frozen local references. */
import assert from 'node:assert/strict';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { hash, type Ref } from './dealer-video-job.ts';

const api = 'https://docs.dev.runwayml.com/api/';
const pricing = 'https://docs.dev.runwayml.com/guides/pricing/#image-generation-pricing';
const scoutMethod = {
  repository: 'Jakeminator123/scoutgaming',
  revision: '35b181c556bd54b6a50268cdfb4189990773aef5',
  path: 'services/studio-worker/dealer-factory/dealer_factory/runway_dev.py',
  line: 116,
};
const version = '2024-11-06', model = 'gen4_image', ratio = '1920:1080';
const width = 1920, height = 1080, estimatedCredits = 8;
const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

function object(value: unknown, label: string): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function reference(value: unknown, label: string): Ref {
  const { path, sha256 } = object(value, label);
  assert(typeof path === 'string' && typeof sha256 === 'string' && /^[0-9a-f]{64}$/.test(sha256), `${label} needs a path and lowercase SHA-256`);
  return { path, sha256 };
}

function id(value: unknown, label: string) {
  assert(typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value), `${label} must be a lowercase ID`);
  return value;
}

function identity(value: Record<string, unknown>) {
  return { projectId: id(value.projectId, 'projectId'), dealerId: id(value.dealerId, 'dealerId'), bankId: id(value.bankId, 'bankId') };
}

function scene(value: unknown) {
  const s = object(value, 'Scene');
  return { id: id(s.id, 'scene.id'), reference: reference(s.reference, 'Scene image') };
}

async function localPath(root: string, relative: string, output = false) {
  assert(/^(runs|references|media)\//.test(relative) && !/[\\:<>|?*\x00-\x1f]/.test(relative), 'Expected a local review artifact path');
  const parts = relative.split('/');
  assert(parts.every(part => part && !part.startsWith('.') && !part.endsWith('.') && part === part.trim()), 'Expected a plain relative path');
  if (output) assert(parts[0] === 'runs' && parts.length >= 3 && relative.endsWith('.json'), 'Write a new JSON plan inside its runs/ folder');
  let resolved = root;
  for (const [i, part] of parts.entries()) {
    resolved = path.join(resolved, part);
    const last = i === parts.length - 1;
    if (output && last) break;
    const stat = await lstat(resolved);
    assert(!stat.isSymbolicLink() && (last ? stat.isFile() : stat.isDirectory()), 'Review artifacts must be regular local files');
  }
  return resolved;
}

async function checked(root: string, ref: Ref) {
  const bytes = await readFile(await localPath(root, ref.path));
  assert(hash(bytes) === ref.sha256, `SHA-256 mismatch: ${ref.path}`);
  return bytes;
}

async function metadata(root: string, ref: Ref, label: string) {
  assert(ref.path.endsWith('.json'), `${label} must be JSON`);
  const bytes = await checked(root, ref);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { throw Error(`${label} is invalid JSON`); }
  return object(value, label);
}

async function image(root: string, ref: Ref) {
  const source = sharp(await checked(root, ref), { failOn: 'error' });
  const { format, width, height, pages = 1, orientation } = await source.metadata();
  assert((format === 'png' || format === 'jpeg' || format === 'webp') && width && height && pages === 1, 'Expected a still PNG, JPEG or WebP image');
  assert(!orientation || orientation === 1, 'Bake the image orientation before freezing its SHA-256');
  await source.stats();
  return { ...ref, mimeType: mime[format], width, height };
}

async function buildPlan(root: string, source: Ref) {
  const spec = await metadata(root, source, 'Dealer reference spec');
  assert.equal(spec.schemaVersion, 1, 'Unsupported spec schema');
  const { role } = spec;
  assert(role === 'VILA' || role === 'REDO', 'Expected role VILA or REDO');
  assert(typeof spec.description === 'string' && spec.description.trim(), 'A free-form dealer description is required');
  const description = spec.description.trim();
  assert(!/data:[^,\s]+;base64,/i.test(description), 'Use descriptive text in the description');
  const descriptionSha256 = hash(description);
  const target = identity(spec), set = scene(spec.scene);
  const guideRef = reference(spec.poseGuide, 'Pose guide');
  const guide = await metadata(root, guideRef, 'Pose guide');
  assert(guide.schemaVersion === 1 && guide.kind === 'dealer-pose-guide' && guide.role === role, 'Pose guide role mismatch');
  const [sceneImage, poseImage] = await Promise.all([image(root, set.reference), image(root, reference(guide.image, 'Pose image'))]);
  const referenceImages = [{ tag: 'scene', localImage: sceneImage }, { tag: 'pose', localImage: poseImage }];
  let anchor = null;
  if (role === 'REDO') {
    const review = reference(spec.identityAnchor, 'Approved VILA identity review');
    const approval = await metadata(root, review, 'VILA identity review');
    assert(approval.schemaVersion === 1 && approval.kind === 'dealer-reference-anchor-review' && approval.role === 'VILA' && approval.status === 'approved', 'REDO requires an approved VILA identity review');
    assert(typeof approval.reviewedBy === 'string' && approval.reviewedBy.trim() && approval.reviewedBy.length <= 80, 'The VILA review needs a named reviewer');
    const vilaPlan = reference(approval.vilaPlan, 'Reviewed VILA plan');
    const approvedPlan = await metadata(root, vilaPlan, 'Reviewed VILA plan');
    assert(approvedPlan.schemaVersion === 1 && approvedPlan.kind === 'dealer-reference-image-plan' && approvedPlan.status === 'local-review-only' && approvedPlan.role === 'VILA', 'The approval must bind a VILA plan');
    assert.deepEqual(identity(object(approvedPlan.identity, 'Reviewed VILA identity')), target, 'VILA identity differs from REDO identity');
    assert.deepEqual(scene(approvedPlan.scene), set, 'VILA scene differs from REDO scene');
    assert.equal(approvedPlan.descriptionSha256, descriptionSha256, 'Keep the approved VILA description in REDO');
    const payload = object(approvedPlan.requestTemplate, 'VILA request');
    assert(payload.model === model && payload.ratio === ratio, 'VILA reference model or framing differs');
    const localImage = await image(root, reference(approval.image, 'Approved VILA image'));
    assert(localImage.width === width && localImage.height === height, 'Approved VILA image must match the planned 1920×1080 frame');
    anchor = { review, vilaPlan, image: localImage };
    referenceImages.push({ tag: 'identity', localImage });
  } else {
    assert(spec.identityAnchor === undefined, 'VILA establishes the new identity without an identity anchor');
  }
  assert(new Set(referenceImages.map(item => item.localImage.sha256)).size === referenceImages.length, 'Scene, pose and identity need distinct reference images');
  const pose = role === 'VILA'
    ? 'Create the new dealer described below. Both hands rest naturally in the VILA pose from @pose.'
    : 'Match the same face, hair, proportions and clothing in @identity. Use the REDO pregrasp in @pose with the yellow insert seated in the shoe.';
  const promptText = `One realistic dealer still. Match the fixed camera, table, shoe, room and lighting of @scene. Use @pose for body and hand geometry only. ${pose} Dealer brief: ${description}`;
  assert(promptText.length <= 1000, 'The complete Gen-4 Image prompt exceeds 1000 UTF-16 code units');
  return {
    schemaVersion: 1, kind: 'dealer-reference-image-plan', status: 'local-review-only', identity: target, role, source, descriptionSha256,
    scene: { id: set.id, reference: sceneImage }, poseGuide: { role, ref: guideRef, image: poseImage }, identityAnchor: anchor,
    provider: { name: 'Runway Dev API', method: 'POST', endpoint: '/v1/text_to_image', version, api },
    requestTemplate: { model, ratio, promptText, referenceImages }, promptSha256: hash(promptText),
    expected: { width, height }, estimate: { images: 1, credits: estimatedCredits, source: pricing },
    scoutMethod, mediaTransferAuthorized: false, productionAccepted: false, calibration: 'pending',
  };
}

const encodePlan = (plan: Awaited<ReturnType<typeof buildPlan>>) => JSON.stringify(plan, null, 2) + '\n';

/** Replay all frozen input checks and return the exact verified image bytes. */
export async function readVerifiedDealerReferencePlan(workspace: string, ref: Ref) {
  const root = await realpath(workspace);
  assert(ref.path.endsWith('.json'), 'Dealer reference plan must be JSON');
  const bytes = await checked(root, ref);
  const saved = object(JSON.parse(bytes.toString('utf8')), 'Dealer reference plan');
  const plan = await buildPlan(root, reference(saved.source, 'Original dealer spec'));
  assert(bytes.equals(Buffer.from(encodePlan(plan))), 'Saved plan differs from its exact replay');
  const images = await Promise.all(plan.requestTemplate.referenceImages.map(async ({ tag, localImage }) => ({
    tag, localImage, bytes: await checked(root, localImage),
  })));
  return { root, plan, images };
}

export async function writeDealerReferencePlan(workspace: string, source: Ref, out: string): Promise<Ref> {
  const root = await realpath(workspace);
  const bytes = encodePlan(await buildPlan(root, source));
  await writeFile(await localPath(root, out, true), bytes, { flag: 'wx' });
  return { path: out, sha256: hash(bytes) };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const usage = 'Usage: node tools/dealer-reference-plan.ts plan --spec=runs/.../spec.json --sha=<sha256> --out=runs/.../plan.json';
  assert(command === 'plan' && args.length === 3, usage);
  const options: Record<string, string> = {};
  for (const arg of args) {
    const match = /^--(spec|sha|out)=(.+)$/.exec(arg);
    assert(match && !options[match[1]], usage);
    options[match[1]] = match[2];
  }
  const spec = reference({ path: options.spec, sha256: options.sha }, 'Spec');
  const plan = await writeDealerReferencePlan(fileURLToPath(new URL('../', import.meta.url)), spec, options.out);
  console.log(JSON.stringify(plan));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Reference planning failed'); process.exitCode = 1; });
}
