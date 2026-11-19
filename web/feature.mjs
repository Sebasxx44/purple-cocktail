import {heroCopy, stageArt, findArt, titleFor, backdrop} from './render.mjs';
import {scenes} from './scenes.mjs';
import {mountIngredientMotion} from './ingredients-motion.mjs';
import {wheelGesture} from './wheel-gesture.mjs';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function initFeature(featureIds, productById, art) {
  const board=document.querySelector('#destacados'), screen=board.querySelector('.showcase-panel');
  const panel=document.querySelector('#scene-art'), copy=document.querySelector('#scene-copy');
  const header=document.querySelector('#topbar'), stack=screen.querySelector('.backdrop-stack');
  const reelSection=document.querySelector('#reels'), navLinks=Array.from(header.querySelectorAll('.nav-links a'));
  const live=document.querySelector('#scene-live'), theme=document.querySelector('meta[name="theme-color"]');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const portrait=matchMedia('(max-width:700px) and (orientation:portrait)');
  const last=featureIds.length-1, stages=new Map(), backgrounds=new Map();
  const productAt=index=>productById(featureIds[index]);
  let current=0, inView=true, origin=0, step=240, headerHeight=0;
  let viewer=null, modelTimer=0, modelVersion=0, warmTimer=0, yaw=0;
  let ingredientMotion=mountIngredientMotion(panel,findArt(art,productAt(0)));

  function decodePhoto(container) {
    const photo=container.querySelector('.product-portrait');
    if (!photo) return;
    const ready=()=>{if(photo.naturalWidth) photo.classList.add('is-ready');};
    if (photo.decode) photo.decode().then(ready,()=>photo.addEventListener('load',ready,{once:true}));
    else if (photo.complete) ready();
    else photo.addEventListener('load',ready,{once:true});
  }
  decodePhoto(panel);
  function stageFor(index) {
    if (!stages.has(index)) {
      const container=document.createElement('div');
      container.innerHTML=stageArt(productAt(index),art);
      decodePhoto(container);
      stages.set(index,container);
    }
    return stages.get(index);
  }
  function warmNeighbors() {
    clearTimeout(warmTimer);
    if (!inView || navigator.connection?.saveData) return;
    warmTimer=setTimeout(()=>{
      for(const index of [current+1,current-1]) {
        if(index<0 || index>last) continue;
        stageFor(index);
        const slug=productAt(index).slug;
        const src='/showcase/backgrounds/'+slug+(portrait.matches?'-mobile.webp':'-wide.webp');
        if (!backgrounds.has(src)) {
          const img=new Image();
          img.fetchPriority='low'; img.src=src;
          img.decode?.().catch(()=>{});
          backgrounds.set(src,img);
        }
      }
    },45);
  }

  function releaseViewer() {
    ++modelVersion; clearTimeout(modelTimer);
    viewer?.destroy(); viewer=null; yaw=0;
    panel.querySelector('.hero-model')?.remove();
  }
  function scheduleViewer() {
    releaseViewer();
    if (!inView || navigator.connection?.saveData || reduce.matches) return;
    const asset=findArt(art,productAt(current)), token=modelVersion;
    if (!asset.model) return;
    // Leave input and image decoding free while the visitor moves through the showcase.
    modelTimer=setTimeout(async()=>{
      try {
        const {mountViewer}=await import('/showcase/viewer.js');
        if (token!==modelVersion || !inView) return;
        const node=document.createElement('div');
        node.className='hero-model'; node.inert=true; node.setAttribute('aria-hidden','true');
        const product=panel.querySelector('.stage-product');
        product.append(node);
        viewer=mountViewer(node,{...asset,image:product.querySelector('.product-portrait').currentSrc || asset.imageSmall});
      } catch { /* The responsive product photo is always available. */ }
    },850);
  }
  function show(index) {
    if (current===index) return;
    const p=productAt(index), s=scenes[p.slug], direction=Math.sign(index-current);
    const active=document.activeElement;
    const restore=copy.contains(active)?active.closest('button')?.getAttributeNames().find(name=>name==='data-add'||name==='data-inspect'):null;
    releaseViewer();
    ingredientMotion.destroy();
    const previous=stages.get(current) || document.createElement('div');
    previous.replaceChildren(...panel.childNodes);
    stages.set(current,previous);
    current=index;
    const next=stageFor(current);
    panel.replaceChildren(...next.childNodes);
    for (const key of ['tone','light','accent','card']) board.style.setProperty('--'+key,s[key]);
    board.style.setProperty('--scene-ink',s.ink); board.style.setProperty('--buy-color',s.button); board.style.setProperty('--hero-scale',s.scale);
    header.style.setProperty('--nav-ink',s.ink);
    stack.innerHTML=backdrop(p.slug);
    copy.innerHTML=heroCopy(p);
    if (restore) copy.querySelector('['+restore+']')?.focus({preventScroll:true});
    theme.content=s.tone;
    panel.setAttribute('aria-label','Fotografía y piezas de '+titleFor(p));
    live.textContent=titleFor(p)+', '+(current+1)+' de '+featureIds.length;
    ingredientMotion=mountIngredientMotion(panel,findArt(art,p));
    ingredientMotion.setVisible(inView);
    if (!reduce.matches && inView) {
      panel.getAnimations().forEach(animation=>animation.cancel());
      panel.animate([{transform:'translateX('+direction*10+'px)'},{transform:'translateX(0)'}],{duration:135,easing:'ease-out'});
    }
    warmNeighbors(); scheduleViewer();
  }

  const offset=()=>window.scrollY-origin;
  const pinned=()=>offset()>=-1 && offset()<=last*step+1;
  function go(index) {
    index=clamp(index,0,last);
    show(index);
    window.scrollTo({top:origin+index*step,behavior:'instant'});
  }
  let scrollFrame=0, currentSection='',hashTarget=null,hashTimer=0;
  function releaseHash() {clearTimeout(hashTimer);hashTarget=null;}
  function followScroll() {
    scrollFrame=0;
    if(hashTarget!==null && Math.abs(offset()-hashTarget*step)>1) {
      if(!document.querySelector('dialog[open]')) window.scrollTo({top:origin+hashTarget*step,behavior:'instant'});
      return;
    }
    const bottom=board.getBoundingClientRect().bottom;
    if (bottom>0) show(clamp(Math.round(offset()/step),0,last));
    setGestureListeners(bottom>=-innerHeight);
    const onHero=bottom>headerHeight+1;
    const onReels=!onHero && reelSection && reelSection.getBoundingClientRect().top<=headerHeight+1;
    const active=onHero?'#destacados':onReels?'#reels':'#carta';
    if (active===currentSection) return;
    currentSection=active;
    document.documentElement.classList.toggle('in-showcase',onHero);
    header.classList.toggle('on-menu',!onHero);
    for(const link of navLinks) {
      const here=link.hash===active;
      link.classList.toggle('is-here',here);
      if(here) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
    }
  }
  function measure() {
    const oldStep=step, wasPinned=pinned();
    origin=scrollY+board.getBoundingClientRect().top;
    headerHeight=header.offsetHeight;
    step=clamp(Math.round(window.innerHeight*.36),170,350);
    board.style.setProperty('--scroll-travel',(last*step)+'px');
    board.style.setProperty('--panel-height',screen.offsetHeight+'px');
    if (wasPinned && oldStep!==step && current) go(current);
    followScroll();
  }
  window.addEventListener('scroll',()=>{if (!scrollFrame) scrollFrame=requestAnimationFrame(followScroll);},{passive:true});
  new ResizeObserver(measure).observe(screen);
  window.addEventListener('resize',measure,{passive:true});

  const wheel=wheelGesture();
  let ownsWheel=false;
  function onWheel(event) {
    if(event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
    releaseHash();
    const factor=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
    const dx=event.deltaX*factor, dy=event.deltaY*factor;
    const delta=Math.abs(dx)>Math.abs(dy)*1.35?dx:dy;
    if (!delta) return;
    if (!pinned()) {
      // A fast upward wheel that reaches the showcase first lands on its last product.
      const beyond=offset()-last*step;
      if (dy<0 && beyond>1 && beyond<=-dy+1 && window.scrollY<=board.offsetHeight+innerHeight) {
        event.preventDefault(); wheel.reset(); wheel.read(delta,event.deltaMode,event.timeStamp);
        ownsWheel=true; go(last);
      }
      return;
    }
    const signal=wheel.read(delta,event.deltaMode,event.timeStamp), next=current+Math.sign(delta);
    const canStep=next>=0 && next<=last;
    if (signal==='step') {
      ownsWheel=canStep;
      if (canStep) {event.preventDefault(); go(next);}
    } else if (ownsWheel || (signal==='pending' && canStep)) event.preventDefault();
  }

  let touch=null;
  window.addEventListener('touchstart',event=>{
    const eligible=event.touches.length===1 && pinned() && (board.contains(event.target)||header.contains(event.target)) && !document.querySelector('dialog[open]');
    touch=eligible?{x:event.touches[0].clientX,y:event.touches[0].clientY,state:'new'}:null;
  },{passive:true,capture:true});
  function onTouchMove(event) {
    if (!touch || event.touches.length!==1 || touch.state==='native') return;
    if (touch.state==='stepped') {if (event.cancelable) event.preventDefault(); return;}
    const dx=touch.x-event.touches[0].clientX, dy=touch.y-event.touches[0].clientY;
    const distance=Math.abs(dx)>Math.abs(dy)*1.15?dx:dy;
    if (Math.abs(distance)<2) return;
    releaseHash();
    const next=current+Math.sign(distance);
    if (next<0 || next>last) {touch.state='native';return;}
    if (event.cancelable) event.preventDefault();
    if (Math.abs(distance)>=20) {touch.state='stepped';go(next);}
  }
  let listening=false;
  const inputOptions={passive:false,capture:true};
  function setGestureListeners(nearShowcase) {
    if (listening===nearShowcase) return;
    listening=nearShowcase;
    if (listening) {
      wheel.reset(); ownsWheel=false;
      window.addEventListener('wheel',onWheel,inputOptions);
      window.addEventListener('touchmove',onTouchMove,inputOptions);
    } else {
      window.removeEventListener('wheel',onWheel,inputOptions);
      window.removeEventListener('touchmove',onTouchMove,inputOptions);
    }
  }
  const finishTouch=()=>{touch=null;};
  window.addEventListener('touchend',finishTouch,{passive:true});
  window.addEventListener('touchcancel',finishTouch,{passive:true});

  document.addEventListener('keydown',event=>{
    if (!pinned() || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]') || event.target.closest('input,select,textarea,[contenteditable=true]')) return;
    if (['PageUp','PageDown','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Home','End','Tab'].includes(event.key)) releaseHash();
    let delta=({ArrowLeft:-1,ArrowRight:1,PageUp:-1,PageDown:1,ArrowUp:-1,ArrowDown:1})[event.key];
    if (event.key===' ' && !event.target.closest('a,button')) delta=event.shiftKey?-1:1;
    if(delta && current+delta>=0 && current+delta<=last) {event.preventDefault();go(current+delta);}
  });
  panel.addEventListener('pointermove',event=>{
    if (!viewer || reduce.matches || event.pointerType!=='mouse' || !inView) return;
    const rect=panel.getBoundingClientRect(), next=((event.clientX-rect.left)/rect.width-.5)*15;
    viewer.rotate(next-yaw);yaw=next;
  });
  panel.addEventListener('pointerleave',()=>{viewer?.reset();yaw=0;});
  new IntersectionObserver(([entry])=>{
    if(entry.isIntersecting!==inView) {
      inView=entry.isIntersecting; ingredientMotion.setVisible(inView); warmNeighbors(); scheduleViewer();
    }
  }).observe(screen);
  reduce.addEventListener('change',scheduleViewer);
  function followHash() {
    releaseHash();
    if (['#carta','#granizados','#hamburguesas','#reels'].includes(location.hash) || location.hash.startsWith('#reel-')) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({behavior:'instant'}); return;
    }
    const index=location.hash==='#destacados'?0:featureIds.findIndex((_,i)=>'#'+productAt(i).slug===location.hash);
    if(index<0) return;
    // Mobile browsers can restore a just-closed dialog's offscreen trigger
    // during the same navigation. Keep the requested product until it settles.
    hashTarget=index;
    go(index);
    if (document.activeElement!==document.body && !board.contains(document.activeElement)) {
      const heading=document.querySelector('#scene-title');
      heading.tabIndex=-1;heading.focus({preventScroll:true});
    }
    hashTimer=setTimeout(releaseHash,1200);
    followScroll();
  }
  window.addEventListener('hashchange',followHash);
  measure(); followHash(); warmNeighbors(); scheduleViewer();
  return {refresh(){
    const next=document.createElement('template'); next.innerHTML=heroCopy(productAt(current));
    copy.querySelector('.hero-price strong').textContent=next.content.querySelector('.hero-price strong').textContent;
    const button=copy.querySelector('[data-add]'), fresh=next.content.querySelector('[data-add]');
    button.disabled=fresh.disabled; button.innerHTML=fresh.innerHTML;
  }};
}
