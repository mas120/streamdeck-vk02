import assert from 'node:assert/strict';
import test from 'node:test';
import { volumeValueFromKey } from './volume-controls.js';

test('volume slider supports arrows, larger steps, and endpoints', () => {
  assert.equal(volumeValueFromKey(50, 'ArrowRight'), 51);
  assert.equal(volumeValueFromKey(50, 'ArrowDown'), 49);
  assert.equal(volumeValueFromKey(50, 'ArrowUp', true), 55);
  assert.equal(volumeValueFromKey(50, 'PageUp'), 60);
  assert.equal(volumeValueFromKey(50, 'PageDown'), 40);
  assert.equal(volumeValueFromKey(50, 'Home'), 0);
  assert.equal(volumeValueFromKey(50, 'End'), 100);
});

test('volume slider clamps values and ignores unrelated keys', () => {
  assert.equal(volumeValueFromKey(100, 'ArrowRight'), 100);
  assert.equal(volumeValueFromKey(0, 'ArrowLeft'), 0);
  assert.equal(volumeValueFromKey(40, 'Enter'), null);
});
