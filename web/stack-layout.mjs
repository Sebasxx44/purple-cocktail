// All measurements use one bun diameter. Each photograph includes the visible
// top of its layer, so its silhouette is taller than its stacking thickness.
export function stackLayout(layers, spread = 0, type = 'burger') {
  let height = 0, left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const panorama = type === 'fries';
  const items = layers.map(({piece, key}, i) => {
    const width = piece.width, visible = piece.height, thickness = piece.thickness;
    const garnish = panorama && key !== 'fries' && key !== 'serving-bowl';
    const x = garnish ? Math.sin(i * 2.4) * .055 * (1 - spread) : 0;
    const center = height + thickness / 2;
    const rect = {key, piece, x: x - width/2, y: -center - visible/2, width, height: visible};
    height += (piece.stackAdvance??thickness) * (garnish ? .50 : 1) + .17 * spread;
    left = Math.min(left,rect.x); right = Math.max(right,rect.x+width);
    top = Math.min(top,rect.y); bottom = Math.max(bottom,rect.y+visible);
    return rect;
  });
  return items.length ? {items, left, top, width:right-left, height:bottom-top} : {items, left:0, top:0, width:1, height:1};
}
