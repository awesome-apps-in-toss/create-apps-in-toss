import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useApps } from '@/hooks/useApps';
import { useSkills } from '@/hooks/useSkills';
import type { PipelineStep } from '@/hooks/useSkills';
import AppAvatar from '@/components/AppAvatar';
import ClaudeStatus from '@/components/ClaudeStatus';
import type { AppInfo } from '@/types';

type AppFilter = 'all' | 'brand' | 'store' | 'prd' | 'ut';

const REPO_URL = 'https://github.com/Awesome-Apps-in-Toss/create-apps-in-toss';

/** 앱에서 아직 완료되지 않은 다음 파이프라인 단계 */
function getNextStep(app: AppInfo, pipeline: PipelineStep[]): PipelineStep | null {
  return pipeline.find((s) => !app.console.pipelineProgress[s.step]) ?? null;
}

/** 완성도가 가장 높고, 아직 할 일이 남은 앱 */
function getMostUrgentApp(apps: AppInfo[]): AppInfo | null {
  return (
    [...apps]
      .filter((a) => a.completion < 100)
      .sort((a, b) => b.completion - a.completion)[0] ?? null
  );
}

export default function Home() {
  const { apps, loading, error, isDemo, refetch } = useApps();
  const { pipeline } = useSkills();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AppFilter>('all');

  const urgentApp = getMostUrgentApp(apps);
  const nextStep = urgentApp ? getNextStep(urgentApp, pipeline) : null;

  if (loading) {
    return (
      <main className="main">
        <div className="loading">
          <Loader2 size={16} className="spin" aria-hidden="true" />
          <span>앱 목록 불러오는 중…</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="main">
        <div className="error-box" role="alert">
          <div className="error-box-head">
            <AlertTriangle size={18} aria-hidden="true" />
            <strong>서버 연결 실패</strong>
          </div>
          <p>
            로컬 API 서버가 실행 중인지 확인하세요. (<code>pnpm dev</code>)
          </p>
          <p className="error-detail">{error}</p>
          <div className="error-box-actions">
            <button
              type="button"
              className="btn-cta btn-cta--primary"
              onClick={() => void refetch()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              다시 시도
            </button>
            <a
              className="btn-cta btn-cta--ghost"
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub 에서 이슈 보고
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </main>
    );
  }

  const filteredApps = apps.filter((app) => {
    if (filter === 'prd') return !app.docs.prd.exists;
    if (filter === 'brand') return app.completionDetail.layer1 < 40;
    if (filter === 'store') return app.completionDetail.layer2 < 30;
    if (filter === 'ut') return !app.docs.ut.exists;
    return true;
  });

  const urgentDisplayName =
    urgentApp
      ? (urgentApp.granite?.displayName ?? urgentApp.console.nameKo) || urgentApp.folderName
      : null;

  return (
    <main className="main">
      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-inner">
          <span className="hero-eyebrow">Barreleye · 미니앱 대시보드</span>
          <h1 className="hero-title">
            토스 미니앱 개발의 모든 것,
            <br />
            <em className="hero-title-accent">한 곳에서</em>
          </h1>
          <p className="hero-desc">
            여러 미니앱을 모노레포로 관리하고, 각 앱의 출시 준비 상태를 UI에서 확인하세요.
            공유 설정·에셋은 한 번만 관리하면 모든 앱에 적용돼요.
          </p>
          <div className="hero-cta">
            <a
              className="btn-cta btn-cta--primary"
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub에서 보기
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            {isDemo && (
              <a
                className="btn-cta btn-cta--ghost"
                href={`${REPO_URL}#readme`}
                target="_blank"
                rel="noopener noreferrer"
              >
                시작하기 →
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ── Claude CLI 상태 ── */}
      {!isDemo && <ClaudeStatus />}

      {/* ── 다음 할 일 (로컬 모드) ── */}
      {!isDemo && urgentApp && nextStep && (
        <button
          type="button"
          className="next-action"
          onClick={() => void navigate(`/apps/${urgentApp.folderName}`)}
          style={{ font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="next-action-left">
            <span className="next-action-eyebrow">출시에 가장 가까운 앱</span>
            <div className="next-action-main">
              <span className="next-action-app">{urgentDisplayName}</span>
              <span className="next-action-step">
                다음 · {nextStep.step}단계 {nextStep.label}
              </span>
            </div>
            <span className="next-action-desc">{nextStep.description}</span>
          </div>
          <div className="next-action-right">
            <div className="next-action-meter">
              <div className="next-action-progress">
                <div
                  className="next-action-bar"
                  style={{ width: `${urgentApp.completion}%` }}
                />
              </div>
              <span className="next-action-pct">{urgentApp.completion}%</span>
            </div>
            <span className="next-action-arrow" aria-hidden="true">→</span>
          </div>
        </button>
      )}

      {/* ── 필터 + 앱 목록 ── */}
      {apps.length > 0 && (
        <div className="section-title">앱 {filteredApps.length}개</div>
      )}
      <div className="filter-row" role="group" aria-label="앱 필터">
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
            type="button"
            className={`filter-btn${filter === f ? ' active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredApps.length === 0 && (
        <div className="apps-empty" role="status">
          {apps.length === 0 ? (
            <>
              <p className="apps-empty-title">아직 등록된 앱이 없어요</p>
              <p className="apps-empty-desc">
                새 앱을 추가해 첫 미니앱을 만들어보세요.
              </p>
              <button
                type="button"
                className="btn-cta btn-cta--primary"
                onClick={() => void navigate('/new-app')}
              >
                새 앱 만들기
              </button>
            </>
          ) : (
            <>
              <p className="apps-empty-title">조건에 맞는 앱이 없어요</p>
              <p className="apps-empty-desc">
                필터를 바꾸거나 전체 보기로 돌아가 보세요.
              </p>
              <button
                type="button"
                className="btn-cta btn-cta--ghost"
                onClick={() => setFilter('all')}
              >
                전체 보기
              </button>
            </>
          )}
        </div>
      )}

      <div className="apps-grid">
        {filteredApps.map((app, i) => {
          const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
          const description = app.console.subtitle || app.description;
          const isComplete = app.completion === 100;

          return (
            <button
              key={app.folderName}
              type="button"
              className={`app-card clickable${isComplete ? ' app-card--complete' : ''}`}
              onClick={() => void navigate(`/apps/${app.folderName}`)}
              style={{ font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
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
                {isComplete && (
                  <span className="app-card-complete-chip">
                    <CheckCircle2 size={12} aria-hidden="true" />
                    출시 준비 완료
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
