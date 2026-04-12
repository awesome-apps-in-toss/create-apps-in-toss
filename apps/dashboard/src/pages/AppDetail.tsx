import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import ReactMarkdown from 'react-markdown';
import { useApps } from '@/hooks/useApps';
import LogStream from '@/components/LogStream';
import AppAvatar from '@/components/AppAvatar';
import type { AppConsoleConfig } from '@/types';

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

export default function AppDetail() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { apps, refetch } = useApps();
  const appIndex = apps.findIndex((a) => a.folderName === appId);
  const app = apps[appIndex];

  const [edit, setEdit] = useState<EditState>({ field: null, value: '' });
  const [saving, setSaving] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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
    setEdit({
      field,
      value: Array.isArray(raw) ? (raw as string[]).join(', ') : ((raw as string | null) ?? ''),
    });
  }

  function cancelEdit() {
    setEdit({ field: null, value: '' });
  }

  async function saveField() {
    if (!edit.field || !app) return;
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
      await fetch(`/api/apps/${app.folderName}/console`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [edit.field]: value }),
      });
      setEdit({ field: null, value: '' });
      await refetch();
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

  async function runSkill(skill: 'ait-ut' | 'idea-to-prd' | 'icon-generator') {
    if (running || !app) return;
    setRunning(true);
    setLogLines([]);
    const es = new EventSource(`/api/run-skill/stream?skill=${skill}&app=${app.folderName}`);
    es.addEventListener('log', (e) => {
      setLogLines((prev) => [...prev, e.data as string].slice(-200));
    });
    es.addEventListener('done', () => {
      setRunning(false);
      es.close();
      void refetch();
    });
    es.addEventListener('error', () => {
      setRunning(false);
      es.close();
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
      </div>

      {/* ── 기획 (PRD) ── */}
      <section className="detail-section">
        <h2 className="detail-section-title">기획</h2>
        <div className="doc-path-row">
          <PathField
            label="PRD 경로"
            field="prdPath"
            value={app.console.prdPath}
            exists={app.docs.prd.exists}
            date={app.docs.prd.date}
            appId={app.folderName}
            edit={edit}
            saving={saving}
            onEdit={startEdit}
            onCancel={cancelEdit}
            onSave={() => void saveField()}
            onChange={(v) => setEdit({ field: 'prdPath', value: v })}
          />
          <div className="doc-actions">
            {!app.docs.prd.exists && (
              <button
                className="btn-skill btn-skill-sm"
                onClick={() => void runSkill('idea-to-prd')}
                disabled={running}
              >
                ▶ idea-to-prd
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 브랜드 & 코드 설정 | 스토어 등록 자료 (2컬럼) ── */}
      <div className="detail-columns">
        {/* 브랜드 & 코드 설정 (현 L1) */}
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
                  <img src={v} alt="icon" className="granite-icon-preview" />
                  <span className="granite-icon-url">{v}</span>
                </span>
              )}
            />
            <div className="meta-row">
              <div className="meta-label">.ait 파일</div>
              <div className="meta-value">
                <span>{app.completionDetail.layer1 >= 10 ? '✅ 있음' : '❌ 없음'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 스토어 등록 자료 (현 L2) */}
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
                    />
                    <span className="asset-path">{app.console.logoPath}</span>
                  </div>
                ) : (
                  <div className="meta-display">
                    <span className="meta-empty">❌ 없음 (600×600)</span>
                    <button
                      className="btn-skill btn-skill-sm"
                      onClick={() => void runSkill('icon-generator')}
                      disabled={running}
                    >
                      ▶ icon-generator
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
                              {copied === field.key ? '✓' : '복사'}
                            </button>
                          )}
                          <button className="btn-edit" onClick={() => startEdit(field.key)}>
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
                    />
                    <span className="asset-path">{app.console.thumbnailPath}</span>
                  </div>
                ) : (
                  <div className="meta-display">
                    <span className="meta-empty">❌ 없음 (1932×828)</span>
                    <button
                      className="btn-skill btn-skill-sm"
                      onClick={() => void runSkill('icon-generator')}
                      disabled={running}
                    >
                      ▶ icon-generator
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
                        alt={`screenshot-${idx + 1}`}
                        className="asset-preview asset-preview-screenshot"
                      />
                    ))}
                  </div>
                ) : (
                  <span className="meta-empty">❌ 없음 (세로 636×1048 ≥3장)</span>
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
            value={app.console.utPath}
            exists={app.docs.ut.exists}
            date={app.docs.ut.date}
            appId={app.folderName}
            edit={edit}
            saving={saving}
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
                disabled={running}
              >
                ▶ ait-ut
              </button>
            )}
          </div>
        </div>
      </section>

      <LogStream lines={logLines} running={running} />
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
  appId,
  edit,
  saving,
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
  appId: string;
  edit: EditState;
  saving: boolean;
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

  useEffect(() => {
    void fetch(`/api/apps/${appId}/asset?path=${encodeURIComponent(relPath)}`)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setContent('파일을 불러올 수 없습니다.'));
  }, [appId, relPath]);

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
        <div className="md-modal-overlay" onClick={() => setModal(false)}>
          <div className="md-modal" onClick={(e) => e.stopPropagation()}>
            <div className="md-modal-header">
              <span className="md-modal-title">{title}</span>
              <button className="md-modal-close" onClick={() => setModal(false)}>
                ✕
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
          <span className="meta-empty">—</span>
        )}
      </div>
    </div>
  );
}
