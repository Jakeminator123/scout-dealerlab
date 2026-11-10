import type { SVGProps } from 'react';
export type IconName = 'film' | 'layers' | 'card' | 'nodes' | 'sliders' | 'close' | 'play' | 'pause' | 'previous' | 'next' | 'reset' | 'repeat' | 'expand' | 'arrow' | 'desktop' | 'portrait' | 'raw' | 'plus' | 'minus';
const paths: Record<IconName, string> = {
  film: 'M4 4h16v16H4z M4 8h16 M4 16h16 M8 4v4 M16 4v4 M8 16v4 M16 16v4',
  layers: 'm12 3 9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  card: 'M7 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z m5 5 3 4-3 4-3-4z',
  nodes: 'M3 3h6v6H3z M15 15h6v6h-6z M15 3h6v6h-6z M9 6h6 M6 9v9h9',
  sliders: 'M4 7h7 M15 7h5 M4 17h3 M11 17h9 M11 4v6 M7 14v6',
  close: 'm6 6 12 12 M18 6 6 18', play: 'm8 5 11 7-11 7z', pause: 'M8 5v14 M16 5v14',
  previous: 'M6 5v14 m12-14-9 7 9 7z', next: 'M18 5v14 M6 5l9 7-9 7z',
  reset: 'M4 10a8 8 0 1 1 1 7 M4 4v6h6', repeat: 'm17 3 4 4-4 4 M3 11V9a2 2 0 0 1 2-2h16 M7 21l-4-4 4-4 M21 13v2a2 2 0 0 1-2 2H3',
  expand: 'M9 4H4v5 M15 4h5v5 M20 15v5h-5 M4 15v5h5', arrow: 'M5 12h14 m-5-5 5 5-5 5',
  desktop: 'M3 4h18v13H3z M8 21h8 M12 17v4', portrait: 'M7 2h10v20H7z M11 18h2',
  raw: 'M8 4H4v4 M16 4h4v4 M4 16v4h4 M20 16v4h-4 M9 9l6 3-6 3z', plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14',
};
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
