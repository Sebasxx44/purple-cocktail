import {composition} from '/showcase/composition.js';

async function source(src) {
  const image=new Image();
  image.decoding='async';image.src=src;
  await image.decode();
  return image;
}

export async function exportDrink(assembly) {
  const [base,pieces]=await Promise.all([
    source(assembly.exportImage),
    Promise.all(assembly.layers.map(async layer=>({...layer,image:await source(layer.piece.master||layer.piece.image)})))
  ]);
  const frame=composition(base.naturalWidth,base.naturalHeight,pieces.map(layer=>({...layer,aspect:layer.image.naturalWidth/layer.image.naturalHeight})));
  const pad=Math.max(frame.width,frame.height)*.025;
  const scale=3840/(Math.max(frame.width,frame.height)+2*pad);
  const canvas=document.createElement('canvas');
  canvas.width=Math.round((frame.width+2*pad)*scale);
  canvas.height=Math.round((frame.height+2*pad)*scale);
  const ctx=canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no dispone de lienzo.');
  ctx.imageSmoothingQuality='high';
  ctx.setTransform(scale,0,0,scale,(pad-frame.left)*scale,(pad-frame.top)*scale);
  ctx.drawImage(base,0,0);
  pieces.forEach(({image},i)=>{
    const rect=frame.objects[i];ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height);
  });
  try {
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG no disponible')),'image/png'));
  } finally {canvas.width=canvas.height=1;}
}
