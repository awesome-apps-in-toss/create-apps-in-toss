import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, AlertCircle, Server } from 'lucide-react';

/**
 * ait-screenshots 단계 진입 시 자동으로 dev 서버를 띄워 사용자가 별도 터미널을
 * 열 필요 없게 한다. 외부에서 이미 띄워둔 서버가 있으면 그대로 사용.
 *
 * 데모 모드에서는 실제 호출을 막고 안내만 노출한다.
 */

type Status = 'stopped' | 'starting' | 'running' | 'failed' | 'external';

interface DevServerInfo {
  appName: string;
  port: number | null;
  status: Status;
  startedAt: string | null;
  managed: boolean;
  lastError: string | null;
}

interface Props {
  appName: string;
  isDemo: boolean;
}

export default function DevServerControl({ appName, isDemo }: Props) {
  const [info, setInfo] = useState<DevServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // StrictMode 에서 effect 가 두 번 호출되어 start API 가 중복으로 가는 것 방지
  const autoStartedRef = useRef(false);

  const fetchStatus = useCallback(async (): Promise<DevServerInfo | null> => {
    try {
      const res = await fetch(`/api/apps/${appName}/dev-server/status`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as DevServerInfo;
      setInfo(data);
      setError(null);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태 조회 실패');
      return null;
    }
  }, [appName]);

  const start = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appName}/dev-server/start`, { method: 'POST' });
      const data = (await res.json()) as DevServerInfo;
      setInfo(data);
      setError(data.lastError);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'dev 서버 기동 실패');
    }
  }, [appName]);

  const stop = useCallback(async () => {
    try {
      const res = await fetch(`/api/apps/${appName}/dev-server/stop`, { method: 'POST' });
      const data = (await res.json()) as DevServerInfo;
      setInfo(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'dev 서버 종료 실패');
    }
  }, [appName]);

  // 초기 진입: 상태 조회 후 stopped 면 자동 기동 (데모 모드 제외)
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    void (async () => {
      const status = await fetchStatus();
      if (cancelled) return;
      if (status?.status === 'stopped' && !autoStartedRef.current) {
        autoStartedRef.current = true;
        await start();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemo, fetchStatus, start]);

  // starting 상태 동안 폴링
  useEffect(() => {
    if (info?.status !== 'starting') return;
    const id = window.setInterval(() => {
      void fetchStatus();
    }, 1500);
    return () => window.clearInterval(id);
  }, [info?.status, fetchStatus]);

  if (isDemo) {
    return (
      <aside className="dev-server-banner dev-server-banner--info">
        <Server size={14} strokeWidth={1.75} />
        <span>데모 모드에서는 실제 캡처가 동작하지 않아요. 로컬에서 띄운 dashboard 에서 확인해주세요.</span>
      </aside>
    );
  }

  if (!info) {
    return (
      <aside className="dev-server-banner">
        <Loader2 size={14} strokeWidth={1.75} className="spin" />
        <span>dev 서버 상태 확인 중…</span>
      </aside>
    );
  }

  const portLabel = info.port ? `:${info.port}` : '';

  if (info.status === 'external') {
    return (
      <aside className="dev-server-banner dev-server-banner--ok">
        <CheckCircle2 size={14} strokeWidth={1.75} />
        <span>이미 띄운 dev 서버 ({`localhost${portLabel}`}) 를 그대로 사용해요.</span>
      </aside>
    );
  }

  if (info.status === 'starting') {
    return (
      <aside className="dev-server-banner dev-server-banner--info">
        <Loader2 size={14} strokeWidth={1.75} className="spin" />
        <span>dev 서버를 켜고 있어요… ({`localhost${portLabel}`}) 30초 정도 걸릴 수 있어요.</span>
      </aside>
    );
  }

  if (info.status === 'running') {
    return (
      <aside className="dev-server-banner dev-server-banner--ok">
        <CheckCircle2 size={14} strokeWidth={1.75} />
        <span>dev 서버 준비됨 ({`localhost${portLabel}`}). 스크린샷이 끝나면 자동으로 종료해요.</span>
        <button type="button" className="dev-server-banner-stop" onClick={() => void stop()}>
          지금 끄기
        </button>
      </aside>
    );
  }

  // failed 또는 stopped
  return (
    <aside className="dev-server-banner dev-server-banner--warn">
      <AlertCircle size={14} strokeWidth={1.75} />
      <span>
        dev 서버를 켜지 못했어요. {info.lastError ?? error ?? '터미널에서 직접 띄워주세요'}
      </span>
      <button type="button" className="dev-server-banner-stop" onClick={() => void start()}>
        다시 시도
      </button>
    </aside>
  );
}
