export function reviewVersionMarkup(snapshot:string,filmIdentity:string){
 const stamp=/public-review-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(snapshot);
 const built=stamp?new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'medium',timeZone:'Europe/Stockholm'}).format(new Date(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`)):snapshot;
 const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return `<aside style="font:12px/1.5 system-ui,sans-serif;color:#b7c6bd;background:#17201b;padding:10px 14px;border:1px solid #34443a;border-radius:5px;margin:12px 0;overflow-wrap:anywhere"><strong>Granskningspaket: ${esc(built)} svensk tid</strong> · ${esc(filmIdentity)}<br><a style="color:#bed6c5" href="/latest.json">${esc(snapshot)}</a> · Ny publicering betyder inte automatiskt ny film.</aside>`;
}
