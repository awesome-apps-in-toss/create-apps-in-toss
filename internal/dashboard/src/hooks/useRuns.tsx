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
      if (!res.ok) throw new Error(`Failed to fetch runs: ${res.status}`);
      const data = (await res.json()) as { runs: RunSummary[] };
      if (!cancelRef.current) {
        setRuns(data.runs ?? []);
        setError(null);
      }
    } catch (e) {
      if (!cancelRef.current) setError(e instanceof Error ? e.message : 'Unknown error');
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

  return { runs, loading, error, refetch };
}

/**
 * runId의 SSE 스트림을 구독한다. live 로그/질문/산출물 표시와 상태 반영에 사용한다.
 *   - 연결 끊김 시 exponential backoff 로 자동 재연결 (최대 10s).
 *   - 재연결 시 fromSeq 쿼리로 이미 받은 이벤트 중복 수신을 스킵.
 *   - 터미널 상태(COMPLETED/FAILED/CANCELED) 도달 시 재연결 중단.
 */
export function useRunStream(runId: string | null): {
  state: RunState | null;
  logs: string[];
  artifacts: Array<{ path?: string; preview?: string }>;
  questions: RunQuestion[];
  error: string | null;
  connected: boolean;
} {
  const [state, setState] = useState<RunState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<Array<{ path?: string; preview?: string }>>([]);
  const [questions, setQuestions] = useState<RunQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!runId || IS_STATIC) return;
    setState(null);
    setLogs([]);
    setArtifacts([]);
    setQuestions([]);
    setError(null);

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let retryCount = 0;
    let lastSeq = -1;
    let stateRef: RunState | null = null;

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
          setLogs((prev) => [...prev, line].slice(-500));
        }
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

  return { state, logs, artifacts, questions, error, connected };
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
      const q: RunQuestion = { prompt: obj['text'], raw: data };
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

/** POST /api/orchestrations/:runId/input — non-2xx 는 throw 해서 호출부가 UX 피드백 띄울 수 있도록. */
export async function sendRunInput(runId: string, text: string): Promise<void> {
  const res = await fetch(`/api/orchestrations/${runId}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: 'unknown' }))) as { error?: string };
    throw new Error(err.error ?? `Failed to send input: ${res.status}`);
  }
}
