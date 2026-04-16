import { useState } from 'react';
import { useNavigate } from 'react-router';

const APP_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export default function NewApp() {
  const navigate = useNavigate();
  const [appName, setAppName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
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
        body: JSON.stringify({ appName, displayName, description }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `생성 실패 (HTTP ${res.status})`);
        return;
      }

      void navigate(`/apps/${appName}`);
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

        <div className="new-app-command-preview">
          <p className="new-app-command-label">실행될 명령어</p>
          <div className="new-app-command">
            <span className="prompt-symbol">$</span>
            <code>pnpm new-app {appName || '<앱-이름>'}</code>
          </div>
          <p className="new-app-command-note">
            아래 버튼을 누르면 웹에서 바로 스캐폴딩을 실행합니다. 터미널에서 직접 실행해도 동일하게 동작합니다.
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
