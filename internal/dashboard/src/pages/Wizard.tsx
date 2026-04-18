import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Rocket, Loader2 } from 'lucide-react';
import { useApps } from '@/hooks/useApps';
import { useSkills } from '@/hooks/useSkills';
import { useRuns, startRun, TERMINAL_RUN_STATES } from '@/hooks/useRuns';
import AppAvatar from '@/components/AppAvatar';
import ClaudeStatus from '@/components/ClaudeStatus';
import RunTimeline from '@/components/RunTimeline';
import SkillInputForm from '@/components/SkillInputForm';
import type { SkillInputState } from '@/components/SkillInputForm';
import type { PipelineStep } from '@/hooks/useSkills';
import type { RunSummary } from '@/hooks/useRuns';

/**
 * 선형 위저드 모드.
 *   - AppDetail 과 달리 메타/브랜드 섹션 등 편집 UI는 생략.
 *   - 현재 "다음으로 해야 할 단계" 를 크게 보여주고, 아래에 전체 타임라인을 병렬 렌더.
 *   - ait-plan 은 아이디어 입력 폼을 먼저 수집해 initialPrompt 로 전달.
 */
export default function Wizard() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { apps, refetch, loading, isDemo } = useApps();
  const { pipeline } = useSkills();
  const { runs, refetch: refetchRuns } = useRuns(appId ?? null);

  const app = apps.find((a) => a.folderName === appId);
  const appIndex = apps.findIndex((a) => a.folderName === appId);

  const latestBySkill = useMemo(() => {
    const map = new Map<string, RunSummary>();
    for (const run of runs) {
      const prev = map.get(run.skill);
      if (!prev || prev.startedAt < run.startedAt) map.set(run.skill, run);
    }
    return map;
  }, [runs]);

  const nextStep = useMemo<PipelineStep | null>(() => {
    for (const step of pipeline) {
      const latest = latestBySkill.get(step.skill);
      if (!latest || (latest.state !== 'COMPLETED' && !TERMINAL_RUN_STATES.has(latest.state))) {
        return step;
      }
      if (latest.state !== 'COMPLETED') return step;
    }
    return null;
  }, [pipeline, latestBySkill]);

  const completedCount = useMemo(() => {
    let n = 0;
    for (const step of pipeline) {
      if (latestBySkill.get(step.skill)?.state === 'COMPLETED') n += 1;
    }
    return n;
  }, [pipeline, latestBySkill]);

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
          <button className="breadcrumb-back" onClick={() => void navigate('/')}>
            <ArrowLeft size={14} strokeWidth={1.75} /> 홈
          </button>
        </div>
        <div className="error-box">
          <strong>앱을 찾을 수 없습니다</strong>
          <p>존재하지 않거나 이름이 다른 앱입니다. 홈에서 선택하거나 새 앱을 만들어주세요.</p>
        </div>
      </main>
    );
  }

  const displayName = (app.granite?.displayName ?? app.console.nameKo) || app.folderName;
  const progressPct = Math.round((completedCount / pipeline.length) * 100);

  return (
    <main className="main wizard">
      <div className="breadcrumb">
        <button className="breadcrumb-back" onClick={() => void navigate('/')}>
          <ArrowLeft size={14} strokeWidth={1.75} /> 홈
        </button>
        <span className="breadcrumb-sep">/</span>
        <button
          className="breadcrumb-link"
          onClick={() => void navigate(`/apps/${app.folderName}`)}
        >
          {displayName}
        </button>
        <span className="breadcrumb-sep">/</span>
        <span>출시 위저드</span>
      </div>

      <header className="wizard-header">
        <div className="wizard-header-left">
          <AppAvatar app={app} index={appIndex} size="md" />
          <div>
            <h1 className="wizard-title">{displayName}</h1>
            <p className="wizard-subtitle">
              {nextStep
                ? `다음 단계: Step ${nextStep.step} · ${nextStep.label}`
                : '모든 단계가 완료되었습니다 🎉'}
            </p>
          </div>
        </div>
        <div className="wizard-progress">
          <div className="wizard-progress-label">
            {completedCount} / {pipeline.length} 단계
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
          step={nextStep}
          appName={app.folderName}
          isDemo={isDemo}
          latestRun={latestBySkill.get(nextStep.skill) ?? null}
          onStarted={() => {
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
          onRunComplete={() => {
            void refetch();
            void refetchRuns();
          }}
          onInteractiveStep={() => {
            // wizard 내에서는 ActiveStepCard 로 이동시키고 interactive 는 별도 수집 폼으로 흡수.
            const card = document.getElementById('wizard-active-step');
            card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      </section>
    </main>
  );
}

function ActiveStepCard({
  step,
  appName,
  isDemo,
  latestRun,
  onStarted,
}: {
  step: PipelineStep;
  appName: string;
  isDemo: boolean;
  latestRun: RunSummary | null;
  onStarted: () => void;
}) {
  const { raw } = useSkills();
  const meta = raw.find((s) => s.id === step.skill);
  const [inputState, setInputState] = useState<SkillInputState>({
    values: {},
    prompt: '',
    missingRequired: false,
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInputs = (meta?.inputs ?? []).length > 0;
  // ait-plan 은 아이디어가 없어도 CLI가 대화로 받을 수 있지만, 위저드 UX 상 5자 이상 권장.
  const ideaValue = inputState.values['idea'] ?? '';
  const ideaTooShort = step.skill === 'ait-plan' && ideaValue.trim().length < 5;

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
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setStarting(false);
    }
  }

  function scrollToTimeline() {
    document.querySelector('.run-timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section id="wizard-active-step" className="wizard-active-step">
      <div className="wizard-active-head">
        <div className="wizard-active-step-label">Step {step.step}</div>
        <h2 className="wizard-active-title">
          {running ? <Loader2 size={18} strokeWidth={1.75} className="spin" /> : <Rocket size={18} strokeWidth={1.75} />}
          {step.label}
        </h2>
      </div>
      <p className="wizard-active-desc">{step.description}</p>
      <p className="wizard-active-produces">
        결과물 → <strong>{step.produces}</strong>
      </p>
      {step.requires && (
        <p className="wizard-active-requires">선행 단계: {step.requires}</p>
      )}

      {running ? (
        <div className="wizard-active-running">
          <p className="wizard-active-running-text">
            이미 이 단계가 진행 중입니다. 아래 타임라인에서 실시간 로그와 답변 입력을 확인할 수 있어요.
          </p>
          <div className="wizard-active-actions">
            <button type="button" className="wizard-cta wizard-cta--secondary" onClick={scrollToTimeline}>
              진행 상황 보기
            </button>
          </div>
        </div>
      ) : (
        <>
          {hasInputs && (
            <div className="wizard-inputs">
              <SkillInputForm
                skillId={step.skill}
                value={inputState}
                onChange={setInputState}
                disabled={isDemo || starting}
              />
            </div>
          )}

          {error && <div className="wizard-error">{error}</div>}

          <div className="wizard-active-actions">
            <button
              type="button"
              className="wizard-cta"
              onClick={() => void handleStart()}
              disabled={
                isDemo || starting || inputState.missingRequired || ideaTooShort
              }
              title={
                isDemo
                  ? '로컬에서 pnpm dev 실행 시 사용 가능'
                  : ideaTooShort
                    ? '아이디어를 5자 이상 적어주세요'
                    : inputState.missingRequired
                      ? '필수 입력이 비어있습니다'
                      : undefined
              }
            >
              {starting ? '시작 중…' : retryable ? '다시 시도' : '이 단계 시작'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
