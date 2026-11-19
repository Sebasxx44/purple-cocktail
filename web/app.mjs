import {card, filters, titleFor, groupedCards} from './render.mjs';
import {normalize} from './shared.mjs';
import {initFeature} from './feature.mjs';
import {initCommerce} from './commerce.mjs';
import {initReels} from './reels.mjs';
import {galleryFamily,initGalleries} from './gallery.mjs';
import {refreshCatalog} from '/catalog/sync.js';

const {data:snapshot,art,optionArt,configurations,galleryArt,burgerLayers}=JSON.parse(document.querySelector('#storefront-data').textContent);
let catalog=snapshot;
const inventory=new Map(catalog.products.map(p=>[p.id,p]));
const featureIds=catalog.featured.map(slug=>catalog.products.find(p=>p.slug===slug).id);
const lookup=id=>inventory.get(id);
const state={category:'',price:'',order:'featured',search:'',limit:12,expanded:false};
const grid=document.querySelector('#catalog-grid'), filtersBox=document.querySelector('#filters'), pagination=document.querySelector('#pagination');
const collator=new Intl.Collator('es-CO',{sensitivity:'base',numeric:true});
const drawGalleries=initGalleries(document.querySelector('#gallery-list'),galleryArt);
const updates=new Set();
let lastGridMarkup=null;
function drawGrid() {
  const terms=normalize(state.search.trim()).split(/\s+/).filter(Boolean);
  const band=catalog.priceBands.find(b=>b.id===state.price);
  const list=catalog.products.map(p=>lookup(p.id)).filter(p=>{
    if (state.category && p.category!==state.category) return false;
    if (band?.min!=null && (band.excludeMin?p.price<=band.min:p.price<band.min)) return false;
    if (band?.max!=null && p.price>band.max) return false;
    const haystack=normalize([p.name,titleFor(p),p.category,p.description,...(p.ingredients||[])].join(' '));
    return terms.every(term=>haystack.includes(term));
  });
  const compare=(a,b)=>{
    if (state.order==='price-asc') return a.price-b.price;
    if (state.order==='price-desc') return b.price-a.price;
    if (state.order==='name-asc') return collator.compare(a.name,b.name);
    if (state.order==='newest') return a.newestRank-b.newestRank;
    return a.rank-b.rank;
  };
  list.sort((a,b)=>compare(a,b) || a.rank-b.rank);
  const grouped=!state.category && !state.price && !terms.length && state.order==='featured';
  const featureOrder=new Map(catalog.featured.map((slug,i)=>[slug,i]));
  const show=state.order==='featured'?[...list].sort((a,b)=>(featureOrder.get(a.slug)??99)-(featureOrder.get(b.slug)??99)):list;
  drawGalleries(show);
  const rest=list.filter(p=>!galleryFamily(p));
  const markup=grouped?groupedCards(rest,art,catalog.featured,state.expanded):rest.slice(0,state.limit).map(p=>card(p,art)).join('');
  grid.hidden=!rest.length && list.length>0;
  grid.classList.toggle('grouped',grouped);
  if (lastGridMarkup!==markup) {
    const el=grid.contains(document.activeElement)?document.activeElement:null;
    const old=el?.closest('[data-card-id]')?.dataset.cardId,attr=el?.hasAttribute('data-add')?'data-add':'data-detail';
    grid.innerHTML=markup || '<div class="empty-search"><h3>Sin coincidencias</h3><p>Prueba otro nombre o cambia los filtros.</p><button class="button outline" data-clear>Limpiar filtros</button></div>';
    lastGridMarkup=markup;grid.dataset.ready='true';
    if (old) grid.querySelector('['+attr+'="'+CSS.escape(old)+'"]')?.focus({preventScroll:true});
  }
  document.querySelector('#result-count').textContent=list.length+' '+(list.length===1?'producto':'productos');
  let more='';
  if(grouped && !state.expanded && grid.querySelector('[data-show-category]')) more='<button class="button outline" data-expand>Ver la carta completa ('+list.length+')</button>';
  else if(!grouped && rest.length>state.limit) more='<button class="button outline" data-more>Ver más productos <span>('+Math.min(12,rest.length-state.limit)+')</span></button>';
  if (pagination.innerHTML!==more) pagination.innerHTML=more;
}
function writeURL() {
  const url=new URL(location.href);
  for (const [param,value] of [['categoria',state.category],['precio',state.price],['orden',state.order==='featured'?'':state.order],['q',state.search],['vista',state.expanded?'completa':'']]) {
    if (value) url.searchParams.set(param,value);else url.searchParams.delete(param);
  }
  history.replaceState(null,'',url);
}
function matchControls() {
  filtersBox.querySelectorAll('[data-category]').forEach(button=>{
    const on=state.category===button.dataset.category;
    button.classList.toggle('active',on);button.setAttribute('aria-pressed',String(on));
  });
  document.querySelector('#price-filter').value=state.price;
  document.querySelector('#sort').value=state.order;
  if (document.querySelector('#search').value!==state.search) document.querySelector('#search').value=state.search;
}
function applyFilters() {state.limit=12;state.expanded=false;matchControls();writeURL();drawGrid();}
function fromURL() {
  const params=new URL(location.href).searchParams;
  state.category=catalog.categories.includes(params.get('categoria'))?params.get('categoria'):'';
  state.price=catalog.priceBands.some(x=>x.id===params.get('precio'))?params.get('precio'):'';
  state.order=catalog.sorts.some(x=>x.id===params.get('orden'))?params.get('orden'):'featured';
  state.search=params.get('q')||'';state.expanded=params.get('vista')==='completa';state.limit=12;matchControls();drawGrid();
}
filtersBox.addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(b){state.category=b.dataset.category;applyFilters();}});
filtersBox.addEventListener('input',e=>{if(e.target.id==='search'){state.search=e.target.value;applyFilters();}});
filtersBox.addEventListener('change',e=>{
  if(e.target.id==='price-filter')state.price=e.target.value;else if(e.target.id==='sort')state.order=e.target.value;else return;
  applyFilters();
});
pagination.addEventListener('click',e=>{
  if(e.target.closest('[data-expand]')){
    state.expanded=true;writeURL();drawGrid();
    document.querySelector('#carta').scrollIntoView();document.querySelector('#filters [data-category=""]').focus({preventScroll:true});return;
  }
  if(e.target.closest('[data-more]')){
    const before=grid.children.length;state.limit+=12;drawGrid();
    grid.children[before]?.querySelector('a')?.focus({preventScroll:true});
  }
});
grid.addEventListener('click',e=>{
  const group=e.target.closest('[data-show-category]');
  if(group){state.category=group.dataset.showCategory;applyFilters();document.querySelector('#carta').scrollIntoView();filtersBox.querySelector('.category.active')?.focus({preventScroll:true});return;}
  if(e.target.closest('[data-clear]')){Object.assign(state,{category:'',price:'',order:'featured',search:''});applyFilters();document.querySelector('#search').focus();}
});
window.addEventListener('popstate',fromURL);
fromURL();
const feature=initFeature(featureIds,lookup,art);
initReels();
const commerce=initCommerce({lookup,store:catalog.store,art,optionArt,configurations,galleryArt,burgerLayers,
  extraId:catalog.products.find(p=>p.slug==='adicional-jeringa-licor')?.id,
  updateProduct(p){updates.add(p.id);inventory.set(p.id,p);},
  onChanged(){feature.refresh();drawGrid();}
});
refreshCatalog(snapshot).then(fresh=>{
  if (fresh===snapshot) return;
  const ids=new Set(fresh.products.map(p=>p.id));
  for (const [id,p] of inventory) if(!ids.has(id)) inventory.set(id,{...p,available:false,stock:0});
  for (const p of fresh.products) if(!updates.has(p.id)) inventory.set(p.id,p);
  const needsControls=JSON.stringify(catalog.categories)!==JSON.stringify(fresh.categories) ||
    JSON.stringify(catalog.priceBands.map(b=>[b.id,b.min,b.max]))!==JSON.stringify(fresh.priceBands.map(b=>[b.id,b.min,b.max]));
  catalog=fresh;
  if(needsControls){filtersBox.innerHTML=filters(catalog);fromURL();}
  feature.refresh();commerce.refresh();drawGrid();
});
