import {escape as h,icon} from './shared.mjs';
import {burgerRecipes} from './burger-recipes.mjs';
import {ingredientGroups} from './burger.mjs';
import {choiceKey,choiceLabel,flavorThemes} from './product-options.mjs';

const ice='/showcase/ingredients/hielo.webp';
function drinkBase(p,art,options) {
  const list=[{name:'Hielo granizado',image:ice}];
  const add=(name,key)=>list.push({name,image:options[key]?.imageSmall});
  if(p.slug.includes('todos-los-toping')) {
    add('Base con licor a elección');add('Dulces','dulces');add('Perlas','perlas');add('Jeringa de licor','jeringa-licor');
  } else if(p.slug.includes('sin-licor')) {
    add(p.description?.match(/fresa.*mora azul/is)?'Base de fresa o mora azul, según disponibilidad':'Base de granizado sin licor');
  } else {
    const key=Object.keys(flavorThemes).find(k=>p.slug.includes(k.split('-')[0]));
    const spirits=(p.name.match(/brandy|vodka|tequila/gi)||[]).map(choiceLabel);
    if(key==='smirnoff-vodka')add('Vodka Smirnoff',key);
    else {
      add(flavorThemes[key]?.name||art.name||'Base de granizado',key);
      if(spirits.length)spirits.forEach(spirit=>add(spirit));
      else add('Base con licor');
    }
  }
  return list;
}
export function recipeItems(p,art,burgerLayers,options,variant,extra) {
  const recipe=burgerRecipes[p.slug];
  if(recipe) {
    return ingredientGroups(recipe).filter(item=>item.included>0).map(({key,included})=>{
      const piece=burgerLayers[key==='bun'?'bun-top':key];
      return {name:key==='bun'?'Pan brioche':piece?.name||key,image:piece?.imageSmall,quantity:included};
    });
  }
  let list;
  if(art.ingredients?.length)list=art.ingredients.map(({name,image})=>({name,image}));
  else if(p.ingredients?.length)list=p.ingredients.map(name=>({name}));
  else if(/^granizado\b/i.test(p.name))list=drinkBase(p,art,options);
  else return [];
  if(variant) {
    const key=choiceKey(variant),selected={name:choiceLabel(variant.label),image:options[key]?.imageSmall};
    const base=list.findIndex(item=>/a elecci[oó]n/i.test(item.name));
    if(base>=0 && flavorThemes[key])list[base]=selected;else list.push(selected);
  }
  if(extra)list.push({name:'Jeringa extra de licor',image:options['jeringa-licor']?.imageSmall});
  return list;
}
export function recipeList(items) {
  return items.map(item=>'<li>'+(item.image?'<img src="'+h(item.image)+'" loading="lazy" decoding="async" alt="">':'')+'<span>'+h(item.name)+'</span>'+(item.quantity>1?'<b aria-label="'+item.quantity+' porciones">×'+item.quantity+'</b>':'')+'</li>').join('');
}
export function disclosure(items,expanded=false) {
  if(!items.length)return '';
  return '<details class="ingredient-list"'+(expanded?' open':'')+'><summary>'+icon('list')+'<span>Ver ingredientes</span>'+icon('down','disclosure-mark')+'</summary><ul>'+recipeList(items)+'</ul></details>';
}
