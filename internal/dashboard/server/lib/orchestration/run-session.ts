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
  skill: 'ait-plan';
  appName?: string;
  cwd: string;
  initialPrompt: string;
}

export class RunSession {
  readonly runId: string;
  readonly skill: 'ait-plan';
  readonly appName?: string;
  readonly startedAt: string;
  state: RunState;
  endedAt?: string;
  exitCode?: number;

  private child: ChildProcessWithoutNullStreams;
  private clients: Set<Response> = new Set();
  private buffer = '';
  private cleanupTimer?: NodeJS.Timeout;

  constructor(init: RunSessionInit) {
    this.runId = randomUUID();
    this.skill = init.skill;
    if (init.appName !== undefined) this.appName = init.appName;
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

  addClient(res: Response): void {
    this.clients.add(res);
    this.emitTo(res, { kind: 'state', data: { state: this.state }, at: new Date().toISOString() });
    res.on('close', () => this.clients.delete(res));
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
    for (const client of this.clients) {
      this.emitTo(client, event);
    }
  }

  private emitTo(client: Response, event: RunEvent): void {
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
