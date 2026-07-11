const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePeerSocketId } = require('../utils/socketRouting');

test('routes offer and answer to the peer socket', () => {
  const call = {
    callerSocketId: 'caller-socket',
    receiverSocketId: 'receiver-socket'
  };

  assert.equal(resolvePeerSocketId({ socketId: 'caller-socket', call }), 'receiver-socket');
  assert.equal(resolvePeerSocketId({ socketId: 'receiver-socket', call }), 'caller-socket');
});

test('falls back to explicit target socket when provided', () => {
  const call = {
    callerSocketId: 'caller-socket',
    receiverSocketId: 'receiver-socket'
  };

  assert.equal(resolvePeerSocketId({ socketId: 'unknown-socket', call, fallbackSocketId: 'fallback' }), 'fallback');
});
