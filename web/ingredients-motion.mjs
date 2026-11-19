const axes = ['x','y','yaw','pitch','roll','lift'];
const zeroPose = () => ({x:0,y:0,yaw:0,pitch:0,roll:0,lift:0});
const clamp = (n,low,high) => Math.max(low,Math.min(high,n));
const blockedTouchClicks = new WeakMap();
let viewerImport;

// A thin cheese slice turns readily. Meat stays lower and the brioche returns
// more slowly. Every ingredient also receives its own stable phase and depth.
const materials = {
  brioche: [1.14,.91,11], 'carne-smash': [.73,1.2,7],
  'queso-americano': [1.19,.74,16], mozzarella: [1.15,.77,16],
  tocineta: [1.08,.83,14], 'cebolla-crispy': [1.18,.73,13],
  arandanos: [.94,.91,11], perlas: [1.13,.82,10], hielo: [.88,.97,13],
  fresa: [1.05,.91,13], destilado: [.76,1.18,6], margarita: [.95,.95,11]
};

function makeSlot(button,piece,index,order) {
  const image = button.querySelector(':scope > img');
  if (!image || !piece?.image) return null;
  const body = document.createElement('span');
  const orientation = document.createElement('span');
  body.className = 'ingredient-body';
  body.setAttribute('aria-hidden','true');
  orientation.className = 'ingredient-orientation';
  image.before(body); body.append(orientation); orientation.append(image);
  const seed = [...(piece.mesh || piece.name || String(index))].reduce((n,c) => (n*31+c.charCodeAt(0))%997, 37) / 997;
  const settings = materials[piece.mesh] || [.96,.94,10];
  const depth = settings[0]*(.93+seed*.15);
  const hand = order%2 ? 1 : -1;
  const period = 5.8+settings[1]*1.15+seed*1.4+order*.23;
  const values = {
    '--im-period':`${period.toFixed(2)}s`, '--im-roll-period':`${(period*1.21).toFixed(2)}s`,
    '--im-phase':`${(-.9-order*2.1-seed*2.4).toFixed(2)}s`, '--im-sway':`${hand*(4+settings[2]*.37)}deg`,
    '--im-travel-x':`${(hand*(13+seed*4)*depth).toFixed(1)}px`, '--im-travel-y':`${((18+order*1.7)*depth).toFixed(1)}px`
  };
  for (const [key,value] of Object.entries(values)) button.style.setProperty(key,value);
  return {button,image,orientation,body,piece,index,depth,hand,seed,lean:settings[2],mass:settings[1],
    pose:zeroPose(),target:zeroPose(),speed:zeroPose()};
}

function spring(slot,seconds) {
  const stiffness = 186/slot.mass;
  const damping = 1.39*Math.sqrt(stiffness);
  let unsettled = false;
  for (const axis of axes) {
    const error = slot.target[axis]-slot.pose[axis];
    const tolerance = axis==='lift' ? .0008 : .022;
    if (Math.abs(error)<tolerance && Math.abs(slot.speed[axis])<tolerance*5) {
      slot.pose[axis]=slot.target[axis]; slot.speed[axis]=0;
      continue;
    }
    slot.speed[axis] += (stiffness*error-damping*slot.speed[axis])*seconds;
    slot.pose[axis] += slot.speed[axis]*seconds;
    unsettled = true;
  }
  return unsettled;
}

function paint(slot) {
  const {pose,depth,button} = slot;
  const values = {
    '--im-x':`${pose.x.toFixed(2)}px`, '--im-y':`${pose.y.toFixed(2)}px`,
    '--im-yaw':`${pose.yaw.toFixed(2)}deg`, '--im-pitch':`${pose.pitch.toFixed(2)}deg`,
    '--im-roll':`${pose.roll.toFixed(2)}deg`, '--im-scale':(1+.086*pose.lift*depth).toFixed(4),
    '--im-shadow-x':`${(3-pose.x*.23+pose.yaw*.10).toFixed(1)}px`,
    '--im-shadow-y':`${(5.5+depth*1.4+pose.lift*6.7-pose.y*.12).toFixed(1)}px`,
    '--im-shadow-blur':`${(3.4+depth+pose.lift*3.1).toFixed(1)}px`
  };
  for (const [key,value] of Object.entries(values)) button.style.setProperty(key,value);
}

/** Mount on the stable scene-art element after its floating buttons exist. */
export function mountIngredientMotion(panel,asset) {
  const ingredients = Array.isArray(asset?.ingredients) ? asset.ingredients : [];
  const slots = Array.from(panel.querySelectorAll('.floating-part[data-part]'),(button,order) => {
    const index = Number(button.dataset.part);
    return makeSlot(button,ingredients[index],index,order);
  }).filter(Boolean);
  if (!slots.length) return {setVisible() {},destroy() {}};

  const signals = new AbortController();
  const passive = {signal:signals.signal,passive:true};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 700px), (pointer: coarse)');
  const connection = navigator.connection;
  let externalVisible = true, intersecting = true, running = false, destroyed = false;
  let pointer = null, focusSlot = null, touch = null, tapSlot = null;
  let dirty = true, frame = 0, sleepTimer = 0, pulseTimer = 0, lastTick = 0;
  let desiredSlot = null, meshSlot = null, meshHost, viewer, meshReady = false;
  let meshTimer = 0, meshTicket = 0, lastDraw = 0, meshYaw = 0, meshPitch = 0;

  function slotFor(target) {
    const button = target instanceof Element ? target.closest('.floating-part[data-part]') : null;
    return slots.find(slot => slot.button===button) || null;
  }
  function wake() {
    if (!running || frame || destroyed) return;
    clearTimeout(sleepTimer); sleepTimer=0;
    frame=requestAnimationFrame(tick);
  }
  function changed() { dirty=true; wake(); }

  function disposeMesh() {
    meshReady=false; meshYaw=meshPitch=0;
    if (meshSlot) delete meshSlot.button.dataset.ingredientModel;
    viewer?.destroy(); viewer=null; meshHost?.remove(); meshHost=null; meshSlot=null;
  }
  function handleMode(mode) {
    if (!meshSlot || destroyed || !running) return;
    meshReady=mode==='3d';
    if (meshReady) {
      meshSlot.button.dataset.ingredientModel='ready';
      lastDraw=0; wake();
    } else delete meshSlot.button.dataset.ingredientModel;
  }
  async function useMesh(slot,ticket) {
    try {
      viewerImport ||= import('/showcase/viewer.js');
      const {mountViewer} = await viewerImport;
      if (!running || destroyed || ticket!==meshTicket || desiredSlot!==slot) return;
      if (meshSlot===slot && viewer) { wake(); return; }
      if (meshSlot) delete meshSlot.button.dataset.ingredientModel;
      meshSlot=slot; meshReady=false; meshYaw=meshPitch=0; lastDraw=0;
      if (!meshHost) {
        meshHost=document.createElement('span'); meshHost.className='ingredient-model';
        meshHost.inert=true; meshHost.setAttribute('aria-hidden','true');
      }
      slot.orientation.append(meshHost);
      if (viewer) viewer.select(slot.index);
      else viewer=mountViewer(meshHost,{...slot.piece,ingredients},{onMode:handleMode});
    } catch {
      if (ticket===meshTicket) disposeMesh();
    }
  }
  function requestMesh(slot,shortDelay=false) {
    if (slot && !slot.piece.model) slot=null;
    if (slot===desiredSlot) return;
    desiredSlot=slot;
    const ticket=++meshTicket;
    clearTimeout(meshTimer);
    if (!slot) {
      // Let the existing piece spring back before returning to its photograph.
      meshTimer=setTimeout(disposeMesh,530);
    } else if (meshSlot!==slot || !viewer) {
      meshTimer=setTimeout(() => useMesh(slot,ticket),shortDelay ? 45 : 115);
    }
    wake();
  }

  function updateTargets() {
    const panelBox=panel.getBoundingClientRect();
    const px = pointer ? clamp((pointer.x-panelBox.left)/Math.max(1,panelBox.width)*2-1,-1,1) : 0;
    const py = pointer ? clamp((pointer.y-panelBox.top)/Math.max(1,panelBox.height)*2-1,-1,1) : 0;
    const amplitude=compact.matches ? .52 : 1;
    let nearest = null, best = .23;
    for (const slot of slots) {
      const box=slot.button.getBoundingClientRect();
      const dx=pointer ? pointer.x-box.left-box.width/2 : 0;
      const dy=pointer ? pointer.y-box.top-box.height/2 : 0;
      const localX=clamp(dx/Math.max(27,box.width*.52),-1,1);
      const localY=clamp(dy/Math.max(27,box.height*.52),-1,1);
      const reachX=clamp(box.width*.73+48,86,165), reachY=clamp(box.height*.70+44,79,155);
      const proximity=pointer ? clamp(1-Math.hypot(dx/reachX,dy/reachY),0,1) : 0;
      const direct=pointer?.direct===slot;
      const focused=focusSlot===slot || tapSlot===slot;
      const pull=focused ? 1 : Math.max(direct ? .78 : 0,proximity);
      const localNear = direct ? 1.2 : proximity;
      if (pointer && localNear>best) {best=localNear;nearest=slot;}
      const {depth,hand,lean,target} = slot;
      target.x=(px*7.2+localX*12.5*pull)*depth*amplitude;
      target.y=(py*5.4+(localY*7.5-9.5)*pull)*depth*amplitude;
      target.yaw=clamp((px*3.4+(hand*(5.5+lean*.28)+localX*(lean+6))*pull)*amplitude,-19,19);
      target.pitch=clamp((py*1.4+(localY*7.0-hand*2.7)*pull)*amplitude,-8.2,8.2);
      target.roll=(px*1.1+(localX*lean*.67+hand*2.0)*pull)*amplitude;
      target.lift=pull*amplitude;
    }
    requestMesh(focusSlot || tapSlot || nearest,Boolean(focusSlot || tapSlot));
  }
  function tick(now) {
    frame=0;
    if (!running || destroyed) return;
    if (dirty) {dirty=false;updateTargets();}
    const seconds=clamp((now-lastTick || 16.7)/1000,.004,.032); lastTick=now;
    let moving=false;
    for (const slot of slots) {
      const wasMoving=spring(slot,seconds);
      if (wasMoving || slot.paintedMoving) paint(slot);
      slot.paintedMoving=wasMoving;
      moving ||= wasMoving;
    }
    if (meshReady && viewer && meshSlot && now-lastDraw>=31) {
      const s=meshSlot, active=desiredSlot===s ? s.pose.lift : 0;
      const wobble=now*.00123+s.seed*8;
      const yaw=clamp(s.pose.yaw+Math.sin(wobble)*2.35*active,-(s.piece.maxYaw || 20),s.piece.maxYaw || 20);
      const pitch=clamp(s.pose.pitch+Math.sin(wobble*.87+.7)*1.6*active,-(s.piece.maxPitch || 9),s.piece.maxPitch || 9);
      if (Math.abs(yaw-meshYaw)+Math.abs(pitch-meshPitch)>.055) {
        viewer.rotate(yaw-meshYaw,pitch-meshPitch);meshYaw=yaw;meshPitch=pitch;
      }
      lastDraw=now;
    }
    // Unfocused drift runs on compositor keyframes. Only an actual active
    // volume gets low-frequency redraws after its interaction has settled.
    if (moving || dirty) wake();
    else if (meshReady && desiredSlot) sleepTimer=setTimeout(wake,45);
  }

  function refresh() {
    if (destroyed) return;
    const allowed=externalVisible && intersecting && !document.hidden && !reduced.matches && !connection?.saveData && !document.querySelector('dialog[open]');
    if (allowed===running && panel.hasAttribute('data-ingredient-motion')) return;
    running=allowed; panel.dataset.ingredientMotion=running ? 'on' : 'off';
    if (running) {lastTick=performance.now();changed();return;}
    cancelAnimationFrame(frame);frame=0;clearTimeout(sleepTimer);clearTimeout(meshTimer);clearTimeout(pulseTimer);
    pointer=null;focusSlot=null;tapSlot=null;desiredSlot=null;meshTicket++;disposeMesh();
    for (const slot of slots) {slot.pose=zeroPose();slot.target=zeroPose();slot.speed=zeroPose();slot.paintedMoving=false;paint(slot);}
  }

  function cancelTouch() {
    if (!touch) return;
    touch.dragged=true;
    blockedTouchClicks.set(panel,performance.now()+650);
    tapSlot=null; changed();
  }
  panel.addEventListener('pointerdown',event => {
    if (event.pointerType==='mouse') {blockedTouchClicks.delete(panel);return;}
    if (!event.isPrimary) {cancelTouch();return;}
    blockedTouchClicks.delete(panel);
    const slot=slotFor(event.target);
    touch={id:event.pointerId,x:event.clientX,y:event.clientY,slot,dragged:false};
    pointer=null;changed();
  },passive);
  panel.addEventListener('pointermove',event => {
    if (event.pointerType==='mouse') {
      if (!running || event.buttons) return;
      pointer={x:event.clientX,y:event.clientY,direct:slotFor(event.target)};changed();
    } else if (touch?.id===event.pointerId && !touch.dragged && Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>9) cancelTouch();
  },passive);
  panel.addEventListener('pointerleave',event => {if (event.pointerType==='mouse') {pointer=null;changed();}},passive);
  window.addEventListener('pointerup',event => {
    if (!touch || event.pointerId!==touch.id) return;
    if (Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>9) cancelTouch();
    const ended=touch;touch=null;
    if (ended.dragged || !ended.slot || !running) return;
    // Wait for release before reacting: native scrolling, swipe navigation
    // and pinch zoom never trigger a touch preview or a model download.
    tapSlot=ended.slot;changed(); clearTimeout(pulseTimer);
    pulseTimer=setTimeout(()=>{tapSlot=null;changed();},640);
  },passive);
  window.addEventListener('pointercancel',event => {if(touch?.id===event.pointerId){cancelTouch();touch=null;}},passive);
  panel.addEventListener('click',event => {
    if (!event.detail || event.pointerType==='mouse' || performance.now()>(blockedTouchClicks.get(panel) || 0)) return;
    if (slotFor(event.target)) {event.preventDefault();event.stopImmediatePropagation();}
  },{signal:signals.signal,capture:true});
  panel.addEventListener('focusin',event => {focusSlot=event.target.matches(':focus-visible') ? slotFor(event.target) : null;changed();},passive);
  panel.addEventListener('focusout',()=>{focusSlot=null;changed();},passive);
  document.addEventListener('visibilitychange',refresh,passive);
  reduced.addEventListener('change',refresh,passive);compact.addEventListener('change',changed,passive);
  connection?.addEventListener?.('change',refresh,passive);
  const dialogs=new MutationObserver(refresh);
  dialogs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  const io=new IntersectionObserver(([entry])=>{intersecting=entry.isIntersecting;refresh();});io.observe(panel);
  const observer=new ResizeObserver(changed);observer.observe(panel);
  refresh();

  return {
    setVisible(value) { if (!destroyed) {externalVisible=Boolean(value);refresh();} },
    destroy() {
      if (destroyed) return;
      destroyed=true;running=false;meshTicket++;
      signals.abort();io.disconnect();observer.disconnect();dialogs.disconnect();
      cancelAnimationFrame(frame);clearTimeout(sleepTimer);clearTimeout(meshTimer);clearTimeout(pulseTimer);disposeMesh();
      for (const slot of slots) {
        slot.body.replaceWith(slot.image);
        for (const key of Array.from(slot.button.style)) if (key.startsWith('--im-')) slot.button.style.removeProperty(key);
        delete slot.button.dataset.ingredientModel;
      }
      delete panel.dataset.ingredientMotion;
    }
  };
}
