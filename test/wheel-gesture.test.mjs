import test from 'node:test';
import assert from 'node:assert/strict';
import {wheelGesture} from '../web/wheel-gesture.mjs';

function steps(samples,mode=0) {
  const wheel=wheelGesture();
  return samples.filter(([time,delta])=>wheel.read(delta,mode,time)==='step').map(([time])=>time);
}

test('one product for a diagonal trackpad gesture with a delayed, noisy tail',()=>{
  assert.deepEqual(steps([[0,2],[12,9],[24,65],[42,92],[62,48],[80,20],[245,13],[260,14],[276,-2],[295,7],[311,3],[335,1]]),[12]);
});

test('a new swipe responds as its magnitude rises, including after fine momentum',()=>{
  assert.deepEqual(steps([[0,62],[18,86],[80,18],[122,2],[146,1],[184,4],[201,34],[223,65]]),[0,201]);
});

test('separate wheel notches and a deliberate reversal each move one product',()=>{
  assert.deepEqual(steps([[0,100],[160,100],[330,-100],[370,-30],[397,-2]]),[0,160,330]);
  assert.deepEqual(steps([[0,48],[18,32],[34,16],[244,48]],1),[0,244]);
  assert.deepEqual(steps([[0,-610],[250,-85]]),[0,250]);
});
