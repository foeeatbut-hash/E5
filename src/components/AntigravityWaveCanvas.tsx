import React, { useEffect, useRef } from 'react';
import {
  computeWaveDotSample,
  parseCssColorToRgb,
  WAVE_PULSE_LIFETIME_SEC,
  type WaveCardFocusRect,
  type WavePointerState,
  type WavePulse,
} from '../core/startHub';

interface AntigravityWaveCanvasProps {
  active: boolean;
  settling: boolean;
  isDark: boolean;
  uiMode: string;
  gridStep?: number;
  hoverRectRef?: React.RefObject<WaveCardFocusRect | null>;
  emitPulseRef?: React.MutableRefObject<((x: number, y: number, strength?: number) => void) | null>;
}

export const AntigravityWaveCanvas: React.FC<AntigravityWaveCanvasProps> = ({
  active,
  settling,
  isDark,
  uiMode,
  gridStep = 24,
  hoverRectRef,
  emitPulseRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settlingRef = useRef(settling);
  settlingRef.current = settling;

  const paletteRef = useRef<{
    baseRgb: [number, number, number];
    accentRgb: [number, number, number];
  }>({
    baseRgb: isDark ? [48, 56, 66] : [188, 197, 208],
    accentRgb: isDark ? [45, 212, 191] : [15, 118, 110],
  });

  // Refresh palette from real CSS tokens whenever theme or workspace mode changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cs = getComputedStyle(document.documentElement);
    const dotColor = cs.getPropertyValue('--flux-grid-dot');
    const accentColor = cs.getPropertyValue('--flux-accent');
    paletteRef.current = {
      baseRgb: parseCssColorToRgb(
        dotColor,
        isDark ? [52, 60, 70] : [188, 197, 208]
      ),
      accentRgb: parseCssColorToRgb(
        accentColor,
        isDark ? [45, 212, 191] : [15, 118, 110]
      ),
    };
  }, [isDark, uiMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let settleStartMs: number | null = null;
    const startMs = performance.now();
    const pulses: WavePulse[] = [];

    const pushPulse = (x: number, y: number, strength = 1) => {
      if (reducedMotion || settlingRef.current) return;
      const nowSec = (performance.now() - startMs) * 0.001;
      pulses.push({ x, y, bornAtSec: nowSec, strength });
      if (pulses.length > 10) {
        pulses.splice(0, pulses.length - 10);
      }
    };

    if (emitPulseRef) {
      emitPulseRef.current = pushPulse;
    }

    const pointer: WavePointerState = {
      x: -9999,
      y: -9999,
      active: false,
      speed: 0,
    };
    let smoothX = -9999;
    let smoothY = -9999;
    let smoothSpeed = 0;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const drawFrame = (nowMs: number) => {
      if (width <= 0 || height <= 0) return;

      // Smooth pointer tracking + speed decay
      if (pointer.active) {
        if (smoothX < -1000) {
          smoothX = pointer.x;
          smoothY = pointer.y;
        } else {
          const dx = pointer.x - smoothX;
          const dy = pointer.y - smoothY;
          const stepDist = Math.hypot(dx, dy);
          smoothSpeed = smoothSpeed * 0.86 + Math.min(36, stepDist * 0.65) * 0.14;
          smoothX += dx * 0.24;
          smoothY += dy * 0.24;
        }
      } else {
        smoothSpeed *= 0.9;
      }

      if (settlingRef.current) {
        if (settleStartMs === null) settleStartMs = nowMs;
      } else {
        settleStartMs = null;
      }
      const gridLockProgress =
        settleStartMs !== null ? Math.min(1, (nowMs - settleStartMs) / 210) : 0;

      canvas.dataset.gridLock = gridLockProgress > 0 ? 'settling' : 'wave';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const { baseRgb, accentRgb } = paletteRef.current;
      const step = Math.max(20, Math.min(32, gridStep));
      const cols = Math.ceil(width / step) + 1;
      const rows = Math.ceil(height / step) + 1;
      const offsetX = ((width % step) * 0.5) | 0;
      const offsetY = ((height % step) * 0.5) | 0;
      const timeSec = (nowMs - startMs) * 0.001;
      const hoverRect = hoverRectRef?.current ?? null;

      // Prune expired wave pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        if (timeSec - pulses[i].bornAtSec > WAVE_PULSE_LIFETIME_SEC) {
          pulses.splice(i, 1);
        }
      }

      const samplePointer: WavePointerState = {
        x: smoothX,
        y: smoothY,
        active: pointer.active && smoothX > -1000,
        speed: smoothSpeed,
      };

      // Subtle orthogonal schematic rail traces behind wave peak (very faint)
      if (!reducedMotion && gridLockProgress < 0.95) {
        const lineAlpha = (isDark ? 0.038 : 0.045) * (1 - gridLockProgress);
        ctx.strokeStyle = `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${lineAlpha})`;
        ctx.lineWidth = 1;
        const scanY = Math.round(((timeSec * 28) % Math.max(240, height)) / step) * step + offsetY;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(width, scanY);
        ctx.stroke();
      }

      for (let row = 0; row < rows; row++) {
        const by = offsetY + row * step;
        for (let col = 0; col < cols; col++) {
          const bx = offsetX + col * step;
          const dot = computeWaveDotSample({
            baseX: bx,
            baseY: by,
            timeSec,
            pointer: samplePointer,
            hoverRect,
            gridLockProgress,
            reducedMotion,
            pulses,
          });

          const mix = dot.accentMix;
          const r = Math.round(baseRgb[0] + (accentRgb[0] - baseRgb[0]) * mix);
          const g = Math.round(baseRgb[1] + (accentRgb[1] - baseRgb[1]) * mix);
          const b = Math.round(baseRgb[2] + (accentRgb[2] - baseRgb[2]) * mix);
          const alpha = isDark ? dot.alpha : Math.min(0.88, dot.alpha * 1.25);
          const radius = isDark ? dot.radius : dot.radius * 1.08;

          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const tick = (nowMs: number) => {
      if (document.visibilityState !== 'visible') {
        rafId = 0;
        canvas.dataset.waveRunning = 'paused';
        return;
      }
      drawFrame(nowMs);
      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !reducedMotion && !rafId) {
        canvas.dataset.waveRunning = 'active';
        rafId = window.requestAnimationFrame(tick);
      } else if (document.visibilityState !== 'visible' && rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
        canvas.dataset.waveRunning = 'paused';
      }
    };

    resize();
    if (!reducedMotion && width > 0 && height > 0) {
      pushPulse(width * 0.5, height * 0.28, 0.95);
    }

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    canvas.dataset.waveRunning = reducedMotion ? 'static' : 'active';
    drawFrame(performance.now());
    if (!reducedMotion) {
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (emitPulseRef) {
        emitPulseRef.current = null;
      }
      canvas.dataset.waveRunning = 'stopped';
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, emitPulseRef, gridStep, hoverRectRef, isDark]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="antigravity-wave-canvas"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
};
