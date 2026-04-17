import { randomUUID } from 'crypto';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { Response } from 'express';
import { spawnClaudeForSkill, encodeUserInput } from './claude-spawn.js';
import { parseStreamLine } from './stream-parser.js';

export type RunState =
  | 'DRAFT'
  | 'VALIDATING_INPUT'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_USER_INPUT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type RunEventKind =
  | 'log'
  | 'state'
  | 'question'
  | 'artifact'
  | 'done'
  | 'error';

export interface RunEvent {
  kind: RunEventKind;
  data: unknown;
  at: string;
}

const TERMINAL_STATES: ReadonlySet<RunState> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELED',
]);

const RETENTION_AFTER_TERMINAL_MS = 60 * 1000;

export interface RunSessionInit {
  skill: string;
  appName?: string;
  cwd: string;
  initialPrompt: string;
  /** 사전 지정된 runId (SQLite 복원용). 없으면 UUID 생성. */
  runId?: string;
  /** idempotency 키 — 같은 키의 성공 기록이 있으면 재실행 스킵 가능 (라우트 레이어에서 검사). */
  idempotencyKey?: string;
}

/** 이벤트 히스토리 — SSE 후발 연결자용 리플레이 + SQLite 영속화 소스. */
export interface HistoricRunEvent extends RunEvent {
  seq: number;
}

export class RunSession {
  readonly runId: string;
  readonly skill: string;
  readonly appName?: string;
  readonly startedAt: string;
  readonly cwd: string;
  readonly initialPrompt: string;
  readonly idempotencyKey?: string;
  state: RunState;
  endedAt?: string;
  exitCode?: number;

  private child: ChildProcessWithoutNullStreams;
  private clients: Set<Response> = new Set();
  private buffer = '';
  private cleanupTimer?: NodeJS.Timeout;
  private eventHistory: HistoricRunEvent[] = [];
  private nextSeq = 0;
  private listeners: Set<(event: HistoricRunEvent) => void> = new Set();

  constructor(init: RunSessionInit) {
    this.runId = init.runId ?? randomUUID();
    this.skill = init.skill;
    if (init.appName !== undefined) this.appName = init.appName;
    this.cwd = init.cwd;
    this.initialPrompt = init.initialPrompt;
    if (init.idempotencyKey !== undefined) this.idempotencyKey = init.idempotencyKey;
    this.startedAt = new Date().toISOString();
    this.state = 'DRAFT';

    this.transition('VALIDATING_INPUT');
    this.transition('READY');

    this.child = spawnClaudeForSkill({
      skill: init.skill,
      cwd: init.cwd,
      initialPrompt: init.initialPrompt,
    });
    this.transition('RUNNING');
    this.wireChild();
  }

  addClient(res: Response, opts: { replay?: boolean } = {}): void {
    this.clients.add(res);
    const replay = opts.replay ?? true;
    if (replay && this.eventHistory.length > 0) {
      for (const event of this.eventHistory) {
        this.emitTo(res, event);
      }
    } else {
      this.emitTo(res, { seq: -1, kind: 'state', data: { state: this.state }, at: new Date().toISOString() });
    }
    res.on('close', () => this.clients.delete(res));
  }

  /** 영속화/외부 리스너용 — 모든 이벤트를 forwarding. */
  addListener(fn: (event: HistoricRunEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 이미 기록된 이벤트를 순차로 다시 전달. SQLite에서 복원 직후 리플레이에 사용. */
  replayInto(fn: (event: HistoricRunEvent) => void): void {
    for (const event of this.eventHistory) fn(event);
  }

  getHistory(): readonly HistoricRunEvent[] {
    return this.eventHistory;
  }

  sendInput(text: string): { ok: true } | { ok: false; reason: string } {
    if (TERMINAL_STATES.has(this.state)) {
      return { ok: false, reason: `session is ${this.state}` };
    }
    try {
      this.child.stdin.write(encodeUserInput(text));
      if (this.state === 'WAITING_USER_INPUT') this.transition('RUNNING');
      return { ok: true };
    } catch (err) {
      this.emit({
        kind: 'error',
        data: { message: err instanceof Error ? err.message : String(err) },
        at: new Date().toISOString(),
      });
      return { ok: false, reason: 'stdin write failed' };
    }
  }

  async cancel(): Promise<void> {
    if (TERMINAL_STATES.has(this.state)) return;
    try {
      this.child.kill('SIGTERM');
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!this.child.killed) {
          try {
            this.child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
        resolve();
      }, 5000);
      this.child.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.transition('CANCELED');
  }

  private transition(next: RunState): void {
    if (this.state === next) return;
    this.state = next;
    if (TERMINAL_STATES.has(next)) {
      this.endedAt = new Date().toISOString();
      this.scheduleCleanup();
    }
    this.emit({ kind: 'state', data: { state: next }, at: new Date().toISOString() });
  }

  private wireChild(): void {
    this.child.stdout.on('data', (chunk: Buffer) => this.consumeStdout(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      chunk
        .toString()
        .split(/\r?\n/)
        .forEach((line) => {
          const trimmed = line.trimEnd();
          if (trimmed) {
            this.emit({
              kind: 'log',
              data: { stream: 'stderr', line: trimmed },
              at: new Date().toISOString(),
            });
          }
        });
    });
    this.child.on('close', (code) => {
      this.exitCode = code ?? 0;
      this.transition(code === 0 ? 'COMPLETED' : 'FAILED');
      this.emit({
        kind: 'done',
        data: { exitCode: this.exitCode, finalState: this.state },
        at: new Date().toISOString(),
      });
      for (const client of this.clients) {
        try {
          client.end();
        } catch {
          // ignore
        }
      }
    });
    this.child.on('error', (err) => {
      this.emit({
        kind: 'error',
        data: { message: err.message },
        at: new Date().toISOString(),
      });
      this.transition('FAILED');
    });
  }

  private consumeStdout(chunk: Buffer): void {
    this.buffer += chunk.toString();
    let idx = this.buffer.indexOf('\n');
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      this.dispatchStdoutLine(line);
      idx = this.buffer.indexOf('\n');
    }
  }

  private dispatchStdoutLine(line: string): void {
    const trimmed = line.trimEnd();
    if (!trimmed) return;
    const parsed = parseStreamLine(trimmed);
    const at = new Date().toISOString();
    switch (parsed.kind) {
      case 'artifact':
        this.emit({ kind: 'artifact', data: parsed.artifact ?? {}, at });
        break;
      case 'done':
        // 실제 close는 child 'close' 이벤트에서 처리. 여기서는 로그로만 남김.
        this.emit({ kind: 'log', data: { stream: 'stdout', line: '[stream-json: result]' }, at });
        break;
      case 'question':
        this.transition('WAITING_USER_INPUT');
        this.emit({ kind: 'question', data: parsed.raw, at });
        break;
      case 'log':
      case 'unknown':
      default:
        this.emit({
          kind: 'log',
          data: { stream: 'stdout', line: parsed.message ?? trimmed },
          at,
        });
        break;
    }
  }

  private emit(event: RunEvent): void {
    const historic: HistoricRunEvent = { ...event, seq: this.nextSeq++ };
    this.eventHistory.push(historic);
    for (const listener of this.listeners) {
      try { listener(historic); } catch { /* ignore listener errors */ }
    }
    for (const client of this.clients) {
      this.emitTo(client, historic);
    }
  }

  private emitTo(client: Response, event: HistoricRunEvent): void {
    try {
      client.write(`event: ${event.kind}\n`);
      client.write(`data: ${JSON.stringify({ ...event })}\n\n`);
    } catch {
      this.clients.delete(client);
    }
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setTimeout(() => {
      runSessions.delete(this.runId);
    }, RETENTION_AFTER_TERMINAL_MS);
  }
}

export const runSessions: Map<string, RunSession> = new Map();
