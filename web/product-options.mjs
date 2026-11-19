import {normalize,readable,escape as h,icon,money} from './shared.mjs';
import {available} from './render.mjs';

export const choiceLabel=text=>readable(text).replace(/toping/gi,'topping');
const keys={
  'fresa vodka':'fresa-vodka','mora azul tequila':'mora-azul-tequila',
  'frutos silvestres brandy vodka':'frutos-silvestres','margarita tequila':'margarita-tequila',
  'smirnoff vodka':'smirnoff-vodka','dulces':'dulces','jeringa mas licor':'jeringa-licor','perlas':'perlas'
};
export const choiceKey=variant=>keys[normalize(variant?.label).trim()];
export const acceptsExtra=p=>p && /granizado/i.test(p.name) && /licor/i.test(p.name) && !/sin licor|combo/i.test(p.name);

export function productAssembly(p,art,config,optionArt,variant,extra) {
  const key=choiceKey(variant), flavor=config?.flavors?.[key];
  const image=flavor?.image || config?.image || art.image || p.cutout || p.image;
  const imageSmall=flavor?.imageSmall || config?.imageSmall || art.imageSmall || p.thumbnail || image;
  const layers=[];
  const choices=[];
  if (config?.anchor && !flavor && optionArt[key]?.anchor) choices.push(key);
  if (config?.anchor && extra && optionArt['jeringa-licor']) choices.push('jeringa-licor');
  for(const [index,k] of choices.entries()) {
    const piece=optionArt[k], two=choices.length>1, rim=config.anchor;
    const shift=two?(index===0?-.13:.19):0;
    layers.push({piece,x:rim.x+shift*rim.width,y:rim.y,
      width:rim.width*(piece.displayWidth||.6),pinX:piece.anchor?.x??.5,pinY:piece.anchor?.y??.8});
  }
  return {...art,name:choiceLabel(p.name),image,imageSmall,model:config?.model || art.model,
    exportImage:flavor?(flavor.master||flavor.image):(config?.master||art.master||image),
    texture:flavor?.image,layers,displayName:art.displayName || choiceLabel(p.name),
    key:[p.id,variant?.id,extra?.id].join('|')};
}

export function choicesMarkup(p,selected,optionArt) {
  if (!p.variants?.length) return '';
  const title=p.variantGroups?.length===1?choiceLabel(p.variantGroups[0].label):'Elige una opción';
  const choices=p.variants.map(v=>{
    const piece=optionArt[choiceKey(v)],active=v.id===selected,canBuy=available(v);
    const price=v.price!==p.price?' · '+money(v.price):'';
    return '<label class="choice-tile"><input type="radio" name="product-choice" id="choice-'+h(v.id)+'" value="'+h(v.id)+'" data-choice required'+(active?' checked':'')+(canBuy?'':' disabled')+'>'+
      '<span class="choice-face">'+(piece?'<img src="'+h(piece.imageSmall||piece.image)+'" alt="" decoding="async">':'')+
      '<span>'+h(choiceLabel(v.label))+(canBuy?h(price):' · Agotado')+'</span><i aria-hidden="true">'+icon('check')+'</i></span></label>';
  }).join('');
  const selectedVariant=p.variants.find(v=>v.id===selected), piece=optionArt[choiceKey(selectedVariant)];
  return '<fieldset class="choices"><legend>'+h(title)+'</legend><div class="choice-grid">'+choices+'</div>'+
    (piece?'<div class="choice-tools"><button type="button" data-inspect-choice aria-label="Ver de cerca '+h(choiceLabel(selectedVariant.label))+'">'+icon('expand')+'Ver de cerca</button>'+
    '<a href="'+h(piece.master)+'" target="_blank" rel="noopener" aria-label="Abrir imagen PNG 4K de '+h(choiceLabel(selectedVariant.label))+'">PNG 4K <span aria-hidden="true">↗</span></a></div>':'')+'</fieldset>';
}

export function extraMarkup(extra,selected,optionArt,enabled) {
  if (!extra) return '';
  const piece=optionArt['jeringa-licor'];
  return '<label class="extra-choice"><input id="extra-licor" type="checkbox" data-extra'+(selected?' checked':'')+(enabled?'':' disabled')+'>'+
    '<span class="extra-face">'+(piece?'<img alt="" src="'+h(piece.imageSmall)+'">':'')+
    '<span><b>Jeringa extra de licor</b><small>'+(enabled?'+'+h(money(extra.price))+' por vaso':'Agotado')+'</small></span><i aria-hidden="true">'+icon(selected?'check':'plus')+'</i></span></label>'+
    (selected && piece?'<div class="choice-tools"><button type="button" data-inspect-extra>'+icon('expand')+'Ver jeringa de cerca</button><a href="'+h(piece.master)+'" target="_blank" rel="noopener" aria-label="Abrir imagen PNG 4K de la jeringa extra">PNG 4K ↗</a></div>':'');
}
