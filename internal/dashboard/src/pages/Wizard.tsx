import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Rocket, Loader2, Sparkles } from 'lucide-react';
import { useApps } from '@/hooks/useApps';
import { useSkills } from '@/hooks/useSkills';
import { useRuns, startRun, TERMINAL_RUN_STATES } from '@/hooks/useRuns';
import AppAvatar from '@/components/AppAvatar';
import ClaudeStatus from '@/components/ClaudeStatus';
import RunTimeline, { RunLivePanel, type RunCompletionResult } from '@/components/RunTimeline';
import SkillInputForm from '@/components/SkillInputForm';
import type { SkillInputState } from '@/components/SkillInputForm';
import type { PipelineStep } from '@/hooks/useSkills';
import type { RunSummary } from '@/hooks/useRuns';
import type { AppInfo } from '@/types';

const DEFAULT_PRIMARY_COLOR = '#3182F6';

/**
 * run artifact 중 `docs/prd/*.md` 또는 `docs/PRD.md` 같은 PRD 경로만 뽑아 마지막 것을 반환.
 * ait-plan 이 새로 저장한 PRD 파일을 감지해 console.prdPath 에 자동 반영하는 데 사용한다.
 */
function extractLatestPrdPath(artifacts: Array<{ path?: string }>): string | null {
  let latest: string | null = null;
  for (const a of artifacts) {
    const p = a.path;
    if (typeof p !== 'string') continue;
    // 윈도우/유닉스 경로 모두 허용 — 두 구분자 다 체크.
    const norm = p.replace(/\\/g, '/');
    if (!norm.toLowerCase().endsWith('.md')) continue;
    if (norm.includes('docs/prd/') || /(^|\/)docs\/prd\.md$/i.test(norm) || /(^|\/)docs\/PRD\.md$/.test(norm)) {
      latest = norm;
    }
  }
  return latest;
}

/**
 * 위저드 단계별로 app 메타데이터에서 뽑아 쓸 수 있는 기본값.
 * 사용자 경험: "위저드에 도착하자마자 이미 알고 있는 값은 미리 채워져 있다"
 */
function computeInitialInputs(skillId: string, app: AppInfo): Record<string, string> {
  const displayName = app.granite?.displayName ?? app.console.nameKo ?? '';
  const description = app.console.description || app.description || '';
  const primaryColor = app.granite?.primaryColor ?? '';
  const hasCustomColor =
    !!primaryColor && primaryColor.toLowerCase() !== DEFAULT_PRIMARY_COLOR.toLowerCase();

  // appName 은 스킬 frontmatter 의 inputs 에서 제거됐다. cwd(`apps/<name>`) 또는 server 가
  // 주입하는 argv 로 전달되므로 여기서 prefill 하지 않는다. displayName · primaryColor 등도
  // NewApp 에서 이미 granite.config.ts 에 저장됐으면 스킬이 파일에서 읽는다.
  switch (skillId) {
    case 'ait-plan': {
      // 앱 이름 + 한 줄 설명을 합쳐 초안 아이디어로 사용.
      const idea = [displayName, description].filter(Boolean).join(' — ');
      return {
        ...(idea ? { idea } : {}),
        ...(hasCustomColor ? { brandColor: primaryColor } : {}),
        ...(app.console.prdPath ? { planningDoc: app.console.prdPath } : {}),
      };
    }
    default:
      return {};
  }
}

/**
 * 선형 위저드 모드.
 *   - AppDetail 과 달리 메타/브랜드 섹션 등 편집 UI는 생략.
 *   - 현재 "다음으로 해야 할 단계" 를 크게 보여주고, 아래에 전체 타임라인을 병렬 렌더.
 *   - ait-plan 은 아이디어 입력 폼을 먼저 수집해 initialPrompt 로 전달.
 */
export default function Wizard() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { apps, refetch, loading, isDemo } = useApps();
  const { pipeline } = useSkills();
  const { runs, refetch: refetchRuns } = useRuns(appId ?? null);

  const app = apps.find((a) => a.folderName === appId);
  const appIndex = apps.findIndex((a) => a.folderName === appId);

  // "?skill=ait-plan&mode=review" 처럼 특정 단계로 강제 진입할 수 있게 한다.
  //   - AppDetail 의 "기획 검토받기" 배너가 ait-plan 을 review 모드로 바로 열 때 사용.
  //   - mode=review 는 ait-plan 에 "기존 기획서를 정책 검토해달라" 는 프롬프트를 주입한다.
  const forcedSkill = searchParams.get('skill');
  const forcedMode = searchParams.get('mode');
  const forcedPrdPath = searchParams.get('prd');

  const latestBySkill = useMemo(() => {
    const map = new Map<string, RunSummary>();
    for (const run of runs) {
      const prev = map.get(run.skill);
      if (!prev || prev.startedAt < run.startedAt) map.set(run.skill, run);
    }
    return map;
  }, [runs]);

  const nextStep = useMemo<PipelineStep | null>(() => {
    // URL 에서 skill 이 지정되면 그 단계를 무조건 현재 단계로.
    if (forcedSkill) {
      const match = pipeline.find((s) => s.skill === forcedSkill);
      if (match) return match;
    }
    // 서버의 pipelineProgress(산출물 존재 여부로 판정) 도 함께 본다.
    // 예: NewApp full 모드로 이미 granite.config.ts 가 생성된 상태면 ait-scaffold 는 done 취급.
    //     @toss/* 가 이미 deps 에 있으면 ait-tds-setup 은 done 취급.
    //     이렇게 해야 "이미 돼 있는 단계" 를 Wizard 가 또 띄우지 않는다.
    const pipelineProgress = app?.console?.pipelineProgress ?? {};
    for (const step of pipeline) {
      const latest = latestBySkill.get(step.skill);
      const runCompleted = latest?.state === 'COMPLETED';
      const artifactCompleted = !!pipelineProgress[step.step];
      if (runCompleted || artifactCompleted) continue;
      return step;
    }
    return null;
  }, [pipeline, latestBySkill, forcedSkill, app]);

  const completedCount = useMemo(() => {
    const pipelineProgress = app?.console?.pipelineProgress ?? {};
    let n = 0;
    for (const step of pipeline) {
      const runCompleted = latestBySkill.get(step.skill)?.state === 'COMPLETED';
      const artifactCompleted = !!pipelineProgress[step.step];
      if (runCompleted || artifactCompleted) n += 1;
    }
    return n;
  }, [pipeline, latestBySkill, app]);

  if (loading) {
    return (
      <main className="main">
        <div className="loading">위저드 불러오는 중…</div>
      </main>
    );
  }

  if (!app) {
    return (
      <main className="main">
        <div className="breadcrumb">
          <button type="button" className="breadcrumb-back" onClick={() => void navigate('/')}>
            <ArrowLeft size={14} strokeWidth={1.75} /> 홈
          </button>
        </div>
        <div className="error-box" role="alert">
          <strong>앱을 찾을 수 없어요</strong>
          <p>존재하지 않거나 이름이 다른 앱이에요. 홈에서 선택하거나 새 앱을 만들어 주세요.</p>
        </div>
      </main>
    );
  }

  const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
  const progressPct = Math.round((completedCount / pipeline.length) * 100);

  return (
    <main className="main wizard">
      <div className="breadcrumb">
        <button type="button" className="breadcrumb-back" onClick={() => void navigate('/')}>
          <ArrowLeft size={14} strokeWidth={1.75} /> 홈
        </button>
        <span className="breadcrumb-sep">/</span>
        <button
          type="button"
          className="breadcrumb-link"
          onClick={() => void navigate(`/apps/${app.folderName}`)}
        >
          {displayName}
        </button>
        <span className="breadcrumb-sep">/</span>
        <span>앱 만들기 마법사</span>
      </div>

      <header className="wizard-header">
        <div className="wizard-header-left">
          <AppAvatar app={app} index={appIndex} size="md" />
          <div className="wizard-header-copy">
            <h1 className="wizard-title">{displayName}</h1>
            <p className="wizard-subtitle">
              {nextStep
                ? `다음 단계: ${nextStep.step}단계 · ${nextStep.label}`
                : '모든 단계를 완료했어요 🎉'}
            </p>
          </div>
        </div>
        <div
          className="wizard-progress"
          role="progressbar"
          aria-label="Wizard progress"
          aria-valuemin={0}
          aria-valuemax={pipeline.length}
          aria-valuenow={completedCount}
          aria-valuetext={`${completedCount} of ${pipeline.length} steps completed`}
        >
          <div className="wizard-progress-label">
            {pipeline.length}단계 중 {completedCount}단계 완료
          </div>
          <div className="wizard-progress-bar">
            <div className="wizard-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="wizard-progress-pct">{progressPct}%</div>
        </div>
      </header>

      {!isDemo && <ClaudeStatus />}

      {nextStep && (
        <ActiveStepCard
          key={nextStep.skill}
          step={nextStep}
          app={app}
          isDemo={isDemo}
          latestRun={latestBySkill.get(nextStep.skill) ?? null}
          reviewMode={forcedMode === 'review' && nextStep.skill === 'ait-plan'}
          forcedPrdPath={forcedPrdPath}
          onStarted={() => {
            void refetchRuns();
          }}
          onRunComplete={(result) => {
            // ait-plan 이 완료됐을 때 두 가지 자동 갱신:
            //   (1) 이번 run 에서 새로 저장된 PRD (docs/prd/*.md) 가 있으면 console.prdPath 를 거기에 맞춘다.
            //       사용자가 overwrite 가 아니라 새 경로로 저장했을 때도 UI 가 최신 파일을 가리키게 함.
            //   (2) 기존에 prdPath 가 있었으면 (정책 검토 모드) "검토 완료" 타임스탬프만 기록해 배너가 재노출되는 걸 막는다.
            if (nextStep.skill === 'ait-plan') {
              const newPrd = extractLatestPrdPath(result?.artifacts ?? []);
              const payload: Record<string, unknown> = {
                prdReviewedAt: new Date().toISOString(),
                prdSource: 'generated',
              };
              if (newPrd && newPrd !== app.console.prdPath) {
                payload['prdPath'] = newPrd;
              }
              if (newPrd || app.console.prdPath) {
                void fetch(`/api/apps/${app.folderName}/console`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                }).catch(() => {
                  /* best-effort: 실패해도 UI 는 돌려받고 사용자가 수동 갱신 가능. */
                });
              }
            }
            void refetch();
            void refetchRuns();
          }}
        />
      )}

      <section className="wizard-section">
        <h2 className="wizard-section-title">전체 진행 상황</h2>
        <RunTimeline
          appName={app.folderName}
          pipeline={pipeline}
          isDemo={isDemo}
          app={app}
          showArtifacts
          suppressLivePanel
          onRunComplete={() => {
            void refetch();
            void refetchRuns();
          }}
          onInteractiveStep={() => {
            // wizard 내에서는 ActiveStepCard 에 embedded RunLivePanel 이 이미 붙어 있다.
            // 타임라인에서 시작 버튼 눌러도 카드로 스크롤해서 대화를 이어가게 함.
            const card = document.getElementById('wizard-active-step');
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            card?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
          }}
        />
      </section>
    </main>
  );
}

function ActiveStepCard({
  step,
  app,
  isDemo,
  latestRun,
  reviewMode,
  forcedPrdPath,
  onStarted,
  onRunComplete,
}: {
  step: PipelineStep;
  app: AppInfo;
  isDemo: boolean;
  latestRun: RunSummary | null;
  /** ait-plan 을 "기존 PRD 검토" 전용 모드로 열 때 true */
  reviewMode?: boolean;
  /** URL 로 전달된 검토 대상 PRD 경로 (review 모드에서 사용) */
  forcedPrdPath?: string | null;
  onStarted: () => void;
  onRunComplete: (result: RunCompletionResult) => void;
}) {
  const appName = app.folderName;
  const { raw } = useSkills();
  const meta = raw.find((s) => s.id === step.skill);
  // 초기값은 step.skill 이 바뀔 때만 재계산한다. app 객체는 SSE refresh 로 매번 새 레퍼런스가
  // 오는데, 여기에 의존하면 사용자가 타이핑하는 도중 입력이 리셋되는 버그가 있었다.
  // review 모드 전환(forcedPrdPath/reviewMode 변경)은 URL 이동으로만 발생하므로 같이 의존에 포함.
  const initialValues = useMemo(() => {
    const base = computeInitialInputs(step.skill, app);
    // review 모드에서는 planningDoc 을 강제로 우선시하고, idea 필드에는 검토 요청 문구를 박아둔다.
    // /ait-plan 은 planningDoc 이 있으면 파일을 읽고 Phase 0 (정책 검토) 부터 진행하도록 설계돼 있음.
    if (reviewMode && step.skill === 'ait-plan') {
      const prd = forcedPrdPath ?? app.console.prdPath ?? base['planningDoc'] ?? '';
      return {
        ...base,
        ...(prd ? { planningDoc: prd } : {}),
        idea: '이 기획서를 앱인토스 정책 · BM · 리스크 관점에서 검토해줘.',
      };
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.skill, reviewMode, forcedPrdPath]);
  const [inputState, setInputState] = useState<SkillInputState>({
    values: initialValues,
    prompt: '',
    missingRequired: false,
  });
  // 사용자가 아직 수정하지 않은 자동채움 키를 추적해, "✨ 자동 채움" 뱃지 노출용으로 사용.
  const [autoFilledKeys, setAutoFilledKeys] = useState<Set<string>>(
    () => new Set(Object.keys(initialValues)),
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step 이 바뀔 때마다 초기값으로 재설정 (다음 단계로 넘어갔을 때 이전 값 잔상 제거).
  // ⚠️ initialValues 자체를 dep 에 넣으면 SSE refresh 때 사용자 입력이 초기화된다 (위 useMemo 참고).
  useEffect(() => {
    setInputState({ values: initialValues, prompt: '', missingRequired: false });
    setAutoFilledKeys(new Set(Object.keys(initialValues)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.skill, reviewMode, forcedPrdPath]);

  const hasInputs = (meta?.inputs ?? []).length > 0;
  // ait-plan 은 아이디어가 없어도 CLI가 대화로 받을 수 있지만, 위저드 UX 상 5자 이상 권장.
  // 단, 기획서(planningDoc) 가 이미 채워져 있으면 그 파일로부터 정책 검토 / 내용 보강을 하면 되므로
  // 아이디어 입력은 선택사항으로 완화한다.
  const ideaValue = inputState.values['idea'] ?? '';
  const planningDocValue = (inputState.values['planningDoc'] ?? '').trim();
  const ideaTooShort =
    step.skill === 'ait-plan' && !planningDocValue && ideaValue.trim().length < 5;

  // 이 step 이 이미 실행 중이면 "진행 중" 안내로 전환하고 전체 타임라인으로 스크롤하도록 유도.
  const running = latestRun && !TERMINAL_RUN_STATES.has(latestRun.state);
  // FAILED/CANCELED 일 땐 재시도로 프레이밍.
  const retryable = latestRun && (latestRun.state === 'FAILED' || latestRun.state === 'CANCELED');

  async function handleStart() {
    if (isDemo) return;
    setStarting(true);
    setError(null);
    try {
      const idea = ideaValue.trim();
      await startRun({
        skill: step.skill,
        appName,
        input: hasInputs
          ? {
              ...(idea ? { idea } : {}),
              ...(inputState.prompt ? { prompt: inputState.prompt } : {}),
            }
          : undefined,
        // 이미 실패/취소된 run 이 있으면 강제로 새 실행을 띄운다. (캐시 hit 방지)
        forceRerun: retryable ?? false,
      });
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : '실행을 시작하지 못했어요.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <section
      id="wizard-active-step"
      className="wizard-active-step"
      aria-labelledby="wizard-active-step-title"
    >
      <div className="wizard-active-head">
        <div className="wizard-active-step-label">{step.step}단계</div>
        <h2 id="wizard-active-step-title" className="wizard-active-title">
          {running ? <Loader2 size={18} strokeWidth={1.75} className="spin" /> : <Rocket size={18} strokeWidth={1.75} />}
          {step.label}
        </h2>
      </div>
      <p className="wizard-active-desc">{step.description}</p>
      {reviewMode && (
        <aside className="wizard-review-notice">
          <code>{forcedPrdPath ?? app.console.prdPath}</code> 기획서를 AI가 읽고
          <br />
          앱인토스 정책 → 비즈니스 모델 → 리스크 순으로 짚어드려요.
        </aside>
      )}
      <p className="wizard-active-produces">
        이 단계가 만드는 것 → <strong>{step.produces}</strong>
      </p>

      {running && latestRun ? (
        <div className="wizard-active-running">
          <RunLivePanel
            runId={latestRun.runId}
            embedded
            interactive={step.mode === 'interactive'}
            onClose={() => {
              /* embedded 에서는 닫기 버튼 자체가 없음. */
            }}
            onDone={onRunComplete}
          />
        </div>
      ) : (
        <>
          {hasInputs && (
            <div className="wizard-inputs">
              {autoFilledKeys.size > 0 && (
                <p className="wizard-autofill-hint">
                  <Sparkles size={12} strokeWidth={1.75} />
                  <span>앱 정보에서 {autoFilledKeys.size}개 항목을 자동으로 채웠어요. 필요하면 직접 수정하세요.</span>
                </p>
              )}
              <SkillInputForm
                skillId={step.skill}
                value={inputState}
                onChange={(next) => {
                  // 사용자가 직접 건드린 키는 자동채움 뱃지에서 제거.
                  if (autoFilledKeys.size > 0) {
                    setAutoFilledKeys((prev) => {
                      let changed = false;
                      const copy = new Set(prev);
                      for (const key of prev) {
                        if ((next.values[key] ?? '') !== (initialValues[key] ?? '')) {
                          copy.delete(key);
                          changed = true;
                        }
                      }
                      return changed ? copy : prev;
                    });
                  }
                  setInputState(next);
                }}
                disabled={isDemo || starting}
              />
            </div>
          )}

          {error && <div className="wizard-error">{error}</div>}

          <div className="wizard-active-actions">
            {(() => {
              const ctaDisabled =
                isDemo || starting || inputState.missingRequired || ideaTooShort;
              const errorHint = isDemo
                ? '내 PC에서 대시보드를 실행한 뒤 사용할 수 있어요'
                : ideaTooShort
                  ? '아이디어를 한 문장 이상 적어 주세요 (이미 기획서가 있다면 위에 파일 경로를 입력하세요)'
                  : inputState.missingRequired
                    ? '필수 입력 칸이 비어 있어요'
                    : undefined;
              const hintVisible = ctaDisabled && !!errorHint;
              const ctaLabel = starting
                ? '시작하는 중…'
                : retryable
                  ? '다시 시작'
                  : reviewMode
                    ? 'AI 검토 시작'
                    : `${step.label} 시작하기`;
              return (
                <>
                  <button
                    type="button"
                    className="wizard-cta"
                    onClick={() => void handleStart()}
                    disabled={ctaDisabled}
                    title={errorHint}
                    aria-describedby={hintVisible ? 'wizard-cta-hint' : undefined}
                  >
                    {ctaLabel}
                  </button>
                  {hintVisible && (
                    <p id="wizard-cta-hint" className="wizard-cta-hint" role="status">
                      {errorHint}
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}
    </section>
  );
}
