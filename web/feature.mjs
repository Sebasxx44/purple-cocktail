import {heroCopy, stageArt, findArt, titleFor, backdrop} from './render.mjs';
import {scenes} from './scenes.mjs';

export function initFeature(featureIds, productById, art) {
  const board=document.querySelector('#destacados'), screen=board.querySelector('.showcase-panel');
  const panel=document.querySelector('#scene-art'),copy=document.querySelector('#scene-copy'),header=document.querySelector('#topbar');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const last=featureIds.length-1;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const currentProduct=()=>productById(featureIds[current]);
  let current=0, position=0, frame=0, step=240, inView=true;
  let viewer=null, version=0, timer=0, yaw=0;
  function attachViewer() {
    clearTimeout(timer);
    const token=++version;
    viewer?.destroy();viewer=null;yaw=0;
    panel.querySelector('.hero-model')?.remove();
    if (!inView || navigator.connection?.saveData || reduce.matches) return;
    const a=findArt(art,currentProduct());
    if (!a.image || !a.model) return;
    timer=setTimeout(async()=>{
      try {
        const {mountViewer}=await import('/showcase/viewer.js');
        if (token!==version || !inView) return;
        const node=document.createElement('div');
        node.className='hero-model';node.inert=true;node.setAttribute('aria-hidden','true');
        panel.querySelector('.stage-product').append(node);
        viewer=mountViewer(node,a);
      } catch { /* The photograph is already visible. */ }
    },480);
  }
  function draw(now,previous) {
    const elapsed=clamp(now-previous,1,55);
    position=reduce.matches?current:position+(current-position)*(1-Math.exp(-elapsed/82));
    const distance=clamp(position-current,-1,1);
    if (Math.abs(distance)<.009) {
      position=current;frame=0;
      for (const el of [panel,copy]) {el.style.removeProperty('transform');el.style.removeProperty('opacity');}
      return;
    }
    panel.style.transform='translateX('+(-distance*42)+'px)';copy.style.transform='translateX('+(-distance*16)+'px)';
    panel.style.opacity=String(1-Math.abs(distance)*.67);copy.style.opacity=String(1-Math.abs(distance)*.5);
    frame=requestAnimationFrame(next=>draw(next,now));
  }
  function show(index) {
    if (index===current) return;
    position=index-Math.sign(index-current);current=index;
    const p=currentProduct(),s=scenes[p.slug];
    for (const key of ['tone','light','accent','card']) board.style.setProperty('--'+key,s[key]);
    board.style.setProperty('--scene-ink',s.ink);board.style.setProperty('--buy-color',s.button);board.style.setProperty('--hero-scale',s.scale);
    header.style.setProperty('--nav-ink',s.ink);
    const stack=screen.querySelector('.backdrop-stack');
    while(stack.children.length>1) stack.firstElementChild.remove();
    const previous=stack.firstElementChild;
    stack.insertAdjacentHTML('beforeend',backdrop(p.slug));
    const layer=stack.lastElementChild;
    if (!reduce.matches && layer.animate) {
      layer.animate([{opacity:0},{opacity:1}],{duration:270,easing:'ease-out'}).finished.then(()=>previous?.remove()).catch(()=>previous?.remove());
    } else previous?.remove();
    document.querySelector('meta[name="theme-color"]').content=s.tone;
    const active=document.activeElement;
    const restore=copy.contains(active)?(active.closest('[data-add]')?'[data-add]':active.closest('[data-inspect]')?'[data-inspect]':null):null;
    copy.innerHTML=heroCopy(p);panel.innerHTML=stageArt(p,art);
    if (restore) copy.querySelector(restore)?.focus({preventScroll:true});
    panel.setAttribute('aria-label','Fotografía y piezas de '+titleFor(p));
    document.querySelector('#scene-live').textContent=titleFor(p)+', '+(current+1)+' de '+featureIds.length;
    cancelAnimationFrame(frame);const t=performance.now();draw(t,t-16);
    attachViewer();
  }
  // Scroll position owns the selected product, including history, native touch and keyboard scrolling.
  const progress=()=>-board.getBoundingClientRect().top;
  const go=index=>{
    index=clamp(index,0,last);
    const origin=scrollY+board.getBoundingClientRect().top;
    window.scrollTo({top:origin+index*step,behavior:'instant'});show(index);
  };
  let scrollFrame=0;
  function followScroll() {
    scrollFrame=0;
    const offset=progress();
    show(clamp(Math.round(offset/step),0,last));
    const overMenu=board.getBoundingClientRect().bottom<=header.getBoundingClientRect().height+1;
    header.classList.toggle('on-menu',overMenu);
    header.querySelector('.nav-menu').classList.toggle('is-here',overMenu);
    header.querySelector('.nav-featured').classList.toggle('is-here',!overMenu);
  }
  function measure() {
    step=clamp(Math.round(window.innerHeight*.36),170,350);
    board.style.setProperty('--scroll-travel',(last*step)+'px');
    board.style.setProperty('--panel-height',screen.offsetHeight+'px');
    followScroll();
  }
  window.addEventListener('scroll',()=>{if (!scrollFrame) scrollFrame=requestAnimationFrame(followScroll);},{passive:true});
  new ResizeObserver(measure).observe(screen);
  window.addEventListener('resize',measure,{passive:true});
  // Wheel momentum belongs to its first impulse. At either end the next gesture scrolls the page.
  let wheelTime=-Infinity,direction=0,consumed=false,distance=0;
  board.addEventListener('wheel',event=>{
    if (event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
    const offset=progress();
    if (offset<-.5 || offset>last*step+1) return;
    const raw=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY, sign=Math.sign(raw);
    if (!sign) return;
    const now=performance.now();
    if (now-wheelTime>180 || sign!==direction) {consumed=false;distance=0;}
    wheelTime=now;direction=sign;
    const next=clamp(current+sign,0,last);
    if (!consumed && next===current) return;
    event.preventDefault();
    if (consumed) return;
    distance+=Math.abs(raw)*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
    if (distance>=14) {consumed=true;distance=0;go(next);}
  },{passive:false});
  let touch=null;
  panel.addEventListener('touchstart',e=>{touch=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
  panel.addEventListener('touchend',e=>{
    if (!touch||e.touches.length){touch=null;return;}
    const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;
    if (Math.abs(dx)>38 && Math.abs(dx)>Math.abs(dy)*1.35) go(current+(dx<0?1:-1));
  },{passive:true});
  panel.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
  document.addEventListener('keydown',e=>{
    if (e.altKey||e.ctrlKey||e.metaKey||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,[contenteditable=true]')) return;
    const offset=progress();
    if (offset<-.5||offset>last*step+1) return;
    const delta=({ArrowLeft:-1,ArrowRight:1,PageUp:-1,PageDown:1,ArrowUp:-1,ArrowDown:1})[e.key];
    if (delta && current+delta>=0 && current+delta<=last) {e.preventDefault();go(current+delta);}
  });
  panel.addEventListener('pointermove',e=>{
    if(reduce.matches||e.pointerType!=='mouse'||!inView) return;
    const r=panel.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    panel.style.setProperty('--mx',x*15+'px');panel.style.setProperty('--my',y*12+'px');
    if(viewer){const next=x*15;viewer.rotate(next-yaw);yaw=next;}
  });
  panel.addEventListener('pointerleave',()=>{panel.style.removeProperty('--mx');panel.style.removeProperty('--my');viewer?.reset();yaw=0;});
  new IntersectionObserver(([entry])=>{
    const visible=entry.isIntersecting;
    if (visible!==inView) {inView=visible;attachViewer();}
  }).observe(screen);
  reduce.addEventListener('change',attachViewer);
  function followHash(){
    const index=featureIds.findIndex(id=>'#'+productById(id).slug===location.hash);
    if(index>=0)go(index);
  }
  window.addEventListener('hashchange',followHash);
  measure();followHash();attachViewer();
  return {refresh(){
    const next=document.createElement('template');next.innerHTML=heroCopy(currentProduct());
    copy.querySelector('.hero-price strong').textContent=next.content.querySelector('.hero-price strong').textContent;
    const button=copy.querySelector('[data-add]'),fresh=next.content.querySelector('[data-add]');
    button.disabled=fresh.disabled;button.innerHTML=fresh.innerHTML;
  }};
}
