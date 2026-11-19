export const lineKey=(id,variant='',extra='')=>[id,variant,extra].join('|');
export const variantFor=(p,id)=>p?.variants?.find(v=>v.id===id);
export const positiveInt=n=>Number.isSafeInteger(n)&&n>0;

function components(p,v,extra) {
  if (!p || p.available===false || (p.variants?.length && !v) || v?.available===false || extra?.available===false) return [];
  return [p,v,extra].filter(Boolean);
}
export function capacity(p,v,extra,used) {
  const parts=components(p,v,extra);
  return parts.length?Math.max(0,Math.min(...parts.map(item=>(item.stock??Number.MAX_SAFE_INTEGER)-(used.get(item.id)||0)))):0;
}
export function reserve(used,line) {
  for (const id of [line.id,line.variant,line.extra].filter(Boolean)) used.set(id,(used.get(id)||0)+line.qty);
}
export function holds(lines,except) {
  const used=new Map();
  for (const line of lines) if(lineKey(line.id,line.variant,line.extra)!==except) reserve(used,line);
  return used;
}
