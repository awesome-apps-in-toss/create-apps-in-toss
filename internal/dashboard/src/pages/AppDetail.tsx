import { useState, useEffect, useRef, useCallback, useId, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import ReactMarkdown from 'react-markdown';
import {
  Monitor,
  MessageSquare,
  FileText,
  Loader2,
  ShieldCheck,
  Lock,
  Check,
  ChevronDown,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { useApps } from '@/hooks/useApps';
import { useSkills } from '@/hooks/useSkills';
import type { PipelineStep } from '@/hooks/useSkills';
import AppAvatar from '@/components/AppAvatar';
import RunTimeline from '@/components/RunTimeline';
import { startRun } from '@/hooks/useRuns';
import type { AppConsoleConfig, AllowedSkill, PipelineStepStatus } from '@/types';

type ConsoleTextField = Extract<
  keyof AppConsoleConfig,
  | 'nameKo'
  | 'nameEn'
  | 'aitCategory'
  | 'subtitle'
  | 'description'
  | 'keywords'
  | 'prdPath'
  | 'utPath'
>;

const CONSOLE_TEXT_FIELDS: {
  key: ConsoleTextField;
  label: string;
  placeholder: string;
  multiline?: boolean;
  copyable?: boolean;
}[] = [
  { key: 'nameKo', label: '한국어 이름', placeholder: '예: 소개팅 발주서', copyable: true },
  { key: 'nameEn', label: '영어 이름', placeholder: '예: Dating Order Form', copyable: true },
  {
    key: 'aitCategory',
    label: '카테고리',
    placeholder: '예: 생활 > 콘텐츠 > 테스트',
    copyable: true,
  },
  {
    key: 'subtitle',
    label: '부제',
    placeholder: '사용자가 얻는 가치 (비속어·느낌표 제외)',
    copyable: true,
  },
  {
    key: 'description',
    label: '상세 설명',
    placeholder: '무엇을 보고, 어떤 버튼을 누르고, 무엇을 경험하는지',
    multiline: true,
    copyable: true,
  },
  {
    key: 'keywords',
    label: '검색 키워드',
    placeholder: '쉼표로 구분 (예: 소개팅, 이상형, 테스트)',
    copyable: true,
  },
];

interface EditState {
  field: ConsoleTextField | null;
  value: string;
}

function assetUrl(appId: string, relPath: string) {
  return `/api/apps/${appId}/asset?path=${encodeURIComponent(relPath)}`;
}

// MarkdownViewer의 fetch 결과 캐시 (간단 FIFO, 최대 30개)
const MARKDOWN_CACHE_LIMIT = 30;
const markdownCache = new Map<string, string>();
function cacheMarkdown(key: string, value: string) {
  if (markdownCache.has(key)) markdownCache.delete(key);
  markdownCache.set(key, value);
  while (markdownCache.size > MARKDOWN_CACHE_LIMIT) {
    const oldest = markdownCache.keys().next().value;
    if (oldest === undefined) break;
    markdownCache.delete(oldest);
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}


// ── 파이프라인 단계 상태 판별 ──
type StepState = 'completed' | 'running' | 'enabled' | 'locked';

function getStepState(
  step: PipelineStep,
  progress: Record<number, PipelineStepStatus>,
  runningSkill: string | null = null
): StepState {
  if (runningSkill && runningSkill === step.skill) return 'running';
  if (progress[step.step]) return 'completed';
  if (step.requiresSteps.length === 0) return 'enabled';
  const allDepsMet = step.requiresSteps.every((s) => !!progress[s]);
  return allDepsMet ? 'enabled' : 'locked';
}

function getNextEnabledStep(
  pipeline: PipelineStep[],
  progress: Record<number, PipelineStepStatus>
): number | null {
  for (const step of pipeline) {
    const state = getStepState(step, progress);
    if (state === 'enabled') return step.step;
  }
  return null;
}

// 브랜드/스토어 섹션 완성도 카운터 ----
function computeBrandProgress(app: {
  granite: { appName: string | null; displayName: string | null; primaryColor: string | null; icon: string | null } | null;
  completionDetail: { layer1: number };
}): { filled: number; total: number } {
  const total = 5;
  const g = app.granite;
  let filled = 0;
  if (g?.appName) filled++;
  if (g?.displayName) filled++;
  if (g?.primaryColor) filled++;
  if (g?.icon) filled++;
  if (app.completionDetail.layer1 >= 10) filled++;
  return { filled, total };
}

function computeStoreProgress(console: AppConsoleConfig): { filled: number; total: number } {
  // logo(1) + thumbnail(1) + screenshots>=1(1) + 6 text fields = 9 total
  const total = 9;
  let filled = 0;
  if (console.logoPath) filled++;
  if (console.thumbnailPath) filled++;
  if (console.screenshotPaths.length > 0) filled++;
  const textKeys: ConsoleTextField[] = ['nameKo', 'nameEn', 'aitCategory', 'subtitle', 'description', 'keywords'];
  for (const k of textKeys) {
    const raw = console[k];
    if (Array.isArray(raw)) {
      if (raw.length > 0) filled++;
    } else if (raw) filled++;
  }
  return { filled, total };
}

export default function AppDetail() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { apps, refetch, isDemo } = useApps();
  const { pipeline } = useSkills();
  const appIndex = apps.findIndex((a) => a.folderName === appId);
  const app = apps[appIndex];

  const [edit, setEdit] = useState<EditState>({ field: null, value: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runningSkill, setRunningSkill] = useState<string | null>(null);
  const [runError, setRunError] = useState<{ skill: string; message: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pipelineExpanded, setPipelineExpanded] = useState(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);

  async function copyCliCommand(skill: string) {
    const cmd = `claude -p /${skill}`;
    await copyText(cmd);
    setCopiedCmd(skill);
    setTimeout(() => setCopiedCmd(null), 2000);
  }

  // 앱 직후 생성 시 SSE refresh 가 살짝 늦게 오는 경우가 있어,
  // 목록에 아직 없으면 짧게 재시도 해서 "불러오는 중..." 이 멈춰 있지 않도록 한다.
  useEffect(() => {
    if (app || !appId) {
      if (app && lookupFailed) setLookupFailed(false);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    setLookupFailed(false);
    const timer = setInterval(() => {
      if (cancelled) return;
      attempts += 1;
      void refetch();
      if (attempts >= 5) {
        clearInterval(timer);
        if (!cancelled) setLookupFailed(true);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [app, appId, refetch, lookupFailed]);

  // hook 호출 순서를 보장하기 위해 early return 앞에서 계산해둔다.
  // app 이 아직 로드되기 전엔 안전한 기본값을 먹여 placeholder 결과만 내고, 이후 실제 값으로 바뀐다.
  const brandProgress = useMemo(
    () => (app ? computeBrandProgress(app) : { filled: 0, total: 5 }),
    [app],
  );
  const storeProgress = useMemo(
    () => (app ? computeStoreProgress(app.console) : { filled: 0, total: 9 }),
    [app],
  );
  const nextStep = useMemo(
    () =>
      app ? getNextEnabledStep(pipeline, app.console.pipelineProgress) : null,
    [pipeline, app],
  );

  // 파이프라인 현재 단계에 맞춰 자동으로 해당 섹션을 펼치기.
  const lastAutoStepRef = useRef<number | null>(null);
  useEffect(() => {
    if (nextStep === null || nextStep === lastAutoStepRef.current) return;
    lastAutoStepRef.current = nextStep;
    if (nextStep === 3) setBrandOpen(true);
    if (nextStep === 2) setStoreOpen(true);
  }, [nextStep]);

  if (!app) {
    return (
      <main className="main">
        {lookupFailed ? (
          <div className="error-box" role="alert">
            <strong>앱을 찾을 수 없어요</strong>
            <p>
              <code>{appId}</code> 라는 이름의 앱을 찾지 못했어요. 주소가 맞는지 다시 확인하거나 홈에서 앱을 골라 주세요.
            </p>
            <div className="error-box-actions">
              <button type="button" className="btn-cta btn-cta--primary" onClick={() => void navigate('/')}>
                홈으로 돌아가기
              </button>
            </div>
          </div>
        ) : (
          <div className="loading">앱 정보를 불러오는 중…</div>
        )}
      </main>
    );
  }

  const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;

  function startEdit(field: ConsoleTextField) {
    const raw = app!.console[field];
    setSaveError(null);
    setEdit({
      field,
      value: Array.isArray(raw) ? (raw as string[]).join(', ') : ((raw as string | null) ?? ''),
    });
  }

  function cancelEdit() {
    setSaveError(null);
    setEdit({ field: null, value: '' });
  }

  async function saveField() {
    if (!edit.field || !app || isDemo) return;
    setSaving(true);
    try {
      let value: string | string[] | null = edit.value;
      if (edit.field === 'keywords') {
        value = edit.value
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
      } else if ((edit.field === 'prdPath' || edit.field === 'utPath') && !edit.value.trim()) {
        value = null;
      }
      const res = await fetch(`/api/apps/${app.folderName}/console`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [edit.field]: value }),
      });
      if (!res.ok) {
        let serverMsg: string | null = null;
        try {
          const data = (await res.json()) as { error?: string; message?: string };
          serverMsg = data?.error ?? data?.message ?? null;
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(
          `저장에 실패했어요 (상태 코드: ${res.status}). ${serverMsg ?? '잠시 후 다시 시도해 주세요.'}`,
        );
      }
      setSaveError(null);
      setEdit({ field: null, value: '' });
      await refetch();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy(field: ConsoleTextField) {
    const raw = app!.console[field];
    const text = Array.isArray(raw) ? (raw as string[]).join(', ') : String(raw ?? '');
    await copyText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  }

  // 예전엔 별도의 /api/run-skill 스트림 엔드포인트를 썼지만, 상태머신·AskUserQuestion
  // 라우팅·히스토리 리플레이가 모두 빠져 있어 통일된 /api/orchestrations 경로로 옮겼다.
  // 시작 후엔 아래 "출시 파이프라인" 섹션으로 스크롤해서 RunTimeline 의 실시간 패널이 뜨게 한다.
  async function runSkill(skill: AllowedSkill) {
    if (running || !app || isDemo) return;
    setRunning(true);
    setRunningSkill(skill);
    setPipelineExpanded(true);
    setRunError(null);
    try {
      await startRun({
        skill,
        appName: app.folderName,
        forceRerun: true,
      });
      if (typeof window !== 'undefined') {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        document.querySelector('.pipeline-section')?.scrollIntoView({
          behavior: reduced ? 'auto' : 'smooth',
          block: 'start',
        });
      }
      // RunTimeline 의 useRuns 훅이 refetch 되면서 새 run 을 픽업하고 라이브 패널을 연다.
      void refetch();
    } catch (e) {
      // 시작 자체에 실패했으면 사용자에게 알린다 (디스크 권한 / Claude CLI 미설치 등).
      const message = e instanceof Error ? e.message : String(e);
      setRunError({ skill, message });
    } finally {
      setRunning(false);
      setRunningSkill(null);
    }
  }

  function getFieldDisplayValue(field: (typeof CONSOLE_TEXT_FIELDS)[number]): string | null {
    const raw = app!.console[field.key];
    if (Array.isArray(raw)) return raw.length > 0 ? raw.join(', ') : null;
    return (raw as string) || null;
  }

  const isComplete = app.completion >= 100;

  return (
    <main className="main">
      <div className="breadcrumb">
        <button type="button" className="breadcrumb-back" onClick={() => void navigate('/')}>
          ← 홈
        </button>
        <span className="breadcrumb-sep">/</span>
        <span>{displayName}</span>
      </div>

      <div className="detail-header">
        <div className="detail-header-left">
          <AppAvatar app={app} index={appIndex} size="md" />
          <div>
            <h1 className="detail-title">
              {displayName}
              <span className="detail-version">{app.version}</span>
            </h1>
            <div className="detail-package">{app.packageName}</div>
          </div>
        </div>
        <div className={`detail-header-completion ${isComplete ? 'detail-header-completion--done' : ''}`}>
          <span className="completion-label">완성도</span>
          <span className="completion-value">{app.completion}%</span>
          {isComplete && <CheckCircle2 size={22} strokeWidth={2.25} className="completion-check" aria-label="완성" />}
        </div>
      </div>

      {/* ── 출시 파이프라인 ── */}
      <section className="detail-section pipeline-section">
        <div className="pipeline-header">
          <h2 className="detail-section-title">출시 파이프라인</h2>
          <div className="pipeline-header-actions">
            <button
              type="button"
              className="btn-pipeline-toggle"
              onClick={() => setPipelineExpanded((v) => !v)}
              aria-expanded={pipelineExpanded}
              aria-controls="pipeline-timeline"
            >
              {pipelineExpanded ? '간단히 보기' : '자세히 보기'}
            </button>
          </div>
        </div>

        {runError && (
          <div className="run-start-error" role="alert">
            <div className="run-start-error-body">
              <strong>실행을 시작하지 못했어요</strong>
              <p>Claude CLI 가 설치/로그인 되어 있고 디스크 권한이 열려 있는지 확인해 주세요.</p>
              <p className="run-start-error-detail">{runError.message}</p>
            </div>
            <div className="run-start-error-actions">
              <button
                type="button"
                className="btn-pipeline-toggle"
                onClick={() => void runSkill(runError.skill as AllowedSkill)}
                disabled={running}
              >
                다시 시도
              </button>
              <button
                type="button"
                className="btn-pipeline-toggle"
                onClick={() => setRunError(null)}
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* 라벨 + 번호가 항상 보이는 스테퍼 */}
        <ol
          className="pipeline-stepper"
          role="list"
          aria-label="출시 파이프라인 단계"
        >
          {pipeline.map((item, idx) => {
            const state = getStepState(item, app.console.pipelineProgress, runningSkill);
            const prevState =
              idx > 0 ? getStepState(pipeline[idx - 1]!, app.console.pipelineProgress) : null;
            const isNextStep = nextStep === item.step && state === 'enabled';
            const blockerSteps = item.requiresSteps.filter(
              (s) => !app.console.pipelineProgress[s],
            );
            return (
              <li key={item.skill} className="pipeline-stepper-item">
                {idx > 0 && (
                  <div
                    className={`pipeline-stepper-connector${
                      prevState === 'completed' ? ' pipeline-stepper-connector--done' : ''
                    }`}
                    aria-hidden="true"
                  />
                )}
                <div
                  className={`pipeline-stepper-node pipeline-stepper-node--${state}${
                    isNextStep ? ' pipeline-stepper-node--next' : ''
                  }`}
                  title={`${item.step}단계: ${item.label} — ${item.description}${
                    state === 'completed'
                      ? ' (완료)'
                      : state === 'locked'
                        ? ` (필요: ${item.requires})`
                        : ''
                  }`}
                  aria-current={isNextStep ? 'step' : undefined}
                  aria-label={`${item.step}단계 ${item.label} · ${
                    state === 'completed'
                      ? '완료'
                      : state === 'running'
                        ? '실행 중'
                        : state === 'locked'
                          ? '잠김'
                          : '진행 가능'
                  }`}
                >
                  <span className="pipeline-stepper-number">
                    {state === 'completed' ? (
                      <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                    ) : state === 'locked' ? (
                      <Lock size={13} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      item.step
                    )}
                  </span>
                  {state === 'running' && (
                    <span className="pipeline-stepper-ring" aria-hidden="true" />
                  )}
                </div>
                <span className="pipeline-stepper-label">{item.label}</span>
                {state === 'locked' && blockerSteps.length > 0 && (
                  <span className="pipeline-stepper-blocker" aria-hidden="true">
                    ↑ {blockerSteps[0]} 필요
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* CLI 한 방에 실행 (보조 affordance) */}
        <div className="pipeline-cli-row">
          <span className="pipeline-cli-row-label">전체 파이프라인을 터미널에서 한 번에 실행:</span>
          <button
            type="button"
            className={`btn-cli-chip ${copiedCmd === 'ait-launch' ? 'btn-cli-chip--copied' : ''}`}
            onClick={() => void copyCliCommand('ait-launch')}
            title="앱 폴더에서 실행하세요"
            aria-label="전체 실행 명령어 복사"
          >
            <code>claude -p /ait-launch</code>
            <Copy size={12} strokeWidth={2} aria-hidden="true" />
            <span className="btn-cli-chip-feedback">
              {copiedCmd === 'ait-launch' ? '복사됨' : '복사'}
            </span>
          </button>
        </div>

        {/* 실행 기록/현재 진행 (오케스트레이션 API 기반) */}
        {pipelineExpanded && (
          <RunTimeline
            id="pipeline-timeline"
            appName={app.folderName}
            pipeline={pipeline}
            isDemo={isDemo}
            onInteractiveStep={(step) => {
              // 입력 폼·CTA 는 Wizard 에만 있으므로 해당 step 으로 바로 점프.
              // (예전엔 plan 섹션으로만 스크롤해서 Step 2+ 에선 의미 없는 이동이었음)
              void navigate(`/wizard/${app.folderName}?skill=${encodeURIComponent(step.skill)}`);
            }}
            onRunComplete={() => void refetch()}
          />
        )}

      </section>

      {/* ── 기획 (PRD) ── */}
      <section id="plan-section" className="detail-section">
        <h2 className="detail-section-title">기획</h2>
        {app.docs.prd.exists ? (
          /* PRD가 있을 때: 경로 + 뷰어 */
          <div className="plan-existing">
            {app.console.prdSource !== 'generated' && !app.console.prdReviewedAt && !isDemo && (
              <PlanReviewBanner
                appId={app.folderName}
                prdSource={app.console.prdSource}
                onMarkedReviewed={() => void refetch()}
                onReviewByPlan={() => {
                  const prdPath = app.docs.prd.path ?? app.console.prdPath ?? '';
                  void navigate(
                    `/wizard/${app.folderName}?skill=ait-plan&mode=review&prd=${encodeURIComponent(prdPath)}`,
                  );
                }}
              />
            )}
            <div className="doc-path-row">
              <PathField
                label="PRD 경로"
                field="prdPath"
                value={app.docs.prd.path ?? app.console.prdPath}
                exists={app.docs.prd.exists}
                date={app.docs.prd.date}
                autoDetected={app.docs.prd.autoDetected}
                appId={app.folderName}
                edit={edit}
                saving={saving}
                saveError={saveError}
                onEdit={startEdit}
                onCancel={cancelEdit}
                onSave={() => void saveField()}
                onChange={(v) => setEdit({ field: 'prdPath', value: v })}
              />
            </div>
          </div>
        ) : (
          /* PRD가 없을 때: 3가지 진입점 */
          <div className="plan-empty">
            <p className="plan-empty-desc">기획서(PRD)가 아직 없어요. 아래 방법 중 하나로 시작해 보세요.</p>
            <div className="plan-entries">
              <PrdDropZone
                appId={app.folderName}
                onUploaded={() => void refetch()}
                isDemo={isDemo}
              />
              <div className="plan-entry">
                <div className="plan-entry-icon"><Monitor size={20} strokeWidth={1.75} /></div>
                <div className="plan-entry-title">CLI에서 직접 실행</div>
                <p className="plan-entry-desc">
                  터미널이 익숙하다면, 앱 폴더에서 명령어를 실행해 AI와 대화하며 기획할 수 있어요.
                </p>
                <button
                  type="button"
                  className={`btn-cli-chip ${copiedCmd === 'ait-plan' ? 'btn-cli-chip--copied' : ''}`}
                  onClick={() => void copyCliCommand('ait-plan')}
                  title="앱 폴더에서 실행하세요"
                  aria-label="기획 명령어 복사"
                >
                  <code>claude -p /ait-plan</code>
                  <Copy size={12} strokeWidth={2} aria-hidden="true" />
                  <span className="btn-cli-chip-feedback">
                    {copiedCmd === 'ait-plan' ? '복사됨' : '복사'}
                  </span>
                </button>
              </div>
              <button
                type="button"
                className="plan-entry plan-entry--clickable"
                onClick={() => void navigate(`/wizard/${app.folderName}`)}
                disabled={isDemo}
                title={isDemo ? '로컬에서 pnpm dev 실행 시 사용 가능' : '웹 위저드로 이동'}
              >
                <div className="plan-entry-icon"><MessageSquare size={20} strokeWidth={1.75} /></div>
                <div className="plan-entry-title">웹에서 기획</div>
                <p className="plan-entry-desc">
                  브라우저 위저드에서 AI와 대화하며 기획 · 스캐폴딩 · TDS 를 이어서 진행해요.
                </p>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 브랜드 & 코드 설정 | 스토어 등록 자료 (진행형 공개) ── */}
      {/* 브랜드 & 코드 설정 (Layer 1) */}
      <section className={`detail-section collapsible-section ${brandOpen ? 'collapsible-section--open' : ''}`}>
        <button
          type="button"
          className="collapsible-section-summary"
          onClick={() => setBrandOpen((v) => !v)}
          aria-expanded={brandOpen}
          aria-controls="brand-section-body"
        >
          <span className="collapsible-section-title">
            브랜드 & 코드 설정
            <span className="collapsible-section-source">granite.config.ts</span>
          </span>
          <span className="collapsible-section-progress" aria-label={`${brandProgress.filled} / ${brandProgress.total} 완료`}>
            <span className="collapsible-section-progress-text">
              {brandProgress.filled}/{brandProgress.total} 설정
            </span>
            <span
              className="collapsible-section-progress-bar"
              aria-hidden="true"
              style={{ ['--progress' as string]: `${(brandProgress.filled / brandProgress.total) * 100}%` }}
            />
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            className="collapsible-section-chevron"
            aria-hidden="true"
          />
        </button>
        {brandOpen && (
          <div id="brand-section-body" className="collapsible-section-body">
            <div className="meta-table">
              <ReadonlyRow label="appName" value={app.granite?.appName} />
              <ReadonlyRow label="displayName" value={app.granite?.displayName} />
              <ReadonlyRow
                label="primaryColor"
                value={app.granite?.primaryColor}
                render={(v) => (
                  <span className="color-swatch-row">
                    <span className="color-swatch" style={{ background: v }} />
                    {v}
                  </span>
                )}
              />
              <ReadonlyRow
                label="icon"
                value={app.granite?.icon}
                render={(v) => (
                  <span className="granite-icon-row">
                    <img
                      src={v}
                      alt=""
                      className="granite-icon-preview"
                      loading="lazy"
                      decoding="async"
                      width={40}
                      height={40}
                    />
                    <span className="granite-icon-url">{v}</span>
                  </span>
                )}
              />
              <div className="meta-row">
                <div className="meta-label">.ait 파일</div>
                <div className="meta-value">
                  <span>{app.completionDetail.layer1 >= 10 ? '준비됐어요' : '아직 없어요'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 스토어 등록 자료 (Layer 2) */}
      <section className={`detail-section collapsible-section ${storeOpen ? 'collapsible-section--open' : ''}`}>
        <button
          type="button"
          className="collapsible-section-summary"
          onClick={() => setStoreOpen((v) => !v)}
          aria-expanded={storeOpen}
          aria-controls="store-section-body"
        >
          <span className="collapsible-section-title">
            스토어 등록 자료
            <span className="collapsible-section-source">.meta-dashboard.json</span>
          </span>
          <span className="collapsible-section-progress" aria-label={`${storeProgress.filled} / ${storeProgress.total} 항목 완료`}>
            <span className="collapsible-section-progress-text">
              {storeProgress.filled}/{storeProgress.total} 항목 완료
            </span>
            <span
              className="collapsible-section-progress-bar"
              aria-hidden="true"
              style={{ ['--progress' as string]: `${(storeProgress.filled / storeProgress.total) * 100}%` }}
            />
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            className="collapsible-section-chevron"
            aria-hidden="true"
          />
        </button>
        {storeOpen && (
          <div id="store-section-body" className="collapsible-section-body">
            <div className="meta-table">
            {/* 앱 로고 */}
            <div className="meta-row">
              <div className="meta-label">앱 로고</div>
              <div className="meta-value">
                {app.console.logoPath ? (
                  <div className="asset-preview-row">
                    <img
                      src={assetUrl(app.folderName, app.console.logoPath)}
                      alt=""
                      className="asset-preview asset-preview-square"
                      loading="lazy"
                      decoding="async"
                      width={64}
                      height={64}
                    />
                    <span className="asset-path">{app.console.logoPath}</span>
                  </div>
                ) : (
                  <div className="meta-display">
                    <span className="meta-empty">아직 없어요 · 600×600 px 로고 필요</span>
                    <button
                      type="button"
                      className="btn-skill btn-skill-sm"
                      onClick={() => void runSkill('ait-assets')}
                      disabled={running || isDemo}
                      title={isDemo ? '내 PC에서 대시보드를 실행한 뒤 사용할 수 있어요' : undefined}
                    >
                      이미지 만들기
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 텍스트 필드 */}
            {CONSOLE_TEXT_FIELDS.map((field) => {
              const value = getFieldDisplayValue(field);
              return (
                <div key={field.key} className="meta-row">
                  <div className="meta-label">{field.label}</div>
                  <div className="meta-value">
                    {edit.field === field.key ? (
                      <div className="meta-edit">
                        {field.multiline ? (
                          <textarea
                            className="meta-input meta-textarea"
                            value={edit.value}
                            placeholder={field.placeholder}
                            autoFocus
                            rows={3}
                            onChange={(e) => setEdit({ field: field.key, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                        ) : (
                          <input
                            className="meta-input"
                            value={edit.value}
                            placeholder={field.placeholder}
                            autoFocus
                            onChange={(e) => setEdit({ field: field.key, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveField();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className="btn-save"
                          onClick={() => void saveField()}
                          disabled={saving}
                        >
                          {saving ? '저장 중…' : '저장'}
                        </button>
                        <button type="button" className="btn-cancel" onClick={cancelEdit}>
                          취소
                        </button>
                        {saveError && (
                          <span className="meta-error" role="alert">
                            {saveError}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="meta-display">
                        {value ? (
                          <span>{value}</span>
                        ) : (
                          <span className="meta-empty">{field.placeholder}</span>
                        )}
                        <div className="meta-actions">
                          {field.copyable && value && (
                            <button
                              type="button"
                              className={`btn-copy ${copied === field.key ? 'copied' : ''}`}
                              onClick={() => void handleCopy(field.key)}
                              title="클립보드에 복사"
                            >
                              {copied === field.key ? '복사됨' : '복사'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-edit"
                            onClick={() => startEdit(field.key)}
                            disabled={isDemo}
                            title={isDemo ? '로컬에서 pnpm dev 실행 시 사용 가능' : undefined}
                          >
                            편집
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 썸네일 */}
            <div className="meta-row">
              <div className="meta-label">썸네일</div>
              <div className="meta-value">
                {app.console.thumbnailPath ? (
                  <div className="asset-preview-row">
                    <img
                      src={assetUrl(app.folderName, app.console.thumbnailPath)}
                      alt=""
                      className="asset-preview asset-preview-wide"
                      loading="lazy"
                      decoding="async"
                      width={160}
                      height={69}
                    />
                    <span className="asset-path">{app.console.thumbnailPath}</span>
                  </div>
                ) : (
                  <div className="meta-display">
                    <span className="meta-empty">아직 없어요 · 1932×828 px 썸네일 필요</span>
                    <button
                      type="button"
                      className="btn-skill btn-skill-sm"
                      onClick={() => void runSkill('ait-assets')}
                      disabled={running || isDemo}
                      title={isDemo ? '내 PC에서 대시보드를 실행한 뒤 사용할 수 있어요' : undefined}
                    >
                      이미지 만들기
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 스크린샷 */}
            <div className="meta-row">
              <div className="meta-label">스크린샷</div>
              <div className="meta-value">
                {app.console.screenshotPaths.length > 0 ? (
                  <div className="screenshot-grid">
                    {app.console.screenshotPaths.map((p, idx) => (
                      <img
                        key={idx}
                        src={assetUrl(app.folderName, p)}
                        alt={`${displayName} 스크린샷 ${idx + 1}`}
                        className="asset-preview asset-preview-screenshot"
                        loading="lazy"
                        decoding="async"
                        width={61}
                        height={100}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="meta-empty">아직 없어요 · 세로 636×1048 px 3장 이상 필요</span>
                )}
              </div>
            </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 테스트 리포트 (UT) ── */}
      <section className="detail-section">
        <h2 className="detail-section-title">테스트 리포트</h2>
        <div className="doc-path-row">
          <PathField
            label="UT 경로"
            field="utPath"
            value={app.docs.ut.path ?? app.console.utPath}
            exists={app.docs.ut.exists}
            date={app.docs.ut.date}
            autoDetected={app.docs.ut.autoDetected}
            appId={app.folderName}
            edit={edit}
            saving={saving}
            saveError={saveError}
            onEdit={startEdit}
            onCancel={cancelEdit}
            onSave={() => void saveField()}
            onChange={(v) => setEdit({ field: 'utPath', value: v })}
          />
          <div className="doc-actions">
            {!app.docs.ut.exists && (
              <button
                type="button"
                className="btn-skill btn-skill-sm"
                onClick={() => void runSkill('ait-ut')}
                disabled={running || isDemo}
                title={isDemo ? '내 PC에서 대시보드를 실행한 뒤 사용할 수 있어요' : undefined}
              >
                테스트 리포트 만들기
              </button>
            )}
          </div>
        </div>
      </section>

    </main>
  );
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────

function PathField({
  label,
  field,
  value,
  exists,
  date,
  autoDetected,
  appId,
  edit,
  saving,
  saveError,
  onEdit,
  onCancel,
  onSave,
  onChange,
}: {
  label: string;
  field: ConsoleTextField;
  value: string | null;
  exists: boolean;
  date?: string;
  autoDetected?: boolean;
  appId: string;
  edit: EditState;
  saving: boolean;
  saveError?: string | null;
  onEdit: (f: ConsoleTextField) => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (v: string) => void;
}) {
  return (
    <div className="path-field">
      {edit.field === field ? (
        <div className="meta-edit">
          <input
            className="meta-input path-input"
            value={edit.value}
            placeholder="앱 폴더 기준 상대경로 (예: docs/PRD.md)"
            autoFocus
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <button type="button" className="btn-save" onClick={onSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="btn-cancel" onClick={onCancel}>
            취소
          </button>
          {saveError && (
            <span className="meta-error" role="alert">
              {saveError}
            </span>
          )}
        </div>
      ) : (
        <div className="path-field-body">
          <span className="path-field-label">{label}</span>
          {value ? (
            <code className={`path-code-inline ${exists ? 'path-exists' : 'path-missing'}`}>
              {value}
            </code>
          ) : (
            <span className="meta-empty">경로 미설정</span>
          )}
          {autoDetected && <span className="path-auto-badge">자동 감지</span>}
          {exists && date && <span className="doc-date">{date}</span>}
          <button type="button" className="btn-edit" onClick={() => onEdit(field)}>
            편집
          </button>
        </div>
      )}
      {exists && value && <MarkdownViewer appId={appId} relPath={value} title={label} />}
    </div>
  );
}

function MarkdownViewer({
  appId,
  relPath,
  title,
}: {
  appId: string;
  relPath: string;
  title: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const titleId = `md-modal-title-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    const key = `${appId}::${relPath}`;
    const cached = markdownCache.get(key);
    if (cached !== undefined) {
      setContent(cached);
      return;
    }
    // relPath 가 빠르게 바뀌면 이전 fetch 응답이 뒤늦게 도착해 새 응답을 덮을 수 있어서,
    // AbortController 로 취소하고 cancelled 플래그로도 한 번 더 막는다.
    const ctrl = new AbortController();
    let cancelled = false;
    setContent(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/apps/${appId}/asset?path=${encodeURIComponent(relPath)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        cacheMarkdown(key, text);
        setContent(text);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setContent('파일을 불러올 수 없어요. 경로가 올바른지 확인하고 잠시 뒤 다시 시도해 주세요.');
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [appId, relPath]);

  // 모달 열릴 때 ESC 키 처리 + 포커스 관리
  useEffect(() => {
    if (!modal) return;
    previousFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    // 닫기 버튼으로 초기 포커스 이동
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setModal(false);
        return;
      }
      // 포커스 트랩: Tab / Shift+Tab 이 모달 밖으로 빠져나가지 않도록 순환시킴
      if (e.key === 'Tab') {
        const root = modalRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !root.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !root.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // 닫힐 때 이전 포커스 복원
      previousFocusRef.current?.focus?.();
    };
  }, [modal]);

  if (content === null) return <div className="md-loading">불러오는 중…</div>;

  return (
    <>
      <div className="md-preview-wrap">
        <div className="md-content md-preview">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        <div className="md-preview-fade" />
        <button type="button" className="md-expand-btn" onClick={() => setModal(true)}>
          크게 보기
        </button>
      </div>

      {modal && (
        <div
          className="md-modal-overlay"
          role="presentation"
          onClick={() => setModal(false)}
        >
          <div
            ref={modalRef}
            className="md-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="md-modal-header">
              <span className="md-modal-title" id={titleId}>
                {title}
              </span>
              <button
                ref={closeBtnRef}
                type="button"
                className="md-modal-close"
                onClick={() => setModal(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className="md-modal-body md-content">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PrdDropZone({
  appId,
  onUploaded,
  isDemo,
}: {
  appId: string;
  onUploaded: () => void;
  isDemo?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (isDemo) return;
      if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
        setError('.md 또는 .txt 파일만 업로드할 수 있어요.');
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const content = await file.text();
        const res = await fetch(`/api/apps/${appId}/upload-prd`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? '업로드에 실패했어요.');
        }
        onUploaded();
      } catch (e) {
        setError(e instanceof Error ? e.message : '업로드에 실패했어요.');
      } finally {
        setUploading(false);
      }
    },
    [appId, isDemo, onUploaded]
  );

  return (
    <div
      className={`plan-entry plan-entry--drop ${dragOver && !isDemo ? 'plan-entry--drag-over' : ''} ${isDemo ? 'plan-entry--disabled' : ''}`}
      role="button"
      tabIndex={isDemo ? -1 : 0}
      aria-label="PRD 파일 업로드 (드래그앤드롭 또는 클릭)"
      aria-disabled={isDemo}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void handleFile(file);
      }}
      onClick={() => {
        if (isDemo) return;
        inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (isDemo) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".md,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      <div className="plan-entry-icon">
        {uploading ? (
          <span role="status" aria-label="업로드 중">
            <Loader2 size={20} strokeWidth={1.75} className="spin" />
          </span>
        ) : (
          <FileText size={20} strokeWidth={1.75} />
        )}
      </div>
      <div className="plan-entry-title">PRD 업로드</div>
      <p className="plan-entry-desc">
        {uploading
          ? '업로드 중…'
          : dragOver
            ? '여기에 놓으세요'
            : '기획서 파일(.md)을 드래그하거나 클릭하세요'}
      </p>
      {error && <p className="plan-entry-error">{error}</p>}
    </div>
  );
}

function PlanReviewBanner({
  appId,
  prdSource,
  onMarkedReviewed,
  onReviewByPlan,
}: {
  appId: string;
  prdSource: AppConsoleConfig['prdSource'];
  onMarkedReviewed: () => void;
  onReviewByPlan: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markReviewed() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/apps/${appId}/console`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prdReviewedAt: new Date().toISOString(),
          // 수동 "검토 완료" 는 source 도 확정시켜 배너가 다시 뜨지 않도록.
          prdSource: 'generated',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onMarkedReviewed();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setSaving(false);
    }
  }

  const headline =
    prdSource === 'uploaded'
      ? '외부에서 가져온 기획서예요'
      : '직접 작성한 기획서를 아직 검토받지 않았어요';

  return (
    <div className="plan-review-banner" role="status">
      <div className="plan-review-banner-head">
        <ShieldCheck size={16} strokeWidth={1.75} />
        <span className="plan-review-banner-title">{headline}</span>
      </div>
      <p className="plan-review-banner-desc">
        <strong>AI 검토</strong> 기능으로 이 기획서를 앱인토스 정책 · 비즈니스 모델 · 리스크 관점에서 짚어드릴 수 있어요.
        이미 검토를 마쳤으면 "검토 완료"로 배지만 제거할 수 있어요.
      </p>
      <div className="plan-review-banner-actions">
        <button
          type="button"
          className="plan-review-banner-btn plan-review-banner-btn--primary"
          onClick={onReviewByPlan}
          disabled={saving}
        >
          AI에게 검토 맡기기 →
        </button>
        <button
          type="button"
          className="plan-review-banner-btn"
          onClick={() => void markReviewed()}
          disabled={saving}
        >
          {saving ? '처리 중…' : '검토 완료로 표시'}
        </button>
      </div>
      {error && <div className="plan-review-banner-error" role="alert">{error}</div>}
    </div>
  );
}

function ReadonlyRow({
  label,
  value,
  render,
}: {
  label: string;
  value: string | null | undefined;
  render?: (v: string) => React.ReactNode;
}) {
  return (
    <div className="meta-row">
      <div className="meta-label">{label}</div>
      <div className="meta-value">
        {value ? (
          render ? (
            render(value)
          ) : (
            <span>{value}</span>
          )
        ) : (
          <span className="meta-empty">-</span>
        )}
      </div>
    </div>
  );
}
