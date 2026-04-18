import { useEffect, useState } from 'react';

const IS_STATIC = import.meta.env.PROD;

export interface ClaudeDiagnostic {
  found: boolean;
  path: string | null;
  version: string | null;
  loggedIn: 'yes' | 'no' | 'unknown';
  message: string;
  platform: {
    os: string;
    arch: string;
    node: string;
  };
}

/**
 * Claude CLI 설치·로그인 진단 결과. GitHub Pages (IS_STATIC) 에서는 null.
 * 실패 시 error 에 메시지 세팅.
 */
export function useClaudeDiagnostic(): {
  diag: ClaudeDiagnostic | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [diag, setDiag] = useState<ClaudeDiagnostic | null>(null);
  const [loading, setLoading] = useState(!IS_STATIC);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (IS_STATIC) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/diagnostics/claude');
        if (!res.ok) throw new Error(`Failed to fetch diagnostic: ${res.status}`);
        const data = (await res.json()) as ClaudeDiagnostic;
        if (!cancelled) {
          setDiag(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { diag, loading, error, refetch: () => setNonce((n) => n + 1) };
}
