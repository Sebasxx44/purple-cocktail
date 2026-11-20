import {escape as h} from './shared.mjs';
import {stackLayout} from './stack-layout.mjs';

const bread='bun', breadParts=['bun-bottom','bun-top'];
// Keep even hand-edited localStorage orders within a bounded mesh budget.
const maxPortions=24;
const groupKey=key=>breadParts.includes(key)?bread:key;
const order=['serving-bowl','bun-bottom','fries','smash-sauce','house-sauce','patty','american-cheese','mozzarella','cream-cheese','sausage','american-cheese-sauce','cheddar','pickles','bacon','bacon-bits','bacon-jam','whisky-bacon','wine-onion','crispy-onion','bbq','bun-top'];

function recipeLayers(recipe) {
  return recipe.layers.flatMap(layer=>Array(layer.qty||1).fill(layer.key));
}
export function ingredientGroups(recipe) {
  if (!recipe) return [];
  const base=new Map();
  for (const key of recipeLayers(recipe)) {
    if (key==='bun-top' || key==='serving-bowl') continue;
    const group=groupKey(key);
    base.set(group,(base.get(group)||0)+1);
  }
  for (const key of recipe.optional||[]) if (!base.has(groupKey(key))) base.set(groupKey(key),0);
  return [...base].map(([key,included])=>({key,included,maximum:key===bread?included:maxPortions}));
}
export function normalizeChanges(recipe,raw) {
  if (!recipe || !raw || typeof raw!=='object') return {};
  const changes={};
  for (const {key,included,maximum} of ingredientGroups(recipe)) {
    if (!Object.hasOwn(raw,key) || !Number.isInteger(raw[key])) continue;
    const count=Math.max(0,Math.min(maximum,raw[key]+included));
    if (count!==included) changes[key]=count-included;
  }
  return changes;
}
const artKey=key=>key===bread?'bun-top':key;
const pieceName=(key,assets)=>key===bread?'Pan':assets[artKey(key)]?.name||key;
export function recipeNotes(recipe,changes,assets) {
  return ingredientGroups(recipe).flatMap(({key,included})=>{
    const delta=changes?.[key]||0, name=pieceName(key,assets).toLocaleLowerCase('es-CO');
    if (!delta) return [];
    if (delta>0) return ['Extra de '+name+(delta>1?' × '+delta:'')];
    return [included+delta===0?'Sin '+name:name.charAt(0).toUpperCase()+name.slice(1)+' × '+(included+delta)+' de '+included];
  });
}
export const needsQuote=changes=>Object.values(changes||{}).some(delta=>delta>0);

export function burgerAssembly(product,recipe,assets,raw) {
  const changes=normalizeChanges(recipe,raw),remaining={...changes},keys=[];
  const layers=recipeLayers(recipe);
  for (const key of layers) {
    if (breadParts.includes(key) && changes[bread]<0) continue;
    if (remaining[key]<0) {remaining[key]++;continue;}
    keys.push(key);
  }
  for (const [key,delta] of Object.entries(changes)) {
    if (delta<=0) continue;
    let i=keys.lastIndexOf(key);
    if (i<0) {
      i=keys.findIndex(existing=>order.indexOf(existing)>order.indexOf(key));
      if (i<0) i=keys.length;
    } else i++;
    keys.splice(i,0,...Array(delta).fill(key));
  }
  const edibleCount=keys.length;
  if(recipe.support && keys.length)keys.unshift(recipe.support);
  return {name:product.name, type:recipe.type, stack:keys.filter(key=>assets[key]).map(key=>({key,piece:assets[key]})), edibleCount, changes};
}
export function stackPicture(assembly,spread=0,large=false) {
  const f=stackLayout(assembly.stack,spread,assembly.type);
  return '<svg class="stack-picture" viewBox="'+[f.left,f.top,f.width,f.height].join(' ')+'" aria-hidden="true" focusable="false">'+
    f.items.map(({piece,x,y,width,height})=>'<image href="'+h(large?piece.image:piece.imageSmall||piece.image)+'" x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" preserveAspectRatio="none"/>').join('')+'</svg>';
}
