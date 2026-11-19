import test from 'node:test';
import assert from 'node:assert/strict';
import {burgerRecipes} from '../web/burger-recipes.mjs';
import {burgerAssembly,ingredientGroups,normalizeChanges,needsQuote,recipeNotes} from '../web/burger.mjs';
import {capacity,holds,lineKey} from '../web/cart-stock.mjs';
import {stackLayout} from '../web/stack-layout.mjs';

const recipe=burgerRecipes['purple-crispy'];
const pieces=Object.fromEntries([...recipe.layers.map(row=>row.key),...recipe.optional].map(key=>[key,{name:key,width:1,height:.18,thickness:.08}]));
const product={id:'crispy',stock:4,name:'Purple Crispy'};
test('bread controls both halves, patties can be removed individually, and extras are explicit',()=>{
  assert.deepEqual(normalizeChanges(recipe,{bun:-9,patty:-1,pickles:4,bbq:'1',invalid:3}),{bun:-1,patty:-1,pickles:4});
  const {stack,changes}=burgerAssembly(product,recipe,pieces,{bun:-1,patty:-1,pickles:1});
  assert.equal(stack.filter(layer=>layer.key.startsWith('bun-')).length,0);
  assert.equal(stack.filter(layer=>layer.key==='patty').length,1);
  assert.equal(stack.filter(layer=>layer.key==='pickles').length,1);
  assert.equal(burgerAssembly(product,recipe,pieces,{pickles:2}).stack.filter(l=>l.key==='pickles').length,2);
  assert(needsQuote(changes));assert(!needsQuote({bun:-1}));
  assert(recipeNotes(recipe,changes,pieces).includes('Sin pan'));
  const full=burgerAssembly(product,recipe,pieces,{});
  assert.equal(full.stack.length,recipe.layers.length);
  const empty=Object.fromEntries(ingredientGroups(recipe).map(g=>[g.key,-g.included]));
  assert.equal(burgerAssembly(product,recipe,pieces,empty).edibleCount,0);
});
test('different recipes share available burgers while identical recipes merge regardless of selection order',()=>{
  const a={bun:-1,pickles:1},b={pickles:1,bun:-1};
  const key=lineKey(product.id,'','',a);
  assert.equal(key,lineKey(product.id,'','',b));assert.notEqual(key,lineKey(product.id));
  const lines=[{id:product.id,qty:2,changes:b},{id:product.id,qty:1}];
  assert.equal(capacity(product,null,null,holds(lines)),1);
  assert.equal(capacity(product,null,null,holds(lines,key)),3);
});
test('the exploded stack uses the same pieces and includes every silhouette in its frame',()=>{
  const {stack}=burgerAssembly(product,recipe,pieces,{});
  const closed=stackLayout(stack,0),open=stackLayout(stack,1);
  assert(open.height>closed.height);
  assert.deepEqual(open.items.map(r=>r.key),closed.items.map(r=>r.key));
  assert(open.items.every(item=>item.y>=open.top && item.y+item.height<=open.top+open.height+1e-8));
});
