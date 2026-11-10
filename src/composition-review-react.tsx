import { createRoot } from 'react-dom/client';
import PamelaCompositionReview, { type PamelaCompositionReviewProps } from './components/pamela-composition/index.ts';
const root=document.getElementById('composition-root');
const data=document.getElementById('composition-props');
if(!root||!data?.textContent)throw Error('Composition review data missing');
const props=JSON.parse(data.textContent) as PamelaCompositionReviewProps;
createRoot(root).render(<PamelaCompositionReview {...props}/>);
