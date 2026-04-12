import { useState, useEffect } from 'react';
import type { AppInfo } from '@/types';

export function useApps() {
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

  return { apps, loading, error, refetch: fetchApps };
}
