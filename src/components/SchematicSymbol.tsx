import React from 'react';
import { resolveSchematicCssFont } from '../core/e3Catalog';
import type { E3Device, E3VisualSettings } from '../core/e3Types';
import type { FsaMatrixData } from '../core/hvacBuilder';

interface SchematicSymbolProps {
  device: E3Device;
  selected: boolean;
  locked?: boolean;
  wiresLocked?: boolean;
  visual: E3VisualSettings;
  wireStartPinKey: string | null;
  hoveredPinKey?: string | null;
  connectedPinKeys: Set<string>;
  highlightedPinKeys?: Set<string>;
  isPotentialHighlighted?: boolean;
  offPageAddress?: string;
  offPageHasTarget?: boolean;
  onOffPageNavigate?: (device: E3Device) => void;
  onSelectDevice: (e: React.MouseEvent, device: E3Device) => void;
  onPinClick: (e: React.MouseEvent, device: E3Device, pinId: string) => void;
  onPinHover?: (device: E3Device, pinId: string | null) => void;
}

export const SchematicSymbol: React.FC<SchematicSymbolProps> = ({
  device,
  selected,
  locked = false,
  wiresLocked = false,
  visual,
  wireStartPinKey,
  hoveredPinKey = null,
  connectedPinKeys,
  highlightedPinKeys,
  isPotentialHighlighted = false,
  offPageAddress,
  offPageHasTarget = false,
  onOffPageNavigate,
  onSelectDevice,
  onPinClick,
  onPinHover,
}) => {
  const cx = device.width / 2;
  const cy = device.height / 2;
  const stroke = selected ? 'var(--flux-accent)' : 'var(--flux-text)';
  const muted = 'var(--flux-text-muted)';
  const kipGreen = '#15803d';
  const sw = Math.max(0.5, visual.symbolStrokeWidth || 1.8);
  const thinSw = Math.max(0.5, Number((sw * 0.72).toFixed(2)));
  const ductSw = Math.max(1, Number((sw * 1.15).toFixed(2)));
  const isRemoved = device.bindingState === 'REMOVED_IN_FLUX';
  const fontCss = resolveSchematicCssFont(visual.fontFamily);

  const renderBody = () => {
    const w = device.width;
    const h = device.height;
    switch (device.category) {
      case 'airflow_arrow': {
        const isOut = device.e3BlockName.includes('OUT');
        return (
          <g>
            <line x1={0} y1={cy} x2={w} y2={cy} stroke={kipGreen} strokeWidth={ductSw} />
            <polygon
              points={isOut ? `${w - 18},${cy - 8} ${w},${cy} ${w - 18},${cy + 8}` : `10,${cy - 8} 28,${cy} 10,${cy + 8}`}
              fill={kipGreen}
            />
          </g>
        );
      }
      case 'damper': {
        const hasHeat =
          device.e3BlockName.includes('HEAT') ||
          device.attributes.some((a) => /обогрев/i.test(a.name) && /да|230/i.test(a.value));
        const ductY = 105;
        return (
          <g>
            {/* Actuator circle (M) above damper */}
            <circle cx={cx} cy={28} r={16} fill="var(--flux-surface)" stroke={kipGreen} strokeWidth={sw} />
            <text
              x={cx}
              y={34}
              textAnchor="middle"
              fill={kipGreen}
              fontSize={14 * visual.fontScale}
              fontWeight={700}
              fontFamily={fontCss}
            >
              M
            </text>
            <line x1={cx} y1={0} x2={cx} y2={12} stroke={kipGreen} strokeWidth={thinSw} />
            <line x1={cx} y1={44} x2={cx} y2={62} stroke={stroke} strokeWidth={sw} />
            {/* Damper frame */}
            <rect
              x={cx - 24}
              y={62}
              width={48}
              height={84}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
            />
            {/* Air inlet/outlet stubs */}
            <line x1={0} y1={ductY} x2={cx - 24} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
            <line x1={cx + 24} y1={ductY} x2={w} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
            {/* Diagonal flap + pivot */}
            <line x1={cx - 16} y1={134} x2={cx + 16} y2={76} stroke={stroke} strokeWidth={sw + 0.5} />
            <circle cx={cx} cy={ductY} r={5} fill={stroke} />
            {hasHeat && (
              <path
                d={`M ${cx - 16} 142 L ${cx - 8} 135 L ${cx} 142 L ${cx + 8} 135 L ${cx + 16} 142`}
                fill="none"
                stroke={kipGreen}
                strokeWidth={thinSw}
              />
            )}
          </g>
        );
      }
      case 'filter': {
        const ductY = 105;
        return (
          <g>
            {/* PDHS circle at top */}
            <circle cx={cx} cy={24} r={14} fill="var(--flux-surface)" stroke={kipGreen} strokeWidth={sw} />
            <text
              x={cx}
              y={28}
              textAnchor="middle"
              fill={kipGreen}
              fontSize={9 * visual.fontScale}
              fontWeight={700}
              fontFamily={fontCss}
            >
              ΔP
            </text>
            <line x1={cx} y1={0} x2={cx} y2={10} stroke={kipGreen} strokeWidth={thinSw} />
            <line x1={cx} y1={38} x2={cx} y2={65} stroke={stroke} strokeWidth={thinSw} strokeDasharray="3 2" />
            {/* Filter box split diagonally green/white (VEZA standard) */}
            <rect x={cx - 24} y={65} width={48} height={80} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <polygon points={`${cx - 24},65 ${cx + 24},65 ${cx - 24},145`} fill={kipGreen} />
            <line x1={cx - 24} y1={145} x2={cx + 24} y2={65} stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={ductY} x2={cx - 24} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
            <line x1={cx + 24} y1={ductY} x2={w} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
          </g>
        );
      }
      case 'heater': {
        const isElec = device.e3BlockName.includes('ELEC') || device.designation.includes('EK');
        const ductY = 90;
        return (
          <g>
            {/* Top freeze protection stem */}
            <line x1={cx} y1={0} x2={cx} y2={46} stroke={kipGreen} strokeWidth={thinSw} />
            <circle cx={cx} cy={22} r={12} fill="var(--flux-surface)" stroke={kipGreen} strokeWidth={thinSw} />
            <text x={cx} y={25} textAnchor="middle" fill={kipGreen} fontSize={8.5 * visual.fontScale} fontWeight={700} fontFamily={fontCss}>
              {isElec ? 'TS' : 'THT'}
            </text>
            {/* Main heater heat exchanger */}
            <rect x={cx - 32} y={46} width={64} height={88} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={ductY} x2={cx - 32} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
            <line x1={cx + 32} y1={ductY} x2={w} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
            {isElec ? (
              <path
                d={`M ${cx - 18} 62 L ${cx + 16} 80 L ${cx - 16} 98 L ${cx + 18} 118`}
                fill="none"
                stroke="#dc2626"
                strokeWidth={sw}
              />
            ) : (
              <g>
                <line x1={cx - 32} y1={46} x2={cx + 32} y2={134} stroke="#dc2626" strokeWidth={sw} />
                <circle cx={cx} cy={ductY} r={12} fill="var(--flux-surface)" stroke="#dc2626" strokeWidth={thinSw} />
                <text x={cx} y={ductY + 4} textAnchor="middle" fill="#dc2626" fontSize={10 * visual.fontScale} fontWeight={700} fontFamily={fontCss}>
                  +
                </text>
              </g>
            )}
            {/* Bottom 3-way mixing valve / protection */}
            <line x1={cx} y1={134} x2={cx} y2={h} stroke={kipGreen} strokeWidth={thinSw} />
            <polygon points={`${cx - 10},148 ${cx + 10},160 ${cx - 10},160 ${cx + 10},148`} fill="var(--flux-surface)" stroke={stroke} strokeWidth={thinSw} />
          </g>
        );
      }
      case 'cooler': {
        const ductY = 90;
        return (
          <g>
            <line x1={cx} y1={0} x2={cx} y2={46} stroke={kipGreen} strokeWidth={thinSw} />
            <rect x={cx - 30} y={46} width={60} height={88} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={ductY} x2={cx - 30} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
            <line x1={cx + 30} y1={ductY} x2={w} y2={ductY} stroke={kipGreen} strokeWidth={ductSw} />
            {/* Cooling symbol (blue diagonals + snowflake) */}
            <line x1={cx - 16} y1={ductY} x2={cx + 16} y2={ductY} stroke="#0284c7" strokeWidth={sw} />
            <line x1={cx} y1={ductY - 16} x2={cx} y2={ductY + 16} stroke="#0284c7" strokeWidth={sw} />
            <line x1={cx - 11} y1={ductY - 11} x2={cx + 11} y2={ductY + 11} stroke="#0284c7" strokeWidth={thinSw} />
            <line x1={cx + 11} y1={ductY - 11} x2={cx - 11} y2={ductY + 11} stroke="#0284c7" strokeWidth={thinSw} />
            <line x1={cx} y1={134} x2={cx} y2={h} stroke={kipGreen} strokeWidth={thinSw} />
          </g>
        );
      }
      case 'fan': {
        const fanCy = 85;
        const r = 30;
        return (
          <g>
            {/* Top DP stem */}
            <line x1={cx} y1={0} x2={cx} y2={fanCy - r} stroke={kipGreen} strokeWidth={thinSw} />
            {/* Duct lines */}
            <line x1={0} y1={fanCy} x2={cx - r} y2={fanCy} stroke={kipGreen} strokeWidth={ductSw} />
            <line x1={cx + r} y1={fanCy} x2={w} y2={fanCy} stroke={kipGreen} strokeWidth={ductSw} />
            {/* GOST centrifugal fan circle with tangential blades */}
            <circle cx={cx} cy={fanCy} r={r} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw + 0.3} />
            <line x1={cx - 18} y1={fanCy - 22} x2={cx + 26} y2={fanCy - 8} stroke={stroke} strokeWidth={sw} />
            <line x1={cx - 18} y1={fanCy + 22} x2={cx + 26} y2={fanCy + 8} stroke={stroke} strokeWidth={sw} />
            {/* Motor (M) below fan */}
            <line x1={cx} y1={fanCy + r} x2={cx} y2={132} stroke={kipGreen} strokeWidth={thinSw} />
            <circle cx={cx} cy={148} r={16} fill="var(--flux-surface)" stroke={kipGreen} strokeWidth={sw} />
            <text x={cx} y={154} textAnchor="middle" fill={kipGreen} fontSize={14 * visual.fontScale} fontWeight={700} fontFamily={fontCss}>
              M
            </text>
            <line x1={cx} y1={164} x2={cx} y2={h} stroke={kipGreen} strokeWidth={thinSw} />
          </g>
        );
      }
      case 'kip_circle': {
        const isPost = device.e3BlockName.includes('HHS') || device.designation.includes('HHS');
        const circY = isPost ? cy : 44;
        const r = 24;
        const kipCode = isPost
          ? 'HHS'
          : device.designation.includes('PDHS')
          ? 'PDHS'
          : device.designation.includes('THT')
          ? 'THT'
          : 'KIP';
        return (
          <g>
            <line x1={cx} y1={0} x2={cx} y2={circY - r} stroke={kipGreen} strokeWidth={thinSw} />
            <line x1={cx} y1={circY + r} x2={cx} y2={h} stroke={kipGreen} strokeWidth={thinSw} />
            {!isPost && (
              <>
                <line x1={0} y1={90} x2={w} y2={90} stroke={kipGreen} strokeWidth={ductSw} />
                <circle cx={cx} cy={90} r={4} fill={kipGreen} />
              </>
            )}
            <circle cx={cx} cy={circY} r={r} fill="var(--flux-surface)" stroke={kipGreen} strokeWidth={sw} />
            <line x1={cx - r + 2} y1={circY} x2={cx + r - 2} y2={circY} stroke={kipGreen} strokeWidth={thinSw} />
            <text
              x={cx}
              y={circY - 4}
              textAnchor="middle"
              fill={kipGreen}
              fontSize={10.5 * visual.fontScale}
              fontWeight={700}
              fontFamily={fontCss}
            >
              {kipCode}
            </text>
            <text
              x={cx}
              y={circY + 13}
              textAnchor="middle"
              fill={stroke}
              fontSize={9.5 * visual.fontScale}
              fontFamily={fontCss}
            >
              {device.designation.split('-').pop() || '01'}
            </text>
          </g>
        );
      }
      case 'junction_box': {
        const cleanName = device.componentName.replace(/^Полевое подключение:\s*/i, '').trim();
        const cableAttr = device.attributes.find((a) => a.name === 'Марка кабеля')?.value || '';
        const artText = device.article.length > 18 ? `${device.article.slice(0, 17)}…` : device.article;
        const nameText = cleanName.length > 19 ? `${cleanName.slice(0, 18)}…` : cleanName;
        const cabText = cableAttr.length > 19 ? `${cableAttr.slice(0, 18)}…` : cableAttr;
        return (
          <g>
            <rect
              x={4}
              y={4}
              width={w - 8}
              height={h - 16}
              rx={3}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
            />
            <rect x={4} y={4} width={w - 8} height={22} rx={2} fill="var(--flux-bg)" />
            <line x1={4} y1={26} x2={w - 4} y2={26} stroke="var(--flux-line-strong)" strokeWidth={thinSw} />
            <text x={cx} y={19} textAnchor="middle" fill={stroke} fontSize={8.8 * visual.fontScale} fontWeight={600} fontFamily={fontCss}>
              {artText}
            </text>
            <text x={cx} y={40} textAnchor="middle" fill={stroke} fontSize={8.2 * visual.fontScale} fontFamily={fontCss}>
              {nameText}
            </text>
            {cabText && (
              <text x={cx} y={53} textAnchor="middle" fill={kipGreen} fontSize={7.8 * visual.fontScale} fontFamily={fontCss}>
                {cabText}
              </text>
            )}
            {/* Internal terminal points */}
            {[25, 55, 85, 115].map((px, i) => (
              <g key={i}>
                <circle cx={px} cy={66} r={3.5} fill="var(--flux-surface)" stroke={stroke} strokeWidth={thinSw} />
                <line x1={px} y1={69.5} x2={px} y2={h} stroke={stroke} strokeWidth={thinSw} />
              </g>
            ))}
          </g>
        );
      }
      case 'io_matrix': {
        const rawJson = device.attributes.find((a) => a.name === 'FSA_MATRIX_JSON')?.value;
        let data: FsaMatrixData | null = null;
        if (rawJson) {
          try {
            data = JSON.parse(rawJson) as FsaMatrixData;
          } catch {
            data = null;
          }
        }
        const cols = data?.columns || [];
        const leftPanelW = 240;
        const colW = cols.length > 0 ? Math.max(46, Math.floor((w - leftPanelW - 12) / cols.length)) : 60;
        const headerH = 110;
        const rowNames = ['DI', 'DO', 'AI', 'AO', 'Цифр. шина', 'Измерение', 'Регулиров.', 'Сигнализ.', 'Управление'];
        const rowH = 21;
        const tableTop = headerH;
        const tableH = rowNames.length * rowH;

        return (
          <g>
            <rect
              x={0}
              y={0}
              width={w}
              height={h}
              rx={3}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
            />
            {/* Cabinet left vertical box */}
            <rect x={8} y={tableTop} width={54} height={tableH} fill="var(--flux-bg)" stroke={stroke} strokeWidth={thinSw} />
            <text
              x={35}
              y={tableTop + tableH / 2}
              textAnchor="middle"
              fill={stroke}
              fontSize={9.5 * visual.fontScale}
              fontWeight={700}
              fontFamily={fontCss}
              transform={`rotate(-90 35 ${tableTop + tableH / 2})`}
            >
              {data?.cabinetTag || 'ШУ / ПЛК'}
            </text>

            {/* Row headers */}
            <rect x={62} y={tableTop} width={leftPanelW - 62} height={tableH} fill="none" stroke={stroke} strokeWidth={1.1} />
            {rowNames.map((rn, rIdx) => {
              const ry = tableTop + rIdx * rowH;
              const totVal =
                rIdx === 0
                  ? data?.totals.di
                  : rIdx === 1
                  ? data?.totals.do
                  : rIdx === 2
                  ? data?.totals.ai
                  : rIdx === 3
                  ? data?.totals.ao
                  : '';
              const resVal =
                rIdx === 0
                  ? data?.reserve20.di
                  : rIdx === 1
                  ? data?.reserve20.do
                  : rIdx === 2
                  ? data?.reserve20.ai
                  : rIdx === 3
                  ? data?.reserve20.ao
                  : '';
              return (
                <g key={rn}>
                  <line x1={62} y1={ry} x2={w - 8} y2={ry} stroke="var(--flux-line-strong)" strokeWidth={0.9} />
                  <text x={70} y={ry + 14} fill={stroke} fontSize={9.5 * visual.fontScale} fontFamily={fontCss}>
                    {rn}
                  </text>
                  {totVal !== '' && (
                    <text x={leftPanelW - 10} y={ry + 14} textAnchor="end" fill={kipGreen} fontSize={9.5 * visual.fontScale} fontWeight={700} fontFamily={fontCss}>
                      {totVal} ({resVal})
                    </text>
                  )}
                </g>
              );
            })}
            <text x={leftPanelW - 8} y={tableTop - 8} textAnchor="end" fill={muted} fontSize={8.5 * visual.fontScale} fontFamily={fontCss}>
              Итого (+20%):
            </text>

            {/* Vertical I/O stems per device */}
            {cols.map((col, cIdx) => {
              const cxCol = leftPanelW + cIdx * colW + Math.round(colW / 2);
              const flags = [
                col.di > 0 ? String(col.di) : '',
                col.do > 0 ? String(col.do) : '',
                col.ai > 0 ? String(col.ai) : '',
                col.ao > 0 ? String(col.ao) : '',
                '',
                col.measure ? 'dot' : '',
                col.regulate ? 'dot' : '',
                col.alarm ? 'dot' : '',
                col.control ? 'dot' : '',
              ];
              return (
                <g key={col.num}>
                  <line x1={leftPanelW + cIdx * colW} y1={tableTop} x2={leftPanelW + cIdx * colW} y2={tableTop + tableH} stroke="var(--flux-line)" strokeWidth={0.8} />
                  {/* Green vertical line from tag down through rows */}
                  <line x1={cxCol} y1={14} x2={cxCol} y2={tableTop + tableH - 6} stroke={kipGreen} strokeWidth={1.3} />
                  <text x={cxCol + 3} y={16} fill={muted} fontSize={8.5 * visual.fontScale} fontFamily={fontCss}>
                    {col.num}
                  </text>
                  <text
                    x={cxCol - 4}
                    y={tableTop - 6}
                    fill={kipGreen}
                    fontSize={9 * visual.fontScale}
                    fontWeight={600}
                    fontFamily={fontCss}
                    transform={`rotate(-90 ${cxCol - 4} ${tableTop - 6})`}
                  >
                    {col.tag}
                  </text>
                  {flags.map((fl, fIdx) => {
                    if (!fl) return null;
                    const fy = tableTop + fIdx * rowH + 10.5;
                    return (
                      <g key={fIdx}>
                        <circle cx={cxCol} cy={fy} r={4} fill={kipGreen} />
                        {fl !== 'dot' && (
                          <text x={cxCol - 11} y={fy + 3.5} textAnchor="end" fill={stroke} fontSize={8.5 * visual.fontScale} fontFamily={fontCss}>
                            {fl}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>
        );
      }
      case 'breaker': {
        const xs = device.pins.filter((p) => p.direction === 'top').map((p) => p.dx);
        return (
          <g>
            <rect
              x={4}
              y={10}
              width={w - 8}
              height={h - 20}
              rx={3}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={isRemoved ? '4 3' : undefined}
            />
            {xs.map((px, i) => (
              <g key={i}>
                <line x1={px} y1={0} x2={px} y2={28} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={28} x2={px - 10} y2={h - 32} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={h - 28} x2={px} y2={h} stroke={stroke} strokeWidth={sw} />
                <circle cx={px} cy={28} r={2.2} fill={stroke} />
                <path
                  d={`M ${px - 4} ${h / 2 - 4} L ${px + 4} ${h / 2 - 4} L ${px - 4} ${h / 2 + 4}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={thinSw}
                />
              </g>
            ))}
            {xs.length > 1 && (
              <line
                x1={xs[0] - 5}
                y1={h / 2}
                x2={xs[xs.length - 1] - 5}
                y2={h / 2}
                stroke={muted}
                strokeWidth={thinSw}
                strokeDasharray="3 2"
              />
            )}
          </g>
        );
      }
      case 'contactor': {
        return (
          <g>
            <rect
              x={8}
              y={10}
              width={w - 16}
              height={h - 20}
              rx={3}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
            />
            <rect x={14} y={32} width={22} height={56} fill="none" stroke={stroke} strokeWidth={thinSw} />
            <line x1={0} y1={40} x2={14} y2={40} stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={80} x2={14} y2={80} stroke={stroke} strokeWidth={sw} />
            {[30, 60, 90].map((px, idx) => (
              <g key={idx}>
                <line x1={px} y1={0} x2={px} y2={35} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={35} x2={px + 9} y2={82} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={85} x2={px} y2={h} stroke={stroke} strokeWidth={sw} />
              </g>
            ))}
            <line x1={36} y1={60} x2={93} y2={60} stroke={muted} strokeWidth={thinSw} strokeDasharray="3 2" />
          </g>
        );
      }
      case 'motor': {
        const r = Math.min(w, h) * 0.34;
        return (
          <g>
            <circle cx={cx} cy={cy + 8} r={r} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <circle cx={cx} cy={cy + 8} r={r - 5} fill="none" stroke={muted} strokeWidth={thinSw} />
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fill={stroke}
              fontSize={16 * visual.fontScale}
              fontWeight={600}
              fontFamily={fontCss}
            >
              M 3~
            </text>
            {[25, 55, 85].map((px, i) => (
              <line key={i} x1={px} y1={0} x2={px} y2={cy + 8 - r + 4} stroke={stroke} strokeWidth={sw} />
            ))}
            <line x1={cx + r} y1={55} x2={w} y2={55} stroke={visual.netColors.pe} strokeWidth={sw} />
          </g>
        );
      }
      case 'lamp': {
        const r = 22;
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <line x1={cx - 14} y1={cy - 14} x2={cx + 14} y2={cy + 14} stroke={stroke} strokeWidth={sw} />
            <line x1={cx + 14} y1={cy - 14} x2={cx - 14} y2={cy + 14} stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={cy} x2={cx - r} y2={cy} stroke={stroke} strokeWidth={sw} />
            <line x1={cx + r} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      }
      case 'terminal': {
        const pinXs = device.pins.filter((p) => p.direction === 'top').map((p) => p.dx);
        const xs = pinXs.length > 0 ? pinXs : [20, 45, 75, 100];
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={2} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            {xs.map((px, i) => (
              <g key={i}>
                <line x1={px} y1={0} x2={px} y2={h} stroke={stroke} strokeWidth={thinSw} />
                <circle cx={px} cy={h / 2} r={4} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
              </g>
            ))}
          </g>
        );
      }
      case 'relay': {
        return (
          <g>
            <rect x={8} y={6} width={w - 16} height={h - 12} rx={3} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <rect x={16} y={24} width={22} height={42} fill="none" stroke={stroke} strokeWidth={thinSw} />
            <line x1={0} y1={30} x2={16} y2={30} stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={60} x2={16} y2={60} stroke={stroke} strokeWidth={sw} />
            <line x1={38} y1={45} x2={66} y2={45} stroke={muted} strokeWidth={thinSw} strokeDasharray="3 2" />
            <line x1={w} y1={30} x2={72} y2={30} stroke={stroke} strokeWidth={sw} />
            <line x1={72} y1={30} x2={60} y2={54} stroke={stroke} strokeWidth={sw} />
            <line x1={72} y1={60} x2={w} y2={60} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      }
      case 'offpage_ref': {
        const dir = device.offPageRef?.direction || (device.e3BlockName.includes('IN') ? 'in' : 'out');
        const isOut = dir === 'out';
        const sig = device.offPageRef?.signalType || device.pins[0]?.signalType || 'dc24';
        const potColor = visual.netColors[sig] || stroke;
        const potName =
          device.offPageRef?.potentialName?.trim() ||
          device.attributes.find((a) => /потенциал/i.test(a.name))?.value?.trim() ||
          device.designation;
        const addrLabel = offPageAddress || (isOut ? '→ Л.?' : '← Л.?');
        const pts = isOut
          ? `2,2 ${w - 14},2 ${w - 2},${cy} ${w - 14},${h - 2} 2,${h - 2}`
          : `2,2 ${w - 12},2 ${w - 2},${cy} ${w - 12},${h - 2} 2,${h - 2} 11,${cy}`;
        const textX = isOut ? (w - 12) / 2 + 2 : (w + 6) / 2;

        return (
          <g>
            {isPotentialHighlighted && (
              <polygon
                points={pts}
                fill={potColor}
                fillOpacity={0.18}
                stroke={potColor}
                strokeWidth={sw + 3}
                strokeOpacity={0.35}
              />
            )}
            <polygon
              points={pts}
              fill="var(--flux-surface)"
              stroke={selected || isPotentialHighlighted ? potColor : stroke}
              strokeWidth={selected || isPotentialHighlighted ? sw + 0.5 : sw}
            />
            {/* Signal accent bar along entry/exit */}
            <line
              x1={isOut ? 4 : w - 12}
              y1={6}
              x2={isOut ? 4 : w - 12}
              y2={h - 6}
              stroke={potColor}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <text
              x={textX}
              y={14}
              textAnchor="middle"
              fill={potColor}
              fontSize={9.5 * visual.fontScale}
              fontWeight={700}
              fontFamily={fontCss}
            >
              {potName.length > 13 ? `${potName.slice(0, 12)}…` : potName}
            </text>
            <g
              data-testid={`offpage-jump-${device.id}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOffPageNavigate?.(device);
              }}
              className={offPageHasTarget ? 'cursor-pointer' : 'cursor-default'}
            >
              <title>
                {offPageHasTarget
                  ? `Перейти к ответной ссылке (${addrLabel})`
                  : 'Ответная ссылка не найдена на других листах'}
              </title>
              <rect
                x={isOut ? 10 : 16}
                y={17.5}
                width={w - 30}
                height={14}
                rx={2}
                fill={offPageHasTarget ? 'var(--flux-sel)' : 'var(--flux-bg)'}
                stroke={offPageHasTarget ? potColor : 'var(--flux-line)'}
                strokeWidth={0.75}
              />
              <text
                x={textX}
                y={27.5}
                textAnchor="middle"
                fill={offPageHasTarget ? 'var(--flux-accent)' : muted}
                fontSize={8.2 * visual.fontScale}
                fontWeight={600}
                fontFamily="JetBrains Mono, monospace"
              >
                {addrLabel}
              </text>
            </g>
          </g>
        );
      }
      default: {
        return (
          <g>
            <rect
              x={4}
              y={4}
              width={w - 8}
              height={h - 8}
              rx={4}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={isRemoved ? '4 3' : undefined}
            />
            <rect x={4} y={4} width={w - 8} height={22} rx={3} fill="var(--flux-bg)" />
            <line x1={4} y1={26} x2={w - 4} y2={26} stroke="var(--flux-line-strong)" strokeWidth={thinSw} />
            <text
              x={12}
              y={19}
              fill={muted}
              fontSize={10 * visual.fontScale}
              fontWeight={600}
              fontFamily={fontCss}
            >
              {device.category.toUpperCase()}
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fill={muted}
              fontSize={(device.article.length > 12 ? 8.8 : 10.2) * visual.fontScale}
              fontFamily={fontCss}
            >
              {device.article}
            </text>
          </g>
        );
      }
    }
  };

  return (
    <g
      data-testid={`symbol-${device.id}`}
      data-locked={locked ? 'true' : 'false'}
      data-potential-highlighted={isPotentialHighlighted ? 'true' : 'false'}
      transform={`translate(${device.x}, ${device.y})`}
      className={`${locked ? 'cursor-default' : 'cursor-pointer'} select-none`}
      onMouseDown={(e) => onSelectDevice(e, device)}
      onDoubleClick={(e) => {
        if (device.category === 'offpage_ref') {
          e.stopPropagation();
          onOffPageNavigate?.(device);
        }
      }}
      style={{ opacity: isRemoved ? 0.55 : 1 }}
    >
      {/* Selection halo */}
      {selected && (
        <rect
          x={-6}
          y={-6}
          width={device.width + 12}
          height={device.height + 12}
          rx={6}
          fill="none"
          stroke={locked ? '#d97706' : 'var(--flux-accent)'}
          strokeWidth={1.5}
          strokeDasharray={locked ? '3 3' : '5 3'}
        />
      )}

      {/* Rotatable geometry */}
      <g transform={`rotate(${device.rotation} ${cx} ${cy})`}>
        {renderBody()}

        {/* Pins */}
        {device.pins.map((pin) => {
          const pinKey = `${device.id}:${pin.id}`;
          const isStart = wireStartPinKey === pinKey;
          const isHoveredTarget = hoveredPinKey === pinKey && !isStart;
          const isPinTraced = highlightedPinKeys?.has(pinKey) ?? false;
          const isConnected = connectedPinKeys.has(pinKey);
          const sigColor = visual.netColors[pin.signalType] || stroke;

          let labelDx = 0;
          let labelDy = -8;
          let anchor: 'start' | 'middle' | 'end' = 'middle';
          if (pin.direction === 'left') {
            labelDx = 8;
            labelDy = -4;
            anchor = 'start';
          } else if (pin.direction === 'right') {
            labelDx = -8;
            labelDy = -4;
            anchor = 'end';
          } else if (pin.direction === 'bottom') {
            labelDx = 6;
            labelDy = -5;
            anchor = 'start';
          } else {
            labelDx = 6;
            labelDy = 13;
            anchor = 'start';
          }

          return (
            <g
              key={pin.id}
              data-testid={`pin-${device.id}-${pin.id}`}
              data-pin-traced={isPinTraced ? 'true' : 'false'}
              onMouseEnter={() => onPinHover?.(device, pin.id)}
              onMouseLeave={() => onPinHover?.(device, null)}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(e, device, pin.id);
              }}
              className={`group/pin ${wiresLocked ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
            >
              <circle data-pin-hit="true" cx={pin.dx} cy={pin.dy} r={10} fill="transparent" />
              {isPinTraced && (
                <circle
                  cx={pin.dx}
                  cy={pin.dy}
                  r={8.5}
                  fill={sigColor}
                  fillOpacity={0.22}
                  stroke={sigColor}
                  strokeWidth={1.4}
                  pointerEvents="none"
                />
              )}
              <circle
                cx={pin.dx}
                cy={pin.dy}
                r={isHoveredTarget ? 8 : 7}
                fill="var(--flux-accent)"
                className={`${isHoveredTarget ? 'opacity-30' : 'opacity-0 group-hover/pin:opacity-25'} transition-opacity pointer-events-none`}
              />
              <circle
                cx={pin.dx}
                cy={pin.dy}
                r={isStart || isHoveredTarget || isPinTraced ? 5 : isConnected ? 3.5 : 3}
                fill={
                  isStart || isHoveredTarget
                    ? 'var(--flux-accent)'
                    : isPinTraced || isConnected
                      ? sigColor
                      : 'var(--flux-surface)'
                }
                stroke={isStart || isHoveredTarget ? 'var(--flux-accent)' : sigColor}
                strokeWidth={1.5}
              />
              {visual.showPinNumbers && device.category !== 'airflow_arrow' && (
                <text
                  x={pin.dx + labelDx}
                  y={pin.dy + labelDy}
                  textAnchor={anchor}
                  fill={muted}
                  stroke="var(--flux-surface)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  fontSize={9.5 * visual.fontScale}
                  fontFamily={fontCss}
                  pointerEvents="none"
                >
                  {pin.name}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Designation & Cross-reference Labels */}
      {device.category !== 'airflow_arrow' && (
        <text
          x={0}
          y={-8}
          fill={selected ? 'var(--flux-accent)' : 'var(--flux-text)'}
          stroke="var(--flux-surface)"
          strokeWidth={3.5}
          paintOrder="stroke"
          fontSize={12 * visual.fontScale}
          fontWeight={600}
          fontFamily={fontCss}
        >
          {device.designation}
        </text>
      )}
      {visual.showCrossRefs &&
        device.category !== 'airflow_arrow' &&
        device.category !== 'io_matrix' &&
        device.category !== 'offpage_ref' && (
        <text
          x={cx}
          y={device.height + 14}
          textAnchor="middle"
          fill={muted}
          stroke="var(--flux-surface)"
          strokeWidth={3}
          paintOrder="stroke"
          fontSize={9 * visual.fontScale}
          fontFamily={fontCss}
        >
          {device.e3BlockName}
        </text>
      )}
    </g>
  );
};
