import {groupedCards} from './render.mjs';
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
const grid=document.querySelector('#catalog-grid');
const drawGalleries=initGalleries(document.querySelector('#gallery-list'),galleryArt);
const updates=new Set();
let lastGridMarkup='';
function drawMenu() {
  const list=catalog.products.map(p=>lookup(p.id)).sort((a,b)=>a.rank-b.rank);
  const lead=new Map(catalog.featured.map((slug,i)=>[slug,i]));
  drawGalleries([...list].sort((a,b)=>(lead.get(a.slug)??99)-(lead.get(b.slug)??99)));
  const rest=list.filter(p=>!galleryFamily(p));
  const markup=groupedCards(rest,art);
  grid.hidden=rest.length===0;
  if(markup!==lastGridMarkup){
    const focus=grid.contains(document.activeElement)?document.activeElement:null;
    const id=focus?.closest('[data-card-id]')?.dataset.cardId,attr=focus?.hasAttribute('data-add')?'data-add':'data-detail';
    grid.innerHTML=markup;lastGridMarkup=markup;
    if(id)grid.querySelector('['+attr+'="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});
  }
  grid.dataset.ready='true';
  document.querySelector('#result-count').textContent=list.length+' '+(list.length===1?'producto':'productos');
}
drawMenu();
const feature=initFeature(featureIds,lookup,art);
initReels();
const commerce=initCommerce({lookup,store:catalog.store,art,optionArt,configurations,galleryArt,burgerLayers,
  extraId:catalog.products.find(p=>p.slug==='adicional-jeringa-licor')?.id,
  updateProduct(p){updates.add(p.id);inventory.set(p.id,p);},
  onChanged(){feature.refresh();drawMenu();}
});
refreshCatalog(snapshot).then(fresh=>{
  if (fresh===snapshot) return;
  const ids=new Set(fresh.products.map(p=>p.id));
  for (const [id,p] of inventory) if(!ids.has(id)) inventory.set(id,{...p,available:false,stock:0});
  for (const p of fresh.products) if(!updates.has(p.id)) inventory.set(p.id,p);
  catalog=fresh;
  feature.refresh();commerce.refresh();drawMenu();
});
