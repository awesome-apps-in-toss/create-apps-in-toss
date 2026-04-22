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
      setError('앱 폴더 이름은 영문 소문자 또는 숫자로 시작하고, 하이픈(-), 점(.), 언더스코어(_)만 사용할 수 있어요.');
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
        setError(data.error ?? `앱을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요. (상태 코드 ${res.status})`);
        return;
      }

      // 목록이 SSE refresh 보다 먼저 도착한 네비게이션 때문에
      // "앱 정보를 불러오는 중..." 가 멈추는 문제가 있어, navigate 전에 한 번 동기화.
      await refetch();
      // full 모드: pnpm new-app 이 끝난 상태 → Wizard 의 ait-scaffold 스텝으로 바로 진입.
      //   스킬이 이미 scaffolded 됨을 감지하고 (step 1 스킵) 라우팅/쿼리/TDS 결정만 수행.
      // planning-first 모드: stub 만 존재 → Wizard 의 ait-plan 부터 순차 진행.
      const targetPath =
        mode === 'planning-first'
          ? `/wizard/${appName}`
          : `/wizard/${appName}?skill=ait-scaffold`;
      void navigate(targetPath);
    } catch (err) {
      setError(`네트워크 연결에 문제가 있어요: ${err instanceof Error ? err.message : String(err)}`);
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
            maxLength={64}
            aria-describedby={`new-app-name-hint${error ? ' new-app-error' : ''}`}
            aria-invalid={error ? true : undefined}
          />
          <p id="new-app-name-hint" className="new-app-hint">영문 소문자 또는 숫자로 시작, 하이픈(-) · 점(.) · 언더스코어(_) 사용 가능.</p>
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
            maxLength={120}
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
            maxLength={1000}
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
                AI와 대화하며 기획서를 먼저 만든 뒤, 그 내용으로 프로젝트 틀을 세팅해요.
                처음 만드는 앱이라면 이 방식을 추천해요.
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
              <div className="new-app-mode-title">프로젝트 틀부터 만들기</div>
              <div className="new-app-mode-desc">
                기획 단계를 건너뛰고 빈 프로젝트를 바로 만들어요.
                이미 뭘 만들지 정해진 경우에만 선택하세요.
              </div>
            </div>
          </label>
        </fieldset>

        <div className="new-app-command-preview">
          <p className="new-app-command-label">
            {mode === 'full' ? '다음 동작' : '다음 단계'}
          </p>
          <p className="new-app-command-note">
            {mode === 'full'
              ? '앱 폴더와 빈 프로젝트를 만든 뒤 바로 AI 대화로 이동해 라우팅·서버 데이터·디자인 시스템을 결정해요.'
              : '앱 폴더를 먼저 만든 뒤 웹 마법사로 이동해 AI와 함께 기획 → 프로젝트 세팅 → 디자인 시스템 순으로 안내해 드려요.'}
          </p>
        </div>

        {error && (
          <div id="new-app-error" className="new-app-error" role="alert">
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
