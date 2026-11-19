import test from 'node:test';
import assert from 'node:assert/strict';
import {capacity,holds,lineKey} from '../web/cart-stock.mjs';
import {composition} from '../public/showcase/composition.js';

const berry={id:'berry',stock:5},lime={id:'lime',stock:3};
const drink={id:'slush',stock:6,variants:[berry,lime]},syringe={id:'syringe',stock:3};
const order=[{id:'slush',variant:'berry',qty:2},{id:'slush',variant:'lime',extra:'syringe',qty:1},{id:'syringe',variant:'',qty:1}];
test('customized drinks share stock with other variants and standalone extras',()=>{
  assert.equal(capacity(drink,berry,syringe,holds(order)),1);
  assert.equal(capacity(drink,berry,null,holds(order)),3);
  assert.equal(capacity(drink,lime,syringe,holds(order,lineKey('slush','lime','syringe'))),2);
  assert.notEqual(lineKey('slush','lime'),lineKey('slush','lime','syringe'));
  assert.equal(lineKey('slush','berry'),lineKey('slush','berry',''));
  assert.equal(capacity(drink,null,null,holds(order)),0);
  assert.equal(capacity(drink,berry,{...syringe,available:false},holds(order)),0);
});
test('a topping above the rim remains in the 2D and 3D frame',()=>{
  const scene=composition(100,200,[{x:.6,y:.15,width:.4,pinX:.2,pinY:1,aspect:.5}]);
  assert.deepEqual(scene.objects,[{x:52,y:-50,width:40,height:80}]);
  assert.equal(scene.top,-50);assert.equal(scene.height,250);
});
