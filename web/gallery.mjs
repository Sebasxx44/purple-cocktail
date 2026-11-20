import {escape as h,icon,money,productName} from './shared.mjs';
import {wheelGesture} from './wheel-gesture.mjs';
import {scrollMotion} from './scroll-motion.mjs';

export const families=[{id:'granizados',name:'Granizados'},{id:'hamburguesas',name:'Hamburguesas'}];
export function galleryFamily(p) {
  if(p.category==='HAMBURGUESAS') return 'hamburguesas';
  return /^granizado\b/i.test(p.name)?'granizados':'';
}
const fallback={tone:'#b895df',light:'#e6cef7',ink:'#301438',button:'#471760'};
function artFor(p,art) {
  return {...fallback,name:productName(p),eyebrow:'',image:p.cutout||p.image,imageSmall:p.thumbnail||p.image,...art[p.slug]};
}
const ordinal=n=>String(n).padStart(2,'0');
function sceneVars(a) {
  return '--gallery-tone:'+a.tone+';--gallery-light:'+a.light+';--gallery-ink:'+a.ink+';--gallery-button:'+a.button;
}
function atmosphere(a,loading='lazy') {
  const bg=a.background?'<picture class="gallery-background"><source media="(max-width:700px) and (orientation:portrait)" srcset="'+h(a.backgroundMobile||a.background)+'"><img loading="'+loading+'" decoding="async" src="'+h(a.background)+'" alt=""></picture>':'';
  const objects=(a.objects||[]).slice(0,3).map((o,i)=>'<span class="gallery-orbit" style="--x:'+Number(o.x)+'%;--y:'+Number(o.y)+'%;--w:'+Number(o.width)+'%;--mx:'+Number(o.xMobile??o.x)+'%;--my:'+Number(o.yMobile??o.y)+'%;--mw:'+Number(o.widthMobile??o.width)+'%;--rotate:'+Number(o.rotate||0)+'deg;--delay:-'+i*2.1+'s"><img src="'+h(o.image)+'" loading="'+loading+'" decoding="async" alt=""></span>').join('');
  return bg+objects;
}
function ctaText(p) {
  if(p.available===false || p.stock===0)return 'Agotado';
  const group=p.variantGroups?.[0]?.label||'';
  if(/sabor/i.test(group))return 'Elegir sabor';
  if(/top+ing/i.test(group))return 'Elegir topping';
  return 'Agregar al carrito';
}
function tile(p,a) {
  return '<div class="gallery-slide" data-sku="'+h(p.id)+'"><div class="gallery-solid"><div class="gallery-media">'+
    '<img class="gallery-portrait" loading="lazy" draggable="false" decoding="async" src="'+h(a.imageSmall||a.image)+'" alt=""><a class="gallery-open js-only" href="'+h(p.sourceUrl)+'" data-detail="'+h(p.id)+'" aria-label="Ver detalle de '+h(a.name)+'" draggable="false" tabindex="-1"></a></div></div>'+
    '<a class="gallery-basic" href="'+h(p.sourceUrl)+'">'+h(a.name)+' · '+h(money(p.price))+'</a></div>';
}
function gallerySection(family,ps,art) {
  const p=ps[0],a=artFor(p,art);
  return '<section class="product-gallery" id="'+family.id+'" aria-labelledby="'+family.id+'-heading" style="'+sceneVars(a)+'">'+
    '<div class="gallery-atmosphere" aria-hidden="true"><div class="gallery-environment">'+atmosphere(a)+'</div></div>'+
    '<div class="gallery-top"><h3 id="'+family.id+'-heading">'+h(family.name)+'</h3><span class="gallery-index" aria-hidden="true"><b>'+ordinal(1)+'</b> / '+ordinal(ps.length)+'</span></div>'+
    '<div class="gallery-rail" role="region" aria-roledescription="carrusel" aria-label="'+h(family.name)+'. Desplázate horizontalmente para cambiar de producto." tabindex="0">'+ps.map(p=>tile(p,artFor(p,art))).join('')+'</div>'+
    '<div class="gallery-footer"><div class="gallery-info"><div class="gallery-kicker"><p class="gallery-kind">'+h(a.eyebrow)+'</p><a class="gallery-ingredients" data-inspect="'+h(p.id)+'" href="'+h(p.sourceUrl)+'">Ver ingredientes</a></div><h4 class="gallery-name">'+h(a.name)+'</h4></div>'+
    '<div class="gallery-order"><p class="gallery-price"><b>'+h(money(p.price))+'</b> <span>COP</span></p><a class="gallery-choose" data-add="'+h(p.id)+'" href="'+h(p.sourceUrl)+'">'+icon('cart')+'<span>'+h(ctaText(p))+'</span></a></div>'+
    '<div class="gallery-guide" aria-hidden="true"><span class="gallery-meter"><i></i></span>'+icon('swipe','scroll-icon')+'<span>Desliza para explorar</span></div></div>'+
    '<p class="sr gallery-live" aria-live="polite" aria-atomic="true"></p></section>';
}
export function galleryMarkup(products,art={}) {
  return families.map(f=>{
    const items=products.filter(p=>galleryFamily(p)===f.id);
    return items.length?gallerySection(f,items,art):'';
  }).join('');
}

function mountGallery(section,products,art,remember) {
  const rail=section.querySelector('.gallery-rail'),live=section.querySelector('.gallery-live');
  const originals=Array.from(rail.children),count=originals.length,lead=count>1?1:0;
  if(count>1) {
    const clone=el=>{const node=el.cloneNode(true);node.dataset.duplicate='';node.setAttribute('aria-hidden','true');return node;};
    rail.prepend(clone(originals.at(-1)));rail.append(clone(originals[0]));
  }
  const slides=[...rail.children],solids=slides.map(el=>el.querySelector('.gallery-solid'));
  const links=slides.map(el=>el.querySelector('.gallery-open'));
  const items=new Map(products.map(p=>[p.id,p])),backgrounds=new Map(),portraits=new Map();
  const controller=new AbortController(),listen={signal:controller.signal},passive={...listen,passive:true};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),compact=matchMedia('(max-width:700px)');
  const bar=document.querySelector('#topbar'),backdrop=section.querySelector('.gallery-atmosphere');
  const bits=Object.fromEntries(['name','kind','price','index','choose','ingredients','meter','guide'].map(k=>[k,section.querySelector('.gallery-'+k)]));
  const host=document.createElement('span');host.className='gallery-model';host.inert=true;host.setAttribute('aria-hidden','true');
  const horizontal=wheelGesture({filterMomentum:true}),motion=scrollMotion(()=>rail.scrollLeft,x=>{rail.scrollLeft=x;});
  let index=-1,slot=-1,near=false,visible=false,dead=false,updatedProduct,currentArt;
  let model=null,modelKey='',modelTimer=0,ticket=0,yaw=0,pitch=0;
  let scrollFrame=0,settleTimer=0,step=0,origin=0,railWidth=0,targetSlot=null;
  let gesture=null,blockClick=false,pointer=null,pointerFrame=0,orbits=[];
  const actual=i=>(i-lead+count)%count;
  const centered=i=>origin+i*step;
  const sceneAt=i=>artFor(items.get(slides[i].dataset.sku),art);
  const saveData=()=>Boolean(navigator.connection?.saveData);
  slides.forEach(el=>el.setAttribute('aria-hidden','true'));

  function detachModel(dispose=false) {
    ++ticket;clearTimeout(modelTimer);host.remove();yaw=pitch=0;
    if(dispose){model?.destroy();model=null;modelKey='';}
  }
  function scheduleModel() {
    clearTimeout(modelTimer);
    if(!visible || slot<0 || targetSlot!==null || gesture?.dragging || document.hidden || saveData() || document.querySelector('dialog[open]'))return;
    const media=slides[slot].querySelector('.gallery-media'),a=currentArt,version=++ticket;
    if(!a.model || host.parentElement===media)return;
    modelTimer=setTimeout(async()=>{
      try{
        const {mountViewer}=await import('/showcase/viewer.js');
        if(dead || version!==ticket)return;
        const edge=Math.max(media.clientWidth,media.clientHeight)*Math.min(devicePixelRatio||1,2);
        const photo=edge>1440 && a.image4k?a.image4k:a.image;
        const key=a.model+'|'+photo;
        const view={...a,image:photo,texture:photo,displayName:a.name};
        if(model && modelKey!==key)model.display(view);
        media.append(host);
        if(!model)model=mountViewer(host,view,{cyclePieces:false});
        else model.reset();
        modelKey=key;
      } catch { /* The product photograph stays in the slide. */ }
    },65);
  }
  function warmNearby() {
    if(!near || slot<0 || saveData() || document.hidden)return;
    // A neighbor is already decoded when the wheel or a finger brings it to the center.
    for(const i of new Set([slot,slot-1,slot+1])) {
      if(!slides[i])continue;
      const a=sceneAt(i),photo=slides[i].querySelector('.gallery-portrait');
      photo.loading='eager';
      if(a.image && photo.getAttribute('src')!==a.image && photo.dataset.upgrade!==a.image){
        const src=a.image;photo.dataset.upgrade=src;
        if(!portraits.has(src)){
          const img=new Image();img.decoding='async';img.fetchPriority=i===slot?'auto':'low';img.src=src;
          portraits.set(src,img);if(portraits.size>5)portraits.delete(portraits.keys().next().value);
        }
        const next=portraits.get(src);
        // Leave the lightweight thumbnail on screen until the sharper photo is ready.
        next.decode().then(()=>{if(!dead && photo.dataset.upgrade===src)photo.src=src;},()=>{
          if(portraits.get(src)===next)portraits.delete(src);
          delete photo.dataset.upgrade;
        });
      }
      if(i===slot)continue;
      const src=compact.matches && a.backgroundMobile?a.backgroundMobile:a.background;
      if(!src || backgrounds.has(src))continue;
      const img=new Image();img.decoding='async';img.fetchPriority='low';img.src=src;
      img.decode?.().catch(()=>{});backgrounds.set(src,img);
      if(backgrounds.size>4)backgrounds.delete(backgrounds.keys().next().value);
    }
  }
  function renderBackdrop(a,first) {
    if(!first) {
      const previous=backdrop.lastElementChild,layer=document.createElement('div');
      for(const other of [...backdrop.children])if(other!==previous)other.remove();
      layer.className='gallery-environment';layer.style.backgroundColor=a.tone;
      layer.innerHTML=atmosphere(a,near?'eager':'lazy');backdrop.append(layer);
      if(previous && !reduced.matches && visible && layer.animate){
        // Start with the new color immediately, even while its photograph is decoding.
        layer.animate([{opacity:.55},{opacity:1}],{duration:125,easing:'ease-out'}).finished.then(()=>previous.remove(),()=>previous.remove());
      } else previous?.remove();
    }
    orbits=[...backdrop.lastElementChild.querySelectorAll('.gallery-orbit')];
    if(pointer)queuePointer();
  }
  function updateHeader() {
    if(!visible && bar.dataset.gallery!==section.id)return;
    const rect=section.getBoundingClientRect(),y=bar.offsetHeight*.5;
    if(rect.top<=y && rect.bottom>y && currentArt){
      bar.dataset.gallery=section.id;bar.style.setProperty('--menu-ink',currentArt.ink);
    } else if(bar.dataset.gallery===section.id){delete bar.dataset.gallery;bar.style.removeProperty('--menu-ink');}
  }
  function select(i) {
    const p=items.get(originals[i].dataset.sku),changed=i!==index;
    if(!changed && updatedProduct===p)return;
    const first=index<0,a=artFor(p,art);index=i;updatedProduct=p;currentArt=a;section.dataset.product=p.slug;remember.set(section.id,p.id);
    bits.name.textContent=a.name;bits.kind.textContent=a.eyebrow;bits.price.querySelector('b').textContent=money(p.price);
    bits.index.querySelector('b').textContent=ordinal(i+1);
    bits.ingredients.dataset.inspect=p.id;bits.ingredients.href=p.sourceUrl;bits.choose.dataset.add=p.id;bits.choose.href=p.sourceUrl;
    bits.choose.setAttribute('aria-disabled',String(p.available===false || p.stock===0));bits.choose.querySelector('span').textContent=ctaText(p);
    bits.meter.style.setProperty('--progress',(i+1)/count*100+'%');bits.guide.hidden=count<2;
    if(changed){
      section.style.cssText=sceneVars(a);renderBackdrop(a,first && i===0);
      live.textContent=a.name+', '+money(p.price)+' pesos, '+(i+1)+' de '+count;updateHeader();
    }
  }
  function paint() {
    scrollFrame=0;if(!step)return;
    const position=(rail.scrollLeft-origin)/step;
    const next=Math.max(0,Math.min(slides.length-1,Math.round(position)));
    for(let i=0;i<slides.length;i++){
      const d=Math.abs(position-i),solid=solids[i];
      if(d>1.6){if(solid.style.opacity!=='0')solid.style.opacity='0';continue;}
      const k=Math.min(1,d);
      solid.style.opacity=String(Math.max(0,(1-.82*k)*(1-Math.max(0,d-1)*1.8)).toFixed(3));
      solid.style.transform='scale('+(1-.46*k).toFixed(4)+')';
    }
    if(next===slot)return;
    const focusFollow=slot>=0 && document.activeElement===links[slot];
    if(slot>=0){slides[slot].setAttribute('aria-hidden','true');links[slot].tabIndex=-1;}
    detachModel();
    slot=next;slides[slot].setAttribute('aria-hidden','false');links[slot].tabIndex=0;
    if(focusFollow)links[slot].focus({preventScroll:true});
    select(actual(slot));warmNearby();scheduleModel();
  }
  function settle() {
    if(gesture || targetSlot!==null || count<2 || !step)return;
    const n=Math.max(0,Math.min(slides.length-1,Math.round((rail.scrollLeft-origin)/step)));
    if(Math.abs(rail.scrollLeft-centered(n))>2)return;
    if(n===0 || n===slides.length-1){rail.scrollLeft=centered(n===0?count:lead);paint();}
    scheduleModel();
  }
  function cancelMotion() {motion.cancel();targetSlot=null;rail.classList.remove('seeking');}
  function stepTo(n) {
    if(count<2 || !step)return;
    n=Math.max(0,Math.min(slides.length-1,n));
    targetSlot=n;rail.classList.add('seeking');
    motion.to(centered(n),reduced.matches?0:165,()=>{
      targetSlot=null;rail.classList.remove('seeking');paint();settle();scheduleModel();
    });
  }
  function measure(){
    if(!rail.clientWidth || rail.clientWidth===railWidth)return;
    const initial=!railWidth;railWidth=rail.clientWidth;cancelMotion();
    const geometricCenter=i=>slides[i].offsetLeft-(railWidth-slides[i].offsetWidth)/2;
    origin=geometricCenter(0);step=slides.length>1?geometricCenter(1)-origin:railWidth;
    const saved=remember.get(section.id);
    const wanted=initial?Math.max(0,originals.findIndex(el=>el.dataset.sku===saved)):Math.max(0,index);
    rail.scrollLeft=centered(wanted+lead);paint();
  }

  section.addEventListener('wheel',e=>{
    if(count<2 || e.defaultPrevented || e.ctrlKey || e.metaKey)return;
    const dx=e.shiftKey?(e.deltaX||e.deltaY):e.deltaX;
    if(!dx || !e.shiftKey && Math.abs(dx)<=Math.abs(e.deltaY))return;
    e.preventDefault();
    const delta=dx*(e.deltaMode===1?16:e.deltaMode===2?railWidth:1);
    if(horizontal.read(delta,e.deltaMode,e.timeStamp)==='step')stepTo((targetSlot??slot)+Math.sign(delta));
  },{...listen,passive:false});
  rail.addEventListener('scroll',()=>{
    if(!scrollFrame)scrollFrame=requestAnimationFrame(paint);
    clearTimeout(settleTimer);settleTimer=setTimeout(settle,100);
  },passive);
  rail.addEventListener('scrollend',settle,passive);
  rail.addEventListener('keydown',e=>{
    if(e.altKey || e.ctrlKey || e.metaKey)return;
    const d={ArrowLeft:-1,ArrowRight:1}[e.key];if(!d)return;
    e.preventDefault();stepTo((targetSlot??slot)+d);
  },listen);
  rail.addEventListener('pointerdown',e=>{
    if(!e.isPrimary || e.button!==0)return;
    cancelMotion();blockClick=false;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:rail.scrollLeft,dragging:false,moved:false};
  },passive);
  rail.addEventListener('pointermove',e=>{
    if(!gesture || gesture.id!==e.pointerId)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))<7 && !gesture.dragging)return;
    gesture.moved=true;
    if(e.pointerType!=='mouse' || count<2 || !gesture.dragging && Math.abs(dy)>Math.abs(dx))return;
    if(!gesture.dragging){
      rail.classList.add('dragging');rail.setPointerCapture(e.pointerId);gesture.dragging=true;
    }
    rail.scrollLeft=gesture.left-dx;
  },passive);
  function release(e){
    if(!gesture || gesture.id!==e.pointerId)return;
    const held=gesture;gesture=null;blockClick=held.moved || e.type==='pointercancel';
    if(!held.dragging){settle();return;}
    rail.classList.remove('dragging');
    const delta=held.x-e.clientX,from=Math.round((held.left-origin)/step);
    const n=e.type==='pointercancel'||Math.abs(delta)<Math.min(48,step*.15)?Math.round((rail.scrollLeft-origin)/step):from+Math.sign(delta)*Math.max(1,Math.round(Math.abs(delta)/step));
    stepTo(n);
  }
  window.addEventListener('pointerup',release,passive);window.addEventListener('pointercancel',release,passive);
  rail.addEventListener('click',e=>{
    if(blockClick && e.detail){e.preventDefault();e.stopPropagation();blockClick=false;}
  },{...listen,capture:true});
  rail.addEventListener('dragstart',e=>e.preventDefault(),listen);

  function queuePointer(){if(!pointerFrame)pointerFrame=requestAnimationFrame(drawPointer);}
  function drawPointer(){
    pointerFrame=0;
    const rect=section.getBoundingClientRect(),small=compact.matches;
    const nx=pointer?(pointer.x-rect.left)/rect.width-.5:0,ny=pointer?(pointer.y-rect.top)/rect.height-.5:0;
    for(const [i,el] of orbits.entries()){
      const o=currentArt.objects[i],x=small?(o.xMobile??o.x):o.x,y=small?(o.yMobile??o.y):o.y;
      const dx=(nx+.5-x/100)*rect.width,dy=(ny+.5-y/100)*rect.height;
      const nearPointer=pointer?Math.max(0,1-Math.hypot(dx,dy)/Math.min(240,rect.width*.22)):0;
      const depth=i%2?.82:1.27,hand=i%2?1:-1;
      const tx=nx*70*depth+dx*.26*nearPointer,ty=ny*54*depth+(dy*.19-18)*nearPointer;
      el.style.setProperty('--orbit-x',tx.toFixed(1)+'px');el.style.setProperty('--orbit-y',ty.toFixed(1)+'px');
      el.style.setProperty('--orbit-roll',(nx*10*hand+nearPointer*hand*12).toFixed(1)+'deg');
      el.style.setProperty('--orbit-yaw',(nx*17+nearPointer*hand*13).toFixed(1)+'deg');
      el.style.setProperty('--orbit-scale',(1+nearPointer*.16).toFixed(3));
    }
    if(model && host.isConnected){
      const y=nx*21,p=ny*9;model.rotate(y-yaw,p-pitch);yaw=y;pitch=p;
    }
  }
  section.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||e.buttons||!visible||reduced.matches)return;
    pointer={x:e.clientX,y:e.clientY};queuePointer();
  },passive);
  section.addEventListener('pointerleave',()=>{if(pointer){pointer=null;queuePointer();}},passive);
  const nearby=new IntersectionObserver(([e])=>{near=e.isIntersecting;if(near)warmNearby();},{rootMargin:'320px'});
  nearby.observe(section);
  function refreshModel(){
    if(!visible || document.hidden || document.querySelector('dialog[open]'))detachModel(true);else scheduleModel();
  }
  const observer=new IntersectionObserver(([e])=>{
    visible=e.isIntersecting&&e.intersectionRatio>=.12;section.toggleAttribute('data-in-view',visible);
    refreshModel();updateHeader();
  },{threshold:[0,.12]});observer.observe(section);
  const dialogs=new MutationObserver(refreshModel);
  document.querySelectorAll('dialog').forEach(d=>dialogs.observe(d,{attributes:true,attributeFilter:['open']}));
  window.addEventListener('scroll',updateHeader,passive);document.addEventListener('visibilitychange',refreshModel,passive);
  const resize=new ResizeObserver(measure);resize.observe(rail);measure();
  return {refresh(ps){for(const p of ps)items.set(p.id,p);if(index>=0)select(index);},destroy(){
    dead=true;cancelMotion();detachModel(true);controller.abort();resize.disconnect();observer.disconnect();nearby.disconnect();dialogs.disconnect();
    clearTimeout(settleTimer);cancelAnimationFrame(scrollFrame);cancelAnimationFrame(pointerFrame);backgrounds.clear();portraits.clear();
    if(bar.dataset.gallery===section.id){delete bar.dataset.gallery;bar.style.removeProperty('--menu-ink');}
  }};
}

export function initGalleries(container,art) {
  const remember=new Map(),mounted=new Map();
  return products=>{
    for(const f of families) {
      const list=products.filter(p=>galleryFamily(p)===f.id),key=list.map(p=>p.id).join('|'),old=mounted.get(f.id);
      if(old && old.key===key) {old.view.refresh(list);continue;}
      old?.view.destroy();mounted.delete(f.id);
      let el=container.querySelector('#'+f.id);
      if(!list.length){el?.remove();continue;}
      if(!el || [...el.querySelectorAll('.gallery-slide')].map(n=>n.dataset.sku).join('|')!==key) {
        const template=document.createElement('template');template.innerHTML=gallerySection(f,list,art);
        const next=template.content.firstElementChild;
        if(el)el.replaceWith(next);else if(f===families[0])container.prepend(next);else container.append(next);
        el=next;
      }
      mounted.set(f.id,{key,view:mountGallery(el,list,art,remember)});
    }
  };
}
