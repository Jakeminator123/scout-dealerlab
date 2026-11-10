import PamelaStageClient from '../../src/pamela-stage-client';
import contract from '../../references/pamela-stage-contract.json';
export const metadata={title:'Pamela · Scen och ljus'};
export default function PamelaStagePage(){return <PamelaStageClient contract={contract}/>;}
