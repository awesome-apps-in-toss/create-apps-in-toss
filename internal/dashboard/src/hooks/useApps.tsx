import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AppInfo } from '@/types';
import { MOCK_APPS } from '@/demo/mockData';

// GitHub Pages 정적 배포 시 demo 모드
const IS_STATIC = import.meta.env.PROD;

interface AppsContextValue {
  apps: AppInfo[];
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  refetch: () => Promise<void>;
}

const AppsContext = createContext<AppsContextValue | null>(null);

export function AppsProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<AppInfo[]>(IS_STATIC ? MOCK_APPS : []);
  const [loading, setLoading] = useState(!IS_STATIC);
  const [error, setError] = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    if (IS_STATIC) return;
    try {
      const res = await fetch('/api/apps');
      if (!res.ok) throw new Error('Failed to fetch apps');
      const data = (await res.json()) as AppInfo[];
      setApps(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (IS_STATIC) return;

    void fetchApps();

    // SSE로 파일 변경 감지 → 앱 목록 갱신.
    // 서버가 재시작되면 브라우저가 자동으로 재연결하지만, 영구 장애에 대비해
    // retryCount 가 너무 쌓이면 중단하고 사용자가 수동으로 새로고침하도록 한다.
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let retryCount = 0;

    const connect = () => {
      if (cancelled) return;
      es = new EventSource('/api/events');
      // 연결이 열리면 backoff 카운터 리셋. refresh 이벤트 기반으로만 리셋하면
      // 장시간 idle 후 간헐 끊김이 누적돼 6회 초과 시 영구 중단된다.
      es.addEventListener('open', () => {
        retryCount = 0;
      });
      es.addEventListener('refresh', () => {
        void fetchApps();
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
  }, [fetchApps]);

  const value = useMemo<AppsContextValue>(
    () => ({ apps, loading, error, isDemo: IS_STATIC, refetch: fetchApps }),
    [apps, loading, error, fetchApps]
  );

  return <AppsContext.Provider value={value}>{children}</AppsContext.Provider>;
}

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error('useApps must be used within AppsProvider');
  return ctx;
}
