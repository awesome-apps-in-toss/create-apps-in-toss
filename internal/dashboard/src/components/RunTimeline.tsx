import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
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
  finishRun,
  sendRunInput,
  startRun,
  TERMINAL_RUN_STATES,
  useRuns,
  useRunStream,
  type RunLogEntry,
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
  /** 외부에서 aria-controls 등으로 가리킬 수 있도록 root id 를 주입. */
  id?: string;
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
  id,
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
      setStartError(e instanceof Error ? e.message : '실행을 시작하지 못했어요.');
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
      <div id={id} className="run-timeline run-timeline--demo">
        <p>
          데모 화면에서는 실제 실행을 시작할 수 없어요. 내 PC에서 대시보드를 설치·실행한 뒤 다시 시도해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div id={id} className="run-timeline">
      {error && <div className="run-timeline-error">{error}</div>}
      {startError && <div className="run-timeline-error">실행 시작 실패: {startError}</div>}
      {loading && runs.length === 0 && (
        <div className="run-timeline-loading">이전 실행 기록을 불러오는 중이에요.</div>
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
                  <span className="run-timeline-step">{step.step}단계</span>
                  <span className="run-timeline-label">{step.label}</span>
                  {latest && <RunStateBadge state={latest.state} />}
                </div>
                <div className="run-timeline-desc">
                  {step.description}
                  <span className="run-timeline-produces"> 결과물: {step.produces}</span>
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
                      <span className="run-timeline-exit" title="프로세스 종료 코드 (0이 아니면 비정상 종료)">오류 코드 {latest.exitCode}</span>
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
                          ? '진행 화면으로 이동'
                          : activeRunId === latest.runId
                            ? '진행 화면 열림'
                            : '진행 화면 열기'}
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
                      title={disabled ? `먼저 완료돼야 해요: ${step.requires}` : undefined}
                    >
                      <RotateCcw size={14} strokeWidth={1.75} />
                      다시 하기
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
                      title={disabled ? `먼저 완료돼야 해요: ${step.requires}` : step.description}
                    >
                      <Play size={14} strokeWidth={1.75} />
                      {busy
                        ? '시작하는 중…'
                        : latest?.state === 'FAILED'
                          ? '다시 하기'
                          : '시작하기'}
                    </button>
                  )}
                </div>

                {!suppressLivePanel && activeRunId && latest?.runId === activeRunId && (
                  <RunLivePanel
                    runId={activeRunId}
                    interactive={step.mode === 'interactive'}
                    onClose={() => setActiveRunId(null)}
                    onDone={() => {
                      // 타임라인 경로에서는 아직 artifact 파이프가 없으므로 기존 동작 유지.
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
    DRAFT: '대기 중',
    VALIDATING_INPUT: '입력 확인 중',
    READY: '시작 준비',
    RUNNING: '실행 중',
    WAITING_USER_INPUT: '답변 대기',
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

/** run 이 terminal 에 도달했을 때 부모로 전달되는 결과. */
export interface RunCompletionResult {
  /** 이 run 에서 감지된 Write/Edit artifact 들. 마지막 항목이 최신 산출물인 경우가 일반적. */
  artifacts: Array<{ path?: string }>;
}

export function RunLivePanel({
  runId,
  onClose,
  onDone,
  embedded = false,
  interactive = false,
}: {
  runId: string;
  onClose: () => void;
  /** terminal 도달 시 한 번만 호출. 부모가 artifact 로부터 후속 액션(예: prdPath 갱신)을 수행할 수 있도록 */
  onDone: (result: RunCompletionResult) => void;
  /** true 면 viewport 전체가 아니라 부모 카드 안에 박힌 스타일로. */
  embedded?: boolean;
  /** interactive 스킬이면 "이 단계 완료" 버튼으로 stdin 을 graceful 종료할 수 있게 한다.
   *  automated 스킬은 어차피 한 턴 뒤 CLI 가 자연 exit 하므로 버튼 불필요. */
  interactive?: boolean;
}) {
  const { state, logs, streamingText, artifacts, questions, error, markLatestQuestionAnswered } =
    useRunStream(runId);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const doneFiredRef = useRef(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
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
  }, [logs, streamingText]);

  // onDone 콜백이 부모 리렌더마다 새 함수로 바뀌어도 useEffect 가 다시 트리거되지 않게 ref 로 고정.
  // doneFiredRef 가 이미 막고 있긴 하지만, artifacts 배열이 쌓이는 중에 effect deps 가 흔들리는 걸 피한다.
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (state && TERMINAL_RUN_STATES.has(state) && !doneFiredRef.current) {
      doneFiredRef.current = true;
      onDoneRef.current({ artifacts });
    }
  }, [state, artifacts]);

  const waitingInput = state === 'WAITING_USER_INPUT';

  // 아직 답변되지 않은 최신 질문만 active 로 취급. question.answered 는 useRunStream 이
  // 서버 user_input 이벤트와 submitAnswer 성공 시 optimistic 마킹으로 관리한다.
  const activeQuestion = useMemo<RunQuestion | null>(() => {
    for (let i = questions.length - 1; i >= 0; i--) {
      const q = questions[i];
      if (!q) continue;
      if (!q.answered) return q;
    }
    return null;
  }, [questions]);

  const hasOptions = !!activeQuestion?.options && activeQuestion.options.length > 0;
  const isMultiSelect = hasOptions && activeQuestion?.multiSelect === true;
  // 스트리밍 중이거나 RUNNING 이면 "Claude 가 작업 중" 힌트.
  const isThinking =
    streamingText !== null || (!waitingInput && state === 'RUNNING' && !activeQuestion);

  // 질문이 바뀌면 이전 multi-select 선택 초기화.
  useEffect(() => {
    setMultiSelections(new Set());
  }, [activeQuestion?.toolUseId, activeQuestion?.prompt]);

  useEffect(() => {
    if (!waitingInput) return;
    // 선택지 질문일 때는 textarea 포커스 생략 (버튼 탐색이 자연스럽게).
    if (hasOptions) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [waitingInput, activeQuestion, hasOptions]);

  async function submitAnswer(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    const answeringId = activeQuestion?.toolUseId;
    try {
      await sendRunInput(runId, trimmed, answeringId ? { toolUseId: answeringId } : {});
      // optimistic: 서버 user_input SSE 도착 전에 질문 카드를 닫아 UX 지연 제거.
      // toolUseId 가 있으면 정확한 매칭, 없으면 레거시 순서 매칭.
      markLatestQuestionAnswered(answeringId);
      setInputText('');
      setMultiSelections(new Set());
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '메시지를 전송하지 못했어요.');
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
      setSendError('1개 이상 선택해 주세요.');
      return;
    }
    // AskUserQuestion 스펙: 여러 label 을 ", " 로 이어서 응답.
    const joined = Array.from(multiSelections).join(', ');
    const free = inputText.trim();
    await submitAnswer(free ? `${joined} (${free})` : joined);
  }

  async function handleFinish() {
    if (finishing) return;
    setFinishing(true);
    setFinishError(null);
    try {
      await finishRun(runId);
      // 서버에서 stdin 을 닫으면 CLI 가 턴을 마무리하고 exit → state 전이 → onDone 자동 발화.
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : '실행을 마치지 못했어요.');
      setFinishing(false);
    }
  }

  const describedBy = [
    activeQuestion ? questionId : null,
    inputHintId,
    sendError ? inputErrorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`run-live-panel${embedded ? ' run-live-panel--embedded' : ''}`}>
      <div className="run-live-panel-head">
        <span className="run-live-panel-title">
          실시간 진행 {state && <RunStateBadge state={state} />}
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
              생성 파일: {artifact.path ?? '(이름 확인 중)'}
            </span>
          ))}
        </div>
      )}
      <div
        ref={logBodyRef}
        className="run-live-panel-body"
        role="log"
        aria-live="polite"
        aria-label="진행 내용"
      >
        {logs.length === 0 && !streamingText ? (
          <div className="run-live-panel-empty">아직 진행 내용이 없어요.</div>
        ) : (
          <>
            {logs.map((entry, index) => (
              <LogEntry key={`${index}-${entry.text.slice(0, 24)}`} entry={entry} />
            ))}
            {streamingText !== null && (
              <div
                className="run-live-panel-line run-live-panel-line--streaming"
                aria-hidden="true"
              >
                <MarkdownText text={streamingText || '…'} />
                <span className="run-live-panel-caret" aria-hidden="true" />
              </div>
            )}
          </>
        )}
        {isThinking && !streamingText && (
          <div className="run-live-panel-thinking" aria-live="polite">
            <Loader2 size={14} strokeWidth={2} className="run-live-panel-thinking-spin" />
            AI가 작업 중이에요…
          </div>
        )}
      </div>
      {waitingInput && (
        <div
          className="run-live-panel-input"
          role="group"
          aria-labelledby={inputLabelId}
          aria-describedby={describedBy || undefined}
        >
          {activeQuestion ? (
            <QuestionCard question={activeQuestion} id={questionId} />
          ) : (
            <div id={inputLabelId} className="run-live-panel-input-label">
              AI에게 답변 보내기
            </div>
          )}

          {hasOptions && activeQuestion && (
            <OptionChoices
              options={activeQuestion.options!}
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
              : 'AI가 답을 기다리고 있어요. 자유롭게 적어 주세요.'}{' '}
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
            aria-label="메시지 입력"
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
            {interactive && (
              <button
                type="button"
                className="run-live-panel-finish"
                onClick={() => void handleFinish()}
                disabled={finishing || sending}
                title="이 단계를 마치고 다음 단계로 넘어가요"
              >
                {finishing ? '마무리 중…' : '이 단계 마치기'}
              </button>
            )}
            <button
              type="button"
              className="run-live-panel-send"
              onClick={() => void (isMultiSelect ? handleSendMulti() : handleSend())}
              disabled={
                sending ||
                finishing ||
                (isMultiSelect
                  ? multiSelections.size === 0 && inputText.trim().length === 0
                  : inputText.trim().length === 0)
              }
            >
              {sending
                ? '전송 중…'
                : isMultiSelect && multiSelections.size > 0
                  ? `${multiSelections.size}개 선택 · 전송`
                  : '전송'}
            </button>
          </div>
          {finishError && (
            <div className="run-live-panel-input-error" role="alert">
              완료 처리 실패: {finishError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LogEntry({ entry }: { entry: RunLogEntry }) {
  if (entry.kind === 'text') {
    return (
      <div className="run-live-panel-line run-live-panel-line--text">
        <MarkdownText text={entry.text} />
      </div>
    );
  }
  // tool / 시스템 메시지는 plaintext 로 간결하게.
  return <div className="run-live-panel-line run-live-panel-line--tool">{entry.text}</div>;
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="run-live-panel-md">
      <ReactMarkdown
        components={{
          // 코드블록은 그대로 렌더하되, 인라인 code 는 tds 스타일링 hook.
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function QuestionCard({ question, id }: { question: RunQuestion; id: string }) {
  return (
    <div
      id={id}
      className="run-live-panel-question"
      role="status"
    >
      {question.header && <span className="run-live-panel-question-tag">{question.header}</span>}
      <strong>AI의 질문</strong>
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
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // For the radio pattern: determine the currently "focusable" radio.
  // If one is selected, it is focusable; otherwise the first one is.
  const selectedIndex = multiSelect
    ? -1
    : (() => {
        const idx = options.findIndex((o) => selected.has(o.label));
        return idx >= 0 ? idx : 0;
      })();

  const handleRadioKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (multiSelect) return;
    const lastIndex = options.length - 1;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = lastIndex;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    const nextOpt = options[nextIndex];
    if (!nextOpt) return;
    // APG: for radios, moving focus also selects.
    onPick(nextOpt.label);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      className={`run-live-panel-options${multiSelect ? ' run-live-panel-options--multi' : ''}`}
      role={multiSelect ? 'group' : 'radiogroup'}
      aria-label="응답 선택지"
    >
      {options.map((opt, index) => {
        const isSelected = selected.has(opt.label);
        const isRadioFocusable = !multiSelect && index === selectedIndex;
        return (
          <button
            key={opt.label}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            className={`run-live-panel-option${isSelected ? ' is-selected' : ''}`}
            onClick={() => onPick(opt.label)}
            onKeyDown={multiSelect ? undefined : (e) => handleRadioKeyDown(e, index)}
            disabled={disabled}
            role={multiSelect ? 'checkbox' : 'radio'}
            aria-checked={isSelected}
            tabIndex={multiSelect ? undefined : isRadioFocusable ? 0 : -1}
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
