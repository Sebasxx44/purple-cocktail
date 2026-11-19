import {escape as h, icon, money, readable, categoryLabel, productName} from './shared.mjs';
import {scenes} from './scenes.mjs';

export const available = p => Boolean(p && p.available !== false && (p.stock == null || p.stock > 0));
export const titleFor = p => scenes[p.slug]?.short || productName(p);
const leadCategories=['GRANIZADOS CON LICOR','HAMBURGUESAS','COMBOS'];
const preferredCategories=[...leadCategories,'GRANIZADO SIN LICOR','BEBIDAS','ADICIONALES'];
export const toneFor = slug => {
  const s = scenes[slug] || scenes['arandanos-perlas'];
  return '--tone:'+s.tone+';--light:'+s.light+';--accent:'+s.accent+';--card:'+s.card+';--scene-ink:'+s.ink+';--buy-color:'+s.button+';--hero-scale:'+s.scale;
};
export function backdrop(slug) {
  const s=scenes[slug];
  if(!s) return '';
  const src='/showcase/backgrounds/'+slug;
  return '<picture class="scene-background" aria-hidden="true" style="background-color:'+s.tone+'"><source media="(max-width:700px) and (orientation:portrait)" srcset="'+src+'-mobile.webp"><img src="'+src+'-wide.webp" alt="" decoding="async" fetchpriority="low" draggable="false"></picture>';
}
export function findArt(art, product) {
  return art.find(item => item.slug === product.slug || item.id === product.id || item.id === product.slug) || {};
}
function imageTag(src, name, {cls='', small='', smallWidth=480, width=1000, sizes='100vw', eager=false, priority=false}={}) {
  if (!src) return '';
  const responsive = small && small !== src ? ' srcset="'+h(small)+' '+smallWidth+'w, '+h(src)+' '+width+'w" sizes="'+h(sizes)+'"' : '';
  return '<img class="'+cls+'" src="'+h(src)+'"'+responsive+' alt="'+h(name)+'" draggable="false" decoding="async" loading="'+(eager?'eager':'lazy')+'"'+(priority?' fetchpriority="high"':'')+'>';
}
export function heroCopy(p) {
  const s = scenes[p.slug];
  return '<p class="eyebrow product-type"><span class="tiny-rule"></span>'+h(s.family)+(s.size?'<span class="type-dot"></span>'+h(s.size):'')+'</p>'+
    '<h1 id="scene-title"'+(s.title[0].length >= 9?' class="word-long"':'')+'>'+h(s.title[0])+(s.title[1]?' <em>'+h(s.title[1])+'</em>':'')+'</h1>'+
    '<p class="scene-story">'+h(s.story)+'</p>'+
    '<p class="hero-price"><strong>'+h(money(p.price))+'</strong><span>COP</span></p>'+
    '<div class="hero-actions js-only"><button class="button primary" data-add="'+h(p.id)+'"'+(!available(p)?' disabled':'')+'>'+icon('bag')+(available(p)?'Agregar al carrito':'Agotado')+'</button>'+
    '<button class="ingredients-link" data-inspect="'+h(p.id)+'">'+icon('layers')+'<span>Ver ingredientes</span></button></div>';
}
export function stageArt(p, art, first=false) {
  const a=findArt(art,p);
  const pieces=a.ingredients || [];
  const valid = pieces.map((item,index) => ({item,index})).filter(({item})=>item.image);
  const floats=valid.slice(0,3).map(({item,index}, k) => '<button class="floating-part part-'+(k+1)+' js-only" data-inspect="'+h(p.id)+'" data-part="'+index+'" aria-label="Ver ingrediente '+h(item.name)+'">'+imageTag(item.image,'',{eager:true})+'<span class="ingredient-caption" aria-hidden="true">'+h(item.shortName||item.name)+'</span></button>').join('');
  return '<div class="shadow-pad" aria-hidden="true"></div>'+
    '<div class="stage-product '+(p.category==='HAMBURGUESAS'?'food-burger':'food-drink')+(a.image?'':' awaiting-art')+'">'+imageTag(a.image || p.image,titleFor(p),{cls:'product-portrait',small:a.imageSmall,smallWidth:a.smallSize?.[0],width:a.imageSize?.[0],sizes:'(max-width: 690px) 64vw, 34vw',eager:true,priority:first})+'</div>'+
    floats;
}
function posterInfo(p) {
  const s=scenes[p.slug];
  const measure=p.name.match(/\b(\d+)\s*ONZ(?:AS?)?\b/i);
  const volume=measure?measure[1]+' onz':'';
  const isSlush=/^granizado\b/i.test(p.name);
  let name=titleFor(p);
  if (!s && measure) name=name.replace(measure[0].toLowerCase(),'').trim();
  if(!s && isSlush && !/sin licor/i.test(name)) name=readable(name.replace(/^granizado\s*/i,'').replace(/\b(con licor|licor)\b/gi,'').replace(/\btoping\b/gi,'toppings').trim()) || name;
  const type=s?.family || (p.category==='HAMBURGUESAS'?'Hamburguesa':p.category==='GRANIZADOS CON LICOR'?'Granizado con licor':categoryLabel(p.category));
  return {name,volume,type};
}
export function card(p,art,groupCategory) {
  const a=findArt(art,p),s=scenes[p.slug],{name,volume,type}=posterInfo(p);
  const caption=[groupCategory && p.category===groupCategory?'':type,volume].filter(Boolean).join(' · ');
  const heading=groupCategory!==undefined?'h4':'h3';
  const src=a.imageSmall||a.image||p.image;
  const href=p.sourceUrl||'#carta';
  const photo=src?imageTag(src,titleFor(p)):'<span class="no-photo">'+icon(p.category?.includes('GRANIZADO')?'drink':'bag')+'<span>Sin fotografía</span></span>';
  const setting = a.image?'cutout':src?'photograph':'missing';
  const background=s?'/showcase/backgrounds/'+p.slug+'-wide.webp':!src?'/showcase/ingredients/hielo.webp':'';
  return '<article class="card" data-card-id="'+h(p.id)+'"'+(s?' style="'+toneFor(p.slug)+'"':'')+'>'+
    '<a class="card-media '+setting+'" href="'+h(href)+'" data-detail="'+h(p.id)+'" aria-label="Ver '+h(titleFor(p))+'" style="--card:'+(s?.card||'#e4dbe8')+'">'+(background?'<img class="card-backdrop" src="'+h(background)+'" loading="lazy" alt="">':'')+(src&&!a.image?'<img class="media-fill" src="'+h(src)+'" loading="lazy" alt="" aria-hidden="true">':'')+photo+'</a>'+
    '<div class="card-info">'+(caption?'<p class="card-category">'+h(caption)+'</p>':'')+'<'+heading+'><a href="'+h(href)+'" data-detail="'+h(p.id)+'">'+h(name)+'</a></'+heading+'>'+
    '<div class="card-bottom"><span>'+h(money(p.price))+'</span><button class="poster-add js-only" data-add="'+h(p.id)+'" aria-label="Agregar '+h(titleFor(p))+' al carrito"'+(!available(p)?' disabled':'')+'>'+icon('plus')+'<span>Agregar</span></button></div></div></article>';
}
export function groupedCards(products,art,featured,expanded=false) {
  const pins=new Map(featured.map((slug,i)=>[slug,i]));
  const listFor=items=>[...items].sort((a,b)=>(pins.get(a.slug)??99)-(pins.get(b.slug)??99) || a.rank-b.rank);
  const groups=leadCategories.map(key=>({key,title:categoryLabel(key),items:listFor(products.filter(p=>p.category===key))}));
  groups.push({key:'',title:'Más de la carta',items:products.filter(p=>!leadCategories.includes(p.category))});
  return groups.filter(group=>group.items.length).map(group=>{
    let subset=group.items;
    if (!expanded && group.key && group.items.length>4){
      const firstByName=new Map();
      for (const p of group.items){const {name}=posterInfo(p);if(!firstByName.has(name))firstByName.set(name,p);}
      const unique=[...firstByName.values()];
      subset=[...unique,...group.items.filter(p=>!unique.includes(p))].slice(0,4);
    }
    const more=group.key && group.items.length>subset.length;
    const action=more?'<button class="group-link js-only" data-show-category="'+h(group.key)+'">Ver categoría <span>('+group.items.length+')</span></button>':'<span class="group-count">'+group.items.length+' '+(group.items.length===1?'producto':'productos')+'</span>';
    return '<section class="catalog-family"><div class="family-heading"><h3>'+h(group.title)+'</h3>'+action+'</div><div class="family-grid'+(!group.key?' family-rest':'')+'">'+subset.map(p=>card(p,art,group.key)).join('')+'</div></section>';
  }).join('');
}
export function filters(data) {
  const categories=[...preferredCategories.filter(c=>data.categories.includes(c)),...data.categories.filter(c=>!preferredCategories.includes(c))];
  return '<div class="category-strip" role="group" aria-label="Categorías"><button class="category active" data-category="" aria-pressed="true">Todo</button>'+
    categories.map(c=>'<button class="category" data-category="'+h(c)+'" aria-pressed="false">'+h(categoryLabel(c))+'</button>').join('')+'</div>'+
    '<div class="filter-row"><label class="search-field">'+icon('search')+'<span class="sr">Buscar productos</span><input id="search" type="search" placeholder="Buscar en la carta" autocomplete="off"></label>'+
    '<div class="select-field">'+icon('tune')+'<label class="sr" for="price-filter">Filtrar por precio</label><select id="price-filter"><option value="">Todos los precios</option>'+data.priceBands.map(b=>'<option value="'+h(b.id)+'">'+h(b.label)+'</option>').join('')+'</select>'+icon('down','select-arrow')+'</div>'+
    '<div class="select-field sort-field"><span aria-hidden="true">Orden</span><label class="sr" for="sort">Ordenar productos</label><select id="sort">'+data.sorts.map(s=>'<option value="'+h(s.id)+'">'+h(s.label)+'</option>').join('')+'</select>'+icon('down','select-arrow')+'</div></div>';
}
export function shell(data, art) {
  const d=data.store;
  const featured=data.featured.map(slug=>data.products.find(p=>p.slug===slug)).filter(Boolean);
  const first=featured[0];
  return '<a class="skip" href="#carta">Saltar a la carta</a><header class="site-header" id="topbar"><div class="wrap nav-row">'+
    '<a href="#destacados" class="brand-link" aria-label="Purple, inicio"><span class="brand-mark" role="img" aria-label="Purple"></span></a>'+
    '<nav class="nav-links" aria-label="Principal"><a class="nav-featured is-here" href="#destacados">Destacados</a><a class="nav-menu" href="#carta">La carta</a></nav>'+
    '<div class="nav-end"><a class="social-nav" href="'+h(d.instagram)+'" target="_blank" rel="noopener noreferrer" aria-label="Instagram de Purple">'+icon('instagram')+'</a>'+
    '<button type="button" class="nav-cart js-only" data-cart aria-label="Abrir carrito, 0 productos">'+icon('bag')+'<span class="cart-word">Carrito</span><b class="cart-count">0</b></button></div></div></header>'+
    '<main><section class="showcase" id="destacados" style="'+toneFor(first.slug)+'" aria-label="Productos destacados"><div class="showcase-panel"><div class="backdrop-stack" aria-hidden="true">'+backdrop(first.slug)+'</div><div class="grain"></div><div class="wrap">'+
    '<div class="hero-main"><div class="scene-copy" id="scene-copy">'+heroCopy(first)+'</div>'+
    '<div class="scene-art" id="scene-art" role="group" aria-label="Fotografía y piezas de '+h(titleFor(first))+'">'+stageArt(first,art,true)+'</div></div>'+
    '<p id="scene-live" role="status" class="sr"></p></div></div></section>'+
    '<section class="menu-section" id="carta" aria-labelledby="menu-title"><div class="wrap"><div class="menu-heading"><h2 id="menu-title">La <em>carta</em></h2><span id="result-count" role="status">'+data.products.length+' productos</span></div>'+
    '<div id="filters" class="js-only">'+filters(data)+'</div><div id="catalog-grid" class="catalog-grid grouped">'+groupedCards(data.products,art,data.featured,true)+'</div><div id="pagination" class="pagination js-only"></div>'+
    '<noscript><p>Para seleccionar sabores y hacer tu pedido, <a href="'+h(d.sourceUrl)+'">abre la carta de Purple en Treinta</a>.</p></noscript></div></section></main>'+
    '<footer class="foot"><div class="wrap foot-inner"><div><a href="#destacados" class="footer-brand" aria-label="Purple, volver al inicio"><span class="brand-mark"></span></a><p>Granizados y hamburguesas · Colombia</p></div><nav aria-label="Purple en línea"><a href="'+h(d.whatsappUrl)+'" target="_blank" rel="noopener noreferrer">'+icon('whatsapp')+'WhatsApp</a><a href="'+h(d.instagram)+'" target="_blank" rel="noopener noreferrer">'+icon('instagram')+'Instagram</a><a href="'+h(d.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Carta en Treinta</a></nav></div></footer>'+
    '<dialog id="product-dialog" class="product-dialog" aria-labelledby="detail-name"><button class="detail-close round-button" data-close="product" aria-label="Cerrar detalle" autofocus>'+icon('close')+'</button><div id="detail-content"></div></dialog>'+
    '<dialog id="cart-dialog" class="cart-dialog" aria-labelledby="cart-name"><div class="drawer-inner" id="cart-content"></div></dialog>'+
    '<div id="toast" class="toast" role="status" aria-live="polite"></div>';
}
