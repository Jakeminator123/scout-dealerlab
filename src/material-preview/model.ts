import framing from '../../references/material-framing.json' with { type: 'json' };
export type MaterialAsset = {
  path: string; name: string; displayName?: string; video: boolean; sha256?: string;
  width?: number; height?: number; fps?: number; duration?: number; frameCount?: number;
  dealerId?: string; dealerLabel?: string; origin?: string;
};
export type Placement = { scale: number; x: number; y: number; key: boolean };
export type BackdropView = { projection: 'photo' | 'panorama'; yaw: number; pitch: number; fov: number; zoom: number; x: number; y: number };
export const DEFAULT_BACKDROP: BackdropView = { projection: 'panorama', yaw: 0, pitch: 0, fov: 65, zoom: 1, x: 0, y: 0 };
export const DEFAULT_PLACEMENT: Placement = { scale: 1, x: 0, y: 0, key: false };
export function previewPlacement(asset: MaterialAsset | undefined, key = false): Placement {
  const fit = framing.assets.find(f => f.sha256 === asset?.sha256);
  if (!fit) return { ...DEFAULT_PLACEMENT, key };
  const factor = (framing.target.handY - framing.target.eyeY) / (fit.handY - fit.eyeY);
  const height = fit.height * factor;
  return { scale: height / 1080, x: 0, y: framing.target.eyeY - fit.eyeY * factor - (1080 - height) / 2, key };
}
export const BACKGROUNDS = [
  { id: 'checker', name: 'Schackruta', color: '#29313c' },
  { id: 'light', name: 'Ljus', color: '#ecebe7' },
  { id: 'dark', name: 'Mörk', color: '#101419' },
  { id: 'astrid', name: 'Astrids darkhall · helscensreferens', path: 'gpt-underlag/uppackad-zip-underlag/05_referens_Emil/darkhall.jpg' },
  { id: 'wood', name: 'Görans träkasino', path: 'extra/insperationsmall-alternativ/trakasino-360-panorama.png' },
  { id: 'forest', name: 'Skog', path: 'media/materialprov/panorama-4096.avif' },
  { id: 'la', name: 'Los Angeles', path: 'media/materialprov/la-panorama.jpg' },
  { id: 'vegas', name: 'Las Vegas', path: 'media/materialprov/vegas-panorama.jpg' },
] as const;
export const fileUrl = (path: string) => '/files/' + path.split('/').map(encodeURIComponent).join('/');
export function reviewMatches(assets: Pick<MaterialAsset, 'path' | 'sha256'>[], inputs: { path: string; sha256: string }[]): boolean {
  const unique = assets.filter((a, index) => assets.findIndex(b => b.path === a.path) === index);
  return unique.length === inputs.length && unique.every((a, i) => a.path === inputs[i].path && a.sha256 === inputs[i].sha256);
}
export function actorRect(width: number, height: number, placement: Placement): [number, number, number, number] {
  if (![width, height, placement.scale, placement.x, placement.y].every(Number.isFinite) || width <= 0 || height <= 0 || placement.scale <= 0) throw new Error('Ogiltiga bildmått eller placering.');
  const h = 1080 * placement.scale, w = h * width / height;
  return [(1920 - w) / 2 + placement.x, (1080 - h) / 2 + placement.y, w, h];
}
export function coverRect(width: number, height: number): [number, number, number, number] {
  const scale = Math.max(1920 / width, 1080 / height);
  return [(1920 - width * scale) / 2, (1080 - height * scale) / 2, width * scale, height * scale];
}
export function backdropRect(width: number, height: number, view: BackdropView): [number, number, number, number] {
  const base = coverRect(width, height), w = base[2] * Math.max(1, view.zoom), h = base[3] * Math.max(1, view.zoom);
  const x = Math.max(-1, Math.min(1, view.x)), y = Math.max(-1, Math.min(1, view.y));
  return [(1920 - w) / 2 + x * (w - 1920) / 2, (1080 - h) / 2 + y * (h - 1080) / 2, w, h];
}
export function seekTime(time: number, duration: number, offset: number): number {
  return Math.max(0, Math.min(Number.isFinite(duration) ? duration : Math.max(0, time + offset), time + offset));
}
