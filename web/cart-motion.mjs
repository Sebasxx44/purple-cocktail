import {icon} from './shared.mjs';
import {stackPicture} from './burger.mjs';

let flight=null;
export function animateCart(source,assembly,tint,choice) {
  const cart=document.querySelector('.nav-cart'),badge=cart?.querySelector('.cart-count');
  if (!cart || !badge) return;
  flight?.remove(); flight=null;
  if (!source || matchMedia('(prefers-reduced-motion: reduce)').matches || !cart.animate) return;
  const target=badge.getBoundingClientRect();
  const x=Math.max(20,Math.min(innerWidth-20,source.left+source.width/2));
  const y=Math.max(24,Math.min(innerHeight-24,source.top+source.height/2));
  const dx=target.left+target.width/2-x,dy=target.top+target.height/2-y;
  const size=innerWidth<700?58:75;
  const capsule=document.createElement('div');
  capsule.className='cart-flight'; capsule.setAttribute('aria-hidden','true');
  capsule.style.cssText='left:'+(x-size/2)+'px;top:'+(y-size/2)+'px;width:'+size+'px;height:'+size+'px;';
  capsule.style.setProperty('--flight-color',tint||'#e6c9f5');
  const src=assembly.imageSmall||assembly.image;
  if (assembly.stack) capsule.innerHTML=stackPicture(assembly);
  else if (src) {const photo=new Image();photo.src=src;photo.alt='';capsule.append(photo);}
  else capsule.innerHTML=icon('bag');
  if(choice?.imageSmall) {const chip=new Image();chip.className='flight-option';chip.src=choice.imageSmall;chip.alt='';capsule.append(chip);}
  document.body.append(capsule);flight=capsule;
  const arc=Math.min(70,Math.abs(dx)*.17+22);
  const motion=capsule.animate([
    {transform:'translate(0,0) scale(.68) rotate(-9deg)',opacity:.9},
    {transform:'translate('+dx*.12+'px,'+(dy*.17-arc)+'px) scale(1.06) rotate(4deg)',opacity:1,offset:.29},
    {transform:'translate('+dx+'px,'+dy+'px) scale(.16) rotate(10deg)',opacity:.8}
  ],{duration:560,easing:'cubic-bezier(.33,.06,.42,1)',fill:'forwards'});
  motion.finished.then(()=>{
    if(flight!==capsule) return;
    capsule.remove();flight=null;
    badge.animate([{transform:'scale(.74)'},{transform:'scale(1.44)',offset:.46},{transform:'scale(1)'}],{duration:330,easing:'ease-out'});
    cart.animate([{boxShadow:'0 0 0 1px #b47adeb0'},{boxShadow:'0 0 0 13px #b47ade00'}],{duration:410});
  },()=>capsule.remove());
}
