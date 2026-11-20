import {escape as h,icon,money,productName} from './shared.mjs';

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
function atmosphere(a) {
  const bg=a.background?'<picture class="gallery-background"><source media="(max-width:700px) and (orientation:portrait)" srcset="'+h(a.backgroundMobile||a.background)+'"><img loading="lazy" decoding="async" src="'+h(a.background)+'" alt=""></picture>':'';
  const objects=(a.objects||[]).slice(0,3).map((o,i)=>'<span class="gallery-orbit" style="--x:'+Number(o.x)+'%;--y:'+Number(o.y)+'%;--w:'+Number(o.width)+'%;--mx:'+Number(o.xMobile??o.x)+'%;--my:'+Number(o.yMobile??o.y)+'%;--mw:'+Number(o.widthMobile??o.width)+'%;--rotate:'+Number(o.rotate||0)+'deg;--delay:-'+i*2.1+'s"><img src="'+h(o.image)+'" loading="lazy" decoding="async" alt=""></span>').join('');
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
    '<img class="gallery-portrait" loading="lazy" draggable="false" decoding="async" src="'+h(a.imageSmall||a.image)+'" alt=""><span class="gallery-model" aria-hidden="true" inert></span></div></div>'+
    '<a class="gallery-basic" href="'+h(p.sourceUrl)+'">'+h(a.name)+' · '+h(money(p.price))+'</a></div>';
}
function gallerySection(family,ps,art) {
  const p=ps[0],a=artFor(p,art);
  return '<section class="product-gallery" id="'+family.id+'" aria-labelledby="'+family.id+'-heading" style="'+sceneVars(a)+'">'+
    '<div class="gallery-atmosphere" aria-hidden="true">'+atmosphere(a)+'</div>'+
    '<div class="gallery-top"><h3 id="'+family.id+'-heading">'+h(family.name)+'</h3><span class="gallery-index" aria-hidden="true"><b>'+ordinal(1)+'</b> / '+ordinal(ps.length)+'</span></div>'+
    '<div class="gallery-rail" role="region" aria-roledescription="carrusel" aria-label="'+h(family.name)+'. Desplázate horizontalmente para cambiar de producto." tabindex="0">'+ps.map(p=>tile(p,artFor(p,art))).join('')+'</div>'+
    '<div class="gallery-footer"><div class="gallery-info"><div class="gallery-kicker"><p class="gallery-kind">'+h(a.eyebrow)+'</p><a class="gallery-ingredients" data-inspect="'+h(p.id)+'" href="'+h(p.sourceUrl)+'">Ver ingredientes</a></div><h4 class="gallery-name">'+h(a.name)+'</h4></div>'+
    '<div class="gallery-order"><p class="gallery-price"><b>'+h(money(p.price))+'</b> <span>COP</span></p><a class="gallery-choose" data-add="'+h(p.id)+'" href="'+h(p.sourceUrl)+'">'+icon('bag')+'<span>'+h(ctaText(p))+'</span></a></div>'+
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
  const originals=Array.from(rail.children);
  if(originals.length>1) {
    const clone=el=>{const node=el.cloneNode(true);node.dataset.duplicate='';node.inert=true;node.setAttribute('aria-hidden','true');return node;};
    rail.prepend(clone(originals.at(-1)));rail.append(clone(originals[0]));
  }
  const slides=[...rail.children],count=originals.length,lead=count>1?1:0;
  const items=new Map(products.map(p=>[p.id,p]));
  const signal=new AbortController(),listen={signal:signal.signal},passive={...listen,passive:true};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const bar=document.querySelector('#topbar'), backdrop=section.querySelector('.gallery-atmosphere');
  const bits=Object.fromEntries(['name','kind','price','index','choose','ingredients','meter','guide'].map(k=>[k,section.querySelector('.gallery-'+k)]));
  let index=-1,slot=-1,near=false,visible=false,model=null,modelTicket=0,modelTimer=0,modelSlot=null,yaw=0,pitch=0,dead=false;
  let scrollFrame=0,snapTimer=0,step=0,drag=null,initial=true,backVersion=0,resizeWidth=0,updatedProduct;
  const actual=i=>(i-lead+count)%count, center=i=>slides[i].offsetLeft-(rail.clientWidth-slides[i].offsetWidth)/2;
  function releaseModel() {
    ++modelTicket;clearTimeout(modelTimer);model?.destroy();model=null;modelSlot=null;yaw=pitch=0;
  }
  function requestModel() {
    releaseModel();
    if(!visible || document.hidden || document.querySelector('dialog[open]') || navigator.connection?.saveData || slot<0) return;
    const tile=slides[slot],p=items.get(tile.dataset.sku),a=artFor(p,art),ticket=modelTicket;
    if(!a.model)return;
    modelTimer=setTimeout(async()=>{
      try {
        const {mountViewer}=await import('/showcase/viewer.js');
        if(dead || ticket!==modelTicket) return;
        const host=tile.querySelector('.gallery-model'),box=host.getBoundingClientRect();
        const edge=Math.max(box.width,box.height)*Math.min(devicePixelRatio||1,2)*.89;
        const photo=edge>1380 && a.image4k?a.image4k:a.image;
        model=mountViewer(host,{...a,image:photo,texture:photo,displayName:a.name},{cyclePieces:false});modelSlot=tile;
        if(photo!==a.image)tile.querySelector('.gallery-portrait').src=photo;
      } catch { /* The product photograph remains visible. */ }
    },160);
  }
  function renderBackdrop(a) {
    const old=backdrop.firstElementChild?.closest('.gallery-environment'), layer=document.createElement('div');
    const token=++backVersion;
    layer.className='gallery-environment';layer.style.backgroundColor=a.tone;layer.innerHTML=atmosphere(a);
    if(!old) backdrop.replaceChildren(layer);else {
      for(const node of [...backdrop.children]) if(node!==old)node.remove();
      backdrop.append(layer);
      if(reduced.matches || !layer.animate){old.remove();return;}
      const img=layer.querySelector('picture img');
      layer.style.opacity='0';
      const enter=()=>{
        if(token!==backVersion || dead)return;
        layer.style.opacity='';
        const fade=layer.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
        fade.finished.then(()=>{if(token===backVersion)old.remove();},()=>{});
      };
      if(img && !img.complete) img.decode().then(enter,enter);else enter();
    }
  }
  function updateHeader() {
    const r=section.getBoundingClientRect(),y=bar.offsetHeight*.5;
    if(r.top<=y && r.bottom>y && index>=0) {
      bar.dataset.gallery=section.id;bar.style.setProperty('--menu-ink',artFor(items.get(originals[index].dataset.sku),art).ink);
    } else if(bar.dataset.gallery===section.id) {delete bar.dataset.gallery;bar.style.removeProperty('--menu-ink');}
  }
  function select(i) {
    const p=items.get(originals[i].dataset.sku),a=artFor(p,art),changed=i!==index;
    if(!changed && updatedProduct===p)return;
    index=i;updatedProduct=p;section.dataset.product=p.slug;remember.set(section.id,p.id);
    bits.name.textContent=a.name;bits.kind.textContent=a.eyebrow;
    bits.price.querySelector('b').textContent=money(p.price);
    bits.index.querySelector('b').textContent=ordinal(i+1);
    bits.ingredients.dataset.inspect=p.id;bits.ingredients.href=p.sourceUrl;
    bits.choose.dataset.add=p.id;bits.choose.href=p.sourceUrl;
    bits.choose.setAttribute('aria-disabled',String(p.available===false || p.stock===0));
    bits.choose.querySelector('span').textContent=ctaText(p);
    bits.meter.style.setProperty('--progress',(i+1)/count*100+'%');
    bits.guide.hidden=count<2;
    if(changed) {
      section.style.cssText=sceneVars(a);renderBackdrop(a);
      live.textContent=a.name+', '+money(p.price)+' pesos, '+(i+1)+' de '+count;
      updateHeader();
    }
  }
  function paint() {
    scrollFrame=0;if(!step)return;
    const position=rail.scrollLeft/step;
    const next=Math.max(0,Math.min(slides.length-1,Math.round(position)));
    for(let i=0;i<slides.length;i++) {
      const d=Math.abs(position-i),solid=slides[i].firstElementChild;
      if(d>1.7 && solid.style.opacity==='0')continue;
      const k=Math.min(1,d),opacity=d>1.55?0:Math.max(0,(1-.82*k)*(1-Math.max(0,d-1)*1.8));
      solid.style.opacity=String(Math.round(opacity*1000)/1000);
      solid.style.transform='scale('+(1-.46*k).toFixed(4)+')';
      slides[i].setAttribute('aria-hidden',String(i!==next));
    }
    select(actual(next));
    if(next!==slot) {
      slot=next;
      const tile=slides[slot],p=items.get(tile.dataset.sku),a=artFor(p,art);
      if(near && !navigator.connection?.saveData)tile.querySelector('.gallery-portrait').src=a.image||a.imageSmall;
      requestModel();
    }
  }
  function centerIndex(i,behavior='instant'){rail.scrollTo({left:center(i),behavior});}
  function settle() {
    if(drag || count<2 || !step)return;
    const n=Math.max(0,Math.min(slides.length-1,Math.round(rail.scrollLeft/step)));
    if(Math.abs(rail.scrollLeft-center(n))>2)return;
    if(n===0)centerIndex(count);else if(n===slides.length-1)centerIndex(lead);
  }
  function measure() {
    const width=rail.clientWidth;if(!width || width===resizeWidth && !initial)return;
    resizeWidth=width;
    step=slides.length>1?center(1)-center(0):Math.max(1,width);
    const saved=remember.get(section.id);
    const wanted=initial?Math.max(0,originals.findIndex(el=>el.dataset.sku===saved)):Math.max(0,index);
    initial=false;centerIndex(wanted+lead);paint();
  }
  function wheel(event) {
    if(event.ctrlKey || event.metaKey)return;
    // Native horizontal wheel and touch remain in the rail. Shift + an
    // ordinary mouse wheel provides the same horizontal gesture on Windows.
    if(event.shiftKey && !event.deltaX && event.deltaY) {
      event.preventDefault();rail.scrollBy({left:event.deltaY*(event.deltaMode===1?16:1),behavior:'instant'});
    }
  }
  rail.addEventListener('wheel',wheel,{...listen,passive:false});
  rail.addEventListener('scroll',()=>{
    if(!scrollFrame)scrollFrame=requestAnimationFrame(paint);
    clearTimeout(snapTimer);snapTimer=setTimeout(settle,140);
  },passive);
  rail.addEventListener('scrollend',settle,passive);
  rail.addEventListener('keydown',e=>{
    if(count<2 || e.altKey || e.ctrlKey || e.metaKey)return;
    const d={ArrowLeft:-1,ArrowRight:1}[e.key];if(!d)return;
    e.preventDefault();centerIndex(Math.max(0,Math.min(slides.length-1,slot+d)),reduced.matches?'instant':'smooth');
  },listen);
  rail.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse' || e.button!==0 || count<2)return;
    drag={id:e.pointerId,x:e.clientX,left:rail.scrollLeft};rail.setPointerCapture(e.pointerId);
    rail.classList.add('dragging');
  },listen);
  rail.addEventListener('pointermove',e=>{
    if(drag && e.pointerId===drag.id){rail.scrollLeft=drag.left+drag.x-e.clientX;return;}
    if(e.pointerType!=='mouse' || reduced.matches || !model || !modelSlot)return;
    const box=rail.getBoundingClientRect(),nx=(e.clientX-box.left)/box.width-.5,ny=(e.clientY-box.top)/box.height-.5;
    const y=nx*20,p=ny*8;
    model.rotate(y-yaw,p-pitch);yaw=y;pitch=p;
    section.style.setProperty('--parallax-x',(nx*19)+'px');section.style.setProperty('--parallax-y',(ny*11)+'px');
  },passive);
  function release(e) {
    if(!drag || drag.id!==e.pointerId)return;
    const delta=drag.x-e.clientX,start=drag.left;
    const n=Math.abs(delta)>Math.min(step*.16,50)?Math.sign(delta)*Math.max(1,Math.round(Math.abs(delta)/step))+Math.round(start/step):Math.round(rail.scrollLeft/step);
    drag=null;rail.classList.remove('dragging');
    centerIndex(Math.max(0,Math.min(slides.length-1,n)),reduced.matches?'instant':'smooth');
  }
  rail.addEventListener('pointerup',release,listen);rail.addEventListener('pointercancel',release,listen);
  rail.addEventListener('pointerleave',()=>{model?.reset();yaw=pitch=0;section.style.removeProperty('--parallax-x');section.style.removeProperty('--parallax-y');},passive);
  const nearby=new IntersectionObserver(([e])=>{
    near=e.isIntersecting;
    if(near && slot>=0 && !navigator.connection?.saveData) {
      const current=slides[slot];current.querySelector('.gallery-portrait').src=artFor(items.get(current.dataset.sku),art).image;
    }
  },{rootMargin:'300px'});nearby.observe(section);
  const observer=new IntersectionObserver(([e])=>{
    visible=e.isIntersecting;requestModel();updateHeader();
  },{threshold:.16});observer.observe(rail);
  const dialogs=new MutationObserver(records=>{if(records.some(r=>r.target.tagName==='DIALOG'))requestModel();});dialogs.observe(document.body,{attributes:true,subtree:true,attributeFilter:['open']});
  window.addEventListener('scroll',updateHeader,passive);document.addEventListener('visibilitychange',requestModel,passive);
  const resize=new ResizeObserver(measure);resize.observe(rail);
  measure();
  return {refresh(ps){for(const p of ps)items.set(p.id,p);if(index>=0) select(index);},destroy(){
    dead=true;releaseModel();signal.abort();resize.disconnect();observer.disconnect();nearby.disconnect();dialogs.disconnect();
    if(bar.dataset.gallery===section.id){delete bar.dataset.gallery;bar.style.removeProperty('--menu-ink');}
    clearTimeout(snapTimer);cancelAnimationFrame(scrollFrame);
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
