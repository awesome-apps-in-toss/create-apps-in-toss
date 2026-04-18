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
 * 앱 스킬 실행 기록 조회 훅. GitHub Pages (IS_STATIC) 빌드에서는 빈 배열.
 *
 * NOTE: SSE/WS 통합은 후속 스테이지에서. 현재는 명시적 refetch() 호출 시 fresh.
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
 * 특정 runId의 SSE 스트림을 구독. 서버가 live 세션을 갖고 있을 때만 유효.
 * 종료(COMPLETED/FAILED/CANCELED) 후에는 자동 close.
 *
 * 로그 라인·상태·아티팩트를 별도 배열로 축적한다.
 */
export function useRunStream(runId: string | null): {
  state: RunState | null;
  logs: string[];
  artifacts: Array<{ path?: string; preview?: string }>;
  questions: unknown[];
  error: string | null;
  connected: boolean;
} {
  const [state, setState] = useState<RunState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<Array<{ path?: string; preview?: string }>>([]);
  const [questions, setQuestions] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!runId || IS_STATIC) return;
    setState(null);
    setLogs([]);
    setArtifacts([]);
    setQuestions([]);
    setError(null);

    const es = new EventSource(`/api/orchestrations/${runId}/stream?replay=true`);
    setConnected(true);

    const parseData = (raw: string): unknown => {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };

    es.addEventListener('state', (e) => {
      const payload = parseData((e as MessageEvent).data) as { data?: { state?: RunState } };
      const next = payload?.data?.state;
      if (next) setState(next);
    });
    es.addEventListener('log', (e) => {
      const payload = parseData((e as MessageEvent).data) as {
        data?: { line?: string; stream?: string };
      };
      const line = payload?.data?.line;
      if (typeof line === 'string' && line.length > 0) {
        setLogs((prev) => [...prev, line].slice(-500));
      }
    });
    es.addEventListener('artifact', (e) => {
      const payload = parseData((e as MessageEvent).data) as {
        data?: { path?: string; preview?: string };
      };
      if (payload?.data) setArtifacts((prev) => [...prev, payload.data as { path?: string }]);
    });
    es.addEventListener('question', (e) => {
      const payload = parseData((e as MessageEvent).data) as { data?: unknown };
      if (payload?.data !== undefined) setQuestions((prev) => [...prev, payload.data]);
    });
    es.addEventListener('error', () => {
      setError('stream disconnected');
      setConnected(false);
      es.close();
    });
    es.addEventListener('done', () => {
      setConnected(false);
      es.close();
    });

    return () => {
      es.close();
      setConnected(false);
    };
  }, [runId]);

  return { state, logs, artifacts, questions, error, connected };
}

/** GET /api/orchestrations/:runId 헬퍼. history 포함 상세 조회. */
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

/** POST /api/orchestrations 헬퍼. */
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

/** POST /api/orchestrations/:runId/cancel 헬퍼. */
export async function cancelRun(runId: string): Promise<void> {
  await fetch(`/api/orchestrations/${runId}/cancel`, { method: 'POST' });
}

/** POST /api/orchestrations/:runId/input 헬퍼. */
export async function sendRunInput(runId: string, text: string): Promise<void> {
  await fetch(`/api/orchestrations/${runId}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}
