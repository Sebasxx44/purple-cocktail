/* Single-view reconstructions. Rendering is event-driven and uses no external service. */
import {composition} from './composition.js';
const glbHeader = 0x46546c67;
const degrees = Math.PI / 180;
const limit = (value, min, max) => Math.max(min, Math.min(max, value));

const vertexSource = `
  attribute vec3 position;
  attribute vec2 uv;
  uniform vec3 center;
  uniform vec2 rotation;
  uniform vec2 screenScale;
  uniform vec3 offset;
  uniform float objectScale;
  varying vec2 texCoord;
  void main() {
    vec3 p = (position - center) * objectScale + offset;
    vec2 co = cos(rotation), si = sin(rotation);
    vec3 yaw = vec3(co.x*p.x + si.x*p.z, p.y, -si.x*p.x + co.x*p.z);
    vec3 v = vec3(yaw.x, co.y*yaw.y - si.y*yaw.z, si.y*yaw.y + co.y*yaw.z);
    gl_Position = vec4(v.xy*screenScale, -.25*v.z, 1.);
    texCoord = uv;
  }
`;
const fragmentSource = `
  precision mediump float;
  varying vec2 texCoord;
  uniform sampler2D photograph;
  void main() {
    vec4 sampleColor = texture2D(photograph, texCoord);
    if (sampleColor.a < .15) discard;
    gl_FragColor = sampleColor;
  }
`;

function createProgram(gl) {
  const program = gl.createProgram();
  const stages = [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]];
  const shaders = [];
  try {
    for (const [type, source] of stages) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('No se pudo iniciar el visor.');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('No se pudo iniciar el visor.');
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    shaders.forEach(shader => gl.deleteShader(shader));
  }
}

function readModel(bytes) {
  const header = new DataView(bytes);
  if (header.getUint32(0, true) !== glbHeader || header.getUint32(4, true) !== 2) {
    throw new Error('Modelo GLB desconocido.');
  }
  const jsonLength = header.getUint32(12, true);
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
  const binStart = 28 + jsonLength;
  const bufferView = index => {
    const view = data.bufferViews[index];
    return new Uint8Array(bytes, binStart + (view.byteOffset || 0), view.byteLength);
  };
  const mesh = data.meshes[0].primitives[0];
  const accessor = index => {
    const def = data.accessors[index];
    return {...def, bytes: bufferView(def.bufferView)};
  };
  const material = data.materials[mesh.material];
  const texture = data.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const encoded = data.images[texture.source];
  return {
    positions: accessor(mesh.attributes.POSITION),
    uv: accessor(mesh.attributes.TEXCOORD_0),
    indices: accessor(mesh.indices),
    image: new Blob([bufferView(encoded.bufferView)], {type: encoded.mimeType})
  };
}

async function loadTexture(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true, premultipliedAlpha:false, powerPreference:'low-power'});
  if (!gl) return null;
  const program = createProgram(gl);
  const position = gl.getAttribLocation(program, 'position');
  const uv = gl.getAttribLocation(program, 'uv');
  const uniforms = Object.fromEntries(['center','rotation','screenScale','photograph','offset','objectScale'].map(key => [key,gl.getUniformLocation(program,key)]));
  let asset,layers=[],signature='';

  function dispose(object) {
    if(!object) return;
    object.buffers.forEach(buffer=>gl.deleteBuffer(buffer));
    gl.deleteTexture(object.texture);
  }
  function release() {
    dispose(asset); asset=null; signature='';
    layers.forEach(layer=>dispose(layer.object)); layers=[];
  }
  function allocate(data,picture) {
    const entries = [data.positions,data.uv,data.indices];
    const buffers = entries.map((entry,index) => {
      const buffer = gl.createBuffer();
      const target = index === 2 ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
      gl.bindBuffer(target,buffer);
      gl.bufferData(target,entry.bytes,gl.STATIC_DRAW);
      return buffer;
    });
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,picture);
    const {min,max} = data.positions;
    const center = min.map((n,i) => (n+max[i])/2);
    const width = max[0]-min[0], height = max[1]-min[1];
    return {entries,buffers,texture,center,width,height,depth:max[2]-min[2]};
  }
  function use(data,picture,decorations=[],model='') {
    if (!asset || signature!==model) {
      release(); asset=allocate(data,picture); signature=model;
    } else {
      gl.bindTexture(gl.TEXTURE_2D,asset.texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,picture);
      layers.forEach(layer=>dispose(layer.object));
    }
    layers=decorations.map(layer=>({...layer,object:allocate(layer.mesh.data,layer.mesh.image)}));
  }

  function project(width,height,angle,pitch,frame,coverage) {
    if (!width || !height || gl.isContextLost()) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1,Math.round(width*ratio)), h = Math.max(1,Math.round(height*ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0,0,w,h);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(program);
    const aspect=w/h,scale=Math.min(coverage/frame.height,coverage*aspect/frame.width);
    gl.uniform2f(uniforms.rotation,angle*degrees,pitch*degrees);
    gl.uniform2f(uniforms.screenScale,scale/aspect,scale);
    return true;
  }
  function paint(object,x,y,z,factor) {
      const [posData,uvData,idxData]=object.entries;
      gl.bindBuffer(gl.ARRAY_BUFFER,object.buffers[0]); gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position,3,gl.FLOAT,false,0,posData.byteOffset||0);
      gl.bindBuffer(gl.ARRAY_BUFFER,object.buffers[1]); gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,uvData.byteOffset||0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,object.buffers[2]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,object.texture);
      gl.uniform1i(uniforms.photograph,0);gl.uniform3fv(uniforms.center,object.center);
      gl.uniform3f(uniforms.offset,x,y,z);gl.uniform1f(uniforms.objectScale,factor);
      gl.drawElements(gl.TRIANGLES,idxData.count,idxData.componentType,idxData.byteOffset||0);
    }
  function draw(width,height,angle,pitch) {
    if (!asset) return false;
    const frame=composition(asset.width,asset.height,layers.map(layer=>({...layer,aspect:layer.object.width/layer.object.height})));
    if (!project(width,height,angle,pitch,frame,1.78)) return false;
    const cx=frame.left+frame.width/2,cy=frame.top+frame.height/2;
    paint(asset,asset.width/2-cx,cy-asset.height/2,0,1);
    layers.forEach((layer,i)=>{
      const rect=frame.objects[i];
      paint(layer.object,rect.x+rect.width/2-cx,cy-rect.y-rect.height/2,asset.depth*.50+i*.006,rect.width/layer.object.width);
    });
    return true;
  }

  return {use,draw,release,destroy() {
    release();gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();
  }};
}

/**
 * Mount the viewer in a host with an explicit height. Call select(-1) to show
 * the whole product, or pass an ingredient index. rotate() accepts a delta
 * in degrees. reset() returns the current piece to its photographed angle.
 */
export function mountViewer(host, product, {onSelect, onMode,cyclePieces=true} = {}) {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:relative;width:100%;height:100%;min-height:inherit;overflow:hidden;';
  const photos=document.createElement('div');
  photos.style.cssText='position:absolute;inset:0;pointer-events:none;';
  const poster = document.createElement('img');
  poster.draggable = false;
  poster.style.cssText = 'position:absolute;inset:5.5%;width:89%;height:89%;object-fit:contain;pointer-events:none;';
  const canvas = document.createElement('canvas');
  canvas.hidden = true;
  canvas.tabIndex = 0;
  canvas.setAttribute('role','img');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y pinch-zoom;cursor:grab;';
  photos.append(poster);holder.append(photos,canvas); host.append(holder);
  let renderer, active = -2, angle = 0, pitch = 0, loading, version = 0, closed = false, drag;
  const degreeLimit = {yaw:18,pitch:7};
  const signals = new AbortController();
  const listener = {signal:signals.signal};
  const saveData = !!navigator.connection?.saveData;
  const meshes=new Map();
  let displayed=product,overlays=[],loaded=false;
  function positionPosters() {
    if(!poster.naturalWidth || !poster.naturalHeight || !overlays.length) return;
    const width=poster.naturalWidth,height=poster.naturalHeight;
    const frame=composition(width,height,overlays.map(({layer,image})=>({...layer,aspect:image.naturalWidth/image.naturalHeight||1})));
    const scale=.89*Math.min(holder.clientWidth/frame.width,holder.clientHeight/frame.height);
    const x=(holder.clientWidth-scale*frame.width)/2-frame.left*scale;
    const y=(holder.clientHeight-scale*frame.height)/2-frame.top*scale;
    function place(img,px,py,w,h) {
      Object.assign(img.style,{left:(x+px*scale)+'px',top:(y+py*scale)+'px',width:w*scale+'px',height:h*scale+'px'});
    }
    place(poster,0,0,width,height);
    overlays.forEach(({image},i)=>{const r=frame.objects[i];place(image,r.x,r.y,r.width,r.height);});
  }
  function showPosters(piece) {
    overlays.forEach(({image})=>image.remove());overlays=[];
    Object.assign(poster.style,{inset:'5.5%',width:'89%',height:'89%'});
    poster.src=piece.image||product.image;
    for(const layer of piece.layers||[]) {
      const image=new Image(); image.alt='';image.style.cssText='position:absolute;object-fit:contain;';
      image.onload=positionPosters;image.src=layer.piece.imageSmall||layer.piece.image;
      overlays.push({image,layer});photos.append(image);
    }
    positionPosters();
  }
  poster.onload=positionPosters;

  function mode(value) {
    host.dataset.viewerMode = value;
    canvas.hidden = value !== '3d';
    photos.hidden = value === '3d';
    // Site-wide image display rules must not leave the photograph behind a
    // rotating transparent WebGL canvas.
    canvas.style.display = canvas.hidden ? 'none' : 'block';
    photos.style.display = photos.hidden ? 'none' : 'block';
    onMode?.(value);
  }
  function render() {
    if (!closed && loaded && renderer?.draw(holder.clientWidth,holder.clientHeight,angle,pitch) && host.dataset.viewerMode !== '3d') mode('3d');
  }
  const resize = new ResizeObserver(()=>{positionPosters();render();});
  resize.observe(holder);

  async function mesh(model,signal) {
    if (meshes.has(model)) return meshes.get(model);
    const response=await fetch(model,{signal});
    if(!response.ok) throw new Error('Modelo no disponible.');
    const data=readModel(await response.arrayBuffer());
    const result={data,image:await loadTexture(data.image)};
    if(!signal.aborted && !closed) meshes.set(model,result);
    return result;
  }
  async function load(piece) {
    loading?.abort();
    const token = ++version;
    loaded=false;
    if (saveData || !piece.model) { mode('image'); return; }
    loading = new AbortController();
    try {
      renderer ||= createRenderer(canvas);
      if (!renderer) { mode('image'); return; }
      mode('loading');
      const signal=loading.signal;
      const [main,texture,parts]=await Promise.all([
        mesh(piece.model,signal),
        piece.texture?poster.decode().then(()=>poster):null,
        Promise.all((piece.layers||[]).map(async layer=>({...layer,mesh:await mesh(layer.piece.model,signal)})))
      ]);
      if (closed || version !== token) return;
      renderer.use(main.data,texture||main.image,parts,piece.model);loaded=true;
      render();
    } catch (error) {
      if (!closed && version === token && error.name !== 'AbortError') mode('image');
    }
  }
  function select(index, notify = true) {
    if (closed) return;
    const ingredients = product.ingredients || [];
    if (typeof index === 'string') index = ingredients.findIndex(piece => piece.mesh === index || piece.name === index);
    const selected = Number.isInteger(index) && index >= 0 && index < ingredients.length ? index : -1;
    if (selected === active) return;
    active = selected; angle = 0; pitch = 0;
    const piece = selected === -1 ? product : ingredients[selected];
    display(piece);
    if (notify) onSelect?.(selected);
  }
  function display(piece) {
    if (closed) return;
    displayed=piece;angle=pitch=0;
    degreeLimit.yaw = piece.maxYaw || 18;
    degreeLimit.pitch = piece.maxPitch || 7;
    const name = piece.displayName || piece.name || product.slug;
    showPosters(piece);
    poster.alt = name;
    canvas.setAttribute('aria-label', `Vista tridimensional de ${name}. Arrastra para girar o usa las flechas del teclado.`);
    mode('image');
    load(piece);
  }
  function rotate(delta, vertical = 0) {
    angle = limit(angle + delta, -degreeLimit.yaw, degreeLimit.yaw);
    pitch = limit(pitch + vertical, -degreeLimit.pitch, degreeLimit.pitch);
    render();
  }
  function reset() { angle = 0; pitch = 0; render(); }

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY};
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  },listener);
  canvas.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    rotate((event.clientX-drag.x)*.26,(event.clientY-drag.y)*.15);
    drag.x = event.clientX; drag.y = event.clientY;
  },listener);
  const releasePointer = () => { drag = undefined; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup',releasePointer,listener);
  canvas.addEventListener('pointercancel',releasePointer,listener);
  canvas.addEventListener('lostpointercapture',releasePointer,listener);
  canvas.addEventListener('keydown',event => {
    const directions = {ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-3],ArrowDown:[0,3]};
    if (directions[event.key]) { event.preventDefault(); rotate(...directions[event.key]); }
    if (event.key === 'Home') { event.preventDefault(); reset(); }
    if (cyclePieces && ['PageUp','PageDown'].includes(event.key)) {
      event.preventDefault();
      const total = (product.ingredients || []).length+1;
      select((active+1+total+(event.key==='PageDown' ? 1 : -1))%total-1);
    }
  },listener);
  canvas.addEventListener('webglcontextlost',event => {event.preventDefault(); loading?.abort(); version++; renderer = null; mode('image');},listener);
  canvas.addEventListener('webglcontextrestored',() => { if (!closed) load(displayed); },listener);

  select(-1,false);
  return {select,display,rotate,reset,get index() {return active;},destroy() {
    if (closed) return;
    closed = true; version++; loading?.abort(); signals.abort(); resize.disconnect();
    renderer?.destroy();meshes.clear();holder.remove();delete host.dataset.viewerMode;
  }};
}
