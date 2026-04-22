import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { PipelineStep } from '@/hooks/useSkills';
import type { AppInfo } from '@/types';
import ArtifactReviewCard from '@/components/ArtifactReviewCard';
import RunErrorCard from '@/components/RunErrorCard';
import {
  cancelRun,
  sendRunInput,
  startRun,
  TERMINAL_RUN_STATES,
  useRuns,
  useRunStream,
  type RunQuestion,
  type RunState,
  type RunSummary,
} from '@/hooks/useRuns';

interface RunTimelineProps {
  appName: string;
  pipeline: PipelineStep[];
  isDemo?: boolean;
  externalRefresh?: number;
  onRunComplete?: (run: RunSummary) => void;
  onInteractiveStep?: (step: PipelineStep) => void;
  showArtifacts?: boolean;
  app?: AppInfo;
  /** true 면 각 step 아이템 내부의 RunLivePanel 을 숨긴다.
   *  Wizard 처럼 부모가 별도로 RunLivePanel 을 렌더할 때 중복 SSE 연결을 막는 용도. */
  suppressLivePanel?: boolean;
}

export default function RunTimeline({
  appName,
  pipeline,
  isDemo = false,
  externalRefresh,
  onRunComplete,
  onInteractiveStep,
  showArtifacts = false,
  app,
  suppressLivePanel = false,
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

  // 현재 실행 중인 run 이 보이면 자동으로 라이브 패널을 연다.
  // (사용자가 "라이브 로그 보기" 를 누르지 않아도 대화 UI 가 바로 보이게.)
  useEffect(() => {
    if (suppressLivePanel) return;
    if (activeRunId) return;
    for (const run of latestBySkill.values()) {
      if (!TERMINAL_RUN_STATES.has(run.state)) {
        setActiveRunId(run.runId);
        return;
      }
    }
  }, [latestBySkill, activeRunId, suppressLivePanel]);

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
        <p>
          데모 환경에서는 실제 실행을 시작할 수 없습니다. 로컬에서 <code>pnpm dev</code>로 대시보드를
          띄운 뒤 다시 시도하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="run-timeline">
      {error && <div className="run-timeline-error">{error}</div>}
      {startError && <div className="run-timeline-error">실행 시작 실패: {startError}</div>}
      {loading && runs.length === 0 && (
        <div className="run-timeline-loading">실행 이력을 불러오는 중입니다.</div>
      )}

      <ol className="run-timeline-list">
        {pipeline.map((step) => {
          const latest = latestBySkill.get(step.skill) ?? null;
          const disabled =
            step.requiresSteps.length > 0 &&
            !step.requiresSteps.every((requiredStep) => {
              const depRun = [...latestBySkill.values()].find((run) => {
                const depStep = pipeline.find((candidate) => candidate.skill === run.skill);
                return depStep?.step === requiredStep && run.state === 'COMPLETED';
              });
              return Boolean(depRun);
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
                  <span className="run-timeline-produces"> 산출물: {step.produces}</span>
                </div>

                {latest && (
                  <div className="run-timeline-meta">
                    <span className="run-timeline-meta-label">최근 실행:</span>
                    <span>{formatTime(latest.startedAt)}</span>
                    {latest.endedAt && (
                      <>
                        <span className="run-timeline-meta-sep">-</span>
                        <span>{formatTime(latest.endedAt)}</span>
                      </>
                    )}
                    {latest.exitCode !== null && latest.exitCode !== 0 && (
                      <span className="run-timeline-exit">exit {latest.exitCode}</span>
                    )}
                  </div>
                )}

                <div className="run-timeline-actions">
                  {running ? (
                    <>
                      <button
                        type="button"
                        className="run-timeline-action run-timeline-action--view"
                        onClick={() => {
                          if (suppressLivePanel) {
                            // Wizard 처럼 부모가 이미 RunLivePanel 을 렌더할 때는
                            // 카드로 스크롤시켜 대화창으로 안내.
                            onInteractiveStep?.(step);
                          } else {
                            setActiveRunId(latest.runId);
                          }
                        }}
                      >
                        {suppressLivePanel
                          ? '대화창으로 이동'
                          : activeRunId === latest.runId
                            ? '대화창 열림'
                            : '대화창 열기'}
                      </button>
                      <button
                        type="button"
                        className="run-timeline-action run-timeline-action--danger"
                        onClick={() => void handleCancel(latest.runId)}
                      >
                        취소
                      </button>
                    </>
                  ) : latest && latest.state === 'COMPLETED' ? (
                    <button
                      type="button"
                      className="run-timeline-action run-timeline-action--secondary"
                      onClick={() => void handleRerun(step.skill)}
                      disabled={busy || disabled}
                      title={disabled ? `선행 단계 완료 필요: ${step.requires}` : undefined}
                    >
                      <RotateCcw size={14} strokeWidth={1.75} />
                      재실행
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="run-timeline-action run-timeline-action--primary"
                      onClick={() => {
                        // interactive + 부모가 입력 폼을 제공하는 경우(onInteractiveStep 콜백)
                        // 빈 프롬프트로 즉시 spawn 하지 않고 폼으로 안내만 한다.
                        // onInteractiveStep 이 없으면(예: AppDetail) 바로 시작.
                        if (step.mode === 'interactive' && onInteractiveStep) {
                          onInteractiveStep(step);
                          return;
                        }
                        void handleStart(step.skill);
                      }}
                      disabled={busy || disabled}
                      title={disabled ? `선행 단계 완료 필요: ${step.requires}` : step.description}
                    >
                      <Play size={14} strokeWidth={1.75} />
                      {busy
                        ? '시작 중...'
                        : latest?.state === 'FAILED'
                          ? '다시 실행'
                          : step.mode === 'interactive' && onInteractiveStep
                            ? '입력 시작'
                            : step.mode === 'interactive'
                              ? '대화 시작'
                              : '실행'}
                    </button>
                  )}
                </div>

                {!suppressLivePanel && activeRunId && latest?.runId === activeRunId && (
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
                    <ArtifactReviewCard step={step.step} app={app} expanded={step.step === 1} />
                  </div>
                )}

                {latest?.state === 'FAILED' && (
                  <div className="run-timeline-error-wrap">
                    <RunErrorCard
                      run={latest}
                      step={step}
                      appName={appName}
                      isDemo={isDemo}
                      onRetry={() => void refetch()}
                    />
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
    DRAFT: '초안',
    VALIDATING_INPUT: '입력 검증 중',
    READY: '준비됨',
    RUNNING: '실행 중',
    WAITING_USER_INPUT: '입력 대기',
    COMPLETED: '완료',
    FAILED: '실패',
    CANCELED: '취소됨',
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

export function RunLivePanel({
  runId,
  onClose,
  onDone,
  embedded = false,
}: {
  runId: string;
  onClose: () => void;
  onDone: () => void;
  /** true 면 viewport 전체가 아니라 부모 카드 안에 박힌 스타일로. */
  embedded?: boolean;
}) {
  const { state, logs, artifacts, questions, error } = useRunStream(runId);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const doneFiredRef = useRef(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [multiSelections, setMultiSelections] = useState<Set<string>>(new Set());
  const inputLabelId = useId();
  const inputHintId = useId();
  const inputErrorId = useId();
  const questionId = useId();

  useEffect(() => {
    const container = logBodyRef.current;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom < 48;
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const container = logBodyRef.current;
    if (!container || !shouldStickToBottomRef.current) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto',
    });
  }, [logs]);

  useEffect(() => {
    if (state && TERMINAL_RUN_STATES.has(state) && !doneFiredRef.current) {
      doneFiredRef.current = true;
      onDone();
    }
  }, [state, onDone]);

  const waitingInput = state === 'WAITING_USER_INPUT';
  const latestQuestion = questions.at(-1) ?? null;
  const hasOptions = !!latestQuestion?.options && latestQuestion.options.length > 0;
  const isMultiSelect = hasOptions && latestQuestion?.multiSelect === true;

  // 질문이 바뀌면 이전 multi-select 선택 초기화.
  useEffect(() => {
    setMultiSelections(new Set());
  }, [latestQuestion?.toolUseId, latestQuestion?.prompt]);

  useEffect(() => {
    if (!waitingInput) return;
    // 선택지 질문일 때는 textarea 포커스 생략 (버튼 탐색이 자연스럽게).
    if (hasOptions) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [waitingInput, latestQuestion, hasOptions]);

  async function submitAnswer(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await sendRunInput(runId, trimmed);
      setInputText('');
      setMultiSelections(new Set());
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    await submitAnswer(inputText);
  }

  async function handlePickOption(label: string) {
    if (isMultiSelect) {
      setMultiSelections((prev) => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return next;
      });
      return;
    }
    // 단일 선택: 즉시 전송.
    await submitAnswer(label);
  }

  async function handleSendMulti() {
    if (multiSelections.size === 0) {
      setSendError('최소 1개 이상 선택해주세요.');
      return;
    }
    // AskUserQuestion 스펙: 여러 label 을 ", " 로 이어서 응답.
    const joined = Array.from(multiSelections).join(', ');
    const free = inputText.trim();
    await submitAnswer(free ? `${joined} (${free})` : joined);
  }

  const describedBy = [
    latestQuestion ? questionId : null,
    inputHintId,
    sendError ? inputErrorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`run-live-panel${embedded ? ' run-live-panel--embedded' : ''}`}>
      <div className="run-live-panel-head">
        <span className="run-live-panel-title">
          라이브 실행 {state && <RunStateBadge state={state} />}
        </span>
        {!embedded && (
          <button type="button" className="run-live-panel-close" onClick={onClose} aria-label="패널 닫기">
            닫기
          </button>
        )}
      </div>
      {error && <div className="run-live-panel-error">연결 오류: {error}</div>}
      {artifacts.length > 0 && (
        <div className="run-live-panel-artifacts">
          {artifacts.map((artifact, index) => (
            <span key={`${artifact.path ?? 'artifact'}-${index}`} className="run-live-panel-artifact">
              생성 파일: {artifact.path ?? '(경로 없음)'}
            </span>
          ))}
        </div>
      )}
      <div
        ref={logBodyRef}
        className="run-live-panel-body"
        role="log"
        aria-live="polite"
        aria-label="실행 로그"
      >
        {logs.length === 0 ? (
          <div className="run-live-panel-empty">아직 출력된 로그가 없습니다.</div>
        ) : (
          logs.map((line, index) => (
            <div key={`${index}-${line.slice(0, 24)}`} className="run-live-panel-line">
              {line}
            </div>
          ))
        )}
      </div>
      {waitingInput && (
        <div
          className="run-live-panel-input"
          role="group"
          aria-labelledby={inputLabelId}
          aria-describedby={describedBy || undefined}
        >
          {latestQuestion ? (
            <QuestionCard question={latestQuestion} id={questionId} />
          ) : (
            <div id={inputLabelId} className="run-live-panel-input-label">
              Claude 응답 입력
            </div>
          )}

          {hasOptions && latestQuestion && (
            <OptionChoices
              options={latestQuestion.options!}
              multiSelect={isMultiSelect}
              selected={multiSelections}
              onPick={(label) => void handlePickOption(label)}
              disabled={sending}
            />
          )}

          <div id={inputHintId} className="run-live-panel-input-hint">
            {hasOptions
              ? isMultiSelect
                ? '여러 개 선택 후 전송하거나, 추가 설명이 있으면 아래에 입력하세요.'
                : '위 선택지 중 하나를 누르거나, 다른 답이 있다면 직접 입력하세요.'
              : 'Claude가 입력을 기다리고 있어요. 자유롭게 답변을 적어주세요.'}{' '}
            <span className="run-live-panel-kbd-hint">
              <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd>로 전송
            </span>
          </div>
          <textarea
            ref={inputRef}
            className="run-live-panel-input-ta"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (isMultiSelect) void handleSendMulti();
                else void handleSend();
              }
            }}
            aria-labelledby={inputLabelId}
            aria-describedby={describedBy || undefined}
            placeholder={
              hasOptions
                ? isMultiSelect
                  ? '선택 외 추가 설명 (선택)'
                  : '직접 답변하기 (선택)'
                : '답변을 입력하세요.'
            }
            rows={hasOptions ? 2 : 3}
            disabled={sending}
          />
          {sendError && (
            <div id={inputErrorId} className="run-live-panel-input-error" role="alert">
              {sendError}
            </div>
          )}
          <div className="run-live-panel-input-actions">
            <button
              type="button"
              className="run-live-panel-send"
              onClick={() => void (isMultiSelect ? handleSendMulti() : handleSend())}
              disabled={
                sending ||
                (isMultiSelect
                  ? multiSelections.size === 0 && inputText.trim().length === 0
                  : inputText.trim().length === 0)
              }
            >
              {sending
                ? '전송 중...'
                : isMultiSelect && multiSelections.size > 0
                  ? `${multiSelections.size}개 선택 · 전송`
                  : '전송'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({ question, id }: { question: RunQuestion; id: string }) {
  return (
    <div
      id={id}
      className="run-live-panel-question"
      role="status"
      aria-live="assertive"
    >
      {question.header && <span className="run-live-panel-question-tag">{question.header}</span>}
      <strong>Claude의 질문</strong>
      <p>{question.prompt}</p>
    </div>
  );
}

function OptionChoices({
  options,
  multiSelect,
  selected,
  onPick,
  disabled,
}: {
  options: NonNullable<RunQuestion['options']>;
  multiSelect: boolean;
  selected: Set<string>;
  onPick: (label: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`run-live-panel-options${multiSelect ? ' run-live-panel-options--multi' : ''}`}
      role={multiSelect ? 'group' : 'radiogroup'}
      aria-label="응답 선택지"
    >
      {options.map((opt) => {
        const isSelected = selected.has(opt.label);
        return (
          <button
            key={opt.label}
            type="button"
            className={`run-live-panel-option${isSelected ? ' is-selected' : ''}`}
            onClick={() => onPick(opt.label)}
            disabled={disabled}
            role={multiSelect ? 'checkbox' : 'radio'}
            aria-checked={multiSelect ? isSelected : undefined}
          >
            <span className="run-live-panel-option-label">{opt.label}</span>
            {opt.description && (
              <span className="run-live-panel-option-desc">{opt.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
