import { CheckCircle2, AlertTriangle, XCircle, RefreshCcw, Terminal } from 'lucide-react';
import { useClaudeDiagnostic } from '@/hooks/useClaudeDiagnostic';

/**
 * Claude CLI 설치·로그인 상태 배너. Home/Sidebar 에 배치.
 * 로컬 모드에서만 의미가 있음 (데모에서는 훅이 null 을 반환 → 렌더 안 함).
 */
export default function ClaudeStatus({ compact = false }: { compact?: boolean }) {
  const { diag, loading, error, refetch } = useClaudeDiagnostic();

  if (loading && !diag) {
    return (
      <div className="claude-status claude-status--loading">
        <Terminal size={16} strokeWidth={1.75} />
        <span>Claude CLI 상태 확인 중…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="claude-status claude-status--error">
        <XCircle size={16} strokeWidth={2} />
        <span>진단 API 호출 실패: {error}</span>
        <button
          type="button"
          className="claude-status-refresh"
          onClick={() => refetch()}
          aria-label="다시 시도"
        >
          <RefreshCcw size={14} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  if (!diag) return null;

  const level: 'ok' | 'warn' | 'error' = !diag.found
    ? 'error'
    : diag.loggedIn === 'no'
      ? 'warn'
      : diag.loggedIn === 'yes'
        ? 'ok'
        : 'warn';

  const Icon = level === 'ok' ? CheckCircle2 : level === 'warn' ? AlertTriangle : XCircle;

  return (
    <div className={`claude-status claude-status--${level} ${compact ? 'claude-status--compact' : ''}`}>
      <Icon size={16} strokeWidth={2} className="claude-status-icon" />
      <div className="claude-status-body">
        <div className="claude-status-message">{diag.message}</div>
        {!compact && (
          <div className="claude-status-meta">
            {diag.found && diag.path && <span className="claude-status-meta-item">{diag.path}</span>}
            {diag.version && <span className="claude-status-meta-item">v{diag.version.replace(/^v/, '')}</span>}
            <span className="claude-status-meta-item">
              {diag.platform.os} · Node {diag.platform.node}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="claude-status-refresh"
        onClick={() => refetch()}
        aria-label="다시 확인"
        title="다시 확인"
      >
        <RefreshCcw size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
