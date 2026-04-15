import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApps } from '@/hooks/useApps';
import AppAvatar from '@/components/AppAvatar';

type AppFilter = 'all' | 'brand' | 'store' | 'prd' | 'ut';

export default function Home() {
  const { apps, loading, error } = useApps();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AppFilter>('all');
  const miniAppCount = apps.filter((a) => a.dependencies['@apps-in-toss/web-framework']).length;

  if (loading) {
    return (
      <main className="main">
        <div className="loading">앱 목록 불러오는 중...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="main">
        <div className="error-box">
          <strong>서버 연결 실패</strong>
          <p>
            로컬 API 서버가 실행 중인지 확인하세요. (<code>pnpm dev</code>)
          </p>
          <p className="error-detail">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="main">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{apps.length}</div>
          <div className="stat-label">전체 앱</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{miniAppCount}</div>
          <div className="stat-label">토스 미니앱</div>
        </div>
      </div>

      <div className="filter-row">
        {(
          [
            ['all', '전체'],
            ['prd', 'PRD 없음'],
            ['brand', '브랜드 미설정'],
            ['store', '스토어 미등록'],
            ['ut', 'UT 없음'],
          ] as [AppFilter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            className={`filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="apps-grid">
        {apps
          .filter((app) => {
            if (filter === 'prd') return !app.docs.prd.exists;
            if (filter === 'brand') return app.completionDetail.layer1 < 40;
            if (filter === 'store') return app.completionDetail.layer2 < 30;
            if (filter === 'ut') return !app.docs.ut.exists;
            return true;
          })
          .map((app, i) => {
            const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
            const description = app.console.subtitle || app.description;

            return (
              <div
                key={app.folderName}
                className="app-card clickable"
                onClick={() => void navigate(`/apps/${app.folderName}`)}
              >
                <div className="app-card-header">
                  <AppAvatar app={app} index={i} />
                  <div className="app-info">
                    <div className="app-name">{displayName}</div>
                    <div className="app-package">{app.packageName}</div>
                  </div>
                  <span className="app-version">{app.version}</span>
                </div>

                {description && <p className="app-description">{description}</p>}

                <div className="app-card-footer">
                  <div className="app-status-tags">
                    {app.docs.prd.exists && <span className="status-tag status-tag--prd">PRD</span>}
                    {app.granite?.displayName && (
                      <span className="status-tag status-tag--brand">브랜드</span>
                    )}
                    {app.console.logoPath && (
                      <span className="status-tag status-tag--store">스토어</span>
                    )}
                    {app.docs.ut.exists && <span className="status-tag status-tag--ut">UT</span>}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </main>
  );
}
