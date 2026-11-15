/**
 * История переходов по проекту (Alt+← / Alt+→), как в IDE и EPLAN:
 * запоминает пары «лист + выделенное изделие» и позволяет вернуться назад/вперёд.
 */
export interface NavLocation {
  sheetId: string;
  deviceId?: string | null;
}

export interface NavHistoryState {
  entries: NavLocation[];
  index: number;
}

export const NAV_HISTORY_LIMIT = 50;

const sameLocation = (a: NavLocation | undefined, b: NavLocation): boolean =>
  !!a && a.sheetId === b.sheetId && (a.deviceId || null) === (b.deviceId || null);

export function createNavHistory(initial?: NavLocation): NavHistoryState {
  return initial && initial.sheetId
    ? { entries: [{ sheetId: initial.sheetId, deviceId: initial.deviceId || null }], index: 0 }
    : { entries: [], index: -1 };
}

/**
 * Добавляет точку перехода. Снятие выделения на том же листе не создаёт записи,
 * а первое выделение на листе уточняет текущую запись вместо создания новой.
 */
export function pushNavLocation(
  state: NavHistoryState,
  loc: NavLocation,
  limit = NAV_HISTORY_LIMIT
): NavHistoryState {
  if (!loc.sheetId) return state;
  const next: NavLocation = { sheetId: loc.sheetId, deviceId: loc.deviceId || null };
  const current = state.entries[state.index];
  if (sameLocation(current, next)) return state;
  if (current && current.sheetId === next.sheetId) {
    if (!next.deviceId) return state;
    if (!current.deviceId) {
      const entries = state.entries.slice(0, state.index + 1);
      entries[state.index] = next;
      return { entries, index: state.index };
    }
  }
  const entries = [...state.entries.slice(0, state.index + 1), next];
  const overflow = Math.max(0, entries.length - Math.max(2, limit));
  return { entries: overflow ? entries.slice(overflow) : entries, index: entries.length - 1 - overflow };
}

export const canNavBack = (state: NavHistoryState): boolean => state.index > 0;
export const canNavForward = (state: NavHistoryState): boolean =>
  state.index >= 0 && state.index < state.entries.length - 1;

/** Шаг назад (-1) или вперёд (+1), пропуская записи удалённых листов. */
export function stepNavHistory(
  state: NavHistoryState,
  direction: -1 | 1,
  isSheetAlive: (sheetId: string) => boolean = () => true
): { state: NavHistoryState; location: NavLocation | null } {
  let idx = state.index + direction;
  while (idx >= 0 && idx < state.entries.length && !isSheetAlive(state.entries[idx].sheetId)) {
    idx += direction;
  }
  if (idx < 0 || idx >= state.entries.length) return { state, location: null };
  return { state: { entries: state.entries, index: idx }, location: state.entries[idx] };
}
