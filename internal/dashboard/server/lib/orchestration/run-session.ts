import { randomUUID } from 'crypto';
import { readFileSync, unlinkSync } from 'fs';
import os from 'os';
import path from 'path';
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
  /** 프로세스/IO 레벨 오류 — child process crash, stdin write/end 실패 등.
   *  클라이언트는 재연결·복원 맥락 신호로 해석한다 (EventSource 의 네이티브
   *  `error` 이벤트와 의미적으로 같은 층위). 실패 reason UI 용도로 쓰지 말 것. */
  | 'error'
  /** 스킬 도메인 실패 이유 — 상태 파일 누락 / `{status:"failure",reason}` 기록 등.
   *  클라이언트는 data.message 를 run 실패 UI 의 reason 으로 표시한다.
   *  `error` 와 달리 재연결 트리거가 아니라 실패 원인 전달용. */
  | 'run_error'
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

export interface RunStatusReport {
  status: 'success' | 'failure';
  reason?: string;
}

/**
 * 스킬이 종료 직전 `Write` 로 기록하는 상태 파일을 읽는다.
 *
 * 대시보드는 Claude CLI exit code 만으로는 스킬의 "의미적 실패"(예:
 * `.meta-dashboard.json` 파싱 실패, PRD 미존재, Write 실패, 스킬 누락,
 * 질문 대기 중 타임아웃 등)를 구분할 수 없다. CLI 자체는 이런 경우에도
 * exit 0 으로 끝나므로 exit 0 = 성공 으로 간주하면 silent success 가 발생한다.
 *
 * 이를 막기 위해 각 스킬 spawn 에 per-run 파일 경로를 `AIT_RUN_STATUS_PATH`
 * 환경변수로 전달하고, 스킬이 종료 직전 거기에 구조화된 JSON 을 기록하도록
 * 계약화한다. 파일의 **존재 자체**가 "스킬이 의식적으로 종료했다" 는 신호다.
 *
 * 규약:
 * - 파일 없음 → FAILED (status missing — 스킬이 기록을 누락했거나 Write 실패)
 * - `{"status":"success"}` → COMPLETED
 * - `{"status":"failure","reason":"..."}` → FAILED (+ reason 을 error 이벤트로 방송)
 * - JSON 파싱 실패·스키마 위반 → FAILED (신호 자체가 깨졌으므로 실패로 간주)
 */
export function readRunStatusFile(statusPath: string): RunStatusReport | null {
  let raw: string;
  try {
    raw = readFileSync(statusPath, 'utf-8');
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { status?: unknown; reason?: unknown };
    if (parsed.status === 'success') return { status: 'success' };
    if (parsed.status === 'failure') {
      return {
        status: 'failure',
        ...(typeof parsed.reason === 'string' && parsed.reason.trim()
          ? { reason: parsed.reason.trim() }
          : {}),
      };
    }
    return { status: 'failure', reason: `invalid status field: ${String(parsed.status)}` };
  } catch (err) {
    return {
      status: 'failure',
      reason: `status file JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
  /** 스킬이 종료 직전 JSON 상태 리포트를 기록하는 per-run 파일 경로.
   *  `AIT_RUN_STATUS_PATH` 환경변수로 스킬에 전달된다. child close 시 이 파일을 읽어
   *  COMPLETED/FAILED 를 결정하고, 읽은 직후 삭제해 다음 run 에 영향이 없게 한다. */
  readonly statusPath: string;

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
    this.statusPath = path.join(os.tmpdir(), `ait-run-status-${this.runId}.json`);

    this.transition('VALIDATING_INPUT');
    this.transition('READY');

    this.child = spawnClaudeForSkill({
      cwd: init.cwd,
      mode: init.mode,
      statusPath: this.statusPath,
    });
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

  sendInput(
    text: string,
    opts: { toolUseId?: string } = {},
  ): { ok: true } | { ok: false; reason: string } {
    if (TERMINAL_STATES.has(this.state)) {
      return { ok: false, reason: `session is ${this.state}` };
    }
    try {
      this.child.stdin.write(encodeUserInput(text));
      const now = new Date().toISOString();
      // user_input 이벤트는 SSE 재연결 시 "이 질문은 이미 답변됨" 상태 복원에 쓰인다.
      // toolUseId 가 같이 오면 정확한 질문 매칭이 가능하고, 없으면 레거시처럼 순서 매칭.
      const data: { text: string; toolUseId?: string } = { text };
      if (opts.toolUseId) data.toolUseId = opts.toolUseId;
      this.emit({ kind: 'user_input', data, at: now });
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

  /**
   * 사용자가 대시보드에서 "이 단계 완료" 를 눌렀을 때 호출.
   * stdin 을 닫아 CLI 가 현재 턴을 마무리하고 스스로 exit 하게 한다 (→ COMPLETED).
   * cancel() 과 달리 SIGTERM 을 보내지 않으므로, 진행 중이던 tool_use 는 정상 완료된다.
   * 이미 terminal 이면 no-op.
   */
  finishInteractive(): { ok: true } | { ok: false; reason: string } {
    if (TERMINAL_STATES.has(this.state)) {
      return { ok: false, reason: `session is ${this.state}` };
    }
    if (this.mode !== 'interactive') {
      return { ok: false, reason: 'finishInteractive only applies to interactive sessions' };
    }
    try {
      this.child.stdin.end();
      return { ok: true };
    } catch (err) {
      this.emit({
        kind: 'error',
        data: { message: err instanceof Error ? err.message : String(err) },
        at: new Date().toISOString(),
      });
      return { ok: false, reason: 'stdin end failed' };
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
      // CLI 종료 코드(크래시 등) + 스킬이 기록한 상태 파일 두 신호를 모두 본다.
      // 상태 파일은 스킬이 "의미적 실패"(CLI 자체는 exit 0 이지만 도메인 로직 실패)
      // 를 구조화된 JSON 으로 전달하는 유일한 통로. 파일이 없으면 스킬이 의식적
      // 종료 계약을 어긴 것이므로 exit code 와 무관하게 실패로 간주한다.
      // 읽은 즉시 파일은 삭제한다.
      const report = readRunStatusFile(this.statusPath);
      try {
        unlinkSync(this.statusPath);
      } catch {
        // 파일이 원래 없었거나 이미 삭제됨 — 무시. (없음은 위에서 실패로 처리)
      }
      const nonZeroExit = code !== 0;
      // 파일 없음(null) 도 실패로 취급. silent success 차단.
      const reportedFailure = report === null || report.status === 'failure';
      if (report === null) {
        // 상태 파일 자체가 없으면 원인을 UI 에 명시해 디버깅 단서를 남긴다.
        // 도메인 실패 채널(run_error) 로 보내 클라이언트가 재연결이 아닌
        // "실패 reason" 으로 처리하게 한다.
        this.emit({
          kind: 'run_error',
          data: {
            message:
              'status file missing — 스킬이 AIT_RUN_STATUS_PATH 기록을 누락했습니다',
          },
          at: new Date().toISOString(),
        });
      } else if (report.status === 'failure' && report.reason) {
        // 실패 이유를 UI 에 전달. 상태 전이(emit kind: 'state') 보다 먼저 보내
        // 클라이언트가 FAILED 상태와 함께 표시할 수 있게 한다.
        this.emit({
          kind: 'run_error',
          data: { message: report.reason },
          at: new Date().toISOString(),
        });
      }
      this.transition(nonZeroExit || reportedFailure ? 'FAILED' : 'COMPLETED');
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
