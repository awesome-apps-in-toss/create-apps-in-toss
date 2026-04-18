import { AlertTriangle, LogIn, RefreshCw, Terminal, Wifi } from 'lucide-react';
import { useState } from 'react';
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

  const effectiveHints = hintLines ?? fetchedHints ?? [];
  const diag = diagnoseFromHints(run.exitCode, effectiveHints);
  const canShowDetails = hintLines !== undefined ? effectiveHints.length > 0 : !isDemo;

  async function loadHints() {
    if (hintLines !== undefined || isDemo || detailsLoading || detailsLoaded) return;

    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const detail = await fetchRunDetail(run.runId);
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
      setDetailsLoading(false);
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
      onRetry?.();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : 'Failed to retry');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="run-error-card">
      <div className="run-error-card-head">
        <AlertTriangle size={18} strokeWidth={2} className="run-error-card-icon" />
        <div>
          <h3 className="run-error-card-title">{step.label} 단계에서 문제가 발생했습니다</h3>
          <p className="run-error-card-subtitle">
            {diag.summary}
            {run.exitCode !== null && (
              <span className="run-error-card-exit">exit {run.exitCode}</span>
            )}
          </p>
        </div>
      </div>

      <div className="run-error-card-body">
        <h4 className="run-error-card-section">이렇게 해보세요</h4>
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
              <div className="run-error-card-log">로그를 불러오는 중...</div>
            ) : detailsError ? (
              <div className="run-error-card-log">{detailsError}</div>
            ) : effectiveHints.length > 0 ? (
              <pre className="run-error-card-log">{effectiveHints.slice(-20).join('\n')}</pre>
            ) : detailsLoaded ? (
              <div className="run-error-card-log">표시할 로그가 없어요.</div>
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
          {retrying ? '다시 시도 중...' : '다시 시도'}
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

  if (exitCode === -1) {
    return {
      summary: '서버가 재시작되면서 이 실행이 중단되었습니다.',
      suggestions: [
        {
          icon: <RefreshCw size={14} strokeWidth={1.75} />,
          text: (
            <>
              <strong>다시 시도</strong>를 누르면 처음부터 재실행합니다.
            </>
          ),
        },
      ],
    };
  }

  if (/enoent|command not found|spawn.*claude/.test(tail)) {
    return {
      summary: 'Claude CLI를 실행할 수 없습니다.',
      suggestions: [
        {
          icon: <Terminal size={14} strokeWidth={1.75} />,
          text: (
            <>
              Claude Code CLI가 설치되어 있는지 확인하세요. 설치 가이드는{' '}
              <a
                href="https://docs.claude.com/claude-code"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs.claude.com/claude-code
              </a>{' '}
              에서 확인할 수 있습니다.
            </>
          ),
        },
        {
          icon: <RefreshCw size={14} strokeWidth={1.75} />,
          text: (
            <>
              설치 후 이 페이지를 새로고침하고 <strong>다시 시도</strong>를 눌러주세요.
            </>
          ),
        },
      ],
    };
  }

  if (/not logged in|unauthori|401|403|please login|claude[ /]login/.test(tail)) {
    return {
      summary: 'Claude CLI 로그인이 필요합니다.',
      suggestions: [
        {
          icon: <LogIn size={14} strokeWidth={1.75} />,
          text: (
            <>
              터미널에서 <code>claude /login</code>을 실행해 로그인한 뒤 다시 시도해주세요.
            </>
          ),
        },
      ],
    };
  }

  if (/network|econnreset|etimedout|dns|fetch failed/.test(tail)) {
    return {
      summary: '네트워크 연결에 문제가 있는 것 같습니다.',
      suggestions: [
        {
          icon: <Wifi size={14} strokeWidth={1.75} />,
          text: (
            <>
              인터넷 연결을 확인하고 <strong>다시 시도</strong>를 눌러주세요.
            </>
          ),
        },
      ],
    };
  }

  if (/permission denied|eacces/.test(tail)) {
    return {
      summary: '파일에 접근할 권한이 없습니다.',
      suggestions: [
        {
          icon: <Terminal size={14} strokeWidth={1.75} />,
          text: (
            <>
              앱 폴더의 쓰기 권한을 확인해주세요. 필요 시 에디터를 관리자 권한으로 실행합니다.
            </>
          ),
        },
      ],
    };
  }

  if (/cancel|signal 15|sigterm/.test(tail)) {
    return {
      summary: '실행이 중단되었습니다.',
      suggestions: [
        {
          icon: <RefreshCw size={14} strokeWidth={1.75} />,
          text: (
            <>
              문제가 없었다면 <strong>다시 시도</strong>를 눌러 재실행할 수 있습니다.
            </>
          ),
        },
      ],
    };
  }

  return {
    summary: '예상치 못한 오류로 실패했습니다.',
    suggestions: [
      {
        icon: <RefreshCw size={14} strokeWidth={1.75} />,
        text: (
          <>
            일시적인 문제일 수 있습니다. <strong>다시 시도</strong>를 눌러보세요.
          </>
        ),
      },
      {
        icon: <Terminal size={14} strokeWidth={1.75} />,
        text: (
          <>
            계속 실패하면 아래 개발자용 로그를 확인하거나 <code>pnpm dev</code> 콘솔 출력을
            확인해주세요.
          </>
        ),
      },
    ],
  };
}
