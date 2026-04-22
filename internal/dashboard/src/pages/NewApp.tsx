import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApps } from '@/hooks/useApps';

const APP_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

type CreateMode = 'full' | 'planning-first';

export default function NewApp() {
  const navigate = useNavigate();
  const { refetch } = useApps();
  const [appName, setAppName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<CreateMode>('planning-first');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!APP_NAME_RE.test(appName)) {
      setError('앱 폴더 이름은 영문 소문자/숫자로 시작하고, 하이픈(-), 점(.), 언더스코어(_)만 사용할 수 있습니다.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/apps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName, displayName, description, mode }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `생성 실패 (HTTP ${res.status})`);
        return;
      }

      // 목록이 SSE refresh 보다 먼저 도착한 네비게이션 때문에
      // "앱 정보를 불러오는 중..." 가 멈추는 문제가 있어, navigate 전에 한 번 동기화.
      await refetch();
      const targetPath = mode === 'planning-first' ? `/wizard/${appName}` : `/apps/${appName}`;
      void navigate(targetPath);
    } catch (err) {
      setError(`네트워크 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="new-app-page">
      <div className="new-app-header">
        <button className="new-app-back-btn" onClick={() => void navigate('/')} disabled={submitting}>
          ← 돌아가기
        </button>
        <h1 className="new-app-title">새 앱 만들기</h1>
        <p className="new-app-subtitle">토스 미니앱을 추가합니다.</p>
      </div>

      <form className="new-app-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="new-app-field">
          <label className="new-app-label" htmlFor="appName">
            앱 폴더 이름 <span className="new-app-required">*</span>
          </label>
          <input
            id="appName"
            className="new-app-input"
            type="text"
            placeholder="예: my-mini-app"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            disabled={submitting}
            required
          />
          <p className="new-app-hint">영문 소문자와 하이픈(-)만 사용 가능합니다.</p>
        </div>

        <div className="new-app-field">
          <label className="new-app-label" htmlFor="displayName">
            표시 이름
          </label>
          <input
            id="displayName"
            className="new-app-input"
            type="text"
            placeholder="예: 나의 미니앱"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="new-app-field">
          <label className="new-app-label" htmlFor="description">
            설명
          </label>
          <textarea
            id="description"
            className="new-app-textarea"
            placeholder="앱에 대한 간단한 설명을 입력하세요."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            rows={3}
          />
        </div>

        <fieldset className="new-app-field new-app-mode">
          <legend className="new-app-label">생성 방식</legend>
          <label className={`new-app-mode-option ${mode === 'planning-first' ? 'new-app-mode-option--active' : ''}`}>
            <input
              type="radio"
              name="mode"
              value="planning-first"
              checked={mode === 'planning-first'}
              onChange={() => setMode('planning-first')}
              disabled={submitting}
            />
            <div className="new-app-mode-body">
              <div className="new-app-mode-title">기획부터 시작 (권장)</div>
              <div className="new-app-mode-desc">
                폴더만 먼저 만들고, <code>/ait-plan</code> → <code>/ait-scaffold</code> 순으로 위저드에서 진행합니다.
                PRD 결과가 스캐폴딩에 그대로 반영됩니다.
              </div>
            </div>
          </label>
          <label className={`new-app-mode-option ${mode === 'full' ? 'new-app-mode-option--active' : ''}`}>
            <input
              type="radio"
              name="mode"
              value="full"
              checked={mode === 'full'}
              onChange={() => setMode('full')}
              disabled={submitting}
            />
            <div className="new-app-mode-body">
              <div className="new-app-mode-title">바로 스캐폴딩</div>
              <div className="new-app-mode-desc">
                <code>pnpm new-app</code>으로 프로젝트를 즉시 스캐폴드합니다.
                기획 없이 빠르게 손대고 싶을 때.
              </div>
            </div>
          </label>
        </fieldset>

        <div className="new-app-command-preview">
          <p className="new-app-command-label">
            {mode === 'full' ? '실행될 명령어' : '첫 단계'}
          </p>
          <div className="new-app-command">
            <span className="prompt-symbol">$</span>
            <code>
              {mode === 'full'
                ? `pnpm new-app ${appName || '<앱-이름>'}`
                : `웹 위저드 → /ait-plan`}
            </code>
          </div>
          <p className="new-app-command-note">
            {mode === 'full'
              ? '아래 버튼을 누르면 웹에서 바로 스캐폴딩을 실행합니다. 터미널에서 직접 실행해도 동일하게 동작합니다.'
              : '앱 폴더와 메타데이터만 먼저 만든 뒤, 위저드에서 기획 · 스캐폴딩 · TDS 순으로 안내합니다.'}
          </p>
        </div>

        {error && (
          <div className="new-app-error" role="alert">
            {error}
          </div>
        )}

        <div className="new-app-actions">
          <button
            type="button"
            className="new-app-btn-secondary"
            onClick={() => void navigate('/')}
            disabled={submitting}
          >
            취소
          </button>
          <button type="submit" className="new-app-btn-primary" disabled={submitting}>
            {submitting ? '생성 중…' : '앱 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}
