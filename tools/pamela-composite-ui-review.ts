import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run='runs/20261109-pamela-central-composite';
const save=(p:string,o:unknown)=>writeFile(p,JSON.stringify(o,null,2)+'\n');
const json=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const selection=await json('references/public-selection.json');
const proofRoot=`${run}/tracking/c2-pilot/proofs`;
const proofs=(await readdir(proofRoot)).filter(f=>f.endsWith('.png')).map(f=>`${proofRoot}/${f}`);
selection.media=[...new Set([...selection.media,...proofs])];await save('references/public-selection.json',selection);
const identity=await json('references/dealers.json');
for(const path of proofs){identity.assetMappings=identity.assetMappings.filter((x:{path:string})=>x.path!==path);identity.assetMappings.push({path,dealerId:'pamela-pilot',sha256:createHash('sha256').update(await readFile(path)).digest('hex'),basis:'Derived central card-2 occlusion proof, not an approved bank variant.'});}
await save('references/dealers.json',identity);
const status=await json('references/reviewer-status.json');status.checkedAt=new Date().toISOString();status.previousSnapshot='public-review-20261109011709';
status.changes.push('Samma återanvändbara React-vy finns för lokal Next-route och publik statisk läskopia, med ordskiss, bildrutesteg och skarvkontroller.','Separat kort2-prov:42 lokala foregroundmasker, fem kontaktbevis och0/29,4/49,9% kortöverlapp. Masken flyttar inte handrörelsen.');
status.ui={implementation:'React component shared with Next route; public static bundle using installed Next webpack/SWC',newDependencies:0,threeFiberAdded:false,shadcnCopied:false};await save('references/reviewer-status.json',status);
const round=await json('references/review-round.json');round.updatedAt=status.checkedAt;round.predecessorSnapshot=status.previousSnapshot;round.publicationNote='React-granskning med skiss och ordlista. Samma filmer och kamera som föregående snapshot; separat arm-/kort2-prov tillagt. Inga nya Runway-jobb.';await save('references/review-round.json',round);
let master=await readFile('docs/MASTERPLAN.md','utf8');
const note=`## Granskningsvy och kort 2

Den publika /komposition-vyn använder nu samma React-komponent som den lokala Next-routen. Den har stor film, källbyte, ruta för ruta, skarvhopp, tempo för granskning, format utan beskärning samt rörelseskiss och ordlista. Den publika kopian innehåller bara komponenten och utvalda tillgångar, ingen lokal API-server. Inga nya beroenden eller shadcnblock är installerade. Lokalservern är fortsatt stoppad; START.cmd/STOPP.cmd gäller om Jakob senare vill återöppna lokal preview.

En separat kort2-pilot finns i [minimikontraktet](../${run}/tracking/c2-pilot/c2-mask-manifest.json). 42 lokala foregroundmasker täcker centralrutor77–118. Fem kontaktbevis visar vad handen/underarmen skymmer. Bredvidplacering ger0% kortöverlapp, −100px ger29,4%, −71px ger49,9%. Dessa är geometriska prov; de godkänner inte nästa korts fysiska kontakt. Svart ärm mot svart torso är inte separat observerad.

Kortets ordningsnummer och placering är egna egenskaper under rörelsen, skilda från start-/slutpose. Exempel box-2-c2 och dealer-c2 är ännu kontraktsexempel utan verifierad målbindning. En mask ändrar skymning; att flytta själva handen eller landningsplatsen kräver ny rörelse eller prövad omprojektion. Kort2-provet är separat från den publicerade kompositfilmen.

Skarvar behövs för spelstyrda val mellan klipp, men de ska vara visuellt kontinuerliga. Samma pose räcker inte om hastighet, ansikte, ljus, sko eller bordets korttillstånd hoppar. Three.js/Fiber kan senare rendera lager, men fysik eller gravitation löser inte denna mätning automatiskt.

`;
if(!master.includes('## Granskningsvy och kort 2'))master=master.replace('## Nästa konkreta arbete',note+'## Nästa konkreta arbete');
await writeFile('.runtime/masterplan-react-candidate.md',master);
console.log(JSON.stringify({proofs:proofs.length,ui:'shared-react',newDependencies:0}));
