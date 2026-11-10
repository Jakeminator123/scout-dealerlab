import { serialiseWorkbench, type WorkbenchProps } from './studio-workbench/model.ts';
import { WORKBENCH_CSS } from './studio-workbench/styles.ts';
export type { WorkbenchProps, WorkbenchClip, WorkbenchSource } from './studio-workbench/model.ts';

export function studioWorkbenchPage(props: WorkbenchProps) {
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#161817"><title>Dealer Studio · Pamela</title><style>${WORKBENCH_CSS}</style></head><body><div id="studio-workbench-root"></div><noscript><p>Studion behöver JavaScript för filmkontrollerna. <a href="/">Till granskningsöversikten</a></p></noscript><script id="studio-workbench-props" type="application/json">${serialiseWorkbench(props)}</script><script defer src="/studio-workbench.js"></script></body></html>`;
}
