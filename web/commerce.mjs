import {icon, escape as h, money, readable, categoryLabel} from './shared.mjs';
import {available, findArt, toneFor, titleFor} from './render.mjs';
import {scenes} from './scenes.mjs';
import {refreshProduct} from '/catalog/sync.js';
import {choiceLabel,choiceKey,choicesMarkup,extraMarkup,productAssembly,acceptsExtra} from './product-options.mjs';
import {lineKey,variantFor,positiveInt,capacity,holds,reserve} from './cart-stock.mjs';
import {animateCart} from './cart-motion.mjs';
import {burgerRecipes} from './burger-recipes.mjs';
import {normalizeChanges,recipeNotes,needsQuote,burgerAssembly,burgerOptions,stackPicture} from './burger.mjs';

const storageKey='purple-pedido-v1';
const linesTotal=rows=>rows.reduce((total,r)=>total+r.price*r.qty,0);
export function initCommerce({lookup,updateProduct,store,art,optionArt,configurations,galleryArt,burgerLayers,extraId,onChanged}) {
  const detail=document.querySelector('#product-dialog'), cart=document.querySelector('#cart-dialog');
  const detailContent=document.querySelector('#detail-content'), drawer=document.querySelector('#cart-content');
  const toastBox=document.querySelector('#toast');
  let lines=[], detailState=null, viewer=null, timer=0, checking=false, cartMessage='', stored='', confirmedCatalog=false, inventoryNotice=false;
  const extraFor=p=>acceptsExtra(p) && extraId?lookup(extraId):null;
  const artwork=p=>({...galleryArt[p.slug],...findArt(art,p)});
  const assemble=(p,v,extra,changes)=>burgerRecipes[p.slug]?burgerAssembly(p,burgerRecipes[p.slug],burgerLayers,changes):productAssembly(p,artwork(p),configurations[p.slug],optionArt,v,extra);
  const rowKey=r=>lineKey(r.id,r.variant,r.extra,r.changes);
  function loadLines() {
    try {
      const saved=localStorage.getItem(storageKey) || '[]';
      if (saved===stored) return;
      const raw=JSON.parse(saved);stored=saved;
      lines=Array.isArray(raw)?raw.filter(r=>r && /^[a-f0-9-]{36}$/i.test(r.id) && typeof r.variant==='string' && positiveInt(r.qty)).map(r=>({
        id:r.id,variant:r.variant,qty:r.qty,name:typeof r.name==='string'?r.name.slice(0,200):'',
        choice:typeof r.choice==='string'?r.choice.slice(0,200):'',price:Number.isFinite(r.price)?r.price:null,
        extra:r.extra===extraId?r.extra:'',extraPrice:Number.isFinite(r.extraPrice)?r.extraPrice:0,
        changes:normalizeChanges(burgerRecipes[lookup(r.id)?.slug],r.changes)
      })):[];
    } catch {lines=[];}
  }
  function save() {
    stored=JSON.stringify(lines);
    try {localStorage.setItem(storageKey,stored);} catch {}
    setBadge();
  }
  function setBadge() {
    const count=lines.reduce((n,l)=>n+l.qty,0);
    document.querySelectorAll('.cart-count').forEach(el=>{el.textContent=String(count);});
    document.querySelector('.nav-cart').setAttribute('aria-label','Abrir carrito, '+count+(count===1?' producto':' productos'));
  }
  function normalizeCart(checkStock=confirmedCatalog) {
    const merged=new Map(),used=new Map();
    for (const item of lines) {
      const p=lookup(item.id),v=variantFor(p,item.variant),extra=item.extra?extraFor(p):null;
      const key=rowKey(item), oldQty=merged.get(key)?.qty||0;
      const unresolved=!p || (item.variant && !v) || (item.extra && !extra);
      if (unresolved && !confirmedCatalog && !(checkStock && p && !available(p))) {
        merged.set(key,{...item,qty:oldQty+item.qty});reserve(used,item);continue;
      }
      if (unresolved) continue;
      const qty=checkStock?Math.min(capacity(p,v,extra,used),item.qty):item.qty;
      if (qty>0) {merged.set(key,{...item,qty:oldQty+qty});reserve(used,{...item,qty});}
    }
    lines=[...merged.values()];save();
  }
  function rows() {
    return lines.map(line=>{
      const known=lookup(line.id),v=variantFor(known,line.variant);
      const product=known || {id:line.id,slug:'producto-'+line.id,name:line.name||'Producto guardado',available:false,variants:[],variantGroups:[],ingredients:[]};
      const addon=line.extra?extraFor(known):null;
      const price=(v?.price??known?.price??line.price??0)+(addon?.price??(line.extra?line.extraPrice:0));
      return {...line,product,v,addon,pending:!known||Boolean(line.variant&&!v)||Boolean(line.extra&&!addon),price,key:rowKey(line)};
    });
  }
  function toast(text,withCart=false) {
    clearTimeout(timer);
    toastBox.innerHTML=icon('check')+'<span>'+h(text)+'</span>'+(withCart?'<button data-cart>Ver carrito</button>':'');
    toastBox.classList.add('visible');timer=setTimeout(()=>toastBox.classList.remove('visible'),3500);
  }
  function addLine(p,v,qty,trigger,extra=null,changes={}) {
    loadLines();
    const variant=v?.id||'', addon=extra?.id||'';
    const edit=detail.open?detailState?.editKey:null;
    if(edit && !lines.some(l=>rowKey(l)===edit)) {
      detailContent.querySelector('.detail-status').textContent='Esta línea del carrito cambió. Vuelve a abrirla desde el carrito.';return false;
    }
    const remaining=capacity(p,v,extra,holds(lines,edit));
    if (!positiveInt(qty) || qty>remaining) {
      const msg=remaining?'Quedan '+remaining+' disponibles para agregar.':'Ya alcanzaste la cantidad disponible.';
      if (detail.open) detailContent.querySelector('.detail-status').textContent=msg;else toast(msg,true);
      return false;
    }
    const source=(detail.open?detailContent.querySelector('.detail-visual'):trigger?.closest('.card')?.querySelector('.card-media') || (trigger?.closest('#destacados') && document.querySelector('.stage-product')))||trigger;
    const rect=source?.getBoundingClientRect();
    if(edit)lines=lines.filter(l=>rowKey(l)!==edit);
    const key=lineKey(p.id,variant,addon,changes),existing=lines.find(l=>rowKey(l)===key);
    if (existing) existing.qty+=qty;else lines.push({id:p.id,variant,extra:addon,changes,qty,name:p.name,choice:v?.label||'',price:v?.price??p.price,extraPrice:extra?.price||0});
    save(); if (detail.open) detail.close();
    if(edit){openCart();return true;}
    animateCart(rect,assemble(p,v,extra,changes),galleryArt[p.slug]?.light||scenes[p.slug]?.card,optionArt[choiceKey(v)]|| (extra && optionArt['jeringa-licor']));
    toast(titleFor(p)+(v?' · '+choiceLabel(v.label):'')+' en tu carrito',true);
    return true;
  }
  function quantity(qty,target,max) {
    return '<div class="qty" role="group" aria-label="Cantidad"><button data-qty="-1" data-target="'+h(target)+'" aria-label="Disminuir cantidad"'+(qty<=1?' disabled':'')+'>'+icon('minus')+'</button><b>'+qty+'</b><button data-qty="1" data-target="'+h(target)+'" aria-label="Aumentar cantidad"'+(qty>=max?' disabled':'')+'>'+icon('plus')+'</button></div>';
  }
  function purchase(p) {
    const st=detailState, vs=p.variants||[],v=variantFor(p,st.variant),extra=extraFor(p),used=holds(lines,st.editKey);
    const canExtra=Boolean(extra && capacity(extra,null,null,used)>0);
    if (!canExtra) st.extra=false;
    const addon=st.extra?extra:null,price=(v?.price??p.price)+(addon?.price||0);
    const max=capacity(p,v,addon,used);
    st.qty=Math.max(1,Math.min(max,st.qty));
    const recipe=burgerRecipes[p.slug],noLayers=recipe && !assemble(p,null,null,st.changes).edibleCount;
    const options=recipe?burgerOptions(recipe,burgerLayers,st.changes):choicesMarkup(p,st.variant,optionArt)+extraMarkup(extra,st.extra,optionArt,canExtra);
    const text=!available(p)?'Agotado':!max && (v || !vs.length)?'Sin más unidades':st.editKey?'Guardar cambios':'Agregar al carrito';
    const exportName=recipe?'Descargar mi '+(recipe.type==='fries'?'porción':'hamburguesa')+' en 4K':'Descargar mi vaso en 4K';
    const exportLink=(galleryArt[p.slug]||configurations[p.slug]) && !noLayers?'<button type="button" class="export-drink" data-export>'+icon('download')+exportName+'</button>':'';
    return options+'<div class="buy-footer"><div class="purchase-total"><p class="detail-price" aria-live="polite">'+money(price*st.qty)+' <span class="price-unit">COP</span></p>'+exportLink+'</div>'+
      (needsQuote(st.changes)?'<p class="quote-note">Precio de la receta base. Extras por confirmar.</p>':'')+
      '<div class="detail-buy">'+quantity(st.qty,'detail',max || 1)+'<button class="button primary" data-buy'+(noLayers||!available(p)||(!max && (v||!vs.length))?' disabled':'')+'>'+icon('bag')+text+'</button></div><p class="detail-status" role="status">'+(noLayers?'Agrega al menos un ingrediente para pedir.':'')+'</p></div>';
  }
  function drawPurchase() {
    if (!detailState) return;
    const box=detailContent.querySelector('#purchase'), focus=box.contains(document.activeElement)?document.activeElement:null;
    const id=focus?.id, delta=focus?.dataset.qty, buy=focus?.hasAttribute('data-buy'),openExtras=box.querySelector('.burger-extras')?.open;
    box.innerHTML=purchase(lookup(detailState.id));
    if(openExtras && box.querySelector('.burger-extras'))box.querySelector('.burger-extras').open=true;
    if (id) {
      const button=box.querySelector('#'+CSS.escape(id));
      (button?.disabled?button.closest('.layer-count')?.querySelector('button:not(:disabled)'):button)?.focus({preventScroll:true});
    }
    else if (delta) box.querySelector('[data-qty="'+delta+'"]:not(:disabled)')?.focus({preventScroll:true});
    else if (buy) box.querySelector('[data-buy]')?.focus({preventScroll:true});
  }
  let viewVersion=0;
  async function drawView(motion=false) {
    const state=detailState;
    if(!state || !detail.open) return;
    const p=lookup(state.id),artPiece=artwork(p),v=variantFor(p,state.variant);
    const whole=assemble(p,v,state.extra?extraFor(p):null,state.changes);
    if(whole.stack) {
      const visual=detailContent.querySelector('.detail-visual'),host=visual.querySelector('.viewer-host');
      const toggle=detailContent.querySelector('[data-spread]');
      toggle.setAttribute('aria-pressed',String(state.exploded));
      toggle.querySelector('span').textContent=state.exploded?'Juntar capas':'Separar capas';
      const key=lineKey(p.id,'','',state.changes)+'/'+state.exploded;
      if(state.viewKey===key)return;
      state.viewKey=key;visual.dataset.view=state.exploded?'exploded':'product';
      visual.querySelector('.detail-photo').innerHTML=stackPicture(whole,state.exploded?1:0,true);
      const token=++viewVersion;
      try {
        if(viewer) {viewer.set(whole,state.exploded);return;}
        const {mountBurgerViewer}=await import('./burger-viewer.mjs');
        if(token!==viewVersion || detailState!==state || !detail.open)return;
        host.hidden=false;viewer=mountBurgerViewer(host,whole,state.exploded);visual.classList.add('has-viewer');
      } catch {host.hidden=true;visual.classList.remove('has-viewer');}
      return;
    }
    const ingredient=state.view==='part'?artPiece.ingredients?.[state.part]:null;
    const choice=state.view==='choice'?optionArt[choiceKey(v)]:state.view==='extra' && state.extra?optionArt['jeringa-licor']:null;
    const piece=ingredient||choice||whole, full=piece===whole;
    const key=full?whole.key:'piece-'+(piece.model||piece.image);
    const visual=detailContent.querySelector('.detail-visual');
    const note=detailContent.querySelector('.part-note');
    detailContent.querySelectorAll('[data-view-part]').forEach(button=>{
      const index=Number(button.dataset.viewPart);
      button.setAttribute('aria-pressed',String(index===-1?full:Boolean(ingredient && index===state.part)));
    });
    if(note) note.innerHTML=ingredient?h(ingredient.description||ingredient.name)+(ingredient.master?' <a class="ingredient-master" target="_blank" rel="noopener" href="'+h(ingredient.master)+'">Foto 4K ↗</a>':''):'';
    const caption=detailContent.querySelector('.preview-caption');
    const selected=[v?choiceLabel(v.label):'',state.extra?'Jeringa extra':''].filter(Boolean).join(' + ');
    caption.textContent=full?selected:piece.name;
    caption.hidden=!caption.textContent;
    if(state.viewKey===key) return;
    state.viewKey=key;
    const token=++viewVersion,host=visual.querySelector('.viewer-host');
    const fallback=visual.querySelector('.detail-photo img');
    if(fallback && piece.image) {fallback.src=piece.image;fallback.alt=piece.name||titleFor(p);}
    visual.dataset.view=full?'product':ingredient?'ingredient':'option';
    if (motion && !matchMedia('(prefers-reduced-motion: reduce)').matches && host.animate) {
      host.getAnimations().forEach(a=>a.cancel());
      host.animate([{transform:'translateY(-5px) scale(.974)'},{transform:'translateY(0) scale(1)'}],{duration:270,easing:'cubic-bezier(.2,.8,.25,1)'});
    }
    if(!piece.model) {viewer?.destroy();viewer=null;host.hidden=true;visual.classList.remove('has-viewer');return;}
    host.hidden=false;
    try {
      if(viewer) {viewer.display(piece);return;}
      const {mountViewer}=await import('/showcase/viewer.js');
      if(token!==viewVersion || detailState!==state || !detail.open) return;
      viewer=mountViewer(host,piece,{cyclePieces:false,onMode:()=>visual.classList.add('has-viewer')});
    } catch {host.hidden=true;visual.classList.remove('has-viewer');}
  }
  function openProduct(id,inspect=false,part=-1,trigger,editLine=null) {
    const p=lookup(id);if (!p) return;
    const a=artwork(p),s=scenes[p.slug],ga=galleryArt[p.slug],recipe=burgerRecipes[p.slug],pieces=recipe?[]:a.ingredients||[],whole=assemble(p,null,null,editLine?.changes);
    ++viewVersion;viewer?.destroy();viewer=null;
    detailState={id,variant:'',extra:false,qty:editLine?.qty||1,part,view:inspect && part>=0?'part':'whole',trigger,changes:{...editLine?.changes},exploded:Boolean(recipe&&inspect),editKey:editLine?rowKey(editLine):null};
    const currentState=detailState, photo=whole.image||ga?.image;
    const desc=s?.story || (p.description?readable(p.description):'');
    const tint=ga?'--tone:'+ga.tone+';--light:'+ga.light+';--accent:'+ga.button+';--card:'+ga.light+';--scene-ink:'+ga.ink+';--buy-color:'+ga.button:toneFor(p.slug);
    detailContent.innerHTML='<article class="detail-grid'+(p.variants.length || extraFor(p)||recipe?' configurable':'')+(recipe?' burger-detail':'')+'" style="'+tint+'">'+
      '<div class="detail-side">'+(ga||s||photo?'<img class="detail-underlay '+(ga||s?'themed':'')+'" src="'+h(ga?.backgroundMobile||(s?'/showcase/backgrounds/'+p.slug+'-mobile.webp':p.image||photo))+'" alt="">':'')+
      '<div class="detail-visual"><div class="detail-photo '+(a.image||p.cutout||whole.model?'':'regular')+'">'+(recipe?stackPicture(whole,0,true):photo?'<img alt="'+h(titleFor(p))+'" src="'+h(photo)+'">':'<span class="no-photo">'+icon('drink')+'Sin fotografía</span>')+'</div><div class="viewer-host" hidden></div></div>'+
      '<span class="preview-caption" role="status" hidden></span>'+
      (recipe?'<div class="viewer-actions"><button type="button" data-spread aria-pressed="false">'+icon('layers')+'<span>Separar capas</span></button></div>':whole.model?'<div class="viewer-actions"><button type="button" data-view-part="-1" aria-pressed="true">'+icon('box')+'Producto completo</button></div>':'')+'</div>'+
      '<div class="detail-panel"><p class="eyebrow">'+h(s?.family||categoryLabel(p.category)||'Purple')+(s?.size?' · '+h(s.size):'')+'</p><h2 id="detail-name">'+h(titleFor(p))+'</h2>'+
      (desc?'<p class="detail-desc">'+h(desc)+'</p>':'')+
      (pieces.length?'<section class="detail-sect recipe"><h3>Explora los ingredientes</h3><div class="parts-list">'+pieces.map((item,i)=>'<button class="part-chip" data-view-part="'+i+'" aria-pressed="false"><span class="part-img">'+(item.image?'<img src="'+h(item.image)+'" alt="">':'<i></i>')+'</span>'+h(item.name)+'</button>').join('')+'</div><p class="part-note" role="status"></p></section>':'')+
      '<div id="purchase" class="detail-sect">'+purchase(p)+'</div></div></article>';
    if (!detail.open) detail.showModal();
    detailContent.scrollTop=0;drawView();
    const extra=extraFor(p);
    Promise.all([refreshProduct(p),extra?refreshProduct(extra):null]).then(([fresh,freshExtra])=>{
      if (detailState!==currentState || !detail.open) return;
      if (fresh!==p) updateProduct(fresh);
      if (freshExtra && freshExtra!==extra) updateProduct(freshExtra);
      if (detailState.variant && !available(variantFor(fresh,detailState.variant))) {detailState.variant='';detailState.view='whole';}
      if(detailState.extra && !available(extraFor(fresh))) detailState.extra=false;
      drawPurchase();drawView();onChanged();
    });
  }
  function drawCart() {
    const current=rows(),focus=drawer.contains(document.activeElement)?document.activeElement:null;
    const key=focus?.dataset.target||'',delta=focus?.dataset.qty,trash=focus?.dataset.remove;
    drawer.innerHTML='<div class="drawer-head"><h2 id="cart-name">Tu carrito</h2><button class="round-button" data-close="cart" aria-label="Cerrar carrito" autofocus>'+icon('close')+'</button></div><div class="drawer-body">'+
      (current.length?current.map(r=>{
        const assembly=assemble(r.product,r.v,r.addon,r.changes),img=assembly.imageSmall||r.product.image;
        const sample=optionArt[choiceKey(r.v)]|| (r.addon && optionArt['jeringa-licor']);
        const max=capacity(r.product,r.v,r.addon,holds(lines,r.key));
        const notes=assembly.stack?recipeNotes(burgerRecipes[r.product.slug],r.changes,burgerLayers):[];
        return '<article class="drawer-line"><div class="line-thumb '+(assembly.model||assembly.stack||r.product.cutout?'':'regular')+'">'+(assembly.stack?stackPicture(assembly):img?'<img src="'+h(img)+'" alt="">':icon('bag'))+(sample?'<img class="line-sample" src="'+h(sample.imageSmall)+'" alt="">':'')+'</div><div class="line-info"><h3>'+h(titleFor(r.product))+'</h3>'+
          (notes.length?'<p>'+h(notes.join(' · '))+'</p>':'')+(needsQuote(r.changes)?'<p class="burger-note">Extras por confirmar</p>':'')+
          (assembly.stack?'<button class="edit-burger" data-edit-burger="'+h(r.key)+'">Editar ingredientes</button>':'')+
          (r.v||r.choice?'<p>'+h(choiceLabel(r.v?.label||r.choice))+'</p>':'')+(r.addon?'<p>Jeringa extra de licor · +'+money(r.addon.price)+' c/u</p>':'')+
          '<p>'+(r.pending?'Pendiente de verificar':money(r.price)+' c/u')+'</p>'+quantity(r.qty,r.key,max)+'</div><div class="line-end"><span>'+money(r.qty*r.price)+'</span><button data-remove="'+h(r.key)+'" aria-label="Quitar '+h(titleFor(r.product))+'">'+icon('trash')+'</button></div></article>';
      }).join(''):'<div class="cart-empty">'+icon('bag')+'<h3>Tu carrito está vacío</h3><button class="button outline" data-shop>Explorar la carta</button></div>')+'</div>'+
      (current.length?'<div class="drawer-foot"><div class="drawer-total"><span>Subtotal</span><strong>'+money(linesTotal(current))+' <span class="price-unit">COP</span></strong></div>'+(current.some(r=>needsQuote(r.changes))?'<p class="quote-note">Falta sumar los extras que confirme Purple.</p>':'')+'<p class="cart-note">'+h(cartMessage||'Purple confirma la disponibilidad y el valor del domicilio por WhatsApp.')+'</p><button class="button primary" data-checkout'+(checking?' disabled':'')+'>'+icon('whatsapp')+(checking?'Verificando disponibilidad…':'Pedir por WhatsApp')+'</button></div>':cartMessage?'<p class="drawer-foot cart-note" role="status">'+h(cartMessage)+'</p>':'');
    if (key && delta) drawer.querySelector('[data-target="'+CSS.escape(key)+'"][data-qty="'+delta+'"]:not(:disabled)')?.focus({preventScroll:true});
    if (trash && cart.open) (drawer.querySelector('[data-remove]') || drawer.querySelector('[data-shop]'))?.focus({preventScroll:true});
  }
  function openCart() {
    loadLines();const before=rows().map(r=>[r.key,r.qty]).join('|');normalizeCart();
    cartMessage=inventoryNotice || before!==rows().map(r=>[r.key,r.qty]).join('|')?'Actualizamos las cantidades según la disponibilidad de Purple.':'';
    inventoryNotice=false;
    if (detail.open) detail.close();
    toastBox.classList.remove('visible');drawCart();if (!cart.open) cart.showModal();
  }
  async function saveDrink(button) {
    const state=detailState,p=lookup(state.id),v=variantFor(p,state.variant),extra=state.extra?extraFor(p):null;
    const assembly=assemble(p,v,extra,state.changes),key=lineKey(p.id,v?.id,extra?.id,state.changes),old=button.innerHTML;
    button.disabled=true;button.textContent='Preparando PNG…';
    try {
      const png=assembly.stack?await (await import('./burger-viewer.mjs')).exportBurger(assembly):await (await import('./export-drink.mjs')).exportDrink(assembly);
      if(detailState!==state || lineKey(p.id,state.variant,state.extra?extra?.id:'',state.changes)!==key || !detail.open) return;
      const url=URL.createObjectURL(png),link=document.createElement('a');
      link.download=['Purple',p.slug,choiceKey(v),extra?'extra':null,'4K'].filter(Boolean).join('-')+'.png';
      link.href=url;detail.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch {
      if(detailState===state && detail.open) detailContent.querySelector('.detail-status').textContent='No se pudo preparar la imagen. Intenta descargarla de nuevo.';
    } finally {if(button.isConnected){button.disabled=false;button.innerHTML=old;}}
  }
  const signature=list=>list.map(r=>[r.key,r.qty,r.price].join('/')).join('|');
  async function checkout() {
    if (checking) return;
    const prior=signature(rows());
    if (!prior) return;
    checking=true;drawCart();
    const unique=[...new Map(rows().flatMap(r=>[r.product,r.addon].filter(Boolean)).map(p=>[p.id,p])).values()];
    try {
      const fresh=await Promise.all(unique.map(refreshProduct));
      fresh.forEach((p,i)=>{if(p!==unique[i])updateProduct(p);});loadLines();normalizeCart(true);
      const current=rows();
      if (!cart.open) return;
      if (current.some(r=>r.pending)) {cartMessage='Aún hay un producto pendiente de verificación. Vuelve a intentar cuando tengas conexión.';return;}
      if (signature(current)!==prior) {cartMessage='El precio o la disponibilidad cambió. Revisa el subtotal antes de enviar tu pedido.';return;}
      const message=['Hola, Purple. Quiero hacer este pedido:',...current.map(r=>{
        const notes=recipeNotes(burgerRecipes[r.product.slug],r.changes,burgerLayers);
        return r.qty+' × '+r.product.name+(r.v?' ('+choiceLabel(r.v.label)+')':'')+(r.addon?' + jeringa extra de licor por vaso':'')+(notes.length?' ('+notes.join(', ')+')':'')+' — '+money(r.price*r.qty);
      }),'', 'Subtotal: '+money(linesTotal(current))+' COP.',...(current.some(r=>needsQuote(r.changes))?['¿Me confirman el precio de los ingredientes extra?']:[]),'¿Me confirman la disponibilidad y la entrega?'].join('\n');
      const url=new URL(store.whatsappUrl);url.searchParams.set('text',message);
      location.assign(url.href);
    } finally {checking=false;drawCart();onChanged();}
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('a,button');
    if (!b) return;
    if (b.matches('[data-cart]')) return openCart();
    if (b.dataset.add) {
      const p=lookup(b.dataset.add);if (!available(p)) return;
      if (p.variants?.length || extraFor(p)||burgerRecipes[p.slug]) openProduct(p.id,false,-1,b);else addLine(p,null,1,b);
    } else if (b.dataset.detail || b.dataset.inspect) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();openProduct(b.dataset.detail||b.dataset.inspect,Boolean(b.dataset.inspect),Number(b.dataset.part??-1),b);
    } else if (b.dataset.close) {
      (b.dataset.close==='cart'?cart:detail).close();
    } else if(b.hasAttribute('data-edit-burger')) {
      if(checking)return;
      loadLines();const line=lines.find(l=>rowKey(l)===b.dataset.editBurger);
      if(line){cart.close();openProduct(line.id,false,-1,b,line);}
    } else if(b.hasAttribute('data-spread') && detailState) {detailState.exploded=!detailState.exploded;drawView(true);}
    else if(b.dataset.layer && detailState) {
      const p=lookup(detailState.id),key=b.dataset.layer;
      detailState.changes=normalizeChanges(burgerRecipes[p.slug],{...detailState.changes,[key]:(detailState.changes[key]||0)+Number(b.dataset.step)});
      drawPurchase();drawView(true);
    } else if (b.hasAttribute('data-view-part') && detailState) {
      detailState.part=Number(b.dataset.viewPart);
      detailState.view=detailState.part<0?'whole':'part';
      if(detailState.view==='whole') viewer?.reset();
      drawView(true);
    } else if (b.hasAttribute('data-inspect-choice') && detailState) {detailState.view='choice';drawView(true);}
    else if (b.hasAttribute('data-inspect-extra') && detailState) {detailState.view='extra';drawView(true);}
    else if (b.hasAttribute('data-export') && detailState) saveDrink(b);
    else if (b.hasAttribute('data-buy') && detailState) {
      const p=lookup(detailState.id),v=variantFor(p,detailState.variant);
      if (p.variants.length && !v) {
        const first=detailContent.querySelector('[data-choice]:not(:disabled)');
        if(first) {first.focus();detailContent.querySelector('.detail-status').textContent='Selecciona una opción para agregar tu granizado.';}
        return;
      }
      addLine(p,v,detailState.qty,b,detailState.extra?extraFor(p):null,detailState.changes);
    } else if (b.dataset.qty && b.dataset.target==='detail' && detailState) {
      detailState.qty+=Number(b.dataset.qty);drawPurchase();
    } else if (b.dataset.qty || b.dataset.remove) {
      if (checking) return;
      loadLines();
      const key=b.dataset.target||b.dataset.remove,line=lines.find(l=>rowKey(l)===key);
      if (line && b.dataset.remove) lines=lines.filter(l=>l!==line);
      else if (line) {const p=lookup(line.id);const max=p?capacity(p,variantFor(p,line.variant),line.extra?extraFor(p):null,holds(lines,key)):line.qty;line.qty=Math.max(1,Math.min(max||line.qty,line.qty+Number(b.dataset.qty)));}
      normalizeCart();cartMessage='';drawCart();
    } else if (b.hasAttribute('data-checkout')) checkout();
    else if (b.hasAttribute('data-shop')) {cart.close();location.hash='carta';document.querySelector('#carta').scrollIntoView();}
  });
  detail.addEventListener('change',event=>{
    if(!detailState) return;
    if (event.target.matches('[data-choice]')) {detailState.variant=event.target.value;detailState.qty=1;}
    else if (event.target.matches('[data-extra]')) detailState.extra=event.target.checked;
    else return;
    detailState.view='whole';drawPurchase();drawView(true);
  });
  for (const dlg of [detail,cart]) {
    dlg.addEventListener('click',e=>{
      if (e.target!==dlg) return;
      const r=dlg.getBoundingClientRect();
      if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dlg.close();
    });
  }
  detail.addEventListener('close',()=>{
    const opener=detailState?.trigger,editing=detailState?.editKey;
    if (detail.open) return;
    ++viewVersion;viewer?.destroy();viewer=null;detailState=null;detailContent.replaceChildren();
    if(editing && !cart.open) openCart();
    else if (opener?.isConnected && !cart.open) opener.focus({preventScroll:true});
  });
  cart.addEventListener('close',()=>{if (!detail.open) document.querySelector('.nav-cart').focus({preventScroll:true});});
  window.addEventListener('storage',event=>{
    if(event.key!==storageKey && event.key!==null) return;
    loadLines();setBadge();
    if(cart.open) drawCart();
    if(detail.open && detailState) {drawPurchase();drawView();}
  });
  loadLines();setBadge();
  return {refresh(){
    const before=lines.map(r=>[r.id,r.variant,r.extra,r.qty]).join('|');confirmedCatalog=true;normalizeCart();
    if(before!==lines.map(r=>[r.id,r.variant,r.extra,r.qty]).join('|'))inventoryNotice=true;
    if(detailState && detail.open) {
      const p=lookup(detailState.id);
      if(detailState.variant && !available(variantFor(p,detailState.variant))) {detailState.variant='';detailState.view='whole';}
      if(detailState.extra && !available(extraFor(p))) detailState.extra=false;
      drawPurchase();drawView();
    }
    if(cart.open && !checking){if(inventoryNotice){cartMessage='Actualizamos las cantidades según la disponibilidad de Purple.';inventoryNotice=false;}drawCart();}
  }};
}
