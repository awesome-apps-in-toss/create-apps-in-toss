import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function NewApp() {
  const navigate = useNavigate();
  const [appName, setAppName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: 실제 앱 생성 로직 (pnpm new-app 실행 등)
    alert(`앱 생성 기능은 터미널에서 실행하세요:\npnpm new-app ${appName || '<앱-이름>'}`);
  };

  return (
    <div className="new-app-page">
      <div className="new-app-header">
        <button className="new-app-back-btn" onClick={() => void navigate('/')}>
          ← 돌아가기
        </button>
        <h1 className="new-app-title">새 앱 만들기</h1>
        <p className="new-app-subtitle">토스 미니앱을 추가합니다.</p>
      </div>

      <form className="new-app-form" onSubmit={handleSubmit}>
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
            터미널에서 직접 실행하거나 아래 버튼을 눌러 명령어를 복사하세요.
          </p>
        </div>

        <div className="new-app-actions">
          <button
            type="button"
            className="new-app-btn-secondary"
            onClick={() => void navigate('/')}
          >
            취소
          </button>
          <button type="submit" className="new-app-btn-primary">
            앱 생성
          </button>
        </div>
      </form>
    </div>
  );
}
