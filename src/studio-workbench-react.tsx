import { createRoot } from 'react-dom/client';
import StudioWorkbench from './studio-workbench/StudioWorkbench.tsx';
import type { WorkbenchProps } from './studio-workbench/model.ts';
const root = document.getElementById('studio-workbench-root');
const data = document.getElementById('studio-workbench-props');
if (!root || !data?.textContent) throw Error('Studio workbench data missing.');
const props = JSON.parse(data.textContent) as WorkbenchProps;
createRoot(root).render(<StudioWorkbench {...props} />);
