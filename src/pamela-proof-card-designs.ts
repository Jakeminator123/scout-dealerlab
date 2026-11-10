/** Diagnostic artwork; values are supplied explicitly, never inferred from film. */
export function proofCardFrontSvg(value:string,ivory:boolean){
 if(!/^(?:[2-9]|10|[AJQK])[CDHS]$/.test(value))throw Error('Unsupported diagnostic identity');
 const suit=({C:'♣',D:'♦',H:'♥',S:'♠'} as Record<string,string>)[value.at(-1)!],rank=value.slice(0,-1),red=/[DH]$/.test(value),ink=red?(ivory?'#a5442a':'#a91b32'):'#162433';
 return `<svg width="252" height="352" xmlns="http://www.w3.org/2000/svg"><rect width="252" height="352" fill="${ivory?'#f5efde':'#fffdf5'}"/>${ivory?'<rect x="7" y="7" width="238" height="338" rx="9" fill="none" stroke="#bba26e" stroke-width="2"/>':''}<g fill="${ink}" font-family="${ivory?'Georgia':'Arial'}" font-weight="bold"><text x="15" y="48" font-size="42">${rank}</text><text x="16" y="82" font-size="34">${suit}</text><text x="126" y="214" text-anchor="middle" font-size="${ivory?110:96}">${suit}</text><g transform="translate(252 352) rotate(180)"><text x="15" y="48" font-size="42">${rank}</text><text x="16" y="82" font-size="34">${suit}</text></g></g></svg>`;
}
