import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LayoutDashboard, Terminal, Layers, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApps } from '@/hooks/useApps';
import { useSkills } from '@/hooks/useSkills';
import type { PipelineStep } from '@/hooks/useSkills';
import AppAvatar from '@/components/AppAvatar';
import type { AppInfo } from '@/types';

type AppFilter = 'all' | 'brand' | 'store' | 'prd' | 'ut';

const REPO_URL = 'https://github.com/Awesome-Apps-in-Toss/create-apps-in-toss';

const FEATURES: { Icon: LucideIcon; title: string; desc: string }[] = [
  {
    Icon: LayoutDashboard,
    title: '뭐가 빠졌는지 한눈에',
    desc: '브랜드·스토어 에셋·문서를 3가지 레이어로 나눠 완성도를 시각화',
  },
  {
    Icon: Terminal,
    title: '새 앱, 명령어 하나로',
    desc: 'pnpm new-app으로 미니앱 스캐폴딩. tsconfig·ESLint·TDS 설정이 자동 적용',
  },
  {
    Icon: Layers,
    title: '공통 설정은 한 번만',
    desc: 'TypeScript·ESLint·UI 컴포넌트를 모노레포 packages/에서 모든 앱이 공유',
  },
  {
    Icon: Sparkles,
    title: '막히는 단계, AI에게 맡기기',
    desc: '기획·에셋·구현·검수 등 각 단계를 AI 스킬로 하나씩 채우거나, /ait-launch로 전체를 한 번에 실행',
  },
];

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
  const { apps, loading, error, isDemo } = useApps();
  const { pipeline } = useSkills();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AppFilter>('all');

  const urgentApp = getMostUrgentApp(apps);
  const nextStep = urgentApp ? getNextStep(urgentApp, pipeline) : null;

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
        <div className="hero-head">
          <div className="hero-text">
            <h1 className="hero-title">
              토스 미니앱 개발의 모든 것,<br />한 곳에서
            </h1>
            <p className="hero-desc">
              여러 미니앱을 모노레포로 관리하고, 각 앱의 출시 준비 상태를 UI에서 확인하세요.
              공유 설정·에셋은 한 번만 관리하면 모든 앱에 적용됩니다.
            </p>
            <div className="hero-cta">
              <a
                className="btn-cta btn-cta--primary"
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub에서 보기
              </a>
              {isDemo && (
                <a
                  className="btn-cta btn-cta--secondary"
                  href={`${REPO_URL}#readme`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  시작하기 →
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="hero-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="hero-feature">
              <span className="hero-feature-icon"><f.Icon size={20} strokeWidth={1.75} /></span>
              <div>
                <div className="hero-feature-title">{f.title}</div>
                <div className="hero-feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

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
              <span className="next-action-sep">·</span>
              <span className="next-action-step">
                Step {nextStep.step} {nextStep.label} 필요
              </span>
              <span className="next-action-desc">{nextStep.description}</span>
            </div>
          </div>
          <div className="next-action-right">
            <div className="next-action-progress">
              <div
                className="next-action-bar"
                style={{ width: `${urgentApp.completion}%` }}
              />
            </div>
            <span className="next-action-pct">{urgentApp.completion}%</span>
            <span className="next-action-arrow">→</span>
          </div>
        </button>
      )}

      {/* ── 필터 + 앱 목록 ── */}
      <div className="filter-row" role="toolbar" aria-label="앱 필터">
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

      <div className="apps-grid">
        {filteredApps.map((app, i) => {
          const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
          const description = app.console.subtitle || app.description;

          return (
            <button
              key={app.folderName}
              type="button"
              className="app-card clickable"
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
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
