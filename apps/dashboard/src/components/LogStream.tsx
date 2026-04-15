import { useEffect, useRef, useState } from 'react';

interface LogStreamProps {
  lines: string[];
  running: boolean;
  skillName?: string | null;
}

export default function LogStream({ lines, running, skillName }: LogStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, collapsed]);

  // 실행 시작 시 자동으로 펼침
  useEffect(() => {
    if (running) setCollapsed(false);
  }, [running]);

  if (lines.length === 0 && !running) return null;

  const hasError = lines.some((l) => l.includes('[오류]') || l.includes('Error'));
  const lastLine = lines[lines.length - 1] ?? '';

  return (
    <div className="log-stream">
      <button className="log-stream-header" onClick={() => setCollapsed((c) => !c)}>
        <span className="log-stream-title">
          {skillName ? `/${skillName}` : '실행 로그'}
        </span>
        {running && <span className="log-stream-badge running">실행 중</span>}
        {!running && hasError && <span className="log-stream-badge error">오류</span>}
        {!running && !hasError && lines.length > 0 && (
          <span className="log-stream-badge done">완료</span>
        )}
        <span className="log-stream-count">{lines.length}줄</span>
        <span className="log-stream-toggle">{collapsed ? '펼치기' : '접기'}</span>
      </button>
      {!collapsed && (
        <div className="log-stream-body">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`log-line ${line.includes('[오류]') || line.includes('Error') ? 'log-line--error' : ''}`}
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
      {collapsed && lines.length > 0 && (
        <div className="log-stream-summary">
          <span className="log-line-preview">{lastLine}</span>
        </div>
      )}
    </div>
  );
}
