import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLogDetailsString,
  buildLogFrequencySeries,
  computeHealthMetrics,
  formatScreenSnapshot,
} from './diagTelemetry.ts';
import type { ProcessLogEntry } from './e3Types.ts';

test('buildLogFrequencySeries buckets logs by level and duration over time', () => {
  const baseMs = Date.UTC(2026, 0, 1, 12, 5, 0);
  const logs: ProcessLogEntry[] = [
    {
      id: '1',
      timestamp: new Date(baseMs - 10_000).toISOString(),
      level: 'INFO',
      subsystem: 'UI-INTERACT',
      message: 'Click tool wire',
      durationMs: 4.5,
    },
    {
      id: '2',
      timestamp: new Date(baseMs - 10_000).toISOString(),
      level: 'ERROR',
      subsystem: 'NET-API',
      message: 'Failed save',
      durationMs: 120.4,
    },
    {
      id: '3',
      timestamp: new Date(baseMs - 120_000).toISOString(),
      level: 'WARN',
      subsystem: 'PERF-DIAG',
      message: 'Frame lag detected',
      lagMs: 68.2,
    },
    {
      id: '4',
      timestamp: new Date(baseMs - 900_000).toISOString(),
      level: 'SYNC',
      subsystem: 'SYNC-API',
      message: 'Old log outside 5m window',
    },
  ];

  const series = buildLogFrequencySeries(logs, {
    windowSeconds: 300,
    bucketsCount: 10,
    nowMs: baseMs,
  });

  assert.equal(series.length, 10);
  const totalInWindow = series.reduce((acc, p) => acc + p.total, 0);
  assert.equal(totalInWindow, 3);

  const lastBucket = series[series.length - 1];
  assert.equal(lastBucket.total, 2);
  assert.equal(lastBucket.info, 1);
  assert.equal(lastBucket.error, 1);
  assert.equal(lastBucket.maxDurationMs, 120.4);
  assert.equal(lastBucket.avgDurationMs, 62.5);
});

test('computeHealthMetrics calculates totals, durations, p95, slowOps, and subsystems', () => {
  const logs: ProcessLogEntry[] = [
    { id: '1', timestamp: '2026-01-01T12:00:00Z', level: 'INFO', subsystem: 'E3-CORE', message: 'a', durationMs: 10 },
    { id: '2', timestamp: '2026-01-01T12:00:01Z', level: 'SYNC', subsystem: 'NET-API', message: 'b', durationMs: 25 },
    { id: '3', timestamp: '2026-01-01T12:00:02Z', level: 'WARN', subsystem: 'PERF-DIAG', message: 'c', lagMs: 75 },
    { id: '4', timestamp: '2026-01-01T12:00:03Z', level: 'ERROR', subsystem: 'NET-API', message: 'd', durationMs: 200 },
  ];

  const m = computeHealthMetrics(logs);
  assert.equal(m.totalLogs, 4);
  assert.equal(m.infoCount, 1);
  assert.equal(m.syncCount, 1);
  assert.equal(m.warnCount, 1);
  assert.equal(m.errorCount, 1);
  assert.equal(m.slowOpsCount, 2);
  assert.equal(m.maxDurationMs, 200);
  assert.equal(m.avgDurationMs, 77.5);
  assert.equal(m.subsystems[0].subsystem, 'NET-API');
  assert.equal(m.subsystems[0].count, 2);
  assert.equal(m.slowestEntries[0].id, '4');
});

test('formatScreenSnapshot and buildLogDetailsString format complete diagnostic metadata', () => {
  const snap = formatScreenSnapshot({
    projectCode: 'ЩУ-ПВ1',
    revision: 7,
    sheetNumber: 2,
    sheetName: 'Автоматика',
    viewportIdx: 1,
    viewportLayout: 'two',
    zoom: 0.65,
    pan: { x: 40, y: 12 },
    tool: 'wire',
    selectedDevices: 1,
    selectedWires: 0,
    selectedAnnotations: 0,
    theme: 'dark',
  });
  assert.ok(snap.includes('ЩУ-ПВ1@r7'));
  assert.ok(snap.includes('two[В2]'));
  assert.ok(snap.includes('65%'));
  assert.ok(snap.includes('Инстр:wire'));

  const details = buildLogDetailsString({
    cause: 'Клик по кнопке',
    outcome: 'HTTP 200 OK',
    screenState: snap,
  });
  assert.ok(details?.includes('Причина: Клик по кнопке'));
  assert.ok(details?.includes('Ответ/Итог: HTTP 200 OK'));
  assert.ok(details?.includes('Экран: ЩУ-ПВ1@r7'));
});
