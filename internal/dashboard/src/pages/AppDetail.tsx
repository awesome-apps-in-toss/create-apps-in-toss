import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useParams, useNavigate } from 'react-router';
import ReactMarkdown from 'react-markdown';
import { Monitor, MessageSquare, FileText, Loader2 } from 'lucide-react';
import { useApps } from '@/hooks/useApps';
import { useSkills } from '@/hooks/useSkills';
import type { PipelineStep } from '@/hooks/useSkills';
import LogStream from '@/components/LogStream';
import AppAvatar from '@/components/AppAvatar';
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
  { key: 'nameEn', label: '영어 이름', placeholder: 'e.g. Dating Order Form', copyable: true },
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
type StepState = 'completed' | 'enabled' | 'locked';

function getStepState(
  step: PipelineStep,
  progress: Record<number, PipelineStepStatus>
): StepState {
  if (progress[step.step]) return 'completed';
  if (step.requiresSteps.length === 0) return 'enabled';
  const allDepsMet = step.requiresSteps.every((s) => !!progress[s]);
  return allDepsMet ? 'enabled' : 'locked';
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
  const [logLines, setLogLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [runningSkill, setRunningSkill] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pipelineExpanded, setPipelineExpanded] = useState(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const skillEsRef = useRef<EventSource | null>(null);
  const planSectionRef = useRef<HTMLElement | null>(null);

  // 언마운트 시 실행 중인 스킬 EventSource 정리
  useEffect(() => {
    return () => {
      skillEsRef.current?.close();
    };
  }, []);

  async function copyCliCommand(skill: string) {
    const cmd = `claude -p /${skill}`;
    await copyText(cmd);
    setCopiedCmd(skill);
    setTimeout(() => setCopiedCmd(null), 2000);
  }

  if (!app) {
    return (
      <main className="main">
        <div className="loading">앱 정보를 불러오는 중...</div>
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
      if (!res.ok) throw new Error('저장에 실패했습니다.');
      setSaveError(null);
      setEdit({ field: null, value: '' });
      await refetch();
    } catch {
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.');
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

  async function runSkill(skill: AllowedSkill) {
    if (running || !app || isDemo) return;
    skillEsRef.current?.close();
    setRunning(true);
    setRunningSkill(skill);
    setLogLines([]);
    const es = new EventSource(`/api/run-skill/stream?skill=${skill}&app=${app.folderName}`);
    skillEsRef.current = es;
    es.addEventListener('log', (e) => {
      setLogLines((prev) => [...prev, e.data].slice(-200));
    });
    es.addEventListener('done', () => {
      setRunning(false);
      setRunningSkill(null);
      es.close();
      skillEsRef.current = null;
      void refetch();
    });
    es.addEventListener('error', () => {
      setRunning(false);
      setRunningSkill(null);
      es.close();
      skillEsRef.current = null;
      setLogLines((prev) => [...prev, '[오류] 스킬 실행 중 오류가 발생했습니다.']);
    });
  }

  function getFieldDisplayValue(field: (typeof CONSOLE_TEXT_FIELDS)[number]): string | null {
    const raw = app!.console[field.key];
    if (Array.isArray(raw)) return raw.length > 0 ? raw.join(', ') : null;
    return (raw as string) || null;
  }

  return (
    <main className="main">
      <div className="breadcrumb">
        <button className="breadcrumb-back" onClick={() => void navigate('/')}>
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
        <div className="detail-header-completion">
          <span className="completion-label">완성도</span>
          <span className="completion-value">{app.completion}%</span>
        </div>
      </div>

      {/* ── 출시 파이프라인 ── */}
      <section className="detail-section pipeline-section">
        <div className="pipeline-header">
          <h2 className="detail-section-title">출시 파이프라인</h2>
          <div className="pipeline-header-actions">
            <button
              className={`btn-cli-copy ${copiedCmd === 'ait-launch' ? 'btn-cli-copy--copied' : ''}`}
              onClick={() => void copyCliCommand('ait-launch')}
              title="CLI에서 7단계 파이프라인 순차 실행 (클립보드 복사)"
            >
              {copiedCmd === 'ait-launch' ? '복사됨' : 'claude -p /ait-launch'}
            </button>
            <button
              className="btn-pipeline-toggle"
              onClick={() => setPipelineExpanded((v) => !v)}
            >
              {pipelineExpanded ? '접기' : '개별 단계'}
            </button>
          </div>
        </div>

        {/* 미니 스테퍼 (항상 보임) */}
        <div className="pipeline-mini-stepper">
          {pipeline.map((item, idx) => {
            const state = getStepState(item, app.console.pipelineProgress);
            return (
              <div key={item.skill} className="pipeline-mini-step-wrap">
                {idx > 0 && (
                  <div className={`pipeline-mini-connector ${
                    getStepState(pipeline[idx - 1]!, app.console.pipelineProgress) === 'completed'
                      ? 'pipeline-mini-connector--done'
                      : ''
                  }`} />
                )}
                <div
                  className={`pipeline-mini-dot pipeline-mini-dot--${state} ${
                    runningSkill === item.skill ? 'pipeline-mini-dot--running' : ''
                  }`}
                  title={`Step ${item.step}: ${item.label} — ${item.description}${
                    state === 'completed' ? ' ✓' : state === 'locked' ? ` (필요: ${item.requires})` : ''
                  }`}
                >
                  {state === 'completed' && <span className="pipeline-mini-check">✓</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 개별 단계 (펼쳤을 때) */}
        {pipelineExpanded && (
          <div className="pipeline-detail-list">
            {pipeline.map((item) => {
              const state = getStepState(item, app.console.pipelineProgress);
              const isLocked = state === 'locked';
              const isCompleted = state === 'completed';
              return (
                <div
                  key={item.skill}
                  className={`pipeline-detail-row ${
                    runningSkill === item.skill ? 'pipeline-detail-row--running' : ''
                  } ${isCompleted ? 'pipeline-detail-row--completed' : ''} ${
                    isLocked ? 'pipeline-detail-row--locked' : ''
                  }`}
                >
                  <span className={`pipeline-detail-step ${isCompleted ? 'pipeline-detail-step--done' : ''}`}>
                    {isCompleted ? '✓' : `STEP ${item.step}`}
                  </span>
                  <span className="pipeline-detail-label">{item.label}</span>
                  <span className="pipeline-detail-desc">
                    {item.description}
                    <span className="pipeline-detail-produces">→ {item.produces}</span>
                    {isLocked && item.requires && (
                      <span className="pipeline-detail-requires pipeline-detail-requires--locked">
                        필요: {item.requires}
                      </span>
                    )}
                  </span>
                  {item.mode === 'interactive' ? (
                    <button
                      className="pipeline-detail-btn pipeline-detail-btn--link"
                      onClick={() => {
                        const reduced =
                          typeof window !== 'undefined' &&
                          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                        planSectionRef.current?.scrollIntoView({
                          behavior: reduced ? 'auto' : 'smooth',
                        });
                      }}
                      disabled={isLocked || isDemo}
                      title={isDemo ? '로컬에서 pnpm dev 실행 시 사용 가능' : isLocked ? `전제 조건 미충족: ${item.requires}` : '아래 기획 섹션으로 이동'}
                    >
                      {isCompleted ? '기획서 보기' : '기획하기'}
                    </button>
                  ) : (
                    <button
                      className="pipeline-detail-btn"
                      onClick={() => void runSkill(item.skill as AllowedSkill)}
                      disabled={running || isLocked || isDemo}
                      title={isDemo ? '로컬에서 pnpm dev 실행 시 사용 가능' : isLocked ? `전제 조건 미충족: ${item.requires}` : item.description}
                    >
                      {runningSkill === item.skill ? (
                        <span className="pipeline-spinner" />
                      ) : isCompleted ? (
                        '재실행'
                      ) : (
                        '실행'
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 기획 (PRD) ── */}
      <section id="plan-section" ref={planSectionRef} className="detail-section">
        <h2 className="detail-section-title">기획</h2>
        {app.docs.prd.exists ? (
          /* PRD가 있을 때: 경로 + 뷰어 */
          <div className="plan-existing">
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
            <p className="plan-empty-desc">기획서(PRD)가 아직 없습니다. 아래 방법 중 하나로 시작하세요.</p>
            <div className="plan-entries">
              <PrdDropZone
                appId={app.folderName}
                onUploaded={() => void refetch()}
                isDemo={isDemo}
              />
              <div className="plan-entry">
                <div className="plan-entry-icon"><Monitor size={20} strokeWidth={1.75} /></div>
                <div className="plan-entry-title">CLI에서 기획</div>
                <p className="plan-entry-desc">
                  AI와 대화하며 정책 검토부터 PRD 작성까지 진행합니다.
                </p>
                <button
                  className={`btn-cli-copy ${copiedCmd === 'ait-plan' ? 'btn-cli-copy--copied' : ''}`}
                  onClick={() => void copyCliCommand('ait-plan')}
                  title="앱 폴더에서 실행"
                >
                  {copiedCmd === 'ait-plan' ? '복사됨' : 'claude -p /ait-plan'}
                </button>
              </div>
              <div className="plan-entry plan-entry--coming">
                <div className="plan-entry-icon"><MessageSquare size={20} strokeWidth={1.75} /></div>
                <div className="plan-entry-title">
                  웹에서 기획
                  <span className="plan-entry-badge">준비 중</span>
                </div>
                <p className="plan-entry-desc">
                  브라우저에서 AI와 대화하며 PRD를 완성합니다.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 브랜드 & 코드 설정 | 스토어 등록 자료 (2컬럼) ── */}
      <div className="detail-columns">
        {/* 브랜드 & 코드 설정 (Layer 1) */}
        <section className="detail-section">
          <h2 className="detail-section-title">
            브랜드 & 코드 설정
            <span className="section-source">granite.config.ts</span>
          </h2>
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
                    alt="icon"
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
                <span>{app.completionDetail.layer1 >= 10 ? '있음' : '없음'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 스토어 등록 자료 (Layer 2) */}
        <section className="detail-section">
          <h2 className="detail-section-title">
            스토어 등록 자료
            <span className="section-source">.meta-dashboard.json</span>
          </h2>
          <div className="meta-table">
            {/* 앱 로고 */}
            <div className="meta-row">
              <div className="meta-label">앱 로고</div>
              <div className="meta-value">
                {app.console.logoPath ? (
                  <div className="asset-preview-row">
                    <img
                      src={assetUrl(app.folderName, app.console.logoPath)}
                      alt="logo"
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
                    <span className="meta-empty">없음 (600x600)</span>
                    <button
                      className="btn-skill btn-skill-sm"
                      onClick={() => void runSkill('ait-assets')}
                      disabled={running || isDemo}
                      title={isDemo ? '로컬에서 pnpm dev 실행 시 사용 가능' : undefined}
                    >
                      /ait-assets
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
                          className="btn-save"
                          onClick={() => void saveField()}
                          disabled={saving}
                        >
                          {saving ? '저장 중...' : '저장'}
                        </button>
                        <button className="btn-cancel" onClick={cancelEdit}>
                          취소
                        </button>
                        {saveError && (
                          <span
                            className="meta-error"
                            role="alert"
                            style={{ color: 'var(--color-danger)', fontSize: 11 }}
                          >
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
                              className={`btn-copy ${copied === field.key ? 'copied' : ''}`}
                              onClick={() => void handleCopy(field.key)}
                              title="클립보드에 복사"
                            >
                              {copied === field.key ? '복사됨' : '복사'}
                            </button>
                          )}
                          <button
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
                      alt="thumbnail"
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
                    <span className="meta-empty">없음 (1932x828)</span>
                    <button
                      className="btn-skill btn-skill-sm"
                      onClick={() => void runSkill('ait-assets')}
                      disabled={running || isDemo}
                      title={isDemo ? '로컬에서 pnpm dev 실행 시 사용 가능' : undefined}
                    >
                      /ait-assets
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
                  <span className="meta-empty">없음 (세로 636x1048, 3장 이상)</span>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

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
                className="btn-skill btn-skill-sm"
                onClick={() => void runSkill('ait-ut')}
                disabled={running || isDemo}
                title={isDemo ? '로컬에서 pnpm dev 실행 시 사용 가능' : undefined}
              >
                /ait-ut
              </button>
            )}
          </div>
        </div>
      </section>

      <LogStream lines={logLines} running={running} skillName={runningSkill} />
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
          <button className="btn-save" onClick={onSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
          <button className="btn-cancel" onClick={onCancel}>
            취소
          </button>
          {saveError && (
            <span
              className="meta-error"
              role="alert"
              style={{ color: 'var(--color-danger)', fontSize: 11 }}
            >
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
          <button className="btn-edit" onClick={() => onEdit(field)}>
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
  const reactId = useId();
  const titleId = `md-modal-title-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    const key = `${appId}::${relPath}`;
    const cached = markdownCache.get(key);
    if (cached !== undefined) {
      setContent(cached);
      return;
    }
    let cancelled = false;
    void fetch(`/api/apps/${appId}/asset?path=${encodeURIComponent(relPath)}`)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        cacheMarkdown(key, text);
        setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent('파일을 불러올 수 없습니다.');
      });
    return () => {
      cancelled = true;
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
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // 닫힐 때 이전 포커스 복원
      previousFocusRef.current?.focus?.();
    };
  }, [modal]);

  if (content === null) return <div className="md-loading">불러오는 중...</div>;

  return (
    <>
      <div className="md-preview-wrap">
        <div className="md-content md-preview">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        <div className="md-preview-fade" />
        <button className="md-expand-btn" onClick={() => setModal(true)}>
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
        setError('.md 또는 .txt 파일만 업로드할 수 있습니다.');
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
          throw new Error(data.error ?? 'Upload failed');
        }
        onUploaded();
      } catch (e) {
        setError(e instanceof Error ? e.message : '업로드 실패');
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
          ? '업로드 중...'
          : dragOver
            ? '여기에 놓으세요'
            : '기획서 파일(.md)을 드래그하거나 클릭하세요'}
      </p>
      {error && <p className="plan-entry-error">{error}</p>}
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
