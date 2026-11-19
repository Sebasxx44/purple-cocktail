// Coordinates use the top-left corner of the photographed cup as their origin.
export function composition(width,height,layers=[]) {
  let left=0,top=0,right=width,bottom=height;
  const objects=layers.map(layer=>{
    const w=width*layer.width,h=w/layer.aspect;
    const x=width*layer.x-w*layer.pinX,y=height*layer.y-h*layer.pinY;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+w);bottom=Math.max(bottom,y+h);
    return {x,y,width:w,height:h};
  });
  return {objects,left,top,width:right-left,height:bottom-top};
}
