import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addQuickAccessAction,
  DEFAULT_FOCUS_QUICK_ACCESS_IDS,
  hasQuickAccessAction,
  loadFocusQuickAccess,
  moveQuickAccessAction,
  normalizeFocusQuickAccessIds,
  removeQuickAccessAction,
  resetFocusQuickAccess,
  saveFocusQuickAccess,
} from './focusQuickAccess.ts';

test('normalizeFocusQuickAccessIds deduplicates, filters invalid ids, and preserves empty custom list', () => {
  assert.deepEqual(
    normalizeFocusQuickAccessIds(['tool_select', 'bogus_id', 'tool_select', 'open_stamp_editor']),
    ['tool_select', 'open_stamp_editor']
  );
  assert.deepEqual(normalizeFocusQuickAccessIds([]), []);
  assert.deepEqual(normalizeFocusQuickAccessIds(null), DEFAULT_FOCUS_QUICK_ACCESS_IDS);
});

test('add, remove, move, and reset quick access items work deterministically and idempotently', () => {
  const base = resetFocusQuickAccess();
  assert.equal(hasQuickAccessAction(base, 'tool_wire'), true);
  assert.equal(hasQuickAccessAction(base, 'open_hvac_wizard'), false);

  const added = addQuickAccessAction(base, 'open_hvac_wizard');
  assert.equal(added.length, base.length + 1);
  assert.equal(hasQuickAccessAction(added, 'open_hvac_wizard'), true);
  // Idempotent duplicate add
  assert.equal(addQuickAccessAction(added, 'open_hvac_wizard'), added);

  const movedUp = moveQuickAccessAction(added, 'open_hvac_wizard', -1);
  assert.equal(movedUp[movedUp.length - 2], 'open_hvac_wizard');
  // Out-of-bounds move is a no-op
  assert.equal(moveQuickAccessAction(movedUp, movedUp[0], -1), movedUp);

  const removed = removeQuickAccessAction(movedUp, 'tool_measure');
  assert.equal(hasQuickAccessAction(removed, 'tool_measure'), false);
  assert.equal(removeQuickAccessAction(removed, 'tool_measure'), removed);
});

test('loadFocusQuickAccess and saveFocusQuickAccess round-trip through Storage', () => {
  const map = new Map<string, string>();
  const mockStorage: Pick<Storage, 'getItem' | 'setItem'> = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };

  assert.deepEqual(loadFocusQuickAccess(mockStorage), DEFAULT_FOCUS_QUICK_ACCESS_IDS);
  const custom = removeQuickAccessAction(
    addQuickAccessAction(DEFAULT_FOCUS_QUICK_ACCESS_IDS, 'run_erc'),
    'tool_pan'
  );
  saveFocusQuickAccess(custom, mockStorage);
  assert.deepEqual(loadFocusQuickAccess(mockStorage), custom);
});
