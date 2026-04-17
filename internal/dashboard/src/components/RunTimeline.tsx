import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle, Clock, Play, RotateCcw } from 'lucide-react';
import type { PipelineStep } from '@/hooks/useSkills';
import type { AppInfo } from '@/types';
import ArtifactReviewCard from '@/components/ArtifactReviewCard';
import {
  useRuns,
  useRunStream,
  startRun,
  cancelRun,
  TERMINAL_RUN_STATES,
  type RunState,
  type RunSummary,
} from '@/hooks/useRuns';

interface RunTimelineProps {
  appName: string;
  pipeline: PipelineStep[];
  isDemo?: boolean;
  /** 외부에서 refresh 를 강제하고 싶을 때 (앱 메타 재로딩 등). */
  externalRefresh?: number;
  /** run 완료 시 외부에 알림 (meta 재로딩 트리거 등). */
  onRunComplete?: (run: RunSummary) => void;
  /** ait-plan 처럼 interactive 스킬에서 "기획하기" 클릭 시. 미지정 시 버튼 숨김. */
  onInteractiveStep?: (step: PipelineStep) => void;
  /** true 면 COMPLETED 단계 아래에 ArtifactReviewCard 를 렌더. app 필요. */
  showArtifacts?: boolean;
  /** showArtifacts=true 일 때 artifact 조회 대상 앱 정보. */
  app?: AppInfo;
}

/**
 * 오케스트레이션 API 기반 Run Timeline.
 *   - 7단계를 세로로 나열하고, 각 단계마다 가장 최근 run 의 상태/시간/아티팩트를 노출.
 *   - "실행" 버튼은 POST /api/orchestrations (skill, appName) 로 spawn.
 *   - 실행 중 스킬은 SSE 로 라이브 로그·상태 변화를 인라인 표시.
 *
 * 기존 pipeline-mini-stepper / pipeline-detail-list 와 병행 렌더 가능. Wizard 에서는
 * 전용으로 사용.
 */
export default function RunTimeline({
  appName,
  pipeline,
  isDemo = false,
  externalRefresh,
  onRunComplete,
  onInteractiveStep,
  showArtifacts = false,
  app,
}: RunTimelineProps) {
  const { runs, loading, error, refetch } = useRuns(appName);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [startingSkill, setStartingSkill] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const prevExternalRef = useRef<number | undefined>(externalRefresh);

  useEffect(() => {
    if (externalRefresh !== undefined && externalRefresh !== prevExternalRef.current) {
      prevExternalRef.current = externalRefresh;
      void refetch();
    }
  }, [externalRefresh, refetch]);

  /** skillId → 가장 최근 run. */
  const latestBySkill = useMemo(() => {
    const map = new Map<string, RunSummary>();
    for (const run of runs) {
      const prev = map.get(run.skill);
      if (!prev || prev.startedAt < run.startedAt) {
        map.set(run.skill, run);
      }
    }
    return map;
  }, [runs]);

  async function handleStart(skill: string) {
    if (isDemo) return;
    setStartingSkill(skill);
    setStartError(null);
    try {
      const resp = await startRun({
        skill,
        appName,
        forceRerun: true,
      });
      setActiveRunId(resp.runId);
      await refetch();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setStartingSkill(null);
    }
  }

  async function handleRerun(skill: string) {
    await handleStart(skill);
  }

  async function handleCancel(runId: string) {
    if (isDemo) return;
    await cancelRun(runId);
    await refetch();
  }

  if (isDemo) {
    return (
      <div className="run-timeline run-timeline--demo">
        <p>데모 모드에서는 스킬 실행 타임라인이 비활성화됩니다. 로컬에서 <code>pnpm dev</code>로 실행해 보세요.</p>
      </div>
    );
  }

  return (
    <div className="run-timeline">
      {error && <div className="run-timeline-error">{error}</div>}
      {startError && <div className="run-timeline-error">실행 요청 실패: {startError}</div>}
      {loading && runs.length === 0 && <div className="run-timeline-loading">실행 기록 불러오는 중…</div>}

      <ol className="run-timeline-list">
        {pipeline.map((step) => {
          const latest = latestBySkill.get(step.skill) ?? null;
          const disabled = step.requiresSteps.length > 0 && !step.requiresSteps.every((s) => {
            const depRun = [...latestBySkill.values()].find((r) => {
              const depStep = pipeline.find((p) => p.skill === r.skill);
              return depStep?.step === s && r.state === 'COMPLETED';
            });
            return !!depRun;
          });
          const running = latest && !TERMINAL_RUN_STATES.has(latest.state);
          const busy = startingSkill === step.skill;

          return (
            <li
              key={step.skill}
              className={`run-timeline-item run-timeline-item--${timelineItemKind(latest?.state)}`}
            >
              <div className="run-timeline-marker">
                <RunStateIcon state={latest?.state ?? null} />
              </div>
              <div className="run-timeline-body">
                <div className="run-timeline-head">
                  <span className="run-timeline-step">Step {step.step}</span>
                  <span className="run-timeline-label">{step.label}</span>
                  {latest && <RunStateBadge state={latest.state} />}
                </div>
                <div className="run-timeline-desc">
                  {step.description}
                  <span className="run-timeline-produces"> → {step.produces}</span>
                </div>

                {latest && (
                  <div className="run-timeline-meta">
                    <span className="run-timeline-meta-label">최근 실행:</span>
                    <span>{formatTime(latest.startedAt)}</span>
                    {latest.endedAt && (
                      <>
                        <span className="run-timeline-meta-sep">→</span>
                        <span>{formatTime(latest.endedAt)}</span>
                      </>
                    )}
                    {latest.exitCode !== null && latest.exitCode !== 0 && (
                      <span className="run-timeline-exit">exit {latest.exitCode}</span>
                    )}
                  </div>
                )}

                <div className="run-timeline-actions">
                  {step.mode === 'interactive' ? (
                    <button
                      type="button"
                      className="run-timeline-action run-timeline-action--secondary"
                      onClick={() => onInteractiveStep?.(step)}
                      disabled={!onInteractiveStep || disabled}
                      title={
                        disabled
                          ? `선행 단계 필요: ${step.requires}`
                          : 'AI와 대화로 진행합니다'
                      }
                    >
                      {latest?.state === 'COMPLETED' ? '기획서 보기' : '기획하기'}
                    </button>
                  ) : running ? (
                    <>
                      <button
                        type="button"
                        className="run-timeline-action run-timeline-action--view"
                        onClick={() => setActiveRunId(latest!.runId)}
                      >
                        진행 중 · 로그 보기
                      </button>
                      <button
                        type="button"
                        className="run-timeline-action run-timeline-action--danger"
                        onClick={() => void handleCancel(latest!.runId)}
                      >
                        중단
                      </button>
                    </>
                  ) : latest && latest.state === 'COMPLETED' ? (
                    <button
                      type="button"
                      className="run-timeline-action run-timeline-action--secondary"
                      onClick={() => void handleRerun(step.skill)}
                      disabled={busy || disabled}
                      title={disabled ? `선행 단계 필요: ${step.requires}` : undefined}
                    >
                      <RotateCcw size={14} strokeWidth={1.75} />
                      재실행
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="run-timeline-action run-timeline-action--primary"
                      onClick={() => void handleStart(step.skill)}
                      disabled={busy || disabled}
                      title={disabled ? `선행 단계 필요: ${step.requires}` : step.description}
                    >
                      <Play size={14} strokeWidth={1.75} />
                      {busy ? '시작 중…' : latest?.state === 'FAILED' ? '다시 시도' : '실행'}
                    </button>
                  )}
                </div>

                {activeRunId && latest?.runId === activeRunId && (
                  <RunLivePanel
                    runId={activeRunId}
                    onClose={() => setActiveRunId(null)}
                    onDone={() => {
                      void refetch().then(() => {
                        if (latest && onRunComplete) onRunComplete(latest);
                      });
                    }}
                  />
                )}

                {showArtifacts && app && latest?.state === 'COMPLETED' && (
                  <div className="run-timeline-artifact">
                    <ArtifactReviewCard step={step.step} app={app} expanded={false} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function timelineItemKind(state: RunState | null | undefined): string {
  if (!state) return 'idle';
  if (state === 'COMPLETED') return 'completed';
  if (state === 'FAILED') return 'failed';
  if (state === 'CANCELED') return 'canceled';
  return 'running';
}

function RunStateIcon({ state }: { state: RunState | null }) {
  if (!state) return <Circle size={18} strokeWidth={1.5} />;
  if (state === 'COMPLETED') return <CheckCircle2 size={18} strokeWidth={2} className="rti-completed" />;
  if (state === 'FAILED') return <XCircle size={18} strokeWidth={2} className="rti-failed" />;
  if (state === 'CANCELED') return <AlertCircle size={18} strokeWidth={2} className="rti-canceled" />;
  if (state === 'WAITING_USER_INPUT') return <Clock size={18} strokeWidth={2} className="rti-waiting" />;
  return <Loader2 size={18} strokeWidth={2} className="rti-running spin" />;
}

function RunStateBadge({ state }: { state: RunState }) {
  const text: Record<RunState, string> = {
    DRAFT: '대기',
    VALIDATING_INPUT: '입력 검증',
    READY: '준비됨',
    RUNNING: '실행 중',
    WAITING_USER_INPUT: '입력 대기',
    COMPLETED: '완료',
    FAILED: '실패',
    CANCELED: '중단됨',
  };
  const cls: Record<RunState, string> = {
    DRAFT: 'neutral',
    VALIDATING_INPUT: 'info',
    READY: 'info',
    RUNNING: 'running',
    WAITING_USER_INPUT: 'waiting',
    COMPLETED: 'done',
    FAILED: 'fail',
    CANCELED: 'canceled',
  };
  return <span className={`run-timeline-badge run-timeline-badge--${cls[state]}`}>{text[state]}</span>;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function RunLivePanel({
  runId,
  onClose,
  onDone,
}: {
  runId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { state, logs, artifacts, error } = useRunStream(runId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const doneFiredRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (state && TERMINAL_RUN_STATES.has(state) && !doneFiredRef.current) {
      doneFiredRef.current = true;
      onDone();
    }
  }, [state, onDone]);

  return (
    <div className="run-live-panel">
      <div className="run-live-panel-head">
        <span className="run-live-panel-title">
          실시간 로그 {state && <RunStateBadge state={state} />}
        </span>
        <button type="button" className="run-live-panel-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      {error && <div className="run-live-panel-error">연결 끊김: {error}</div>}
      {artifacts.length > 0 && (
        <div className="run-live-panel-artifacts">
          {artifacts.map((a, i) => (
            <span key={i} className="run-live-panel-artifact">
              📄 {a.path ?? '(no path)'}
            </span>
          ))}
        </div>
      )}
      <div className="run-live-panel-body" role="log" aria-live="polite">
        {logs.length === 0 ? (
          <div className="run-live-panel-empty">출력 대기 중…</div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="run-live-panel-line">
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
