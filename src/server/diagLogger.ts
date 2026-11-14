import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LogLevel, ProcessLogEntry } from '../core/e3Types.ts';

export type ServerSubsystem = ProcessLogEntry['subsystem'];

class ServerDiagLogger {
  private entries: ProcessLogEntry[] = [];
  private listeners = new Set<(entry: ProcessLogEntry) => void>();
  private readonly maxEntries = 1200;
  private logFilePath: string | null = null;

  constructor() {
    this.resolveLogFile();
  }

  private resolveLogFile() {
    const dir =
      process.env.FLUX_LOG_DIR ||
      (process.env.FLUX_PORTABLE === '1'
        ? path.resolve(process.cwd(), '..', 'logs')
        : '');
    if (!dir) {
      this.logFilePath = null;
      return;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      this.logFilePath = path.join(dir, 'e3promax-server.log');
    } catch {
      this.logFilePath = null;
    }
  }

  public getLogFilePath(): string | null {
    return this.logFilePath;
  }

  public subscribe(fn: (entry: ProcessLogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public log(
    level: LogLevel,
    subsystem: ServerSubsystem,
    message: string,
    options?: {
      durationMs?: number;
      details?: string;
      cause?: string;
      outcome?: string;
      screenState?: string;
      lagMs?: number;
    }
  ): ProcessLogEntry {
    const entry: ProcessLogEntry = {
      id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      subsystem,
      message,
      durationMs: options?.durationMs,
      details: options?.details,
      cause: options?.cause,
      outcome: options?.outcome,
      screenState: options?.screenState,
      lagMs: options?.lagMs,
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }

    const durPart = entry.durationMs !== undefined ? ` (${entry.durationMs.toFixed(1)} ms)` : '';
    const line = `[${entry.timestamp}] [${entry.level}] [${entry.subsystem}] ${entry.message}${durPart}${
      entry.details ? `\n  DETAILS: ${entry.details.replace(/\r?\n/g, '\n  ')}` : ''
    }`;

    if (level === 'ERROR') {
      console.error(line);
    } else if (process.env.FLUX_DEBUG === '1' || level === 'WARN') {
      console.log(line);
    }

    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, line + '\n', 'utf8');
      } catch {
        // ignore write failures
      }
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // ignore listener failure
      }
    }

    return entry;
  }

  public getEntries(): ProcessLogEntry[] {
    return this.entries;
  }

  public formatPlainTextReport(): string {
    const header = [
      '=== E3ProMax Diagnostic Server Log ===',
      `Generated: ${new Date().toISOString()}`,
      `Node: ${process.version} | Platform: ${process.platform} (${process.arch})`,
      `Host: ${os.hostname()} | PID: ${process.pid}`,
      `CWD: ${process.cwd()}`,
      `Portable: ${process.env.FLUX_PORTABLE === '1' ? 'YES' : 'NO'}`,
      `LogFile: ${this.logFilePath || '(memory-only)'}`,
      '======================================',
      '',
    ].join('\n');

    const body = [...this.entries]
      .reverse()
      .map((e) => {
        const dur = e.durationMs !== undefined ? ` [${e.durationMs.toFixed(1)}ms]` : '';
        const det = e.details ? `\n    ${e.details.replace(/\r?\n/g, '\n    ')}` : '';
        return `[${e.timestamp}] [${e.level}] [${e.subsystem}]${dur} ${e.message}${det}`;
      })
      .join('\n');

    return header + body + '\n';
  }
}

export const diagLogger = new ServerDiagLogger();
