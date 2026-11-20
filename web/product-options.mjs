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
    texture:flavor?.image,layers,displayName:art.displayName || choiceLabel(p.name),
    key:[p.id,variant?.id,extra?.id].join('|')};
}

export const flavorThemes={
  'fresa-vodka':{name:'Fresa',spirit:'Vodka',tone:'#ff344f',light:'#ffbeb2',ink:'#580d28',soft:'#ffe5e8',scene:'fresa-vodka'},
  'mora-azul-tequila':{name:'Mora azul',spirit:'Tequila',tone:'#23b9ff',light:'#b8f5ff',ink:'#083854',soft:'#d9f5ff',scene:'granizado-mora-azul-con-licor-16-onz'},
  'frutos-silvestres':{name:'Frutos silvestres',spirit:'Brandy y vodka',tone:'#dc45cd',light:'#ffbaf3',ink:'#491447',soft:'#f9e4f5',scene:'granizado-licor-frutos-silvestres-brandy-vodka-22-onz'},
  'margarita-tequila':{name:'Margarita',spirit:'Tequila',tone:'#b2eb29',light:'#f1ffb6',ink:'#263b09',soft:'#eff8cd',scene:'margarita-tequila'},
  'smirnoff-vodka':{name:'Smirnoff',spirit:'Vodka',tone:'#b0deff',light:'#f7ffff',ink:'#1d3456',soft:'#e7f3ff',scene:'granizado-licor-smirnoff-vodka-22-onz'}
};

export function choicesMarkup(p,selected,optionArt) {
  if (!p.variants?.length) return '';
  const flavors=p.variants.every(v=>flavorThemes[choiceKey(v)]);
  const title=flavors?'Elige tu sabor':p.variantGroups?.length===1?choiceLabel(p.variantGroups[0].label):'Elige una opción';
  const choices=p.variants.map(v=>{
    const key=choiceKey(v),piece=optionArt[key],theme=flavorThemes[key],canBuy=available(v);
    const style=theme?' style="--swatch:'+theme.tone+';--swatch-soft:'+theme.soft+';--swatch-ink:'+theme.ink+'"':'';
    const label=choiceLabel(v.label),note=!canBuy?'Agotado':v.price!==p.price?money(v.price):'';
    return '<label class="choice-tile"'+style+'><input type="radio" name="product-choice" id="choice-'+h(v.id)+'" value="'+h(v.id)+'" aria-label="'+h(label)+'" data-choice required'+(v.id===selected?' checked':'')+(canBuy?'':' disabled')+'>'+
      '<span class="choice-face">'+(piece?'<img src="'+h(piece.imageSmall||piece.image)+'" alt="" draggable="false" decoding="async">':'')+
      '<span class="choice-label"><b>'+h(theme?.name||label)+'</b>'+(theme?'<small>'+h(theme.spirit)+'</small>':'')+(note?'<small>'+h(note)+'</small>':'')+'</span>'+
      '<i aria-hidden="true">'+icon('check')+'</i></span></label>';
  }).join('');
  return '<fieldset class="choices'+(flavors?' flavor-choices':'')+'"><legend>'+h(title)+'</legend><div class="choice-grid">'+choices+'</div></fieldset>';
}

export function extraMarkup(extra,selected,optionArt,enabled) {
  if (!extra) return '';
  const piece=optionArt['jeringa-licor'];
  return '<label class="extra-choice"><input id="extra-licor" type="checkbox" data-extra'+(selected?' checked':'')+(enabled?'':' disabled')+'>'+
    '<span class="extra-face">'+(piece?'<img alt="" src="'+h(piece.imageSmall)+'">':'')+
    '<span><b>Jeringa extra de licor</b><small>'+(enabled?'+'+h(money(extra.price))+' por vaso':'Agotado')+'</small></span><i aria-hidden="true">'+icon(selected?'check':'plus')+'</i></span></label>';
}
