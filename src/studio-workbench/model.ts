export type WorkbenchSource = {
  url: string; sha256: string; width: number; height: number; frameCount: number; duration: number;
};
export type WorkbenchTimelineFrame = { clip: string; dealNumber: number; sourceFrame: number; outputFrame: number };
export type WorkbenchSegment = {
  label: string; from: number; to: number; sourceClip: string; sourceFrom: number; sourceTo: number; dealNumber: number;
};
export type WorkbenchClip = {
  id: string; label: string; description: string; fps: number;
  native: WorkbenchSource; portrait?: WorkbenchSource; raw?: WorkbenchSource; poster?: string;
  segments?: WorkbenchSegment[];
};
export type WorkbenchProps = { snapshot: string; clips: WorkbenchClip[] };
export type WorkbenchView = 'native' | 'portrait' | 'raw';
export type ViewTransform = { zoom: number; x: number; y: number };
export type PlaybackSnapshot = { time: number; playing: boolean };
export const VIEW_LABELS: Record<WorkbenchView, string> = { native: 'Desktop', portrait: 'Porträtt', raw: 'Råfilm' };
export const INITIAL_TRANSFORM: ViewTransform = { zoom: 1, x: 0, y: 0 };
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** Source-bound labels only: never infer boundaries from rounded seconds. */
export function segmentsFromTimeline(timeline?: readonly WorkbenchTimelineFrame[], frameCount?: number): WorkbenchSegment[] | undefined {
  if (!timeline?.length || (frameCount !== undefined && timeline.length !== frameCount)) return;
  const segments: WorkbenchSegment[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    if (entry.outputFrame !== i || !Number.isInteger(entry.sourceFrame) || entry.sourceFrame < 0 || !Number.isInteger(entry.dealNumber) || entry.dealNumber < 0) return;
    const label = entry.clip === 'approach' ? 'VILA → REDO' : entry.clip === 'deal' ? `Giv ${entry.dealNumber + 1} · REDO → REDO` : entry.clip === 'retreat' ? 'REDO → VILA' : undefined;
    if (!label) return;
    const previous = segments.at(-1);
    if (previous && previous.sourceClip === entry.clip && previous.dealNumber === entry.dealNumber && previous.sourceTo + 1 === entry.sourceFrame) {
      previous.to = entry.outputFrame; previous.sourceTo = entry.sourceFrame;
    } else segments.push({ label, from: entry.outputFrame, to: entry.outputFrame, sourceClip: entry.clip, sourceFrom: entry.sourceFrame, sourceTo: entry.sourceFrame, dealNumber: entry.dealNumber });
  }
  return segments;
}
export function segmentAt(clip: WorkbenchClip, frame: number, sourceFrameCount: number) {
  // A raw or older clip with a different timeline must not inherit false labels.
  if (!Number.isInteger(frame) || clip.segments?.at(-1)?.to !== sourceFrameCount - 1) return;
  return clip.segments.find(segment => frame >= segment.from && frame <= segment.to);
}

export function sourceFor(clip: WorkbenchClip, view: WorkbenchView): WorkbenchSource | undefined {
  const source = clip[view];
  if (!source || !source.url.trim() || !Number.isFinite(clip.fps) || clip.fps <= 0) return;
  if (![source.width, source.height, source.duration, source.frameCount].every(value => Number.isFinite(value) && value > 0)) return;
  if (!Number.isInteger(source.frameCount) || (view === 'portrait' && source.height <= source.width)) return;
  return source;
}
export function frameAt(time: number, fps: number, count: number) {
  return clamp(Math.floor(time * fps + 0.0001), 0, Math.max(0, count - 1));
}
export function viewForWidth(clip: WorkbenchClip, width: number, manual: WorkbenchView | null = null): WorkbenchView {
  if (manual !== null) return sourceFor(clip, manual) ? manual : 'native';
  return width < 650 && sourceFor(clip, 'portrait') ? 'portrait' : 'native';
}
export function playbackSnapshot(video: Pick<HTMLVideoElement, 'readyState' | 'currentTime' | 'paused' | 'ended'> | null, pending: PlaybackSnapshot): PlaybackSnapshot {
  return video && video.readyState >= 1 ? { time: video.currentTime, playing: !video.paused && !video.ended } : { ...pending };
}
export function seekTime(time: number, source: WorkbenchSource, fps: number, actualDuration = Infinity) {
  return clamp(time, 0, Math.max(0, Math.min(source.duration, actualDuration, (source.frameCount - 1) / fps)));
}
export function timecode(time: number, fps: number) {
  const totalFrames = Math.max(0, Math.floor(time * fps + 0.0001));
  const wholeSeconds = Math.floor(totalFrames / fps);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(wholeSeconds / 60))}:${pad(wholeSeconds % 60)}:${pad(Math.floor(totalFrames % fps))}`;
}
export function transformStyle(value: ViewTransform) {
  const zoom = clamp(value.zoom, 1, 1.25), limit = (zoom - 1) * 50;
  return `translate(${clamp(value.x, -1, 1) * limit}%, ${clamp(value.y, -1, 1) * limit}%) scale(${zoom})`;
}
export function serialiseWorkbench(props: WorkbenchProps) {
  return JSON.stringify(props).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
