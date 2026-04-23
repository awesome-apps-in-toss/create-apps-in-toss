import { useCallback, useEffect, useRef, useState } from 'react';

const IS_STATIC = import.meta.env.PROD;

export type RunState =
  | 'DRAFT'
  | 'VALIDATING_INPUT'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_USER_INPUT'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export const TERMINAL_RUN_STATES: ReadonlySet<RunState> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELED',
]);

/** 서버 `GET /api/orchestrations` 응답의 run 요약. */
export interface RunSummary {
  runId: string;
  skill: string;
  appName: string | null;
  state: RunState;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

export interface RunDetail extends RunSummary {
  initialPrompt: string;
  idempotencyKey: string | null;
  history: Array<{
    seq: number;
    kind: string;
    data: unknown;
    at: string;
  }>;
}

export interface RunQuestionOption {
  label: string;
  description?: string;
}

export interface RunQuestion {
  /** 사람에게 보여줄 프롬프트 텍스트 (요약). */
  prompt: string;
  /** AskUserQuestion 의 header (짧은 제목). */
  header?: string;
  /** 선택지. 비어있거나 undefined 면 자유 텍스트 응답. */
  options?: RunQuestionOption[];
  /** 다중 선택 여부. */
  multiSelect?: boolean;
  /** Claude 의 tool_use_id (디버깅용). */
  toolUseId?: string;
  /** 사용자가 이미 답변한 질문인지. user_input 이벤트 수신 시 questions 배열에서
   *  순서대로 가장 오래된 미답변 항목을 true 로 마킹한다. */
  answered: boolean;
  raw: unknown;
}

export interface StartRunBody {
  skill: string;
  appName?: string;
  input?: { idea?: string; prompt?: string };
  idempotencyKey?: string;
  forceRerun?: boolean;
}

export interface StartRunResponse extends RunSummary {
  reused: boolean;
  reason: 'running' | 'cached' | null;
}

/**
 * 현재 앱의 실행 목록을 조회한다. GitHub Pages (IS_STATIC) 환경에서는 비활성화된다.
 *
 * NOTE: SSE/WS 실시간 목록 갱신은 아직 별도 구현이 없어 필요할 때 refetch()로 새로고침한다.
 */
export function useRuns(appName: string | null): {
  runs: RunSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(!IS_STATIC && !!appName);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const refetch = useCallback(async () => {
    if (IS_STATIC || !appName) {
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/orchestrations?app=${encodeURIComponent(appName)}&limit=200`);
      if (!res.ok) throw new Error(`실행 기록을 불러오지 못했어요. (HTTP ${res.status})`);
      const data = (await res.json()) as { runs: RunSummary[] };
      if (!cancelRef.current) {
        setRuns(data.runs ?? []);
        setError(null);
      }
    } catch (e) {
      if (!cancelRef.current) setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.');
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [appName]);

  useEffect(() => {
    cancelRef.current = false;
    void refetch();
    return () => {
      cancelRef.current = true;
    };
  }, [refetch]);

  // 서버는 run 이 terminal 상태에 도달하면 /api/events 로 refresh 를 쏜다.
  // 라이브 패널이 없는 화면(타임라인만 보고 있거나 다른 페이지에서 진행한 경우)에서도
  // 파이프라인 진행도/뱃지가 즉시 갱신되도록 함께 구독한다.
  useEffect(() => {
    if (IS_STATIC || !appName) return;
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let retryCount = 0;

    const connect = () => {
      if (cancelled) return;
      es = new EventSource('/api/events');
      // 연결이 열리면 backoff 카운터 리셋. refresh 이벤트는 드물게 오므로
      // 여기서 리셋하지 않으면 오래 켜 둔 탭이 간헐적 끊김으로 누적돼 영구 중단된다.
      es.addEventListener('open', () => {
        retryCount = 0;
      });
      es.addEventListener('refresh', () => {
        void refetch();
      });
      es.addEventListener('error', () => {
        es?.close();
        es = null;
        if (cancelled || retryCount >= 6) return;
        retryCount += 1;
        const delay = Math.min(500 * 2 ** (retryCount - 1), 10000);
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };
    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [appName, refetch]);

  return { runs, loading, error, refetch };
}

/** 로그 엔트리 — tool use / 시스템 메시지 ('tool') 는 plaintext, Claude 의 생각은 'text' (markdown). */
export type RunLogKind = 'text' | 'tool';
export interface RunLogEntry {
  kind: RunLogKind;
  text: string;
}

/**
 * runId의 SSE 스트림을 구독한다. live 로그/질문/산출물 표시와 상태 반영에 사용한다.
 *   - 연결 끊김 시 exponential backoff 로 자동 재연결 (최대 10s).
 *   - 재연결 시 fromSeq 쿼리로 이미 받은 이벤트 중복 수신을 스킵.
 *   - 터미널 상태(COMPLETED/FAILED/CANCELED) 도달 시 재연결 중단.
 *   - text_start/delta/stop 이벤트로 Claude 텍스트를 증분 스트리밍한다. delta 가 도착할 때마다
 *     `streamingText` 가 갱신되고, text_stop 에서 `logs` 로 commit 된다.
 */
export function useRunStream(runId: string | null): {
  state: RunState | null;
  logs: RunLogEntry[];
  /** 현재 스트리밍 중인 Claude 텍스트 (아직 text_stop 안 옴). 없으면 null. */
  streamingText: string | null;
  artifacts: Array<{ path?: string; preview?: string }>;
  questions: RunQuestion[];
  /** 연결/재연결 상태 메시지. 네이티브 EventSource error(네트워크 끊김) 로 세팅됨.
   *  도메인 실패 reason 은 여기가 아니라 `failureReason` 으로 전달된다. */
  error: string | null;
  /** 스킬 도메인 실패 reason — 서버 `run_error` SSE 이벤트로 수신.
   *  `error` (재연결 맥락) 와 달리 FAILED 상태 UI 에 그대로 노출할 메시지. */
  failureReason: string | null;
  connected: boolean;
  /** optimistic 마킹 — sendRunInput 성공 직후 호출해 서버 user_input SSE 도착 전에 질문 카드를 닫는다.
   *  toolUseId 가 주어지면 해당 질문을, 없으면 "가장 오래된 미답변" 을 마킹. */
  markLatestQuestionAnswered: (toolUseId?: string) => void;
} {
  const [state, setState] = useState<RunState | null>(null);
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Array<{ path?: string; preview?: string }>>([]);
  const [questions, setQuestions] = useState<RunQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!runId || IS_STATIC) return;
    setState(null);
    setLogs([]);
    setStreamingText(null);
    setArtifacts([]);
    setQuestions([]);
    setError(null);
    setFailureReason(null);

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let retryCount = 0;
    let lastSeq = -1;
    let stateRef: RunState | null = null;
    // streaming 버퍼. setState 가 비동기라 delta 가 빠르게 연속으로 와도 누락 없이
    // 쌓이도록 로컬 변수로 관리한다. text_stop 에서 logs 로 commit 한 뒤 비운다.
    let streamingBuf = '';

    const connect = () => {
      if (cancelled) return;
      const url =
        lastSeq >= 0
          ? `/api/orchestrations/${runId}/stream?replay=true&fromSeq=${lastSeq + 1}`
          : `/api/orchestrations/${runId}/stream?replay=true`;
      es = new EventSource(url);
      setConnected(true);

      const parseData = (raw: string): { seq?: number; data?: unknown } => {
        try {
          return JSON.parse(raw) as { seq?: number; data?: unknown };
        } catch {
          return {};
        }
      };
      const trackSeq = (p: { seq?: number }) => {
        // 첫 메시지(정상 replay/state 이벤트) 를 받으면 재연결 성공으로 보고 backoff 를 리셋.
        // 일시 장애 후 다시 연결됐는데 retryCount 가 누적된 채로 다음 장애 시 delay 가 과도해지는 걸 막는다.
        if (retryCount > 0) retryCount = 0;
        if (typeof p.seq === 'number' && p.seq > lastSeq) lastSeq = p.seq;
      };

      es.addEventListener('state', (e) => {
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        const next = (payload.data as { state?: RunState } | undefined)?.state;
        if (next) {
          stateRef = next;
          setState(next);
        }
      });
      es.addEventListener('log', (e) => {
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        const line = (payload.data as { line?: string } | undefined)?.line;
        if (typeof line === 'string' && line.length > 0) {
          setLogs((prev) => [...prev, { kind: 'tool' as const, text: line }].slice(-500));
        }
      });
      es.addEventListener('text_start', (e) => {
        trackSeq(parseData((e as MessageEvent).data));
        streamingBuf = '';
        setStreamingText('');
      });
      es.addEventListener('text_delta', (e) => {
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        const text = (payload.data as { text?: string } | undefined)?.text;
        if (typeof text === 'string' && text.length > 0) {
          streamingBuf += text;
          setStreamingText(streamingBuf);
        }
      });
      es.addEventListener('text_stop', (e) => {
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        // 라이브 스트림에서는 streamingBuf 가 delta 들을 누적해놓은 상태.
        // 리플레이로 구 이벤트를 복원할 때는 text_delta 가 영속화되지 않아 streamingBuf 가 비어있을 수 있으므로,
        // 서버가 event.data.text 에 넣어준 완성본을 폴백으로 사용한다.
        const fallback = (payload.data as { text?: string } | undefined)?.text;
        const commit = streamingBuf.length > 0 ? streamingBuf : (fallback ?? '');
        streamingBuf = '';
        if (commit.length > 0) {
          setLogs((prev) => [...prev, { kind: 'text' as const, text: commit }].slice(-500));
        }
        setStreamingText(null);
      });
      es.addEventListener('artifact', (e) => {
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        if (payload.data) setArtifacts((prev) => [...prev, payload.data as { path?: string }]);
      });
      es.addEventListener('question', (e) => {
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        if (payload.data !== undefined) {
          setQuestions((prev) => [...prev, toRunQuestion(payload.data)]);
        }
      });
      es.addEventListener('user_input', (e) => {
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        // 서버가 sendInput 성공 시 emit. toolUseId 가 있으면 정확한 매칭,
        // 없으면 레거시 순서 매칭 (가장 오래된 미답변 질문).
        const ansToolUseId = (payload.data as { toolUseId?: string } | undefined)?.toolUseId;
        setQuestions((prev) => {
          if (ansToolUseId) {
            const idx = prev.findIndex(
              (q) => !q.answered && q.toolUseId === ansToolUseId,
            );
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = { ...prev[idx]!, answered: true };
            return next;
          }
          const idx = prev.findIndex((q) => !q.answered);
          if (idx === -1) return prev;
          const next = prev.slice();
          next[idx] = { ...prev[idx]!, answered: true };
          return next;
        });
      });
      es.addEventListener('run_error', (e) => {
        // 스킬 도메인 실패 reason. EventSource 네이티브 `error` (네트워크/재연결)
        // 와는 별개 채널 — UI 에서 FAILED 상태의 원인 메시지로 표시한다.
        const payload = parseData((e as MessageEvent).data);
        trackSeq(payload);
        const message = (payload.data as { message?: string } | undefined)?.message;
        if (typeof message === 'string' && message.length > 0) {
          setFailureReason(message);
        }
      });
      es.addEventListener('done', (e) => {
        trackSeq(parseData((e as MessageEvent).data));
        setConnected(false);
        es?.close();
        es = null;
      });
      es.addEventListener('error', () => {
        setConnected(false);
        es?.close();
        es = null;
        // terminal 상태면 재연결 금지. 아니면 backoff 로 재시도.
        if (stateRef && TERMINAL_RUN_STATES.has(stateRef)) return;
        retryCount += 1;
        const delay = Math.min(500 * 2 ** (retryCount - 1), 10000);
        setError(`연결 끊김 — ${Math.round(delay / 1000) || 1}s 뒤 재연결`);
        reconnectTimer = window.setTimeout(() => {
          if (cancelled) return;
          setError(null);
          connect();
        }, delay);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      es?.close();
      setConnected(false);
    };
  }, [runId]);

  const markLatestQuestionAnswered = useCallback((toolUseId?: string) => {
    setQuestions((prev) => {
      const idx = toolUseId
        ? prev.findIndex((q) => !q.answered && q.toolUseId === toolUseId)
        : prev.findIndex((q) => !q.answered);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx]!, answered: true };
      return next;
    });
  }, []);

  return {
    state,
    logs,
    streamingText,
    artifacts,
    questions,
    error,
    failureReason,
    connected,
    markLatestQuestionAnswered,
  };
}

/**
 * 서버에서 오는 question 이벤트 data 를 클라이언트 RunQuestion 으로 변환.
 *
 * 서버 최신 포맷 (stream-parser.ParsedQuestion):
 *   { text, header?, options?: [{label, description?}], multiSelect?, toolUseId? }
 *
 * 레거시 포맷 (raw Claude tool_use 블록) 도 폴백으로 허용 — SQLite 에 저장된 옛 이벤트가 있을 수 있다.
 */
function toRunQuestion(data: unknown): RunQuestion {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // 서버 포맷 우선.
    if (typeof obj['text'] === 'string') {
      const q: RunQuestion = { prompt: obj['text'], answered: false, raw: data };
      if (typeof obj['header'] === 'string') q.header = obj['header'];
      if (Array.isArray(obj['options'])) {
        q.options = obj['options']
          .map((o) => o as { label?: unknown; description?: unknown })
          .filter((o) => typeof o.label === 'string')
          .map((o) => {
            const opt: RunQuestionOption = { label: o.label as string };
            if (typeof o.description === 'string') opt.description = o.description;
            return opt;
          });
      }
      if (typeof obj['multiSelect'] === 'boolean') q.multiSelect = obj['multiSelect'];
      if (typeof obj['toolUseId'] === 'string') q.toolUseId = obj['toolUseId'];
      return q;
    }
  }
  return {
    prompt: extractQuestionPrompt(data),
    answered: false,
    raw: data,
  };
}

function extractQuestionPrompt(data: unknown): string {
  const prompt = collectQuestionText(data)
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n');

  return prompt || 'Claude가 추가 입력을 요청했습니다. 필요한 정보를 입력해 계속 진행하세요.';
}

function collectQuestionText(data: unknown): string[] {
  if (typeof data === 'string') return [data];
  if (Array.isArray(data)) return data.flatMap((item) => collectQuestionText(item));
  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;
  const preferredKeys = [
    'prompt',
    'question',
    'text',
    'message',
    'content',
    'body',
    'detail',
    'details',
    'description',
  ];

  const preferredValues = preferredKeys.flatMap((key) => collectQuestionText(record[key]));
  if (preferredValues.length > 0) return preferredValues;

  return Object.values(record).flatMap((value) => collectQuestionText(value));
}

/** GET /api/orchestrations/:runId 상세. history 포함 조회. */
export async function fetchRunDetail(runId: string): Promise<RunDetail | null> {
  if (IS_STATIC) return null;
  try {
    const res = await fetch(`/api/orchestrations/${runId}`);
    if (!res.ok) return null;
    return (await res.json()) as RunDetail;
  } catch {
    return null;
  }
}

/** POST /api/orchestrations 시작. */
export async function startRun(body: StartRunBody): Promise<StartRunResponse> {
  const res = await fetch('/api/orchestrations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'unknown' }))) as { error?: string };
    throw new Error(err.error ?? `Failed to start run: ${res.status}`);
  }
  return (await res.json()) as StartRunResponse;
}

/** POST /api/orchestrations/:runId/cancel */
export async function cancelRun(runId: string): Promise<void> {
  await fetch(`/api/orchestrations/${runId}/cancel`, { method: 'POST' });
}

/**
 * POST /api/orchestrations/:runId/finish — interactive 세션을 graceful 하게 종료.
 * stdin 만 닫아서 CLI 가 현재 턴을 마무리한 뒤 자연스럽게 exit 하게 한다 (→ COMPLETED).
 */
export async function finishRun(runId: string): Promise<void> {
  const res = await fetch(`/api/orchestrations/${runId}/finish`, { method: 'POST' });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'unknown' }))) as { error?: string };
    throw new Error(err.error ?? `Failed to finish run: ${res.status}`);
  }
}

/** POST /api/orchestrations/:runId/input — non-2xx 는 throw 해서 호출부가 UX 피드백 띄울 수 있도록.
 *  toolUseId 를 함께 보내면 서버 user_input 이벤트에 그대로 실려 재연결/replay 시 정확한 매칭이 가능하다. */
export async function sendRunInput(
  runId: string,
  text: string,
  opts: { toolUseId?: string } = {},
): Promise<void> {
  const body: { text: string; toolUseId?: string } = { text };
  if (opts.toolUseId) body.toolUseId = opts.toolUseId;
  const res = await fetch(`/api/orchestrations/${runId}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'unknown' }))) as { error?: string };
    throw new Error(err.error ?? `Failed to send input: ${res.status}`);
  }
}
