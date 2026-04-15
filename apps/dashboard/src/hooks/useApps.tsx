import { useState, useEffect, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AppInfo } from '@/types';

interface AppsContextValue {
  apps: AppInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const AppsContext = createContext<AppsContextValue | null>(null);

export function AppsProvider({ children }: { children: ReactNode }) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchApps() {
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
  }

  useEffect(() => {
    void fetchApps();

    // SSE로 파일 변경 감지 → 앱 목록 갱신
    const es = new EventSource('/api/events');
    es.addEventListener('refresh', () => void fetchApps());
    return () => es.close();
  }, []);

  return (
    <AppsContext.Provider value={{ apps, loading, error, refetch: fetchApps }}>
      {children}
    </AppsContext.Provider>
  );
}

export function useApps() {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error('useApps must be used within AppsProvider');
  return ctx;
}
