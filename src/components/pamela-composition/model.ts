export type CompositionSource = {
  id: string;
  label: string;
  description: string;
  src: string;
  poster?: string;
  sha256?: string;
  /** A separately rendered standing film with the same fps, frame count and timeline. */
  portraitSrc?: string;
  portraitPoster?: string;
  portraitSha256?: string;
};

export type CompositionSeam = { frame: number; label: string; description: string };
export type CompositionStage = { label: string; detail: string; from: number; to: number };
export type CompositionEvidence = { label: string; href: string };

export type PamelaCompositionReviewProps = {
  sources: readonly [CompositionSource, ...CompositionSource[]];
  metadata: {
    dealerId: string;
    width: number;
    height: number;
    fps: number;
    frameCount: number;
    snapshot?: string;
    portrait?: { width: number; height: number };
  };
  seams: readonly CompositionSeam[];
  stages: readonly CompositionStage[];
  limitations?: readonly string[];
  presentationNotes?: readonly string[];
  evidence?: readonly CompositionEvidence[];
  backHref?: string;
  nodeMapHref?: string;
};

export type CompositionFormat = 'native' | 'mobile';

export function resolveCompositionView(source: CompositionSource, metadata: PamelaCompositionReviewProps['metadata'], requestedFormat: CompositionFormat) {
  const portrait = metadata.portrait;
  const mobileAvailable = Boolean(source.portraitSrc?.trim() && source.portraitSrc !== source.src && portrait && Number.isFinite(portrait.width) && Number.isFinite(portrait.height) && portrait.width > 0 && portrait.height > portrait.width);
  const isMobile = requestedFormat === 'mobile' && mobileAvailable;
  return {
    format: isMobile ? 'mobile' as const : 'native' as const,
    mobileAvailable,
    src: isMobile ? source.portraitSrc! : source.src,
    poster: isMobile ? source.portraitPoster : source.poster,
    width: isMobile ? portrait!.width : metadata.width,
    height: isMobile ? portrait!.height : metadata.height,
  };
}

/** Only the public, presentation-related fields of the local report are consumed. */
export type PamelaCompositionReport = {
  output: { path: string; sha256: string; width: number; height: number; fps: number; frameCount: number };
  raw: { path: string; sha256: string };
  joins: readonly { outputFrame: number }[];
  remaining: readonly string[];
  presentationNotes?: readonly string[];
  poster?: string;
  portrait?: { path: string; sha256: string; width: number; height: number; poster: string; fps: number; frameCount: number };
};

export function clampFrame(frame: number, frameCount: number): number {
  return Math.min(Math.max(0, Math.floor(frameCount) - 1), Math.max(0, Math.round(Number.isFinite(frame) ? frame : 0)));
}

export function frameAtTime(seconds: number, fps: number, frameCount: number): number {
  return clampFrame(Math.floor(seconds * fps + 0.0001), frameCount);
}

/** Asset URLs are supplied by the caller: local /files/ paths or public hash URLs. */
export function createPamelaCompositionProps(
  report: PamelaCompositionReport,
  assetUrl: (path: string) => string,
  snapshot?: string,
): PamelaCompositionReviewProps {
  const { output, raw } = report;
  const portrait=report.portrait;
  if(portrait&&(portrait.fps!==output.fps||portrait.frameCount!==output.frameCount))throw Error('Portrait must use the same timeline as desktop');
  const boundaries = report.joins.map(join => join.outputFrame);
  const stageLabels = [
    ['VILA → REDO', 'Fram till skon'],
    ['GIV 1', 'Första kortet läggs ut'],
    ['GIV 2', 'Samma givklipp används igen'],
    ['REDO → VILA', 'Korten ligger kvar på samma punkt'],
  ];
  const seamLabels = [
    ['Första givningen', 'Fram till sko → givklipp'],
    ['Andra givningen', 'Givklippets slut → samma givklipp igen'],
    ['Tillbaka till VILA', 'Givklippets slut → återgång'],
  ];
  return {
    sources: [
      { id: 'composition', label: 'Komposition', description: 'Rum, bord och två kvarvarande kort vid samma landningspunkt.', src: assetUrl(output.path), poster: assetUrl(report.poster??'runs/20261109-pamela-central-composite/qa/composite-000.png'), sha256: output.sha256, ...(portrait?{portraitSrc:assetUrl(portrait.path),portraitPoster:assetUrl(portrait.poster),portraitSha256:portrait.sha256}:{}) },
      { id: 'raw', label: 'Rå kedja', description: 'Samma tidslinje med originalklippens råa skarvar.', src: assetUrl(raw.path), sha256: raw.sha256 },
    ],
    metadata: { dealerId: 'pamela-pilot', width: output.width, height: output.height, fps: output.fps, frameCount: output.frameCount, snapshot, ...(portrait?{portrait:{width:portrait.width,height:portrait.height}}:{}) },
    seams: boundaries.map((frame, index) => ({ frame, label: seamLabels[index]?.[0] ?? `Skarv ${index + 1}`, description: seamLabels[index]?.[1] ?? 'Övergång mellan källklipp' })),
    stages: [0, ...boundaries].map((from, index) => ({ label: stageLabels[index]?.[0] ?? `Del ${index + 1}`, detail: stageLabels[index]?.[1] ?? 'Del av rörelsekedjan', from, to: (boundaries[index] ?? output.frameCount) - 1 })),
    limitations: report.remaining,
    presentationNotes: report.presentationNotes,
  };
}
