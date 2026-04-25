import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Image, Package, CheckCircle2, Code2, ClipboardList, Rocket } from 'lucide-react';
import type { AppInfo } from '@/types';

interface ArtifactReviewCardProps {
  step: number;
  app: AppInfo;
  /** 기본은 카드 안에서 preview만 렌더. expanded=true 면 PRD 전체 등 큰 내용도 표시. */
  expanded?: boolean;
}

/**
 * 각 단계가 만들어낸 주요 산출물의 리뷰 카드.
 *   - Step 1: PRD markdown
 *   - Step 2: 로고/가로 썸네일 프리뷰
 *   - Step 3: granite.config.ts 요약
 *   - Step 4: @toss/* 의존성 유무
 *   - Step 5: (후속) git diff / 구현 파일 요약
 *   - Step 6: 세로형 스크린샷 3장 프리뷰
 *   - Step 7: review 리포트 요약 (docs/ait-review-*.md)
 *   - Step 8: .ait 번들 존재 확인
 */
export default function ArtifactReviewCard({
  step,
  app,
  expanded = false,
}: ArtifactReviewCardProps) {
  switch (step) {
    case 1:
      return <PrdReview app={app} expanded={expanded} />;
    case 2:
      return <AssetsReview app={app} />;
    case 3:
      return <ScaffoldReview app={app} />;
    case 4:
      return <TdsReview app={app} />;
    case 5:
      return <ImplementReview app={app} />;
    case 6:
      return <ScreenshotsReview app={app} />;
    case 7:
      return <ReviewReportReview app={app} />;
    case 8:
      return <BuildReview app={app} />;
    default:
      return null;
  }
}

function CardShell({
  title,
  icon,
  tone = 'neutral',
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn';
  children: React.ReactNode;
}) {
  return (
    <div className={`artifact-card artifact-card--${tone}`}>
      <div className="artifact-card-head">
        <span className="artifact-card-icon">{icon}</span>
        <span className="artifact-card-title">{title}</span>
      </div>
      <div className="artifact-card-body">{children}</div>
    </div>
  );
}

function EmptyNote({ label }: { label: string }) {
  return <p className="artifact-card-empty">{label}</p>;
}

function PrdReview({ app, expanded }: { app: AppInfo; expanded: boolean }) {
  const prdPath = app.docs.prd.path ?? app.console.prdPath;
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!prdPath || !expanded) return;
    let cancelled = false;
    void fetch(`/api/apps/${app.folderName}/asset?path=${encodeURIComponent(prdPath)}`)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setError('PRD 파일을 불러올 수 없어요.');
      });
    return () => {
      cancelled = true;
    };
  }, [prdPath, expanded, app.folderName]);

  return (
    <CardShell
      title="기획서 (PRD)"
      icon={<FileText size={16} strokeWidth={1.75} />}
      tone={app.docs.prd.exists ? 'ok' : 'warn'}
    >
      {!app.docs.prd.exists ? (
        <EmptyNote label="아직 기획서(PRD)가 없어요." />
      ) : (
        <>
          <div className="artifact-card-meta">
            <code className="artifact-card-path">{prdPath}</code>
            {app.docs.prd.date && <span className="artifact-card-date">{app.docs.prd.date}</span>}
            {app.docs.prd.autoDetected && (
              <span className="artifact-card-badge">자동 감지</span>
            )}
          </div>
          {expanded && (
            <div className="artifact-card-preview md-content">
              {error ? (
                <div className="artifact-card-empty">{error}</div>
              ) : content === null ? (
                <div className="artifact-card-empty">기획서를 불러오는 중…</div>
              ) : (
                <ReactMarkdown>{content}</ReactMarkdown>
              )}
            </div>
          )}
        </>
      )}
    </CardShell>
  );
}

function AssetsReview({ app }: { app: AppInfo }) {
  const { logoPath, thumbnailPath } = app.console;
  const count = (logoPath ? 1 : 0) + (thumbnailPath ? 1 : 0);
  const tone: 'ok' | 'warn' = count > 0 ? 'ok' : 'warn';
  const appLabel = app.console.nameKo || app.granite?.displayName || app.folderName;
  return (
    <CardShell title="이미지 자료 (로고/가로 썸네일)" icon={<Image size={16} strokeWidth={1.75} />} tone={tone}>
      {count === 0 ? (
        <EmptyNote label="아직 만들어진 이미지가 없어요. 에셋 생성 단계를 실행한 뒤 다시 확인해 주세요." />
      ) : (
        <div className="artifact-asset-grid">
          {logoPath && (
            <figure className="artifact-asset-figure">
              <img
                src={`/api/apps/${app.folderName}/asset?path=${encodeURIComponent(logoPath)}`}
                alt={`${appLabel} 로고`}
                width={64}
                height={64}
                className="asset-preview asset-preview-square"
                loading="lazy"
              />
              <figcaption>로고</figcaption>
            </figure>
          )}
          {thumbnailPath && (
            <figure className="artifact-asset-figure">
              <img
                src={`/api/apps/${app.folderName}/asset?path=${encodeURIComponent(thumbnailPath)}`}
                alt={`${appLabel} 썸네일`}
                width={128}
                height={55}
                className="asset-preview asset-preview-wide"
                loading="lazy"
              />
              <figcaption>썸네일 (가로)</figcaption>
            </figure>
          )}
        </div>
      )}
    </CardShell>
  );
}

function ScreenshotsReview({ app }: { app: AppInfo }) {
  const { screenshotPaths } = app.console;
  const tone: 'ok' | 'warn' = screenshotPaths.length >= 3 ? 'ok' : 'warn';
  const appLabel = app.console.nameKo || app.granite?.displayName || app.folderName;
  return (
    <CardShell title="세로형 스크린샷 3장" icon={<Image size={16} strokeWidth={1.75} />} tone={tone}>
      {screenshotPaths.length === 0 ? (
        <EmptyNote label="아직 캡처된 스크린샷이 없어요. dev 서버를 띄운 뒤 스크린샷 단계를 실행해 주세요." />
      ) : (
        <div className="artifact-asset-grid">
          {screenshotPaths.slice(0, 3).map((p, i) => (
            <figure key={p} className="artifact-asset-figure">
              <img
                src={`/api/apps/${app.folderName}/asset?path=${encodeURIComponent(p)}`}
                alt={`${appLabel} 스크린샷 ${i + 1}`}
                width={48}
                height={80}
                className="asset-preview asset-preview-screenshot"
                loading="lazy"
              />
              <figcaption>스크린샷 {i + 1}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </CardShell>
  );
}

function ScaffoldReview({ app }: { app: AppInfo }) {
  const g = app.granite;
  const tone: 'ok' | 'warn' = g ? 'ok' : 'warn';
  return (
    <CardShell title="프로젝트 설정" icon={<Package size={16} strokeWidth={1.75} />} tone={tone}>
      {!g ? (
        <EmptyNote label="프로젝트 설정 파일을 찾을 수 없어요." />
      ) : (
        <dl className="artifact-kv">
          <KV label="appName" value={g.appName} />
          <KV label="displayName" value={g.displayName} />
          <KV
            label="primaryColor"
            value={g.primaryColor}
            render={(v) => (
              <span className="artifact-kv-color">
                <span className="artifact-kv-swatch" style={{ background: v }} />
                {v}
              </span>
            )}
          />
          <KV label="icon" value={g.icon} />
        </dl>
      )}
    </CardShell>
  );
}

function TdsReview({ app }: { app: AppInfo }) {
  const tossDeps = Object.keys(app.dependencies).filter((d) => d.startsWith('@toss/'));
  const sdk = app.dependencies['@apps-in-toss/web-framework'];
  const tone: 'ok' | 'warn' = tossDeps.length > 0 ? 'ok' : 'warn';
  return (
    <CardShell title="디자인 시스템 · SDK" icon={<Code2 size={16} strokeWidth={1.75} />} tone={tone}>
      {tossDeps.length === 0 ? (
        <EmptyNote label="토스 디자인 시스템(@toss/*) 패키지가 아직 설치되어 있지 않아요." />
      ) : (
        <ul className="artifact-card-list">
          {tossDeps.map((d) => (
            <li key={d}>
              <code>{d}</code> <span className="artifact-card-version">{app.dependencies[d]}</span>
            </li>
          ))}
          {sdk && (
            <li>
              <code>@apps-in-toss/web-framework</code>{' '}
              <span className="artifact-card-version">{sdk}</span>
            </li>
          )}
        </ul>
      )}
    </CardShell>
  );
}

function ImplementReview({ app }: { app: AppInfo }) {
  // Implement 단계의 산출물은 git diff 인데 이건 후속 enhancement. 지금은 개략 정보만.
  const srcPresent = !!app.dependencies['react'];
  const tone: 'ok' | 'warn' | 'neutral' = srcPresent ? 'ok' : 'neutral';
  return (
    <CardShell title="구현 결과" icon={<ClipboardList size={16} strokeWidth={1.75} />} tone={tone}>
      <p className="artifact-card-text">
        {srcPresent
          ? 'React + 디자인 시스템 기반으로 화면이 붙어 있어요. 어떤 코드가 바뀌었는지 보는 기능은 곧 추가될 예정이에요.'
          : '아직 구현된 코드가 없어요.'}
      </p>
    </CardShell>
  );
}

function ReviewReportReview({ app }: { app: AppInfo }) {
  // 단계 7의 산출물은 docs/ait-review-*.md. 경로만 추정해서 링크 제공.
  const hasPrd = app.docs.prd.exists;
  const tone: 'neutral' | 'warn' = hasPrd ? 'neutral' : 'warn';
  return (
    <CardShell title="검수 리포트" icon={<CheckCircle2 size={16} strokeWidth={1.75} />} tone={tone}>
      <p className="artifact-card-text">
        {hasPrd
          ? '검수 단계를 실행하면 docs/ 폴더 안에 리포트 파일이 만들어져요. 만들어지고 나면 여기서 요약을 볼 수 있게 될 예정이에요.'
          : '먼저 기획서(PRD)가 필요해요. 1단계를 먼저 완료해 주세요.'}
      </p>
    </CardShell>
  );
}

function BuildReview({ app }: { app: AppInfo }) {
  const hasAit = app.completionDetail.layer1 >= 10; // Layer 1 의 .ait 가중치 10
  const tone: 'ok' | 'warn' = hasAit ? 'ok' : 'warn';
  return (
    <CardShell title="업로드용 빌드 파일 (.ait)" icon={<Rocket size={16} strokeWidth={1.75} />} tone={tone}>
      <p className="artifact-card-text">
        {hasAit
          ? '업로드용 빌드 파일(.ait)이 준비됐어요. 앱인토스 콘솔에 바로 올릴 수 있어요.'
          : '아직 빌드 파일이 없어요. 마지막 빌드 단계를 실행해 주세요.'}
      </p>
    </CardShell>
  );
}

function KV({
  label,
  value,
  render,
}: {
  label: string;
  value: string | null;
  render?: (v: string) => React.ReactNode;
}) {
  return (
    <div className="artifact-kv-row">
      <dt>{label}</dt>
      <dd>
        {value ? (render ? render(value) : <span>{value}</span>) : <span className="artifact-kv-empty">-</span>}
      </dd>
    </div>
  );
}
