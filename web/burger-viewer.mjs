import {createRenderer,readModel,loadTexture} from '/showcase/viewer.js';
import {stackLayout} from './stack-layout.mjs';
import {stackPicture} from './burger.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function mountBurgerViewer(host,initial,exploded) {
  const signal=new AbortController(), listener={signal:signal.signal};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const stage=document.createElement('div'),poster=document.createElement('div'),canvas=document.createElement('canvas');
  stage.className='burger-stage';poster.className='burger-poster';
  stage.tabIndex=0;stage.setAttribute('role','img');stage.setAttribute('aria-label','Capas de '+initial.name+'. Arrastra o usa las flechas del teclado para girar.');
  stage.append(poster,canvas);host.replaceChildren(stage);
  let renderer=null, current, spread=exploded?1:0, goal=spread, turn=0,tilt=0,frame=0,drag=null,last=0,disposed=false;
  const loads=new Map();
  function draw() {
    const layout=stackLayout(current.stack,spread,current.type);
    const camera=current.stack[0]?.piece.viewPitch??12;
    const drawn=renderer?.drawStack(stage.clientWidth,stage.clientHeight,turn,camera+tilt,layout);
    const mode=drawn?'3d':'image';
    if(host.dataset.viewerMode!==mode) host.dataset.viewerMode=mode;
    canvas.hidden=!drawn;poster.hidden=Boolean(drawn);
    if (!drawn && current.stack.length) {
      const svg=poster.firstElementChild;
      svg.setAttribute('viewBox',[layout.left,layout.top,layout.width,layout.height].join(' '));
      layout.items.forEach((r,i)=>svg.children[i].setAttribute('y',r.y));
    }
  }
  function glide(now) {
    frame=0;
    const elapsed=Math.min(50,now-(last||now-16));last=now;
    spread=goal+(spread-goal)*Math.exp(-elapsed/95);
    if(Math.abs(spread-goal)<.003 || reduced.matches) spread=goal;
    draw();if(spread!==goal) frame=requestAnimationFrame(glide);
  }
  function request(piece,key) {
    if(!renderer || loads.has(key)) return;
    const promise=fetch(piece.model,{signal:signal.signal}).then(response=>{
      if(!response.ok) throw Error();return response.arrayBuffer();
    }).then(async bytes=>{
      const model=readModel(bytes);
      const pixels=stage.clientWidth*Math.min(devicePixelRatio||1,2)*piece.width;
      let texture;
      if(pixels>710) {
        const photograph=new Image();photograph.src=pixels>1450?piece.master:piece.image;
        try {await photograph.decode();texture=photograph;} catch {}
      }
      texture ||= await loadTexture(model.image);
      if(!disposed && renderer) {renderer.addIngredient(key,model,texture);draw();}
    }).catch(()=>{loads.delete(key);});
    loads.set(key,promise);
  }
  function set(assembly,expanded=false) {
    if(current!==assembly) {
      current=assembly;poster.innerHTML=stackPicture(assembly,spread,true);
      for(const {piece,key} of assembly.stack) request(piece,key);
    }
    goal=expanded?1:0;
    if(reduced.matches) spread=goal;
    draw();
    if(spread!==goal && !frame) {last=0;frame=requestAnimationFrame(glide);}
  }
  function initGL() {
    if(navigator.connection?.saveData) return;
    try {renderer=createRenderer(canvas);} catch {renderer=null;}
  }
  initGL();set(initial,exploded);
  const resize=new ResizeObserver(draw);resize.observe(stage);
  stage.addEventListener('pointerdown',e=>{
    if(!e.isPrimary || e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);
  },listener);
  stage.addEventListener('pointermove',e=>{
    if(!drag || e.pointerId!==drag.id)return;
    turn=clamp(turn+(e.clientX-drag.x)*.34,-26,26);tilt=clamp(tilt+(e.clientY-drag.y)*.17,-12,12);
    drag.x=e.clientX;drag.y=e.clientY;draw();
  },listener);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,()=>{drag=null;},listener);
  stage.addEventListener('keydown',e=>{
    const v={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-3],ArrowDown:[0,3],Home:[-turn,-tilt]}[e.key];
    if(v){e.preventDefault();turn=clamp(turn+v[0],-26,26);tilt=clamp(tilt+v[1],-12,12);draw();}
  },listener);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer=null;loads.clear();draw();},listener);
  canvas.addEventListener('webglcontextrestored',()=>{initGL();for(const {piece,key} of current.stack)request(piece,key);},listener);
  return {set,destroy(){disposed=true;signal.abort();resize.disconnect();cancelAnimationFrame(frame);renderer?.destroy();host.replaceChildren();delete host.dataset.viewerMode;}};
}

export async function exportBurger(assembly) {
  const f=stackLayout(assembly.stack,0,assembly.type), padding=.035*Math.max(f.width,f.height);
  const scale=3840/(Math.max(f.width,f.height)+2*padding);
  const images=new Map();
  for(const {key,piece} of assembly.stack) if(!images.has(key)) {
    const img=new Image();img.src=piece.master;images.set(key,img.decode().then(()=>img));
  }
  const decoded=await Promise.all(f.items.map(item=>images.get(item.key)));
  const canvas=document.createElement('canvas');
  canvas.width=Math.round((f.width+2*padding)*scale);canvas.height=Math.round((f.height+2*padding)*scale);
  try {
    const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
    ctx.setTransform(scale,0,0,scale,(padding-f.left)*scale,(padding-f.top)*scale);
    f.items.forEach((r,i)=>ctx.drawImage(decoded[i],r.x,r.y,r.width,r.height));
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error()),'image/png'));
  } finally {canvas.width=canvas.height=1;}
}
