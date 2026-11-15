import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Grid3X3,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeft,
  Plus,
} from 'lucide-react';
import {
  type CommandLineResolution,
  type CommandPaletteItem,
  filterBottomCommandItems,
  pushCommandHistory,
  stepCommandHistory,
} from '../core/commandPalette';
import type { ViewportLayoutMode } from '../core/dockLayout';
import type { CadTool, E3Project } from '../core/e3Types';
import { isMinimapEnabled, type FocusLayoutMetrics } from '../core/focusLayout';
import {
  DEFAULT_FOCUS_QUICK_ACCESS_IDS,
  type FocusQuickActionId,
  getFocusQuickActionDef,
} from '../core/focusQuickAccess';
import {
  FocusQuickAccessMenu,
  type FocusQuickAccessMenuState,
  renderFocusQuickAccessIcon,
} from './FocusQuickAccessMenu';

const CMD_HISTORY_STORAGE_KEY = 'e3promax_cmd_history_v1';

function loadSavedCommandHistory(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CMD_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function useCadCommandBar(
  commandPaletteItems: CommandPaletteItem[],
  onExecuteCommandLine?: (rawCommand: string) => CommandLineResolution
) {
  const [cmdValue, setCmdValue] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>(() => loadSavedCommandHistory());
  const [cmdHistIdx, setCmdHistIdx] = useState<number>(-1);
  const [cmdSavedDraft, setCmdSavedDraft] = useState<string>('');
  const [cmdFocused, setCmdFocused] = useState<boolean>(false);
  const [cmdFeedback, setCmdFeedback] = useState<{
    status: CommandLineResolution['status'];
    text: string;
  } | null>(null);
  const cmdInputRef = useRef<HTMLInputElement | null>(null);
  const cmdFeedbackTimerRef = useRef<number | null>(null);

  const [activeHintIdx, setActiveHintIdx] = useState(0);
  const [hintNavigated, setHintNavigated] = useState(false);

  const matchingCmdHints = useMemo(() => {
    if (!cmdFocused || commandPaletteItems.length === 0) return [];
    const q = cmdValue.trim();
    if (!q) {
      if (cmdFeedback) return [];
      return filterBottomCommandItems(commandPaletteItems, '').slice(0, 7);
    }
    return filterBottomCommandItems(commandPaletteItems, q).slice(0, 8);
  }, [cmdFocused, cmdValue, cmdFeedback, commandPaletteItems]);

  useEffect(() => {
    setActiveHintIdx(0);
    setHintNavigated(false);
  }, [cmdValue]);

  const showCmdFeedback = useCallback(
    (status: CommandLineResolution['status'], text: string) => {
      if (cmdFeedbackTimerRef.current) {
        window.clearTimeout(cmdFeedbackTimerRef.current);
      }
      setCmdFeedback({ status, text });
      cmdFeedbackTimerRef.current = window.setTimeout(() => {
        setCmdFeedback(null);
      }, 3600);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (cmdFeedbackTimerRef.current) window.clearTimeout(cmdFeedbackTimerRef.current);
    };
  }, []);

  const executeCanvasCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const nextHist = pushCommandHistory(cmdHistory, trimmed);
      setCmdHistory(nextHist);
      try {
        window.localStorage?.setItem(CMD_HISTORY_STORAGE_KEY, JSON.stringify(nextHist));
      } catch {
        // Ignore storage failure
      }
      setCmdHistIdx(-1);
      setCmdSavedDraft('');
      setCmdValue('');
      setActiveHintIdx(0);
      setHintNavigated(false);
      const res = onExecuteCommandLine?.(trimmed);
      if (res) {
        showCmdFeedback(res.status, res.message);
      }
    },
    [cmdHistory, onExecuteCommandLine, showCmdFeedback]
  );

  const applyOrExecuteHint = useCallback(
    (hint: CommandPaletteItem) => {
      if (hint.disabled) return;
      const keyword = hint.commandKeyword || hint.keywords[0] || hint.title;
      if (hint.requiresArg) {
        setCmdValue(keyword);
        setHintNavigated(false);
        setActiveHintIdx(0);
        window.requestAnimationFrame(() => {
          const el = cmdInputRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(keyword.length, keyword.length);
          }
        });
        return;
      }
      executeCanvasCommand(keyword);
    },
    [executeCanvasCommand]
  );

  const handleCmdKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.ctrlKey || e.metaKey) && ['k', 's', '\\'].includes(e.key.toLowerCase())) {
        return;
      }
      e.stopPropagation();
      if (e.key === 'Tab' && matchingCmdHints.length > 0) {
        e.preventDefault();
        const hint = matchingCmdHints[activeHintIdx] || matchingCmdHints[0];
        if (hint) {
          const keyword = hint.commandKeyword || (hint.keywords[0] || '').toUpperCase();
          setCmdValue(keyword);
          setHintNavigated(false);
          setActiveHintIdx(0);
          window.requestAnimationFrame(() => {
            e.currentTarget.setSelectionRange(keyword.length, keyword.length);
          });
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (hintNavigated && matchingCmdHints[activeHintIdx]) {
          applyOrExecuteHint(matchingCmdHints[activeHintIdx]);
          return;
        }
        if (cmdValue.trim()) {
          executeCanvasCommand(cmdValue);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        if (cmdValue.trim().length > 0 && matchingCmdHints.length > 0 && cmdHistIdx === -1) {
          e.preventDefault();
          setHintNavigated(true);
          setActiveHintIdx((prev) => (prev - 1 + matchingCmdHints.length) % matchingCmdHints.length);
          return;
        }
        const el = e.currentTarget;
        const len = el.value.length;
        const atEnd =
          (el.selectionStart ?? len) === len && (el.selectionEnd ?? len) === len;
        if (atEnd) {
          e.preventDefault();
          const step = stepCommandHistory(
            cmdHistory,
            cmdHistIdx,
            'up',
            cmdValue,
            cmdSavedDraft
          );
          setCmdHistIdx(step.nextIndex);
          setCmdValue(step.nextValue);
          setCmdSavedDraft(step.nextSavedDraft);
          window.requestAnimationFrame(() => {
            el.setSelectionRange(step.nextValue.length, step.nextValue.length);
          });
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        if (cmdHistIdx === -1 && matchingCmdHints.length > 0 && (cmdValue.trim().length > 0 || hintNavigated)) {
          e.preventDefault();
          setHintNavigated(true);
          setActiveHintIdx((prev) => (prev + 1) % matchingCmdHints.length);
          return;
        }
        const el = e.currentTarget;
        const len = el.value.length;
        const atEnd =
          (el.selectionStart ?? len) === len && (el.selectionEnd ?? len) === len;
        if (atEnd && cmdHistIdx !== -1) {
          e.preventDefault();
          const step = stepCommandHistory(
            cmdHistory,
            cmdHistIdx,
            'down',
            cmdValue,
            cmdSavedDraft
          );
          setCmdHistIdx(step.nextIndex);
          setCmdValue(step.nextValue);
          setCmdSavedDraft(step.nextSavedDraft);
          window.requestAnimationFrame(() => {
            el.setSelectionRange(step.nextValue.length, step.nextValue.length);
          });
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCmdValue('');
        setCmdHistIdx(-1);
        setCmdSavedDraft('');
        setCmdFeedback(null);
        setHintNavigated(false);
        e.currentTarget.blur();
      }
    },
    [
      activeHintIdx,
      applyOrExecuteHint,
      cmdHistory,
      cmdHistIdx,
      cmdSavedDraft,
      cmdValue,
      executeCanvasCommand,
      hintNavigated,
      matchingCmdHints,
    ]
  );

  return {
    cmdValue,
    setCmdValue,
    cmdHistIdx,
    setCmdHistIdx,
    setCmdFocused,
    cmdFeedback,
    cmdInputRef,
    matchingCmdHints,
    activeHintIdx,
    setActiveHintIdx,
    hintNavigated,
    setHintNavigated,
    applyOrExecuteHint,
    handleCmdKeyDown,
  };
}

interface FocusToolRailProps {
  tool: CadTool;
  vs: E3Project['visualSettings'];
  viewportLayout: ViewportLayoutMode;
  layerPopoverOpen?: boolean;
  totalSelectedCount?: number;
  selectedDeviceCount?: number;
  hasClipboard?: boolean;
  sheetCount: number;
  focusLayout: FocusLayoutMetrics;
  focusQuickAccessIds?: FocusQuickActionId[];
  focusExplorerOpen?: boolean;
  onToggleFocusExplorer?: () => void;
  canvasFocusActive?: boolean;
  onToggleCanvasFocus?: () => void;
  onSetTool: (tool: CadTool) => void;
  onExecuteQuickAction?: (id: FocusQuickActionId) => void;
  onRemoveQuickAccess?: (id: FocusQuickActionId) => void;
  onMoveQuickAccess?: (id: FocusQuickActionId, delta: -1 | 1) => void;
  onResetQuickAccess?: () => void;
  onRotateSelected?: () => void;
  onFitViewport?: () => void;
  onToggleGrid?: () => void;
  motionLayoutScopeId?: string;
}

export const FocusToolRail: React.FC<FocusToolRailProps> = ({
  tool,
  vs,
  viewportLayout,
  layerPopoverOpen = false,
  totalSelectedCount = 0,
  selectedDeviceCount = 0,
  hasClipboard = false,
  sheetCount,
  focusLayout,
  focusQuickAccessIds,
  focusExplorerOpen = false,
  onToggleFocusExplorer,
  canvasFocusActive = false,
  onToggleCanvasFocus,
  onSetTool,
  onExecuteQuickAction,
  onRemoveQuickAccess,
  onMoveQuickAccess,
  onResetQuickAccess,
  onRotateSelected,
  onFitViewport,
  onToggleGrid,
  motionLayoutScopeId = '0',
}) => {
  const [railQuickMenu, setRailQuickMenu] = useState<FocusQuickAccessMenuState | null>(null);
  const quickIds = focusQuickAccessIds ?? DEFAULT_FOCUS_QUICK_ACCESS_IDS;
  const hasAnySel = totalSelectedCount > 0;

  const isQuickActive = (id: FocusQuickActionId): boolean => {
    switch (id) {
      case 'tool_select': return tool === 'select';
      case 'tool_wire': return tool === 'wire';
      case 'tool_measure': return tool === 'measure';
      case 'tool_pan': return tool === 'pan';
      case 'tool_rect': return tool === 'rect';
      case 'tool_callout': return tool === 'callout';
      case 'tool_text': return tool === 'text';
      case 'tool_offpage': return tool === 'offpage';
      case 'toggle_grid': return vs.showGrid;
      case 'toggle_snap': return vs.snapToGrid;
      case 'toggle_crosshair': return vs.showCrosshair !== false;
      case 'toggle_pins': return vs.showPinNumbers;
      case 'toggle_wires': return vs.showWireNumbers;
      case 'toggle_crossrefs': return vs.showCrossRefs;
      case 'toggle_frame': return vs.showGostFrame;
      case 'toggle_bridges': return vs.wireCrossingBridge !== false;
      case 'toggle_minimap': return isMinimapEnabled(vs);
      case 'viewport_single': return viewportLayout === 'single';
      case 'viewport_two': return viewportLayout === 'two';
      case 'viewport_three': return viewportLayout === 'three';
      case 'viewport_four': return viewportLayout === 'four';
      case 'open_layers': return layerPopoverOpen;
      default: return false;
    }
  };

  const isQuickDisabled = (id: FocusQuickActionId): boolean => {
    switch (id) {
      case 'edit_copy':
      case 'action_rotate':
      case 'edit_delete':
      case 'mirror_x':
      case 'mirror_y':
        return !hasAnySel;
      case 'edit_paste':
        return !hasClipboard;
      case 'align_left':
      case 'align_center':
      case 'align_top':
      case 'align_middle':
        return selectedDeviceCount < 2;
      case 'delete_sheet':
        return sheetCount <= 1;
      default:
        return false;
    }
  };

  const handleQuickClick = (id: FocusQuickActionId) => {
    if (onExecuteQuickAction) {
      onExecuteQuickAction(id);
      return;
    }
    if (id === 'tool_select') onSetTool('select');
    else if (id === 'tool_wire') onSetTool('wire');
    else if (id === 'tool_measure') onSetTool('measure');
    else if (id === 'tool_pan') onSetTool('pan');
    else if (id === 'tool_text') onSetTool('text');
    else if (id === 'tool_callout') onSetTool('callout');
    else if (id === 'tool_rect') onSetTool('rect');
    else if (id === 'tool_offpage') onSetTool('offpage');
    else if (id === 'action_rotate') onRotateSelected?.();
    else if (id === 'action_fit') onFitViewport?.();
    else if (id === 'toggle_grid') onToggleGrid?.();
  };

  const columns = useMemo<FocusQuickActionId[][]>(() => {
    const flattened = focusLayout.toolRailColumns.flat();
    if (
      focusLayout.toolRailColumns.length > 0 &&
      flattened.length === quickIds.length &&
      flattened.every((id, idx) => id === quickIds[idx])
    ) {
      return focusLayout.toolRailColumns;
    }
    return [quickIds];
  }, [focusLayout.toolRailColumns, quickIds]);

  return (
    <>
      <div
        data-testid="canvas-tool-dock"
        data-rail-columns={columns.length}
        onMouseDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        style={{
          top: focusLayout.toolRailTop,
          left: focusLayout.toolRailLeft,
          minWidth: focusLayout.toolRailWidth,
          maxHeight: focusLayout.toolRailMaxHeight,
        }}
        className="no-print absolute z-30 flex flex-row items-start gap-[4px] p-[4px] rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl transition-[top,max-height] duration-150 overflow-y-auto overflow-x-visible no-scrollbar"
      >
        {columns.map((colIds, colIdx) => (
          <React.Fragment key={colIdx}>
            {colIdx > 0 && (
              <span
                data-testid={`canvas-tool-dock-col-sep-${colIdx}`}
                className="w-px self-stretch bg-[var(--flux-line)]/80 my-[2px] shrink-0"
              />
            )}
            <div
              data-testid={`canvas-tool-dock-col-${colIdx}`}
              className="flex flex-col items-center gap-[2px] shrink-0"
            >
              {colIdx === 0 && onToggleFocusExplorer && (
                <>
                  <button
                    type="button"
                    data-testid="focus-left-edge-tab"
                    aria-pressed={focusExplorerOpen}
                    title="Навигатор проекта и база компонентов (Ctrl+\)"
                    aria-label="Устройства и база компонентов"
                    onClick={onToggleFocusExplorer}
                    className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                      focusExplorerOpen
                        ? 'bg-[var(--flux-accent-solid)] text-white shadow-xs'
                        : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                    }`}
                  >
                    <PanelLeft className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
                  </button>
                  {onToggleCanvasFocus && (
                    <button
                      type="button"
                      data-testid="left-focus-canvas-btn"
                      aria-pressed={canvasFocusActive}
                      onClick={onToggleCanvasFocus}
                      title={
                        canvasFocusActive
                          ? 'Фокус холст (нажмите снова, чтобы вернуть панели и прежний вид)'
                          : 'Фокус холст — полноэкранный чертёж'
                      }
                      aria-label={canvasFocusActive ? 'Вернуть прежний вид' : 'Фокус холст'}
                      className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                        canvasFocusActive
                          ? 'bg-[var(--flux-accent-solid)] text-white shadow-xs'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)]'
                      }`}
                    >
                      {canvasFocusActive ? (
                        <Minimize2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
                      ) : (
                        <Maximize2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
                      )}
                    </button>
                  )}
                  <span className="w-[calc(20px*var(--flux-ui-scale))] h-px bg-[var(--flux-line)] my-[2px] shrink-0" />
                </>
              )}

              {colIds.map((actionId, idx) => {
                const def = getFocusQuickActionDef(actionId);
                const active = isQuickActive(actionId);
                const disabled = isQuickDisabled(actionId);
                const prevGroup = idx > 0 ? getFocusQuickActionDef(colIds[idx - 1]).group : def.group;
                const needsDivider = idx > 0 && prevGroup !== def.group;
                const fullTitle = `${def.title}${def.shortcut ? ` (${def.shortcut})` : ''} · ПКМ — настроить`;
                return (
                  <React.Fragment key={actionId}>
                    {needsDivider && (
                      <span className="w-[calc(20px*var(--flux-ui-scale))] h-px bg-[var(--flux-line)] my-[2px] shrink-0" />
                    )}
                    <button
                      type="button"
                      data-testid={`focus-rail-item-${actionId}`}
                      data-quick-access-id={actionId}
                      disabled={disabled}
                      title={fullTitle}
                      aria-label={def.label}
                      aria-pressed={active}
                      onClick={() => handleQuickClick(actionId)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRailQuickMenu({
                          actionId,
                          mode: 'rail',
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      className={`relative inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors disabled:opacity-35 ${
                        active
                          ? 'text-[var(--flux-accent)]'
                          : def.danger
                            ? 'text-[var(--flux-text-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--flux-hover)]/70'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId={`cad-dock-pill-${motionLayoutScopeId}`}
                          transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                          className="absolute inset-0 rounded-[6px] bg-[var(--flux-accent-soft)] border border-[var(--flux-accent)]/35"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center justify-center">
                        {renderFocusQuickAccessIcon(
                          actionId,
                          'w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]'
                        )}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </React.Fragment>
        ))}
      </div>

      <FocusQuickAccessMenu
        menu={railQuickMenu}
        isPinned={true}
        canMoveUp={Boolean(railQuickMenu && quickIds.indexOf(railQuickMenu.actionId) > 0)}
        canMoveDown={Boolean(
          railQuickMenu &&
            (() => {
              const idx = quickIds.indexOf(railQuickMenu.actionId);
              return idx !== -1 && idx < quickIds.length - 1;
            })()
        )}
        onClose={() => setRailQuickMenu(null)}
        onRemove={onRemoveQuickAccess}
        onMove={onMoveQuickAccess}
        onReset={onResetQuickAccess}
      />
    </>
  );
};

interface FocusCommandPillProps {
  centerX?: number;
  maxWidth: number;
  commandPaletteItems?: CommandPaletteItem[];
  onExecuteCommandLine?: (rawCommand: string) => CommandLineResolution;
  inputTestId?: string;
  activeViewportBadge?: string;
}

export const FocusCommandPill: React.FC<FocusCommandPillProps> = ({
  centerX,
  maxWidth,
  commandPaletteItems = [],
  onExecuteCommandLine,
  inputTestId = 'cad-command-input',
  activeViewportBadge,
}) => {
  const {
    cmdValue,
    setCmdValue,
    cmdHistIdx,
    setCmdHistIdx,
    setCmdFocused,
    cmdFeedback,
    cmdInputRef,
    matchingCmdHints,
    activeHintIdx,
    setActiveHintIdx,
    hintNavigated,
    setHintNavigated,
    applyOrExecuteHint,
    handleCmdKeyDown,
  } = useCadCommandBar(commandPaletteItems, onExecuteCommandLine);

  return (
    <div
      data-testid="focus-command-pill"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{ maxWidth, ...(centerX !== undefined ? { left: centerX } : {}) }}
      className={`no-print absolute bottom-3 ${
        centerX !== undefined ? '' : 'left-1/2 '
      }-translate-x-1/2 z-30 w-[min(calc(400px*var(--flux-ui-scale)),92vw)] min-w-0 h-[calc(36px*var(--flux-ui-scale))] rounded-[9px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl px-2 flex items-center gap-1.5`}
    >
      <div className="relative flex-1 flex items-center gap-1.5 h-[calc(26px*var(--flux-ui-scale))] px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-bg)]/85 focus-within:border-[var(--flux-accent)] min-w-0">
        {activeViewportBadge && (
          <span
            data-testid="focus-command-viewport-badge"
            title={`Командная строка привязана к активному окну ${activeViewportBadge}`}
            className="font-mono font-semibold text-[length:calc(9.5px*var(--flux-ui-scale))] px-1 py-0.5 rounded-[3px] bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] shrink-0 leading-none"
          >
            {activeViewportBadge}
          </span>
        )}
        <span className="font-mono font-bold text-[var(--flux-accent)] shrink-0">›</span>
        <input
          ref={cmdInputRef}
          type="text"
          data-testid={inputTestId}
          spellCheck={false}
          autoComplete="off"
          value={cmdValue}
          onChange={(e) => {
            setCmdValue(e.target.value);
            if (cmdHistIdx !== -1) setCmdHistIdx(-1);
          }}
          onFocus={() => setCmdFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setCmdFocused(false), 120);
          }}
          onKeyDown={handleCmdKeyDown}
          placeholder="Команда: ПРОВОД, ВЫБОР, СЕТКА, ВПИСАТЬ…"
          aria-label="Командная строка САПР"
          className="flex-1 w-full min-w-0 bg-transparent text-[length:calc(11px*var(--flux-ui-scale))] font-mono text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]/75 focus:outline-none select-text"
        />
        <span className="hidden xl:inline font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]/75 shrink-0">
          Enter
        </span>

        {cmdFeedback && !cmdValue.trim() && (
          <div
            data-testid="cad-command-feedback"
            className={`absolute left-0 bottom-full mb-2 z-40 px-2.5 py-1.5 rounded-[8px] border flux-glass-popover text-[length:calc(11px*var(--flux-ui-scale))] font-sans whitespace-nowrap max-w-[calc(380px*var(--flux-ui-scale))] truncate ${
              cmdFeedback.status === 'ok'
                ? 'border-[var(--flux-accent)]/60 text-[var(--flux-text)]'
                : cmdFeedback.status === 'disabled'
                  ? 'border-amber-500/70 text-amber-700 dark:text-amber-300'
                  : 'border-rose-500/70 text-rose-700 dark:text-rose-300'
            }`}
          >
            {cmdFeedback.text}
          </div>
        )}

        {matchingCmdHints.length > 0 && (
          <div
            data-testid="cad-command-suggestions"
            className="absolute left-0 bottom-full mb-2 z-40 w-[min(calc(370px*var(--flux-ui-scale)),92vw)] rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-popover shadow-xl overflow-hidden font-sans"
          >
            <div className="px-2.5 py-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/70 flex items-center justify-between gap-2 text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
              <span>
                {cmdValue.trim()
                  ? `Доступные команды (${matchingCmdHints.length})`
                  : 'Доступные команды чертежа'}
              </span>
              <span className="font-mono opacity-80">Tab · Enter</span>
            </div>
            <div className="max-h-[calc(210px*var(--flux-ui-scale))] overflow-y-auto divide-y divide-[var(--flux-line)]/50">
              {matchingCmdHints.map((hint, idx) => {
                const isActive = hintNavigated && idx === activeHintIdx;
                const keywordLabel =
                  (hint.commandKeyword || hint.keywords[0] || '').trim().toUpperCase();
                return (
                  <button
                    key={hint.id}
                    type="button"
                    disabled={hint.disabled}
                    data-active={isActive ? 'true' : 'false'}
                    onMouseEnter={() => {
                      setActiveHintIdx(idx);
                      setHintNavigated(true);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyOrExecuteHint(hint);
                    }}
                    className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 transition-colors disabled:opacity-45 ${
                      isActive ? 'bg-[var(--flux-sel)]' : 'hover:bg-[var(--flux-hover)]/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-accent)] shrink-0">
                        {keywordLabel}
                      </span>
                      <span className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate">
                        {hint.commandHint || hint.subtitle}
                      </span>
                    </div>
                    {hint.shortcut && (
                      <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                        {hint.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface FocusStatusPillProps {
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  focusConsoleOpen?: boolean;
  activeViewportBadge?: string;
  coordsSpanRef?: React.Ref<HTMLSpanElement>;
  zoomTextRef?: React.Ref<HTMLSpanElement>;
  zoomValueTestId?: string;
  onZoomStep: (delta: number) => void;
  onToggleGrid?: () => void;
  onToggleSnapToGrid?: () => void;
  onToggleFocusConsole?: () => void;
}

export const FocusStatusPill: React.FC<FocusStatusPillProps> = ({
  zoom,
  showGrid,
  snapToGrid,
  focusConsoleOpen = false,
  activeViewportBadge,
  coordsSpanRef,
  zoomTextRef,
  zoomValueTestId = 'canvas-zoom-value',
  onZoomStep,
  onToggleGrid,
  onToggleSnapToGrid,
  onToggleFocusConsole,
}) => {
  return (
    <div
      data-testid="focus-status-pill"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="no-print absolute bottom-3 right-3 z-30 inline-flex items-center gap-1 h-[calc(36px*var(--flux-ui-scale))] px-2 rounded-[9px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl text-[length:calc(10.5px*var(--flux-ui-scale))] font-mono text-[var(--flux-text-muted)]"
    >
      {activeViewportBadge && (
        <span
          data-testid="focus-status-viewport-badge"
          title={`Статус активного окна ${activeViewportBadge}`}
          className="px-1 py-0.5 rounded-[3px] bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] font-semibold text-[length:calc(9.5px*var(--flux-ui-scale))] leading-none shrink-0"
        >
          {activeViewportBadge}
        </span>
      )}
      <span
        data-testid="canvas-coords"
        className="hidden xl:inline-block min-w-[calc(84px*var(--flux-ui-scale))] tabular-nums whitespace-nowrap"
      >
        <span ref={coordsSpanRef}>X:0 Y:0 мм</span>
      </span>
      {onToggleGrid && (
        <button
          type="button"
          onClick={onToggleGrid}
          title="Сетка чертежа (F9)"
          aria-label="Переключить сетку"
          className={`inline-flex items-center justify-center w-6 h-6 rounded-[4px] shrink-0 transition-colors ${
            showGrid ? 'bg-[var(--flux-sel)] text-[var(--flux-accent)]' : 'hover:bg-[var(--flux-hover)]'
          }`}
        >
          <Grid3X3 className="w-3 h-3" />
        </button>
      )}
      {onToggleSnapToGrid && (
        <button
          type="button"
          data-testid="toggle-snap-grid-btn"
          onClick={onToggleSnapToGrid}
          title="Привязка к сетке (F3)"
          aria-label="Переключить привязку"
          className={`inline-flex items-center justify-center w-6 h-6 rounded-[4px] shrink-0 transition-colors ${
            snapToGrid ? 'bg-[var(--flux-sel)] text-[var(--flux-accent)]' : 'hover:bg-[var(--flux-hover)]'
          }`}
        >
          <Magnet className="w-3 h-3" />
        </button>
      )}
      <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" />
      <button
        type="button"
        onClick={() => onZoomStep(-0.1)}
        aria-label="Уменьшить масштаб"
        className="inline-flex items-center justify-center w-5 h-6 rounded-[4px] shrink-0 hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span
        ref={zoomTextRef}
        data-testid={zoomValueTestId}
        className="min-w-[calc(34px*var(--flux-ui-scale))] px-0.5 text-center tabular-nums text-[var(--flux-text)] shrink-0"
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onZoomStep(0.1)}
        aria-label="Увеличить масштаб"
        className="inline-flex items-center justify-center w-5 h-6 rounded-[4px] shrink-0 hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
      >
        <Plus className="w-3 h-3" />
      </button>
      {onToggleFocusConsole && (
        <>
          <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" />
          <button
            type="button"
            data-testid="focus-console-toggle-btn"
            onClick={onToggleFocusConsole}
            aria-pressed={focusConsoleOpen}
            title="Открыть / скрыть панель ПЭ3, кабелей, ERC, логов и API"
            className={`inline-flex items-center gap-1 h-6 px-2 rounded-[5px] font-sans font-medium whitespace-nowrap shrink-0 transition-colors ${
              focusConsoleOpen
                ? 'bg-[var(--flux-accent-solid)] text-white'
                : 'bg-[var(--flux-surface-alt)] border border-[var(--flux-line)] text-[var(--flux-text)] hover:border-[var(--flux-accent)]'
            }`}
          >
            <span>ПЭ3 · ERC</span>
          </button>
        </>
      )}
    </div>
  );
};
