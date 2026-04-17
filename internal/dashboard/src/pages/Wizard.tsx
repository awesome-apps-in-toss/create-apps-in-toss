import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Rocket, Lightbulb } from 'lucide-react';
import { useApps } from '@/hooks/useApps';
import { useSkills } from '@/hooks/useSkills';
import { useRuns, startRun, TERMINAL_RUN_STATES } from '@/hooks/useRuns';
import AppAvatar from '@/components/AppAvatar';
import ClaudeStatus from '@/components/ClaudeStatus';
import RunTimeline from '@/components/RunTimeline';
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
  onStarted,
}: {
  step: PipelineStep;
  appName: string;
  isDemo: boolean;
  onStarted: () => void;
}) {
  const [idea, setIdea] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsIdea = step.skill === 'ait-plan';

  async function handleStart() {
    if (isDemo) return;
    setStarting(true);
    setError(null);
    try {
      await startRun({
        skill: step.skill,
        appName,
        input: needsIdea && idea.trim() ? { idea: idea.trim() } : undefined,
        forceRerun: false,
      });
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setStarting(false);
    }
  }

  return (
    <section id="wizard-active-step" className="wizard-active-step">
      <div className="wizard-active-head">
        <div className="wizard-active-step-label">Step {step.step}</div>
        <h2 className="wizard-active-title">
          <Rocket size={18} strokeWidth={1.75} /> {step.label}
        </h2>
      </div>
      <p className="wizard-active-desc">{step.description}</p>
      <p className="wizard-active-produces">
        결과물 → <strong>{step.produces}</strong>
      </p>
      {step.requires && (
        <p className="wizard-active-requires">선행 단계: {step.requires}</p>
      )}

      {needsIdea && (
        <div className="wizard-idea-form">
          <label htmlFor="wizard-idea-input" className="wizard-idea-label">
            <Lightbulb size={14} strokeWidth={1.75} />
            어떤 미니앱을 만들고 싶은가요?
          </label>
          <textarea
            id="wizard-idea-input"
            className="wizard-idea-input"
            rows={4}
            placeholder="예: 친구들과 여행 일정을 공유하고, 각자 가고 싶은 장소에 투표할 수 있는 미니앱"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
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
            isDemo || starting || (needsIdea && idea.trim().length < 5)
          }
          title={
            isDemo
              ? '로컬에서 pnpm dev 실행 시 사용 가능'
              : needsIdea && idea.trim().length < 5
                ? '아이디어를 조금 더 자세히 적어주세요'
                : undefined
          }
        >
          {starting ? '시작 중…' : '이 단계 시작'}
        </button>
      </div>
    </section>
  );
}
