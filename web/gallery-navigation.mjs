import {wheelGesture} from './wheel-gesture.mjs';
import {scrollMotion} from './scroll-motion.mjs';

// Only the two full-height galleries page vertically. The long combo list and
// the reels retain normal document scrolling, as do pinch and horizontal input.
export function initGalleryNavigation(container) {
  const menu=container.closest('#carta'),hero=document.querySelector('.showcase-panel');
  const header=document.querySelector('#topbar'),remainder=menu.querySelector('.menu-remainder');
  const dialogs=[...document.querySelectorAll('dialog')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const motion=scrollMotion(()=>scrollY,top=>window.scrollTo({top,behavior:'instant'}));
  const impulse=wheelGesture({filterMomentum:true});
  let destination=null,ownsWheel=false,touch=null,cachedStops=null;
  let outsideTouchY=null,returningFromMenu=false,coastTimer=0;
  function cancel() {motion.cancel();destination=null;}
  const sizes=new ResizeObserver(()=>{cachedStops=null;});
  [hero.closest('#destacados'),header,menu,container,remainder].forEach(el=>sizes.observe(el));
  window.addEventListener('resize',()=>{cachedStops=null;},{passive:true});
  function stops() {
    if(cachedStops)return cachedStops;
    const sections=Array.from(container.querySelectorAll('.product-gallery'));
    if(!sections.length)return [];
    const top=el=>el.getBoundingClientRect().top+scrollY;
    const intro=menu.getBoundingClientRect().top+scrollY-hero.offsetHeight;
    const heading=remainder.querySelector('.family-heading'),last=sections.at(-1);
    const end=heading?.getClientRects().length?top(heading)-header.offsetHeight-14:top(last)+last.offsetHeight;
    cachedStops=[intro,...sections.map(top),end];return cachedStops;
  }
  function next(direction,reach=0) {
    const points=stops(),y=destination??scrollY;
    if(!points.length || y<=points[0]+2 || y>points.at(-1)+reach+2)return null;
    if(direction>0)return points.find(top=>top>y+3)??null;
    if(y>points.at(-1)+2)return points.at(-2);
    for(let i=points.length-1;i>=0;i--)if(points[i]<y-3)return points[i];
    return null;
  }
  function align(top) {
    destination=top;
    motion.to(top,reduced.matches?0:205,()=>{destination=null;});
  }
  function eligible(target) {
    return !dialogs.some(dialog=>dialog.open) &&
      !(target instanceof Element && target.closest('input,select,textarea,[contenteditable="true"],video'));
  }
  function wheel(e) {
    if(e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || !eligible(e.target))return;
    if(!e.deltaY || Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
    const target=next(Math.sign(dy),dy<0?Math.abs(dy):0);
    if(target===null && !ownsWheel)return;
    const signal=impulse.read(dy,e.deltaMode,e.timeStamp);
    if(signal==='step'){
      ownsWheel=target!==null;
      if(ownsWheel){e.preventDefault();align(target);}
    } else if(ownsWheel || target!==null)e.preventDefault();
  }
  window.addEventListener('wheel',wheel,{capture:true,passive:false});
  function moveTouch(e) {
    if(!touch || e.touches.length!==1 || !eligible(e.target))return;
    if(touch.owned){if(e.cancelable)e.preventDefault();return;}
    const dx=touch.x-e.touches[0].clientX,dy=touch.y-e.touches[0].clientY;
    if(Math.max(Math.abs(dx),Math.abs(dy))<5)return;
    if(Math.abs(dx)>=Math.abs(dy)*.85){endTouch();return;}
    const target=next(Math.sign(dy),dy<0?48:0);
    if(target===null){endTouch();return;}
    if(e.cancelable)e.preventDefault();
    if(Math.abs(dy)>=20){touch.owned=true;align(target);}
  }
  function endTouch() {touch=null;window.removeEventListener('touchmove',moveTouch,true);}
  function watchTouch(point,owned=false) {
    touch={x:point.clientX,y:point.clientY,owned};
    window.addEventListener('touchmove',moveTouch,{capture:true,passive:false});
  }
  window.addEventListener('touchstart',e=>{
    endTouch();outsideTouchY=null;returningFromMenu=false;clearTimeout(coastTimer);
    if(e.touches.length!==1 || !eligible(e.target))return;
    cancel();ownsWheel=false;impulse.reset();
    if(next(1)!==null || next(-1,48)!==null)watchTouch(e.touches[0]);
    else if(scrollY>stops().at(-1))outsideTouchY=e.touches[0].clientY;
  },{capture:true,passive:true});
  // A fling from deep in the combos can coast into a gallery after touchend.
  // Correct its landing only if it actually reaches a full-screen product.
  function finishCoast(){
    if(!returningFromMenu)return;
    clearTimeout(coastTimer);coastTimer=setTimeout(()=>{
      returningFromMenu=false;
      const galleries=stops().slice(1,-1),y=scrollY;
      if(galleries.length && y>=galleries[0]-innerHeight*.3 && y<=galleries.at(-1)+innerHeight*.6 && !dialogs.some(d=>d.open)){
        const closest=galleries.reduce((best,n)=>Math.abs(n-y)<Math.abs(best-y)?n:best);
        if(Math.abs(y-closest)>3)align(closest);
      }
    },130);
  }
  window.addEventListener('scroll',finishCoast,{passive:true});
  window.addEventListener('touchend',e=>{
    endTouch();returningFromMenu=outsideTouchY!==null && e.changedTouches[0].clientY-outsideTouchY>20;
    outsideTouchY=null;finishCoast();
  },{passive:true});
  window.addEventListener('touchcancel',()=>{endTouch();outsideTouchY=null;},{passive:true});
  window.addEventListener('pointerdown',()=>{if(destination!==null)cancel();},{passive:true});
  window.addEventListener('hashchange',()=>{cancel();ownsWheel=false;returningFromMenu=false;impulse.reset();});
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !eligible(e.target))return;
    const space=e.key===' ' && !e.target.closest('a,button');
    const direction=space?(e.shiftKey?-1:1):({PageDown:1,ArrowDown:1,PageUp:-1,ArrowUp:-1})[e.key];
    if(!direction)return;
    const target=next(direction);if(target===null)return;
    e.preventDefault();align(target);
  });
  return {enterFromHero(e) {
    const first=stops()[1];if(first==null)return false;
    if(e.type==='wheel'){
      impulse.reset();impulse.read(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1),e.deltaMode,e.timeStamp);
      ownsWheel=true;
    } else if(e.touches?.length)watchTouch(e.touches[0],true);
    align(first);return true;
  }};
}
