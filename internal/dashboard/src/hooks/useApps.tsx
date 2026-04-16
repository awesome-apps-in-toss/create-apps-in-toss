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

    // SSE로 파일 변경 감지 → 앱 목록 갱신
    const es = new EventSource('/api/events');
    es.addEventListener('refresh', () => void fetchApps());
    return () => es.close();
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
