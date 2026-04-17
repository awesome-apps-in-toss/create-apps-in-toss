import { AlertTriangle, RefreshCw, Terminal, LogIn, Wifi } from 'lucide-react';
import { useState } from 'react';
import { startRun } from '@/hooks/useRuns';
import type { RunSummary } from '@/hooks/useRuns';
import type { PipelineStep } from '@/hooks/useSkills';

interface RunErrorCardProps {
  run: RunSummary;
  step: PipelineStep;
  appName: string;
  isDemo: boolean;
  /** 마지막 stderr/log 줄 — 오류 진단에 도움이 되는 힌트. */
  hintLines?: string[];
  onRetry?: () => void;
}

/**
 * 실패한 run 에 대한 비개발자 친화 에러 카드.
 *   - exitCode / 최근 로그에서 공통 원인을 식별해 한국어 문구로 안내.
 *   - "다시 시도" = POST /api/orchestrations (forceRerun:true) 재호출.
 *   - 심각도별 권장 조치 (CLI 설치·로그인·네트워크 등) 링크 안내.
 */
export default function RunErrorCard({
  run,
  step,
  appName,
  isDemo,
  hintLines = [],
  onRetry,
}: RunErrorCardProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const diag = diagnoseFromHints(run.exitCode, hintLines);

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
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : 'Failed to retry');
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="run-error-card">
      <div className="run-error-card-head">
        <AlertTriangle size={18} strokeWidth={2} className="run-error-card-icon" />
        <div>
          <h3 className="run-error-card-title">
            {step.label} 단계에서 문제가 생겼습니다
          </h3>
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
          {diag.suggestions.map((s, i) => (
            <li key={i} className="run-error-card-suggestion">
              <span className="run-error-card-suggestion-icon">{s.icon}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>

        {hintLines.length > 0 && (
          <details className="run-error-card-details">
            <summary>개발자용 로그 ({hintLines.length}줄)</summary>
            <pre className="run-error-card-log">
              {hintLines.slice(-20).join('\n')}
            </pre>
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

/**
 * 종료 코드와 stderr/stdout 힌트에서 가장 그럴듯한 원인을 한국어로 요약.
 */
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
      summary: 'Claude CLI 를 실행할 수 없습니다.',
      suggestions: [
        {
          icon: <Terminal size={14} strokeWidth={1.75} />,
          text: (
            <>
              Claude Code CLI 가 설치되어 있는지 확인하세요. 설치 가이드는{' '}
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
          text: <>설치 후 이 페이지를 새로고침하고 <strong>다시 시도</strong>를 눌러주세요.</>,
        },
      ],
    };
  }

  if (/not logged in|unauthori|401|403|please login|claude[ \/]login/.test(tail)) {
    return {
      summary: 'Claude CLI 로그인이 필요합니다.',
      suggestions: [
        {
          icon: <LogIn size={14} strokeWidth={1.75} />,
          text: (
            <>
              터미널에서 <code>claude /login</code> 을 실행해 로그인한 뒤 다시 시도해주세요.
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
          text: <>인터넷 연결을 확인하고 <strong>다시 시도</strong>를 눌러주세요.</>,
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
          text: <>앱 폴더의 쓰기 권한을 확인해 주세요. 필요 시 에디터를 관리자로 실행합니다.</>,
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
          text: <>문제가 없었다면 <strong>다시 시도</strong>를 눌러 재실행할 수 있습니다.</>,
        },
      ],
    };
  }

  return {
    summary: '예상치 못한 오류로 실패했습니다.',
    suggestions: [
      {
        icon: <RefreshCw size={14} strokeWidth={1.75} />,
        text: <>일시적인 문제일 수 있습니다. <strong>다시 시도</strong>를 눌러보세요.</>,
      },
      {
        icon: <Terminal size={14} strokeWidth={1.75} />,
        text: (
          <>
            계속 실패하면 아래 개발자용 로그를 확인하거나{' '}
            <code>pnpm dev</code> 콘솔 출력을 확인해 주세요.
          </>
        ),
      },
    ],
  };
}
