export const money = n => '$' + new Intl.NumberFormat('es-CO', {maximumFractionDigits: 0}).format(n);
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const readable = text => {
  const lower = String(text || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CO');
  return lower.charAt(0).toLocaleUpperCase('es-CO') + lower.slice(1);
};
export const categoryLabel = category => ({
  'GRANIZADOS CON LICOR':'Granizados con licor', 'GRANIZADO SIN LICOR':'Granizado sin licor', 'HAMBURGUESAS':'Hamburguesas',
  'COMBOS':'Combos', 'BEBIDAS':'Bebidas', 'ADICIONALES':'Adicionales'
})[category] || readable(category);
export function productName(product) {
  return readable(product.name)
    .replace(/arandanos/gi, 'arándanos').replace(/16 onz\b/gi, '16 onz').replace(/22\s*onz\b/gi, '22 onz')
    .replace(/\b(purple|smirnoff|dorismash|infinive|coca cola|wendys|mistic|absolut|crispy|baylies)\b/gi, word => readable(word));
}
const paths = {
  bag:'<path d="M5 7.5h14l1 13H4l1-13Z"/><path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  left:'<path d="m14.5 5-7 7 7 7"/>',right:'<path d="m9.5 5 7 7-7 7"/>', down:'<path d="m6 9 6 6 6-6"/>',
  box:'<path d="m12 2.6 8 4.6v9.4l-8 4.8-8-4.8V7.2l8-4.6Z"/><path d="m4.5 7.5 7.5 4.4 7.5-4.4M12 12v9M8.2 5.2l8 4.6"/>',
  layers:'<path d="m2.5 8 9.5-5.3L21.5 8 12 13.3 2.5 8Z"/><path d="m3 12.5 9 5 9-5M3 17l9 5 9-5"/>',
  instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.8" r=".8" fill="currentColor" stroke="none"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.7"/><path d="m16 16 5 5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>', pause:'<path d="M8.5 5v14M15.5 5v14" stroke-width="3"/>',
  play:'<path d="m7 4 12.5 8L7 20V4Z"/>', check:'<path d="m4.5 12 4.3 4.2L19.5 5.8"/>',
  trash:'<path d="M4 6h16M9 6V3h6v3M6.4 6l.9 15h9.4l.9-15M10 10v7M14 10v7"/>',
  whatsapp:'<path d="M20.5 11.5a8.6 8.6 0 0 1-12.8 7.6l-4.8 1.2 1.3-4.7A8.6 8.6 0 1 1 20.5 11.5Z"/><path d="M8.2 7.5c-.8.9-.7 2 .1 3.5 1.2 2.1 3.1 3.9 5.5 4.6 1.2.4 2 .1 2.5-.9l.4-1-2.5-1.2-1 1c-1.4-.5-2.6-1.6-3.2-3l.8-1-1.1-2.3c-.3-.5-1.1-.3-1.5.3Z" stroke-width="1.4"/>',
  tune:'<path d="M3 7h7m4 0h7M3 17h10m4 0h4"/><circle cx="12" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  turn:'<path d="M5 8a8 8 0 1 1-1 7M5 4v4h4"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3" cy="6" r=".8"/><circle cx="3" cy="12" r=".8"/><circle cx="3" cy="18" r=".8"/>',
  drink:'<path d="m6 8 1.6 13h8.8L18 8H6ZM5 6h14M13 6l2-4h3"/>',
  burger:'<path d="M4 10c.1-4 3.8-6.5 8-6.5s7.9 2.5 8 6.5H4ZM4 14l3-1.5 3.3 1.5 3.4-1.5L17 14l3-1M4 17h16c-.4 2.4-1.9 3.5-4 3.5H8c-2.1 0-3.7-1.1-4-3.5Z"/>',
  expand:'<path d="M8.5 3H3v5.5M15.5 3H21v5.5M21 15.5V21h-5.5M8.5 21H3v-5.5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
};
export const icon = (name, cls='') => '<svg class="icon '+escape(cls)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name] || '')+'</svg>';
