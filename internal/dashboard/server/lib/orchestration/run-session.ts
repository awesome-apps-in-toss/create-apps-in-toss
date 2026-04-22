import { randomUUID } from 'crypto';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { Response } from 'express';
import { spawnClaudeForSkill, encodeUserInput, buildInitialPrompt } from './claude-spawn.js';
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
  | 'error'
  /** 어시스턴트가 새 text 블록을 시작했다. 클라이언트는 streaming 버퍼를 연다. */
  | 'text_start'
  /** text 블록 증분 — 클라이언트는 현재 streaming 버퍼에 append 한다. */
  | 'text_delta'
  /** text 블록이 끝났다. 클라이언트는 버퍼 내용을 log 처럼 확정시킨다. */
  | 'text_stop'
  /** 사용자가 대시보드에서 보낸 입력이 CLI stdin 에 기록됐다. 재연결/replay 시
   *  "이 질문은 이미 답변됐다" 를 복원하기 위한 마커. */
  | 'user_input';

export interface RunEvent {
  kind: RunEventKind;
  data: unknown;
  at: string;
}

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set([
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
  /** 'interactive' 면 초기 프롬프트 주입 뒤에도 stdin 을 열어둬 사용자 응답을 계속 받는다.
   *  'automated' 면 초기 프롬프트 직후 stdin 을 닫아 CLI 가 한 턴 끝나면 스스로 종료하게 한다. */
  mode: 'interactive' | 'automated';
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
  readonly mode: 'interactive' | 'automated';
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
  /** 현재 증분 중인 text 블록 누적 버퍼. text_stop 시 event data 에 실어서 보내고 초기화. */
  private textStreamBuffer = '';
  /** 현재 열려있는 text content block 인덱스. null 이면 스트리밍 중인 텍스트 블록 없음.
   *  비-text 블록(tool_use) 의 content_block_stop 을 걸러내는 데 쓴다. */
  private activeTextBlockIndex: number | null = null;

  constructor(init: RunSessionInit) {
    this.runId = init.runId ?? randomUUID();
    this.skill = init.skill;
    if (init.appName !== undefined) this.appName = init.appName;
    this.cwd = init.cwd;
    this.initialPrompt = init.initialPrompt;
    if (init.idempotencyKey !== undefined) this.idempotencyKey = init.idempotencyKey;
    this.mode = init.mode;
    this.startedAt = new Date().toISOString();
    this.state = 'DRAFT';

    this.transition('VALIDATING_INPUT');
    this.transition('READY');

    this.child = spawnClaudeForSkill({ cwd: init.cwd });
    this.transition('RUNNING');
    this.wireChild();

    // 초기 프롬프트 주입. stream-json 모드에서는 -p 인자가 무시되므로 반드시 stdin 으로 넣어야 한다.
    try {
      this.child.stdin.write(encodeUserInput(buildInitialPrompt(init.skill, init.initialPrompt)));
    } catch (err) {
      this.emit({
        kind: 'error',
        data: { message: err instanceof Error ? err.message : String(err) },
        at: new Date().toISOString(),
      });
    }

    // 자동화 스킬은 한 턴으로 끝나도록 stdin 을 닫아둔다.
    // (사용자 응답을 받지 않는 스킬이므로 CLI 가 end_turn 이후 스스로 exit.)
    if (init.mode === 'automated') {
      try {
        this.child.stdin.end();
      } catch {
        // ignore
      }
    }
  }

  addClient(res: Response, opts: { replay?: boolean; fromSeq?: number } = {}): void {
    this.clients.add(res);
    const replay = opts.replay ?? true;
    const fromSeq = opts.fromSeq ?? 0;
    if (replay && this.eventHistory.length > 0) {
      for (const event of this.eventHistory) {
        if (event.seq < fromSeq) continue;
        this.emitTo(res, event);
      }
    } else {
      this.emitTo(res, { seq: -1, kind: 'state', data: { state: this.state }, at: new Date().toISOString() });
    }
    res.on('close', () => this.clients.delete(res));
  }

  /**
   * 영속화/외부 리스너용. replay: true 옵션이면 기존 히스토리를 먼저 전달한 뒤
   * 이후 이벤트를 구독. 세션 구성 직후 초기 state 전환을 놓치지 않는 데 필요.
   */
  addListener(
    fn: (event: HistoricRunEvent) => void,
    opts: { replay?: boolean } = {}
  ): () => void {
    if (opts.replay) {
      for (const e of this.eventHistory) {
        try { fn(e); } catch { /* ignore listener errors */ }
      }
    }
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
      const now = new Date().toISOString();
      // user_input 이벤트는 SSE 재연결 시 "이 질문은 이미 답변됨" 상태 복원에 쓰인다.
      // 질문 이벤트 뒤의 첫 user_input 이 그 질문의 답변임을 순서로 매칭.
      this.emit({ kind: 'user_input', data: { text }, at: now });
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
    // 이미 terminal 상태면 다른 terminal 로 덮어쓰지 않음 — cancel() 직후 child close
    // 이벤트가 도착해 CANCELED 가 FAILED/COMPLETED 로 바뀌는 것을 방지.
    if (TERMINAL_STATES.has(this.state)) return;
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
    const events = parseStreamLine(trimmed);
    if (events.length === 0) return;
    const at = new Date().toISOString();
    for (const parsed of events) {
      switch (parsed.kind) {
        case 'artifact':
          this.emit({ kind: 'artifact', data: parsed.artifact ?? {}, at });
          break;
        case 'turn_end':
          // 한 턴이 끝났을 뿐이며 세션은 계속 살아있다 (stdin 열림).
          // automated 모드는 한 턴 뒤 stdin 이 이미 닫혀 CLI 가 스스로 exit → COMPLETED 로 간다.
          // 따라서 잠깐 WAITING 을 깜빡이지 않도록 automated 에서는 전이하지 않는다.
          if (this.mode === 'interactive' && !TERMINAL_STATES.has(this.state)) {
            this.transition('WAITING_USER_INPUT');
          }
          break;
        case 'question':
          this.transition('WAITING_USER_INPUT');
          this.emit({ kind: 'question', data: parsed.question ?? parsed.raw, at });
          break;
        case 'text_start': {
          // content_block_start 는 text 블록일 때만 stream-parser 에서 emit 된다.
          const idx = typeof parsed.blockIndex === 'number' ? parsed.blockIndex : 0;
          this.activeTextBlockIndex = idx;
          this.textStreamBuffer = '';
          this.emit({ kind: 'text_start', data: { blockIndex: idx }, at });
          break;
        }
        case 'text_delta': {
          // 활성 text 블록에 속하는 delta 만 받아들인다. (partial_json 등은 stream-parser 에서 이미 필터)
          if (
            parsed.blockIndex !== undefined &&
            this.activeTextBlockIndex !== null &&
            parsed.blockIndex !== this.activeTextBlockIndex
          ) {
            break;
          }
          if (typeof parsed.deltaText === 'string' && parsed.deltaText.length > 0) {
            this.textStreamBuffer += parsed.deltaText;
            this.emit({
              kind: 'text_delta',
              data: { text: parsed.deltaText, blockIndex: this.activeTextBlockIndex },
              at,
            });
          }
          break;
        }
        case 'text_stop': {
          // tool_use 등 비-text 블록의 content_block_stop 은 activeTextBlockIndex 가 없거나
          // 인덱스가 다르므로 이 분기에서 걸러진다.
          if (this.activeTextBlockIndex === null) break;
          if (
            parsed.blockIndex !== undefined &&
            parsed.blockIndex !== this.activeTextBlockIndex
          ) {
            break;
          }
          const fullText = this.textStreamBuffer;
          const closedIdx = this.activeTextBlockIndex;
          this.textStreamBuffer = '';
          this.activeTextBlockIndex = null;
          // 누적 버퍼를 event data 에 실어서 보낸다. text_delta 는 히스토리에 저장하지 않으므로
          // 재연결/SQLite 리플레이 시 완성 텍스트를 이걸로 복원한다.
          this.emit({ kind: 'text_stop', data: { text: fullText, blockIndex: closedIdx }, at });
          break;
        }
        case 'log':
        default:
          if (parsed.message) {
            this.emit({
              kind: 'log',
              data: { stream: 'stdout', line: parsed.message },
              at,
            });
          }
          break;
      }
    }
  }

  private emit(event: RunEvent): void {
    const historic: HistoricRunEvent = { ...event, seq: this.nextSeq++ };
    // text_delta 는 턴 당 수십~수백 건 나오는 고빈도 이벤트이고, 완성 텍스트는
    // text_stop.data.text 에 이미 실려있다. 메모리(eventHistory)·DB·SSE replay 에 넣지 않는다.
    // 라이브 클라이언트와 listeners 에게는 그대로 전달해 스트리밍 UX 를 유지한다.
    if (event.kind !== 'text_delta') {
      this.eventHistory.push(historic);
    }
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
