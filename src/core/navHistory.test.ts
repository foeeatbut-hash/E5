import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canNavBack,
  canNavForward,
  createNavHistory,
  pushNavLocation,
  stepNavHistory,
} from './navHistory.ts';

test('nav history records sheet jumps and walks back / forward', () => {
  let h = createNavHistory({ sheetId: 's1' });
  assert.equal(canNavBack(h), false);
  h = pushNavLocation(h, { sheetId: 's2', deviceId: 'd1' });
  h = pushNavLocation(h, { sheetId: 's3' });
  assert.equal(h.entries.length, 3);
  const back = stepNavHistory(h, -1);
  assert.deepEqual(back.location, { sheetId: 's2', deviceId: 'd1' });
  assert.equal(canNavForward(back.state), true);
  const fwd = stepNavHistory(back.state, 1);
  assert.deepEqual(fwd.location, { sheetId: 's3', deviceId: null });
  assert.equal(stepNavHistory(fwd.state, 1).location, null);
});

test('deselecting on the same sheet adds no entry, first selection refines the current one', () => {
  let h = createNavHistory({ sheetId: 's1' });
  h = pushNavLocation(h, { sheetId: 's1', deviceId: 'd1' });
  assert.deepEqual(h.entries, [{ sheetId: 's1', deviceId: 'd1' }]);
  h = pushNavLocation(h, { sheetId: 's1', deviceId: null });
  assert.equal(h.entries.length, 1);
  h = pushNavLocation(h, { sheetId: 's1', deviceId: 'd2' });
  assert.equal(h.entries.length, 2);
  h = pushNavLocation(h, { sheetId: 's1', deviceId: 'd2' });
  assert.equal(h.entries.length, 2);
});

test('pushing after going back drops the forward branch; limit trims the oldest', () => {
  let h = createNavHistory({ sheetId: 's1' });
  h = pushNavLocation(h, { sheetId: 's2' });
  h = pushNavLocation(h, { sheetId: 's3' });
  h = stepNavHistory(h, -1).state;
  h = pushNavLocation(h, { sheetId: 's4' });
  assert.deepEqual(h.entries.map((e) => e.sheetId), ['s1', 's2', 's4']);
  assert.equal(canNavForward(h), false);
  for (let i = 0; i < 10; i++) h = pushNavLocation(h, { sheetId: `x${i}` }, 5);
  assert.equal(h.entries.length, 5);
  assert.equal(h.index, 4);
  assert.equal(h.entries[4].sheetId, 'x9');
});

test('stepping skips entries of deleted sheets', () => {
  let h = createNavHistory({ sheetId: 's1' });
  h = pushNavLocation(h, { sheetId: 's2' });
  h = pushNavLocation(h, { sheetId: 's3' });
  const res = stepNavHistory(h, -1, (id) => id !== 's2');
  assert.equal(res.location?.sheetId, 's1');
});
