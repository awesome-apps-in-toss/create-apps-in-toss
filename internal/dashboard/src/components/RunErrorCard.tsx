import { AlertTriangle, LogIn, RefreshCw, Terminal, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchRunDetail, startRun } from '@/hooks/useRuns';
import type { RunSummary } from '@/hooks/useRuns';
import type { PipelineStep } from '@/hooks/useSkills';

interface RunErrorCardProps {
  run: RunSummary;
  step: PipelineStep;
  appName: string;
  isDemo: boolean;
  /** 마지막 stderr/log 줄. 진단에 도움이 되는 힌트 */
  hintLines?: string[];
  onRetry?: () => void;
}

/**
 * 실패한 실행을 사용자 친화적인 오류 카드로 보여준다.
 * 로그 힌트가 없으면 상세를 펼쳤을 때만 history API를 조회한다.
 */
export default function RunErrorCard({
  run,
  step,
  appName,
  isDemo,
  hintLines,
  onRetry,
}: RunErrorCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [fetchedHints, setFetchedHints] = useState<string[] | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // 펼치기/접기/runId 변경 과정에서 component 가 unmount 되면 loadHints 의 늦은 응답이
  // 이미 사라진 state 에 setter 를 호출할 수 있어서, 컴포넌트 생존 여부를 추적한다.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const effectiveHints = hintLines ?? fetchedHints ?? [];
  const diag = diagnoseFromHints(run.exitCode, effectiveHints);
  const canShowDetails = hintLines !== undefined ? effectiveHints.length > 0 : !isDemo;

  async function loadHints() {
    if (hintLines !== undefined || isDemo || detailsLoading || detailsLoaded) return;

    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const detail = await fetchRunDetail(run.runId);
      if (!mountedRef.current) return;
      if (!detail) {
        setDetailsError('로그를 불러오지 못했어요.');
        return;
      }

      const lines: string[] = [];
      for (const ev of detail.history) {
        if (ev.kind !== 'log' && ev.kind !== 'error') continue;
        const data = ev.data as { line?: string; message?: string } | null;
        if (!data) continue;

        if (typeof data.line === 'string') lines.push(data.line);
        else if (typeof data.message === 'string') lines.push(data.message);
      }

      setFetchedHints(lines.slice(-60));
      setDetailsLoaded(true);
    } finally {
      if (mountedRef.current) setDetailsLoading(false);
    }
  }

  function handleDetailsToggle(open: boolean) {
    if (!open) return;
    void loadHints();
  }

  async function handleRetry() {
    if (isDemo) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await startRun({
        skill: run.skill,
        appName,
        forceRerun: true,
      });
      if (mountedRef.current) onRetry?.();
    } catch (error) {
      if (mountedRef.current) {
        setRetryError(error instanceof Error ? error.message : 'Failed to retry');
      }
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }

  return (
    <div className="run-error-card">
      <div className="run-error-card-head">
        <AlertTriangle size={18} strokeWidth={2} className="run-error-card-icon" />
        <div>
          <h3 className="run-error-card-title">{step.label} 단계에서 문제가 발생했어요</h3>
          <p className="run-error-card-subtitle">
            {diag.summary}
            {run.exitCode !== null && (
              <span className="run-error-card-exit" title="프로세스 종료 코드">오류 코드 {run.exitCode}</span>
            )}
          </p>
        </div>
      </div>

      <div className="run-error-card-body">
        <h4 className="run-error-card-section">이렇게 해 보세요</h4>
        <ul className="run-error-card-suggestions">
          {diag.suggestions.map((suggestion, index) => (
            <li key={index} className="run-error-card-suggestion">
              <span className="run-error-card-suggestion-icon">{suggestion.icon}</span>
              <span>{suggestion.text}</span>
            </li>
          ))}
        </ul>

        {canShowDetails && (
          <details
            className="run-error-card-details"
            onToggle={(event) => handleDetailsToggle(event.currentTarget.open)}
          >
            <summary>
              개발자용 로그
              {effectiveHints.length > 0 ? ` (${effectiveHints.length}줄)` : ''}
            </summary>
            {detailsLoading ? (
              <div className="run-error-card-log">로그를 불러오는 중…</div>
            ) : detailsError ? (
              <div className="run-error-card-log">{detailsError}</div>
            ) : effectiveHints.length > 0 ? (
              <pre className="run-error-card-log">{effectiveHints.slice(-20).join('\n')}</pre>
            ) : detailsLoaded ? (
              <div className="run-error-card-log">보여드릴 로그가 없어요.</div>
            ) : null}
          </details>
        )}
      </div>

      {retryError && <div className="run-error-card-retry-error">{retryError}</div>}

      <div className="run-error-card-actions">
        <button
          type="button"
          className="run-error-card-retry"
          onClick={() => void handleRetry()}
          disabled={isDemo || retrying}
        >
          <RefreshCw size={14} strokeWidth={1.75} />
          {retrying ? '다시 시도 중…' : '다시 시도'}
        </button>
      </div>
    </div>
  );
}

interface Suggestion {
  icon: React.ReactNode;
  text: React.ReactNode;
}

interface Diagnosis {
  summary: string;
  suggestions: Suggestion[];
}

function diagnoseFromHints(exitCode: number | null, hints: string[]): Diagnosis {
  const tail = hints.join('\n').toLowerCase();

  const isWindows =
    typeof navigator !== 'undefined' && /win/i.test(navigator.platform ?? '');

  if (exitCode === -1) {
    return {
      summary: '서버가 다시 시작되면서 이 실행이 중단됐어요.',
      suggestions: [
        {
          icon: <RefreshCw size={14} strokeWidth={1.75} />,
          text: (
            <>
              <strong>다시 시도</strong>를 누르면 처음부터 다시 실행해요.
            </>
          ),
        },
      ],
    };
  }

  if (/enoent|command not found|spawn.*claude/.test(tail)) {
    return {
      summary: 'Claude Code가 설치돼 있지 않거나 실행할 수 없어요.',
      suggestions: [
        {
          icon: <Terminal size={14} strokeWidth={1.75} />,
          text: (
            <>
              Claude Code를 먼저 설치해 주세요.{' '}
              <a
                href="https://docs.claude.com/claude-code"
                target="_blank"
                rel="noopener noreferrer"
              >
                설치 가이드 열기
              </a>
            </>
          ),
        },
        {
          icon: <RefreshCw size={14} strokeWidth={1.75} />,
          text: (
            <>
              설치를 마친 뒤 페이지를 새로고침하고 <strong>다시 시도</strong>를 눌러 주세요.
            </>
          ),
        },
      ],
    };
  }

  if (/not logged in|unauthori|401|403|please login|claude[ /]login/.test(tail)) {
    return {
      summary: 'Claude Code 로그인이 필요해요.',
      suggestions: [
        {
          icon: <LogIn size={14} strokeWidth={1.75} />,
          text: (
            <>
              {isWindows ? '명령 프롬프트(또는 PowerShell)' : '터미널'}을 연 뒤
              <code>claude /login</code>을 실행해 로그인하고, 다시 시도해 주세요.
            </>
          ),
        },
      ],
    };
  }

  if (/network|econnreset|etimedout|dns|fetch failed/.test(tail)) {
    return {
      summary: '네트워크 연결에 문제가 있는 것 같아요.',
      suggestions: [
        {
          icon: <Wifi size={14} strokeWidth={1.75} />,
          text: (
            <>
              인터넷 연결을 확인하고 <strong>다시 시도</strong>를 눌러 주세요.
            </>
          ),
        },
      ],
    };
  }

  if (/permission denied|eacces/.test(tail)) {
    return {
      summary: '파일에 접근할 권한이 없어요.',
      suggestions: [
        {
          icon: <Terminal size={14} strokeWidth={1.75} />,
          text: isWindows ? (
            <>
              앱 폴더의 쓰기 권한을 확인해 주세요. 필요하면 에디터를 <strong>관리자 권한으로 실행</strong>해 보세요.
            </>
          ) : (
            <>
              앱 폴더의 쓰기 권한을 확인해 주세요. 필요하면 <code>chmod -R u+w ./apps/&lt;앱-이름&gt;</code> 로 권한을 열어 주세요.
            </>
          ),
        },
      ],
    };
  }

  if (/cancel|signal 15|sigterm/.test(tail)) {
    return {
      summary: '실행이 중간에 멈췄어요.',
      suggestions: [
        {
          icon: <RefreshCw size={14} strokeWidth={1.75} />,
          text: (
            <>
              문제가 없었다면 <strong>다시 시도</strong>를 눌러 처음부터 실행할 수 있어요.
            </>
          ),
        },
      ],
    };
  }

  return {
    summary: '예상치 못한 오류로 실패했어요.',
    suggestions: [
      {
        icon: <RefreshCw size={14} strokeWidth={1.75} />,
        text: (
          <>
            일시적인 문제일 수 있어요. <strong>다시 시도</strong>를 먼저 눌러 보세요.
          </>
        ),
      },
      {
        icon: <Terminal size={14} strokeWidth={1.75} />,
        text: (
          <>
            계속 실패하면 아래 "개발자용 로그"를 펼쳐서 내용을 복사해 두고, 대시보드를 띄운 터미널 창의 출력도 함께 확인해 주세요.
          </>
        ),
      },
    ],
  };
}
