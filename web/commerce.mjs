import {icon, escape as h, money, readable, categoryLabel} from './shared.mjs';
import {available, findArt, toneFor, titleFor} from './render.mjs';
import {scenes} from './scenes.mjs';
import {refreshProduct} from '/catalog/sync.js';

const storageKey='purple-pedido-v1';
const positiveInt=n=>Number.isSafeInteger(n) && n>0;
const lineKey=(id,variant='')=>id+'|'+variant;
const variantFor=(p,id)=>p?.variants?.find(v=>v.id===id);
const choiceLabel=text=>readable(text).replace(/toping/gi,'topping');
const linesTotal=rows=>rows.reduce((total,r)=>total+r.price*r.qty,0);
export function initCommerce({lookup,updateProduct,store,art,onChanged}) {
  const detail=document.querySelector('#product-dialog'), cart=document.querySelector('#cart-dialog');
  const detailContent=document.querySelector('#detail-content'), drawer=document.querySelector('#cart-content');
  const toastBox=document.querySelector('#toast');
  let lines=[], detailState=null, viewer=null, timer=0, checking=false, cartMessage='', stored='', confirmedCatalog=false, inventoryNotice=false;
  function loadLines() {
    try {
      const saved=localStorage.getItem(storageKey) || '[]';
      if (saved===stored) return;
      const raw=JSON.parse(saved);stored=saved;
      lines=Array.isArray(raw)?raw.filter(r=>r && /^[a-f0-9-]{36}$/i.test(r.id) && typeof r.variant==='string' && positiveInt(r.qty)).map(r=>({
        id:r.id,variant:r.variant,qty:r.qty,name:typeof r.name==='string'?r.name.slice(0,200):'',
        choice:typeof r.choice==='string'?r.choice.slice(0,200):'',price:Number.isFinite(r.price)?r.price:null
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
  function stockLimit(p,v) {
    if (!available(p) || (v && !available(v)) || (p.variants?.length && !v)) return 0;
    return Math.min(p.stock ?? Number.MAX_SAFE_INTEGER,v?.stock ?? Number.MAX_SAFE_INTEGER);
  }
  function normalizeCart(checkStock=confirmedCatalog) {
    const merged=new Map();
    for (const item of lines) {
      const p=lookup(item.id),v=variantFor(p,item.variant);
      const key=lineKey(item.id,item.variant), qty=(merged.get(key)?.qty || 0)+item.qty;
      const unresolved=!p || (item.variant && !v);
      if (unresolved && !confirmedCatalog && !(checkStock && p && !available(p))) {
        merged.set(key,{...item,qty});continue;
      }
      if (unresolved) continue;
      const allowed=checkStock?Math.min(stockLimit(p,v),qty):qty;
      if (allowed>0) merged.set(key,{...item,qty:allowed});
    }
    lines=[...merged.values()];save();
  }
  function rows() {
    return lines.map(line=>{
      const known=lookup(line.id),v=variantFor(known,line.variant);
      const product=known || {id:line.id,slug:'producto-'+line.id,name:line.name||'Producto guardado',available:false,variants:[],variantGroups:[],ingredients:[]};
      return {...line,product,v,pending:!known || Boolean(line.variant && !v),price:v?.price ?? known?.price ?? line.price ?? 0,key:lineKey(line.id,line.variant)};
    });
  }
  function toast(text,withCart=false) {
    clearTimeout(timer);
    toastBox.innerHTML=icon('check')+'<span>'+h(text)+'</span>'+(withCart?'<button data-cart>Ver carrito</button>':'');
    toastBox.classList.add('visible');timer=setTimeout(()=>toastBox.classList.remove('visible'),3500);
  }
  function addLine(p,v,qty=1) {
    loadLines();
    const variant=v?.id || '', existing=lines.find(l=>l.id===p.id && l.variant===variant);
    const limit=stockLimit(p,v),capacity=Math.max(0,limit-(existing?.qty||0));
    if (!positiveInt(qty) || qty>capacity) {
      const msg=capacity?'Quedan '+capacity+' disponibles para agregar.':'Ya alcanzaste la cantidad disponible.';
      if (detail.open) detailContent.querySelector('.detail-status').textContent=msg;else toast(msg,true);
      return false;
    }
    if (existing) existing.qty+=qty;else lines.push({id:p.id,variant,qty,name:p.name,choice:v?.label||'',price:v?.price??p.price});
    save(); if (detail.open) detail.close();
    toast(titleFor(p)+' en tu carrito',true);
    return true;
  }
  function quantity(qty,target,max) {
    return '<div class="qty" role="group" aria-label="Cantidad"><button data-qty="-1" data-target="'+h(target)+'" aria-label="Disminuir cantidad"'+(qty<=1?' disabled':'')+'>'+icon('minus')+'</button><b>'+qty+'</b><button data-qty="1" data-target="'+h(target)+'" aria-label="Aumentar cantidad"'+(qty>=max?' disabled':'')+'>'+icon('plus')+'</button></div>';
  }
  function purchase(p) {
    const st=detailState, vs=p.variants||[],v=variantFor(p,st.variant), price=v?.price??p.price;
    const already=lines.find(l=>l.id===p.id && l.variant===(v?.id||''))?.qty||0;
    const max=Math.max(0,stockLimit(p,v)-already);
    st.qty=Math.max(1,Math.min(max,st.qty));
    const groups=p.variantGroups||[];
    const lab=groups.length===1 ? choiceLabel(groups[0].label) : 'Elige una opción';
    const options=vs.length?'<div class="variant-wrap"><label class="variant-label" for="variant">'+h(lab)+'</label><select class="variant-select" id="variant" required><option value="">Seleccionar opción</option>'+vs.map(choice=>'<option value="'+h(choice.id)+'"'+(st.variant===choice.id?' selected':'')+(!available(choice)?' disabled':'')+'>'+h(choiceLabel(choice.label))+(choice.price!==p.price?' · '+money(choice.price):'')+(available(choice)?'':' · Agotado')+'</option>').join('')+'</select>'+icon('down')+'</div>':'';
    const text=!available(p)?'Agotado':!max && (v || !vs.length)?'Sin más unidades':'Agregar al carrito';
    return '<p class="detail-price">'+money(price)+' <span class="price-unit">COP</span></p>'+options+
      '<div class="detail-buy">'+quantity(st.qty,'detail',max || 1)+'<button class="button primary" data-buy'+(!available(p)||(!max && (v||!vs.length))?' disabled':'')+'>'+icon('bag')+text+'</button></div><p class="detail-status" role="status"></p>';
  }
  function drawPurchase() {
    if (!detailState) return;
    const box=detailContent.querySelector('#purchase'), focus=box.contains(document.activeElement)?document.activeElement:null;
    const id=focus?.id, delta=focus?.dataset.qty, buy=focus?.hasAttribute('data-buy');
    box.innerHTML=purchase(lookup(detailState.id));
    if (id) box.querySelector('#'+CSS.escape(id))?.focus({preventScroll:true});
    else if (delta) box.querySelector('[data-qty="'+delta+'"]:not(:disabled)')?.focus({preventScroll:true});
    else if (buy) box.querySelector('[data-buy]')?.focus({preventScroll:true});
  }
  function selectedPart(index) {
    if (!detailState) return;
    detailState.part=index;
    detailContent.querySelectorAll('[data-view-part]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.viewPart)===index)));
    const asset=findArt(art,lookup(detailState.id)),label=asset.ingredients?.[index]?.name;
    const note=detailContent.querySelector('.part-note');
    if (note) note.textContent=label?(asset.ingredients[index].description || label):'Arrastra el producto o usa las flechas para girarlo.';
  }
  async function launchViewer(index=-1) {
    const state=detailState, host=detailContent.querySelector('.viewer-host'), p=lookup(state.id),asset=findArt(art,p);
    if (!asset.image || !host) return;
    if (viewer) {viewer.select(index);return;}
    state.part=index;host.hidden=false;
    try {
      const {mountViewer}=await import('/showcase/viewer.js');
      if (detailState!==state || !detail.open || !host.isConnected) return;
      if (viewer) {viewer.select(state.part);return;}
      viewer=mountViewer(host,asset,{onSelect:selectedPart,onMode:mode=>{
        if (detailState===state) {
          host.parentElement.classList.add('has-viewer');
          const controls=detailContent.querySelectorAll('[data-rotate],[data-reset]');
          controls.forEach(b=>b.disabled=mode!=='3d');
        }
      }});
      viewer.select(state.part);
    } catch {
      host.hidden=true;host.parentElement.classList.remove('has-viewer');
      const note=detailContent.querySelector('.part-note');
      if (note) note.textContent='Puedes explorar los ingredientes en las miniaturas.';
    }
  }
  function openProduct(id,inspect=false,part=-1,trigger) {
    const p=lookup(id);if (!p) return;
    const a=findArt(art,p),s=scenes[p.slug],pieces=a.ingredients||[];
    viewer?.destroy();viewer=null;detailState={id,variant:'',qty:1,part,trigger};
    const currentState=detailState;
    const photo=a.image||p.image;
    const desc=s?.story || (p.description?readable(p.description):'');
    detailContent.innerHTML='<article class="detail-grid" style="'+toneFor(p.slug)+'">'+
      '<div class="detail-side">'+(s||photo?'<img class="detail-underlay '+(s?'themed':'')+'" src="'+h(s?'/showcase/backgrounds/'+p.slug+'-mobile.webp':photo)+'" alt="">':'')+'<div class="detail-visual"><div class="detail-photo '+(a.image?'':'regular')+'">'+(photo?'<img alt="'+h(titleFor(p))+'" src="'+h(photo)+'">':'<span class="no-photo">'+icon('drink')+'Sin fotografía</span>')+'</div><div class="viewer-host" hidden></div></div>'+
      (pieces.length?'<div class="viewer-actions"><button data-view-part="-1" aria-pressed="false">'+icon('box')+'Producto completo</button><button data-rotate="-6" aria-label="Girar a la izquierda" disabled>'+icon('left')+'</button><button data-rotate="6" aria-label="Girar a la derecha" disabled>'+icon('right')+'</button><button data-reset aria-label="Volver a la vista frontal" disabled>'+icon('turn')+'</button></div>':'')+'</div>'+
      '<div class="detail-panel"><p class="eyebrow">'+h(s?.family||categoryLabel(p.category)||'Purple')+(s?.size?' · '+h(s.size):'')+'</p><h2 id="detail-name">'+h(titleFor(p))+'</h2>'+
      (desc?'<p class="detail-desc">'+h(desc)+'</p>':'')+
      (pieces.length?'<section class="detail-sect"><h3>Explora los ingredientes</h3><div class="parts-list">'+pieces.map((part,i)=>'<button class="part-chip" data-view-part="'+i+'" aria-pressed="false"><span class="part-img">'+(part.image?'<img src="'+h(part.image)+'" alt="">':'<i></i>')+'</span>'+h(part.name)+'</button>').join('')+'</div><p class="part-note" role="status">Selecciona una pieza para verla de cerca.</p></section>':'')+
      '<div id="purchase" class="detail-sect">'+purchase(p)+'</div></div></article>';
    if (!detail.open) detail.showModal();
    detailContent.scrollTop=0;
    if (inspect) launchViewer(part);
    refreshProduct(p).then(fresh=>{
      if (detailState!==currentState || !detail.open || fresh===p) return;
      updateProduct(fresh);
      if (!available(variantFor(fresh,detailState.variant))) detailState.variant='';
      drawPurchase();onChanged();
    });
  }
  function drawCart() {
    const current=rows(),focus=drawer.contains(document.activeElement)?document.activeElement:null;
    const key=focus?.dataset.target||'',delta=focus?.dataset.qty,trash=focus?.dataset.remove;
    drawer.innerHTML='<div class="drawer-head"><h2 id="cart-name">Tu carrito</h2><button class="round-button" data-close="cart" aria-label="Cerrar carrito" autofocus>'+icon('close')+'</button></div><div class="drawer-body">'+
      (current.length?current.map(r=>{
        const a=findArt(art,r.product),img=a.imageSmall||r.product.image;
        return '<article class="drawer-line"><div class="line-thumb '+(a.image?'':'regular')+'">'+(img?'<img src="'+h(img)+'" alt="">':icon('bag'))+'</div><div class="line-info"><h3>'+h(titleFor(r.product))+'</h3>'+
          (r.v||r.choice?'<p>'+h(choiceLabel(r.v?.label||r.choice))+'</p>':'')+'<p>'+(r.pending?'Pendiente de verificar':money(r.price)+' c/u')+'</p>'+quantity(r.qty,r.key,stockLimit(r.product,r.v))+'</div><div class="line-end"><span>'+money(r.qty*r.price)+'</span><button data-remove="'+h(r.key)+'" aria-label="Quitar '+h(titleFor(r.product))+'">'+icon('trash')+'</button></div></article>';
      }).join(''):'<div class="cart-empty">'+icon('bag')+'<h3>Tu carrito está vacío</h3><button class="button outline" data-shop>Explorar la carta</button></div>')+'</div>'+
      (current.length?'<div class="drawer-foot"><div class="drawer-total"><span>Subtotal</span><strong>'+money(linesTotal(current))+' <span class="price-unit">COP</span></strong></div><p class="cart-note">'+h(cartMessage||'Purple confirma la disponibilidad y el valor del domicilio por WhatsApp.')+'</p><button class="button primary" data-checkout'+(checking?' disabled':'')+'>'+icon('whatsapp')+(checking?'Verificando disponibilidad…':'Pedir por WhatsApp')+'</button></div>':cartMessage?'<p class="drawer-foot cart-note" role="status">'+h(cartMessage)+'</p>':'');
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
  const signature=list=>list.map(r=>[r.key,r.qty,r.price].join('/')).join('|');
  async function checkout() {
    if (checking) return;
    const prior=signature(rows());
    if (!prior) return;
    checking=true;drawCart();
    const unique=[...new Map(rows().map(r=>[r.id,r.product])).values()];
    try {
      const fresh=await Promise.all(unique.map(refreshProduct));
      fresh.forEach((p,i)=>{if(p!==unique[i])updateProduct(p);});loadLines();normalizeCart(true);
      const current=rows();
      if (!cart.open) return;
      if (current.some(r=>r.pending)) {cartMessage='Aún hay un producto pendiente de verificación. Vuelve a intentar cuando tengas conexión.';return;}
      if (signature(current)!==prior) {cartMessage='El precio o la disponibilidad cambió. Revisa el subtotal antes de enviar tu pedido.';return;}
      const message=['Hola, Purple. Quiero hacer este pedido:',...current.map(r=>r.qty+' × '+r.product.name+(r.v?' ('+choiceLabel(r.v.label)+')':'')+' — '+money(r.price*r.qty)),
        '', 'Subtotal: '+money(linesTotal(current))+' COP.', '¿Me confirman la disponibilidad y la entrega?'].join('\n');
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
      if (p.variants?.length) openProduct(p.id,false,-1,b);else addLine(p,null);
    } else if (b.dataset.detail || b.dataset.inspect) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();openProduct(b.dataset.detail||b.dataset.inspect,Boolean(b.dataset.inspect),Number(b.dataset.part??-1),b);
    } else if (b.dataset.close) {
      (b.dataset.close==='cart'?cart:detail).close();
    } else if (b.hasAttribute('data-view-part')) launchViewer(Number(b.dataset.viewPart));
    else if (b.dataset.rotate) viewer?.rotate(Number(b.dataset.rotate));
    else if (b.hasAttribute('data-reset')) viewer?.reset();
    else if (b.hasAttribute('data-buy') && detailState) {
      const p=lookup(detailState.id),v=variantFor(p,detailState.variant);
      if (p.variants.length && !v) {
        const select=detailContent.querySelector('#variant');select.focus();select.reportValidity();return;
      }
      addLine(p,v,detailState.qty);
    } else if (b.dataset.qty && b.dataset.target==='detail' && detailState) {
      detailState.qty+=Number(b.dataset.qty);drawPurchase();
    } else if (b.dataset.qty || b.dataset.remove) {
      if (checking) return;
      loadLines();
      const key=b.dataset.target||b.dataset.remove,line=lines.find(l=>lineKey(l.id,l.variant)===key);
      if (line && b.dataset.remove) lines=lines.filter(l=>l!==line);
      else if (line) {const p=lookup(line.id);const max=p?stockLimit(p,variantFor(p,line.variant)):line.qty;line.qty=Math.max(1,Math.min(max||line.qty,line.qty+Number(b.dataset.qty)));}
      normalizeCart();cartMessage='';drawCart();
    } else if (b.hasAttribute('data-checkout')) checkout();
    else if (b.hasAttribute('data-shop')) {cart.close();location.hash='carta';document.querySelector('#carta').scrollIntoView();}
  });
  detail.addEventListener('change',event=>{
    if (event.target.id==='variant' && detailState) {detailState.variant=event.target.value;detailState.qty=1;drawPurchase();}
  });
  for (const dlg of [detail,cart]) {
    dlg.addEventListener('click',e=>{
      if (e.target!==dlg) return;
      const r=dlg.getBoundingClientRect();
      if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dlg.close();
    });
  }
  detail.addEventListener('close',()=>{
    const opener=detailState?.trigger;
    viewer?.destroy();viewer=null;detailState=null;
    if (opener?.isConnected && !cart.open) opener.focus({preventScroll:true});
  });
  cart.addEventListener('close',()=>{if (!detail.open) document.querySelector('.nav-cart').focus({preventScroll:true});});
  window.addEventListener('storage',event=>{if (event.key===storageKey) {loadLines();setBadge();if(cart.open)drawCart();}});
  loadLines();setBadge();
  return {refresh(){
    const before=lines.map(r=>[r.id,r.variant,r.qty]).join('|');confirmedCatalog=true;normalizeCart();
    if(before!==lines.map(r=>[r.id,r.variant,r.qty]).join('|'))inventoryNotice=true;
    if(cart.open && !checking){if(inventoryNotice){cartMessage='Actualizamos las cantidades según la disponibilidad de Purple.';inventoryNotice=false;}drawCart();}
  }};
}
